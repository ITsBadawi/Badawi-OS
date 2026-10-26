import React, { useState } from "react";
import { uiText, uiFormat } from "../localization.ts";
import { useApp } from "./context.tsx";
import { Modal, when } from "./shared.tsx";
export function WorkflowRecovery({
  preview,
  onClose,
}: {
  preview: any;
  onClose: () => void;
}) {
  const { data, act, toast } = useApp();
  const [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false);
  const kinds: Record<string, string> = {
    reminder: uiText("تذكير"),
    report: uiText("تقرير المشروع"),
    backup: uiText("نسخ مشفّر إلى Drive"),
    summary: uiText("تلخيص الملاحظات"),
    briefing: uiText("موجز بالذكاء الاصطناعي"),
    integration: uiText("متابعة حالة النشر"),
  };
  return (
    <Modal title={uiText("مراجعة استكمال الأتمتة")} wide onClose={onClose}>
      <h3>{preview.jobName}</h3>
      <p>
        {uiText(
          "ستبقى الخطوات المثبتة كما نُفذت سابقاً، ويُحاول تشغيل الخطوات المتبقية فقط. المراجع السابقة تاريخية ولا تعني فحصاً جديداً للخدمات.",
        )}
      </p>
      <h3>{uiFormat("خطوات سابقة لن تتكرر ({0})", [preview.reused.length])}</h3>
      {preview.reused.map((step: any) => (
        <div className="setting-row" key={step.index}>
          <div>
            <strong>
              {step.index + 1}. {step.name}
            </strong>
            <small>
              {kinds[step.kind] || step.kind} · {when(step.finishedAt)}
            </small>
            <small>
              {uiText("مرجع التنفيذ السابق: ")}
              <bdi>{step.receiptId}</bdi>
            </small>
          </div>
        </div>
      ))}
      <h3>{uiFormat("الخطوات المتبقية ({0})", [preview.remaining.length])}</h3>
      {preview.remaining.map((step: any) => (
        <div className="setting-row" key={step.index}>
          <div>
            <strong>
              {step.index + 1}. {step.name}
            </strong>
            <p>
              {kinds[step.kind] || step.kind}
              {step.projectName && ` · ${step.projectName}`}
              {step.provider && ` · ${step.provider}`}
              {step.integration && ` · ${step.integration}`}
            </p>
            {step.message && <pre dir="auto">{step.message}</pre>}
            {step.noteIds.length > 0 && (
              <p>
                {step.noteIds
                  .map(
                    (id: string) =>
                      data.notes.find((n) => n.id === id)?.title || id,
                  )
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>
      ))}
      {preview.remaining.length === 0 && (
        <p>
          {uiText(
            "كل الخطوات لها إيصالات متحققة. يؤكد هذا الإجراء نهاية التشغيل دون إعادة تنفيذها.",
          )}
        </p>
      )}
      {preview.requiresUncertainAck && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          {uiText(
            "أوافق على إعادة محاولة الخطوة غير المؤكدة. قد يكون طلب AI أو رفع نسخة قد بدأ سابقاً، وقد تُحتسب محاولة أخرى.",
          )}
        </label>
      )}
      <p className="muted">
        {uiFormat(
          "تنتهي المعاينة في {0}. تُراجع الصلاحيات والشرط والمحرك مجدداً قبل المتابعة.",
          [when(preview.expiresAt)],
        )}
      </p>
      {(data.engine.mode !== "Running" || data.engine.gaming) && (
        <p className="info-strip">
          {uiText(
            "شغّل المحرك وأوقف وضع اللعب، ثم أعد المعاينة قبل الاستكمال.",
          )}
        </p>
      )}
      <div className="form-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          {uiText("إلغاء")}
        </button>
        <button
          className="button primary"
          disabled={
            busy ||
            data.engine.mode !== "Running" ||
            data.engine.gaming ||
            !!data.engine.active ||
            (preview.requiresUncertainAck && !ack)
          }
          onClick={async () => {
            setBusy(true);
            try {
              const run = await act({
                op: "workflow.recovery.apply",
                approvalId: preview.approvalId,
                acknowledgeUncertain: ack,
              });
              if (run) {
                toast(
                  run.status === "succeeded"
                    ? uiText("اكتمل الاستئناف بإيصالات التنفيذ الفعلية")
                    : uiText(
                        "انتهت محاولة الاستئناف. راجع السبب والخطوات في السجل.",
                      ),
                );
                onClose();
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? uiText("يعمل…") : uiText("استكمال الخطوات المتبقية")}
        </button>
      </div>
    </Modal>
  );
}
