import { useEffect, useMemo, useRef, useState } from "react";
import { ItemCard, ItemRow } from "../bits";
import { useT } from "../i18n";
import { useKB } from "../kb";
import { displayTitle } from "../text";

export function Library() {
  const { data, lang, go } = useKB();
  const { t } = useT();
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("all");
  const [sort, setSort] = useState<"new" | "old" | "rate">("new");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [n, setN] = useState(48);
  const sentinel = useRef<HTMLDivElement>(null);
  const outdated = useMemo(() => new Map(data.outdated.map((o) => [o.item_id, lang === "en" ? o.note_en || o.note_ar : o.note_ar])), [data.outdated, lang]);

  const platforms = useMemo(() => {
    const s = new Set(data.items.map((i) => i.platform).filter(Boolean));
    return ["all", ...[...s].sort()];
  }, [data.items]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let rows = data.items.filter((it) => {
      if (data.user.items[it.id]?.not_relevant) return false;
      if (platform !== "all" && it.platform !== platform) return false;
      if (!query) return true;
      const blob = [displayTitle(it, "ar"), displayTitle(it, "en"), it.author, it.one_line, ...(it.tags || []), it.platform].join("\n").toLowerCase();
      return blob.includes(query);
    });
    rows = [...rows].sort((a, b) => {
      if (sort === "rate") return (b.value_rating || 0) - (a.value_rating || 0);
      const cmp = String(a.date_saved).localeCompare(String(b.date_saved));
      return sort === "old" ? cmp : -cmp;
    });
    return rows;
  }, [data.items, data.user.items, q, platform, sort]);

  useEffect(() => setN(48), [q, platform, sort, view]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setN((v) => v + 48);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length, view]);

  const shown = filtered.slice(0, n);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("library")}</h1>
          <p className="lede">{filtered.length} {t("results")}</p>
        </div>
        <div className="tools">
          <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={t("searchPh")} dir="auto" />
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as "new" | "old" | "rate")} aria-label={t("sortNew")}>
            <option value="new">{t("sortNew")}</option>
            <option value="old">{t("sortOld")}</option>
            <option value="rate">{t("sortRate")}</option>
          </select>
          <div className="seg" role="group" aria-label={t("grid")}>
            <button type="button" className={view === "grid" ? "is-on" : ""} onClick={() => setView("grid")}>{t("grid")}</button>
            <button type="button" className={view === "list" ? "is-on" : ""} onClick={() => setView("list")}>{t("list")}</button>
          </div>
        </div>
      </div>
      <div className="tools" style={{ marginBottom: 14 }}>
        {platforms.map((p) => (
          <button key={p} type="button" className={platform === p ? "chip is-on" : "chip"} onClick={() => setPlatform(p)}>
            {p === "all" ? t("all") : p}
          </button>
        ))}
      </div>
      {!shown.length && <p className="empty">{t("nothing")}</p>}
      {view === "grid" ? (
        <div className="card-grid">
          {shown.map((it) => (
            <ItemCard key={it.id} item={it} lang={lang} outdated={outdated.get(it.id) ? t("outdated") : ""} onOpen={() => go({ page: "note", noteId: it.id })} />
          ))}
        </div>
      ) : (
        <div className="list">
          {shown.map((it) => (
            <ItemRow key={it.id} item={it} lang={lang} onOpen={() => go({ page: "note", noteId: it.id })} />
          ))}
        </div>
      )}
      <div ref={sentinel} style={{ height: 1 }} />
    </div>
  );
}
