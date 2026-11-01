/**
 * Loads the sample catalog and checks the promises the UI depends on:
 * every note has a showable title, derived files may be missing, raw is untouched.
 */

const path = require("path");
const { loadCatalog } = require("./catalog.cjs");
const { displayTitle, normalizeUrl, platformOf, linkId } = require("../shared/format.cjs");

const root = process.env.KB_DATA || path.join(__dirname, "..", "..", "vendor-sample", "sample", "data");

(async () => {
  const cat = await loadCatalog(root, path.join(__dirname, "..", ".user-data", "added"));
  const problems = [];
  if (cat.items.size < 200) problems.push(`expected sample items, got ${cat.items.size}`);
  if (cat.failed.size < 20) problems.push(`expected failed records, got ${cat.failed.size}`);
  if (!cat.roadmaps.length) problems.push("roadmaps missing");
  if (!cat.topicMap.nodes.length) problems.push("topic map missing");
  let hidden = 0;
  for (const it of cat.items.values()) {
    for (const lang of ["ar", "en"]) {
      const t = displayTitle(it, lang);
      if (!t || t === "بدون عنوان" || t.toLowerCase() === "untitled") {
        problems.push(`bad title ${it.id} ${lang}: ${t}`);
        break;
      }
    }
    if (!it.original_url) problems.push(`no url ${it.id}`);
  }
  for (const f of cat.failed.values()) {
    if (f.reason === "skipped: personal/transactional link") hidden++;
  }
  if (hidden) problems.push("personal links leaked into failed list");
  const norm = normalizeUrl("https://www.youtube.com/shorts/abcdefghijk?utm_source=x");
  if (platformOf(norm) !== "youtube") problems.push("youtube platform");
  if (!norm.includes("watch?v=abcdefghijk")) problems.push("youtube normalize " + norm);
  if (linkId(norm).length !== 12) problems.push("id length");
  const li = normalizeUrl("https://www.linkedin.com/posts/example?trk=public");
  if (li.includes("trk=")) problems.push("linkedin tracking kept");
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`ok items=${cat.items.size} failed=${cat.failed.size} roadmaps=${cat.roadmaps.length} prompts=${cat.prompts.length} nodes=${cat.topicMap.nodes.length} loadMs=${cat.loadMs}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
