import { useEffect, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import { useKB } from "../kb";

export function AddSheet() {
  const { addOpen, setAddOpen, go, refresh } = useKB();
  const { t } = useT();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"link" | "text">("link");
  const [busy, setBusy] = useState("");
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState("");
  const [needsLogin, setNeedsLogin] = useState("");

  useEffect(() => {
    if (!addOpen) return;
    const seed = sessionStorage.getItem("gloss-add-url");
    if (seed) {
      setUrl(seed);
      setMode("link");
      sessionStorage.removeItem("gloss-add-url");
    }
  }, [addOpen]);

  if (!addOpen) return null;

  async function submitLink(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setNeedsLogin("");
    setBusy(t("loading"));
    setPct(0.05);
    try {
      const { jobId } = await api.importUrl(url.trim());
      for (;;) {
        await new Promise((r) => setTimeout(r, 700));
        const job = await api.job(jobId);
        setBusy(job.label || t("loading"));
        setPct(job.pct || 0);
        if (job.status === "done" && job.itemId) {
          await refresh();
          setAddOpen(false);
          setUrl("");
          go({ page: "note", noteId: job.itemId });
          return;
        }
        if (job.status === "error") {
          setErr(job.error);
          setNeedsLogin(job.needsLogin ? job.platform || "facebook" : "");
          setBusy("");
          return;
        }
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Error");
      setBusy("");
    }
  }

  async function submitText(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(t("keep"));
    try {
      const { itemId } = await api.importText(text);
      await refresh();
      setAddOpen(false);
      setText("");
      go({ page: "note", noteId: itemId });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Error");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="sheet-back" onMouseDown={() => !busy && setAddOpen(false)}>
      <div className="sheet" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={t("add")}>
        <div className="page-head">
          <h2 className="page-title" style={{ fontSize: 32 }}>{t("add")}</h2>
          <button type="button" className="icon-btn" onClick={() => setAddOpen(false)} aria-label="Close">×</button>
        </div>
        <div className="seg" style={{ marginBottom: 12 }}>
          <button type="button" className={mode === "link" ? "is-on" : ""} onClick={() => setMode("link")}>{t("add")}</button>
          <button type="button" className={mode === "text" ? "is-on" : ""} onClick={() => setMode("text")}>{t("paste")}</button>
        </div>
        {mode === "link" ? (
          <form onSubmit={(e) => void submitLink(e)}>
            <div className="import-bar">
              <input dir="ltr" value={busy ? `${busy}` : url} disabled={!!busy} onChange={(e) => setUrl(e.target.value)} placeholder={t("linkPh")} aria-label={t("linkPh")} inputMode="url" autoFocus />
              <button className="btn-ink" type="submit" disabled={!!busy || !url.trim()}>{t("keep")}</button>
              {busy && <span className="import-progress" style={{ transform: `scaleX(${Math.max(0.05, pct)})` }} />}
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void submitText(e)}>
            <textarea className="notes" dir="auto" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("pastePh")} aria-label={t("pastePh")} />
            <button className="btn-ink" type="submit" disabled={!!busy || text.trim().length < 20} style={{ marginTop: 8 }}>{t("keep")}</button>
          </form>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        {needsLogin && window.glossDesktop && (
          <button
            type="button"
            className="btn-line"
            onClick={() => void window.glossDesktop!.openLogin(needsLogin === "instagram" ? "instagram" : "facebook")}
          >
            {t("login")}
          </button>
        )}
      </div>
    </div>
  );
}
