import { uiFormat, uiText } from "../localization.ts";
import React from "react";
import { IntegrationTarget } from "./IntegrationMonitor.tsx";
import { useApp } from "./context.tsx";
export function WorkflowSteps({
  steps,
  onChange,
}: {
  steps: any[];
  onChange: (v: any[]) => void;
}) {
  const { data } = useApp();
  const update = (i: number, v: any) =>
    onChange(steps.map((s, n) => (n === i ? { ...s, ...v } : s)));
  return (
    <section>
      <h3>{uiText("خطوات الأتمتة بالترتيب")}</h3>
      <p className="muted">
        {uiText("كل خطوة تنتظر نجاح السابقة. يمكنك استعمال ")}
        {"{{previous}}"}
        {uiText(
          " في التذكير لإدراج نتيجة الخطوة السابقة. أي انقطاع يُسجّل للمراجعة، دون إعادة الخطوات الناجحة تلقائياً.",
        )}
      </p>
      {steps.map((s, i) => (
        <div className="workflow-step" key={i}>
          <div className="form-actions split">
            <strong>
              {uiText("الخطوة ")}
              {i + 1}
            </strong>
            <div className="button-wrap">
              <button
                className="text-button"
                type="button"
                disabled={!i}
                onClick={() => {
                  const next = [...steps];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  onChange(next);
                }}
              >
                {uiText("للأعلى")}
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => onChange(steps.filter((_, n) => n !== i))}
              >
                {uiText("إزالة")}
              </button>
            </div>
          </div>
          <label className="field">
            {uiText("اسم الخطوة")}
            <input
              required
              maxLength={160}
              value={s.name}
              onChange={(e) => update(i, { name: e.target.value })}
            />
          </label>
          <label className="field">
            {uiText("الإجراء")}
            <select
              value={s.kind}
              onChange={(e) =>
                update(i, {
                  kind: e.target.value,
                  projectId: undefined,
                  provider: undefined,
                  noteIds: undefined,
                  integration:
                    e.target.value === "integration" ? "github" : undefined,
                })
              }
            >
              <option value="reminder">{uiText("تذكير وإشعار")}</option>
              <option value="report">{uiText("تقرير مشروع محلي")}</option>
              <option value="summary">{uiText("تلخيص ملاحظات")}</option>
              <option value="briefing">
                {uiText("موجز المهام بالذكاء الاصطناعي")}
              </option>
              <option value="backup">{uiText("نسخ مشفّر إلى Drive")}</option>
              <option value="integration">
                {uiText("فحص GitHub أو حالة النشر")}
              </option>
            </select>
          </label>
          {s.kind === "integration" && (
            <IntegrationTarget
              integration={s.integration || "github"}
              projectId={s.projectId || ""}
              onChange={(v) => update(i, v)}
            />
          )}
          {s.kind === "reminder" && (
            <label className="field">
              {uiText("رسالة التذكير")}
              <textarea
                maxLength={1000}
                value={s.message || ""}
                onChange={(e) => update(i, { message: e.target.value })}
              />
            </label>
          )}
          {s.kind === "backup" && (
            <label className="field">
              {uiText("مصدر ملفات النسخة")}
              <select
                value={s.projectId || ""}
                onChange={(e) =>
                  update(i, { projectId: e.target.value || undefined })
                }
              >
                <option value="">{uiText("كل المجلدات المصرح بنسخها")}</option>
                {data.projects
                  .filter((p) => p.root && p.backupFiles && !p.archived)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {s.kind === "report" && (
            <label className="field">
              {uiText("المشروع")}
              <select
                required
                value={s.projectId || ""}
                onChange={(e) => update(i, { projectId: e.target.value })}
              >
                <option value="">{uiText("اختر مشروعاً")}</option>
                {data.projects
                  .filter((p) => p.root)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {["summary", "briefing"].includes(s.kind) && (
            <label className="field">
              {uiText("خدمة AI")}
              <select
                value={s.provider || ""}
                required
                onChange={(e) => update(i, { provider: e.target.value })}
              >
                <option value="">{uiText("اختر خدمة")}</option>
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="chatgpt">ChatGPT Subscription</option>
              </select>
            </label>
          )}
          {s.kind === "summary" &&
            data.notes.map((n) => (
              <label className="check-field" key={n.id}>
                <input
                  type="checkbox"
                  checked={s.noteIds?.includes(n.id) || false}
                  onChange={(e) =>
                    update(i, {
                      noteIds: e.target.checked
                        ? [...(s.noteIds || []), n.id]
                        : (s.noteIds || []).filter((id: string) => id !== n.id),
                    })
                  }
                />
                {n.title}
              </label>
            ))}
          {s.kind === "briefing" && (
            <p>
              {uiText(
                "يتضمن عناوين المهام الحالية والمستقبلية ومواعيدها وأولوياتها، دون محتوى ملفات المشاريع.",
              )}
            </p>
          )}
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={steps.length >= 8}
        onClick={() =>
          onChange([
            ...steps,
            {
              kind: "reminder",
              name: uiFormat("خطوة {0}", [steps.length + 1]),
              message: "",
            },
          ])
        }
      >
        {uiText("إضافة خطوة")}
      </button>
    </section>
  );
}
