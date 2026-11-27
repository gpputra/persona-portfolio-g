/* =====================================================================
   CONTROLLER — listens to the user, updates the Model, tells the View.
   ===================================================================== */

const Controller = {

  transitioning: false,
  audioUnlocked: false,

  init() {
    // Don't initialize the main app until boot is dismissed
    this.bindBoot();
  },

  /* ========== BOOT / AUDIO UNLOCK ========== */
  bindBoot() {
    const dismiss = (e) => {
      // Only respond to click/touch or Enter key
      if (e.type === "keydown" && e.key !== "Enter") return;
      e.preventDefault();

      // Unlock audio context (browsers require user gesture)
      this.audioUnlocked = true;

      // Remove boot listeners
      document.removeEventListener("click", dismiss);
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("touchend", dismiss);

      // Dismiss the boot overlay and start the app
      View.dismissBoot(() => {
        this.startApp();
      });
    };

    document.addEventListener("click", dismiss);
    document.addEventListener("keydown", dismiss);
    document.addEventListener("touchend", dismiss, { passive: false });
  },

  startApp() {
    // Initialize the View (ransom letters, clock, parallax, cursor)
    View.init();

    // Show the home screen
    Model.state.screen = "home";
    View.showScreen("home");

    // Set up initial SFX pill state
    View.els.pillSfx.classList.add("active");

    // Bind everything
    this.bindMenu();
    this.bindKeyboard();
    this.bindHUDControls();
    this.bindContactForm();

    // Render playlist if any tracks exist
    View.renderPlaylist();

    // Auto-play first SFX to confirm audio is working
    setTimeout(() => this.play(), 200);
  },

  /* ========== Navigation ========== */
  goTo(screen) {
    if (this.transitioning || screen === Model.state.screen) return;
    this.transitioning = true;
    this.play();

    // Update subtitle for the target screen
    if (screen === "home") {
      View.updateSubtitle(Model.menuItems[Model.state.menuIndex].subtitle);
    } else {
      const item = Model.menuItems.find(m => m.target === screen);
      View.updateSubtitle(item ? item.subtitle : "");
    }

    View.wipe(
      () => {
        Model.state.screen = screen;
        View.showScreen(screen);
        if (screen === "projects") this.loadProjects();
        if (screen === "skills") this.loadSkills();
      },
      () => { this.transitioning = false; }
    );
  },

  select(index) {
    const n = View.els.menuItems.length;
    const next = (index + n) % n;
    if (next !== Model.state.menuIndex) this.play();
    Model.state.menuIndex = next;
    View.setMenuSelection(next);
    // Update the dynamic subtitle
    View.updateSubtitle(Model.menuItems[next].subtitle);
  },

  /* ========== Screen data loading ========== */
  async loadProjects() {
    View.renderFeatured(Model.featured);
    if (Model.state.reposLoaded) return;
    const { repos, live } = await Model.fetchRepos();
    const status = live
      ? `${repos.length} repositories · live from GitHub`
      : "Showing pinned work · GitHub API unavailable right now";
    View.renderRepos(repos, status, Model);
    Model.state.reposLoaded = true;
  },

  loadSkills() {
    if (!Model.state.skillsBuilt) {
      View.renderSkills(Model.skills);
      Model.state.skillsBuilt = true;
    }
    View.animateSkillBars();
  },

  /* ========== Sound ========== */
  play() {
    if (this.audioUnlocked) View.playSelect();
  },

  /* ========== HUD Controls (SFX, Music, Playlist) ========== */
  bindHUDControls() {
    // SFX toggle
    View.els.pillSfx.addEventListener("click", () => {
      View.toggleSFX(!Model.state.sfxOn);
      this.play();
    });

    // Music toggle
    View.els.pillMusic.addEventListener("click", () => {
      View.toggleMusic(!Model.state.musicOn);
    });

    // Playlist toggle
    View.els.pillPlaylist.addEventListener("click", () => {
      View.togglePlaylist(!Model.state.playlistOpen);
      this.play();
    });

    // Playlist close button
    View.els.playlistClose.addEventListener("click", () => {
      View.togglePlaylist(false);
      this.play();
    });

    // Playlist track selection
    View.els.playlistTracks.addEventListener("click", (e) => {
      const track = e.target.closest(".playlist-track");
      if (!track) return;
      const index = parseInt(track.dataset.index, 10);
      View.playBGM(index);
      if (!Model.state.musicOn) View.toggleMusic(true);
      this.play();
    });

    // BGM auto-advance to next track
    View.els.bgm.addEventListener("ended", () => {
      if (Model.playlist.length === 0) return;
      const next = (Model.state.currentTrack + 1) % Model.playlist.length;
      View.playBGM(next);
    });
  },

  /* ========== Input bindings ========== */
  bindMenu() {
    View.els.menuItems.forEach((item, i) => {
      item.addEventListener("mouseenter", () => this.select(i));
      item.addEventListener("click", () => this.goTo(item.dataset.target));
    });

    document.querySelectorAll("[data-back]").forEach(b =>
      b.addEventListener("click", () => this.goTo("home")));

    // Clicking the name always takes you home
    document.getElementById("big-name").addEventListener("click", () => {
      if (Model.state.screen !== "home") this.goTo("home");
      else this.play();
    });
  },

  bindKeyboard() {
    addEventListener("keydown", e => {
      if (Model.state.screen === "boot") return; // boot handles its own keys
      if (Model.state.screen === "home") {
        if (e.key === "ArrowDown") { this.select(Model.state.menuIndex + 1); e.preventDefault(); }
        else if (e.key === "ArrowUp") { this.select(Model.state.menuIndex - 1); e.preventDefault(); }
        else if (e.key === "Enter") {
          this.goTo(View.els.menuItems[Model.state.menuIndex].dataset.target);
        }
      } else if (e.key === "Escape") {
        this.goTo("home");
      }
    });
  },

  /* ========== Contact form ========== */
  bindContactForm() {
    const form = document.getElementById("contact-form");
    if (!form) return;
    const status = document.getElementById("form-status");
    const btn = form.querySelector(".form-send");

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (data._honey) return;
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
        this.play();
      } catch {
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
