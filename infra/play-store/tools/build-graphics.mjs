// Renders every raster icon RsvpVault ships, from one source:
//
//   web/public/icons/icon-{192,512}.png       PWA "any" icons (rounded tile)
//   web/public/icons/maskable-{192,512}.png   PWA maskable icons (full bleed, art in the safe zone)
//   infra/play-store/graphics/icon-512.png    Play hi-res icon (full bleed; Play applies its own mask)
//   infra/play-store/graphics/feature-graphic.png  1024 x 500 Play feature graphic
//
// The art is the site favicon's emoji (💌, web/src/app/icon.svg) — but drawn
// from Google's Noto Emoji SVG (tools/envelope-noto.svg, Apache License 2.0,
// github.com/googlefonts/noto-emoji) rather than whatever emoji font the build
// machine has. A system emoji glyph (Segoe UI Emoji, Apple Color Emoji) is the
// OS vendor's artwork and not ours to put in a store listing.
//
// Rendered with headless Chromium (Playwright) so the feature graphic's text
// uses the same Inter face as the website.
//
//   cd infra/play-store/tools && npm install && npm run graphics
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const ENVELOPE = readFileSync(here("./envelope-noto.svg"), "utf8").replace(/<\?xml[^>]*\?>|<!--[\s\S]*?-->/g, "");
const WEB_ICONS = here("../../../web/public/icons/");
const PLAY = here("../graphics/");
mkdirSync(WEB_ICONS, { recursive: true });
mkdirSync(PLAY, { recursive: true });

// Brand gold — the "Vault" half of the wordmark (components/Wordmark.tsx).
const BG = "linear-gradient(145deg, #dcb57a 0%, #b98d4f 55%, #9a733c 100%)";

function tile({ size, artScale, radius }) {
  return `<!doctype html><html><head><style>
    html,body{margin:0;background:transparent}
    .t{width:${size}px;height:${size}px;border-radius:${radius}px;background:${BG};
       display:flex;align-items:center;justify-content:center;overflow:hidden}
    .t svg{width:${Math.round(size * artScale)}px;height:auto;filter:drop-shadow(0 ${size * 0.012}px ${size * 0.02}px rgba(60,40,10,.35))}
  </style></head><body><div class="t">${ENVELOPE}</div></body></html>`;
}

const FEATURE = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  html,body{margin:0}
  .f{width:1024px;height:500px;position:relative;overflow:hidden;font-family:Inter,sans-serif;
     background:radial-gradient(60% 80% at 0% 0%, #a7f3d0 0%, transparent 70%),
                radial-gradient(55% 75% at 100% 10%, #fde68a 0%, transparent 70%),#fafafa;
     display:flex;align-items:center;gap:56px;padding:0 72px;box-sizing:border-box}
  .icon{flex:none;width:250px;height:250px;border-radius:56px;background:${BG};display:flex;align-items:center;justify-content:center;
        box-shadow:0 24px 48px -16px rgba(120,80,20,.45)}
  .icon svg{width:180px;height:auto}
  h1{margin:0;font-size:84px;font-weight:800;letter-spacing:-2px;color:#18181b}
  h1 span{color:#b98d4f}
  p{margin:14px 0 0;font-size:34px;font-weight:500;line-height:1.25;color:#3f3f46}
  small{display:block;margin-top:22px;font:500 20px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:3px;color:#71717a}
</style></head><body><div class="f">
  <div class="icon">${ENVELOPE}</div>
  <div><h1>Rsvp<span>Vault</span></h1><p>Digital invitations.<br>Every RSVP in one place.</p><small>BY 3PANDALABS</small></div>
</div></body></html>`;

const jobs = [
  // Rounded "any" tile: transparent corners, art at ~70% so it reads at 48dp.
  { out: WEB_ICONS + "icon-192.png", size: 192, html: tile({ size: 192, artScale: 0.72, radius: 42 }) },
  { out: WEB_ICONS + "icon-512.png", size: 512, html: tile({ size: 512, artScale: 0.72, radius: 112 }) },
  // Maskable: full bleed, art inside the 80%-diameter safe circle (the
  // envelope's diagonal is ~1.2x its width, so 0.56 keeps it at ~0.67).
  { out: WEB_ICONS + "maskable-192.png", size: 192, html: tile({ size: 192, artScale: 0.56, radius: 0 }) },
  { out: WEB_ICONS + "maskable-512.png", size: 512, html: tile({ size: 512, artScale: 0.56, radius: 0 }) },
  // Play icon: full-bleed square, no transparency (Play rejects alpha) — Play
  // rounds the corners itself.
  { out: PLAY + "icon-512.png", size: 512, html: tile({ size: 512, artScale: 0.66, radius: 0 }), opaque: true },
  { out: PLAY + "feature-graphic.png", w: 1024, h: 500, html: FEATURE, opaque: true },
];

const browser = await chromium.launch();
for (const j of jobs) {
  const w = j.w ?? j.size;
  const h = j.h ?? j.size;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(j.html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: j.out, omitBackground: !j.opaque, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  console.log(`${w}x${h}  ${j.out}`);
}
await browser.close();
