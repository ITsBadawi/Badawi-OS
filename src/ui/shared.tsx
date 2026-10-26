import { localeTag } from "../localization.ts";
import { uiFormat, uiText } from "../localization.ts";
import { TaskEditor } from "./Tasks.tsx";
import React, { useRef, useEffect, useState, type ReactNode } from "react";
import {
  X,
  Plus,
  Trash2,
  Check,
  FolderKanban,
  ArrowUpLeft,
} from "lucide-react";
import { useApp } from "./context.tsx";
export const when = (value: string | undefined) =>
  value
    ? new Date(value).toLocaleString(localeTag(), {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : uiText("يدوي");
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      className={`real-dialog ${wide ? "wide" : ""}`}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label={uiText("إغلاق")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  icon: Icon = FolderKanban,
  title,
  body,
  action,
}: {
  icon?: any;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={27} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function Confirm({
  title,
  body,
  button = uiText("تأكيد"),
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  button?: string;
  onConfirm: () => Promise<any>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="dialog-copy">{body}</p>
      <div className="form-actions">
        <button className="button secondary" onClick={onClose}>
          {uiText("رجوع")}
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await onConfirm();
              if (result !== null && result !== false) onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {button}
        </button>
      </div>
    </Modal>
  );
}
export function TaskForm({ onClose }: { onClose: () => void }) {
  return <TaskEditor task={{}} onClose={onClose} />;
}
export function TaskList({
  limit = 1000,
  tasks,
}: {
  limit?: number;
  tasks?: any[];
}) {
  const { data, act } = useApp();
  const rows = tasks || data.tasks;
  return (
    <div className="task-list">
      {rows.length === 0 ? (
        <p className="inline-empty">
          {uiText("ابدأ بمهمة صغيرة؛ ستبقى محفوظة هنا.")}
        </p>
      ) : (
        rows.slice(0, limit).map((t) => (
          <div className={`task-row ${t.done ? "done" : ""}`} key={t.id}>
            <input
              type="checkbox"
              aria-label={t.title}
              checked={t.done}
              onChange={(e) =>
                void act({
                  op: "task.save",
                  id: t.id,
                  title: t.title,
                  done: e.target.checked,
                  projectId: t.projectId,
                })
              }
            />
            <span>
              {t.title}
              {t.done && t.verificationStatus && (
                <small
                  className={`badge ${t.verificationStatus.state === "verified" ? "success" : "warning"}`}
                >
                  {t.verificationStatus.state === "verified"
                    ? uiText("دليل متحقق")
                    : uiText("إنجاز يحتاج مراجعة")}
                </small>
              )}
              {t.projectId && (
                <small>
                  {data.projects.find((p) => p.id === t.projectId)?.name}
                </small>
              )}
            </span>
            <button
              className="icon-button small-icon row-delete"
              aria-label={uiFormat("حذف {0}", [t.title])}
              onClick={() => void act({ op: "task.remove", id: t.id })}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
export function ProjectCard({
  project,
  onOpen,
}: {
  project: any;
  onOpen: () => void;
}) {
  const { data } = useApp();
  const tasks = data.tasks.filter((t) => t.projectId === project.id);
  const done = tasks.filter((t) => t.done).length;
  return (
    <button className="project-card real-project" onClick={onOpen}>
      <div className="project-card-top">
        <span className="project-icon violet">
          <FolderKanban size={22} />
        </span>
        <ArrowUpLeft size={17} className="muted" />
      </div>
      <h3>{project.name}</h3>
      <p>
        {project.root
          ? uiText("مجلد مرتبط · للقراءة فقط")
          : uiText("أعد ربط مجلد هذا المشروع")}
      </p>
      <div className="project-card-footer">
        <span>
          {done} / {tasks.length}
          {uiText(" مهام")}
        </span>
        <span className="badge">
          {project.archived ? uiText("مؤرشف") : uiText("نشط")}
        </span>
      </div>
      <div className="progress-track">
        <div
          style={{
            width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
          }}
        />
      </div>
    </button>
  );
}
