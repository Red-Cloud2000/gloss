import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/ours";
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:5173";

const browser = await chromium.launch({ headless: true });

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot", name);
}

function holdScript() {
  localStorage.setItem("gloss-kb-hold", "1");
  localStorage.removeItem("gloss:v1");
  localStorage.setItem("gloss:nudge", JSON.stringify({ n: 1, last: Date.now() }));
}

// --- 31: underline mid-draw. The pen starts at 0.95s and runs for 0.6s. ---
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 742 }, deviceScaleFactor: 1 });
  await page.addInitScript(holdScript);
  await page.goto(BASE + "/", { waitUntil: "commit", timeout: 30000 });
  await page.waitForSelector(".hero-mark");
  let scale = 0;
  for (let i = 0; i < 50; i++) {
    scale = await page.evaluate(() => {
      const t = getComputedStyle(document.querySelector(".hero-mark"), "::after").transform;
      const m = t && t !== "none" ? t.match(/matrix\(([^)]+)\)/) : null;
      return m ? parseFloat(m[1].split(",")[0]) : 0;
    });
    if (scale >= 0.4 && scale <= 0.72) break;
    await page.waitForTimeout(30);
  }
  await page.evaluate(() => document.documentElement.classList.add("shoot"));
  console.log("underline scaleX", scale.toFixed(2));
  await shot(page, "31-landing-underline-drawing");
  await page.close();
}

// --- 06 half-open cover, 07 light page with the dark spine. 1920 content. ---
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1113 }, deviceScaleFactor: 1 });
  await page.addInitScript(holdScript);
  await page.goto(BASE + "/library", { waitUntil: "networkidle", timeout: 30000 });
  await page.evaluate(() => document.documentElement.classList.add("shoot"));
  await page.locator("[data-book]").filter({ hasText: "Chalk" }).first().click();
  await page.waitForFunction(() => document.querySelector(".ob-cover")?.getAnimations().length);
  // Cover delay 700ms, swing 780ms. 1060ms is the half-open cover; 1480ms is the open page.
  await page.evaluate(() => {
    const anim = document.querySelector(".ob-cover").getAnimations()[0];
    anim.pause();
    anim.currentTime = 1060;
  });
  await page.waitForTimeout(40);
  await shot(page, "06-reader-opened");
  await page.evaluate(() => {
    const anim = document.querySelector(".ob-cover").getAnimations()[0];
    anim.currentTime = 1480;
  });
  await page.waitForTimeout(40);
  await shot(page, "07-book-open-settled");
  await page.waitForTimeout(420);
  await shot(page, "07-book-open-settled2");
  await page.close();
}

// --- Reader: expanded gloss, then 18-24 with the toast already dismissed. ---
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 742 }, deviceScaleFactor: 1 });
  await page.addInitScript(holdScript);
  await page.goto(BASE + "/read/on-a-piece-of-chalk", { waitUntil: "networkidle", timeout: 30000 });
  await page.evaluate(() => document.documentElement.classList.add("shoot"));
  await page.waitForTimeout(400);

  // A question, so the notebook badge matches the live reader, then the gloss.
  await page.evaluate(() => {
    const blocks = [...document.querySelectorAll(".prose-read .blk[data-type='p'] .blk-text")];
    const el = blocks.find((b) => {
      const r = b.getBoundingClientRect();
      return r.top > 80 && r.bottom < window.innerHeight - 40;
    });
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.waitForTimeout(400);
  const lensAsk = page.locator("button").filter({ hasText: /^Ask$/ });
  if (await lensAsk.count()) {
    await lensAsk.first().click();
    const chip = page.getByRole("button", { name: /why does it matter/i });
    if (await chip.count()) {
      await chip.click();
      await page.waitForTimeout(1200);
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  const glossBtn = page.getByRole("button", { name: /gloss this text/i });
  await glossBtn.click();
  await page.getByRole("heading", { name: "Key claims" }).waitFor({ timeout: 8000 });
  await page.getByRole("heading", { name: "Map" }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const keep = [...document.querySelectorAll("h3")].find((h) => (h.textContent || "").includes("Keep in mind"));
    if (!keep) return;
    const bottom = keep.getBoundingClientRect().bottom;
    window.scrollBy(0, bottom - (window.innerHeight - 36));
  });
  await page.waitForTimeout(250);
  const toast = await page.getByText("Kept in this browser").count();
  console.log("toast during 20", toast);
  await shot(page, "20-gloss-this-text-expanded");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("button", { hasText: "Aa" }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Night" }).click();
  await page.waitForTimeout(350);
  await shot(page, "18-theme-night");
  await page.getByRole("button", { name: "Sepia" }).click();
  await page.waitForTimeout(350);
  await shot(page, "19-theme-sepia");
  await page.getByRole("button", { name: "Paper" }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await page.waitForTimeout(300);
  await shot(page, "21-notebook-drawer");
  await page.keyboard.press("Escape");

  await page.keyboard.press("?");
  await page.waitForTimeout(300);
  await shot(page, "22-keyboard-shortcuts");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /together api key/i }).click();
  await page.waitForTimeout(250);
  await shot(page, "23-api-key-popover");
  await page.keyboard.press("Escape");

  await page.keyboard.press("f");
  await page.waitForTimeout(400);
  await shot(page, "24-reader-focus-mode");
  await page.close();
}

// --- 25-30 in Sepia, same content size as the live window. ---
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 742 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    localStorage.setItem("gloss-kb-hold", "1");
    localStorage.removeItem("gloss:v1");
    localStorage.setItem("gloss:nudge", JSON.stringify({ n: 1, last: Date.now() }));
    localStorage.setItem("gloss:settings", JSON.stringify({ theme: "sepia" }));
  });
  await page.goto(BASE + "/library", { waitUntil: "networkidle", timeout: 30000 });
  await page.evaluate(() => document.documentElement.classList.add("shoot"));
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  console.log("sepia theme", theme);
  await page.waitForTimeout(400);
  await shot(page, "29-shelf-view-fullres");

  await page.getByRole("radio", { name: "Topics" }).click();
  await page.waitForTimeout(500);
  await shot(page, "25-library-topics-view");
  await page.getByRole("button", { name: /Science/ }).first().click();
  await page.waitForTimeout(400);
  await shot(page, "26-topic-detail-science");

  await page.goto(BASE + "/library", { waitUntil: "networkidle", timeout: 30000 });
  await page.evaluate(() => document.documentElement.classList.add("shoot"));
  await page.getByRole("button", { name: /add articles/i }).click();
  await page.waitForTimeout(300);
  await shot(page, "27-add-articles-connect-agent");
  await page.getByText("Save links manually").click();
  await page.waitForTimeout(250);
  await shot(page, "28-add-articles-save-links");
  await page.keyboard.press("Escape");

  await page.getByPlaceholder(/search the library/i).fill("chalk");
  await page.waitForTimeout(400);
  await shot(page, "30-library-search");
  await page.close();
}

// --- Corpus shelf, second launch: no outlines, no confetti, mixed cloth. ---
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    localStorage.removeItem("gloss-kb-hold");
    localStorage.setItem("gloss:nudge", JSON.stringify({ n: 1, last: Date.now() }));
  });
  await page.goto(BASE + "/library", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll("[data-book]").length > 40, null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("[data-book]").length > 40, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.documentElement.classList.add("shoot"));
  const info = await page.evaluate(() => {
    const colors = new Set([...document.querySelectorAll(".spine")].map((el) => getComputedStyle(el).backgroundColor));
    return {
      fresh: document.querySelectorAll("[data-fresh]").length,
      arrivals: document.body.innerText.includes("Adding to your library"),
      books: document.querySelectorAll("[data-book]").length,
      colors: colors.size,
      theme: document.documentElement.dataset.theme,
    };
  });
  console.log("shelf", JSON.stringify(info));
  await shot(page, "corpus-shelf");
  await page.close();
}

// --- LinkedIn byline must not be the fetch clock. KB card uses the Arabic summary. ---
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(BASE + "/read/b4f459d7eef8", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("h1");
  await page.waitForTimeout(800);
  const byline = await page.locator("header p").first().innerText();
  console.log("linkedin byline", JSON.stringify(byline));
  await page.screenshot({ path: "/opt/cursor/artifacts/kb/linkedin-reader.png" });
  await page.goto(BASE + "/read/21ba6fa93144", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("h1");
  await page.getByRole("heading", { name: "Key claims" }).waitFor({ timeout: 8000 });
  const card = await page.locator("[aria-label='Gloss']").innerText();
  console.log("kb card", card.slice(0, 240).replace(/\n/g, " | "));
  const published = await page.locator("header p").first().innerText();
  console.log("kb byline", JSON.stringify(published));
  await page.screenshot({ path: "/tmp/ours/kb-gloss-card.png" });
  await page.close();
}

await browser.close();
console.log("done");
