// Captioned versions of the raw screenshots, for the Play listing: a
// 1080 x 1920 (9:16) canvas in the brand's soft emerald/amber wash, a caption
// on top, the screenshot below with rounded corners. Play accepts either the
// raw or the framed set — both are exactly 1080 x 1920.
//
//   cd infra/play-store/tools && npm install && npm run frame
//   in:  ../screenshots/raw/*.png  +  ../screenshots/captions.json
//   out: ../screenshots/framed/<same name>.png
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const RAW = here("../screenshots/raw/");
const OUT = here("../screenshots/framed/");
const captions = JSON.parse(readFileSync(here("../screenshots/captions.json"), "utf8"));
const files = existsSync(RAW) ? readdirSync(RAW).filter((f) => f.endsWith(".png")).sort() : [];
if (!files.length) throw new Error("No PNGs in screenshots/raw/ — run `npm run screenshots` first.");
mkdirSync(OUT, { recursive: true });

const html = (img, caption) => `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap" rel="stylesheet">
<style>
  html,body{margin:0}
  .c{width:1080px;height:1920px;box-sizing:border-box;padding:0 110px;overflow:hidden;font-family:Inter,sans-serif;
     background:radial-gradient(70% 40% at 0% 0%, #a7f3d0 0%, transparent 70%),
                radial-gradient(60% 35% at 100% 5%, #fde68a 0%, transparent 70%),#fafafa}
  h1{height:400px;margin:0;display:flex;align-items:center;justify-content:center;text-align:center;
     font-size:72px;line-height:1.15;font-weight:700;letter-spacing:-1.5px;color:#18181b}
  img{display:block;width:860px;border-radius:48px;box-shadow:0 30px 70px -20px rgba(24,24,27,.35);outline:2px solid rgba(24,24,27,.08)}
</style></head><body><div class="c"><h1>${caption}</h1><img src="data:image/png;base64,${img}"></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
for (const f of files) {
  const caption = captions[f] ?? f.replace(/^\d+-|\.png$/g, "").replace(/-/g, " ");
  await page.setContent(html(readFileSync(RAW + f).toString("base64"), caption), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT + f });
  console.log(`framed ${f}  "${caption}"`);
}
await browser.close();
