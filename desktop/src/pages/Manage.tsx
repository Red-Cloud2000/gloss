import { useMemo, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import { useKB } from "../kb";
import { displayTitle, openExternal } from "../text";

const THEMES = [
  ["paper", "#f6f3ec"],
  ["sepia", "#f1e6cf"],
  ["snow", "#fdfdfc"],
  ["night", "#151412"],
  ["ink", "#0f1319"],
] as const;

export function Ideas() {
  const { data, lang, go } = useKB();
  const { t } = useT();
  const testing = useMemo(
    () => data.items.filter((it) => (it.testing_relevance?.score || 0) >= 2).sort((a, b) => (b.testing_relevance?.score || 0) - (a.testing_relevance?.score || 0)),
    [data.items]
  );
  const projects = data.items.flatMap((it) => (it.try_this || []).filter((x) => x.effort === "project" || x.effort === "half-day").map((idea) => ({ it, idea })));
  const quick = data.items.flatMap((it) => (it.try_this || []).filter((x) => x.effort === "5min" || x.effort === "30min").map((idea) => ({ it, idea })));

  return (
    <div>
      <h1 className="page-title">{t("ideas")}</h1>
      <p className="lede">{t("testing")}</p>
      <div className="card-grid" style={{ marginTop: 12 }}>
        {testing.slice(0, 24).map((it) => (
          <button key={it.id} type="button" className="gcard" onClick={() => go({ page: "note", noteId: it.id })}>
            <span className="gcard-body">
              <span className="kicker"><bdi dir="ltr">{it.testing_relevance?.score}/3</bdi> · {it.platform}</span>
              <h3 className="gcard-title" dir="auto">{displayTitle(it, lang)}</h3>
              <p className="gcard-line" dir="auto">{it.testing_relevance?.why || " "}</p>
            </span>
          </button>
        ))}
      </div>
      <div className="section-label">{t("projects")}</div>
      <div className="list">
        {projects.slice(0, 30).map(({ it, idea }, i) => (
          <button key={it.id + i} type="button" className="step" onClick={() => go({ page: "note", noteId: it.id })}>
            <span className="kicker">{idea.effort}</span>
            <h3 dir="auto">{idea.idea}</h3>
            <p className="muted">{displayTitle(it, lang)}</p>
          </button>
        ))}
      </div>
      <div className="section-label">{t("quickTries")}</div>
      <div className="card-grid">
        {quick.slice(0, 12).map(({ it, idea }, i) => (
          <button key={it.id + "q" + i} type="button" className="gcard" onClick={() => go({ page: "note", noteId: it.id })} style={{ minHeight: 140 }}>
            <span className="gcard-body">
              <span className="kicker">{idea.effort}</span>
              <h3 className="gcard-title" dir="auto">{idea.idea}</h3>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Duplicates() {
  const { data, lang, go } = useKB();
  const { t } = useT();
  const byId = useMemo(() => new Map(data.items.map((it) => [it.id, it])), [data.items]);
  return (
    <div>
      <h1 className="page-title">{t("duplicates")}</h1>
      <p className="lede">{t("dupLead")}</p>
      {!data.duplicates.length && <p className="empty">{t("nothing")}</p>}
      {data.duplicates.map((g) => {
        const ids = [g.canonical_id, ...(g.duplicate_ids || [])];
        const head = byId.get(g.canonical_id);
        return (
          <section key={g.canonical_id} className="src" style={{ marginTop: 12 }}>
            <h2 dir="auto" style={{ fontFamily: "var(--font-serif)", fontSize: 22, margin: "0 0 8px" }}>{head ? displayTitle(head, lang) : g.canonical_id}</h2>
            {ids.map((id) => {
              const it = byId.get(id);
              const url = it?.original_url || "";
              return (
                <div key={id} className="src">
                  <strong dir="auto">{it ? displayTitle(it, lang) : id}</strong>
                  <div className="kicker">{id === g.canonical_id ? (lang === "ar" ? "الأصل" : "Canonical") : it?.platform}</div>
                  {url && <p className="url-clip">{url}</p>}
                  <div className="tools" style={{ marginTop: 8 }}>
                    {it && <button type="button" className="btn-line" onClick={() => go({ page: "note", noteId: id })}>{t("open")}</button>}
                    {url && <button type="button" className="btn-ghost" onClick={() => openExternal(url)}>{t("original")}</button>}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

const REASONS: Record<string, [string, string]> = {
  "dead/deleted link": ["رابط محذوف", "Dead or deleted"],
  "needs login / private": ["يحتاج تسجيل دخول", "Needs login"],
  captcha: ["تحقق بشري من الموقع", "The site asked for a captcha"],
  "network error": ["خطأ في الشبكة", "Network error"],
  "no content extracted": ["لم يُستخرج محتوى", "No content extracted"],
  "http error": ["خطأ HTTP", "HTTP error"],
  "other fetch error": ["خطأ في الجلب", "Fetch error"],
  "unsupported file type": ["نوع ملف غير مدعوم", "Unsupported file"],
  "rate limited": ["تجاوز الحد", "Rate limited"],
  "llm error": ["خطأ في النموذج", "Model error"],
};

export function Failed() {
  const { data, lang, go, setAddOpen, refresh } = useKB();
  const { t } = useT();
  return (
    <div>
      <h1 className="page-title">{t("failed")}</h1>
      <p className="lede">{t("failedLead")}</p>
      <div className="list" style={{ marginTop: 12 }}>
        {data.failed.map((f) => {
          const label = REASONS[f.reason]?.[lang === "en" ? 1 : 0] || f.reason;
          return (
            <article key={f.id} className="src">
              <span className="tag">{label}</span>
              <p className="url-clip" style={{ marginTop: 8 }}>{f.url}</p>
              {f.error && <p className="muted" dir="ltr">{f.error}</p>}
              <div className="tools" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn-line"
                  onClick={() => {
                    sessionStorage.setItem("gloss-add-url", f.url);
                    setAddOpen(true);
                  }}
                >
                  {t("retry")}
                </button>
                {f.needs_login && window.glossDesktop && (
                  <button type="button" className="btn-ghost" onClick={() => void window.glossDesktop!.openLogin(f.platform === "instagram" ? "instagram" : "facebook")}>{t("login")}</button>
                )}
                {f.url && <button type="button" className="btn-ghost" onClick={() => openExternal(f.url)}>{t("original")}</button>}
              </div>
            </article>
          );
        })}
      </div>
      <button type="button" className="back" onClick={() => go({ page: "library" })}>{t("library")}</button>
      <button type="button" className="back" onClick={() => void refresh()}>{t("reload")}</button>
    </div>
  );
}

export function Settings() {
  const { data, lang, setLang, theme, setTheme, refresh } = useKB();
  const { t } = useT();
  const [orKey, setOrKey] = useState("");
  const [groq, setGroq] = useState("");
  const [cap, setCap] = useState(data.settings.videoCapMb || 300);
  const [root, setRoot] = useState(data.settings.dataRoot || data.dataRoot || "");
  const [msg, setMsg] = useState("");

  async function save(extra: Record<string, unknown> = {}) {
    const pub = await api.settings({
      videoCapMb: Number(cap) || 300,
      dataRoot: root,
      ...(orKey.trim() ? { openrouterKey: orKey.trim() } : {}),
      ...(groq.trim() ? { groqKey: groq.trim() } : {}),
      ...extra,
    });
    setOrKey("");
    setGroq("");
    setMsg(t("saved"));
    if (typeof extra.dataRoot === "string" || root !== data.settings.dataRoot) await refresh();
    return pub;
  }

  return (
    <div>
      <h1 className="page-title">{t("settings")}</h1>
      <p className="lede">{t("keyHint")}</p>
      <div className="section-label">{lang === "ar" ? "اللغة" : "Language"}</div>
      <div className="seg">
        <button type="button" className={lang === "ar" ? "is-on" : ""} onClick={() => setLang("ar")}>العربية</button>
        <button type="button" className={lang === "en" ? "is-on" : ""} onClick={() => setLang("en")}>English</button>
      </div>
      <div className="section-label">{t("theme")}</div>
      <div className="swatches">
        {THEMES.map(([name, color]) => (
          <button key={name} type="button" className={theme === name ? "swatch is-on" : "swatch"} style={{ background: color }} aria-label={name} onClick={() => setTheme(name)} />
        ))}
      </div>
      <div className="section-label">{t("keys")}</div>
      <div className="settings-grid">
        <label>
          <span className="kicker">{t("openrouter")} {data.settings.hasOpenRouter ? "· ✓" : ""}</span>
          <input className="field" style={{ width: "100%", marginTop: 6 }} type="password" autoComplete="off" value={orKey} onChange={(e) => setOrKey(e.target.value)} placeholder="sk-or-…" />
        </label>
        <label>
          <span className="kicker">{t("groq")} {data.settings.hasGroq ? "· ✓" : ""}</span>
          <input className="field" style={{ width: "100%", marginTop: 6 }} type="password" autoComplete="off" value={groq} onChange={(e) => setGroq(e.target.value)} placeholder="gsk_…" />
        </label>
        <label>
          <span className="kicker">{t("cap")}</span>
          <input className="field" style={{ width: "100%", marginTop: 6 }} type="number" min={20} max={4000} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
        </label>
        <label>
          <span className="kicker">{t("dataRoot")}</span>
          <input className="field" style={{ width: "100%", marginTop: 6 }} dir="ltr" value={root} title={root} onChange={(e) => setRoot(e.target.value)} onFocus={(e) => { e.currentTarget.scrollLeft = e.currentTarget.scrollWidth; }} />
        </label>
      </div>
      <div className="tools" style={{ marginTop: 14 }}>
        <button type="button" className="btn-ink" onClick={() => void save()}>{t("save")}</button>
        {window.glossDesktop && (
          <button
            type="button"
            className="btn-line"
            onClick={() => {
              void window.glossDesktop!.pickDataRoot().then((p) => {
                if (p) setRoot(p);
              });
            }}
          >
            {t("browse")}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => void api.settings({ clearOpenRouter: true }).then(() => setMsg(t("saved")))}>{t("clear")} OpenRouter</button>
        <button type="button" className="btn-ghost" onClick={() => void api.settings({ clearGroq: true }).then(() => setMsg(t("saved")))}>{t("clear")} Groq</button>
        <button type="button" className="btn-line" onClick={() => void refresh()}>{t("reload")}</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      <div className="section-label">{t("socialLogin")}</div>
      <p className="lede">{t("socialHint")}</p>
      <div className="tools">
        <button type="button" className="btn-line" disabled={!window.glossDesktop} onClick={() => void window.glossDesktop?.openLogin("facebook")}>{t("fb")}</button>
        <button type="button" className="btn-line" disabled={!window.glossDesktop} onClick={() => void window.glossDesktop?.openLogin("instagram")}>{t("ig")}</button>
      </div>
      <p className="kicker" style={{ marginTop: 18 }}>Gloss · {data.counts.items} · {data.dataRoot}</p>
    </div>
  );
}
