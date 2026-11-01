"use client";

/**
 * A knowledge-base note, turned into a Gloss article and a shelf entry.
 * The corpus files stay where they are; this only describes them for the reader.
 */

import type { Article, Block, BriefData } from "./article";
import type { TopicKey } from "./library";
import { useStore, type LibraryItem } from "./store";

export type KbSlim = {
  id: string;
  title?: string;
  title_ar?: string;
  title_en?: string;
  author?: string;
  platform?: string;
  content_type?: string;
  one_line?: string;
  one_line_en?: string;
  detailed_summary?: string;
  detailed_summary_en?: string;
  key_points?: string[];
  tags?: string[];
  date_saved?: string;
  post_date?: string | null;
  thumbnail?: string | null;
  original_url?: string;
  origin?: string;
  _origin?: string;
  subtopic?: string;
  language?: string;
  suggested_category?: string;
  source_meta?: { avatar?: string | null; local_video?: string | null };
};

/**
 * Ids placed by opening the catalog. They are already in the library, so the
 * shelf must not treat them as a fresh import (no outline, no confetti).
 * A link the reader adds later is not in this set, and still arrives once.
 */
const catalogIds = new Set<string>();
export function markCatalog(ids: Iterable<string>) {
  for (const id of ids) catalogIds.add(id);
}
export function isCatalogId(id: string) {
  return catalogIds.has(id);
}

/**
 * A date the way Gloss prints one: a year, or "24 Sep 2026".
 * A clock time is when the link was fetched, never the post, so it is dropped
 * unless `post` says the calendar day belongs to the post itself.
 */
export function glossDate(raw?: string | null, opts?: { post?: boolean }): string | undefined {
  const s = (raw || "").trim();
  if (!s) return undefined;
  if (/^\d{4}$/.test(s)) return s;
  if (/^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(s)) return s;
  const day = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/);
  if (day) {
    if (/[T ]\d{2}:\d{2}/.test(s) && !opts?.post) return undefined;
    return shortDay(day[1]);
  }
  const packed = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (packed) return shortDay(`${packed[1]}-${packed[2]}-${packed[3]}`);
  if (/\bago\b/i.test(s)) return s;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()) && /[A-Za-z]{3}/.test(s)) {
    return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }
  return undefined;
}

function shortDay(iso: string): string | undefined {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export type KbRaw = {
  post_text?: string;
  comments_useful?: string[];
  transcripts?: string[];
  frames?: string[];
};

const PLATFORM_TOPIC: Record<string, TopicKey> = {
  linkedin: "work",
  youtube: "learning",
  facebook: "culture",
  instagram: "culture",
  x: "culture",
  twitter: "culture",
  tiktok: "culture",
  github: "programming",
  pdf: "writing",
  medium: "writing",
  gdrive: "data",
  web: "tech",
  article: "writing",
};

/** Subject words, strongest shelf first. Short tokens stay bounded so "ai" inside a word does not count. */
const SUBJECT: [TopicKey, string[]][] = [
  ["security", ["security", "privacy", "cryptography", "cyber"]],
  ["infra", ["devops", "kubernetes", "docker", "cloud", "gpu", "ci/cd", "sre"]],
  ["design", ["design", "typography", "ux", "figma", "interface"]],
  ["data", ["data science", "analytics", "statistics", "dataset", "visualisation", "visualization", "sql"]],
  ["writing", ["writing", "journalism", "storytelling", "copywriting", "prompt"]],
  ["work", ["career", "hiring", "leadership", "resume", "interview", "job"]],
  ["money", ["investing", "finance", "crypto"]],
  ["science", ["physics", "biology", "chemistry", "astronomy"]],
  ["health", ["health", "medicine", "fitness", "nutrition"]],
  ["learning", ["education", "tutorial", "teaching", "course"]],
  ["programming", ["programming", "typescript", "javascript", "python", "react", "github", "plc", "developer", "software", "testing", "qa", "playwright", "coding", "web development"]],
  ["ai", ["machine learning", "language model", "llm", "claude", "chatgpt", "gpt", "agent", "ollama", "anthropic", "openai", "gemini", "rag", " ai ", "ai-"]],
];

const SOCIAL = new Set(["linkedin", "facebook", "instagram", "x", "twitter", "tiktok", "youtube"]);

function subjectTopic(it: KbSlim): TopicKey | null {
  const blob = ` ${[it.suggested_category, it.subtopic, ...(it.tags || []), it.core_idea, it.core_idea_ar, it.title].filter(Boolean).join(" ").toLowerCase()} `;
  let best: TopicKey | null = null;
  let score = 0;
  for (const [key, words] of SUBJECT) {
    let n = 0;
    for (const w of words) if (blob.includes(w)) n += 1;
    if (n > score) {
      score = n;
      best = key;
    }
  }
  return best;
}

export function topicFor(it: KbSlim): TopicKey {
  const plat = (it.platform || "").toLowerCase();
  const subject = subjectTopic(it);
  // A social post keeps its platform cloth (brown, magenta, teal) unless a
  // specific subject is clearer. AI and programming would paint the whole
  // corpus one blue, so they do not override a social shelf.
  if (SOCIAL.has(plat) && PLATFORM_TOPIC[plat]) {
    if (subject && subject !== "ai" && subject !== "programming" && subject !== "tech") return subject;
    return PLATFORM_TOPIC[plat];
  }
  if (subject) return subject;
  if (PLATFORM_TOPIC[plat]) return PLATFORM_TOPIC[plat];
  return "unsorted";
}

export function mediaUrl(origin: string | undefined, rel: string | null | undefined): string {
  if (!rel) return "";
  if (/^https?:\/\//i.test(rel)) return rel;
  const prefix = origin === "added" ? "/user-media/" : "/media/";
  return prefix + rel.replace(/^\/+/, "");
}

function titleOf(it: KbSlim): string {
  const t = (it.title || it.title_en || it.title_ar || "").trim();
  if (t && !/^(untitled|بدون عنوان|error)$/i.test(t)) return t;
  const line = (it.one_line || it.one_line_en || "").trim();
  return line.slice(0, 90) || it.platform || "Note";
}

function minutesOf(it: KbSlim): number {
  return Math.max(3, Math.min(48, Math.round(8 + ((it.one_line || "").length + (it.title || "").length) / 28)));
}

let seq = 0;
function block(type: Block["type"], text = "", src?: string): Block {
  seq += 1;
  return { id: `k${seq.toString(36)}`, type, runs: text ? [{ text }] : [], ...(src ? { src, alt: text || "" } : {}) };
}

/** The note as a Gloss article: the post itself, then its pictures and comments. */
export function articleFromKb(item: unknown, raw: unknown): Article | null {
  if (!item || typeof item !== "object") return null;
  const it = item as KbSlim;
  const r = (raw && typeof raw === "object" ? raw : {}) as KbRaw;
  const title = titleOf(it);
  const origin = it._origin || it.origin;
  seq = 0;
  const blocks: Block[] = [];
  const video = it.source_meta?.local_video;
  if (video) blocks.push(block("figure", "", mediaUrl(origin, video)));
  else if ((it.platform || "").toLowerCase() === "youtube" && it.original_url) {
    const id = it.original_url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/)?.[1];
    if (id) blocks.push(block("figure", "", `https://www.youtube.com/embed/${id}`));
  }
  const seen = new Set<string>();
  for (const rel of r.frames || []) {
    const src = mediaUrl(origin, rel);
    if (!src || seen.has(src) || /\.(mp4|webm)$/i.test(rel)) continue;
    seen.add(src);
    blocks.push(block("figure", "", src));
  }
  if (it.thumbnail) {
    const src = mediaUrl(origin, it.thumbnail);
    if (src && !seen.has(src)) blocks.push(block("figure", "", src));
  }
  const pdf = (r.transcripts || []).find((t) => t.startsWith("PDF TEXT:"));
  const body = (r.post_text || "").trim() || (pdf ? pdf.replace(/^PDF TEXT:\s*/, "").trim() : "") || (it.detailed_summary || "").trim() || (it.one_line || "").trim();
  for (const part of body.split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean)) blocks.push(block("p", part));
  for (const c of r.comments_useful || []) {
    const text = c.trim();
    if (text) blocks.push(block("quote", text));
  }
  if (!blocks.some((b) => b.type === "p" || b.type === "quote")) blocks.push(block("p", title));
  const avatar = it.source_meta?.avatar ? mediaUrl(origin, it.source_meta.avatar) : "";
  return {
    id: it.id,
    title,
    author: it.author || undefined,
    published: glossDate(it.post_date, { post: true }),
    dek: it.one_line || it.one_line_en || undefined,
    source: it.platform || undefined,
    sourceUrl: it.original_url,
    blocks,
    image: it.thumbnail ? mediaUrl(origin, it.thumbnail) : undefined,
    origin: "url",
    avatar: avatar || undefined,
    topic: topicFor(it),
  };
}

/** Fill the Gloss card from a note that is already on this machine. */
export async function ensureKbBrief(id: string): Promise<void> {
  if (useStore.getState().briefs[id]?.status === "ready") return;
  try {
    const res = await fetch(`/api/items/${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const body = (await res.json()) as { item?: unknown };
    const brief = briefFromKb(body.item);
    if (brief && !useStore.getState().briefs[id]) useStore.getState().setBrief(id, { status: "ready", data: brief, at: Date.now() });
  } catch {
    /* A sample has no knowledge-base note. */
  }
}

/** The Arabic summary, shown in the Gloss card when the note already has one. */
export function briefFromKb(item: unknown): BriefData | null {
  if (!item || typeof item !== "object") return null;
  const it = item as KbSlim;
  const gist = (it.detailed_summary || it.one_line || "").trim();
  if (!gist) return null;
  const claims = (it.key_points || []).filter(Boolean).slice(0, 6).map((text) => ({ text }));
  const sections = claims.length
    ? claims.map((c, i) => ({ title: mapTitle(c.text), start: i + 1 }))
    : [{ title: "Summary", start: 1 }];
  return { gist, claims, caveats: [], sections };
}

function mapTitle(text: string): string {
  const sentence = text.split(/[.!?؟۔]/)[0]?.trim() || text;
  const t = sentence.replace(/\s+/g, " ");
  return t.length > 52 ? `${t.slice(0, 51).trim()}…` : t;
}

/** One corpus row, as a book on the real shelf. */
export function shelfItemFromSlim(it: KbSlim): LibraryItem {
  const minutes = minutesOf(it);
  const addedAt = Date.parse(it.date_saved || "") || 0;
  const image = it.thumbnail ? mediaUrl(it.origin, it.thumbnail) : undefined;
  const item: LibraryItem = {
    id: it.id,
    title: titleOf(it),
    author: it.author || undefined,
    source: it.platform || undefined,
    words: minutes * 230,
    origin: "url",
    addedAt: Number.isFinite(addedAt) ? addedAt : 0,
    topic: topicFor(it),
    dek: it.one_line || it.one_line_en || undefined,
    sourceUrl: it.original_url,
    image,
  };
  for (const k of Object.keys(item) as (keyof LibraryItem)[]) if (item[k] === undefined) delete item[k];
  return item;
}
