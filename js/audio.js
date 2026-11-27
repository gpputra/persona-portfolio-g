/* =====================================================================
   AUDIO — two independent engines.
   SFX: Web Audio buffers (instant, can overlap) with a synth fallback.
   BGM: one root-level <audio>, so page changes never restart it.
   ===================================================================== */

const SFX = {

  ctx: null,
  out: null,
  buffers: {},
  enabled: true,
  lastHover: 0,

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.gain.value = AUDIO_CONFIG.sfxVolume;
    this.out.connect(this.ctx.destination);
    Object.entries(AUDIO_CONFIG.sfx).forEach(([name, path]) => this.load(name, path));
  },

  async load(name, path) {
    for (const url of assetCandidates(path)) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        // A dev server may answer a missing file with index.html (status 200);
        // decoding then fails and we move on.
        const data = await res.arrayBuffer();
        this.buffers[name] = await new Promise((ok, fail) => {
          // callbacks for old Safari; newer browsers also return a promise
          const p = this.ctx.decodeAudioData(data, ok, fail);
          if (p) p.catch(fail);
        });
        return;
      } catch { /* try the next candidate */ }
    }
    console.info(`[sfx] ${path} not loaded, using the synth ${name} sound`);
  },

  // Must be called from inside a user gesture
  unlock() {
    if (this.ctx && this.ctx.state !== "running") this.ctx.resume().catch(() => {});
  },

  play(name) {
    if (!this.enabled || !this.ctx) return;
    if (name === "hover") {
      // hover is not a gesture: never queue sounds on a locked context
      if (this.ctx.state !== "running") return;
      const now = performance.now();
      if (now - this.lastHover < 45) return;
      this.lastHover = now;
    } else {
      this.unlock();
    }
    const buffer = this.buffers[name];
    if (!buffer) return this.synth(name);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.out);
    source.start();
  },

  // Short, hard-edged blips: a tick, a rising double click, a falling one
  synth(name) {
    const notes = {
      hover:   [[0, 2100, 1400, 0.035, 0.22]],
      confirm: [[0, 880, 880, 0.05, 0.4], [0.045, 1760, 1320, 0.09, 0.4]],
      back:    [[0, 1040, 780, 0.05, 0.4], [0.045, 520, 330, 0.1, 0.4]],
    }[name];
    if (!notes) return;
    notes.forEach(([delay, from, to, length, level]) => {
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + length);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(gain).connect(this.out);
      osc.start(t);
      osc.stop(t + length + 0.02);
    });
  },
};

const BGM = {

  el: null,
  tracks: [],
  index: -1,
  wanted: false,        // the user's intent; the pill shows this
  candidate: 0,
  fadeTimer: 0,
  message: "",
  onChange: () => {},

  init(el, tracks, onChange) {
    this.el = el;
    this.onChange = onChange;
    this.tracks = tracks.map(t => ({ ...t, urls: assetCandidates(t.src), broken: false }));
    el.loop = false;                     // looping would suppress "ended"
    el.preload = "none";

    el.addEventListener("ended", () => this.next());
    el.addEventListener("error", () => this.handleError());
    // Keep the UI honest when the OS or a headset pauses or resumes playback.
    // These events arrive late, so check the element's present state.
    el.addEventListener("pause", () => {
      if (this.wanted && el.paused && !el.ended && !el.error) { this.wanted = false; this.changed(); }
    });
    el.addEventListener("play", () => {
      if (!this.wanted && !el.paused && !this.fadeTimer) { this.wanted = true; this.changed(); }
    });
  },

  changed() { this.onChange(this); },

  // iOS ignores volume changes, so there the fade simply has no effect
  fade(to, ms, done) {
    clearInterval(this.fadeTimer);
    const from = this.el.volume;
    const start = performance.now();
    this.fadeTimer = setInterval(() => {
      const k = Math.min((performance.now() - start) / ms, 1);
      this.el.volume = Math.min(1, Math.max(0, from + (to - from) * k));
      if (k < 1) return;
      clearInterval(this.fadeTimer);
      this.fadeTimer = 0;
      if (done) done();
    }, 20);
  },

  // Must stay synchronous so play() keeps the user-gesture permission
  resume() {
    this.wanted = true;
    this.message = "";
    if (this.el.paused) this.el.volume = 0;
    const p = this.el.play();
    this.fade(AUDIO_CONFIG.musicVolume, 300);
    if (p && p.catch) p.catch(err => {
      if (err.name !== "NotAllowedError") return;   // file errors go to handleError()
      this.wanted = false;
      this.message = "Tap MUSIC to start";
      this.changed();
    });
    this.changed();
  },

  load(index) {
    this.index = index;
    this.candidate = 0;
    this.el.src = this.tracks[index].urls[0];
    this.el.load();
  },

  // A track the user picked in the drawer
  select(index) {
    const track = this.tracks[index];
    if (!track) return;
    const retry = track.broken;
    track.broken = false;                      // maybe the file has been added
    if (index !== this.index || retry) this.load(index);   // same track: don't restart
    this.resume();
  },

  setPlaying(on) {
    if (!on) {
      this.wanted = false;
      this.changed();
      this.fade(0, 180, () => this.el.pause());
      return;
    }
    if (this.index >= 0 && !this.tracks[this.index].broken) return this.resume();
    const first = this.tracks.findIndex(t => !t.broken);
    if (first >= 0) return this.select(first);
    if (this.tracks.length) return this.select(0);        // retry from the top
    this.message = "No tracks configured";
    this.changed();
  },

  toggle() { this.setPlaying(!this.wanted); },

  // Next playable track, wrapping around
  nextIndex() {
    const n = this.tracks.length;
    for (let step = 1; step <= n; step++) {
      const i = (this.index + step) % n;
      if (!this.tracks[i].broken) return i;
    }
    return -1;
  },

  next() {
    const i = this.nextIndex();
    if (i < 0) return;
    if (i === this.index) this.el.currentTime = 0;    // only one track: replay it
    else this.load(i);
    this.resume();
  },

  handleError() {
    const track = this.tracks[this.index];
    if (!track || !this.el.error) return;
    if (++this.candidate < track.urls.length) {       // try the next location
      this.el.src = track.urls[this.candidate];
      this.el.load();
      if (this.wanted) this.resume();
      return;
    }
    track.broken = true;
    console.warn(`[bgm] could not load ${track.src}`);
    if (this.wanted && this.nextIndex() >= 0) return this.next();
    this.wanted = false;
    this.message = `File not found: ${track.src}`;
    this.changed();
  },
};
