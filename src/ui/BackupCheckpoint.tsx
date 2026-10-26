import { uiFormat, uiText } from "../localization.ts";
import React, { useState } from "react";
import { useApp } from "./context.tsx";
import { Modal, when } from "./shared.tsx";
export function BackupCheckpoint({ backup }: { backup: any }) {
  const { data, act } = useApp(),
    [preview, setPreview] = useState<any>(null),
    [busy, setBusy] = useState(false);
  if (
    !["checkpointed", "prepared", "uploading", "verifying"].includes(
      backup.status,
    )
  )
    return null;
  return (
    <>
      <button
        className="button secondary small"
        disabled={busy || !!data.engine.active}
        onClick={async () => {
          setBusy(true);
          try {
            const p = await act({
              op: "backup.discard.preview",
              id: backup.id,
            });
            if (p) setPreview(p);
          } finally {
            setBusy(false);
          }
        }}
      >
        {uiText("إلغاء تجهيز النسخة")}
      </button>
      {preview && (
        <Modal
          title={uiText("مراجعة إلغاء التجهيز المحلي")}
          onClose={() => {
            if (!busy) setPreview(null);
          }}
        >
          <p>
            {uiText(
              "سيُحذف ملف التجهيز المشفّر المؤقت لهذه المحاولة وتُزال جلسة استئنافها المحلية. لن يمكن استئناف هذه المحاولة؛ النسخ التالي يلتقط اختيارك الحالي من جديد.",
            )}
          </p>
          <dl>
            <dt>{uiText("بدء المحاولة")}</dt>
            <dd>
              {preview.createdAt ? when(preview.createdAt) : uiText("سجل قديم")}
            </dd>
            <dt>{uiText("الملف المؤقت")}</dt>
            <dd>
              {preview.stagePresent
                ? uiFormat("{0} بايت", [preview.stageBytes])
                : uiText("غير موجود؛ سيُغلق سجل المحاولة فقط")}
            </dd>
            <dt>{uiText("تقدم الرفع المسجل")}</dt>
            <dd>
              {preview.offset}
              {uiText(" بايت")}
            </dd>
            <dt>{uiText("مصادر الملفات")}</dt>
            <dd>
              {preview.projectIds?.length
                ? preview.projectIds
                    .map(
                      (id: string) =>
                        data.projects.find((p) => p.id === id)?.name || id,
                    )
                    .join(uiText("، "))
                : uiText("اختيار المصادر العام وقت المحاولة")}
            </dd>
          </dl>
          {!preview.currentAccount && (
            <p className="warning-text">
              {uiText(
                "هذه المحاولة تخص حساب Drive سابقاً؛ الإلغاء يزيل التجهيز المحلي فقط.",
              )}
            </p>
          )}
          <p className="info-strip">
            {uiText("لا يحذف هذا الإجراء أي نسخة من Google Drive.")}{" "}
            {preview.remoteMayExist
              ? uiText(
                  "قد يبقى ملف بعيد لهذه المحاولة؛ هذا الإلغاء لا يتحقق من اكتماله أو سلامته.",
                )
              : ""}
          </p>
          <small>
            {uiText(
              "المعاينة صالحة لخمس دقائق ولمرة واحدة. تغيّر السجل أو الملف أو حساب Drive يتطلب معاينة جديدة.",
            )}
          </small>
          {data.engine.mode !== "Running" && (
            <p>
              {uiText(
                "شغّل المحرك قبل التأكيد ليتم الإلغاء ضمن عملية واحدة محمية.",
              )}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              {uiText("تراجع")}
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                !!data.engine.active ||
                data.engine.mode !== "Running" ||
                data.engine.gaming
              }
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await act(
                    {
                      op: "backup.discard.apply",
                      approvalId: preview.approvalId,
                    },
                    uiText("أُلغي التجهيز المحلي؛ ملفات Drive لم تتغير"),
                  );
                  if (r) setPreview(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {uiText("أوافق على إلغاء التجهيز المحلي")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
