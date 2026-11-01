/**
 * Shared display + URL rules. Item files are never rewritten to fill an empty
 * title — the reader derives one so the shelf never says "بدون عنوان".
 */

const crypto = require("crypto");

const BAD_TITLE = /^(بدون عنوان|untitled|untitled document|no title|null|undefined)$/i;

function clean(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function usable(s) {
  const t = clean(s);
  return t && !BAD_TITLE.test(t) ? t : "";
}

function clip(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** A title that is safe to show in either language. */
function displayTitle(it, lang) {
  const ar = [it.title_ar, it.one_line, it.core_idea_ar].map(usable).find(Boolean) || "";
  const en = [it.title_en, it.title, it.one_line_en, it.core_idea].map(usable).find(Boolean) || "";
  const pick = lang === "ar" ? ar || en : en || ar;
  if (pick) return clip(pick, 180);
  const host = hostOf(it.original_url || it.url || "");
  if (host) return host;
  const author = usable(it.author);
  if (author) return clip(author, 80);
  return lang === "ar" ? "رابط محفوظ" : "Saved link";
}

function normLang(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "other";
  if (s.startsWith("ar") || s === "arabic") return "ar";
  if (s === "en" || s === "english") return "en";
  return "other";
}

function linkId(normUrl) {
  return crypto.createHash("sha1").update(normUrl).digest("hex").slice(0, 12);
}

const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|mc_\w+|igsh|igshid|ig_rid|si|feature|ref|ref_src|ref_url|s|t|rcm|trk|trackingid|lipi|midtoken|midsig|trkemail|originalsubdomain|mibextid|sfnsn|_rdr|__cft__\[0\]|__tn__|share_id|is_from_webapp|sender_device|_t|_r|embeds_referring_euri|embeds_euri|source|from|app|context|xmt|wa|spm|share_app_id|u_code|social_share_type)$/i;
const KEEP = new Set(["v", "list", "id", "story_fbid", "fbid", "p", "q", "set", "index"]);

function parseQsl(q) {
  const out = [];
  if (!q) return out;
  for (const part of q.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = decodeURIComponent((i < 0 ? part : part.slice(0, i)).replace(/\+/g, " "));
    const v = decodeURIComponent((i < 0 ? "" : part.slice(i + 1)).replace(/\+/g, " "));
    out.push([k, v]);
  }
  return out;
}

function unwrap(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const h = u.hostname;
  let t = null;
  if (h.includes("linkedin.com") && (u.pathname.startsWith("/safety/go") || u.pathname.startsWith("/redir/redirect"))) {
    t = u.searchParams.get("url");
  } else if (h.endsWith("facebook.com") && (u.pathname === "/l.php" || u.pathname === "/flx/warn/")) {
    t = u.searchParams.get("u");
  } else if ((h === "google.com" || h === "www.google.com") && u.pathname === "/url") {
    t = u.searchParams.get("q") || u.searchParams.get("url");
  }
  return t && t.startsWith("http") ? t : raw;
}

/** Same canonical form the pipeline used when hashing saved links. */
function normalizeUrl(raw) {
  let u = String(raw || "").trim().replace(/[\].,;:!?)}»"'*_]+$/u, "");
  if (u.toLowerCase().startsWith("www.")) u = "https://" + u;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  u = unwrap(u);
  let sp;
  try {
    sp = new URL(u);
  } catch {
    return String(raw || "").trim();
  }
  let host = sp.hostname.toLowerCase();
  for (const pre of ["www.", "m.", "mobile.", "web.", "mbasic.", "touch."]) {
    if (host.startsWith(pre) && host.split(".").length >= 3) host = host.slice(pre.length);
  }
  let path = sp.pathname || "/";
  let q = parseQsl(sp.search.slice(1)).filter(([k]) => KEEP.has(k.toLowerCase()) || !TRACKING.test(k));
  if (["twitter.com", "x.com", "fxtwitter.com", "vxtwitter.com", "fixupx.com"].includes(host)) {
    host = "x.com";
    q = [];
    path = path.replace(/\/(photo|video)\/\d+\/?$/, "");
  } else if (host === "youtu.be") {
    const vid = path.replace(/^\//, "").split("/")[0];
    host = "youtube.com";
    path = "/watch";
    q = [["v", vid], ...q.filter(([k]) => k === "list")];
  } else if (host === "youtube.com" || host === "music.youtube.com") {
    host = "youtube.com";
    const m = path.match(/^\/(shorts|live|embed)\/([A-Za-z0-9_-]{11})/);
    if (m) {
      path = "/watch";
      q = [["v", m[2]]];
    }
    q = q.filter(([k]) => k === "v" || k === "list");
  } else if (host === "instagram.com" || host === "instagr.am") {
    host = "instagram.com";
    const m = path.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/);
    if (m) path = `/p/${m[2]}/`;
    q = [];
  } else if (host === "tiktok.com") {
    q = [];
  } else if (host === "linkedin.com") {
    q = [];
  } else if (host.endsWith("facebook.com") || host === "fb.com") {
    host = "facebook.com";
  }
  if (path !== "/" && path.endsWith("/") && host !== "instagram.com") path = path.replace(/\/+$/, "");
  const params = new URLSearchParams();
  for (const [k, v] of q) params.append(k, v);
  const qs = params.toString();
  return `https://${host}${path}${qs ? `?${qs}` : ""}`;
}

function platformOf(url) {
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return "web";
  }
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  const p = u.pathname.toLowerCase();
  if (p.endsWith(".pdf")) return "pdf";
  const table = [
    ["youtube.com", "youtube"],
    ["youtu.be", "youtube"],
    ["x.com", "x"],
    ["twitter.com", "x"],
    ["instagram.com", "instagram"],
    ["facebook.com", "facebook"],
    ["fb.watch", "facebook"],
    ["fb.com", "facebook"],
    ["linkedin.com", "linkedin"],
    ["lnkd.in", "linkedin"],
    ["tiktok.com", "tiktok"],
    ["threads.net", "threads"],
    ["threads.com", "threads"],
    ["reddit.com", "reddit"],
    ["github.com", "github"],
    ["vimeo.com", "vimeo"],
    ["drive.google.com", "gdrive"],
    ["docs.google.com", "gdocs"],
    ["medium.com", "medium"],
  ];
  for (const [key, name] of table) {
    if (h === key || h.endsWith("." + key)) return name;
  }
  return "web";
}

function youtubeId(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    if (h === "youtu.be") return u.pathname.split("/").filter(Boolean)[0] || "";
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/\/(shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
    return m ? m[2] : "";
  } catch {
    return "";
  }
}

function cairoNow() {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

module.exports = {
  displayTitle,
  normLang,
  linkId,
  normalizeUrl,
  platformOf,
  youtubeId,
  cairoNow,
  clean,
  usable,
  hostOf,
};
