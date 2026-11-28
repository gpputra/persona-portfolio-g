/* =====================================================================
   MEDIA — shows each page's PAGE_MEDIA entry as the background.
   Desktop sub-pages: framed in the area right of the diagonal.
   Mobile: full screen behind the content.
   Every file gets ONE element, kept in Media.cache: hidden and paused
   until its page is shown. preloadAll() warms them while the page is idle.
   ===================================================================== */

const Media = {

  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  stage: null,
  current: null,       // { el, url, type }
  pending: null,
  token: 0,
  instant: false,      // true while the Home curtain is closed: swap with no fades
  settle: null,        // resolves the promise returned by show()
  dead: new Set(),     // URLs that failed, so they are not requested again
  cache: new Map(),    // url → { el, url, type, status, ready }
  layer: 0,            // z-index counter: the newest visual sits on top
  lastNav: 0,          // when the visitor last changed page
  preloading: false,
  PRELOAD_PAGES: ["home", "projects", "about", "skills", "certificates", "contact"],
  QUIET_MS: 900,       // preloading waits this long after any navigation
  LOAD_TIMEOUT_MS: 12000,

  init() {
    this.stage = document.getElementById("media");
    const wake = () => this.play(this.current);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) return wake();
      if (this.current && this.current.type === "video") this.current.el.pause();
    });
    // Low-power mode can refuse autoplay until the visitor touches the page
    addEventListener("pointerup", wake, { passive: true });
    addEventListener("keydown", wake);
  },

  typeOf(url) {
    const ext = (url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i) || [])[1];
    if (!ext) return null;
    const e = ext.toLowerCase();
    if (e === "mp4" || e === "webm") return "video";
    if (e === "gif") return "gif";
    if (["webp", "png", "jpg", "jpeg", "avif"].includes(e)) return "image";
    return null;
  },

  // This page's files first, then the home media as a safety net
  queueFor(page) {
    const list = value => [].concat(value || []);
    const paths = [...list(PAGE_MEDIA[page]), ...list(PAGE_MEDIA.home)];
    const urls = paths.flatMap(assetCandidates).filter(url => {
      const type = this.typeOf(url);
      if (!type) return false;
      return !(this.reducedMotion && type === "gif");    // a GIF cannot be paused
    });
    return [...new Set(urls)].filter(url => !this.dead.has(url));
  },

  /* Returns a promise that resolves once the page's visual is on screen
     (or there is none). { instant: true } is for swaps behind a closed curtain.
     A cached file is revealed synchronously, in the same frame. */
  show(page, { instant = false } = {}) {
    this.done();                             // release any earlier waiter
    this.instant = instant;
    const settled = new Promise(resolve => { this.settle = resolve; });
    const token = ++this.token;
    this.lastNav = performance.now();
    this.cancelPending(page);
    clearTimeout(this.staleTimer);
    this.stage.dataset.page = page;
    this.tryNext(this.queueFor(page), page, token);
    // If the new file is slow, don't leave another page's visual on screen
    // (not needed behind the curtain: dropStale() covers that case)
    if (!instant && this.pending) this.staleTimer = setTimeout(() => this.clear(), 900);
    return settled;
  },

  done() {
    if (this.settle) this.settle();
    this.settle = null;
  },

  // The curtain is about to open but the new file is still loading: remove the
  // previous page's visual now, so the dark fallback shows until it arrives
  dropStale() {
    if (this.pending) this.clear();
    this.instant = false;                    // a late arrival fades in normally
  },

  tryNext(queue, page, token) {
    if (token !== this.token) return;
    const url = queue.shift();
    if (!url) { clearTimeout(this.staleTimer); this.clear(); return; }

    if (this.current && this.current.url === url) {      // same file: keep it running
      clearTimeout(this.staleTimer);
      this.frame(this.current.el, page);
      this.done();
      return;
    }

    const item = this.load(url);
    const arrive = ok => {
      if (token !== this.token) return;                  // the visitor moved on
      this.pending = null;
      if (!ok) return this.tryNext(queue, page, token);
      clearTimeout(this.staleTimer);
      this.frame(item.el, page);
      this.reveal(item);
    };
    if (item.status === "ready") return arrive(true);    // warmed: no waiting
    this.pending = item;
    this.frame(item.el, page);
    this.play(item);                                     // wanted now: fetch eagerly
    item.ready.then(arrive);
  },

  /* ---------- Cache & loading ---------- */
  // Returns the cached item for a URL, creating and loading it the first time
  load(url, { background = false } = {}) {
    let item = this.cache.get(url);
    if (item) return item;

    item = this.build(url);
    item.status = "loading";
    this.cache.set(url, item);

    let finish;
    item.ready = new Promise(resolve => { finish = resolve; });
    item.abort = () => {
      if (item.status !== "loading") return;
      item.status = "aborted";
      clearTimeout(item.timer);
      this.cache.delete(url);               // a later visit starts afresh
      this.release(item);
      finish(false);
    };
    const settle = ok => {
      if (item.status !== "loading") return;
      if (!ok) {
        this.dead.add(url);
        item.abort();
        return;
      }
      item.status = "ready";
      clearTimeout(item.timer);
      // decoded its first frame: rest until its page is shown
      if (item.type === "video" && this.current !== item && this.pending !== item) item.el.pause();
      finish(true);
    };

    item.el.addEventListener(item.type === "video" ? "loadeddata" : "load", () => settle(true), { once: true });
    item.el.addEventListener("error", () => settle(false), { once: true });
    // a stalled request is given up, but not remembered as a missing file
    item.timer = setTimeout(() => item.abort(), this.LOAD_TIMEOUT_MS);
    if (background && "fetchPriority" in item.el) item.el.fetchPriority = "low";
    this.stage.appendChild(item.el);
    item.el.src = url;
    // iOS ignores preload="auto": a muted play() is what makes it fetch a frame
    if (background && item.type === "video" && !this.reducedMotion) {
      const p = item.el.play();
      if (p && p.catch) p.catch(() => { });
    }
    return item;
  },

  // Stops a half-finished load without holding up the current frame
  release(item) {
    item.el.remove();
    if (item.type !== "video") return;
    setTimeout(() => {
      item.el.pause();
      item.el.removeAttribute("src");
      item.el.load();                       // frees the connection and decoder
    }, 0);
  },

  // Navigating away from a page whose file hasn't arrived: abort that download
  cancelPending(nextPage) {
    const item = this.pending;
    this.pending = null;
    if (item && this.queueFor(nextPage)[0] !== item.url) item.abort();
  },

  /* Called the moment a page change is requested, before any animation:
     stops every unfinished download the destination doesn't need */
  interrupt(nextPage) {
    this.lastNav = performance.now();
    const wanted = this.queueFor(nextPage)[0];
    this.cache.forEach(item => {
      if (item.url !== wanted) item.abort();      // no effect on finished items
    });
    if (this.pending && this.pending.url !== wanted) {
      this.pending = null;
      this.token++;
      clearTimeout(this.staleTimer);
      this.done();
    }
  },

  // Hovering or pressing a menu item is a strong hint: start that file early
  prime(page) {
    const url = this.queueFor(page)[0];
    if (url && !this.saveData()) this.load(url);
  },

  saveData() {
    const c = navigator.connection;
    return !!c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""));
  },

  // Resolves when the browser has spare time and nobody is navigating
  whenIdle() {
    return new Promise(resolve => {
      const check = () => {
        const busy = document.hidden || this.pending
          || performance.now() - this.lastNav < this.QUIET_MS;
        if (busy) return setTimeout(check, 300);
        if (window.requestIdleCallback) requestIdleCallback(() => resolve(), { timeout: 1500 });
        else setTimeout(resolve, 200);            // Safari has no requestIdleCallback
      };
      check();
    });
  },

  /* Warms every page's visual, one file at a time. A page whose own file is
     missing falls through its queue exactly as show() would. */
  async preloadAll() {
    if (this.preloading || this.saveData()) return;
    this.preloading = true;
    this.lastNav = performance.now();             // let Home's entrance finish
    for (const page of this.PRELOAD_PAGES) {
      let attempts = 0;
      for (; ;) {
        await this.whenIdle();
        const url = this.queueFor(page)[0];
        if (!url) break;
        const item = this.load(url, { background: true });
        if (item.status === "ready" || await item.ready) break;
        // missing file: try the next one. Interrupted or stalled: retry, within limits
        if (!this.dead.has(url) && ++attempts >= 3) break;
      }
    }
    this.preloading = false;
  },

  build(url) {
    const type = this.typeOf(url);
    const el = document.createElement(type === "video" ? "video" : "img");
    el.className = "media-layer";
    el.setAttribute("aria-hidden", "true");
    if (type === "video") {
      el.muted = el.defaultMuted = true;             // set before src for autoplay
      el.loop = true;
      el.playsInline = true;
      el.autoplay = false;                           // play() runs when it is shown
      el.preload = "auto";
      el.disablePictureInPicture = true;
      el.disableRemotePlayback = true;
      el.tabIndex = -1;
      ["muted", "playsinline", "disablepictureinpicture", "disableremoteplayback"]
        .forEach(a => el.setAttribute(a, ""));
      el.setAttribute("controlslist", "nodownload nofullscreen noremoteplayback");
      el.addEventListener("contextmenu", e => e.preventDefault());
    } else {
      el.alt = "";
      el.decoding = "async";
      el.draggable = false;
    }
    return { el, url, type };
  },

  frame(el, page) {
    el.classList.toggle("is-side", page !== "home");
  },

  play(item) {
    if (!item || item.type !== "video" || this.reducedMotion || document.hidden) return;
    const p = item.el.play();
    if (p && p.catch) p.catch(() => { });
  },

  reveal(item) {
    const old = this.current;
    this.current = item;
    clearTimeout(item.hideTimer);            // it may still be on its way out
    item.el.style.zIndex = ++this.layer;
    if (this.instant) item.el.style.transition = "none";
    void item.el.offsetWidth;                // commit the start state first
    item.el.classList.add("is-in");
    if (this.instant) {                      // commit, then restore normal fades
      void getComputedStyle(item.el).opacity;
      item.el.style.transition = "";
    }
    this.play(item);
    this.retire(old);
    this.report(item.type);
    this.done();
  },

  clear() {
    const old = this.current;
    this.current = null;
    this.retire(old, true);
    this.report("");
    if (!this.pending) this.done();
  },

  /* Puts an outgoing visual back to sleep. It stays in the cache. While a new
     visual covers it, it holds until that reveal has finished. */
  retire(item, fadeOut = false) {
    if (!item) return;
    clearTimeout(item.hideTimer);
    if (this.instant) return this.sleep(item);
    if (fadeOut) item.el.classList.remove("is-in");
    item.hideTimer = setTimeout(() => this.sleep(item), 380);
  },

  sleep(item) {
    if (item === this.current) return;
    item.el.style.transition = "none";
    item.el.classList.remove("is-in");
    void getComputedStyle(item.el).opacity;
    item.el.style.transition = "";
    if (item.type !== "video") return;
    item.el.pause();
    // rewind while hidden, so the next visit starts on a decoded first frame
    if (item.el.currentTime) item.el.currentTime = 0;
  },

  report(type) {
    document.body.classList.toggle("has-media", !!type);
    FX.setMedia(type);
  },
};
