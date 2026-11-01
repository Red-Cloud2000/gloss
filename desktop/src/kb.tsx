import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Bootstrap, Lang, Route, UserItem } from "./types";
import { routeKey } from "./types";
import { api } from "./api";

type Ctx = {
  data: Bootstrap;
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: string;
  setTheme: (t: string) => void;
  route: Route;
  go: (r: Route) => void;
  visited: Map<string, Route>;
  refresh: () => Promise<void>;
  patchUser: (id: string, patch: Partial<UserItem>) => Promise<void>;
  setSteps: (steps: Record<string, boolean>) => void;
  setQuizLocal: (stepId: string, result: { answers: number[]; score: number }) => void;
  setChats: (chats: Bootstrap["user"]["chats"]) => void;
  pendingAsk: string;
  setPendingAsk: (q: string) => void;
  addOpen: boolean;
  setAddOpen: (v: boolean) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
};

const C = createContext<Ctx | null>(null);

export function KBProvider({
  initial,
  children,
}: {
  initial: Bootstrap;
  children: React.ReactNode;
}) {
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem("gloss-kb-ui") || "{}") as { lang?: Lang; theme?: string; collapsed?: boolean };
    } catch {
      return {};
    }
  })();
  const [data, setData] = useState(initial);
  const [lang, setLangState] = useState<Lang>(saved.lang || initial.settings.lang || "ar");
  const [theme, setThemeState] = useState(saved.theme || initial.settings.theme || "paper");
  const [collapsed, setCollapsedState] = useState(Boolean(saved.collapsed));
  const [route, setRoute] = useState<Route>({ page: "dashboard" });
  const [visited, setVisited] = useState<Map<string, Route>>(() => new Map([["dashboard", { page: "dashboard" }]]));
  const [pendingAsk, setPendingAsk] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const persistUi = (next: { lang?: Lang; theme?: string; collapsed?: boolean }) => {
    const cur = { lang, theme, collapsed, ...next };
    localStorage.setItem("gloss-kb-ui", JSON.stringify(cur));
    document.documentElement.lang = cur.lang === "en" ? "en" : "ar";
    document.documentElement.dir = cur.lang === "en" ? "ltr" : "rtl";
    document.documentElement.dataset.theme = cur.theme || "paper";
  };

  const setLang = (l: Lang) => {
    setLangState(l);
    persistUi({ lang: l });
    void api.settings({ lang: l });
  };
  const setTheme = (t: string) => {
    setThemeState(t);
    persistUi({ theme: t });
    void api.settings({ theme: t });
  };
  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    persistUi({ collapsed: v });
  };

  const go = useCallback((r: Route) => {
    setRoute(r);
    setVisited((prev) => {
      const next = new Map(prev);
      next.set(routeKey(r), r);
      const notes = [...next.keys()].filter((k) => k.startsWith("note:"));
      while (notes.length > 6) {
        const drop = notes.shift();
        if (drop && drop !== routeKey(r)) next.delete(drop);
      }
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const b = await api.bootstrap();
    setData(b);
  }, []);

  const patchUser = useCallback(async (id: string, patch: Partial<UserItem>) => {
    setData((d) => ({
      ...d,
      user: { ...d.user, items: { ...d.user.items, [id]: { ...d.user.items[id], ...patch } } },
    }));
    await api.patchUser(id, patch);
  }, []);

  const setSteps = (steps: Record<string, boolean>) => setData((d) => ({ ...d, user: { ...d.user, stepsDone: steps } }));
  const setQuizLocal = (stepId: string, result: { answers: number[]; score: number }) =>
    setData((d) => ({ ...d, user: { ...d.user, quiz: { ...d.user.quiz, [stepId]: result } } }));
  const setChats = (chats: Bootstrap["user"]["chats"]) => setData((d) => ({ ...d, user: { ...d.user, chats } }));

  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "ar";
    document.documentElement.dir = lang === "en" ? "ltr" : "rtl";
    document.documentElement.dataset.theme = theme || "paper";
    document.title = "Gloss";
  }, [lang, theme]);

  const value: Ctx = {
    data, lang, setLang, theme, setTheme, route, go, visited, refresh, patchUser, setSteps, setQuizLocal, setChats,
    pendingAsk, setPendingAsk, addOpen, setAddOpen, collapsed, setCollapsed,
  };

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useKB() {
  const v = useContext(C);
  if (!v) throw new Error("kb");
  return v;
}
