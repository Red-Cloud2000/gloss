import { useEffect, useState } from "react";
import { PanelLeft } from "lucide-react";
import { Landing } from "@/components/landing/Landing";
import { Library } from "@/components/library/Library";
import { Reader } from "@/components/reader/Reader";
import { Tooltips } from "@/components/ui/Tooltips";
import { shelfItemFromSlim, type KbSlim } from "@/lib/kb-article";
import { sampleById } from "@/lib/samples";
import { applySettings } from "@/lib/settings";
import { useStore, type LibraryItem } from "@/lib/store";
import { Shell } from "./App";
import { I18nProvider } from "./i18n";
import { useKB } from "./kb";
import { navigate, usePathname } from "./shims/next-navigation";

/** Put the corpus on the real shelf. `gloss-kb-hold=1` leaves the three samples, for comparing with the live library. */
async function mountShelf() {
  const st = useStore.getState();
  if (!st.hydrated) st.hydrate();
  if (localStorage.getItem("gloss-kb-hold") === "1") return;
  const res = await fetch("/api/bootstrap");
  if (!res.ok) return;
  const data = (await res.json()) as { items?: KbSlim[] };
  const incoming = (data.items || []).map(shelfItemFromSlim);
  const ids = new Set(incoming.map((x) => x.id));
  const prev = useStore.getState().library;
  const byId = new Map(prev.map((x) => [x.id, x]));
  const kept = prev.filter((x) => !ids.has(x.id));
  const merged = incoming.map((x) => {
    const old = byId.get(x.id);
    if (!old) return x;
    const next: LibraryItem = { ...x };
    if (old.favorite) next.favorite = true;
    if (old.finishedAt) next.finishedAt = old.finishedAt;
    if (old.cover) next.cover = old.cover;
    if (old.scene) next.scene = old.scene;
    return next;
  });
  useStore.setState({ library: [...kept, ...merged] });
}

function Surface() {
  const path = usePathname();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);
  const read = path.match(/^\/read\/([^/]+)/);
  if (read) {
    const id = decodeURIComponent(read[1]);
    return <Reader id={id} initial={sampleById(id)} />;
  }
  if (path === "/library" || path.startsWith("/library/")) return <Library />;
  return <Landing />;
}

function Knowledge({ open }: { open: boolean }) {
  const { lang } = useKB();
  if (!open) return null;
  return (
    <div className="kb-sheet" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <I18nProvider lang={lang}>
        <Shell />
      </I18nProvider>
    </div>
  );
}

export function Host() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    applySettings(useStore.getState().settings);
    const unsub = useStore.subscribe((s, p) => {
      if (s.settings !== p.settings) applySettings(s.settings);
    });
    void mountShelf();
    const close = () => setOpen(false);
    const nav = (e: Event) => {
      navigate((e as CustomEvent<string>).detail || "/library");
      setOpen(false);
    };
    document.addEventListener("gloss-close", close);
    document.addEventListener("gloss-nav", nav);
    return () => {
      unsub();
      document.removeEventListener("gloss-close", close);
      document.removeEventListener("gloss-nav", nav);
    };
  }, []);
  return (
    <>
      <Surface />
      <Tooltips />
      <button type="button" className="kb-handle" aria-label="Knowledge" onClick={() => setOpen(true)}>
        <PanelLeft size={18} />
      </button>
      <Knowledge open={open} />
    </>
  );
}
