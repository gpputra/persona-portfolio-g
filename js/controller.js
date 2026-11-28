/* =====================================================================
   CONTROLLER — listens to the user, updates the Model, tells the View.
   Sound rules: hover on mouse-over and keyboard focus, confirm on
   click/Enter, back on Escape, BACK and closing.
   ===================================================================== */

const Controller = {

  transitioning: false,
  confirming: false,    // true during the 200ms menu flash

  init() {
    this.applyModelDefaults();
    View.init();
    View.toggleSFX(Model.state.sfxOn);
    SFX.init();
    this.bindAudio();
    this.bindSounds();
    this.bindBoot();
    this.bindMenu();
    this.bindKeyboard();
    this.bindContactForm();
  },

  // Fills in only what model.js doesn't define
  applyModelDefaults() {
    const defaults = { screen: "home", menuIndex: 0, sfxOn: true, musicOn: false, playlistOpen: false, currentTrack: -1 };
    Object.entries(defaults).forEach(([key, value]) => {
      if (Model.state[key] === undefined) Model.state[key] = value;
    });
  },

  /* ---------- Boot overlay: the first gesture unlocks all audio ---------- */
  bindBoot() {
    const start = () => {
      if (!this.booting() || this.started) return;
      this.started = true;
      SFX.play("confirm");
      // called synchronously inside the gesture, as autoplay rules require
      if (AUDIO_CONFIG.autoStartMusic) BGM.setPlaying(true);
      View.dismissBoot();
    };
    View.els.bootOverlay.addEventListener("click", start);
    addEventListener("keydown", e => {
      // Escape and bare modifiers don't count as a gesture in browsers
      if (!this.booting() || ["Escape", "Tab", "Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();      // this Enter must not also open Projects
      start();
    });
  },

  booting() {
    return document.body.dataset.screen === "boot";
  },

  /* ---------- Navigation ---------- */
  goTo(screen, onSwap) {
    if (this.transitioning || screen === Model.state.screen) return false;
    this.transitioning = true;
    if (Model.state.playlistOpen) View.togglePlaylist(false);

    // The lock opens as soon as the new page is in place (the wipe is only
    // sliding away by then, so taps must count). The timer is a backstop.
    const unlock = () => {
      clearTimeout(this.lockTimer);
      this.transitioning = false;
    };
    // Going Home uses the hold-closed curtain; every other move uses the wipe
    const goingHome = screen === "home";
    this.lockTimer = setTimeout(unlock, goingHome ? 2400 : 800);

    const transition = goingHome ? "curtain" : "wipe";
    View[transition](
      () => {                       // swap screens while covered
        let ready;
        try {
          Model.state.screen = screen;
          ready = View.showScreen(screen, { instant: goingHome });
          const item = View.els.menuItems.find(m => m.dataset.target === screen)
            || View.els.menuItems[Model.state.menuIndex];
          View.updateSubtitle(item.dataset.subtitle);
          if (screen === "projects") this.loadProjects();
        } finally {                 // runs even if a page fails to render
          if (onSwap) onSwap();
          if (!goingHome) unlock();
        }
        return ready;
      },
      () => { if (goingHome) unlock(); }   // curtain opening: Home takes taps
    );
    return true;
  },

  // Menu click, tap or Enter: flash first, then change page
  confirmMenu(index) {
    const item = View.els.menuItems[index];
    if (!item || this.confirming || this.transitioning) return;
    if (document.body.dataset.screen !== "home") return;   // what is really on screen
    Model.state.screen = "home";
    this.select(index);
    this.confirming = true;
    Menu.burst(index, () => {       // fired by setTimeout, never animationend
      this.confirming = false;
      const target = item.dataset.page || item.dataset.target;
      if (!this.goTo(target, () => Menu.reset())) Menu.reset();
    });
  },

  // In-page shortcut: the same strobe-and-launch as a Home menu item
  confirmShortcut(button) {
    if (this.confirming || this.transitioning) return;
    const from = document.body.dataset.screen;
    const reset = () => button.classList.remove("confirm");
    const go = () => {
      this.confirming = false;
      // BACK may have been tapped during the flash: don't override it
      if (this.transitioning || document.body.dataset.screen !== from
        || !this.goTo(button.dataset.goto, reset)) reset();
    };
    if (Menu.reducedMotion) return go();
    this.confirming = true;
    button.classList.add("confirm");
    setTimeout(go, Menu.CONFIRM_MS);
  },

  select(index) {
    if (this.confirming) return;        // selection is locked during the burst
    const n = View.els.menuItems.length;
    const next = (index + n) % n;
    Model.state.menuIndex = next;
    View.setMenuSelection(next);
    View.updateSubtitle(View.els.menuItems[next].dataset.subtitle);
  },

  /* ---------- Screen data loading ---------- */
  async loadProjects() {
    View.renderFeatured(Model.featured);
    if (Model.state.reposLoaded || this.loadingRepos) return;
    this.loadingRepos = true;
    const { repos, live } = await Model.fetchRepos();
    const status = live
      ? `${repos.length} repositories · live from GitHub`
      : "Showing pinned work · GitHub API unavailable right now";
    View.renderRepos(repos, status, Model);
    Model.state.reposLoaded = true;
    this.loadingRepos = false;
  },

  /* ---------- Input bindings ---------- */
  bindMenu() {
    View.els.menuItems.forEach((item, i) => {
      // Mouse only: touch taps must not leave a "hovered" state behind
      item.addEventListener("pointerenter", e => {
        if (e.pointerType === "mouse") this.select(i);
      });
      item.addEventListener("focus", () => this.select(i));
    });

    // One delegated listener: whatever was tapped inside an item counts
    View.els.menuItems[0].parentElement.addEventListener("click", e => {
      const item = e.target.closest("[data-page], .menu-item");
      this.confirmMenu(View.els.menuItems.indexOf(item));
    });

    document.querySelectorAll("[data-back]").forEach(b =>
      b.addEventListener("click", () => this.goTo("home")));

    // In-page shortcuts, such as "unlock" on the locked Skills screen
    document.querySelectorAll("[data-goto]").forEach(b =>
      b.addEventListener("click", () => this.confirmShortcut(b)));

    // Clicking the name always takes you home
    document.getElementById("big-name").addEventListener("click", () => {
      if (Model.state.screen !== "home") this.goTo("home");
    });
  },

  bindKeyboard() {
    addEventListener("keydown", e => {
      if (this.booting()) return;
      if (this.confirming) { e.preventDefault(); return; }

      if (e.key === "Escape") {
        if (Model.state.playlistOpen) {
          SFX.play("back");
          this.setPlaylist(false);
        } else if (Model.state.screen !== "home" && !this.transitioning) {
          SFX.play("back");
          this.goTo("home");
        }
        return;
      }

      if (Model.state.screen !== "home" || Model.state.playlistOpen) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        const count = View.els.menuItems.length;
        const next = (Model.state.menuIndex + step + count) % count;
        this.select(next);
        // keep keyboard focus in step if it is already inside the menu
        if (document.activeElement.classList.contains("menu-item")) {
          View.els.menuItems[next].focus();
        }
        SFX.play("hover");        // throttled, so focus + arrow ticks only once
      } else if (e.key === "Enter" && !e.repeat) {
        // A focused button or link already handles its own Enter
        if (e.target.closest && e.target.closest("button, a")) return;
        SFX.play("confirm");
        this.confirmMenu(Model.state.menuIndex);
      }
    });
  },

  /* ---------- Music and playlist (the <audio> lives outside all screens) ---------- */
  setPlaylist(open) {
    View.togglePlaylist(open);
  },

  bindAudio() {
    // config.js wins; Model.playlist is used only if AUDIO_CONFIG.bgm is empty
    const tracks = AUDIO_CONFIG.bgm.length ? AUDIO_CONFIG.bgm : (Model.playlist || []);
    View.renderPlaylist(tracks);
    BGM.init(View.els.bgm, tracks, bgm => View.renderMusic(bgm));

    View.els.pillSfx.addEventListener("click", () => View.toggleSFX(!Model.state.sfxOn));
    View.els.pillMusic.addEventListener("click", () => BGM.toggle());
    View.els.pillPlaylist.addEventListener("click", () =>
      this.setPlaylist(!Model.state.playlistOpen));
    View.els.playlistClose.addEventListener("click", () => this.setPlaylist(false));
    View.els.playlistTracks.addEventListener("click", e => {
      const track = e.target.closest(".playlist-track");
      if (track) BGM.select(Number(track.dataset.index));
    });
  },

  /* ---------- Site-wide UI sounds (delegated, so new cards are covered) ---------- */
  bindSounds() {
    const SELECTOR = "a[href], button, #big-name";
    const canHover = matchMedia("(hover: hover)");
    const hit = node => node && node.closest ? node.closest(SELECTOR) : null;

    // Retry the unlock on every gesture (iOS can suspend audio again later)
    ["pointerdown", "pointerup", "touchend", "keydown"].forEach(type =>
      addEventListener(type, () => SFX.unlock(), { capture: true, passive: true }));

    // Content that appears under a resting cursor must not tick by itself
    let pressX = -1, pressY = -1;
    addEventListener("pointerdown", e => { pressX = e.clientX; pressY = e.clientY; }, true);

    // pointerover + relatedTarget behaves like a delegated mouseenter
    document.addEventListener("pointerover", e => {
      if (e.pointerType === "touch" || !canHover.matches || this.transitioning) return;
      const el = hit(e.target);
      if (!el || el === hit(e.relatedTarget)) return;
      if (e.clientX === pressX && e.clientY === pressY) return;
      SFX.play("hover");
    });

    // Keyboard focus only: clicking also focuses, but isn't :focus-visible
    document.addEventListener("focusin", e => {
      const el = hit(e.target);
      if (el && el.matches(":focus-visible")) SFX.play("hover");
    });

    // Bubble phase: runs after the element's own handler, so toggles
    // are already in their new state. Enter on a button arrives here too.
    document.addEventListener("click", e => {
      const el = hit(e.target);
      if (!el) return;
      const goingBack =
        el.matches("[data-back], #playlist-close") ||
        (el.id === "pill-playlist" && !Model.state.playlistOpen) ||
        (el.id === "big-name" && Model.state.screen !== "home");
      SFX.play(goingBack ? "back" : "confirm");
    });
  },

  /* ---------- Contact form (relayed via formsubmit.co, mailto fallback) ---------- */
  bindContactForm() {
    const form = document.getElementById("contact-form");
    if (!form) return;
    const status = document.getElementById("form-status");
    const btn = form.querySelector(".form-send");

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (data._honey) return;  // honeypot caught a bot
      if (!data.name.trim() || !data.email.trim() || !data.message.trim()) {
        status.textContent = "Fill in all three fields first.";
        return;
      }
      btn.disabled = true;
      status.textContent = "Sending…";
      try {
        const res = await fetch(`https://formsubmit.co/ajax/${Model.contactEmail}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            name: data.name,
            email: data.email,
            message: data.message,
            _subject: `Portfolio message from ${data.name}`,
          }),
        });
        if (!res.ok) throw new Error(res.status);
        status.textContent = "Sent! I'll get back to you soon.";
        form.reset();
      } catch {
        // relay unreachable: open the visitor's own mail app instead
        status.textContent = "Couldn't reach the relay, opening your email app instead…";
        const subject = encodeURIComponent(`Portfolio message from ${data.name}`);
        const body = encodeURIComponent(`${data.message}\n\nReply to: ${data.email}`);
        location.href = `mailto:${Model.contactEmail}?subject=${subject}&body=${body}`;
      } finally {
        btn.disabled = false;
      }
    });
  },
};

Controller.init();
