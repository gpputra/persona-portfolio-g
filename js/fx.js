/* =====================================================================
   FX — canvas overlay: drifting stars and crimson slash streaks.
   It works on its own, so a page still moves if its media is missing.
   ===================================================================== */

const FX = {

  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  mobile: matchMedia("(max-width: 768px)"),

  stars: [],
  streaks: [],
  sprites: [],
  raf: 0,
  last: 0,
  mediaType: "",    // "video", "gif", "image" or "" (set by media.js)

  init() {
    this.canvas = document.getElementById("bg-fx");
    this.ctx = this.canvas.getContext("2d");

    if (!this.ctx) return;

    this.sprites = [
      this.makeStar(["#FFFFFF", "#0B0B0B", "#D90429"]),
      this.makeStar(["#0B0B0B", "#D90429", "#0B0B0B"]),
      this.makeStar(["#D90429", "#FFFFFF", "#0B0B0B"]),
    ];

    let timer = 0;
    addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.resize(), 120);
    });
    document.addEventListener("visibilitychange", () => this.sync());
    this.mobile.addEventListener("change", () => this.sync());

    this.resize();
    this.sync();
  },

  /* ---------- Canvas ---------- */
  // Pre-render each layered star once; drawing a bitmap is far cheaper
  // than rebuilding three paths per star on every frame.
  makeStar(colors) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    [1, 0.76, 0.5].forEach((k, layer) => {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = (i % 2 ? 0.43 : 1) * (size / 2) * k;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        g[i ? "lineTo" : "moveTo"](size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r);
      }
      g.closePath();
      g.fillStyle = colors[layer];
      g.fill();
    });
    return c;
  },

  resize() {
    const w = innerWidth, h = innerHeight;
    const small = this.mobile.matches;
    // The art is flat and hard-edged, so a capped pixel ratio saves a lot of fill
    const dpr = Math.min(devicePixelRatio || 1, small ? 1 : 1.5);
    const widthChanged = w !== this.w;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Don't reshuffle when only the height changes (mobile URL bar)
    if (widthChanged) {
      const rnd = (a, b) => a + Math.random() * (b - a);
      this.stars = Array.from({ length: small ? 9 : 18 }, (_, i) => ({
        x: rnd(0, w), y: rnd(0, h),
        size: i < 2 ? rnd(180, 320) : rnd(18, 80),
        vx: rnd(-14, -4), vy: rnd(6, 22),
        a: rnd(0, 6.28), spin: rnd(-0.35, 0.35),
        alpha: i < 2 ? 0.14 : rnd(0.25, 0.6),
        sprite: i % 3,
      }));
      this.streaks = Array.from({ length: small ? 4 : 8 }, () => ({
        x: rnd(-w * 0.3, w * 1.2), y: rnd(-h * 0.1, h),
        len: rnd(140, 460), thick: rnd(3, 22),
        speed: rnd(120, 420), alpha: rnd(0.25, 0.7),
      }));
    }
    this.draw(0);
  },

  draw(dt) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    // Slash streaks travel up and to the right along a fixed diagonal
    const dx = 0.88, dy = -0.47;
    ctx.fillStyle = "#D90429";
    for (const s of this.streaks) {
      s.x += dx * s.speed * dt;
      s.y += dy * s.speed * dt;
      if (s.y < -s.len || s.x > w + s.len) {
        s.x = Math.random() * w - w * 0.4;
        s.y = h + Math.random() * h * 0.4;
      }
      ctx.globalAlpha = s.alpha;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + dx * s.len, s.y + dy * s.len);
      ctx.lineTo(s.x + dx * s.len * 0.55, s.y + dy * s.len * 0.55 + s.thick);
      ctx.closePath();
      ctx.fill();
    }

    for (const s of this.stars) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.a += s.spin * dt;
      if (s.y - s.size > h) { s.y = -s.size; s.x = Math.random() * w * 1.2; }
      if (s.x + s.size < 0) s.x = w + s.size;
      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.drawImage(this.sprites[s.sprite], -s.size / 2, -s.size / 2, s.size, s.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },

  tick(now) {
    // Delta time keeps speed identical on 60 Hz and 120 Hz displays
    const dt = Math.min((now - (this.last || now)) / 1000, 0.05);
    this.last = now;
    this.draw(dt);
    this.raf = requestAnimationFrame(t => this.tick(t));
  },

  // On phones a moving background already supplies the motion, so the
  // canvas rests to leave the frame budget to video decoding and scrolling
  resting() {
    return this.mobile.matches && (this.mediaType === "video" || this.mediaType === "gif");
  },

  sync() {
    if (!this.ctx) return;
    const rest = this.resting();
    this.canvas.style.visibility = rest ? "hidden" : "";
    const run = !this.reducedMotion && !document.hidden && !rest;
    if (run && !this.raf) {
      this.last = 0;
      this.raf = requestAnimationFrame(t => this.tick(t));
    } else if (!run && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  },

  setMedia(type) {
    this.mediaType = type;
    this.sync();
  },
};
