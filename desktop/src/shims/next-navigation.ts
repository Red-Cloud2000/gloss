import { useSyncExternalStore } from "react";

/** A tiny stand-in for the Next router, enough for the Gloss screens. */

let path = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function navigate(to: string, replace = false) {
  const next = to.startsWith("/") ? to : `/${to}`;
  if (next === path) {
    window.scrollTo(0, 0);
    return;
  }
  path = next;
  if (replace) history.replaceState({}, "", next);
  else history.pushState({}, "", next);
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    path = window.location.pathname + window.location.search;
    emit();
  });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePathname() {
  const full = useSyncExternalStore(subscribe, () => path, () => "/");
  return full.split("?")[0] || "/";
}

export function useRouter() {
  return {
    push: (to: string) => navigate(to, false),
    replace: (to: string) => navigate(to, true),
    back: () => history.back(),
    prefetch: () => {},
  };
}

export function useSearchParams() {
  const full = useSyncExternalStore(subscribe, () => path, () => "/");
  return new URLSearchParams(full.split("?")[1] || "");
}
