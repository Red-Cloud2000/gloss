import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { useKB } from "../kb";
import { api } from "../api";
import type { ChatThread } from "../types";

export function Assistant({ active }: { active: boolean }) {
  const { data, lang, go, pendingAsk, setPendingAsk, setChats } = useKB();
  const { t } = useT();
  const [thread, setThread] = useState<ChatThread>(() => data.user.chats[0] || { id: "main", title: "", messages: [] });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const sent = useRef("");

  useEffect(() => {
    if (!active || !pendingAsk || sent.current === pendingAsk) return;
    sent.current = pendingAsk;
    setPendingAsk("");
    void send(pendingAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pendingAsk]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.messages.length, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: ChatThread = {
      ...thread,
      title: thread.title || q.slice(0, 80),
      messages: [...thread.messages, { role: "user", content: q }],
    };
    setThread(next);
    setDraft("");
    setBusy(true);
    try {
      const res = await api.chat({ question: q, lang });
      const done: ChatThread = {
        ...next,
        messages: [...next.messages, { role: "assistant", content: res.reply, cites: res.cites }],
      };
      setThread(done);
      const chats = [done, ...data.user.chats.filter((c) => c.id !== done.id)].slice(0, 20);
      setChats(chats);
      void api.chats(chats);
    } catch (e) {
      const done: ChatThread = {
        ...next,
        messages: [...next.messages, { role: "assistant", content: e instanceof Error ? e.message : "Error" }],
      };
      setThread(done);
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [t("suggest1"), t("suggest2"), t("suggest3"), t("suggest4")];

  return (
    <div className="chat">
      <h1 className="page-title" style={{ fontSize: 36 }}>{t("assistant")}</h1>
      <p className="lede" style={{ textAlign: "center", marginInline: "auto" }}>{t("assistantLead")}</p>
      <div className="chat-scroll" ref={scroller}>
        {!thread.messages.length && (
          <div className="chat-empty">
            {suggestions.map((s) => (
              <button key={s} type="button" className="suggest" dir="auto" onClick={() => void send(s)}>{s}</button>
            ))}
          </div>
        )}
        {thread.messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "bubble user" : "bubble bot"} dir="auto">
            {m.content}
            {m.cites && m.cites.length > 0 && (
              <div className="cites">
                {m.cites.map((c) => (
                  <button key={c.id} type="button" onClick={() => go({ page: "note", noteId: c.id })} dir="auto">{c.title}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble bot">{t("thinking")}</div>}
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          dir="auto"
          rows={1}
          value={draft}
          placeholder={t("typeAsk")}
          aria-label={t("typeAsk")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
        />
        <button className="btn-ink" type="submit" disabled={busy}>{t("ask")}</button>
      </form>
    </div>
  );
}
