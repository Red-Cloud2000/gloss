import { Bar, ItemRow } from "../bits";
import { useT } from "../i18n";
import { useKB } from "../kb";
import { streak } from "../text";
import { displayTitle } from "../text";

export function Dashboard() {
  const { data, lang, go, setPendingAsk, setAddOpen } = useKB();
  const { t } = useT();
  const tried = data.items.filter((it) => data.user.items[it.id]?.tried && !data.user.items[it.id]?.not_relevant).length;
  const total = data.items.length || 1;
  const xp = tried * 10 + Object.values(data.user.quiz).reduce((n, q) => n + (q.score || 0) * 5, 0);
  const level = 1 + Math.floor(xp / 50);
  const days = streak(data.user.days);
  const catchup = [...data.items]
    .filter((it) => (it.value_rating || 0) >= 4 && !data.user.items[it.id]?.tried && !data.user.items[it.id]?.not_relevant)
    .sort((a, b) => String(a.date_saved).localeCompare(String(b.date_saved)))
    .slice(0, 6);

  const ask = (q: string) => {
    setPendingAsk(q);
    go({ page: "assistant" });
  };

  return (
    <div>
      <h1 className="page-title">{t("welcome")}</h1>
      <p className="lede">{t("welcomeSub")}</p>

      <div className="stat-grid" style={{ marginTop: 18 }}>
        <section className="stat">
          <span className="kicker">{t("progress")}</span>
          <b>{Math.round((tried / total) * 100)}%</b>
          <bdi className="muted" dir="ltr">{tried} / {data.items.length}</bdi>
          <Bar value={tried / total} />
        </section>
        <section className="stat">
          <span className="kicker">{t("streak")}</span>
          <b>{days}</b>
          <span className="muted">{lang === "ar" ? "يوم" : days === 1 ? "day" : "days"}</span>
        </section>
        <section className="stat">
          <span className="kicker">{t("level")} {level}</span>
          <b>{xp}</b>
          <span className="muted">XP</span>
          <Bar value={(xp % 50) / 50} />
        </section>
      </div>

      <form
        className="askbar"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          if (typeof q === "string" && q.trim()) ask(q.trim());
        }}
      >
        <input name="q" dir="auto" placeholder={t("askPh")} aria-label={t("askPh")} />
        <button className="btn-ink" type="submit">{t("ask")}</button>
      </form>

      <div className="section-label">{lang === "ar" ? "إجراءات سريعة" : "Quick actions"}</div>
      <div className="quick-grid">
        <button className="quick" type="button" onClick={() => go({ page: "roadmaps" })}>
          <strong>{t("continue")}</strong>
          <span className="muted">{data.roadmaps.length} {lang === "ar" ? "خرائط" : "roadmaps"}</span>
        </button>
        <button className="quick" type="button" onClick={() => document.getElementById("catchup")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          <strong>{t("quickCatch")}</strong>
          <span className="muted">{catchup.length}</span>
        </button>
        <button className="quick" type="button" onClick={() => go({ page: "ideas" })}>
          <strong>{t("quickTest")}</strong>
          <span className="muted">{t("ideas")}</span>
        </button>
        <button className="quick" type="button" onClick={() => setAddOpen(true)}>
          <strong>{t("quickAdd")}</strong>
          <span className="muted">{t("add")}</span>
        </button>
      </div>

      <div className="section-label" id="catchup">{t("catchup")}</div>
      <div className="list">
        {catchup.map((it) => (
          <ItemRow key={it.id} item={it} lang={lang} onOpen={() => go({ page: "note", noteId: it.id })} extra={<span className="kicker">{displayTitle(it, lang).slice(0, 0) || "★".repeat(it.value_rating || 0)}</span>} />
        ))}
        {!catchup.length && <p className="empty">{t("nothing")}</p>}
      </div>

      <div className="section-label">{t("roadmaps")}</div>
      <div className="card-grid">
        {data.roadmaps.map((rm) => {
          const ratios = rm.steps.map((s) => {
            if (data.user.stepsDone[s.id]) return 1;
            const ids = s.item_ids || [];
            if (!ids.length) return 0;
            return ids.filter((id) => data.user.items[id]?.tried).length / ids.length;
          });
          const p = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
          return (
            <button key={rm.id} type="button" className="gcard" onClick={() => go({ page: "roadmap", roadmapId: rm.id })} style={{ minHeight: 160 }}>
              <span className="gcard-body">
                <span className="kicker" style={{ color: rm.color }}>{rm.emoji} {rm.steps.length} {t("steps")}</span>
                <h3 className="gcard-title" dir="auto">{lang === "en" ? rm.title_en || rm.title_ar : rm.title_ar || rm.title_en}</h3>
                <Bar value={p} />
                <span className="gcard-foot">{Math.round(p * 100)}%</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
