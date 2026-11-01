import { useMemo, useState } from "react";
import { PromptsWord } from "../bits";
import { useT } from "../i18n";
import { useKB } from "../kb";

export function Prompts() {
  const { data, go } = useKB();
  const { t } = useT();
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState("");
  const [n, setN] = useState(40);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return data.prompts.filter((p) => {
      if (kind !== "all" && p.kind !== kind) return false;
      if (!query) return true;
      return `${p.title}\n${p.text}`.toLowerCase().includes(query);
    });
  }, [data.prompts, kind, q]);

  const shown = rows.slice(0, n);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title"><PromptsWord /></h1>
          <p className="lede">{t("promptsLead")}</p>
        </div>
        <div className="tools">
          <div className="seg">
            {["all", "prompt", "command", "code"].map((k) => (
              <button key={k} type="button" className={kind === k ? "is-on" : ""} onClick={() => { setKind(k); setN(40); }}>
                {k === "all" ? t("all") : k === "prompt" ? "Prompts" : k === "command" ? (t("copy") === "Copy" ? "Commands" : "أوامر") : (t("copy") === "Copy" ? "Code" : "أكواد")}
              </button>
            ))}
          </div>
          <input className="field" dir="auto" value={q} placeholder={t("searchPh")} aria-label={t("searchPh")} onChange={(e) => { setQ(e.target.value); setN(40); }} />
        </div>
      </div>
      <p className="kicker" style={{ marginBottom: 10 }}>{rows.length} {t("results")}</p>
      <div className="list">
        {shown.map((p) => (
          <article key={p.id} className="prompt-card">
            <div className="prompt-top">
              <span className="tag" dir="ltr">{p.kind}</span>
              <strong dir="auto" className="clamp-1" style={{ flex: 1 }}>{p.title || p.kind}</strong>
              <button
                type="button"
                className="btn-line"
                onClick={() => {
                  void navigator.clipboard.writeText(p.text);
                  setCopied(p.id);
                }}
              >
                {copied === p.id ? t("copied") : t("copy")}
              </button>
            </div>
            <pre className="codeblock" dir="auto">{p.text}</pre>
            <button type="button" className="back" onClick={() => go({ page: "note", noteId: p.item_id })}>{t("open")}</button>
          </article>
        ))}
      </div>
      {n < rows.length && (
        <button type="button" className="btn-line" style={{ marginTop: 12 }} onClick={() => setN((v) => v + 40)}>{t("results")} +</button>
      )}
      {!rows.length && <p className="empty">{t("nothing")}</p>}
    </div>
  );
}
