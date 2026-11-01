import type { Bootstrap, Item, Raw, UserItem } from "./types";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  bootstrap: () => json<Bootstrap>("/api/bootstrap"),
  item: (id: string) => json<{ item: Item; raw: Raw | null; user: UserItem }>(`/api/items/${id}`),
  patchUser: (id: string, patch: Partial<UserItem>) => json<UserItem>(`/api/user/${id}`, { method: "POST", body: JSON.stringify(patch) }),
  activity: () => json("/api/activity", { method: "POST", body: "{}" }),
  step: (stepId: string, done: boolean) => json("/api/steps", { method: "POST", body: JSON.stringify({ stepId, done }) }),
  quiz: (stepId: string, answers: number[], score: number) => json("/api/quiz", { method: "POST", body: JSON.stringify({ stepId, answers, score }) }),
  chats: (chats: unknown) => json("/api/chats", { method: "POST", body: JSON.stringify({ chats }) }),
  search: (q: string, lang: string) => json<{ hits: { id: string; title: string; one_line: string; platform: string; original_url: string }[] }>(`/api/search?q=${encodeURIComponent(q)}&lang=${lang}`),
  ask: (body: { question: string; lang: string; itemId?: string; selection?: string }) =>
    json<{ reply: string; cites: { id: string; title: string; url: string }[]; mode: string }>("/api/ask", { method: "POST", body: JSON.stringify(body) }),
  chat: (body: { question: string; lang: string }) =>
    json<{ reply: string; cites: { id: string; title: string; url: string }[]; mode: string }>("/api/chat", { method: "POST", body: JSON.stringify(body) }),
  importUrl: (url: string) => json<{ jobId: string }>("/api/import", { method: "POST", body: JSON.stringify({ url }) }),
  importText: (text: string, title?: string) => json<{ itemId: string }>("/api/import", { method: "POST", body: JSON.stringify({ text, title }) }),
  job: (id: string) => json<{ id: string; status: string; label: string; pct: number; error: string; itemId: string; needsLogin: boolean; platform: string }>(`/api/jobs/${id}`),
  settings: (patch: Record<string, unknown>) => json<{ hasOpenRouter: boolean; hasGroq: boolean; videoCapMb: number; lang: string; theme: string; dataRoot: string }>("/api/settings", { method: "POST", body: JSON.stringify(patch) }),
  reload: () => json("/api/reload", { method: "POST", body: "{}" }),
};
