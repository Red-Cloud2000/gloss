import type { Lang, Slim } from "./types";

const BAD = /^(بدون عنوان|untitled|untitled document|no title)$/i;

function clean(s?: string | null) {
  return String(s || "").replace(/\s+/g, " ").trim();
}
function usable(s?: string | null) {
  const t = clean(s);
  return t && !BAD.test(t) ? t : "";
}
function clip(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
}

export function displayTitle(it: Partial<Slim> & { original_url?: string; url?: string }, lang: Lang): string {
  const ar = [it.title_ar, it.one_line, it.core_idea_ar].map(usable).find(Boolean) || "";
  const en = [it.title_en, it.title, it.one_line_en, it.core_idea].map(usable).find(Boolean) || "";
  const pick = lang === "ar" ? ar || en : en || ar;
  if (pick) return clip(pick, 180);
  try {
    const host = new URL(it.original_url || it.url || "").hostname.replace(/^www\./, "");
    if (host) return host;
  } catch {
    /* not a url */
  }
  const author = usable(it.author);
  if (author) return clip(author, 80);
  return lang === "ar" ? "رابط محفوظ" : "Saved link";
}

export function oneLine(it: Partial<Slim>, lang: Lang) {
  const ar = usable(it.one_line);
  const en = usable(it.one_line_en);
  return lang === "en" ? en || ar : ar || en;
}

export function mediaSrc(origin: string | undefined, rel: string | null | undefined) {
  if (!rel) return "";
  const prefix = origin === "added" ? "/user-media/" : "/media/";
  return prefix + rel.replace(/^\/+/, "");
}

export function youtubeId(url?: string) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.hostname.replace(/^www\./, "") === "youtu.be") return u.pathname.split("/").filter(Boolean)[0] || "";
    return u.searchParams.get("v") || (u.pathname.match(/\/(shorts|embed|live)\/([A-Za-z0-9_-]{11})/) || [])[2] || "";
  } catch {
    return "";
  }
}

export function formatWhen(raw?: string | null) {
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return raw.length > 32 ? raw.slice(0, 32) : raw;
}

export function dayKey(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function streak(days: string[]) {
  const set = new Set(days);
  const cursor = new Date();
  if (!set.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  if (!set.has(dayKey(cursor))) return 0;
  let n = 0;
  while (set.has(dayKey(cursor))) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

export function openExternal(url: string) {
  if (!url) return;
  if (window.glossDesktop) void window.glossDesktop.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export function groupFrames(frames: string[] = []) {
  const img: string[] = [];
  const page: string[] = [];
  const video: string[] = [];
  for (const f of frames) {
    if (f.includes("_page_")) page.push(f);
    else if (f.includes("_f_")) video.push(f);
    else if (f.includes("_img_")) img.push(f);
  }
  return { img, page, video };
}
