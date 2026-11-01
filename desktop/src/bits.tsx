import { useState, type ReactNode } from "react";
import { GlossMark } from "./mark";
import { displayTitle, mediaSrc, oneLine } from "./text";
import type { Lang, Slim } from "./types";

/** Exact label. Spans are pinned left-to-right so «الـPrompts» stays in that order. */
export function PromptsWord() {
  return (
    <span className="prompts-word" dir="ltr" lang="ar">
      <span>«</span>
      <span dir="rtl" lang="ar">الـ</span>
      <span dir="ltr" lang="en">Prompts</span>
      <span>»</span>
    </span>
  );
}

export function Stars({ n }: { n: number }) {
  const v = Math.max(0, Math.min(5, Math.round(n || 0)));
  if (!v) return null;
  return <span className="stars" aria-label={`${v}/5`}>{"★".repeat(v)}{"☆".repeat(5 - v)}</span>;
}

export function Thumb({ item, className = "" }: { item: Pick<Slim, "thumbnail" | "origin">; className?: string }) {
  const src = mediaSrc(item.origin, item.thumbnail);
  const [dead, setDead] = useState(false);
  if (!src || dead) {
    return (
      <span className={`thumb thumb-empty ${className}`}>
        <GlossMark />
      </span>
    );
  }
  return <img className={`thumb ${className}`} alt="" src={src} onError={() => setDead(true)} />;
}

export function ItemCard({ item, lang, outdated, onOpen }: { item: Slim; lang: Lang; outdated?: string; onOpen: () => void }) {
  const title = displayTitle(item, lang);
  const line = oneLine(item, lang);
  return (
    <button type="button" className="gcard" onClick={onOpen}>
      <Thumb item={item} />
      <span className="gcard-body">
        <span className="kicker">
          {item.platform} · {item.content_type}
          {outdated ? ` · ${outdated}` : ""}
        </span>
        <h3 className="gcard-title" dir="auto">{title}</h3>
        <p className="gcard-line" dir="auto">{line || " "}</p>
        <span className="gcard-foot">
          <Stars n={item.value_rating} />
          <span className="clamp-1">{item.author || item.platform}</span>
        </span>
      </span>
    </button>
  );
}

export function ItemRow({ item, lang, onOpen, extra }: { item: Slim; lang: Lang; onOpen: () => void; extra?: ReactNode }) {
  return (
    <button type="button" className="lrow" onClick={onOpen}>
      <Thumb item={item} />
      <span style={{ minWidth: 0 }}>
        <span className="kicker">{item.platform}</span>
        <h3 dir="auto">{displayTitle(item, lang)}</h3>
        <p dir="auto">{oneLine(item, lang)}</p>
      </span>
      <span>{extra}</span>
    </button>
  );
}

export function Bar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="bar" aria-hidden>
      <span style={{ width: `${Math.round(v * 100)}%` }} />
    </div>
  );
}
