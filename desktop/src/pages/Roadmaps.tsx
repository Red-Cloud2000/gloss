import { useState } from "react";
import { Bar } from "../bits";
import { useT } from "../i18n";
import { useKB } from "../kb";
import { api } from "../api";
import { displayTitle, openExternal } from "../text";
import type { Roadmap, Step } from "../types";

function progressOf(step: Step, tried: (id: string) => boolean, done: boolean) {
  if (done) return 1;
  const ids = step.item_ids || [];
  if (!ids.length) return 0;
  return ids.filter(tried).length / ids.length;
}

export function Roadmaps() {
  const { data, lang, go } = useKB();
  const { t } = useT();
  return (
    <div>
      <h1 className="page-title">{t("roadmaps")}</h1>
      <p className="lede">{lang === "ar" ? "مسارات مرتبة. الخطوة المدمجة تعرض كل مصادرها." : "Ordered paths. A merged step shows every source."}</p>
      <div className="card-grid" style={{ marginTop: 16 }}>
        {data.roadmaps.map((rm) => {
          const p = rm.steps.length
            ? rm.steps.reduce((n, s) => n + progressOf(s, (id) => Boolean(data.user.items[id]?.tried), Boolean(data.user.stepsDone[s.id])), 0) / rm.steps.length
            : 0;
          return (
            <button key={rm.id} type="button" className="gcard" onClick={() => go({ page: "roadmap", roadmapId: rm.id })}>
              <span className="gcard-body">
                <span className="kicker" style={{ color: rm.color }}>{rm.emoji}</span>
                <h3 className="gcard-title" dir="auto">{lang === "en" ? rm.title_en || rm.title_ar : rm.title_ar}</h3>
                <p className="gcard-line" dir="auto">{lang === "en" ? rm.description_en || rm.description_ar : rm.description_ar}</p>
                <span className="gcard-foot">{rm.steps.length} {t("steps")} · {Math.round(p * 100)}%</span>
                <Bar value={p} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RoadmapDetail({ id }: { id: string }) {
  const { data, lang, go } = useKB();
  const { t } = useT();
  const rm = data.roadmaps.find((r) => r.id === id);
  if (!rm) return <p className="empty">{t("nothing")}</p>;
  const p = rm.steps.length
    ? rm.steps.reduce((n, s) => n + progressOf(s, (i) => Boolean(data.user.items[i]?.tried), Boolean(data.user.stepsDone[s.id])), 0) / rm.steps.length
    : 0;
  return (
    <div>
      <button type="button" className="back" onClick={() => go({ page: "roadmaps" })}>{t("roadmaps")}</button>
      <p className="kicker" style={{ color: rm.color }}>{rm.emoji} {Math.round(p * 100)}% · {rm.steps.length} {t("steps")}</p>
      <h1 className="page-title" dir="auto">{lang === "en" ? rm.title_en || rm.title_ar : rm.title_ar}</h1>
      <p className="lede" dir="auto">{lang === "en" ? rm.description_en || rm.description_ar : rm.description_ar}</p>
      <Bar value={p} />
      <div style={{ marginTop: 16 }}>
        {[...rm.steps].sort((a, b) => a.order - b.order).map((s, i) => (
          <button key={s.id} type="button" className="step" onClick={() => go({ page: "step", roadmapId: rm.id, stepId: s.id })}>
            <span className="kicker">{i + 1} · {s.est_minutes}m · {s.difficulty}</span>
            <h3 dir="auto">{lang === "en" ? s.title_en || s.title_ar : s.title_ar}</h3>
            <p className="muted" dir="auto" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", margin: "6px 0 0" }}>
              {lang === "en" ? s.merged_takeaway_en || s.merged_takeaway_ar : s.merged_takeaway_ar}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function StepDetail({ roadmapId, stepId }: { roadmapId: string; stepId: string }) {
  const { data, lang, go, setSteps } = useKB();
  const { t } = useT();
  const rm = data.roadmaps.find((r) => r.id === roadmapId) as Roadmap | undefined;
  const step = rm?.steps.find((s) => s.id === stepId);
  const quiz = data.quizzes[stepId] || [];
  const saved = data.user.quiz[stepId];
  const [answers, setAnswers] = useState<number[]>(saved?.answers || []);
  const [score, setScore] = useState<number | null>(saved ? saved.score : null);
  if (!rm || !step) return <p className="empty">{t("nothing")}</p>;
  const title = lang === "en" ? step.title_en || step.title_ar : step.title_ar;
  const takeaway = lang === "en" ? step.merged_takeaway_en || step.merged_takeaway_ar : step.merged_takeaway_ar;

  const submit = async () => {
    let s = 0;
    quiz.forEach((q, i) => {
      if (answers[i] === q.answer_index) s++;
    });
    setScore(s);
    await api.quiz(stepId, answers, s);
    setSteps({ ...data.user.stepsDone });
  };

  return (
    <div>
      <button type="button" className="back" onClick={() => go({ page: "roadmap", roadmapId })}>{lang === "en" ? rm.title_en : rm.title_ar}</button>
      <p className="kicker">{step.order} · {step.est_minutes}m · {step.difficulty}</p>
      <h1 className="page-title" dir="auto">{title}</h1>
      <section className="brief">
        <h2>{t("summary")}</h2>
        <p className="sum" dir="auto">{takeaway}</p>
      </section>
      <button
        type="button"
        className={data.user.stepsDone[step.id] ? "btn-ink" : "btn-line"}
        onClick={async () => {
          const done = !data.user.stepsDone[step.id];
          const next = { ...data.user.stepsDone };
          if (done) next[step.id] = true;
          else delete next[step.id];
          setSteps(next);
          await api.step(step.id, done);
        }}
      >
        {t("markDone")}
      </button>

      <div className="section-label">{t("sources")} · {step.item_ids.length}</div>
      {step.item_ids.map((id) => {
        const it = data.items.find((x) => x.id === id);
        const unique = step.unique_per_item?.[id] || "";
        const url = it?.original_url || "";
        return (
          <article key={id} className="src">
            <h3 dir="auto" style={{ margin: "0 0 6px", fontFamily: "var(--font-serif)", fontSize: 18 }}>{it ? displayTitle(it, lang) : id}</h3>
            {unique && <p dir="auto" style={{ margin: "0 0 8px" }}><span className="kicker">{t("adds")}</span><br />{unique}</p>}
            <div className="tools">
              {it && <button type="button" className="btn-line" onClick={() => go({ page: "note", noteId: id })}>{t("open")}</button>}
              {url && (
                <button type="button" className="btn-ghost" onClick={() => openExternal(url)}>
                  {t("original")}
                </button>
              )}
            </div>
            {url && <p className="url-clip" style={{ marginTop: 8 }}>{url}</p>}
          </article>
        );
      })}

      {quiz.length > 0 && (
        <section style={{ marginTop: 18 }}>
          <h2 className="page-title" style={{ fontSize: 28 }}>{t("quiz")}</h2>
          {quiz.map((q, i) => {
            const question = lang === "en" ? q.q_en || q.q_ar : q.q_ar;
            const options = lang === "en" && q.options_en?.length ? q.options_en : q.options_ar;
            return (
              <fieldset key={i} className="src" style={{ border: "1px solid var(--rule)" }}>
                <legend dir="auto">{i + 1}. {question}</legend>
                {options.map((op, j) => (
                  <label key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 6 }}>
                    <input type="radio" name={`q${i}`} checked={answers[i] === j} onChange={() => setAnswers((a) => { const n = [...a]; n[i] = j; return n; })} />
                    <span dir="auto">{op}</span>
                  </label>
                ))}
                {score !== null && (
                  <p dir="auto" className={answers[i] === q.answer_index ? "muted" : "err"} style={{ marginTop: 8 }}>
                    {answers[i] === q.answer_index ? t("correct") : (lang === "en" ? q.explanation_en || q.explanation_ar : q.explanation_ar)}
                  </p>
                )}
              </fieldset>
            );
          })}
          <button type="button" className="btn-ink" style={{ marginTop: 8 }} onClick={() => void submit()}>{t("check")}</button>
          {score !== null && <p className="muted"><bdi dir="ltr">{score} / {quiz.length}</bdi></p>}
        </section>
      )}
    </div>
  );
}
