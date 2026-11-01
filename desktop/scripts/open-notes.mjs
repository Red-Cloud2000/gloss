import { chromium } from "playwright";

const out = "/opt/cursor/artifacts/screenshots";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const missing = [];
page.on("response", (r) => { if (r.status() === 404) missing.push(r.url()); });
await page.addInitScript(() => localStorage.setItem("gloss-kb-ui", JSON.stringify({ lang: "ar", theme: "paper" })));
await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await page.waitForSelector("[data-page='dashboard']");

async function openQuery(q, file) {
  await page.click("[data-page='library']");
  await page.waitForTimeout(200);
  const input = page.locator(".page:not(.is-stashed) input.field").first();
  await input.fill("");
  await input.fill(q);
  await page.waitForTimeout(250);
  const card = page.locator(".page:not(.is-stashed) .gcard").first();
  if (!(await card.count())) {
    console.log("no card", q);
    return;
  }
  await card.click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${file}` });
  const url = await page.locator(".page:not(.is-stashed) .url-clip").innerText().catch(() => "");
  const title = await page.locator(".page:not(.is-stashed) .note-title").innerText().catch(() => "");
  console.log(q, "=>", JSON.stringify(title), JSON.stringify(url.slice(0, 90)));
}

await openQuery("Software testing", "note-web-ar-1400.png");
const para = page.locator(".page:not(.is-stashed) .prose-read p").nth(1);
await para.scrollIntoViewIfNeeded();
const box = await para.boundingBox();
if (box) {
  await page.mouse.move(box.x + 16, box.y + 14);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(280, box.width - 10), box.y + 14);
  await page.mouse.up();
  await page.waitForTimeout(300);
  console.log("lens", await page.locator(".lens").count());
  if (await page.locator(".lens").count()) {
    await page.screenshot({ path: `${out}/fix-lens-ar-1400.png` });
    await page.locator(".lens button").first().click();
    await page.waitForTimeout(2000);
    console.log("glosses", await page.locator(".gloss").count());
    await page.screenshot({ path: `${out}/fix-gloss-ar-1400.png` });
  }
}

await openQuery("Nutlope", "note-github-ar-1400.png");
await openQuery("Me at the zoo", "note-youtube-ar-1400.png");
await openQuery("twttr", "note-x-ar-1400.png");
await openQuery("Trace-based", "note-pdf-ar-1400.png");
await page.locator(".page:not(.is-stashed)").evaluate((el) => el.scrollTo(0, 500)).catch(() => {});
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/note-pdf-scroll-ar-1400.png` });
await openQuery("Wikipedia", "note-facebook-ar-1400.png");

console.log("404", [...new Set(missing)].slice(0, 12));
await browser.close();
