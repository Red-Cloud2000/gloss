import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const out = process.env.SHOT_DIR || "/opt/cursor/artifacts/screenshots";
fs.mkdirSync(out, { recursive: true });
const base = process.env.APP_URL || "http://127.0.0.1:5173";
const issues = [];

const pages = ["dashboard", "library", "roadmaps", "topics", "assistant", "prompts", "ideas", "duplicates", "failed", "settings"];

async function prep(page) {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-page='dashboard']", { timeout: 20000 });
  await page.waitForTimeout(400);
}

async function setLang(page, lang) {
  const label = lang === "en" ? "EN" : "ع";
  const btn = page.locator(".lang-btn");
  const text = (await btn.innerText()).trim();
  if ((lang === "en" && text === "EN") || (lang === "ar" && text === "ع")) await btn.click();
  await page.waitForTimeout(200);
}

async function audit(page, name) {
  const report = await page.evaluate(() => {
    const active = document.querySelector(".page:not(.is-stashed)");
    const text = document.body.innerText || "";
    const offenders = [];
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") continue;
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        const cls = (el.className && String(el.className).slice(0, 80)) || el.tagName;
        if (el.classList?.contains("url-clip") || el.tagName === "PRE" || el.classList?.contains("codeblock") || el.classList?.contains("search-pop")) continue;
        if (offenders.length < 8) offenders.push(`${cls} ${el.scrollWidth - el.clientWidth}`);
      }
    }
    return {
      untitled: text.includes("بدون عنوان") || /\bUntitled\b/.test(text),
      pageOverflow: active ? active.scrollWidth - active.clientWidth : null,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      offenders,
    };
  });
  if (report.untitled || (report.pageOverflow || 0) > 2 || report.docOverflow > 2 || report.offenders.length) {
    issues.push({ name, ...report });
  }
  return report;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error") logs.push(m.text());
});
page.on("pageerror", (e) => logs.push(String(e)));

await prep(page);

for (const width of [1400, 1024]) {
  for (const lang of ["ar", "en"]) {
    await page.setViewportSize({ width, height: 900 });
    await setLang(page, lang);
    for (const id of pages) {
      await page.click(`[data-page='${id}']`);
      await page.waitForTimeout(350);
      if (id === "library") {
        const active = page.locator(".page:not(.is-stashed)");
        const listBtn = active.locator(".seg button", { hasText: lang === "ar" ? "قائمة" : "List" });
        if (await listBtn.count()) await listBtn.click();
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(out, `${id}-list-${lang}-${width}.png`) });
        await audit(page, `${id}-list-${lang}-${width}`);
        const gridBtn = active.locator(".seg button", { hasText: lang === "ar" ? "شبكة" : "Grid" });
        if (await gridBtn.count()) await gridBtn.click();
        await page.waitForTimeout(150);
      }
      if (id === "topics") await page.waitForTimeout(600);
      const file = path.join(out, `${id}-${lang}-${width}.png`);
      await page.screenshot({ path: file });
      await audit(page, `${id}-${lang}-${width}`);
    }
    await page.click("[data-page='roadmaps']");
    await page.waitForTimeout(200);
    const card = page.locator(".page:not(.is-stashed) .card-grid .gcard").first();
    if (await card.count()) {
      await card.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, `roadmap-${lang}-${width}.png`) });
      await audit(page, `roadmap-${lang}-${width}`);
      const step = page.locator(".page:not(.is-stashed) .step").first();
      if (await step.count()) {
        await step.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(out, `step-${lang}-${width}.png`) });
        await audit(page, `step-${lang}-${width}`);
      }
    }
  }
}

await page.setViewportSize({ width: 1400, height: 900 });
await setLang(page, "ar");
await page.click("[data-page='library']");
await page.waitForTimeout(300);
const first = page.locator(".page:not(.is-stashed) .card-grid .gcard").first();
if (await first.count()) {
  await first.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, "note-ar-1400.png"), fullPage: false });
  await audit(page, "note-ar-1400");
}
await page.setViewportSize({ width: 1024, height: 900 });
await page.screenshot({ path: path.join(out, "note-ar-1024.png") });
await audit(page, "note-ar-1024");
await setLang(page, "en");
await page.setViewportSize({ width: 1400, height: 900 });
await page.screenshot({ path: path.join(out, "note-en-1400.png") });
await audit(page, "note-en-1400");

await browser.close();
fs.writeFileSync(path.join(out, "issues.json"), JSON.stringify({ issues, logs: logs.slice(0, 40) }, null, 2));
console.log("shots", fs.readdirSync(out).filter((f) => f.endsWith(".png")).length);
console.log("issues", issues.length, "logs", logs.length);
if (issues.length) console.log(JSON.stringify(issues.slice(0, 12), null, 2));
if (logs.length) console.log(logs.slice(0, 15).join("\n"));
