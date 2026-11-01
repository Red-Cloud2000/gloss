/**
 * Turns one URL into an item + raw record in the app-owned store.
 * Summaries use OpenRouter qwen/qwen3.7-flash (glm-5.3-flash if Qwen fails).
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { fetchLink, which } = require("./fetchers.cjs");
const { spawn } = require("child_process");
const { linkId, normalizeUrl, platformOf, cairoNow, displayTitle } = require("../shared/format.cjs");

const QWEN = "qwen/qwen3.7-flash";
const GLM = "z-ai/glm-5.3-flash";

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    title_ar: { type: "string" },
    author: { type: "string" },
    content_type: { type: "string", enum: ["video", "short_video", "carousel", "image", "text_post", "article", "pdf", "thread", "repo", "tool_page", "other"] },
    language: { type: "string" },
    one_line: { type: "string" },
    detailed_summary: { type: "string" },
    key_points: { type: "array", items: { type: "string" } },
    tools_mentioned: { type: "array", items: { type: "object", properties: { name: { type: "string" }, url: { type: "string" }, used_for: { type: "string" }, version: { type: "string" } }, required: ["name", "used_for"] } },
    steps: { type: "array", items: { type: "string" } },
    prompts_and_code: { type: "array", items: { type: "object", properties: { label: { type: "string" }, content: { type: "string" } }, required: ["label", "content"] } },
    links_mentioned: { type: "array", items: { type: "object", properties: { label: { type: "string" }, url: { type: "string" } }, required: ["url"] } },
    on_screen_text: { type: "array", items: { type: "string" } },
    comments_insights: { type: "string" },
    try_this: { type: "array", items: { type: "object", properties: { idea: { type: "string" }, effort: { type: "string", enum: ["5min", "30min", "1-2h", "half-day", "project"] } }, required: ["idea", "effort"] } },
    difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
    tags: { type: "array", items: { type: "string" } },
    suggested_category: { type: "string" },
    roadmap_stage: { type: "string", enum: ["foundation", "core", "advanced", "reference"] },
    value_rating: { type: "integer" },
    coverage_notes: { type: "string" },
    core_idea: { type: "string" },
    core_idea_ar: { type: "string" },
    techniques: { type: "array", items: { type: "string" } },
    subtopic: { type: "string" },
    user_goals: { type: "array", items: { type: "string" } },
    has_quick_try: { type: "boolean" },
    work_relevance: { type: "object", properties: { score: { type: "integer" }, why: { type: "string" } }, required: ["score", "why"] },
    testing_relevance: { type: "object", properties: { score: { type: "integer" }, why: { type: "string" } }, required: ["score", "why"] },
    time_sensitivity: { type: "string", enum: ["evergreen", "tool_specific", "news"] },
    is_promotional: { type: "boolean" },
  },
  required: ["title", "title_ar", "content_type", "one_line", "detailed_summary", "key_points"],
};

const SYSTEM = `You write a knowledge-base card for one saved link.
The reader is an Arabic-speaking QA engineer. User-facing prose (title_ar, one_line, detailed_summary, key_points, steps, comments_insights, coverage_notes, core_idea_ar, user_goals, try_this.idea, tools_mentioned.used_for, work_relevance.why, testing_relevance.why) is Modern Standard Arabic. Keep product names, APIs, and code in English.
title and core_idea stay in the post's original language (usually English).
prompts_and_code.content is copied verbatim from the post — never translated, never invented.
detailed_summary is concrete and useful (what to do, not a teaser), markdown-ish plain text.
If comments or the video were missing, say so in coverage_notes.
testing_relevance.score is 0-3 for software testing / QA value. work_relevance.score is 0-3.
value_rating is 1-5. Do not invent facts that are not in the source.
Return only JSON.`;

function extractJson(txt) {
  let s = String(txt || "").trim();
  const fence = s.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (fence) s = fence[1];
  if (!s.startsWith("{")) {
    const i = s.indexOf("{");
    const j = s.lastIndexOf("}");
    if (i >= 0 && j > i) s = s.slice(i, j + 1);
  }
  return JSON.parse(s);
}

function hasCjk(obj) {
  const blob = JSON.stringify({
    a: obj.title_ar,
    b: obj.one_line,
    c: obj.detailed_summary,
    d: obj.key_points,
    e: obj.coverage_notes,
  });
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(blob);
}

async function openrouter(key, model, content) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "Gloss Knowledge",
      "HTTP-Referer": "https://localhost/gloss",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 8000,
      messages: [
        { role: "system", content: SYSTEM + "\n\nJSON schema:\n" + JSON.stringify(SCHEMA) },
        { role: "user", content },
      ],
      response_format: { type: "json_schema", json_schema: { name: "summary", strict: false, schema: SCHEMA } },
      usage: { include: true },
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    const err = new Error(`OpenRouter ${res.status}: ${raw.slice(0, 240)}`);
    err.status = res.status;
    throw err;
  }
  const data = JSON.parse(raw);
  const msg = data.choices?.[0]?.message?.content || "";
  const parsed = extractJson(msg);
  return { parsed, usage: data.usage || {}, model };
}

async function summarize(key, b, framePaths) {
  const parts = [];
  const textBits = [
    b.title ? `TITLE: ${b.title}` : "",
    b.author ? `AUTHOR: ${b.author}` : "",
    b.platform ? `PLATFORM: ${b.platform}` : "",
    b.resolved_url ? `URL: ${b.resolved_url}` : "",
    b.text ? `POST:\n${b.text.slice(0, 24000)}` : "",
    b.transcripts.length ? `TRANSCRIPT:\n${b.transcripts.join("\n\n").slice(0, 24000)}` : "",
    b.comments.length ? `COMMENTS:\n${b.comments.slice(0, 40).join("\n").slice(0, 8000)}` : "",
    b.warnings.length ? `NOTES:\n${b.warnings.join("; ")}` : "",
  ].filter(Boolean);
  parts.push({ type: "text", text: textBits.join("\n\n") });
  const frames = (framePaths || []).slice(0, 8);
  for (const file of frames) {
    try {
      const buf = fs.readFileSync(file);
      parts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${buf.toString("base64")}` } });
    } catch {
      /* skip a missing frame */
    }
  }
  let lastErr;
  for (const model of [QWEN, GLM]) {
    try {
      const out = await openrouter(key, model, parts);
      if (hasCjk(out.parsed) && model === QWEN) {
        lastErr = new Error("cjk");
        continue;
      }
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("llm error");
}

function guessType(b) {
  if (b.platform === "youtube") return "video";
  if (b.platform === "github") return "repo";
  if (b.media.some((m) => m.kind === "pdf") || b.platform === "pdf") return "pdf";
  const imgs = b.media.filter((m) => m.kind === "image").length + (b._frameKind === "img" ? b._frames?.length || 0 : 0);
  if (b.media.some((m) => m.kind === "video") || b.platform === "tiktok") return (b.duration || 0) > 0 && b.duration < 90 ? "short_video" : "video";
  if (imgs >= 2) return "carousel";
  if (imgs === 1) return "image";
  if (b.platform === "web" || b.platform === "medium") return "article";
  return "text_post";
}

async function copyFrames(b, mediaDir) {
  const frames = b._frames || [];
  const kind = b._frameKind || (b.media.some((m) => m.kind === "pdf") ? "page" : b.media.some((m) => m.kind === "video") ? "f" : "img");
  const rels = [];
  await fsp.mkdir(mediaDir, { recursive: true });
  let i = 0;
  for (const file of frames) {
    if (!fs.existsSync(file)) continue;
    const n = Number((path.basename(file).match(/(\d+)(?=\.jpg$)/) || [])[1] || i + 1);
    const name = `${String(i).padStart(3, "0")}_${kind}_${String(n).padStart(kind === "f" ? 4 : 3, "0")}.jpg`;
    await fsp.copyFile(file, path.join(mediaDir, name));
    rels.push(path.posix.join("kb", "media", path.basename(mediaDir), name));
    i++;
  }
  let imgIndex = 0;
  for (const m of b.media) {
    if (m.kind !== "image" || !m.url) continue;
    try {
      const res = await fetch(m.url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500 || buf.length > 8_000_000) continue;
      const name = `${String(i).padStart(3, "0")}_img_${String(imgIndex).padStart(3, "0")}.jpg`;
      const dest = path.join(mediaDir, name);
      const ffmpeg = which("ffmpeg");
      if (ffmpeg && !buf.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
        const tmp = dest + ".src";
        await fsp.writeFile(tmp, buf);
        await new Promise((resolve) => {
          const c = spawn(ffmpeg, ["-y", "-loglevel", "error", "-i", tmp, "-vf", "scale='min(1024,iw)':'min(1024,ih)':force_original_aspect_ratio=decrease", "-q:v", "4", dest], { windowsHide: true });
          c.on("close", () => resolve());
          c.on("error", () => resolve());
        });
        fs.rmSync(tmp, { force: true });
        if (!fs.existsSync(dest)) await fsp.writeFile(dest, buf);
      } else {
        await fsp.writeFile(dest, buf);
      }
      rels.push(path.posix.join("kb", "media", path.basename(mediaDir), name));
      i++;
      imgIndex++;
    } catch {
      /* a picture is optional */
    }
  }
  return rels;
}

async function makeThumb(b, mediaDir, thumbFile, frameRels) {
  const ffmpeg = which("ffmpeg");
  const src = b.thumbnail_url;
  try {
    await fsp.mkdir(path.dirname(thumbFile), { recursive: true });
    if (src) {
      const res = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const tmp = thumbFile + ".src";
        await fsp.writeFile(tmp, buf);
        if (ffmpeg) {
          await new Promise((resolve) => {
            const c = spawn(ffmpeg, ["-y", "-loglevel", "error", "-i", tmp, "-vf", "scale=480:-2", "-q:v", "5", thumbFile], { windowsHide: true });
            c.on("close", () => resolve());
            c.on("error", () => resolve());
          });
        }
        if (!fs.existsSync(thumbFile)) await fsp.copyFile(tmp, thumbFile);
        fs.rmSync(tmp, { force: true });
        if (fs.existsSync(thumbFile)) return `thumbs/${path.basename(thumbFile)}`;
      }
    }
    const first = frameRels[0];
    if (first) {
      const abs = path.join(mediaDir, path.basename(first));
      if (fs.existsSync(abs)) {
        if (ffmpeg) {
          await new Promise((resolve) => {
            const c = spawn(ffmpeg, ["-y", "-loglevel", "error", "-i", abs, "-vf", "scale=480:-2", "-q:v", "5", thumbFile], { windowsHide: true });
            c.on("close", () => resolve());
            c.on("error", () => resolve());
          });
        }
        if (!fs.existsSync(thumbFile)) await fsp.copyFile(abs, thumbFile);
        return `thumbs/${path.basename(thumbFile)}`;
      }
    }
  } catch {
    /* thumbnail is optional */
  }
  return null;
}

function emptyGen(b) {
  return {
    title: (b.title || "").slice(0, 300),
    title_ar: "",
    author: b.author || "",
    content_type: guessType(b),
    language: "",
    one_line: "",
    detailed_summary: "",
    key_points: [],
    tools_mentioned: [],
    steps: [],
    prompts_and_code: [],
    links_mentioned: [],
    on_screen_text: [],
    comments_insights: "",
    try_this: [],
    difficulty: "intermediate",
    tags: [],
    suggested_category: "",
    roadmap_stage: "reference",
    value_rating: 3,
    coverage_notes: "تم حفظ النص الأصلي. أضف مفتاح OpenRouter في الإعدادات لإنشاء الملخص العربي.",
    core_idea: (b.title || b.text || "").slice(0, 240),
    core_idea_ar: "",
    techniques: [],
    subtopic: "",
    user_goals: [],
    has_quick_try: false,
    work_relevance: { score: 0, why: "" },
    testing_relevance: { score: 0, why: "" },
    time_sensitivity: "evergreen",
    is_promotional: false,
  };
}

function buildRecords({ id, b, gen, frameRels, thumbRel, llm }) {
  const now = cairoNow();
  const mediaDir = frameRels.length ? `kb/media/${id}` : null;
  const mediaKinds = [];
  if (b.media.some((m) => m.kind === "youtube_url")) mediaKinds.push("youtube_url");
  for (const rel of frameRels) {
    if (rel.includes("_img_")) mediaKinds.push("image");
    else if (rel.includes("_page_")) mediaKinds.push("pdf");
    else if (rel.includes("_f_")) mediaKinds.push("video");
  }
  if (b.media.some((m) => m.kind === "pdf") && !mediaKinds.includes("pdf")) mediaKinds.push("pdf");
  if (b.media.some((m) => m.kind === "video") && !mediaKinds.includes("video")) mediaKinds.push("video");

  const raw = {
    id,
    schema_version: 2,
    original_url: b.original_url,
    resolved_url: b.resolved_url,
    platform: b.platform,
    date_saved: now,
    post_date: b.published || null,
    owner_note: "",
    also_saved: [],
    title: b.title || null,
    author: b.author || null,
    duration_sec: b.duration,
    post_text: b.text || "",
    comments_useful: b.comments || [],
    comments_raw_count: (b.comments || []).length,
    transcripts: b.transcripts || [],
    transcript_sources: b.transcript_sources || [],
    media_kinds: mediaKinds,
    media_notes: b.warnings || [],
    frames: frameRels,
    warnings: b.warnings || [],
    content_kind: b.content_kind || "text",
    fetched_at: now,
  };

  const item = {
    id,
    schema_version: 2,
    status: "ok",
    ...gen,
    author: gen.author || b.author || "",
    platform: b.platform,
    original_url: b.original_url,
    resolved_url: b.resolved_url,
    date_saved: now,
    post_date: b.published || null,
    also_saved: [],
    owner_note: "",
    source_meta: {
      title: b.title || "",
      author: b.author || "",
      duration_sec: b.duration,
      media: mediaKinds,
      content_kind: b.content_kind,
      comments_fetched: (b.comments || []).length,
      comments_useful: (b.comments || []).length,
      has_transcript: (b.transcripts || []).length > 0,
      media_notes: b.warnings || [],
      images_sent: Math.min(8, frameRels.length),
      warnings: b.warnings || [],
      local_video: b.media.find((m) => m.kind === "video" && m.path) ? `kb/media/${id}/video.mp4` : null,
    },
    raw_file: `kb/raw/${id}.json`,
    media_dir: mediaDir,
    thumbnail: thumbRel,
    user_state: { tried: false, not_relevant: false, notes: "" },
    llm: llm || null,
    processed_at: now,
    _origin: "added",
  };
  if (!item.title && !item.title_ar) item.title = displayTitle({ title: b.title, original_url: b.original_url, author: b.author }, "en");
  return { item, raw };
}

async function writeFailed(addedRoot, id, url, platform, reason, error, needsLogin) {
  const rec = {
    id,
    status: "failed",
    stage: reason === "llm error" ? "llm" : "fetch",
    url,
    platform,
    site: platform,
    reason,
    error: String(error || "").slice(0, 500),
    needs_login: Boolean(needsLogin),
    date_saved: cairoNow(),
    failed_at: cairoNow(),
  };
  if (reason === "skipped: personal/transactional link") {
    await fsp.writeFile(path.join(addedRoot, "kb", "failed", `${id}.json`), JSON.stringify(rec, null, 2));
    return rec;
  }
  await fsp.mkdir(path.join(addedRoot, "kb", "failed"), { recursive: true });
  await fsp.writeFile(path.join(addedRoot, "kb", "failed", `${id}.json`), JSON.stringify(rec, null, 2));
  return rec;
}

/**
 * @param {object} ctx { addedRoot, openrouterKey, groqKey, videoCapMb, onProgress }
 */
async function importUrl(rawUrl, ctx) {
  const original = String(rawUrl || "").trim();
  if (!original) throw new Error("Paste a link first.");
  const norm = normalizeUrl(original);
  const id = linkId(norm);
  const platform = platformOf(norm);
  const workdir = path.join(ctx.addedRoot, "cache", id);
  await fsp.rm(workdir, { recursive: true, force: true });
  await fsp.mkdir(workdir, { recursive: true });
  ctx.onProgress?.("Resolving the link", 0.08);
  let b;
  try {
    b = await fetchLink(original, {
      workdir,
      videoCapMb: ctx.videoCapMb || 300,
      groqKey: ctx.groqKey || "",
      onProgress: ctx.onProgress,
    });
  } catch (e) {
    await fsp.rm(path.join(ctx.addedRoot, "kb", "items", `${id}.json`), { force: true }).catch(() => {});
    await fsp.rm(path.join(ctx.addedRoot, "kb", "raw", `${id}.json`), { force: true }).catch(() => {});
    if (e.skip) {
      await writeFailed(ctx.addedRoot, id, original, platform, "skipped: personal/transactional link", e.message, false);
      const err = new Error("That looks like a personal or transactional link, so it was not saved.");
      err.code = "skipped";
      throw err;
    }
    const reason = e.needs_login ? "needs login / private" : /network|abort|timeout/i.test(String(e.message)) ? "network error" : e.message === "no content extracted" ? "no content extracted" : "other fetch error";
    await writeFailed(ctx.addedRoot, id, original, platform, reason, e.message, e.needs_login);
    const err = new Error(e.needs_login ? "That post needs a logged-in Facebook or Instagram session. Open login in Settings, then try again." : e.message || "Could not fetch that link.");
    err.needs_login = Boolean(e.needs_login);
    err.platform = platform;
    throw err;
  }

  ctx.onProgress?.("Reading the post", 0.55);
  const mediaDir = path.join(ctx.addedRoot, "kb", "media", id);
  const frameRels = await copyFrames(b, mediaDir);
  const video = b.media.find((m) => m.kind === "video" && m.path);
  if (video && fs.existsSync(video.path)) {
    await fsp.mkdir(mediaDir, { recursive: true });
    const dest = path.join(mediaDir, "video.mp4");
    try {
      await fsp.copyFile(video.path, dest);
    } catch {
      /* local playback is optional */
    }
  }
  const thumbRel = await makeThumb(b, mediaDir, path.join(ctx.addedRoot, "thumbs", `${id}.jpg`), frameRels);

  let gen = emptyGen(b);
  let llm = null;
  if (ctx.openrouterKey) {
    ctx.onProgress?.("Writing the summary", 0.75);
    try {
      const frameAbs = frameRels.map((rel) => path.join(ctx.addedRoot, rel));
      const out = await summarize(ctx.openrouterKey, b, frameAbs);
      gen = { ...gen, ...out.parsed, author: out.parsed.author || b.author || "" };
      llm = {
        model: out.model,
        requested_model: QWEN,
        provider: "openrouter",
        finish_reason: "stop",
        prompt_tokens: out.usage?.prompt_tokens || 0,
        completion_tokens: out.usage?.completion_tokens || 0,
        cost_usd: out.usage?.cost || 0,
      };
    } catch (e) {
      gen.coverage_notes = `تعذّر إنشاء الملخص (${String(e.message || e).slice(0, 160)}). النص الأصلي محفوظ.`;
      b.warnings.push("llm error");
    }
  }

  const { item, raw } = buildRecords({ id, b, gen, frameRels, thumbRel, llm });
  await fsp.mkdir(path.join(ctx.addedRoot, "kb", "items"), { recursive: true });
  await fsp.mkdir(path.join(ctx.addedRoot, "kb", "raw"), { recursive: true });
  await fsp.writeFile(path.join(ctx.addedRoot, "kb", "items", `${id}.json`), JSON.stringify(item, null, 2));
  await fsp.writeFile(path.join(ctx.addedRoot, "kb", "raw", `${id}.json`), JSON.stringify(raw, null, 2));
  await fsp.rm(path.join(ctx.addedRoot, "kb", "failed", `${id}.json`), { force: true });
  await fsp.rm(workdir, { recursive: true, force: true }).catch(() => {});
  ctx.onProgress?.("Saved", 1);
  return item;
}

async function importText(text, title, ctx) {
  const body = String(text || "").trim();
  if (body.length < 20) throw new Error("There was no readable text in that.");
  const id = linkId("paste:" + body.slice(0, 200));
  const b = {
    platform: "web",
    original_url: `gloss://paste/${id}`,
    resolved_url: `gloss://paste/${id}`,
    title: title || body.split("\n").find((l) => l.trim())?.slice(0, 140) || "",
    author: "",
    published: "",
    duration: null,
    text: body.slice(0, 120000),
    comments: [],
    transcripts: [],
    transcript_sources: [],
    media: [],
    warnings: ["pasted text"],
    content_kind: "text",
    _frames: [],
  };
  let gen = emptyGen(b);
  let llm = null;
  if (ctx.openrouterKey) {
    try {
      const out = await summarize(ctx.openrouterKey, b, []);
      gen = { ...gen, ...out.parsed };
      llm = { model: out.model, provider: "openrouter", cost_usd: out.usage?.cost || 0 };
    } catch {
      /* original text is still kept */
    }
  }
  const { item, raw } = buildRecords({ id, b, gen, frameRels: [], thumbRel: null, llm });
  await fsp.mkdir(path.join(ctx.addedRoot, "kb", "items"), { recursive: true });
  await fsp.mkdir(path.join(ctx.addedRoot, "kb", "raw"), { recursive: true });
  await fsp.writeFile(path.join(ctx.addedRoot, "kb", "items", `${id}.json`), JSON.stringify(item, null, 2));
  await fsp.writeFile(path.join(ctx.addedRoot, "kb", "raw", `${id}.json`), JSON.stringify(raw, null, 2));
  return item;
}

module.exports = { importUrl, importText, QWEN, SCHEMA };
