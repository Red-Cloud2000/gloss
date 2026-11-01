import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/ours";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE", e.message));

async function boot(w, h, path) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("http://127.0.0.1:5173" + path, { waitUntil: "networkidle", timeout: 30000 });
  await page.evaluate(() => document.documentElement.classList.add("shoot"));
  await page.waitForTimeout(400);
}

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot", name);
}

await page.addInitScript(() => {
  localStorage.setItem("gloss-kb-hold", "1");
  localStorage.removeItem("gloss:v1");
});

// Landing. The pen underline starts 0.95s after paint and draws for 0.6s, so 31
// has to be taken mid-draw, not after networkidle (that misses it, or lands past it).
await page.setViewportSize({ width: 1280, height: 742 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "commit", timeout: 30000 });
await page.waitForSelector(".hero-mark");
for (let i = 0; i < 50; i++) {
  const scale = await page.evaluate(() => {
    const t = getComputedStyle(document.querySelector(".hero-mark"), "::after").transform;
    const m = t && t !== "none" ? t.match(/matrix\(([^)]+)\)/) : null;
    return m ? parseFloat(m[1].split(",")[0]) : 0;
  });
  if (scale >= 0.4 && scale <= 0.72) break;
  await page.waitForTimeout(30);
}
await page.evaluate(() => document.documentElement.classList.add("shoot"));
await shot("31-landing-underline-drawing");
await page.waitForTimeout(1200);
await shot("01-landing");
await page.getByRole("button", { name: /paste text/i }).click();
await page.waitForTimeout(300);
await shot("32-paste-text-dialog");
await page.keyboard.press("Escape");

await boot(1920, 1114, "/");
await page.waitForTimeout(900);
await shot("01-landing-1920");

await boot(1280, 742, "/library");
await page.waitForTimeout(600);
await shot("29-shelf-view-fullres");
await shot("03-library-shelf");

const spine = page.locator("[data-book]").first();
await spine.hover();
await page.waitForTimeout(450);
await shot("04-book-hover");

await spine.click();
await page.waitForTimeout(120);
await shot("05-book-opening-a");
// Cover starts at 700ms and swings for 780ms. Half-open is ~1060ms; the light page and dark spine settle at ~1500ms.
await page.waitForTimeout(940);
await shot("06-reader-opened");
await page.waitForTimeout(460);
await shot("07-book-open-settled");
await page.waitForTimeout(380);
await shot("07-book-open-settled2");
await page.waitForTimeout(400);
await shot("08-book-open-final");

await page.getByRole("button", { name: /start reading/i }).click();
await page.waitForTimeout(700);
await shot("10-reader-top");

await page.mouse.wheel(0, 700);
await page.waitForTimeout(400);
await shot("11-reader-scrolled");

// Select a paragraph that is on screen. The lens reads selectionchange.
const selected = await page.evaluate(() => {
  const blocks = [...document.querySelectorAll(".prose-read .blk[data-type='p'] .blk-text")];
  const el = blocks.find((b) => {
    const r = b.getBoundingClientRect();
    return r.top > 120 && r.bottom < window.innerHeight - 40;
  });
  if (!el) return false;
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
});
console.log("selected", selected);
await page.waitForTimeout(500);
await shot("12-select-text-toolbar");

const lensAsk = page.locator("button").filter({ hasText: /^Ask$/ });
if (await lensAsk.count()) {
  await lensAsk.first().click();
  await page.waitForTimeout(350);
  await shot("13-ask-popover");
  const chip = page.getByRole("button", { name: /why does it matter/i });
  if (await chip.count()) {
    await chip.click();
    await page.waitForTimeout(1500);
    await shot("14-answer-in-margin");
  }
} else console.log("no lens ask");

await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(200);
const glossBtn = page.getByRole("button", { name: /gloss this text/i });
if (await glossBtn.count()) {
  await glossBtn.click();
  await page.waitForTimeout(800);
  await shot("20-gloss-this-text-expanded");
}

await page.locator("button", { hasText: "Aa" }).click();
await page.waitForTimeout(250);
await shot("15-settings-look");
await page.locator("button", { hasText: /^Text$/ }).click();
await page.waitForTimeout(200);
await shot("16-settings-text");
await page.locator("button", { hasText: /^Answers$/ }).click();
await page.waitForTimeout(200);
await shot("17-settings-answers");
await page.locator("button", { hasText: /^Look$/ }).click();
await page.getByRole("button", { name: "Night" }).click();
await page.waitForTimeout(400);
await shot("18-theme-night");
await page.getByRole("button", { name: "Sepia" }).click();
await page.waitForTimeout(400);
await shot("19-theme-sepia");
await page.getByRole("button", { name: "Paper" }).click();
await page.keyboard.press("Escape");

await page.getByRole("button", { name: "Notebook", exact: true }).click();
await page.waitForTimeout(300);
await shot("21-notebook-drawer");
await page.keyboard.press("Escape");

await page.keyboard.press("?");
await page.waitForTimeout(300);
await shot("22-keyboard-shortcuts");
await page.keyboard.press("Escape");

await page.getByRole("button", { name: /together api key/i }).click();
await page.waitForTimeout(250);
await shot("23-api-key-popover");
await page.keyboard.press("Escape");

await page.keyboard.press("f");
await page.waitForTimeout(400);
await shot("24-reader-focus-mode");
await page.keyboard.press("f");

// The live library shots 25-30 are Sepia, at the same 1280×742 content size.
await page.addInitScript(() => {
  const s = JSON.parse(localStorage.getItem("gloss:settings") || "{}");
  s.theme = "sepia";
  localStorage.setItem("gloss:settings", JSON.stringify(s));
});
await boot(1280, 742, "/library");
await shot("29-shelf-view-fullres");
await page.getByRole("radio", { name: "Topics" }).click();
await page.waitForTimeout(500);
await shot("25-library-topics-view");
await page.getByRole("button", { name: /Science/ }).first().click();
await page.waitForTimeout(400);
await shot("26-topic-detail-science");

await boot(1280, 742, "/library");
await page.evaluate(() => document.documentElement.classList.add("shoot"));
await page.getByRole("button", { name: /add articles/i }).click();
await page.waitForTimeout(300);
await shot("27-add-articles-connect-agent");
await page.getByText("Save links manually").click();
await page.waitForTimeout(250);
await shot("28-add-articles-save-links");
await page.keyboard.press("Escape");

await page.getByPlaceholder(/search the library/i).fill("chalk");
await page.waitForTimeout(400);
await shot("30-library-search");

// Wide shelf for the 1920 reference.
await boot(1920, 1114, "/library");
await page.waitForTimeout(500);
await shot("03-library-shelf-1920");
await page.locator("[data-book]").first().hover();
await page.waitForTimeout(400);
await shot("04-book-hover-1920");
await page.locator("[data-book]").first().click();
await page.waitForTimeout(1600);
await shot("08-book-open-final-1920");

await browser.close();
console.log("done");
