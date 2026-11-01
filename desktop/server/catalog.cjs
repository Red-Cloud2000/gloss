/**
 * Reads a data root (sample or the full ~7,300-link set) plus links the app
 * itself has added. Corpus files are never written.
 */

const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function listJson(dir) {
  try {
    const names = await fs.readdir(dir);
    return names.filter((n) => n.endsWith(".json")).map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function slim(it) {
  return {
    id: it.id,
    title: it.title || "",
    title_ar: it.title_ar || "",
    title_en: it.title_en || "",
    author: it.author || "",
    platform: it.platform || "web",
    content_type: it.content_type || "other",
    language: it.language || "",
    one_line: it.one_line || "",
    one_line_en: it.one_line_en || "",
    value_rating: Number(it.value_rating) || 0,
    tags: Array.isArray(it.tags) ? it.tags : [],
    date_saved: it.date_saved || "",
    post_date: it.post_date ?? null,
    thumbnail: it.thumbnail || null,
    original_url: it.original_url || "",
    difficulty: it.difficulty || "",
    testing_relevance: it.testing_relevance || null,
    work_relevance: it.work_relevance || null,
    has_quick_try: Boolean(it.has_quick_try),
    try_this: Array.isArray(it.try_this) ? it.try_this : [],
    time_sensitivity: it.time_sensitivity || "",
    is_promotional: Boolean(it.is_promotional),
    origin: it._origin || "corpus",
    subtopic: it.subtopic || "",
    core_idea: it.core_idea || "",
    core_idea_ar: it.core_idea_ar || "",
    key_points: Array.isArray(it.key_points) ? it.key_points.slice(0, 4) : [],
  };
}

function fileExists(root, rel) {
  const abs = safeFile(root, rel);
  return Boolean(abs && fsSync.existsSync(abs));
}

async function loadItems(dir, origin, root) {
  const files = await listJson(dir);
  const rows = await mapPool(files, 32, async (file) => {
    const item = await readJson(file, null);
    if (!item || !item.id || item.status === "failed") return null;
    item._origin = origin;
    if (root && item.thumbnail && !fileExists(root, item.thumbnail)) item.thumbnail = null;
    if (root && Array.isArray(item.media_files)) {
      item.media_files = item.media_files.filter((rel) => fileExists(root, rel));
    }
    return item;
  });
  return rows.filter(Boolean);
}

async function loadFailed(dir) {
  const files = await listJson(dir);
  const rows = await mapPool(files, 32, async (file) => readJson(file, null));
  return rows.filter((r) => r && r.id && r.reason !== "skipped: personal/transactional link");
}

/**
 * @param {string} dataRoot corpus root (contains kb/, thumbs/, app/)
 * @param {string} addedRoot app-owned root, same layout, may be missing
 */
async function loadCatalog(dataRoot, addedRoot) {
  const t0 = Date.now();
  const [corpusItems, addedItems, corpusFailed, addedFailed] = await Promise.all([
    loadItems(path.join(dataRoot, "kb", "items"), "corpus", dataRoot),
    loadItems(path.join(addedRoot, "kb", "items"), "added", addedRoot),
    loadFailed(path.join(dataRoot, "kb", "failed")),
    loadFailed(path.join(addedRoot, "kb", "failed")),
  ]);

  const items = new Map();
  for (const it of corpusItems) items.set(it.id, it);
  for (const it of addedItems) items.set(it.id, it);

  const failed = new Map();
  for (const f of corpusFailed) if (!items.has(f.id)) failed.set(f.id, f);
  for (const f of addedFailed) if (!items.has(f.id)) failed.set(f.id, f);

  const appDir = path.join(dataRoot, "app");
  const [roadmaps, topicMap, quizzes, prompts, duplicates, outdated, embeddingsMeta] = await Promise.all([
    readJson(path.join(appDir, "roadmaps.json"), []),
    readJson(path.join(appDir, "topic_map.json"), { nodes: [], edges: [] }),
    readJson(path.join(appDir, "quizzes.json"), {}),
    readJson(path.join(appDir, "prompts_library.json"), []),
    readJson(path.join(appDir, "duplicates.json"), []),
    readJson(path.join(appDir, "outdated.json"), []),
    readJson(path.join(appDir, "embeddings_meta.json"), null),
  ]);

  const byPlatform = {};
  for (const it of items.values()) {
    const p = it.platform || "web";
    byPlatform[p] = (byPlatform[p] || 0) + 1;
  }

  return {
    dataRoot,
    addedRoot,
    items,
    failed,
    roadmaps: Array.isArray(roadmaps) ? roadmaps : [],
    topicMap: topicMap && Array.isArray(topicMap.nodes) ? topicMap : { nodes: [], edges: [] },
    quizzes: quizzes && typeof quizzes === "object" ? quizzes : {},
    prompts: Array.isArray(prompts) ? prompts : [],
    duplicates: Array.isArray(duplicates) ? duplicates : [],
    outdated: Array.isArray(outdated) ? outdated : [],
    embeddingsMeta,
    loadedAt: Date.now(),
    loadMs: Date.now() - t0,
    byPlatform,
  };
}

function rawFile(cat, item) {
  const root = item._origin === "added" ? cat.addedRoot : cat.dataRoot;
  const rel = item.raw_file || path.join("kb", "raw", `${item.id}.json`);
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(path.resolve(root))) return null;
  return abs;
}

function mediaRootFor(cat, origin) {
  return origin === "added" ? cat.addedRoot : cat.dataRoot;
}

/** Resolve a stored relative path and refuse anything that escapes its root. */
function safeFile(root, rel) {
  if (!rel || typeof rel !== "string") return null;
  const cleaned = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (cleaned.includes("..")) return null;
  const abs = path.resolve(root, cleaned);
  const base = path.resolve(root);
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return abs;
}

function bootstrap(cat, user) {
  return {
    loadMs: cat.loadMs,
    dataRoot: cat.dataRoot,
    counts: {
      items: cat.items.size,
      failed: cat.failed.size,
      roadmaps: cat.roadmaps.length,
      prompts: cat.prompts.length,
      byPlatform: cat.byPlatform,
    },
    items: [...cat.items.values()].map(slim),
    failed: [...cat.failed.values()].map((f) => ({
      id: f.id,
      url: f.url || "",
      platform: f.platform || f.site || "",
      reason: f.reason || "other fetch error",
      error: f.error || "",
      needs_login: Boolean(f.needs_login),
      date_saved: f.date_saved || "",
      failed_at: f.failed_at || "",
      stage: f.stage || "",
    })),
    roadmaps: cat.roadmaps,
    topicMap: cat.topicMap,
    quizzes: cat.quizzes,
    prompts: cat.prompts,
    duplicates: cat.duplicates,
    outdated: cat.outdated,
    user,
  };
}

module.exports = { loadCatalog, rawFile, safeFile, mediaRootFor, bootstrap, slim };
