/**
 * Local API + media. The Electron shell and the browser dev server share it.
 * API keys stay in the user store and are never returned to the renderer.
 */

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { loadCatalog, rawFile, safeFile, bootstrap } = require("./catalog.cjs");
const { createUserStore } = require("./userstore.cjs");
const { importUrl, importText } = require("./pipeline.cjs");
const { displayTitle } = require("../shared/format.cjs");

const PORT = Number(process.env.PORT || 3921);
const HOST = "127.0.0.1";

function resolveDataRoot(store) {
  const candidates = [
    store.settings.dataRoot,
    process.env.KB_DATA,
    process.resourcesPath ? path.join(process.resourcesPath, "sample-data") : "",
    path.join(__dirname, "..", "..", "vendor-sample", "sample", "data"),
    path.join(process.cwd(), "sample-data"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "kb"))) return c;
  }
  return candidates[0] || path.join(__dirname, "..", "sample-data");
}

function userDir() {
  if (process.env.GLOSS_USER_DIR) return process.env.GLOSS_USER_DIR;
  if (process.env.APPDATA) return path.join(process.env.APPDATA, "gloss-knowledge");
  return path.join(__dirname, "..", ".user-data");
}

const store = createUserStore(userDir());
let catalogPromise = null;

function reload() {
  const root = resolveDataRoot(store);
  catalogPromise = loadCatalog(root, store.addedRoot);
  return catalogPromise;
}

function cat() {
  if (!catalogPromise) reload();
  return catalogPromise;
}

const jobs = new Map();

function send(res, code, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(code, {
    "Content-Type": typeof body === "string" && !headers["Content-Type"] ? "text/plain; charset=utf-8" : headers["Content-Type"] || "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(buf);
}

function readBody(req, limit = 30_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Body must be JSON."));
      }
    });
    req.on("error", reject);
  });
}

function tokens(q) {
  return String(q || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}

function hay(it) {
  return [
    it.title,
    it.title_ar,
    it.title_en,
    it.one_line,
    it.one_line_en,
    it.author,
    it.detailed_summary,
    it.detailed_summary_en,
    it.core_idea,
    it.core_idea_ar,
    ...(it.tags || []),
    ...(it.key_points || []),
    ...(it.steps || []),
    it.subtopic,
    it.original_url,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function searchItems(catalog, q, limit = 8) {
  const ts = tokens(q);
  if (!ts.length) return [];
  const scored = [];
  for (const it of catalog.items.values()) {
    const h = hay(it);
    let score = 0;
    for (const t of ts) {
      if (!h.includes(t)) continue;
      score += 1;
      const title = `${it.title || ""} ${it.title_ar || ""} ${it.title_en || ""}`.toLowerCase();
      if (title.includes(t)) score += 4;
      if ((it.one_line || "").toLowerCase().includes(t)) score += 2;
      if ((it.tags || []).some((tag) => String(tag).toLowerCase().includes(t))) score += 2;
    }
    if (score > 0) scored.push({ it, score });
  }
  scored.sort((a, b) => b.score - a.score || (b.it.value_rating || 0) - (a.it.value_rating || 0));
  return scored.slice(0, limit);
}

async function answerWithModel(key, lang, question, contexts) {
  const sys =
    lang === "ar"
      ? "أنت مساعد قاعدة معرفة Gloss. أجب بالعربية الفصحى، وأبقِ أسماء الأدوات بالإنجليزية. استند فقط إلى المقاطع المعطاة. اذكر رقم المصدر بين قوسين مثل [1] عند استخدامه. إن لم تكفِ المقاطع فقل ذلك."
      : "You are the Gloss knowledge-base assistant. Answer from the supplied excerpts only. Cite sources as [1]. If the excerpts are not enough, say so. Keep the answer concise.";
  const user = contexts
    .map((c, i) => `[${i + 1}] ${c.title}\n${c.url}\n${c.text}`)
    .join("\n\n") + `\n\nQuestion: ${question}`;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "Gloss Knowledge",
      "HTTP-Referer": "https://localhost/gloss",
    },
    body: JSON.stringify({
      model: "qwen/qwen3.7-flash",
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 180)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function localAnswer(lang, hits) {
  if (!hits.length) {
    return lang === "ar" ? "لا أجد في المكتبة ما يجيب عن هذا. جرّب كلمات من عنوان المنشور." : "Nothing in the library matches that yet. Try words from a post title.";
  }
  const lines = hits.slice(0, 4).map((h, i) => {
    const title = displayTitle(h.it, lang);
    const bit = (h.it.one_line || h.it.detailed_summary || h.it.core_idea_ar || h.it.core_idea || "").replace(/\s+/g, " ").trim().slice(0, 280);
    return `[${i + 1}] ${title}${bit ? " — " + bit : ""}`;
  });
  const lead = lang === "ar" ? "أقرب ما في المكتبة:" : "Closest notes in the library:";
  const tail = lang === "ar" ? "أضف مفتاح OpenRouter في الإعدادات لأحصل على جوابٍ مكتوب." : "Add an OpenRouter key in Settings for a written answer.";
  return `${lead}\n\n${lines.join("\n\n")}\n\n${tail}`;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".mp4": "video/mp4",
};

async function serveStatic(res, urlPath) {
  const dist = path.join(__dirname, "..", "dist");
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";
  const abs = path.resolve(dist, "." + rel);
  if (!abs.startsWith(path.resolve(dist))) return send(res, 403, { error: "forbidden" });
  try {
    const data = await fsp.readFile(abs);
    send(res, 200, data, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
  } catch {
    if (process.env.NODE_ENV === "production" || process.env.SERVE_STATIC === "1") {
      try {
        const html = await fsp.readFile(path.join(dist, "index.html"));
        send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
        return;
      } catch {
        /* dist not built */
      }
    }
    send(res, 404, { error: "not found" });
  }
}

async function serveMedia(res, root, rel) {
  const abs = safeFile(root, rel);
  if (!abs) return send(res, 400, { error: "bad path" });
  try {
    const data = await fsp.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    send(res, 200, data, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "public, max-age=86400" });
  } catch {
    send(res, 404, { error: "missing" });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${HOST}`);
    const p = url.pathname;

    if (p.startsWith("/media/")) {
      const c = await cat();
      return serveMedia(res, c.dataRoot, p.slice("/media/".length));
    }
    if (p.startsWith("/user-media/")) {
      return serveMedia(res, store.addedRoot, p.slice("/user-media/".length));
    }

    if (p === "/api/health") return send(res, 200, { ok: true });

    if (p === "/api/bootstrap" && req.method === "GET") {
      const c = await cat();
      return send(res, 200, { ...bootstrap(c, store.publicUser()), settings: store.publicSettings() });
    }

    if (p === "/api/reload" && req.method === "POST") {
      const c = await reload();
      return send(res, 200, { ok: true, counts: { items: c.items.size, failed: c.failed.size }, dataRoot: c.dataRoot });
    }

    if (p === "/api/settings" && req.method === "GET") return send(res, 200, store.publicSettings());
    if (p === "/api/settings" && req.method === "POST") {
      const body = await readBody(req);
      const pub = store.updateSettings(body);
      if (typeof body.dataRoot === "string") await reload();
      return send(res, 200, pub);
    }

    const itemMatch = p.match(/^\/api\/items\/([a-f0-9]{6,40})$/);
    if (itemMatch && req.method === "GET") {
      const c = await cat();
      const item = c.items.get(itemMatch[1]);
      if (!item) return send(res, 404, { error: "This note is not in the library." });
      let raw = null;
      const file = rawFile(c, item);
      if (file) raw = JSON.parse(await fsp.readFile(file, "utf8").catch(() => "null"));
      if (raw && Array.isArray(raw.frames)) {
        const root = item._origin === "added" ? c.addedRoot : c.dataRoot;
        raw.frames = raw.frames.filter((rel) => {
          const abs = safeFile(root, rel);
          return abs && fs.existsSync(abs);
        });
      }
      return send(res, 200, { item, raw, user: store.state.items[item.id] || { tried: false, not_relevant: false, notes: "" } });
    }

    const userMatch = p.match(/^\/api\/user\/([a-zA-Z0-9_-]+)$/);
    if (userMatch && req.method === "POST") {
      const body = await readBody(req);
      const next = store.patchItem(userMatch[1], body);
      if (body.tried) store.touchDay();
      return send(res, 200, next);
    }

    if (p === "/api/activity" && req.method === "POST") {
      return send(res, 200, { days: store.touchDay() });
    }
    if (p === "/api/steps" && req.method === "POST") {
      const body = await readBody(req);
      return send(res, 200, { stepsDone: store.setStepDone(body.stepId, Boolean(body.done)) });
    }
    if (p === "/api/quiz" && req.method === "POST") {
      const body = await readBody(req);
      store.touchDay();
      return send(res, 200, { quiz: store.setQuiz(body.stepId, { answers: body.answers || [], score: body.score || 0 }) });
    }
    if (p === "/api/chats" && req.method === "POST") {
      const body = await readBody(req);
      return send(res, 200, { chats: store.saveChats(body.chats || []) });
    }

    if (p === "/api/search" && req.method === "GET") {
      const c = await cat();
      const hits = searchItems(c, url.searchParams.get("q") || "", 12).map(({ it, score }) => ({
        id: it.id,
        title: displayTitle(it, url.searchParams.get("lang") === "en" ? "en" : "ar"),
        one_line: it.one_line || it.one_line_en || "",
        platform: it.platform,
        original_url: it.original_url,
        score,
        origin: it._origin || "corpus",
        thumbnail: it.thumbnail,
      }));
      return send(res, 200, { hits });
    }

    if ((p === "/api/ask" || p === "/api/chat") && req.method === "POST") {
      const body = await readBody(req);
      const c = await cat();
      const lang = body.lang === "en" ? "en" : "ar";
      const question = String(body.question || body.selection || "").trim();
      if (!question) return send(res, 400, { error: "Ask something first." });
      let contexts = [];
      if (p === "/api/ask" && body.itemId && c.items.has(body.itemId)) {
        const it = c.items.get(body.itemId);
        let raw = null;
        const file = rawFile(c, it);
        if (file) raw = JSON.parse(await fsp.readFile(file, "utf8").catch(() => "null"));
        contexts = [
          {
            id: it.id,
            title: displayTitle(it, lang),
            url: it.original_url,
            text: [it.detailed_summary, it.one_line, ...(it.key_points || []), raw?.post_text || "", body.selection || ""].filter(Boolean).join("\n").slice(0, 12000),
          },
        ];
      } else {
        const hits = searchItems(c, question, 6);
        contexts = [];
        for (const { it } of hits) {
          let rawText = "";
          const file = rawFile(c, it);
          if (file) {
            const raw = JSON.parse(await fsp.readFile(file, "utf8").catch(() => "null"));
            rawText = (raw?.post_text || "").slice(0, 1500);
          }
          contexts.push({
            id: it.id,
            title: displayTitle(it, lang),
            url: it.original_url,
            text: [it.one_line, it.detailed_summary, ...(it.key_points || []).slice(0, 4), rawText].filter(Boolean).join("\n").slice(0, 2500),
          });
        }
      }
      const key = store.keys().openrouterKey;
      let reply = "";
      let mode = "local";
      if (key) {
        try {
          reply = await answerWithModel(key, lang, body.selection ? `${question}\n\nSelected passage:\n${body.selection}` : question, contexts);
          mode = "openrouter";
        } catch (e) {
          reply = localAnswer(lang, contexts.map((c) => ({ it: { ...c, one_line: c.text, title: c.title, original_url: c.url } })));
          reply = `${reply}\n\n(${e.message})`;
        }
      } else {
        reply = localAnswer(lang, contexts.map((ctx) => ({ it: c.items.get(ctx.id) || { title: ctx.title, one_line: ctx.text, original_url: ctx.url } })));
      }
      store.touchDay();
      return send(res, 200, { reply, cites: contexts.map((c) => ({ id: c.id, title: c.title, url: c.url })), mode });
    }

    if (p === "/api/import" && req.method === "POST") {
      const body = await readBody(req);
      if (body.text) {
        const item = await importText(body.text, body.title || "", {
          addedRoot: store.addedRoot,
          openrouterKey: store.keys().openrouterKey,
        });
        await reload();
        return send(res, 200, { itemId: item.id });
      }
      const jobId = `j${Date.now().toString(36)}`;
      const job = { id: jobId, status: "running", label: "Starting", pct: 0.02, error: "", itemId: "", needsLogin: false, platform: "" };
      jobs.set(jobId, job);
      const keys = store.keys();
      importUrl(body.url || "", {
        addedRoot: store.addedRoot,
        openrouterKey: keys.openrouterKey,
        groqKey: keys.groqKey,
        videoCapMb: store.settings.videoCapMb || 300,
        onProgress: (label, pct) => {
          job.label = label;
          job.pct = pct;
        },
      })
        .then(async (item) => {
          job.status = "done";
          job.itemId = item.id;
          job.pct = 1;
          job.label = "Saved";
          await reload();
        })
        .catch((e) => {
          job.status = "error";
          job.error = e.message || "Could not import that link.";
          job.needsLogin = Boolean(e.needs_login);
          job.platform = e.platform || "";
        });
      return send(res, 200, { jobId });
    }

    const jobMatch = p.match(/^\/api\/jobs\/([\w-]+)$/);
    if (jobMatch && req.method === "GET") {
      const job = jobs.get(jobMatch[1]);
      if (!job) return send(res, 404, { error: "unknown job" });
      return send(res, 200, job);
    }

    if (p === "/api/login-hint" && req.method === "GET") {
      return send(res, 200, { desktop: Boolean(global.__kbSocialFetch) });
    }

    if (p.startsWith("/api/")) return send(res, 404, { error: "unknown api" });

    if (process.env.NODE_ENV === "production" || process.env.SERVE_STATIC === "1" || process.env.ELECTRON === "1") {
      return serveStatic(res, p);
    }
    send(res, 404, { error: "API only. Run vite for the UI." });
  } catch (e) {
    send(res, 500, { error: e.message || "server error" });
  }
});

function start() {
  return reload().then(
    (c) =>
      new Promise((resolve) => {
        server.listen(PORT, HOST, () => {
          console.log(`gloss-kb api http://${HOST}:${PORT} items=${c.items.size} failed=${c.failed.size} root=${c.dataRoot}`);
          resolve(c);
        });
      })
  );
}

if (require.main === module) start();

module.exports = { server, reload, store, PORT, HOST, start };
