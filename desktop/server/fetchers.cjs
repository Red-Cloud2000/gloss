/**
 * Port of the Python fetch pipeline (fetchers.py / fb_fetch.py / transcribe.py /
 * llm_openrouter.py): one bundle per link, original text left untouched.
 * YouTube captions are preferred; Groq Whisper runs only when a video has no captions.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { parseHTML } = require("linkedom");
const { Readability } = require("@mozilla/readability");
const { platformOf, youtubeId, normalizeUrl } = require("../shared/format.cjs");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PERSONAL = /(shipment_tracking|id_order=|[?&]token=|\/orders?\/|\/invoice|\/checkout|\/cart\b|\/account\b|maps\.google|goo\.gl\/maps|maps\.app|wa\.me\/|\/payment|\/receipt|docs\.google\.com\/forms\/d\/e\/.+\/formResponse|\/reset[-_]?password|\/verify|\/confirm|unsubscribe)/i;
const PERSONAL_HOST = /(paypal\.|fawry|instapay|my\.vodafone|unsubscribe\.)/i;

function bundle(platform, url) {
  return {
    platform,
    original_url: url,
    resolved_url: url,
    title: "",
    author: "",
    published: "",
    duration: null,
    text: "",
    comments: [],
    transcripts: [],
    transcript_sources: [],
    media: [],
    warnings: [],
    needs_login: false,
    thumbnail_url: "",
    content_kind: "text",
  };
}

async function netFetch(url, opts = {}) {
  const headers = { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9,ar;q=0.8", ...(opts.headers || {}) };
  const social = opts.social && typeof global.__kbSocialFetch === "function";
  const fn = social ? global.__kbSocialFetch : global.fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 25000);
  try {
    const res = await fn(url, { ...opts, headers, signal: ctrl.signal, redirect: "follow" });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url, opts) {
  const res = await netFetch(url, opts);
  const text = await res.text();
  return { res, text, finalUrl: res.url || url };
}

function which(cmd) {
  const extra = [];
  if (process.resourcesPath) extra.push(path.join(process.resourcesPath, "bin"));
  extra.push(path.join(__dirname, "..", "vendor-bin"));
  const exts = process.platform === "win32" ? [".exe", ".cmd", ""] : [""];
  const dirs = [...extra, ...String(process.env.PATH || "").split(path.delimiter)];
  for (const dir of dirs) {
    for (const ext of exts) {
      const p = path.join(dir, cmd + ext);
      if (fs.existsSync(p)) return p;
    }
  }
  return "";
}

function run(bin, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { timeout: opts.timeout || 120000, windowsHide: true });
    const chunks = [];
    const err = [];
    child.stdout?.on("data", (d) => chunks.push(d));
    child.stderr?.on("data", (d) => err.push(d));
    child.on("error", (e) => resolve({ code: 1, stdout: Buffer.concat(chunks), stderr: String(e) }));
    child.on("close", (code) => resolve({ code, stdout: Buffer.concat(chunks), stderr: Buffer.concat(err).toString("utf8") }));
  });
}

function metaContent(doc, sel) {
  const el = doc.querySelector(sel);
  return (el?.getAttribute("content") || "").trim();
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function jinaText(url) {
  try {
    const { res, text } = await getText(`https://r.jina.ai/${url}`, {
      timeout: 40000,
      headers: { Accept: "text/plain", "X-Return-Format": "text" },
    });
    if (!res.ok) return "";
    const body = text.replace(/^Title:.*\n+URL Source:.*\n+(Markdown Content:\n)?/i, "").trim();
    if (/just a moment|access denied|sign in to/i.test(body.slice(0, 400)) && body.length < 800) return "";
    return body.slice(0, 120000);
  } catch {
    return "";
  }
}

async function saveRemote(url, dest, maxBytes) {
  const res = await netFetch(url, { timeout: 60000 });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len && len > maxBytes) throw new Error("file too large");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("file too large");
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.writeFile(dest, buf);
  return dest;
}

const CHROME_LINE = /^(jump to content|main menu|navigation menu|search|donate|create account|log in|sign up|contents|appearance|tools|from wikipedia, the free encyclopedia|personal tools|namespaces|views|more|toggle [a-z].* subsection)$/i;

/** Readability's article, as separate paragraphs and headings. Site chrome is left out. */
const SKIP_CHROME = "nav, footer, aside, [role='navigation'], .interlanguage-link, .vector-menu, .vector-menu-content, .mw-portlet, .navbox, .vertical-navbox, .mw-references, .reflist, .reference, .mw-editsection, .toc, #toc, .sidebar, .infobox, .sistersitebox, .metadata, .mw-jump-link, .noprint, .shortdescription";

function blocksFromArticle(root) {
  if (!root) return "";
  const lines = [];
  const nodes = root.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,pre");
  let shortRun = [];
  const flushShort = () => {
    if (shortRun.length < 12) lines.push(...shortRun);
    shortRun = [];
  };
  for (const n of nodes) {
    if (n.closest && n.closest(SKIP_CHROME)) continue;
    if (n.querySelector && n.querySelector("li, p") && (n.tagName || "").toLowerCase() === "li") continue;
    const t = decodeEntities((n.textContent || "").replace(/\s+/g, " ").trim());
    if (!t || t.length < 2 || CHROME_LINE.test(t)) continue;
    if (/^toggle /i.test(t) || /^\[\d+\]$/.test(t)) continue;
    const tag = (n.tagName || "").toLowerCase();
    let line = t;
    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") line = `## ${t}`;
    else if (tag === "li") line = `- ${t}`;
    if (tag === "li" && t.length < 42 && !/[.!?؟]/.test(t)) {
      shortRun.push(line);
      continue;
    }
    flushShort();
    lines.push(line);
  }
  flushShort();
  return lines.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function contentRootText(html) {
  let document;
  try {
    ({ document } = parseHTML(html));
  } catch {
    return "";
  }
  const root = document.querySelector("article, main, #mw-content-text, #content, [role='main']") || document.body;
  return blocksFromArticle(root);
}

function articleFromHtml(html, url) {
  let document;
  try {
    ({ document } = parseHTML(html));
  } catch {
    return { title: "", author: "", text: "", image: "" };
  }
  const image = metaContent(document, 'meta[property="og:image"]') || metaContent(document, 'meta[name="twitter:image"]');
  const ogTitle = decodeEntities(metaContent(document, 'meta[property="og:title"]'));
  const ogDesc = decodeEntities(metaContent(document, 'meta[property="og:description"]') || metaContent(document, 'meta[name="description"]'));
  let title = ogTitle;
  let author = metaContent(document, 'meta[name="author"]') || metaContent(document, 'meta[property="article:author"]');
  let text = "";
  try {
    const parsed = new Readability(document, { charThreshold: 80 }).parse();
    if (parsed) {
      title = decodeEntities(parsed.title || "") || title;
      author = author || decodeEntities(parsed.byline || "").replace(/^by\s+/i, "");
      const { document: clean } = parseHTML(`<body>${parsed.content || ""}</body>`);
      text = blocksFromArticle(clean.body);
    }
  } catch {
    /* readability is best-effort */
  }
  if (text.length < 80) {
    const alt = contentRootText(html);
    if (alt.length > text.length && !isChromeDump(alt)) text = alt;
  }
  if (text.length < 80 && ogDesc && !isChromeDump(ogDesc)) text = ogDesc;
  if (!title) {
    const t = document.querySelector("title");
    title = decodeEntities(t?.textContent || "");
  }
  if (isChromeDump(text)) text = "";
  return { title: title.slice(0, 300), author: author.slice(0, 160), text: text.slice(0, 120000), image };
}

function isChromeDump(text) {
  const head = String(text || "").slice(0, 900);
  return /jump to content/i.test(head) && /main menu/i.test(head);
}

function parseVtt(vtt) {
  const lines = [];
  let last = "";
  let ts = "";
  for (const raw of String(vtt || "").split(/\r?\n/)) {
    const ln = raw.trim();
    if (!ln) continue;
    if (ln.includes("-->")) {
      const left = ln.split("-->")[0].trim().split(".")[0];
      const bits = left.split(":");
      ts = bits.length >= 3 ? `${bits[bits.length - 2]}:${bits[bits.length - 1]}` : left;
      continue;
    }
    const plain = ln.replace(/<[^>]+>/g, "").trim();
    if (!plain || plain.startsWith("WEBVTT") || plain.startsWith("Kind:") || plain.startsWith("Language:") || plain === last) continue;
    if (/^\d+$/.test(plain)) continue;
    lines.push(ts ? `[${ts}] ${plain}` : plain);
    last = plain;
  }
  return lines.join("\n");
}

async function youtubeCaptions(vid) {
  const hosts = ["inv.nadeko.net", "invidious.nerdvpn.de", "yt.artemislena.eu", "invidious.privacyredirect.com", "vid.puffyan.us"];
  for (const host of hosts) {
    try {
      const { res, text } = await getText(`https://${host}/api/v1/captions/${vid}`, { timeout: 12000 });
      if (!res.ok) continue;
      const data = JSON.parse(text);
      const caps = data.captions || [];
      if (!caps.length) continue;
      caps.sort((a, b) => {
        const aa = /auto/i.test(a.label || "") ? 1 : 0;
        const bb = /auto/i.test(b.label || "") ? 1 : 0;
        if (aa !== bb) return aa - bb;
        const ap = String(a.languageCode || "").startsWith("ar") || String(a.languageCode || "").startsWith("en") ? 0 : 1;
        const bp = String(b.languageCode || "").startsWith("ar") || String(b.languageCode || "").startsWith("en") ? 0 : 1;
        return ap - bp;
      });
      let u = caps[0].url || "";
      if (u && !u.startsWith("http")) u = `https://${host}${u}`;
      const v = await getText(u, { timeout: 20000 });
      const body = parseVtt(v.text);
      if (!body) continue;
      const auto = /auto/i.test(caps[0].label || "");
      return {
        text: `(captions: ${caps[0].label || "captions"})\n${body}`,
        source: auto ? "youtube_captions_auto" : "youtube_captions_manual",
      };
    } catch {
      /* next host */
    }
  }
  try {
    const watch = await getText(`https://www.youtube.com/watch?v=${vid}`, { timeout: 20000 });
    const m = watch.text.match(/"captionTracks":(\[\{.*?\}\])/);
    if (m) {
      const tracks = JSON.parse(m[1].replace(/\\u0026/g, "&"));
      const track = tracks.find((t) => !/auto/i.test(t.kind || t.vssId || "")) || tracks[0];
      if (track?.baseUrl) {
        const v = await getText(track.baseUrl, { timeout: 20000 });
        const xml = v.text;
        const lines = [];
        const re = /<text[^>]*start="([\d.]+)"[^>]*>([^<]*)<\/text>/g;
        let mm;
        let last = "";
        while ((mm = re.exec(xml))) {
          const sec = Math.floor(Number(mm[1]) || 0);
          const ts = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
          const plain = decodeEntities(mm[2]).trim();
          if (!plain || plain === last) continue;
          lines.push(`[${ts}] ${plain}`);
          last = plain;
        }
        if (lines.length) {
          const auto = /auto/i.test(track.kind || track.vssId || "");
          return {
            text: `(captions: ${track.name?.simpleText || track.languageCode || "captions"})\n${lines.join("\n")}`,
            source: auto ? "youtube_captions_auto" : "youtube_captions_manual",
          };
        }
      }
    }
  } catch {
    /* no captions */
  }
  return null;
}

async function youtubeCaptionsYtDlp(vid, workdir) {
  const bin = which("yt-dlp");
  if (!bin) return null;
  const base = path.join(workdir, "cap");
  await run(bin, [
    "--skip-download",
    "--no-playlist",
    "--write-sub",
    "--write-auto-sub",
    "--sub-langs", "en.*,ar.*,en,ar",
    "--sub-format", "vtt/best",
    "-o", base,
    `https://www.youtube.com/watch?v=${vid}`,
  ], { timeout: 90000 });
  if (!fs.existsSync(workdir)) return null;
  const files = fs.readdirSync(workdir).filter((n) => n.endsWith(".vtt"));
  if (!files.length) return null;
  files.sort((a, b) => Number(/auto/i.test(a)) - Number(/auto/i.test(b)));
  const body = parseVtt(fs.readFileSync(path.join(workdir, files[0]), "utf8"));
  if (!body) return null;
  const auto = /auto/i.test(files[0]);
  return {
    text: `(captions: ${files[0]})\n${body}`,
    source: auto ? "youtube_captions_auto" : "youtube_captions_manual",
  };
}

const JUNK_TITLE = /^(error|instagram|facebook|linkedin|log ?in|login|sign up|sign in|checking your browser.*|recaptcha.*|just a moment.*)$/i;

function looksLikeWall(text) {
  const blob = String(text || "").slice(0, 1800);
  return /checking your browser|verify you are human|sign in to confirm you.?re not a bot|log into instagram|see everyday moments from your close friends|agree & join linkedin|join linkedin now|sign in to view more content/i.test(blob);
}

/** A captcha, login wall, or error page must never become a note. Returns a reason, or "". */
function isUnreadableCapture(b) {
  const title = String(b?.title || "").trim();
  const text = String(b?.text || "").trim();
  const blob = `${title}\n${text}`.slice(0, 2500);
  if (/checking your browser/i.test(title) || /^recaptcha/i.test(title)) return "captcha";
  if (looksLikeWall(blob)) return "login wall";
  if (JUNK_TITLE.test(title) && text.length < 1500) return "error page";
  if (isChromeDump(text)) return "page chrome";
  if (/log in/i.test(text.slice(0, 240)) && /followers/i.test(text.slice(0, 500))) return "login wall";
  return "";
}

function linkedinEmbedUrl(url) {
  const m = String(url || "").match(/(ugcPost|share|activity)-(\d{8,})/i);
  if (!m) return "";
  const kind = /^ugcpost$/i.test(m[1]) ? "ugcPost" : /^activity$/i.test(m[1]) ? "activity" : "share";
  return `https://www.linkedin.com/embed/feed/update/urn:li:${kind}:${m[2]}`;
}

/** Public LinkedIn embed: author, avatar, post text, and the post's own images. */
function parseLinkedInEmbed(html) {
  let document;
  try {
    ({ document } = parseHTML(html));
  } catch {
    return null;
  }
  const og = (sel) => decodeEntities(metaContent(document, sel));
  const desc = og('meta[property="og:description"]') || og('meta[name="description"]');
  const ogTitle = og('meta[property="og:title"]');
  if (/checking your browser/i.test(ogTitle) || (!desc && /recaptcha\/challengepage/i.test(html))) return null;
  let author = "";
  const parts = ogTitle.split("|");
  if (parts.length > 1) author = parts[parts.length - 1].trim();
  const lock = document.querySelector('[aria-label^="View profile for"]');
  if (lock) {
    const name = (lock.getAttribute("aria-label") || "").replace(/^View profile for\s+/i, "").trim();
    if (name) author = name;
  }
  const avatarEl = document.querySelector("[data-delayed-url*='profile-displayphoto'], [data-delayed-url*='profile-displayphoto-shrink']")
    || document.querySelector("[data-delayed-url]");
  let avatar = avatarEl ? decodeEntities(avatarEl.getAttribute("data-delayed-url") || "") : "";
  if (avatar && !/profile-displayphoto/i.test(avatar)) avatar = "";
  const images = [];
  const seen = new Set();
  const pushImg = (src) => {
    src = decodeEntities(src || "");
    if (!/media\.licdn\.com\/dms\/image/i.test(src)) return;
    if (/profile-displayphoto|company-logo|ghost-icon/i.test(src)) return;
    const id = (src.match(/\/dms\/image\/(?:v2\/)?([^/?]+)/) || [])[1] || src;
    if (seen.has(id)) return;
    seen.add(id);
    images.push(src);
  };
  for (const img of document.querySelectorAll("img")) pushImg(img.getAttribute("data-delayed-url") || img.getAttribute("src") || "");
  pushImg(og('meta[property="og:image"]'));
  const text = (desc || "").trim();
  const title = (text.split("\n").map((s) => s.trim()).find(Boolean) || ogTitle || "").slice(0, 180);
  return { title, author, text, avatar, images };
}

async function ytdlpMeta(url) {
  const bin = which("yt-dlp");
  if (!bin) return null;
  const r = await run(bin, ["--skip-download", "--no-playlist", "--no-warnings", "--print", "%(title)s", "--print", "%(uploader)s", "--print", "%(description)s", url], { timeout: 70000 });
  const text = r.stdout.toString("utf8").replace(/\u0000/g, "").trim();
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  let title = (lines[0] || "").trim();
  const author = (lines[1] || "").trim();
  let body = lines.slice(2).join("\n").trim();
  if (/^\d[\d.,]*\s*[KMB]?\s*views\b/i.test(title) && body) title = body.split("\n").map((s) => s.trim()).find(Boolean) || title;
  title = title.replace(/\s+/g, " ").slice(0, 180);
  if (/^(error|facebook|instagram|log in)$/i.test(title)) title = "";
  if (!title && !body) return null;
  return { title, author, text: body.slice(0, 20000) };
}

async function ytdlpDownload(url, workdir, capMb) {
  const bin = which("yt-dlp");
  if (!bin) return { warning: "yt-dlp is not installed; video was not downloaded" };
  const cap = `${Math.max(1, capMb)}M`;
  const out = path.join(workdir, "video.%(ext)s");
  const args = [
    "--no-playlist",
    "--max-filesize",
    cap,
    "-f",
    "b[height<=480][ext=mp4]/b[height<=480]/b",
    "-o",
    out,
    "--no-progress",
    url,
  ];
  const r = await run(bin, args, { timeout: 180000 });
  const files = fs.existsSync(workdir) ? fs.readdirSync(workdir).filter((n) => /\.(mp4|mkv|webm|mov)$/i.test(n)) : [];
  if (!files.length) {
    const msg = (r.stderr || "").slice(-300);
    if (/max-filesize|File is larger/i.test(msg)) return { warning: `video is over the ${capMb} MB cap and was not downloaded` };
    return { warning: msg ? `video download failed: ${msg.replace(/\s+/g, " ").slice(0, 180)}` : "video download failed" };
  }
  const file = path.join(workdir, files[0]);
  const size = fs.statSync(file).size;
  if (size > capMb * 1024 * 1024) {
    fs.unlinkSync(file);
    return { warning: `video is over the ${capMb} MB cap and was not kept` };
  }
  return { file, size };
}

async function ffmpegFrames(video, workdir, duration) {
  const bin = which("ffmpeg");
  if (!bin) return [];
  const step = Math.max(2.5, (duration || 60) / 120);
  const dir = path.join(workdir, "frames");
  fs.mkdirSync(dir, { recursive: true });
  const vf = `fps=1/${step.toFixed(2)},scale='min(768,iw)':'min(768,ih)':force_original_aspect_ratio=decrease`;
  await run(bin, ["-y", "-loglevel", "error", "-i", video, "-vf", vf, "-fps_mode", "vfr", "-q:v", "5", path.join(dir, "f_%04d.jpg")], { timeout: 180000 });
  let frames = fs.readdirSync(dir).filter((n) => n.endsWith(".jpg")).sort();
  if (frames.length > 20) {
    const pick = [];
    for (let i = 0; i < 20; i++) pick.push(frames[Math.round((i * (frames.length - 1)) / 19)]);
    frames = [...new Set(pick)];
  }
  return frames.map((n) => path.join(dir, n));
}

async function groqTranscribe(video, workdir, key) {
  const ffmpeg = which("ffmpeg");
  if (!ffmpeg || !key) return null;
  const audio = path.join(workdir, "speech.mp3");
  await run(ffmpeg, ["-y", "-loglevel", "error", "-i", video, "-t", "1200", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", audio], { timeout: 180000 });
  if (!fs.existsSync(audio) || fs.statSync(audio).size < 2000) return null;
  if (fs.statSync(audio).size > 24 * 1024 * 1024) return null;
  const buf = fs.readFileSync(audio);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "audio/mpeg" }), "speech.mp3");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) return null;
  const j = await res.json();
  const segs = (j.segments || []).map((s) => {
    const sec = Math.floor(s.start || 0);
    return `[${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}] ${(s.text || "").trim()}`;
  });
  const body = segs.length ? segs.join("\n") : j.text || "";
  if (body.trim().length < 8) return null;
  return { text: `(language: ${j.language || "unknown"})\n${body}`, source: "speech_to_text" };
}

async function fetchYoutube(url, b, workdir, opts) {
  const vid = youtubeId(url);
  if (!vid) throw new Error("Could not read that YouTube link.");
  b.resolved_url = `https://youtube.com/watch?v=${vid}`;
  b.thumbnail_url = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
  try {
    const o = await getText(`https://www.youtube.com/oembed?url=${encodeURIComponent(b.resolved_url)}&format=json`, { timeout: 15000 });
    if (o.res.ok) {
      const j = JSON.parse(o.text);
      b.title = j.title || "";
      b.author = j.author_name || "";
    }
  } catch {
    b.warnings.push("youtube oembed unavailable");
  }
  let caps = await youtubeCaptions(vid);
  if (!caps) caps = await youtubeCaptionsYtDlp(vid, workdir);
  if (caps) {
    b.transcripts.push(caps.text);
    b.transcript_sources.push(caps.source);
    b.warnings.push(caps.source === "youtube_captions_auto" ? "audio: YouTube captions (auto-generated)" : "audio: YouTube captions");
  }
  b.media.push({ kind: "youtube_url", uri: `https://www.youtube.com/watch?v=${vid}` });
  const dl = await ytdlpDownload(b.resolved_url, workdir, opts.videoCapMb);
  if (dl.file) {
    b.media.push({ kind: "video", path: dl.file, duration: b.duration });
    const frames = await ffmpegFrames(dl.file, workdir, b.duration);
    b._frames = frames;
    if (!caps && opts.groqKey) {
      const tr = await groqTranscribe(dl.file, workdir, opts.groqKey);
      if (tr) {
        b.transcripts.push(tr.text);
        b.transcript_sources.push(tr.source);
      } else b.warnings.push("no captions and transcription failed");
    } else if (!caps) b.warnings.push("no captions; add a Groq key in Settings to transcribe");
  } else if (dl.warning) b.warnings.push(dl.warning);
  if (!b.text || looksLikeWall(b.text) || isChromeDump(b.text) || /skip navigation/i.test(b.text.slice(0, 800))) {
    const extra = await jinaText(b.resolved_url);
    const chrome = !extra || looksLikeWall(extra) || isChromeDump(extra) || /skip navigation/i.test(extra.slice(0, 800));
    if (!chrome) b.text = extra.slice(0, 20000);
    else b.text = "";
  }
}

async function fetchGithub(url, b) {
  const m = url.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!m) return;
  const repo = `${m[1]}/${m[2].replace(/\.git$/, "")}`;
  const { res, text } = await getText(`https://api.github.com/repos/${repo}`, {
    timeout: 20000,
    headers: { Accept: "application/vnd.github+json", "User-Agent": "gloss-knowledge" },
  });
  if (!res.ok) return;
  const j = JSON.parse(text);
  b.title = j.full_name || repo;
  b.author = j.owner?.login || "";
  b.text = [j.description || "", "", j.homepage ? `Homepage: ${j.homepage}` : "", `Stars: ${j.stargazers_count}`, `Language: ${j.language || ""}`].filter(Boolean).join("\n");
  try {
    const readme = await getText(`https://api.github.com/repos/${repo}/readme`, {
      timeout: 20000,
      headers: { Accept: "application/vnd.github.raw", "User-Agent": "gloss-knowledge" },
    });
    if (readme.res.ok && readme.text.length > 40) b.text += "\n\n" + readme.text.slice(0, 60000);
  } catch {
    /* readme optional */
  }
  b.content_kind = "text";
}

async function fetchLinkedIn(url, b) {
  let final = url;
  if (/lnkd\.in/i.test(url)) {
    try {
      const hop = await getText(url, { timeout: 20000 });
      final = hop.finalUrl || url;
    } catch {
      /* keep the short link */
    }
  }
  if (!/^https?:\/\/www\.linkedin\.com/i.test(final)) final = final.replace("://linkedin.com", "://www.linkedin.com");
  const embed = linkedinEmbedUrl(final) || linkedinEmbedUrl(url);
  let html = "";
  if (embed) {
    try {
      const page = await getText(embed, { timeout: 20000 });
      html = page.text || "";
    } catch {
      html = "";
    }
  }
  b.resolved_url = final;
  const parsed = html ? parseLinkedInEmbed(html) : null;
  if (!parsed || (!parsed.text && !parsed.images.length)) {
    const err = new Error("That LinkedIn post needs a logged-in session, or the site answered with a captcha. Open login in Settings, then try again.");
    err.needs_login = true;
    throw err;
  }
  b.title = parsed.title;
  b.author = parsed.author;
  b.text = parsed.text;
  b.avatar_url = parsed.avatar || "";
  b.thumbnail_url = parsed.images[0] || "";
  for (const src of parsed.images) b.media.push({ kind: "image", url: src });
  b.content_kind = parsed.images.length > 1 ? "media" : "text";
}

async function fetchTwitter(url, b) {
  const m = url.match(/status\/(\d+)/);
  if (m) {
    try {
      const { res, text } = await getText(`https://api.fxtwitter.com/status/${m[1]}`, { timeout: 20000 });
      if (res.ok) {
        const j = JSON.parse(text);
        const tw = j.tweet || j;
        b.text = tw.text || tw.description || "";
        b.author = tw.author?.name ? `${tw.author.name} (@${tw.author.screen_name || ""})` : "";
        b.avatar_url = tw.author?.avatar_url || tw.author?.avatar || "";
        b.title = (b.text.split("\n")[0] || b.author || "Post").slice(0, 140);
        const photos = tw.media?.photos || [];
        for (const p of photos) {
          const u = p.url || p;
          if (typeof u === "string" && /^https?:/i.test(u) && !/\.mp4(\?|$)/i.test(u)) b.media.push({ kind: "image", url: u });
        }
        for (const v of tw.media?.videos || []) {
          if (v.thumbnail_url) b.media.push({ kind: "image", url: v.thumbnail_url });
        }
        if (b.media[0]?.url) b.thumbnail_url = b.media[0].url;
        if (b.text || b.media.length) return;
      }
    } catch {
      /* fall through */
    }
  }
  const extra = await jinaText(url);
  if (extra && !isChromeDump(extra) && !looksLikeWall(extra)) b.text = extra;
}

async function fetchSocialPage(url, b, opts) {
  let html = "";
  try {
    const page = await getText(url, { timeout: 25000, social: true });
    html = page.text;
    b.resolved_url = page.finalUrl || url;
  } catch {
    html = "";
  }
  const loginWall = /login|log in|sign up|تسجيل الدخول/i.test(html.slice(0, 2500)) && html.length < 80000 && !/og:description/i.test(html);
  if (html && !/checking your browser/i.test(html.slice(0, 400))) {
    const art = articleFromHtml(html, b.resolved_url);
    b.title = art.title;
    b.author = art.author;
    b.text = art.text;
    if (art.image && !/static\.licdn\.com|fbcdn.*rsrc/i.test(art.image)) {
      b.thumbnail_url = art.image;
      b.media.push({ kind: "image", url: art.image });
    }
  }
  if (b.text.length < 40 && b.platform !== "facebook" && b.platform !== "instagram") {
    const extra = await jinaText(url);
    if (extra && !isUnreadableCapture({ title: b.title, text: extra })) b.text = extra;
  }
  const htmlWhy = isUnreadableCapture(b);
  const thin = b.text.length < 40 && (b.platform === "facebook" || b.platform === "instagram");
  if (htmlWhy || thin) {
    b.text = "";
    b.title = "";
    b.author = "";
    b.thumbnail_url = "";
    b.media = b.media.filter((m) => m.kind === "video" && m.path);
  }
  if (opts.downloadVideo && (b.platform === "facebook" || b.platform === "instagram" || b.platform === "tiktok")) {
    const meta = htmlWhy || thin ? await ytdlpMeta(url) : null;
    if (meta && !isUnreadableCapture(meta)) {
      b.title = meta.title || b.title;
      b.author = meta.author || b.author;
      b.text = meta.text || b.text;
    }
    const dl = await ytdlpDownload(url, opts.workdir, opts.videoCapMb);
    if (dl.file) {
      b.media.push({ kind: "video", path: dl.file });
      b._frames = await ffmpegFrames(dl.file, opts.workdir, null);
      if (!b.thumbnail_url && b._frames?.[0]) b.thumbnail_url = "";
      if (opts.groqKey && !b.transcripts.length) {
        const tr = await groqTranscribe(dl.file, opts.workdir, opts.groqKey);
        if (tr) {
          b.transcripts.push(tr.text);
          b.transcript_sources.push(tr.source);
        }
      }
    } else if (dl.warning) b.warnings.push(dl.warning);
  }
  const why = isUnreadableCapture(b);
  const noPost = b.text.length < 40 && (b.platform === "facebook" || b.platform === "instagram") && !b.media.some((m) => m.kind === "video" && m.path);
  if (why || noPost) {
    b.needs_login = true;
    b.text = "";
    b.title = "";
    b.thumbnail_url = "";
    b.media = [];
    b._frames = [];
    b.warnings.push(why || (loginWall ? "needs a logged-in session" : "no public post text"));
  }
}

async function fetchPdf(url, b, workdir, capMb) {
  const dest = path.join(workdir, "doc.pdf");
  await saveRemote(url, dest, capMb * 1024 * 1024);
  b.media.push({ kind: "pdf", path: dest });
  const pdftotext = which("pdftotext");
  if (pdftotext) {
    const r = await run(pdftotext, ["-layout", dest, "-"], { timeout: 60000 });
    const text = r.stdout.toString("utf8").trim();
    if (text) b.transcripts.push(`PDF TEXT:\n${text.slice(0, 60000)}`);
  }
  const pdftoppm = which("pdftoppm");
  if (pdftoppm) {
    await run(pdftoppm, ["-jpeg", "-jpegopt", "quality=80", "-scale-to", "1024", "-f", "1", "-l", "12", dest, path.join(workdir, "page")], { timeout: 60000 });
    b._frames = fs.readdirSync(workdir).filter((n) => /^page.*\.jpg$/.test(n)).sort().map((n) => path.join(workdir, n));
    b._frameKind = "page";
  }
  if (!b.title) b.title = decodeURIComponent(path.basename(new URL(url).pathname) || "document.pdf");
  b.content_kind = "media";
}

async function fetchWeb(url, b) {
  let html = "";
  let finalUrl = url;
  try {
    const page = await getText(url, { timeout: 25000 });
    html = page.text;
    finalUrl = page.finalUrl || url;
    const type = page.res.headers.get("content-type") || "";
    if (type.includes("application/pdf") || finalUrl.toLowerCase().split("?")[0].endsWith(".pdf")) {
      b._isPdf = true;
      b.resolved_url = finalUrl;
      return;
    }
  } catch (e) {
    b.warnings.push(`page fetch failed: ${e.name || "error"}`);
  }
  b.resolved_url = finalUrl;
  if (html) {
    const art = articleFromHtml(html, finalUrl);
    b.title = art.title;
    b.author = art.author;
    b.text = art.text;
    if (art.image) {
      b.thumbnail_url = art.image;
      b.media.push({ kind: "image", url: art.image });
    }
  }
  if (b.text.length < 80 || isChromeDump(b.text)) {
    const extra = await jinaText(finalUrl);
    if (extra && !isChromeDump(extra) && !isUnreadableCapture({ title: b.title, text: extra }) && extra.length > b.text.length) b.text = extra;
  }
  if (isChromeDump(b.text) || isUnreadableCapture(b)) {
    b.text = "";
    if (JUNK_TITLE.test(b.title || "")) b.title = "";
  }
}

/**
 * @param {string} rawUrl
 * @param {{workdir: string, videoCapMb: number, groqKey: string, onProgress?: Function}} opts
 */
async function fetchLink(rawUrl, opts) {
  const original = String(rawUrl || "").trim();
  let normalized = normalizeUrl(original);
  const platform = platformOf(normalized);
  if (PERSONAL.test(original) || PERSONAL_HOST.test(normalized)) {
    const err = new Error("skipped: personal/transactional link");
    err.skip = true;
    throw err;
  }
  const b = bundle(platform, original);
  b.resolved_url = normalized;
  opts.onProgress?.("Fetching", 0.15);

  if (platform === "youtube") await fetchYoutube(normalized, b, opts.workdir, opts);
  else if (platform === "github") await fetchGithub(normalized, b);
  else if (platform === "x") await fetchTwitter(normalized, b);
  else if (platform === "pdf") await fetchPdf(normalized, b, opts.workdir, opts.videoCapMb);
  else if (platform === "facebook" || platform === "instagram" || platform === "tiktok" || platform === "threads") {
    await fetchSocialPage(normalized, b, { ...opts, downloadVideo: true });
  } else if (platform === "linkedin") {
    await fetchLinkedIn(normalized, b);
  } else {
    await fetchWeb(normalized, b);
    if (b._isPdf) await fetchPdf(b.resolved_url, b, opts.workdir, opts.videoCapMb);
  }

  const unread = isUnreadableCapture(b);
  if (unread) {
    const err = new Error(
      unread === "captcha"
        ? "The site answered with a captcha, so the link was not saved."
        : unread === "page chrome"
          ? "That page did not yield an article, so it was not saved."
          : "That post needs a logged-in session. Open login in Settings, then try again."
    );
    err.needs_login = unread === "login wall";
    err.captcha = unread === "captcha";
    throw err;
  }

  if (b.needs_login || (!b.text && !b.transcripts.length && !b.media.length && !b.title)) {
    const err = new Error(b.needs_login ? "That post needs a logged-in session. Open login in Settings, then try again." : "no content extracted");
    err.needs_login = Boolean(b.needs_login);
    err.bundle = b;
    throw err;
  }
  b.content_kind = b.media.some((m) => m.kind === "video" || m.kind === "image" || m.kind === "pdf") || b._frames?.length ? "media" : "text";
  return b;
}

module.exports = { fetchLink, which, articleFromHtml, parseVtt, parseLinkedInEmbed, isUnreadableCapture, isChromeDump, linkedinEmbedUrl };
