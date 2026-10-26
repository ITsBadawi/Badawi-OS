import { uiFormat, uiText } from "../localization.ts";
import React, { useState } from "react";
import { useApp } from "./context.tsx";
import { Modal, Confirm } from "./shared.tsx";

export function ManagedWorkspace({
  onCreated,
}: {
  onCreated: (p: any) => void;
}) {
  const { act } = useApp();
  const [path, setPath] = useState(""),
    [inbox, setInbox] = useState(true),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false);
  return (
    <section className="paper workspace-connect">
      <h2>{uiText("مساحة عمل منظّمة")}</h2>
      <p>
        {uiText(
          "اختر مسار مجلد موجود. ينشئ البرنامج داخله Files لملفات العمل وProjects للكود. تبقى المشاريع المرتبطة الأخرى للقراءة فقط.",
        )}
      </p>
      <div className="workspace-path-entry">
        <input
          aria-label={uiText("مسار مساحة العمل المنظّمة")}
          dir="ltr"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="C:\Users\YourName\BadawiWorkspace"
        />
        <button
          className="button primary"
          disabled={!path.trim() || busy}
          onClick={() => setReview(true)}
        >
          {uiText("إنشاء Files وProjects")}
        </button>
      </div>
      <label className="check-field">
        <input
          type="checkbox"
          checked={inbox}
          onChange={(e) => setInbox(e.target.checked)}
        />
        {uiText("إضافة مجلد Inbox لاستقبال ملفات العمل")}
      </label>
      {review && (
        <Confirm
          title={uiText("إنشاء مساحة العمل؟")}
          body={uiFormat(
            "{0}\nسيُنشأ Files وProjects{1}. لا تُنقل ملفاتك الحالية تلقائياً.",
            [path, inbox ? uiText(" وFiles/Inbox") : ""],
          )}
          button={uiText("إنشاء المساحة")}
          onClose={() => setReview(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              const r = await act({
                op: "workspace.create",
                path: path.trim(),
                inbox,
              });
              if (r) {
                onCreated(r);
                setPath("");
              }
              return r;
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </section>
  );
}
export function WorkFilesTools({
  project,
  selected,
  folder,
  onChanged,
}: {
  project: any;
  selected: string;
  folder: string;
  onChanged: () => Promise<void>;
}) {
  const { act, data } = useApp();
  const [edit, setEdit] = useState<"mkdir" | "move" | null>(null),
    [destination, setDestination] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [busy, setBusy] = useState(false);
  if (project?.kind !== "workfiles") return null;
  return (
    <section className="paper workspace-connect">
      <h2>{uiText("تنظيم ملفات العمل")}</h2>
      <p dir="ltr">{project.workspaceRoot} · Files / Projects</p>
      <div className="button-wrap">
        <button
          className="button secondary"
          onClick={() => {
            setDestination(folder);
            setEdit("mkdir");
          }}
        >
          {uiText("مجلد جديد")}
        </button>
        <button
          className="button secondary"
          disabled={!selected}
          onClick={() => {
            setDestination(selected);
            setEdit("move");
          }}
        >
          {uiText("نقل / إعادة تسمية الملف")}
        </button>
        <small>
          {uiText(
            "التنفيذ يتطلب تشغيل المحرك ومعاينة المسار. لا يُستبدل ملف موجود.",
          )}
        </small>
      </div>
      {edit && (
        <Modal
          title={
            edit === "mkdir"
              ? uiText("إنشاء مجلد")
              : uiText("نقل أو إعادة تسمية")
          }
          onClose={() => setEdit(null)}
        >
          {edit === "move" && <p dir="ltr">{selected}</p>}
          <label className="field">
            {uiText("المسار داخل Files")}
            <input
              aria-label={uiText("المسار الجديد داخل Files")}
              dir="ltr"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </label>
          <button
            className="button primary"
            disabled={!destination || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await act({
                  op: "files.change.preview",
                  projectId: project.id,
                  kind: edit,
                  source: edit === "move" ? selected : undefined,
                  destination,
                });
                if (r) setPreview(r);
              } finally {
                setBusy(false);
              }
            }}
          >
            {uiText("معاينة التغيير")}
          </button>
        </Modal>
      )}
      {preview && (
        <Confirm
          title={uiText("تنفيذ تغيير الملفات؟")}
          body={uiFormat(
            "{0}\n{1} → {2}\nالجذر: {3}\nلا يمكن الكتابة خارج Files.",
            [
              preview.kind === "mkdir"
                ? uiText("إنشاء مجلد")
                : uiText("نقل ملف"),
              preview.source || "",
              preview.destination,
              preview.root,
            ],
          )}
          button={uiText("تنفيذ التغيير المعروض")}
          onClose={() => setPreview(null)}
          onConfirm={async () => {
            const r = await act({
              op: "files.change.apply",
              approvalId: preview.approvalId,
            });
            if (r) {
              setEdit(null);
              await onChanged();
            }
            return r;
          }}
        />
      )}
    </section>
  );
}
