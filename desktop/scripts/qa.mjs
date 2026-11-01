import { chromium } from "playwright";
import fs from "fs";

const out = "/opt/cursor/artifacts/screenshots";
fs.mkdirSync(out, { recursive: true });
const base = "http://127.0.0.1:5173";

await fetch("http://127.0.0.1:3921/api/settings", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ lang: "ar" }),
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const missing = [];
page.on("response", (r) => {
  if (r.status() === 404) missing.push(r.url());
});

await page.addInitScript(() => localStorage.removeItem("gloss-kb-ui"));
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector("[data-page='dashboard']");
await page.waitForTimeout(400);

const dir = await page.evaluate(() => document.documentElement.dir);
const counters = await page.locator(".stat bdi").allInnerTexts();
const foot = await page.locator(".side-progress bdi").innerText();
console.log("dir", dir);
console.log("counters", counters);
console.log("foot", JSON.stringify(foot));
await page.screenshot({ path: `${out}/fix-dashboard-ar-1400.png` });
await page.locator("[data-page='prompts'] span.prompts-word").screenshot({ path: `${out}/fix-prompts-word-ar.png` });

await page.click("[data-page='prompts']");
await page.waitForTimeout(250);
console.log("heading", JSON.stringify(await page.locator(".page:not(.is-stashed) .prompts-word").first().innerText()));
await page.screenshot({ path: `${out}/fix-prompts-ar-1400.png` });

await page.click("[data-page='settings']");
await page.waitForTimeout(200);
const settingsOverflow = await page.evaluate(() => {
  const active = document.querySelector(".page:not(.is-stashed)");
  const fields = [...active.querySelectorAll(".field")].map((el) => ({
    box: el.scrollWidth - el.clientWidth,
    parent: el.parentElement.scrollWidth - el.parentElement.clientWidth,
  }));
  return {
    page: active.scrollWidth - active.clientWidth,
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    fields,
  };
});
console.log("settings", JSON.stringify(settingsOverflow));
await page.screenshot({ path: `${out}/fix-settings-ar-1400.png` });

await page.setViewportSize({ width: 1024, height: 900 });
await page.click("[data-page='dashboard']");
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/fix-dashboard-ar-1024.png` });

await page.setViewportSize({ width: 1400, height: 900 });
await page.click("[data-page='library']");
await page.waitForTimeout(300);
const card = page.locator(".page:not(.is-stashed) .gcard").first();
const before = await card.boundingBox();
await card.hover();
await page.waitForTimeout(150);
const after = await card.boundingBox();
console.log("hover", JSON.stringify({ before, after }));

const listBtn = page.locator(".page:not(.is-stashed) .seg button").nth(1);
await listBtn.click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/fix-library-list-ar-1400.png` });
await page.locator(".page:not(.is-stashed) .seg button").nth(0).click();

await page.locator(".page:not(.is-stashed) .chip", { hasText: "youtube" }).click();
await page.waitForTimeout(200);
await page.locator(".page:not(.is-stashed) .gcard").first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/fix-note-yt-ar-1400.png` });
const note = page.locator(".page:not(.is-stashed)");
await note.evaluate((el) => el.scrollTo(0, 700));
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/fix-note-yt-scroll-ar-1400.png` });

const para = page.locator(".page:not(.is-stashed) .prose-read p").nth(1);
const paraCount = await page.locator(".page:not(.is-stashed) .prose-read p").count();
console.log("paras", paraCount);
if (paraCount > 1) {
  const box = await para.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 12, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + Math.min(240, box.width - 8), box.y + 12);
    await page.mouse.up();
    await page.waitForTimeout(250);
    const lens = await page.locator(".lens").count();
    console.log("lens", lens);
    if (lens) {
      await page.screenshot({ path: `${out}/fix-lens-ar-1400.png` });
      await page.locator(".lens button").first().click();
      await page.waitForTimeout(2500);
      console.log("glosses", await page.locator(".gloss").count());
      await page.screenshot({ path: `${out}/fix-gloss-ar-1400.png` });
    }
  }
}

const uniq = [...new Set(missing)];
console.log("404s", uniq.length);
for (const u of uniq) console.log("404", u);
await browser.close();
