import { uiText } from "../localization.ts";
import React, { useState } from "react";
import { Modal } from "./shared.tsx";
export function SelectiveRestore({
  inspection,
  onClose,
  onChoose,
}: {
  inspection: any;
  onClose: () => void;
  onChoose: (selection: any) => void;
}) {
  const [project, setProject] = useState(inspection.projects[0]?.id || ""),
    [selected, setSelected] = useState("");
  const chosen = inspection.projects.find((p: any) => p.id === project),
    folders = [
      ...new Set<string>(
        (chosen?.files || []).flatMap((f: any) =>
          f.path
            .split("/")
            .slice(0, -1)
            .map((_: string, i: number) =>
              f.path
                .split("/")
                .slice(0, i + 1)
                .join("/"),
            ),
        ),
      ),
    ];
  return (
    <Modal title={uiText("استعادة ملفات محددة")} onClose={onClose}>
      <p>
        {uiText(
          "تُستعاد الملفات إلى مجلد جديد فقط، دون إنشاء مساحة نشطة أو تغيير كودك الحالي.",
        )}
      </p>
      <label className="field">
        {uiText("المشروع داخل النسخة")}
        <select
          aria-label={uiText("مشروع الاستعادة")}
          value={project}
          onChange={(e) => {
            setProject(e.target.value);
            setSelected("");
          }}
        >
          {inspection.projects.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.files.length})
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {uiText("الملف أو المجلد")}
        <select
          aria-label={uiText("ملف أو مجلد الاستعادة")}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">{uiText("ملفات المشروع بالكامل")}</option>
          {folders.map((p) => (
            <option key={"d" + p} value={p}>
              {p}/
            </option>
          ))}
          {chosen?.files.map((f: any) => (
            <option key={f.path} value={f.path}>
              {f.path}
            </option>
          ))}
        </select>
      </label>
      {!project && (
        <p>
          {uiText(
            "هذه النسخة لا تحتوي أرشيف ملفات مشاريع؛ يمكنك استعادة بيانات التطبيق كاملة.",
          )}
        </p>
      )}
      <button
        className="button primary"
        disabled={!project}
        onClick={() =>
          onChoose({
            projectId: project,
            ...(selected ? { path: selected } : {}),
          })
        }
      >
        {uiText("مراجعة استعادة الاختيار")}
      </button>
    </Modal>
  );
}
