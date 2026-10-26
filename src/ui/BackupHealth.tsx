import { localeTag } from "../localization.ts";
import { uiText } from "../localization.ts";
import React, { useState, useEffect } from "react";
import { useApp } from "./context.tsx";
import { when } from "./shared.tsx";
export function BackupHealth() {
  const { data, act } = useApp(),
    [date, setDate] = useState(data.drive.planExpiry || ""),
    [busy, setBusy] = useState(false);
  const q = data.drive.quota;
  useEffect(
    () => setDate(data.drive.planExpiry || ""),
    [data.drive.planExpiry],
  );
  const size = (n: number) =>
    (n / 1024 ** 3).toLocaleString(localeTag(), { maximumFractionDigits: 2 }) +
    " GiB";
  return (
    <section className="paper settings-panel">
      <h2>{uiText("السعة وتجديد الباقة")}</h2>
      {q ? (
        <p>
          {uiText("المستخدم: ")}
          {size(q.used)}
          {uiText(" · السعة:")}{" "}
          {q.limit === null ? uiText("غير محددة من Google") : size(q.limit)}
          {uiText(" · المتبقي:")}{" "}
          {q.available === null ? uiText("غير محدد") : size(q.available)}
          <br />
          <small>
            {uiText("آخر قراءة من Google: ")}
            {when(q.checkedAt)}
          </small>
        </p>
      ) : (
        <p>
          {uiText(
            "لم تُقرأ السعة بعد. قراءة السعة تتطلب اتصال Drive وتشغيل المحرك.",
          )}
        </p>
      )}
      <button
        className="button secondary"
        disabled={!data.drive.connected || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await act({ op: "drive.quota" });
          } finally {
            setBusy(false);
          }
        }}
      >
        {uiText("تحديث سعة Drive")}
      </button>
      <label className="field">
        {uiText("تاريخ انتهاء باقة Drive الذي تحدده")}
        <input
          aria-label={uiText("تاريخ انتهاء باقة Drive")}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <button
        className="button secondary"
        disabled={!data.drive.connected}
        onClick={() =>
          void act(
            { op: "backup.expiry", date: date || null },
            uiText("حُفظ تاريخ الباقة"),
          )
        }
      >
        {uiText("حفظ تذكير الباقة")}
      </button>
      <p className="settings-note">
        {uiText(
          "تذكير محلي قبل 7 أيام، مرة في اليوم أثناء تشغيل المحرك. التاريخ من إدخالك؛ لا يقرأ البرنامج معلومات فوترة Google.",
        )}
      </p>
    </section>
  );
}
