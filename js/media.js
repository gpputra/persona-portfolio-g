/* =====================================================================
   MEDIA — shows each page's PAGE_MEDIA entry as the background.
   Desktop sub-pages: framed in the area right of the diagonal.
   Mobile: full screen behind the content.
   Only the visible page's file is downloaded, and only one stays alive.
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
     (or there is none). { instant: true } is for swaps behind a closed curtain. */
  show(page, { instant = false } = {}) {
    this.done();                             // release any earlier waiter
    this.instant = instant;
    const settled = new Promise(resolve => { this.settle = resolve; });
    const token = ++this.token;
    this.discard(this.pending);
    this.pending = null;
    clearTimeout(this.staleTimer);
    this.stage.dataset.page = page;
    // If the new file is slow, don't leave another page's visual on screen
    // (not needed behind the curtain: dropStale() covers that case)
    if (!instant) this.staleTimer = setTimeout(() => this.clear(), 900);
    this.tryNext(this.queueFor(page), page, token);
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

    const item = this.build(url);
    this.pending = item;
    this.frame(item.el, page);

    const fail = () => {
      if (this.pending !== item) return;
      this.dead.add(url);
      this.discard(item);
      this.pending = null;
      this.tryNext(queue, page, token);
    };
    const ready = () => {
      if (token !== this.token || this.pending !== item) return;
      clearTimeout(this.staleTimer);
      this.pending = null;
      this.reveal(item);
    };

    item.el.addEventListener("error", fail, { once: true });
    item.el.addEventListener(item.type === "video" ? "loadeddata" : "load", ready, { once: true });
    this.stage.appendChild(item.el);
    item.el.src = url;
    this.play(item);
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
      el.autoplay = !this.reducedMotion;
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
    if (this.instant) item.el.style.transition = "none";
    void item.el.offsetWidth;                // commit the start state first
    item.el.classList.add("is-in");
    if (this.instant) {                      // commit, then restore normal fades
      void getComputedStyle(item.el).opacity;
      item.el.style.transition = "";
    }
    if (this.instant) this.discard(old);     // hidden, so unmount right away
    else this.retire(old);
    this.report(item.type);
    this.done();
  },

  clear() {
    const old = this.current;
    this.current = null;
    if (old && this.instant) this.discard(old);
    else {
      if (old) old.el.classList.remove("is-in");
      this.retire(old);
    }
    this.report("");
    if (!this.pending) this.done();
  },

  retire(item) {
    if (item) setTimeout(() => this.discard(item), 550);
  },

  // Releases the video decoder as well as removing the element
  discard(item) {
    if (!item || item === this.current) return;
    if (item.type === "video") {
      item.el.pause();
      item.el.removeAttribute("src");
      item.el.load();
    }
    item.el.remove();
  },

  report(type) {
    document.body.classList.toggle("has-media", !!type);
    FX.setMedia(type);
  },
};
