/* =====================================================================
   CONFIG — the only file you need to edit to swap audio or page media.

   Paths are relative to your web root. With Vite, public/ IS the root,
   so "audio/bgm1.mp3" means the file public/audio/bgm1.mp3.
   (If you serve the project folder with a plain static server, the app
   also tries the same path inside public/ automatically.)
   File names are CASE-SENSITIVE once deployed: BGM1.mp3 ≠ bgm1.mp3.
   ===================================================================== */

const AUDIO_CONFIG = {

  // Background music, played in this order. Add one line per file.
  // "title" is what the PLAYLIST drawer shows.
  bgm: [
    { title: "BGM 1", src: "public/audio/Last Surprise.mp3" },
    { title: "BGM 2", src: "public/audio/Mass Destruction -Reload-.mp3" },
    { title: "BGM 3", src: "public/audio/Persona 3 Reload - It's Going Down Now (with Lyrics).mp3" },
  ],

  // UI sounds. A missing file is replaced by a synthesized click.
  sfx: {
    hover: "public/sfx/select.mp3",
    confirm: "public/sfx/select.mp3",
    back: "audio/back.mp3",
  },

  autoStartMusic: true,   // start music when the visitor passes the boot screen
  musicVolume: 0.3,       // 0 to 1
  sfxVolume: 0.5,         // 0 to 1
};

/* One independent background per page.
   Supported: .mp4 .webm (video) · .gif · .webp .png .jpg .jpeg .avif (image)
   Change the file name AND extension to whatever you actually use.
   An array is also allowed: the first file that loads wins, e.g.
     projects: ["media/projects.webm", "media/projects.jpg"],
   If a page's file is missing, the home media is shown instead. */

/*======================HERO BACKGROUD MOBILE SETTING ====================*/
// const PAGE_MEDIA = {
//   home: ["media/home.mp4", "video/hero-bg.mp4", "video/hero-bg.gif"],
//   projects: "media/projects.gif",
//   skills: "media/skills.mp4",
//   about: "media/about.webp",
//   certificates: "media/certificates.jpg",
//   contact: "media/yandere-chan-joker-moewalls-com.mp4",
// };
const DESKTOP_MEDIA = {
  home: ["media/hero-bg.mp4", "media/hero-bg.gif"],
  projects: "media/AnnTakamaki.mp4",
  skills: "media/skills.mp4",
  about: "media/ryuji-sakamoto.mp4",
  certificates: "media/kasumi-yoshizawa.mp4",
  contact: "media/yandere-chan-joker-moewalls-com.mp4",
};

const MOBILE_MEDIA = {
  home: ["media/joker.mp4", "media/home-mobile.gif"],
  projects: "media/AnnTakamaki.mp4",
  skills: "media/skills.mp4",
  about: "media/ryuji-sakamoto.mp4",
  certificates: "media/kasumi-yoshizawa.mp4",
  contact: "media/yandere-chan-joker-moewalls-com.mp4",
};

const customStyle = document.createElement("style");
customStyle.textContent = `
  /* Pengaturan umum untuk semua ukuran layar */
  video[src*="AnnTakamaki.mp4"] {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
  }

  /* KHUSUS DESKTOP (Layar >= 769px) */
  @media (min-width: 769px) {
    video[src*="AnnTakamaki.mp4"] {
      margin-right: 30px !important;
      margin-left: -580px !important;
      object-position: 80% center !important;
    }
  }

  /* KHUSUS MOBILE (Layar <= 768px) */
  @media (max-width: 768px) {
    video[src*="AnnTakamaki.mp4"] {
      margin: 0 !important; /* Wajib di-reset agar video kembali ke dalam layar HP */
      object-position: 60% center !important; 
    }
  }
`;
document.head.appendChild(customStyle);

const PAGE_MEDIA = new Proxy(DESKTOP_MEDIA, {
  get(target, prop) {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && prop in MOBILE_MEDIA && MOBILE_MEDIA[prop]) {
      return MOBILE_MEDIA[prop];
    }
    return target[prop];
  },
});

/* Turns a configured path into the URLs worth trying, in order. */
function assetCandidates(path) {
  if (/^(https?:|data:|blob:)/i.test(path)) return [path];
  const clean = path.replace(/^(\.?\/)+/, "").replace(/^public\//, "");
  // relative URLs also work when the site lives in a sub-folder (GitHub Pages)
  return [clean, "public/" + clean].map(encodeURI);
}
