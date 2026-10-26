import { uiFormat, uiText } from "../localization.ts";
import React, { useState } from "react";
import { useApp } from "./context.tsx";
export function BackupScope({ project: p }: { project: any }) {
  const { act } = useApp(),
    [include, setInclude] = useState<string>(
      (p.backupInclude || []).join("\n"),
    ),
    [exclude, setExclude] = useState<string>(
      (p.backupExclude || []).join("\n"),
    );
  const lines = (s: string) =>
    s
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  return (
    <div>
      <p>
        {uiText(
          "مسار نسبي واحد في كل سطر، لملف أو مجلد. ترك التضمين فارغاً يشمل كل الملفات المسموحة. تبقى الأسرار مستثناة دائماً.",
        )}
      </p>
      <label className="field">
        {uiText("تضمين هذه المسارات فقط")}
        <textarea
          aria-label={uiFormat("تضمين {0}", [p.name])}
          dir="ltr"
          rows={3}
          value={include}
          onChange={(e) => setInclude(e.target.value)}
        />
      </label>
      <label className="field">
        {uiText("استثناء هذه المسارات")}
        <textarea
          aria-label={uiFormat("استثناء {0}", [p.name])}
          dir="ltr"
          rows={3}
          value={exclude}
          onChange={(e) => setExclude(e.target.value)}
        />
      </label>
      <button
        className="button secondary"
        onClick={() =>
          void act(
            {
              op: "project.backupScope",
              id: p.id,
              includePaths: lines(include),
              excludePaths: lines(exclude),
            },
            uiText("حُفظ نطاق النسخ لهذا المجلد"),
          )
        }
      >
        {uiText("حفظ نطاق النسخ")}
      </button>
    </div>
  );
}
