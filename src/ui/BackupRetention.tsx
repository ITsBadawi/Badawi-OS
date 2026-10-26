import { uiFormat, uiText } from "../localization.ts";
import React, { useEffect, useState } from "react";
import { useApp } from "./context.tsx";
import { Confirm, when } from "./shared.tsx";
export function BackupRetention() {
  const { data, act } = useApp(),
    policy = data.drive.retention || { keepLatest: 10, olderThanDays: 30 };
  const [keep, setKeep] = useState(policy.keepLatest),
    [days, setDays] = useState(policy.olderThanDays),
    [preview, setPreview] = useState<any>(null),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setKeep(policy.keepLatest);
    setDays(policy.olderThanDays);
    setPreview(null);
  }, [policy.keepLatest, policy.olderThanDays]);
  const saved = keep === policy.keepLatest && days === policy.olderThanDays;
  return (
    <section className="paper settings-panel">
      <h2>{uiText("الاحتفاظ وحماية النسخ")}</h2>
      <p>
        {uiText(
          "تُحمى أحدث نسختين سليمتين دائماً، وتُستثنى أي نسخة تحميها يدوياً. التنظيف ينقل النسخ المختارة إلى سلة Google Drive بعد معاينتك وموافقتك؛ Google قد يحذف محتويات السلة تلقائياً وفق سياسته.",
        )}
      </p>
      <label className="field">
        {uiText("عدد أحدث النسخ التي تبقى")}
        <input
          aria-label={uiText("عدد النسخ المحتفظ بها")}
          type="number"
          min="2"
          max="1000"
          value={keep}
          onChange={(e) => {
            setKeep(Number(e.target.value));
            setPreview(null);
          }}
        />
      </label>
      <label className="field">
        {uiText("لا تنظّف نسخاً أحدث من عدد الأيام")}
        <input
          aria-label={uiText("عمر النسخ قبل التنظيف")}
          type="number"
          min="1"
          max="3650"
          value={days}
          onChange={(e) => {
            setDays(Number(e.target.value));
            setPreview(null);
          }}
        />
      </label>
      <div className="button-row">
        <button
          className="button secondary"
          disabled={busy || !data.drive.connected}
          onClick={async () => {
            setBusy(true);
            try {
              await act(
                {
                  op: "backup.retention.save",
                  keepLatest: keep,
                  olderThanDays: days,
                },
                uiText("حُفظت سياسة الاحتفاظ"),
              );
              setPreview(null);
            } finally {
              setBusy(false);
            }
          }}
        >
          {uiText("حفظ سياسة الاحتفاظ")}
        </button>
        <button
          className="button secondary"
          disabled={busy || !saved || !data.drive.connected}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await act({ op: "backup.retention.preview" });
              if (result) setPreview(result);
            } finally {
              setBusy(false);
            }
          }}
        >
          {uiText("معاينة تنظيف النسخ")}
        </button>
      </div>
      {!saved && <p>{uiText("احفظ السياسة قبل المعاينة.")}</p>}
      {preview && (
        <div>
          <p>
            {preview.items.length
              ? uiFormat(
                  "ستُنقل {0} نسخ إلى سلة Drive. تنتهي هذه المعاينة خلال خمس دقائق.",
                  [preview.items.length],
                )
              : uiText("لا توجد نسخ مؤهلة للتنظيف وفق سياستك الحالية.")}
          </p>
          {preview.items.map((b: any) => (
            <p key={b.id}>
              <bdi>{b.id}</bdi> · {when(b.createdAt)} ·{" "}
              {Math.ceil(b.size / 1024)} KB
            </p>
          ))}
          {!!preview.items.length && (
            <button
              className="button danger"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              {uiText("مراجعة نقل النسخ إلى السلة")}
            </button>
          )}
        </div>
      )}
      {confirm && preview && (
        <Confirm
          title={uiText("نقل النسخ المعروضة إلى سلة Drive؟")}
          body={uiFormat(
            "العدد: {0}. سيُعاد فحص الحماية والحساب وسلامة النسخ على Drive قبل النقل. لا تُحذف النسخ نهائياً بواسطة Badawi OS.",
            [preview.items.length],
          )}
          button={uiText("أوافق على نقل النسخ المعروضة")}
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              const result = await act(
                { op: "backup.retention.apply", previewId: preview.previewId },
                uiText("تم التحقق من نقل النسخ إلى سلة Drive"),
              );
              setPreview(null);
              return result;
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </section>
  );
}
