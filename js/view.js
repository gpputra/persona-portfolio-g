/* =====================================================================
   VIEW — everything that draws to the screen. No app logic lives here;
   the Controller tells the View what to show.
   ===================================================================== */

const View = {

  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,

  els: {
    screens: {},
    menuItems: [],
    bootOverlay: document.getElementById("boot-overlay"),
    wipe: document.getElementById("wipe"),
    cut: document.getElementById("cut"),
    featGrid: document.getElementById("feat-grid"),
    repoGrid: document.getElementById("repo-grid"),
    repoStatus: document.getElementById("repo-status"),
    bgm: document.getElementById("bgm-player"),
    cursor: document.getElementById("cursor"),
    clock: document.getElementById("hud-clock"),
    subtitle: document.getElementById("hud-subtitle-text"),
    nowTitle: document.getElementById("now-title"),
    pillSfx: document.getElementById("pill-sfx"),
    pillMusic: document.getElementById("pill-music"),
    pillPlaylist: document.getElementById("pill-playlist"),
    playlistPanel: document.getElementById("playlist-panel"),
    playlistClose: document.getElementById("playlist-close"),
    playlistTracks: document.getElementById("playlist-tracks"),
  },

  init() {
    document.querySelectorAll(".screen").forEach(s => {
      this.els.screens[s.id.replace("screen-", "")] = s;
    });
    this.els.menuItems = [...document.querySelectorAll("#menu .menu-item")];
    document.querySelectorAll("[data-ransom]").forEach(el => this.ransomize(el));
    Menu.build(this.els.menuItems);
    Cutouts.init();
    this.startClock();
    this.startCursor();
    FX.init();
    Media.init();
    Media.show("home");
    this.updateSubtitle(this.els.menuItems[0].dataset.subtitle);
  },

  /* ========== BOOT OVERLAY ========== */
  dismissBoot(callback) {
    const overlay = this.els.bootOverlay;
    overlay.classList.add("dismissed");
    // "loaded" starts the menu entrance, so add it only once the menu is visible
    document.body.classList.add("app-ready", "loaded");
    document.body.dataset.screen = "home";
    setTimeout(() => {
      overlay.style.display = "none";
      if (callback) callback();
    }, 500);
  },

  /* ========== Deterministic pseudo-random hash ========== */
  hash(str) {
    let h = 9;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 387420489);
    return (h ^ h >>> 9) >>> 0;
  },

  /* ========== Ransom-note lettering ========== */
  ransomize(el) {
    const text = el.dataset.ransom || el.textContent;
    el.textContent = "";
    [...text].forEach((c, i) => {
      const span = document.createElement("span");
      span.className = "ch display";
      span.textContent = c;
      const h = this.hash(text + i);
      const rot = (h % 17) - 8;
      const scale = 0.86 + ((h >> 3) % 30) / 100;
      const dy = ((h >> 5) % 9) - 4;
      const t = `rotate(${rot}deg) scale(${scale}) translateY(${dy}px)`;
      span.style.setProperty("--t", t);
      span.style.transform = t;
      const variant = (h >> 7) % 10;
      if (variant === 0) span.classList.add("box");
      else if (variant === 1) span.classList.add("boxw");
      else if (variant === 2) span.classList.add("red");
      el.appendChild(span);
    });
  },

  /* ========== Screens & menu ========== */
  showScreen(name, mediaOptions) {
    const s = this.els.screens;
    Object.values(s).forEach(sc => sc.classList.remove("active"));
    if (s[name]) {
      s[name].classList.add("active");
      s[name].scrollTop = 0;
    }
    document.body.dataset.screen = name;
    return Media.show(name, mediaOptions);   // resolves when the visual is ready
  },

  setMenuSelection(index) {
    this.els.menuItems.forEach((m, j) => {
      m.classList.toggle("sel", j === index);
      if (j === index) m.setAttribute("aria-current", "true");
      else m.removeAttribute("aria-current");
    });
  },

  /* ========== Dynamic HUD subtitle ========== */
  updateSubtitle(text) {
    const el = this.els.subtitle;
    if (el.textContent === text) return;
    clearTimeout(this.subtitleTimer);        // fast hovering must not queue updates
    el.style.opacity = "0";
    this.subtitleTimer = setTimeout(() => {
      el.textContent = text || "";
      el.style.opacity = "1";
    }, 100);
  },

  /* ========== Wipe transition ========== */
  wipe(swap, done) {
    this.resetCurtain();
    if (this.reducedMotion) { swap(); done(); return; }
    const w = this.els.wipe;
    w.classList.remove("go"); void w.offsetWidth;
    w.classList.add("go");
    setTimeout(swap, 340);
    setTimeout(done, 700);
  },

  /* ========== Return-Home slash cut ==========
     Close, swap behind it, hold until Home's media is ready, then open.
     swap() must return a promise; done() runs as the curtain starts to open.
     Timings match css/transition.css. */
  CLOSE_MS: 300,       // both halves have landed
  MIN_HOLD_MS: 190,    // the HOME stamp lands; Home paints underneath
  MAX_HOLD_MS: 1200,   // never keep a slow connection waiting longer than this
  OPEN_MS: 400,
  curtainTimers: [],
  curtainRun: 0,

  curtain(swap, done) {
    this.resetCurtain();
    if (this.reducedMotion) { swap(); done(); return; }

    const run = this.curtainRun;
    const w = this.els.cut;
    const body = document.body;
    const later = (fn, ms) => this.curtainTimers.push(setTimeout(fn, ms));
    const wait = ms => new Promise(resolve => later(resolve, ms));

    this.els.wipe.classList.remove("go");
    void w.offsetWidth;
    w.classList.add("is-closing");

    later(() => {                       // fully covered: safe to change the page
      body.classList.add("curtain-held");
      const ready = Promise.resolve(swap());
      const open = () => {
        if (run !== this.curtainRun) return;
        Media.dropStale();
        // two frames, so the new picture has really been painted
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (run !== this.curtainRun) return;
          body.classList.remove("curtain-held");
          w.classList.replace("is-closing", "is-opening");
          done();
          later(() => w.classList.remove("is-opening"), this.OPEN_MS);
        }));
      };
      Promise.race([
        Promise.all([ready, wait(this.MIN_HOLD_MS)]),
        wait(this.MAX_HOLD_MS),
      ]).then(open, open);
    }, this.CLOSE_MS);
  },

  resetCurtain() {
    this.curtainRun++;
    this.curtainTimers.forEach(clearTimeout);
    this.curtainTimers = [];
    this.els.cut.classList.remove("is-closing", "is-opening");
    document.body.classList.remove("curtain-held");
  },

  /* ========== Music UI (playback itself lives in audio.js) ========== */
  renderMusic(bgm) {
    Model.state.musicOn = bgm.wanted;
    Model.state.currentTrack = bgm.index;
    this.els.pillMusic.textContent = bgm.wanted ? "MUSIC ON" : "MUSIC OFF";
    this.els.pillMusic.classList.toggle("active", bgm.wanted);
    this.els.pillMusic.setAttribute("aria-pressed", bgm.wanted);

    this.els.playlistTracks.querySelectorAll(".playlist-track").forEach((el, i) => {
      el.classList.toggle("active", i === bgm.index);
      el.classList.toggle("paused", i === bgm.index && !bgm.wanted);
      el.setAttribute("aria-current", i === bgm.index);
    });

    const track = bgm.tracks[bgm.index];
    this.els.nowTitle.textContent = bgm.message ? bgm.message
      : !track ? "Nothing playing"
        : bgm.wanted ? track.title : `${track.title} (paused)`;
  },

  toggleSFX(on) {
    Model.state.sfxOn = on;
    SFX.enabled = on;
    this.els.pillSfx.textContent = on ? "SFX ON" : "SFX OFF";
    this.els.pillSfx.classList.toggle("active", on);
  },

  togglePlaylist(open) {
    Model.state.playlistOpen = open;
    this.els.playlistPanel.classList.toggle("hidden", !open);
    this.els.pillPlaylist.classList.toggle("active", open);
    this.els.pillPlaylist.setAttribute("aria-expanded", open);
  },

  renderPlaylist(tracks) {
    const container = this.els.playlistTracks;
    container.textContent = "";
    if (!tracks.length) {
      container.innerHTML = '<p class="playlist-empty">No tracks yet. Add them in js/config.js.</p>';
      return;
    }
    tracks.forEach((track, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "playlist-track";
      btn.dataset.index = i;
      [["track-no", String(i + 1).padStart(2, "0")], ["track-title", track.title], ["track-mark", "▶"]]
        .forEach(([cls, text]) => {
          const span = document.createElement("span");
          span.className = cls;
          span.textContent = text;
          btn.appendChild(span);
        });
      container.appendChild(btn);
    });
  },

  /* ========== Project cards ========== */
  cardThumb(src) {
    return `<div class="thumb"><img src="${src}" alt="" loading="lazy"
      onerror="this.closest('.thumb').remove()"></div>`;
  },

  splitTitle(title) {
    const first = title.split(" ")[0];
    return `<em>${first}</em>${title.slice(first.length)}`;
  },

  renderFeatured(list) {
    if (this.els.featGrid.childElementCount) return;
    list.forEach((f, i) => {
      const a = document.createElement("a");
      a.className = "card feat";
      a.href = f.url; a.target = "_blank"; a.rel = "noopener";
      a.style.setProperty("--tilt", ((this.hash(f.title) % 5) - 2) * 0.8 + "deg");
      a.style.setProperty("--d", i * 70 + "ms");
      a.innerHTML = `
        ${this.cardThumb(f.img)}
        <span class="lang">${f.tag}</span>
        <h3>${f.live ? '<span class="live-dot"></span>' : ""}${this.splitTitle(f.title)}</h3>
        <p>${f.desc}</p>
        <div class="meta"><span>${f.live ? "LIVE NOW" : "HIGHLIGHT"}</span><span class="go">${f.cta}</span></div>`;
      this.els.featGrid.appendChild(a);
    });
  },

  renderRepos(repos, statusText, model) {
    this.els.repoStatus.textContent = statusText;
    this.els.repoGrid.innerHTML = "";
    repos.forEach((r, i) => {
      const a = document.createElement("a");
      a.className = "card";
      a.href = r.html_url; a.target = "_blank"; a.rel = "noopener";
      a.style.setProperty("--tilt", ((this.hash(r.name) % 5) - 2) * 0.8 + "deg");
      a.style.setProperty("--d", i * 70 + "ms");
      const pretty = r.name.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const img = model.projectImages[r.name] || `assets/projects/${r.name}.png`;
      a.innerHTML = `
        ${this.cardThumb(img)}
        <span class="lang">${r.language || "Repo"}</span>
        <h3>${this.splitTitle(pretty)}</h3>
        <p>${r.description || "No description yet, but the code speaks for itself."}</p>
        <div class="meta">
          <span>★ ${r.stargazers_count || 0}</span>
          <span class="go">View on GitHub →</span>
        </div>`;
      this.els.repoGrid.appendChild(a);
    });
  },

  /* ========== Ambient: clock and cursor ========== */
  startClock() {
    const update = () => {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      this.els.clock.textContent = `${mm}/${dd} - ${hh}:${min}`;
    };
    update();
    setInterval(update, 1000);
  },

  startCursor() {
    if (!matchMedia("(pointer:fine)").matches || this.reducedMotion) return;
    const cur = this.els.cursor;
    document.body.classList.add("cursor-on");
    let x = -100, y = -100, frame = 0, last = 0, visible = false;

    addEventListener("mousemove", e => {
      x = e.clientX; y = e.clientY;
      if (!visible) { cur.style.display = "block"; visible = true; }
      const t = e.target;
      const overLink = t.closest &&
        t.closest("a,button,.card,.menu-item,.back-hint,.contact-chip,#big-name,.hud-pill,.playlist-track");
      cur.classList.toggle("link", !!overLink);
    }, { passive: true });

    document.documentElement.addEventListener("mouseleave", () => {
      cur.style.display = "none"; visible = false;
    });

    const tick = ts => {
      if (ts - last >= 50) {
        frame = (frame + 1) % 30; last = ts;
        cur.style.backgroundPosition = -frame * 48 + "px 0";
      }
      cur.style.transform = `translate(${x}px, ${y}px)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
};
