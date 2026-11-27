/* =====================================================================
   MENU — builds the ransom-note letters, slash bar and star for each
   main-menu button, and plays the confirm burst. Styling: css/menu.css
   ===================================================================== */

const Menu = {

  CONFIRM_MS: 200,
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  root: null,
  items: [],

  // Hand-picked so every word looks deliberately cut out, not random.
  ROTATE: [-5, 4, -3, 6, -4, 3, -6, 5],          // degrees
  LIFT: [0, -.04, .03, -.02, .045, -.035],     // em
  SCALE: [1.1, .96, 1.02, .93, 1.05, .98],
  FONT: [0, 1, 0, 2, 0, 1, 2],   // 0 Anton · 1 Archivo Black · 2 Bebas Neue

  /* Which letters get a cut-out box while the item is selected
     (letter positions start at 0). "k" = black box, "w" = white box.
     A label not listed here gets: first = black, middle = white. */
  CUTOUTS: {
    PROJECTS: { k: [0, 5], w: [2] },
    SKILLS: { k: [0], w: [3] },
    ABOUT: { k: [0], w: [2] },
    CERTIFICATES: { k: [0, 8], w: [5] },
    CONTACT: { k: [0], w: [3] },
  },

  // Jagged, deliberately lopsided five-point star
  STAR: [[0, -50], [12, -16], [48, -21], [21, 4], [35, 45],
  [1, 21], [-33, 40], [-20, 5], [-49, -14], [-12, -16]],

  build(items) {
    this.items = items;
    this.root = items[0].parentElement;
    items.forEach((item, row) => this.buildItem(item, row));
  },

  el(className, parent, tag = "span") {
    const node = document.createElement(tag);
    node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  },

  buildItem(item, row) {
    const word = item.textContent.trim().toUpperCase();
    item.textContent = "";
    item.setAttribute("aria-label", word);   // screen readers hear the word, not letters
    item.style.setProperty("--i", row);

    // .mi-body carries the entrance and launch; the button carries hover physics
    const body = this.el("mi-body", item);
    body.setAttribute("aria-hidden", "true");

    const fx = this.el("mi-fx", body);
    ["mi-burst", "mi-shadow", "mi-blade", "mi-flash mi-flash-w", "mi-flash mi-flash-k", "mi-tail"]
      .forEach(name => this.el(name, fx));

    this.el("mi-star", body).innerHTML = this.starSVG();

    const label = this.el("menu-label", body);
    const cuts = this.CUTOUTS[word] || { k: [0], w: [Math.floor(word.length / 2)] };

    [...word].forEach((char, k) => {
      const n = k + row * 2;                 // offset so rows don't repeat each other
      const letter = this.el(`mi-l f${this.FONT[n % this.FONT.length]}`, label);
      if (cuts.k.includes(k)) letter.classList.add("cut", "cut-k");
      if (cuts.w.includes(k)) letter.classList.add("cut", "cut-w");
      letter.style.setProperty("--r", this.ROTATE[n % this.ROTATE.length] + "deg");
      letter.style.setProperty("--y", this.LIFT[n % this.LIFT.length] + "em");
      letter.style.setProperty("--s", this.SCALE[n % this.SCALE.length]);
      letter.style.setProperty("--br", (k % 2 ? 5 : -7) + "deg");   // box tilt
      letter.style.setProperty("--k", k);                           // wave order

      // .mi-g is separate so the wave never overwrites the letter's own tilt
      const glyph = this.el("mi-g", letter);
      glyph.textContent = char === " " ? " " : char;
      glyph.dataset.c = glyph.textContent;
    });
  },

  starSVG() {
    const points = k => this.STAR.map(([x, y]) => `${x * k},${y * k}`).join(" ");
    return `<svg viewBox="-60 -60 120 120" focusable="false">
      <polygon points="${points(1)}" fill="#0B0B0B" stroke="#0B0B0B" stroke-width="14"/>
      <polygon points="${points(.98)}" fill="#FFFFFF"/>
      <polygon points="${points(.72)}" fill="#0B0B0B"/>
      <polygon points="${points(.52)}" fill="#D90429"/>
    </svg>`;
  },

  /* Strobe, slash burst and launch. Calls done() when it's over. */
  burst(index, done) {
    if (this.reducedMotion) return done();   // no flashing for these visitors
    this.root.classList.add("confirming");
    this.items[index].classList.add("confirm");
    setTimeout(done, this.CONFIRM_MS);
  },

  // Called while the wipe covers the screen, so nothing visibly snaps back
  reset() {
    this.root.classList.remove("confirming");
    this.items.forEach(item => item.classList.remove("confirm"));
  },
};
