import { uiText } from "../localization.ts";
import React, { useState } from "react";
import { useApp } from "./context.tsx";
import { Modal } from "./shared.tsx";
export function ProjectClone({ onClose }: { onClose: () => void }) {
  const { data, act, go } = useApp(),
    workspaces = data.projects.filter(
      (p) => p.kind === "workfiles" && p.projectsRoot && !p.archived,
    );
  const [workspace, setWorkspace] = useState(workspaces[0]?.id || ""),
    [name, setName] = useState(""),
    [folder, setFolder] = useState(""),
    [owner, setOwner] = useState(""),
    [repo, setRepo] = useState(""),
    [branch, setBranch] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<any>(null);
  const change = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPreview(null);
  };
  return (
    <Modal title={uiText("استنساخ مشروع من GitHub")} onClose={onClose}>
      {!workspaces.length ? (
        <div>
          <p>{uiText("أنشئ مساحة عمل منظّمة من قسم الملفات أولاً.")}</p>
          <button
            className="button secondary"
            onClick={() => {
              onClose();
              go("files");
            }}
          >
            {uiText("فتح الملفات")}
          </button>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const p = await act({
                op: "project.clone.preview",
                workspaceId: workspace,
                name,
                folder,
                github: {
                  owner: owner.trim(),
                  repo: repo.trim(),
                  branch: branch.trim() || undefined,
                },
              });
              if (p) setPreview(p);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            {uiText("مساحة العمل")}
            <select
              aria-label={uiText("مساحة عمل الاستنساخ")}
              disabled={busy}
              value={workspace}
              onChange={(e) => change(setWorkspace, e.target.value)}
            >
              {workspaces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.workspaceRoot}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {uiText("اسم المشروع")}
            <input
              aria-label={uiText("اسم المشروع المستنسخ")}
              required
              disabled={busy}
              maxLength={160}
              value={name}
              onChange={(e) => change(setName, e.target.value)}
            />
          </label>
          <label className="field">
            {uiText("اسم المجلد داخل Projects")}
            <input
              aria-label={uiText("مجلد المشروع المستنسخ")}
              required
              disabled={busy}
              maxLength={100}
              dir="ltr"
              value={folder}
              onChange={(e) => change(setFolder, e.target.value)}
            />
          </label>
          <label className="field">
            {uiText("مالك مستودع GitHub")}
            <input
              aria-label={uiText("مالك المستودع للاستنساخ")}
              required
              disabled={busy}
              maxLength={39}
              dir="ltr"
              value={owner}
              onChange={(e) => change(setOwner, e.target.value)}
            />
          </label>
          <label className="field">
            {uiText("اسم المستودع")}
            <input
              aria-label={uiText("المستودع للاستنساخ")}
              required
              disabled={busy}
              maxLength={100}
              dir="ltr"
              value={repo}
              onChange={(e) => change(setRepo, e.target.value)}
            />
          </label>
          <label className="field">
            {uiText("الفرع، أو اتركه للفرع الافتراضي")}
            <input
              aria-label={uiText("فرع الاستنساخ")}
              disabled={busy}
              maxLength={151}
              dir="ltr"
              value={branch}
              onChange={(e) => change(setBranch, e.target.value)}
            />
          </label>
          <p>
            {uiText(
              "تقرأ المعاينة مرجع المستودع من GitHub أولاً. النسخ لفرع واحد وآخر Commit، دون تشغيل ملفات المشروع أو جلب Submodules وملفات LFS الكبيرة. حد حجم المستودع المسجل في GitHub هو 100 MiB.",
            )}
          </p>
          <button className="button secondary" type="submit" disabled={busy}>
            {uiText("معاينة الاستنساخ")}
          </button>
          {preview && (
            <section className="info-strip">
              <div>
                <h3>{uiText("راجع الاستنساخ قبل التنفيذ")}</h3>
                <p>
                  {uiText("المستودع:")}{" "}
                  <bdi>
                    {preview.github.owner}/{preview.github.repo}
                  </bdi>
                  <br />
                  {uiText("الفرع: ")}
                  <bdi>{preview.github.branch}</bdi>
                  <br />
                  Commit: <bdi>{preview.remoteHead || uiText("لا يوجد Commit بعد")}</bdi>
                  <br />
                  {uiText("المجلد الجديد: ")}
                  <bdi>{preview.destination}</bdi>
                </p>
                <p>
                  {uiText("حجم GitHub المسجل:")}{" "}
                  {(preview.repositorySizeKB / 1024).toFixed(2)}
                  {uiText(
                    " MiB. تنتهي المعاينة خلال خمس دقائق. لا يُستبدل أي مجلد موجود، وتبقى صلاحيات AI والنسخ معطلة للمشروع الجديد.",
                  )}
                </p>
                <button
                  className="button primary"
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await act(
                        {
                          op: "project.clone.apply",
                          previewId: preview.previewId,
                        },
                        uiText("اكتمل الاستنساخ والتحقق"),
                      );
                      if (result) onClose();
                      else setPreview(null);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy
                    ? uiText("جارٍ الاستنساخ والتحقق…")
                    : uiText("أوافق، استنسخ المشروع")}
                </button>
              </div>
            </section>
          )}
        </form>
      )}
    </Modal>
  );
}
