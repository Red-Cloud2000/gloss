import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import { useKB } from "../kb";
import { displayTitle, formatWhen, groupFrames, mediaSrc, openExternal, youtubeId } from "../text";
import type { Item, Raw, UserItem } from "../types";

function ArticleBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return blocks.map((block, i) => {
    if (block.startsWith("## ")) return <h3 key={i} dir="auto">{block.slice(3)}</h3>;
    const rows = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (rows.length > 0 && rows.every((l) => l.startsWith("- "))) {
      return (
        <ul key={i}>
          {rows.map((l, j) => <li key={j} dir="auto">{l.slice(2)}</li>)}
        </ul>
      );
    }
    if (block.includes("\n")) return <p key={i} dir="auto" style={{ whiteSpace: "pre-wrap" }}>{block}</p>;
    return <p key={i} dir="auto">{block}</p>;
  });
}

function Gallery({ origin, frames, label }: { origin: string; frames: string[]; label: string }) {
  const [i, setI] = useState(0);
  const [alive, setAlive] = useState(frames);
  if (!alive.length) return null;
  const src = mediaSrc(origin, alive[Math.min(i, alive.length - 1)]);
  return (
    <figure style={{ margin: "12px 0 18px" }}>
      <figcaption className="kicker" style={{ marginBottom: 6 }}>{label}</figcaption>
      <div className="figure-frame">
        <img
          alt=""
          src={src}
          onError={() => setAlive((list) => list.filter((f) => mediaSrc(origin, f) !== src))}
        />
      </div>
      {alive.length > 1 && (
        <div className="figure-nav">
          <button type="button" className="btn-line" onClick={() => setI((n) => (n - 1 + alive.length) % alive.length)}>‹</button>
          <bdi className="kicker" dir="ltr">{Math.min(i, alive.length - 1) + 1} / {alive.length}</bdi>
          <button type="button" className="btn-line" onClick={() => setI((n) => (n + 1) % alive.length)}>›</button>
        </div>
      )}
    </figure>
  );
}

function Lens({ prose, itemId, onGloss }: { prose: HTMLElement | null; itemId: string; onGloss: (quote: string, answer: string) => void }) {
  const { lang } = useKB();
  const { t } = useT();
  const [pos, setPos] = useState<{ x: number; y: number; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!prose) return;
    const onUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const text = sel.toString().trim();
      if (text.length < 2 || text.length > 800) return;
      const range = sel.getRangeAt(0);
      if (!prose.contains(range.commonAncestorContainer)) return;
      const rect = range.getBoundingClientRect();
      if (CSS.highlights && typeof Highlight !== "undefined") {
        CSS.highlights.set("kb-mark", new Highlight(range));
      }
      const x = Math.min(window.innerWidth - 16, Math.max(8, rect.left));
      const y = Math.max(8, rect.top - 52);
      setPos({ x, y, text });
      setQ("");
    };
    prose.addEventListener("mouseup", onUp);
    return () => prose.removeEventListener("mouseup", onUp);
  }, [prose]);

  async function ask(question: string) {
    if (!pos || busy) return;
    setBusy(true);
    try {
      const res = await api.ask({ question, lang, itemId, selection: pos.text });
      onGloss(pos.text, res.reply);
      setPos(null);
    } finally {
      setBusy(false);
    }
  }

  if (!pos) return null;
  return (
    <div className="lens" style={{ left: Math.min(pos.x, window.innerWidth - 280), top: pos.y }} role="dialog">
      <button type="button" onClick={() => void ask(lang === "ar" ? "اشرح هذا المقطع" : "Explain this passage")}>{t("explain")}</button>
      <button type="button" onClick={() => void ask(lang === "ar" ? "عرّف المصطلحات هنا" : "Define the terms here")}>{t("define")}</button>
      <button type="button" onClick={() => void ask(lang === "ar" ? "بسّط هذا المقطع" : "Simplify this passage")}>{t("simplify")}</button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) void ask(q.trim());
        }}
        style={{ display: "flex" }}
      >
        <input dir="auto" value={q} placeholder={t("ask")} aria-label={t("ask")} onChange={(e) => setQ(e.target.value)} />
      </form>
    </div>
  );
}

export function NotePage({ id }: { id: string }) {
  const { lang, go, patchUser, data } = useKB();
  const { t } = useT();
  const [item, setItem] = useState<Item | null>(null);
  const [raw, setRaw] = useState<Raw | null>(null);
  const [user, setUser] = useState<UserItem>({});
  const [err, setErr] = useState("");
  const [proseEl, setProseEl] = useState<HTMLDivElement | null>(null);
  const notesTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancel = false;
    setErr("");
    api.item(id)
      .then((r) => {
        if (cancel) return;
        setItem(r.item);
        setRaw(r.raw);
        setUser(r.user || {});
      })
      .catch((e) => {
        if (!cancel) setErr(e instanceof Error ? e.message : "Error");
      });
    return () => {
      cancel = true;
    };
  }, [id]);

  if (err) return <p className="err">{err}</p>;
  if (!item) {
    return (
      <div>
        <div className="shimmer" style={{ height: 46, width: "70%" }} />
        <div className="shimmer" style={{ height: 18, width: "40%", marginTop: 12 }} />
        <div className="shimmer" style={{ height: 180, marginTop: 20 }} />
      </div>
    );
  }

  const origin = item._origin || item.origin || "corpus";
  const title = displayTitle(item, lang);
  const summary = lang === "en" ? item.detailed_summary_en || item.detailed_summary || "" : item.detailed_summary || item.detailed_summary_en || "";
  const points = item.key_points || [];
  const post = raw?.post_text || "";
  const pdfText = (raw?.transcripts || []).find((tr) => tr.startsWith("PDF TEXT:"))?.replace(/^PDF TEXT:\n?/, "") || "";
  const body = post.trim() || pdfText.trim();
  const avatar = item.source_meta?.avatar ? mediaSrc(origin, item.source_meta.avatar) : "";
  const frames = groupFrames(raw?.frames || []);
  const vid = youtubeId(item.original_url) || youtubeId(item.resolved_url as string | undefined);
  const localVideo = item.source_meta?.local_video ? mediaSrc(origin, item.source_meta.local_video) : "";
  const glosses = user.glosses || data.user.items[id]?.glosses || [];

  return (
    <article className="note">
      <button type="button" className="back" onClick={() => go({ page: "library" })}>{t("backLib")}</button>
      <p className="kicker">{item.platform} · {item.content_type} · {formatWhen(item.date_saved)}</p>
      <h1 className="note-title" dir="auto">{title}</h1>
      <p className="note-by" dir="auto">
        {avatar && <img className="avatar" src={avatar} alt="" />}
        {[item.author, formatWhen(item.post_date)].filter(Boolean).join(" · ")}
      </p>
      <div className="origin-row">
        <button type="button" className="origin-link" onClick={() => openExternal(item.original_url)}>{t("original")}</button>
        <span className="url-clip">{item.original_url}</span>
      </div>
      <div className="note-actions">
        <button
          type="button"
          className={user.tried ? "btn-ink" : "btn-line"}
          onClick={() => {
            const tried = !user.tried;
            setUser((u) => ({ ...u, tried }));
            void patchUser(id, { tried });
          }}
        >
          {user.tried ? t("untried") : t("tried")}
        </button>
        <button
          type="button"
          className={user.not_relevant ? "btn-ink" : "btn-ghost"}
          onClick={() => {
            const not_relevant = !user.not_relevant;
            setUser((u) => ({ ...u, not_relevant }));
            void patchUser(id, { not_relevant });
          }}
        >
          {t("hide")}
        </button>
      </div>

      {(summary || points.length > 0) && (
        <section className="brief" aria-label={t("summary")}>
          <h2>{t("summary")}</h2>
          {item.one_line && <p dir="auto" style={{ marginTop: 0, color: "var(--ink-2)" }}>{lang === "en" && item.one_line_en ? item.one_line_en : item.one_line}</p>}
          {summary && <p className="sum" dir="auto">{summary}</p>}
          {points.length > 0 && (
            <>
              <h3 style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>{t("keyPoints")}</h3>
              <ul>
                {points.map((p, i) => <li key={i} dir="auto">{p}</li>)}
              </ul>
            </>
          )}
          {item.coverage_notes && <p className="kicker" dir="auto">{t("coverage")}: {item.coverage_notes}</p>}
        </section>
      )}

      {vid && (
        <iframe className="yt" title={title} src={`https://www.youtube.com/embed/${vid}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      )}
      {localVideo && <video className="yt" controls src={localVideo} />}
      <Gallery origin={origin} frames={frames.img} label={item.content_type === "carousel" ? "Carousel" : "Images"} />
      <Gallery origin={origin} frames={frames.page} label="PDF" />
      {frames.video.length > 0 && (
        <div className="story">
          {frames.video.map((f) => (
            <img key={f} alt="" src={mediaSrc(origin, f)} onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
          ))}
        </div>
      )}

      <div className="reader">
        <div className="prose-read" ref={setProseEl}>
          <h2 style={{ fontSize: 22, marginTop: 0 }}>{t("originalText")}</h2>
          {body ? <ArticleBody text={body} /> : <p className="muted">{t("emptyOriginal")}</p>}
        </div>
        <aside className="margin" aria-label={t("yourNotes")}>
          {glosses.map((g) => (
            <div key={g.id} className="gloss" dir="auto">
              <q>{g.quote}</q>
              {g.answer}
            </div>
          ))}
          {!glosses.length && <p className="muted">{lang === "ar" ? "ظلّل جملةً واسألها." : "Select a sentence and ask it."}</p>}
        </aside>
      </div>
      <Lens
        prose={proseEl}
        itemId={id}
        onGloss={(quote, answer) => {
          const gloss = { id: `g${Date.now()}`, quote: quote.slice(0, 280), answer };
          const next = [...glosses, gloss].slice(-30);
          setUser((u) => ({ ...u, glosses: next }));
          void patchUser(id, { glosses: next });
        }}
      />

      {(raw?.transcripts || []).filter((tr) => !(pdfText && tr.startsWith("PDF TEXT:") && !post.trim())).map((tr, i) => (
        <section key={i} className="brief">
          <h2>{t("transcript")}</h2>
          <pre className="codeblock" dir="auto">{tr}</pre>
        </section>
      ))}
      {(raw?.comments_useful || []).length > 0 && (
        <section>
          <h2 style={{ fontFamily: "var(--font-serif)" }}>{t("comments")}</h2>
          {(raw?.comments_useful || []).map((c, i) => (
            <blockquote key={i} dir="auto" style={{ margin: "0 0 10px", paddingInlineStart: 12, borderInlineStart: "2px solid var(--rule-strong)" }}>{c}</blockquote>
          ))}
        </section>
      )}
      {(item.prompts_and_code || []).length > 0 && (
        <section>
          <h2 style={{ fontFamily: "var(--font-serif)" }}>{t("promptsCodes")}</h2>
          {(item.prompts_and_code || []).map((p, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div className="kicker" dir="auto">{p.label}</div>
              <pre className="codeblock" dir="auto">{p.content}</pre>
            </div>
          ))}
        </section>
      )}
      <label className="kicker" htmlFor="mynotes">{t("notes")}</label>
      <textarea
        id="mynotes"
        className="notes"
        dir="auto"
        defaultValue={user.notes || ""}
        key={id + (user.notes ? "y" : "n")}
        onChange={(e) => {
          const notes = e.target.value;
          window.clearTimeout(notesTimer.current);
          notesTimer.current = window.setTimeout(() => void patchUser(id, { notes }), 400);
        }}
      />
    </article>
  );
}
