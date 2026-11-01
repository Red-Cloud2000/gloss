import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, FlaskConical, Home, Library as LibraryIcon, Map, MessageSquare, PanelLeft, Search, Settings, Share2, Sparkles } from "lucide-react";
import { api } from "./api";
import { PromptsWord } from "./bits";
import { Bar } from "./bits";
import { useT } from "./i18n";
import { useKB } from "./kb";
import { GlossMark } from "./mark";
import { AddSheet } from "./pages/AddSheet";
import { Assistant } from "./pages/Assistant";
import { Dashboard } from "./pages/Dashboard";
import { Library } from "./pages/Library";
import { Duplicates, Failed, Ideas, Settings as SettingsPage } from "./pages/Manage";
import { NotePage } from "./pages/Note";
import { Prompts } from "./pages/Prompts";
import { RoadmapDetail, Roadmaps, StepDetail } from "./pages/Roadmaps";
import { TopicMap } from "./pages/TopicMap";
import type { Route } from "./types";
import { routeKey } from "./types";
import { streak } from "./text";

const NAV: { id: Route["page"]; icon: typeof Home; label: "dashboard" | "library" | "roadmaps" | "topics" | "assistant" | "ideas" | "duplicates" | "failed" | "settings"; prompts?: boolean }[] = [
  { id: "dashboard", icon: Home, label: "dashboard" },
  { id: "library", icon: LibraryIcon, label: "library" },
  { id: "roadmaps", icon: Map, label: "roadmaps" },
  { id: "topics", icon: Share2, label: "topics" },
  { id: "assistant", icon: MessageSquare, label: "assistant" },
  { id: "prompts", icon: Sparkles, label: "assistant", prompts: true },
  { id: "ideas", icon: FlaskConical, label: "ideas" },
  { id: "duplicates", icon: Copy, label: "duplicates" },
  { id: "failed", icon: AlertTriangle, label: "failed" },
  { id: "settings", icon: Settings, label: "settings" },
];

function sectionOf(r: Route) {
  if (r.page === "note") return "library";
  if (r.page === "roadmap" || r.page === "step") return "roadmaps";
  return r.page;
}

function PageBody({ route, active }: { route: Route; active: boolean }) {
  switch (route.page) {
    case "dashboard":
      return <Dashboard />;
    case "library":
      return <Library />;
    case "roadmaps":
      return <Roadmaps />;
    case "roadmap":
      return <RoadmapDetail id={route.roadmapId} />;
    case "step":
      return <StepDetail roadmapId={route.roadmapId} stepId={route.stepId} />;
    case "topics":
      return <TopicMap active={active} />;
    case "assistant":
      return <Assistant active={active} />;
    case "prompts":
      return <Prompts />;
    case "ideas":
      return <Ideas />;
    case "duplicates":
      return <Duplicates />;
    case "failed":
      return <Failed />;
    case "settings":
      return <SettingsPage />;
    case "note":
      return <NotePage id={route.noteId} />;
    default:
      return null;
  }
}

export function Shell() {
  const { data, route, go, visited, collapsed, setCollapsed, setAddOpen, lang } = useKB();
  const { t } = useT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; title: string; one_line: string; platform: string }[]>([]);
  const [openHits, setOpenHits] = useState(false);
  const section = sectionOf(route);
  const tried = data.items.filter((it) => data.user.items[it.id]?.tried).length;
  const days = streak(data.user.days);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void api.search(q.trim(), lang).then((r) => {
        setHits(r.hits);
        setOpenHits(true);
      }).catch(() => setHits([]));
    }, 160);
    return () => window.clearTimeout(handle);
  }, [q, lang]);

  const pages = useMemo(() => [...visited.entries()], [visited]);

  return (
    <div className="shell">
      <aside className={collapsed ? "sidebar is-collapsed" : "sidebar"}>
        <div className="side-brand">
          <GlossMark />
          {!collapsed && <span className="wordmark">Gloss</span>}
          <button type="button" className="icon-btn" style={{ marginInlineStart: collapsed ? 0 : "auto" }} aria-label={collapsed ? t("expand") : t("collapse")} onClick={() => setCollapsed(!collapsed)}>
            <PanelLeft size={18} />
          </button>
        </div>
        <nav className="side-nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = section === item.id;
            return (
              <button key={item.id} type="button" data-page={item.id} className={on ? "nav-btn is-on" : "nav-btn"} aria-current={on ? "page" : undefined} title={collapsed ? (item.prompts ? "«الـPrompts»" : t(item.label)) : undefined} onClick={() => go({ page: item.id } as Route)}>
                <Icon size={18} />
                {!collapsed && <span>{item.prompts ? <PromptsWord /> : t(item.label)}</span>}
              </button>
            );
          })}
        </nav>
        {!collapsed && (
          <div className="side-foot">
            <div className="side-progress">
              <bdi dir="ltr">
                <strong>{tried}</strong>
                {" / "}
                {data.items.length}
                {" · "}
                {days}
              </bdi>
            </div>
            <Bar value={data.items.length ? tried / data.items.length : 0} />
          </div>
        )}
      </aside>
      <div className="stage">
        <header className="topbar">
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (hits[0]) {
                go({ page: "note", noteId: hits[0].id });
                setOpenHits(false);
                setQ("");
              }
            }}
          >
            <Search size={16} />
            <input value={q} dir="auto" placeholder={t("searchPh")} aria-label={t("searchPh")} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpenHits(true)} />
            {openHits && hits.length > 0 && (
              <div className="search-pop" role="listbox">
                {hits.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="search-hit"
                    onClick={() => {
                      go({ page: "note", noteId: h.id });
                      setOpenHits(false);
                      setQ("");
                    }}
                  >
                    <strong dir="auto" className="clamp-1">{h.title}</strong>
                    <span className="kicker clamp-1" dir="auto">{h.platform} · {h.one_line}</span>
                  </button>
                ))}
              </div>
            )}
          </form>
          <div className="top-actions">
            <button type="button" className="lang-btn" onClick={() => document.dispatchEvent(new CustomEvent("gloss-lang"))}>
              {lang === "ar" ? "EN" : "ع"}
            </button>
            <button type="button" className="btn-ink" onClick={() => setAddOpen(true)}>{t("add")}</button>
          </div>
        </header>
        <div className="pages">
          {pages.map(([key, r]) => {
            const active = key === routeKey(route);
            const fit = r.page === "assistant";
            return (
              <div key={key} className={`page${fit ? " page-fit" : ""}${active ? "" : " is-stashed"}`}>
                <PageBody route={r} active={active} />
              </div>
            );
          })}
        </div>
      </div>
      <AddSheet />
      <LangHotkey />
    </div>
  );
}

function LangHotkey() {
  const { lang, setLang } = useKB();
  useEffect(() => {
    const fn = () => setLang(lang === "ar" ? "en" : "ar");
    document.addEventListener("gloss-lang", fn);
    return () => document.removeEventListener("gloss-lang", fn);
  }, [lang, setLang]);
  return null;
}
