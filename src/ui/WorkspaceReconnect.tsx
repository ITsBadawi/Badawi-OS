import { uiText } from "../localization.ts";
import React, { useState } from "react";
import { useApp } from "./context.tsx";
import { Modal } from "./shared.tsx";
export function WorkspaceReconnect({
  onLinked,
}: {
  onLinked: (project: any) => void;
}) {
  const { data, act } = useApp(),
    workspaces = data.projects.filter(
      (p) => p.kind === "workfiles" && !p.archived,
    );
  const [id, setId] = useState(""),
    [path, setPath] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const selected =
    workspaces.find((p) => p.id === id) ||
    workspaces.find((p) => !p.root) ||
    workspaces[0];
  if (!selected) return null;
  return (
    <details
      className="paper workspace-connect"
      open={workspaces.some((p) => !p.root)}
    >
      <summary>{uiText("ربط مساحة ملفات موجودة أو مستعادة")}</summary>
      <p>
        {uiText(
          "اختر المجلد الأب الذي يحتوي Files وProjects. النسخ المستعادة لمساحات الملفات توجد داخل مجلد الاستعادة، ثم workspaces، ثم معرّف المساحة. الربط يحتفظ بمعرّفها وتصنيفاتها، ويحتاج مراجعتك للمسار الجديد.",
        )}
      </p>
      <label className="field">
        {uiText("مساحة الملفات")}
        <select
          aria-label={uiText("مساحة الملفات لإعادة الربط")}
          value={selected.id}
          onChange={(e) => {
            setId(e.target.value);
            setPreview(null);
          }}
        >
          {workspaces.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
              {!p.root ? uiText(" · تحتاج ربطاً") : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="path-line">
        <bdi>{selected.root || uiText("المسار غير مرتبط")}</bdi>
      </p>
      <label className="field">
        {uiText("مجلد المساحة الموجود")}
        <input
          aria-label={uiText("مجلد المساحة لإعادة الربط")}
          dir="ltr"
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
            setPreview(null);
          }}
          placeholder="C:\Restored\workspaces\workspace-id"
        />
      </label>
      <button
        className="button secondary"
        disabled={
          !path.trim() ||
          busy ||
          data.engine.mode !== "Running" ||
          data.engine.gaming
        }
        onClick={async () => {
          setBusy(true);
          try {
            const r = await act({
              op: "workspace.relink.preview",
              id: selected.id,
              path: path.trim(),
            });
            if (r) setPreview(r);
          } finally {
            setBusy(false);
          }
        }}
      >
        {uiText("معاينة ربط المساحة")}
      </button>
      <p className="muted">
        {uiText(
          "المعاينة تحتاج تشغيل المحرك. لا تُنقل ملفات ولا يُستبدل شيء داخل المجلدات. صلاحيات AI والنسخ والمراقبة والأتمتة المرتبطة تحتاج مراجعة بعد الربط.",
        )}
      </p>
      {preview && (
        <Modal
          title={uiText("مراجعة ربط مساحة الملفات")}
          wide
          onClose={() => setPreview(null)}
        >
          <h3>{preview.name}</h3>
          <p className="path-line">
            <bdi>
              {preview.oldRoot || uiText("غير مرتبط")} → {preview.root}
            </bdi>
          </p>
          <p>
            Files: <bdi>{preview.root}</bdi>
          </p>
          <p>
            Projects: <bdi>{preview.projectsRoot}</bdi>
          </p>
          <p>
            {uiText("ملفات مصنّفة تظهر بمساراتها: ")}
            {preview.present}
            {uiText(" · مسارات لا تظهر في القائمة: ")}
            {preview.missing}
            {uiText(" · روابط إلى مشاريع غير موجودة ستُزال:")}{" "}
            {preview.removedLinks}.
          </p>
          {preview.truncated && (
            <p className="info-strip">
              {uiText(
                "قائمة الملفات محدودة؛ بعض المسارات قد لا تظهر ضمن حد الفحص.",
              )}
            </p>
          )}
          {preview.missing > 0 && (
            <details>
              <summary>
                {uiText("المسارات غير الظاهرة؛ تبقى تصنيفاتها محفوظة")}
              </summary>
              <ul>
                {preview.missingPaths.slice(0, 100).map((p: string) => (
                  <li key={p}>
                    <bdi>{p}</bdi>
                  </li>
                ))}
              </ul>
              {preview.missing > 100 && (
                <p>
                  {uiText("تظهر أول 100 من ")}
                  {preview.missing}
                  {uiText(" مسار.")}
                </p>
              )}
            </details>
          )}
          <p>
            {uiText(
              "هذه مراجعة للمسارات والروابط؛ لا تؤكد أن كل الملفات الأصلية موجودة. ستبقى صلاحيات AI والنسخ والمراقبة غير مفعّلة، وتُعطّل القواعد المرتبطة حتى تراجعها.",
            )}
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setPreview(null)}
            >
              {uiText("إلغاء")}
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await act(
                    {
                      op: "workspace.relink.apply",
                      approvalId: preview.approvalId,
                    },
                    uiText(
                      "رُبطت المساحة؛ راجع صلاحياتها والأتمتة قبل تفعيلها.",
                    ),
                  );
                  if (r) {
                    setPreview(null);
                    setPath("");
                    onLinked(r);
                  }
                } finally {
                  setBusy(false);
                }
              }}
            >
              {uiText("ربط المساحة بعد المراجعة")}
            </button>
          </div>
        </Modal>
      )}
    </details>
  );
}
