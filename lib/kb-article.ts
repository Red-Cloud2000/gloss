"use client";

/**
 * A knowledge-base note, turned into a Gloss article and a shelf entry.
 * The corpus files stay where they are; this only describes them for the reader.
 */

import type { Article, Block, BriefData } from "./article";
import { TOPICS, type TopicKey } from "./library";
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
  source_meta?: { avatar?: string | null; local_video?: string | null };
};

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

export function topicFor(it: KbSlim): TopicKey {
  const plat = (it.platform || "").toLowerCase();
  if (PLATFORM_TOPIC[plat]) return PLATFORM_TOPIC[plat];
  const blob = `${it.subtopic || ""} ${(it.tags || []).join(" ")}`.toLowerCase();
  for (const t of TOPICS) {
    if (t.key === "unsorted") continue;
    if (blob.includes(t.name.toLowerCase())) return t.key;
  }
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
    published: it.post_date || it.date_saved || undefined,
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
  const claims = (it.key_points || []).filter(Boolean).slice(0, 6).map((text, i) => ({ text, cite: i + 1 }));
  return {
    gist,
    claims,
    caveats: [],
    sections: [{ title: "Summary", start: 1 }],
  };
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
