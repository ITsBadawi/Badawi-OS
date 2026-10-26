import { uiFormat, uiText } from "../localization.ts";
import React, { useState } from "react";
import { useApp } from "./context.tsx";
import { Modal, Confirm } from "./shared.tsx";
import { DeploymentLinkFields } from "./Deployments.tsx";
export function ProjectCreator({ onClose }: { onClose: () => void }) {
  const { data, act, go } = useApp(),
    workspaces = data.projects.filter(
      (p) => p.kind === "workfiles" && p.projectsRoot && !p.archived,
    );
  const [workspace, setWorkspace] = useState(workspaces[0]?.id || ""),
    [name, setName] = useState(""),
    [folder, setFolder] = useState(""),
    [review, setReview] = useState(false);
  const selected = workspaces.find((p) => p.id === workspace);
  return (
    <>
      <Modal title={uiText("إنشاء مشروع جديد")} onClose={onClose}>
        {!workspaces.length ? (
          <div>
            <p>
              {uiText(
                "أنشئ مساحة عمل منظّمة من قسم الملفات أولاً، ليكون للمشاريع مسار مستقل.",
              )}
            </p>
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
            onSubmit={(e) => {
              e.preventDefault();
              setReview(true);
            }}
          >
            <label className="field">
              {uiText("مساحة العمل")}
              <select
                aria-label={uiText("مساحة عمل المشروع")}
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
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
                aria-label={uiText("اسم المشروع")}
                required
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              {uiText("اسم المجلد داخل Projects")}
              <input
                aria-label={uiText("اسم مجلد المشروع")}
                required
                maxLength={100}
                pattern="[^/\\\\]+"
                dir="ltr"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
              />
            </label>
            <p>
              {uiText("سيُنشأ مجلد فارغ:")}{" "}
              <bdi>
                {selected?.projectsRoot}/{folder}
              </bdi>
              {uiText(
                ". بعد الربط تبقى ملفات الكود للقراءة، وتحتاج صلاحيات AI والنسخ إلى اختيارك.",
              )}
            </p>
            <button className="button primary" type="submit">
              {uiText("مراجعة إنشاء المشروع")}
            </button>
          </form>
        )}
      </Modal>
      {review && selected && (
        <Confirm
          title={uiText("إنشاء مجلد مشروع فارغ؟")}
          body={uiFormat(
            "{0} — {1}/{2}. لن يُستبدل مجلد موجود ولن يُكتب كود.",
            [name, selected.projectsRoot, folder],
          )}
          button={uiText("إنشاء المجلد وربط المشروع")}
          onClose={() => setReview(false)}
          onConfirm={async () => {
            const result = await act(
              { op: "project.create", workspaceId: workspace, name, folder },
              uiText("أُنشئ المشروع"),
            );
            if (result) onClose();
            return result;
          }}
        />
      )}
    </>
  );
}
export function ProjectDetails({
  project,
  onSave,
}: {
  project: any;
  onSave: (p: any) => void;
}) {
  const { act } = useApp();
  const [name, setName] = useState<string>(project.name),
    [description, setDescription] = useState<string>(project.description || ""),
    [tech, setTech] = useState<string>((project.technologies || []).join(", ")),
    [owner, setOwner] = useState<string>(project.github?.owner || ""),
    [repo, setRepo] = useState<string>(project.github?.repo || ""),
    [branch, setBranch] = useState<string>(project.github?.branch || ""),
    [deployments, setDeployments] = useState(project.deployments || {}),
    [busy, setBusy] = useState(false);
  return (
    <details>
      <summary>{uiText("بيانات المشروع")}</summary>
      <p className="muted">
        {uiText("المعرّف الثابت: ")}
        <bdi>{project.id}</bdi>
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const result = await act(
              {
                op: "project.details",
                id: project.id,
                name,
                description,
                technologies: [
                  ...new Set(
                    tech
                      .split(/[,،]/)
                      .map((t) => t.trim())
                      .filter(Boolean),
                  ),
                ],
                deployments,
                github:
                  owner || repo
                    ? {
                        owner: owner.trim(),
                        repo: repo.trim(),
                        branch: branch.trim() || undefined,
                      }
                    : null,
              },
              uiText("حُفظت بيانات المشروع"),
            );
            if (result) onSave(result);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          {uiText("اسم المشروع")}
          <input
            aria-label={uiText("اسم المشروع")}
            required
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          {uiText("الوصف")}
          <textarea
            aria-label={uiText("وصف المشروع")}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="field">
          {uiText("التقنيات، مفصولة بفواصل")}
          <input
            aria-label={uiText("تقنيات المشروع")}
            maxLength={1000}
            value={tech}
            onChange={(e) => setTech(e.target.value)}
          />
        </label>
        <label className="field">
          {uiText("مالك مستودع GitHub")}
          <input
            aria-label={uiText("مالك مستودع GitHub")}
            dir="ltr"
            maxLength={39}
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
        </label>
        <label className="field">
          {uiText("اسم مستودع GitHub")}
          <input
            aria-label={uiText("اسم مستودع GitHub")}
            dir="ltr"
            maxLength={100}
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
        </label>
        <label className="field">
          {uiText("فرع GitHub المراد متابعته")}
          <input
            aria-label={uiText("فرع GitHub")}
            dir="ltr"
            maxLength={151}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </label>
        <DeploymentLinkFields value={deployments} onChange={setDeployments} />
        <p className="muted">
          {uiText(
            "هذه بيانات ربط داخل Badawi OS؛ حفظها لا يغيّر إعدادات Git ولا ينشر المشروع.",
          )}
        </p>
        <button type="submit" className="button secondary" disabled={busy}>
          {uiText("حفظ بيانات المشروع")}
        </button>
      </form>
    </details>
  );
}
