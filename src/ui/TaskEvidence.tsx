import { uiFormat, uiLabels, uiText } from "../localization.ts";
import React, { useState } from "react";
import { useApp, errorText } from "./context.tsx";
import { when } from "./shared.tsx";
export const verificationLabels: Record<string, string> = uiLabels({
  verified: "متحقق منها",
  needsReview: "تحتاج مراجعة",
  unverified: "تعذّر التحقق",
  inProgress: "قيد العمل",
});
const sourceLabels: Record<string, string> = uiLabels({
  manual: "مراجعتك الشخصية",
  gitCommit: "Commit محلي",
  ci: "GitHub Actions / CI",
  deployment: "حالة النشر",
});
export function CriteriaEditor({
  criteria,
  onChange,
}: {
  criteria: any[];
  onChange: (criteria: any[]) => void;
}) {
  const update = (id: string, value: any) =>
    onChange(criteria.map((c) => (c.id === id ? { ...c, ...value } : c)));
  return (
    <section>
      <h3>{uiText("معايير الإنجاز")}</h3>
      <p className="muted">
        {uiText(
          "حدد ما يثبت إنجاز المهمة. وجود Commit أو CI ناجح دليل فني؛ تأكيد أن النتيجة تحقق المعيار يبقى بمراجعتك.",
        )}
      </p>
      {criteria.map((c, i) => (
        <div className="paper" key={c.id}>
          <label className="field">
            {uiText("المعيار ")}
            {i + 1}
            <input
              aria-label={uiFormat("معيار الإنجاز {0}", [i + 1])}
              value={c.text}
              maxLength={300}
              required
              onChange={(e) => update(c.id, { text: e.target.value })}
            />
          </label>
          <label className="field">
            {uiText("مصدر الدليل")}
            <select
              aria-label={uiFormat("مصدر دليل المعيار {0}", [i + 1])}
              value={c.source}
              onChange={(e) =>
                update(c.id, { source: e.target.value, target: undefined })
              }
            >
              {Object.entries(sourceLabels).map(([id, label]) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {c.source === "ci" && (
            <label className="field">
              {uiText("اسم أو مسار Workflow للاختبارات، اختياري")}
              <input
                aria-label={uiFormat("Workflow المعيار {0}", [i + 1])}
                value={c.target || ""}
                maxLength={200}
                dir="ltr"
                placeholder=".github/workflows/tests.yml"
                onChange={(e) =>
                  update(c.id, { target: e.target.value || undefined })
                }
              />
            </label>
          )}
          {c.source === "deployment" && (
            <label className="field">
              {uiText("خدمة النشر")}
              <select
                aria-label={uiFormat("خدمة نشر المعيار {0}", [i + 1])}
                value={c.target || "vercel"}
                onChange={(e) => update(c.id, { target: e.target.value })}
              >
                <option value="vercel">Vercel</option>
                <option value="railway">Railway</option>
              </select>
            </label>
          )}
          <button
            type="button"
            className="text-button danger-text"
            aria-label={uiFormat("حذف معيار الإنجاز {0}", [i + 1])}
            onClick={() => onChange(criteria.filter((x) => x.id !== c.id))}
          >
            {uiText("إزالة المعيار")}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={criteria.length >= 20}
        onClick={() =>
          onChange([
            ...criteria,
            { id: crypto.randomUUID(), text: "", source: "manual" },
          ])
        }
      >
        {uiText("إضافة معيار إنجاز")}
      </button>
    </section>
  );
}
export function TaskEvidence({ taskId }: { taskId: string }) {
  const { data, act } = useApp(),
    [busy, setBusy] = useState(false),
    task = data.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const v = task.verificationStatus || {
      state: task.done ? "unverified" : "inProgress",
      stale: false,
    },
    receipt = task.verification;
  return (
    <details className="task-evidence">
      <summary>{uiText("معايير وأدلة الإنجاز")}</summary>
      <p>
        <span
          className={`badge ${v.state === "verified" ? "success" : "warning"}`}
        >
          {verificationLabels[v.state] || uiText("تعذّر التحقق")}
        </span>
      </p>
      {!task.acceptanceCriteria?.length && (
        <p>
          {uiText(
            "لم تحدد معايير إنجاز لهذه المهمة. وضع علامة مكتملة وحده لا يثبت تحقق النتيجة.",
          )}
        </p>
      )}
      {task.acceptanceCriteria?.map((c: any, i: number) => {
        const evidence = receipt?.evidence?.find(
          (e: any) => e.criterionId === c.id,
        );
        return (
          <section key={c.id}>
            <p>
              <strong>{c.text}</strong> · {sourceLabels[c.source]}
            </p>
            <label className="check-field">
              <input
                aria-label={uiFormat("راجعت المعيار {0} وأؤكد تحققه", [i + 1])}
                type="checkbox"
                checked={!!task.acceptanceReviews?.[c.id]?.accepted}
                disabled={busy}
                onChange={async (e) => {
                  const accepted = e.target.checked;
                  setBusy(true);
                  try {
                    await act(
                      {
                        op: "task.criteria.review",
                        id: task.id,
                        criterionId: c.id,
                        accepted,
                      },
                      uiText("حُفظت مراجعتك"),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              {uiText("راجعت النتيجة وأؤكد تحقق هذا المعيار")}
            </label>
            {evidence && (
              <p className="muted">
                {uiText("مصدر الدليل:")}{" "}
                {evidence.provider || sourceLabels[evidence.source]} ·{" "}
                {evidence.status === "verified"
                  ? uiText("الدليل متحقق منه")
                  : evidence.status === "failed"
                    ? uiText("الدليل لا يطابق المطلوب")
                    : uiText("الدليل غير متاح")}
                {evidence.reference && (
                  <>
                    <br />
                    <bdi>{evidence.reference}</bdi>
                  </>
                )}
                {evidence.observedAt && (
                  <>
                    <br />
                    {uiText("وقت قراءة المصدر: ")}
                    {when(evidence.observedAt)}
                  </>
                )}
                {evidence.reason && (
                  <>
                    <br />
                    {errorText(evidence.reason)}
                  </>
                )}
              </p>
            )}
          </section>
        );
      })}
      {v.stale && (
        <p className="warning-text">
          {uiText(
            "تغيّرت المهمة أو المراجعة أو ربط المشروع بعد آخر فحص. الأدلة المعروضة تاريخية وتحتاج فحصاً جديداً.",
          )}
        </p>
      )}
      {v.checkedAt && (
        <small>
          {uiText("آخر فحص مسجل: ")}
          {when(v.checkedAt)}
          {uiText("؛ هذه قراءة مؤرخة وليست مراقبة لحظية للمصادر الخارجية.")}
        </small>
      )}
      <button
        className="button secondary small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await act({ op: "task.verify", id: task.id });
          } finally {
            setBusy(false);
          }
        }}
      >
        {uiText("فحص أدلة المهمة")}
      </button>
    </details>
  );
}
