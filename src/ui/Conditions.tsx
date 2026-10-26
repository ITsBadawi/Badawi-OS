import { uiFormat, uiText } from "../localization.ts";
import React, { useState } from "react";
import { useApp, errorText } from "./context.tsx";
import { when } from "./shared.tsx";
export function conditionDescription(condition: any, projectName?: string) {
  const scope = condition.projectId
    ? uiFormat(" في {0}", [projectName || uiText("المشروع المحدد")])
    : uiText(" في مساحة العمل");
  return condition.kind === "backup.stale"
    ? uiFormat(
        "عند غياب نسخة Drive متحقق منها في السجل المحلي خلال {0} ساعة{1}",
        [condition.ageHours, scope],
      )
    : condition.kind === "tasks.open"
      ? uiFormat("عند وجود {0} مهام مفتوحة أو أكثر{1}", [
          condition.minCount,
          scope,
        ])
      : uiFormat("عند وجود {0} مهام متأخرة أو أكثر{1}", [
          condition.minCount,
          scope,
        ]);
}
export function ConditionEditor({
  condition,
  onChange,
  minutes,
  onMinutes,
}: {
  condition: any;
  onChange: (v: any) => void;
  minutes: number;
  onMinutes: (value: number) => void;
}) {
  const { data, act } = useApp(),
    [result, setResult] = useState<any>(null),
    [checked, setChecked] = useState(""),
    [busy, setBusy] = useState(false),
    key = JSON.stringify(condition),
    current = checked === key ? result : null;
  return (
    <section className="paper condition-editor">
      <h3>{uiText("الشرط المحلي")}</h3>
      <label className="field">
        {uiText("نوع الشرط")}
        <select
          aria-label={uiText("نوع الشرط")}
          value={condition.kind}
          onChange={(e) =>
            onChange({
              kind: e.target.value,
              ...(condition.projectId
                ? { projectId: condition.projectId }
                : {}),
              ...(e.target.value === "backup.stale"
                ? { ageHours: 24 }
                : { minCount: 1 }),
            })
          }
        >
          <option value="tasks.overdue">{uiText("عدد المهام المتأخرة")}</option>
          <option value="tasks.open">{uiText("عدد المهام المفتوحة")}</option>
          <option value="backup.stale">
            {uiText("غياب نسخة حديثة في سجل Drive المحلي")}
          </option>
        </select>
      </label>
      <label className="field">
        {uiText("نطاق الشرط")}
        <select
          aria-label={uiText("نطاق الشرط")}
          value={condition.projectId || ""}
          onChange={(e) =>
            onChange({ ...condition, projectId: e.target.value || undefined })
          }
        >
          <option value="">{uiText("كل مساحة العمل")}</option>
          {data.projects
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      {condition.kind === "backup.stale" ? (
        <label className="field">
          {uiText("عمر النسخة بالساعات")}
          <input
            aria-label={uiText("عمر النسخة بالساعات")}
            type="number"
            required
            min={1}
            max={8760}
            value={condition.ageHours}
            onChange={(e) =>
              onChange({ ...condition, ageHours: Number(e.target.value) })
            }
          />
        </label>
      ) : (
        <label className="field">
          {uiText("حد عدد المهام")}
          <input
            aria-label={uiText("حد عدد المهام")}
            type="number"
            required
            min={1}
            max={1000}
            value={condition.minCount}
            onChange={(e) =>
              onChange({ ...condition, minCount: Number(e.target.value) })
            }
          />
        </label>
      )}
      <label className="field">
        {uiText("فترة فحص الشرط")}
        <select
          aria-label={uiText("فترة فحص الشرط")}
          value={minutes}
          onChange={(e) => onMinutes(Number(e.target.value))}
        >
          {[1, 5, 15, 30, 60].map((n) => (
            <option key={n} value={n}>
              {uiText("كل ")}
              {n}
              {uiText(" دقيقة")}
            </option>
          ))}
          {![1, 5, 15, 30, 60].includes(minutes) && (
            <option value={minutes}>
              {uiText("كل ")}
              {minutes}
              {uiText(" دقيقة")}
            </option>
          )}
        </select>
      </label>
      <p>
        <strong>
          {conditionDescription(
            condition,
            data.projects.find((p) => p.id === condition.projectId)?.name,
          )}
        </strong>
        .
      </p>
      <p className="muted">
        {uiText(
          "يعمل الإجراء مرة عند أول مشاهدة متحققة، ثم يحتاج مشاهدة غير متحققة قبل التشغيل التلقائي التالي. التعليق والإيقاف ووضع اللعب يؤجلون المشاهدة؛ الاستئناف يفحص الحالة الحالية فقط. التشغيل اليدوي يعيد فحص الشرط أيضاً.",
        )}
      </p>
      {condition.kind === "backup.stale" && (
        <p>
          {uiText(
            "هذا عمر إيصال النسخة المحلي، وليس فحصاً جديداً لوجودها على Drive. الحساب غير المرتبط يجعل الشرط مجهولاً.",
          )}
        </p>
      )}
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await act({ op: "condition.preview", condition });
            if (r) {
              setChecked(key);
              setResult(r);
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        {uiText("معاينة الشرط الآن")}
      </button>
      {current && (
        <div className="info-strip">
          <div>
            <strong>
              {current.matched === true
                ? uiText("الشرط متحقق")
                : current.matched === false
                  ? uiText("الشرط غير متحقق")
                  : uiText("تعذّر تقييم الشرط")}
            </strong>
            <p>
              {current.value !== null && (
                <>
                  {uiText("القيمة المحلية: ")}
                  {Math.round(current.value * 100) / 100} ·{" "}
                </>
              )}
              {uiText("وقت القراءة: ")}
              {when(current.observedAt)}
            </p>
            <small>
              {uiText("المصدر:")}{" "}
              {current.source === "Local SQLite tasks"
                ? uiText("سجل المهام المحلي")
                : uiText("سجل نسخ Drive المتحقق منها محلياً")}
              {current.sourceAt && (
                <>
                  {uiText(" · آخر تسجيل للمصدر: ")}
                  {when(current.sourceAt)}
                </>
              )}
            </small>
            {current.reason && <p>{errorText(current.reason)}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
