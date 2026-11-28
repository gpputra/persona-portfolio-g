/* =====================================================================
   CUTOUTS — the Home menu's ransom-note lettering, reusable.
   Used by the locked SKILLS card and the return-Home transition.
   Load after menu.js (it shares the menu's tilt tables and star).
   ===================================================================== */

const Cutouts = {

  /* Writes element.dataset.cut as individual paper letters.
     data-k / data-w / data-r list the letter positions (from 0) that get a
     black box, a white box, or a white box with a crimson letter. */
  letters(el, offset = 0) {
    const list = name => (el.dataset[name] || "").split(",").filter(Boolean).map(Number);
    const boxes = { "box-k": list("k"), "box-w": list("w"), "box-r": list("r") };
    let k = 0;
    let word = null;
    el.textContent = "";

    [...el.dataset.cut].forEach((char, i) => {
      if (char === " ") { word = null; return; }
      if (!word) word = Menu.el("cl-word", el);          // words never break apart
      const n = i + offset;
      const letter = Menu.el(`cl f${Menu.FONT[n % Menu.FONT.length]}`, word);
      Object.entries(boxes).forEach(([name, at]) => { if (at.includes(i)) letter.classList.add(name); });
      letter.style.setProperty("--r", Menu.ROTATE[n % Menu.ROTATE.length] + "deg");
      letter.style.setProperty("--y", Menu.LIFT[n % Menu.LIFT.length] + "em");
      letter.style.setProperty("--s", Menu.SCALE[n % Menu.SCALE.length]);
      letter.style.setProperty("--k", offset + k++);     // slam order
      Menu.el("cl-g", letter).textContent = char;
    });
  },

  init() {
    // headline lines share one running count, so they slam in as one sentence
    let offset = 0;
    document.querySelectorAll(".lk-headline [data-cut]").forEach(el => {
      this.letters(el, offset);
      offset += el.dataset.cut.length;
    });

    document.querySelectorAll("#cut [data-cut]").forEach(el => this.letters(el));
    document.querySelectorAll("[data-star]").forEach(el => { el.innerHTML = Menu.starSVG(); });

    // The unlock button IS a Home menu item: same letters, slash bar and star
    const cta = document.querySelector(".lk-cta");
    if (cta) {
      Menu.buildItem(cta, 0);
      // the word gap gets a fixed width, whatever the font does with a space
      cta.querySelectorAll(".mi-l").forEach(letter => {
        if (!letter.textContent.trim()) letter.classList.add("mi-space");
      });
    }

    // Poking the card just gets you denied again. Web Animations run on top
    // of the CSS ones, so the entrance still replays on the next visit.
    const card = document.querySelector(".lk-card");
    if (card) card.addEventListener("click", () => {
      SFX.play("back");
      if (Menu.reducedMotion || !card.animate) return;
      const jolt = [0, -10, 9, -6, 3, 0].map(x => ({ transform: `translateX(${x}px)` }));
      card.animate(jolt, 300);
      card.querySelector(".lk-stamp").animate(
        [{ transform: "scale(2) rotate(-14deg)" }, { transform: "none" }],
        { duration: 300, easing: "cubic-bezier(.5, 0, .9, .4)" });
    });
  },
};
