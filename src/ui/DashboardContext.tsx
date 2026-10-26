import { uiFormat, uiLabels, uiText } from "../localization.ts";
import React, { useState } from "react";
import { Pin, X } from "lucide-react";
import { useApp } from "./context.tsx";
import { Modal, when } from "./shared.tsx";
const labels = uiLabels({
  task: "مهمة",
  project: "مشروع",
  note: "ملاحظة",
  job: "أتمتة",
});
const tables = {
  task: "tasks",
  project: "projects",
  note: "notes",
  job: "jobs",
} as const;
export function DashboardContext() {
  const { data, act, go } = useApp(),
    state = data.dashboard;
  const [adding, setAdding] = useState(false),
    [type, setType] = useState<keyof typeof tables>("task"),
    [selected, setSelected] = useState(""),
    [opened, setOpened] = useState<(typeof state.pins)[number] | null>(null);
  const rows = data[tables[type]].filter(
    (r) => type !== "project" || (!r.archived && r.kind !== "workfiles"),
  );
  const row = opened
    ? data[tables[opened.type]].find((r) => r.id === opened.id)
    : null;
  return (
    <>
      <section className="paper dashboard-context">
        <div className="form-grid">
          <label className="field">
            {uiText("سياق لوحة التحكم")}
            <select
              aria-label={uiText("سياق لوحة التحكم")}
              value={state.mode}
              onChange={(e) => {
                const mode = e.target.value as "today" | "project" | "review";
                const p = data.projects.find(
                  (p) => !p.archived && p.kind !== "workfiles",
                );
                if (mode !== "project" || p)
                  void act({
                    op: "dashboard.context",
                    mode,
                    ...(mode === "project" ? { projectId: p!.id } : {}),
                  });
              }}
            >
              <option value="today">{uiText("اليوم والأولويات")}</option>
              <option
                value="project"
                disabled={
                  !data.projects.some(
                    (p) => !p.archived && p.kind !== "workfiles",
                  )
                }
              >
                {uiText("مشروع محدد")}
              </option>
              <option value="review">{uiText("ما يحتاج مراجعة")}</option>
            </select>
          </label>
          {state.mode === "project" && (
            <label className="field">
              {uiText("مشروع السياق")}
              <select
                aria-label={uiText("مشروع السياق")}
                value={state.projectId || ""}
                onChange={(e) =>
                  void act({
                    op: "dashboard.context",
                    mode: "project",
                    projectId: e.target.value,
                  })
                }
              >
                {state.projectUnavailable && (
                  <option value={state.projectId}>
                    {uiText("المشروع غير متاح")}
                  </option>
                )}
                {data.projects
                  .filter((p) => !p.archived && p.kind !== "workfiles")
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
        <p className="muted">
          {uiText(
            "السياق يغيّر العناصر المعروضة فقط؛ الجدول والصلاحيات وحالة المحرك تبقى كما ضبطتها.",
          )}
        </p>
        {state.projectUnavailable && (
          <p className="info-strip">
            {uiText(
              "المشروع المختار غير متاح؛ اختر مشروعاً آخر. لم نوسّع العرض إلى بقية المشاريع.",
            )}
          </p>
        )}
        <div className="section-heading">
          <h2>{uiText("العناصر المثبتة")}</h2>
          <button className="button soft small" onClick={() => setAdding(true)}>
            <Pin size={15} />
            {uiText("تثبيت عنصر")}
          </button>
        </div>
        <p className="muted">
          {uiText(
            "تظل مثبتاتك ظاهرة في كل سياق. يمكنك معاينة العنصر أو فتح قسمه.",
          )}
        </p>
        <div className="dashboard-pins">
          {state.pins.map((pin) => (
            <div className="dashboard-pin" key={`${pin.type}:${pin.id}`}>
              <button
                className="text-button"
                disabled={!pin.available}
                onClick={() => setOpened(pin)}
              >
                {labels[pin.type]} · {pin.title || uiText("عنصر لم يعد متاحاً")}
              </button>
              <button
                className="icon-button small-icon"
                aria-label={uiFormat("إلغاء تثبيت {0}", [pin.title || pin.id])}
                onClick={() =>
                  void act({
                    op: "dashboard.pin",
                    type: pin.type,
                    id: pin.id,
                    pinned: false,
                  })
                }
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {!state.pins.length && (
            <p className="inline-empty">
              {uiText(
                "ثبّت مهمة أو مشروعاً أو ملاحظة أو أتمتة للوصول إليها سريعاً.",
              )}
            </p>
          )}
        </div>
      </section>
      {adding && (
        <Modal
          title={uiText("تثبيت عنصر في لوحة التحكم")}
          onClose={() => setAdding(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act({
                  op: "dashboard.pin",
                  type,
                  id: selected,
                  pinned: true,
                })
              )
                setAdding(false);
            }}
          >
            <label className="field">
              {uiText("نوع العنصر")}
              <select
                aria-label={uiText("نوع العنصر")}
                value={type}
                onChange={(e) => {
                  setType(e.target.value as typeof type);
                  setSelected("");
                }}
              >
                {Object.entries(labels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {uiText("العنصر")}
              <select
                aria-label={uiText("العنصر")}
                required
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">{uiText("اختر عنصراً")}</option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title || r.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button className="button primary" disabled={!selected}>
                {uiText("تثبيت")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {opened && (
        <Modal
          title={row?.title || row?.name || uiText("العنصر غير متاح")}
          onClose={() => setOpened(null)}
        >
          {row ? (
            <>
              <p className="muted">
                {labels[opened.type]} · {when(row.updatedAt || row.createdAt)}
              </p>
              <p className="pin-preview">
                {row.body ||
                  row.description ||
                  row.message ||
                  uiText("لا يوجد وصف إضافي.")}
              </p>
              {opened.type === "task" && (
                <p>
                  {row.done
                    ? uiText("معلّمة كمنجزة؛ راجع دليل الإنجاز من صفحة المهام.")
                    : uiText("مهمة مفتوحة")}{" "}
                  · {row.priority || "normal"} · {when(row.dueAt)}
                </p>
              )}
              <button
                className="button primary"
                onClick={() => {
                  go(tables[opened.type]);
                  setOpened(null);
                }}
              >
                {uiText("فتح القسم")}
              </button>
            </>
          ) : (
            <p>{uiText("العنصر لم يعد موجوداً؛ يمكنك إلغاء تثبيته.")}</p>
          )}
        </Modal>
      )}
    </>
  );
}
