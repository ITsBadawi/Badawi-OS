import { localeTag } from "../localization.ts";
import { uiFormat, uiLabels, uiText } from "../localization.ts";
import React, { useState } from "react";
import { DateTime } from "luxon";
import { taskCalendar } from "../core/task-calendar.ts";
import {
  Plus,
  FolderOpen,
  CheckCircle2,
  Clock,
  Brain,
  ShieldCheck,
  Bell,
} from "lucide-react";
import { useApp, errorText } from "./context.tsx";
import { Modal, when, Confirm } from "./shared.tsx";
import { CriteriaEditor, TaskEvidence } from "./TaskEvidence.tsx";
export function WorkspaceConnect({ onAdded }: { onAdded?: (p: any) => void }) {
  const { act } = useApp();
  const [path, setPath] = useState(""),
    [busy, setBusy] = useState(false);
  async function add(pick: boolean) {
    setBusy(true);
    try {
      const p = await act(
        pick
          ? { op: "project.pick" }
          : { op: "workspace.add", path: path.trim() },
      );
      if (p) {
        setPath("");
        onAdded?.(p);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="paper workspace-connect">
      <div>
        <h2>
          <FolderOpen size={21} />
          {uiText(" مساحة ملفاتك · Workspace")}
        </h2>
        <p>
          {uiText(
            "أضف مجلدك هنا، باختياره أو بإدخال مساره الكامل. يظهر أيضاً ضمن المشاريع.",
          )}
        </p>
      </div>
      <div className="workspace-path-entry">
        <input
          aria-label={uiText("مسار Workspace")}
          dir="ltr"
          placeholder="C:\Users\YourName\Projects"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && path.trim()) void add(false);
          }}
        />
        <button
          className="button primary"
          disabled={busy || !path.trim()}
          onClick={() => void add(false)}
        >
          {uiText("إضافة المسار")}
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void add(true)}
        >
          <FolderOpen size={16} />
          {uiText(" اختيار مجلد Workspace")}
        </button>
      </div>
      <small>
        {uiText(
          "تبدأ الصلاحية بقراءة محلية فقط. إرسال المحتوى إلى AI أو نسخ ملفات المشروع إلى Drive يحتاج تفعيل الخيارات أدناه.",
        )}
      </small>
    </section>
  );
}
export function ProjectPermissions({ project: p }: { project: any }) {
  const { act } = useApp();
  if (!p?.root) return null;
  return (
    <fieldset className="project-permissions">
      <legend>
        <ShieldCheck size={16} />
        {uiText(" صلاحيات هذا المجلد")}
      </legend>
      {[
        {
          key: "aiRead",
          label: uiText(
            "السماح لـBadawi بقراءة ملفات هذا المشروع وإرسال المقاطع اللازمة لمزوّد AI عند سؤالك",
          ),
        },
        {
          key: "backupFiles",
          label: uiText(
            "تضمين ملفات المشروع المسموحة داخل النسخ المشفّرة إلى Google Drive",
          ),
        },
        {
          key: "monitor",
          label: uiText(
            "متابعة تغييرات الملفات محلياً والتنبيه أثناء تشغيل المحرك",
          ),
        },
      ].map(({ key, label }) => (
        <label className="check-field" key={key}>
          <input
            type="checkbox"
            checked={!!p[key]}
            onChange={(e) =>
              void act({
                op: "project.permissions",
                id: p.id,
                aiRead: !!p.aiRead,
                backupFiles: !!p.backupFiles,
                monitor: !!p.monitor,
                [key]: e.target.checked,
              } as any)
            }
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
const actionNames: Record<string, string> = uiLabels({
  "condition.preview": "معاينة شرط من بيانات البرنامج المحلية",
  "deployment.check": "فحص حالة النشر المرتبط",
  "report.read": "قراءة تقرير التقدم المحلي",
  "task.verify": "فحص أدلة إنجاز المهمة",
  "github.check": "فحص المستودع المرتبط على GitHub",
  "project.details": "تحديث بيانات المشروع",
  "project.create": "إنشاء مجلد مشروع فارغ",
  "files.classify": "تصنيف ملف عمل وربطه بالمشاريع",
  "task.save": "حفظ مهمة",
  "task.remove": "حذف مهمة",
  "note.save": "حفظ ملاحظة",
  "note.remove": "حذف ملاحظة",
  "memory.save": "حفظ في الذاكرة",
  "memory.remove": "حذف ذكرى",
  "project.pick": "اختيار مجلد",
  "project.permissions": "تغيير صلاحيات مشروع",
  "project.archive": "أرشفة مشروع",
  "job.save": "حفظ أتمتة",
  "job.run": "تشغيل أتمتة",
  "job.remove": "حذف أتمتة",
  "backup.run": "رفع نسخة مشفّرة إلى Drive",
  "backup.list": "قراءة نسخ Drive",
  "desktop.openFolder": "فتح مجلد",
  "files.read": "قراءة ملف",
  "files.list": "قراءة قائمة الملفات",
  "files.search": "بحث داخل الملفات",
  "git.read": "فحص Git",
});
export function PlanCard({ plan: p }: { plan: any }) {
  const { act, data } = useApp();
  const [busy, setBusy] = useState(false),
    [review, setReview] = useState(false);
  if (!p) return null;
  const labels: Record<string, string> = {
    pending: uiText("بانتظار موافقتك"),
    executing: uiText("جارٍ التنفيذ"),
    completed: uiText("اكتمل التنفيذ"),
    needsReview: uiText("توقف ويحتاج مراجعة"),
    dismissed: uiText("تم رفض الاقتراح"),
  };
  return (
    <section className="assistant-plan" data-testid="assistant-plan">
      {p.automaticallyAuthorizedAt && (
        <p>
          {uiText(
            "نُفذت تلقائياً وفق سياسة الأدوات التي اخترتها. وقت التفويض:",
          )}{" "}
          {when(p.automaticallyAuthorizedAt)}
        </p>
      )}
      <strong>{labels[p.status] || p.status}</strong>
      <ol>
        {p.actions.map((a: any, i: number) => (
          <li key={i}>
            <b>{actionNames[a.command.op] || a.command.op}</b> —{" "}
            {a.command.title ||
              a.command.name ||
              data.projects.find(
                (x) => x.id === a.command.projectId || x.id === a.command.id,
              )?.name ||
              ""}
            <small>
              {a.status === "succeeded"
                ? uiText("تم التنفيذ والتحقق محلياً")
                : a.error
                  ? errorText(a.error)
                  : ""}
            </small>
            <details>
              <summary>{uiText("التفاصيل التي ستنفّذ")}</summary>
              <pre dir="auto">{JSON.stringify(a.command, null, 2)}</pre>
              {a.result && (
                <pre dir="auto">{JSON.stringify(a.result, null, 2)}</pre>
              )}
            </details>
          </li>
        ))}
      </ol>
      {p.status === "pending" && (
        <div className="button-wrap">
          <button
            disabled={busy}
            className="button primary"
            onClick={() => setReview(true)}
          >
            {uiText("مراجعة وتنفيذ")}
          </button>
          <button
            disabled={busy}
            className="button secondary"
            onClick={() => void act({ op: "assistant.dismiss", planId: p.id })}
          >
            {uiText("رفض")}
          </button>
        </div>
      )}
      {p.status === "needsReview" && (
        <p>
          {uiText(
            "الإجراءات التي نجحت تبقى محفوظة. اطلب خطة جديدة للخطوات غير المكتملة؛ لن يعيدها البرنامج تلقائياً.",
          )}
        </p>
      )}
      {review && (
        <Confirm
          title={uiText("تنفيذ إجراءات Badawi؟")}
          body={uiText(
            "راجع تفاصيل الإجراءات أعلاه. موافقتك تنفّذها فعلياً، بما فيها الحذف أو إرسال نسخة مشفّرة إلى Drive إن كانت ضمن القائمة. تُحفظ النتائج وتُرسل إلى مزوّد المحادثة ليكمل مساعدتك؛ قد تتضمن محتوى الملفات التي وافقت على قراءتها.",
          )}
          button={uiText("أوافق، نفّذ الإجراءات")}
          onClose={() => setReview(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              return await act({ op: "assistant.execute", planId: p.id });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </section>
  );
}
const local = (v: any) =>
  v
    ? new Date(Date.parse(v) - new Date(v).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
export function TaskEditor({
  task: t,
  onClose,
}: {
  task: any;
  onClose: () => void;
}) {
  const { act, data } = useApp();
  const [v, set] = useState<any>({
    title: "",
    description: "",
    priority: "normal",
    deadlineFixed: false,
    recurrence: null,
    projectId: "",
    subtasks: [],
    acceptanceCriteria: [],
    evidenceCommit: "",
    ...t,
    status: t.status || (t.done ? "done" : "todo"),
    dueAt: local(t.dueAt),
    remindAt: local(t.remindAt),
  });
  const [sub, setSub] = useState("");
  const [deadlineApproval, setDeadlineApproval] = useState(false);
  const [confirmDate, setConfirmDate] = useState(false);
  const field = (key: string, value: any) => set({ ...v, [key]: value });
  return (
    <Modal
      title={t.id ? uiText("تعديل المهمة") : uiText("مهمة جديدة")}
      wide
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            t.deadlineFixed &&
            (local(t.dueAt) !== v.dueAt || !v.deadlineFixed) &&
            !deadlineApproval
          ) {
            setConfirmDate(true);
            return;
          }
          const r = await act({
            op: "task.save",
            id: t.id,
            title: v.title,
            description: v.description,
            status: v.status,
            done: v.status === "done",
            priority: v.priority,
            projectId: v.projectId || null,
            dueAt: v.dueAt ? new Date(v.dueAt).toISOString() : null,
            remindAt: v.remindAt ? new Date(v.remindAt).toISOString() : null,
            subtasks: v.subtasks,
            acceptanceCriteria: v.acceptanceCriteria,
            evidenceCommit: v.evidenceCommit?.trim() || null,
            deadlineFixed: v.deadlineFixed,
            recurrence: v.recurrence,
            confirmDeadlineChange: deadlineApproval,
          });
          if (r) onClose();
        }}
      >
        <label className="field">
          {uiText("عنوان المهمة")}
          <input
            autoFocus
            required
            maxLength={160}
            value={v.title}
            onChange={(e) => field("title", e.target.value)}
          />
        </label>
        <label className="field">
          {uiText("الوصف")}
          <textarea
            rows={3}
            maxLength={10000}
            value={v.description}
            onChange={(e) => field("description", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            {uiText("الحالة")}
            <select
              aria-label={uiText("الحالة")}
              value={v.status}
              onChange={(e) => field("status", e.target.value)}
            >
              <option value="todo">{uiText("للتنفيذ")}</option>
              <option value="doing">{uiText("قيد العمل")}</option>
              <option value="done">{uiText("مكتملة")}</option>
            </select>
          </label>
          <label className="field">
            {uiText("الأولوية")}
            <select
              value={v.priority}
              onChange={(e) => field("priority", e.target.value)}
            >
              <option value="low">{uiText("منخفضة")}</option>
              <option value="normal">{uiText("عادية")}</option>
              <option value="high">{uiText("مهمة")}</option>
              <option value="urgent">{uiText("عاجلة")}</option>
            </select>
          </label>
          <label className="field">
            {uiText("موعد التسليم")}
            <input
              type="datetime-local"
              value={v.dueAt}
              onChange={(e) => {
                field("dueAt", e.target.value);
                setDeadlineApproval(false);
              }}
            />
          </label>
          <label className="field">
            {uiText("ذكّرني في")}
            <input
              type="datetime-local"
              value={v.remindAt}
              onChange={(e) => field("remindAt", e.target.value)}
            />
          </label>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={v.deadlineFixed}
            onChange={(e) => {
              field("deadlineFixed", e.target.checked);
              setDeadlineApproval(false);
            }}
          />
          {uiText("موعد ثابت — تغيير الموعد يحتاج موافقة صريحة")}
        </label>
        <div className="form-grid">
          <label className="field">
            {uiText("تكرار المهمة")}
            <select
              aria-label={uiText("تكرار المهمة")}
              value={v.recurrence?.frequency || ""}
              onChange={(e) =>
                field(
                  "recurrence",
                  e.target.value
                    ? {
                        frequency: e.target.value,
                        zone: v.recurrence?.zone || "Asia/Baghdad",
                      }
                    : null,
                )
              }
            >
              <option value="">{uiText("لا تتكرر")}</option>
              <option value="daily">{uiText("يومياً")}</option>
              <option value="weekly">{uiText("أسبوعياً")}</option>
              <option value="monthly">{uiText("شهرياً")}</option>
            </select>
          </label>
          {v.recurrence && (
            <label className="field">
              {uiText("المنطقة الزمنية للتكرار")}
              <input
                value={v.recurrence.zone}
                dir="ltr"
                required
                onChange={(e) =>
                  field("recurrence", { ...v.recurrence, zone: e.target.value })
                }
              />
            </label>
          )}
        </div>
        {v.recurrence && (
          <p className="info-strip">
            {uiText(
              "حدد موعد التسليم. إكمال المهمة ينشئ الموعد التالي مرة واحدة؛ تُتجاوز المواعيد الفائتة.",
            )}
          </p>
        )}
        <label className="field">
          {uiText("المشروع")}
          <select
            value={v.projectId || ""}
            onChange={(e) => field("projectId", e.target.value)}
          >
            <option value="">{uiText("بدون مشروع")}</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <h3>{uiText("خطوات المهمة")}</h3>
        <CriteriaEditor
          criteria={v.acceptanceCriteria || []}
          onChange={(criteria) => field("acceptanceCriteria", criteria)}
        />
        {v.acceptanceCriteria?.some((c: any) => c.source !== "manual") && (
          <label className="field">
            {uiText("Commit محدد للأدلة، اختياري")}
            <input
              aria-label={uiText("Commit أدلة المهمة")}
              value={v.evidenceCommit || ""}
              maxLength={64}
              dir="ltr"
              placeholder={uiText("اتركه لفحص Commit الحالي")}
              onChange={(e) => field("evidenceCommit", e.target.value)}
            />
          </label>
        )}
        {v.subtasks.map((s: any) => (
          <div className="subtask-edit" key={s.id}>
            <label className="check-field">
              <input
                type="checkbox"
                checked={s.done}
                onChange={(e) =>
                  field(
                    "subtasks",
                    v.subtasks.map((x: any) =>
                      x.id === s.id ? { ...x, done: e.target.checked } : x,
                    ),
                  )
                }
              />
              {s.title}
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                field(
                  "subtasks",
                  v.subtasks.filter((x: any) => x.id !== s.id),
                )
              }
            >
              {uiText("إزالة")}
            </button>
          </div>
        ))}
        <div className="workspace-path-entry">
          <input
            aria-label={uiText("خطوة جديدة")}
            value={sub}
            maxLength={160}
            onChange={(e) => setSub(e.target.value)}
          />
          <button
            type="button"
            className="button secondary"
            disabled={!sub.trim() || v.subtasks.length >= 50}
            onClick={() => {
              field("subtasks", [
                ...v.subtasks,
                { id: crypto.randomUUID(), title: sub.trim(), done: false },
              ]);
              setSub("");
            }}
          >
            {uiText("إضافة خطوة")}
          </button>
        </div>
        <div className="form-actions">
          <button className="button primary">{uiText("حفظ المهمة")}</button>
        </div>
      </form>
      {confirmDate && (
        <Confirm
          title={uiText("تغيير موعد ثابت؟")}
          body={uiFormat(
            "الموعد الحالي: {0}. الموعد الجديد: {1}. راجع التغيير ثم احفظ المهمة.",
            [
              when(t.dueAt),
              v.dueAt
                ? when(new Date(v.dueAt).toISOString())
                : uiText("بدون موعد"),
            ],
          )}
          button={uiText("أوافق على تغيير الموعد")}
          onClose={() => setConfirmDate(false)}
          onConfirm={async () => {
            setDeadlineApproval(true);
            setConfirmDate(false);
            return true;
          }}
        />
      )}
    </Modal>
  );
}
export function Tasks() {
  const { data, act, go } = useApp();
  const [edit, setEdit] = useState<any>(null),
    [query, setQuery] = useState(""),
    [project, setProject] = useState(""),
    [remove, setRemove] = useState<any>(null);
  const [view, setView] = useState<"board" | "list" | "calendar">("board");
  const [date, setDate] = useState(
    DateTime.now().setZone("Asia/Baghdad").toISODate()!,
  );
  const [span, setSpan] = useState(7);
  const rows = data.tasks.filter(
    (t) =>
      (!project || t.projectId === project) &&
      t.title.toLowerCase().includes(query.toLowerCase()),
  );
  const calendar = taskCalendar(rows, date, span, "Asia/Baghdad");
  const columns =
    view === "calendar"
      ? [
          ...calendar.days.map((d) => ({
            id: d.date,
            name: DateTime.fromISO(d.date)
              .setLocale(localeTag())
              .toFormat("ccc dd LLL"),
            tasks: d.tasks,
          })),
          { id: "undated", name: uiText("بدون موعد"), tasks: calendar.undated },
        ]
      : view === "list"
        ? [{ id: "all", name: uiText("جميع المهام"), tasks: rows }]
        : [
            { id: "todo", name: uiText("للتنفيذ") },
            { id: "doing", name: uiText("قيد العمل") },
            { id: "done", name: uiText("مكتملة") },
          ].map((c) => ({
            ...c,
            tasks: rows.filter(
              (t) => (t.done ? "done" : t.status || "todo") === c.id,
            ),
          }));
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{uiText("يومك، خطوة بخطوة.")}</h1>
          <p>
            {uiText(
              "مواعيد وأولويات وخطوات صغيرة، مع تذكير على Windows وفي الوارد.",
            )}
          </p>
        </div>
        <button className="button primary" onClick={() => setEdit({})}>
          <Plus size={17} />
          {uiText(" مهمة جديدة")}
        </button>
      </div>
      <div className="file-toolbar" aria-label={uiText("طريقة عرض المهام")}>
        <button
          className={`button ${view === "board" ? "primary" : "secondary"}`}
          aria-pressed={view === "board"}
          onClick={() => setView("board")}
        >
          Kanban
        </button>
        <button
          className={`button ${view === "list" ? "primary" : "secondary"}`}
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
        >
          {uiText("قائمة · List")}
        </button>
        <button
          className={`button ${view === "calendar" ? "primary" : "secondary"}`}
          aria-pressed={view === "calendar"}
          onClick={() => setView("calendar")}
        >
          {uiText("تقويم · Calendar")}
        </button>
        {view === "calendar" && (
          <>
            <button
              className="button secondary"
              onClick={() =>
                setDate(
                  DateTime.fromISO(date).minus({ days: span }).toISODate()!,
                )
              }
            >
              {uiText("السابق")}
            </button>
            <input
              aria-label={uiText("بداية التقويم")}
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
            />
            <select
              aria-label={uiText("فترة التقويم")}
              value={span}
              onChange={(e) => setSpan(Number(e.target.value))}
            >
              <option value={1}>{uiText("يوم")}</option>
              <option value={7}>{uiText("أسبوع")}</option>
            </select>
            <button
              className="button secondary"
              onClick={() =>
                setDate(
                  DateTime.fromISO(date).plus({ days: span }).toISODate()!,
                )
              }
            >
              {uiText("التالي")}
            </button>
            <small>{uiText("توقيت بغداد")}</small>
          </>
        )}
      </div>
      <div className="file-toolbar">
        <input
          placeholder={uiText("ابحث في مهامك")}
          aria-label={uiText("بحث المهام")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label={uiText("تصفية مهام المشروع")}
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">{uiText("كل المشاريع")}</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          className="button soft"
          onClick={async () => {
            const chat = await act({
              op: "chat.create",
              provider: data.defaultProvider,
              title: uiText("تخطيط يومي"),
            });
            go("chat");
            if (chat?.id)
              await act({
                op: "chat.send",
                chatId: chat.id,
                text: uiText(
                  "راجع مهامي الحالية واقترح خطة اليوم حسب توقيت بغداد والأولويات. اقترح تعديل مواعيد المهام المرنة فقط، واترك المواعيد الثابتة كما هي. اعرض الإجراءات للموافقة ولا تعتبر الاقتراح تنفيذاً.",
                ),
              });
          }}
        >
          <Brain size={16} />
          {uiText(" خطّط يومي مع Badawi")}
        </button>
        <button
          className="button soft"
          onClick={async () => {
            const chat = await act({
              op: "chat.create",
              provider: data.defaultProvider,
              title: uiText("جدولة الأسبوع"),
            });
            go("chat");
            if (chat?.id)
              await act({
                op: "chat.send",
                chatId: chat.id,
                text: uiText(
                  "راجع مهامي ورتب جدول الأيام السبعة القادمة بتوقيت بغداد. اقترح إعادة جدولة المهام المرنة وفق الأولوية والعبء اليومي، ولا تغير المواعيد الثابتة. اعرض كل التغييرات للموافقة واذكر المهام التي لا تتسع لها الفترة.",
                ),
              });
          }}
        >
          {uiText("اقتراح جدول الأسبوع")}
        </button>
      </div>
      {data.engine.mode !== "Running" && (
        <p className="info-strip">
          {uiText(
            "المحرك متوقف: تُحفظ مهامك الآن، وتظهر التنبيهات عند تشغيله. تظل الجدولة تعمل بعد إخفاء النافذة إلى شريط النظام.",
          )}
        </p>
      )}
      <div
        className="task-board"
        style={
          view === "board"
            ? undefined
            : {
                gridTemplateColumns:
                  view === "list"
                    ? "1fr"
                    : "repeat(auto-fit,minmax(230px,1fr))",
              }
        }
      >
        {columns.map((column) => (
          <section className="paper task-column" key={column.id}>
            <h2>
              {column.name} <small>{column.tasks.length}</small>
            </h2>
            {column.tasks
              .sort((a, b) => (a.dueAt || "z").localeCompare(b.dueAt || "z"))
              .map((t) => (
                <article
                  className={`board-task ${t.dueAt && Date.parse(t.dueAt) < Date.now() && !t.done ? "overdue" : ""}`}
                  key={t.id}
                >
                  <button className="task-open" onClick={() => setEdit(t)}>
                    {t.title}
                  </button>
                  <div className="task-badges">
                    <span className="badge">
                      {{
                        low: uiText("منخفضة"),
                        normal: uiText("عادية"),
                        high: uiText("مهمة"),
                        urgent: uiText("عاجلة"),
                      }[t.priority as string] || uiText("عادية")}
                    </span>
                    {t.dueAt && (
                      <small>
                        <Clock size={12} /> {when(t.dueAt)}
                      </small>
                    )}
                  </div>
                  {t.description && <p>{t.description.slice(0, 140)}</p>}
                  {t.deadlineFixed && <small>{uiText("موعد ثابت")}</small>}
                  {t.recurrence && (
                    <small>
                      {uiText("متكررة ·")}{" "}
                      {
                        (
                          {
                            daily: uiText("يومياً"),
                            weekly: uiText("أسبوعياً"),
                            monthly: uiText("شهرياً"),
                          } as any
                        )[t.recurrence.frequency]
                      }
                    </small>
                  )}
                  {t.subtasks?.length > 0 && (
                    <small>
                      {t.subtasks.filter((s: any) => s.done).length}/
                      {t.subtasks.length}
                      {uiText(" خطوات مكتملة")}
                    </small>
                  )}
                  <div className="form-actions split">
                    <button
                      className="text-button"
                      onClick={() =>
                        void act({
                          op: "task.save",
                          id: t.id,
                          title: t.title,
                          done: !t.done,
                        })
                      }
                    >
                      {t.done ? uiText("إعادة فتح") : uiText("إكمال المهمة")}
                    </button>
                    <button
                      className="text-button danger-text"
                      onClick={() => setRemove(t)}
                    >
                      {uiText("حذف")}
                    </button>
                  </div>
                  <TaskEvidence taskId={t.id} />
                </article>
              ))}
          </section>
        ))}
      </div>
      {edit && <TaskEditor task={edit} onClose={() => setEdit(null)} />}{" "}
      {remove && (
        <Confirm
          title={uiText("حذف هذه المهمة؟")}
          body={remove.title}
          button={uiText("حذف المهمة")}
          onClose={() => setRemove(null)}
          onConfirm={() => act({ op: "task.remove", id: remove.id })}
        />
      )}
    </>
  );
}
export function PersonalSettings() {
  const { data, act } = useApp();
  const prefs = data.preferences;
  const [edit, setEdit] = useState<any>(null),
    [title, setTitle] = useState(""),
    [body, setBody] = useState("");
  return (
    <div className="personal-settings">
      <section className="paper settings-panel">
        <h2>
          <Bell size={20} />
          {uiText(" التنبيهات والعمل بالخلفية")}
        </h2>
        {[
          {
            key: "notifications",
            label: uiText("إشعارات Windows للمواعيد ونتائج العمل"),
          },
          {
            key: "tray",
            label: uiText(
              "إغلاق النافذة يخفي البرنامج إلى شريط النظام؛ الجدولة تبقى حسب حالة المحرك",
            ),
          },
          {
            key: "startup",
            label: uiText(
              "فتح Badawi OS عند تسجيل الدخول إلى Windows (المحرك يبدأ متوقفاً)",
            ),
          },
        ].map((x) => (
          <label className="check-field" key={x.key}>
            <input
              type="checkbox"
              checked={!!(prefs as any)[x.key]}
              onChange={(e) =>
                void act({
                  op: "preferences.save",
                  ...prefs,
                  [x.key]: e.target.checked,
                } as any)
              }
            />
            {x.label}
          </label>
        ))}
        <div className="button-wrap">
          <button
            className="button secondary"
            onClick={() => void act({ op: "notification.test" })}
          >
            {uiText("اختبار إشعار")}
          </button>
          <button
            className="button secondary"
            onClick={() => void act({ op: "desktop.install" })}
          >
            {uiText("تثبيت اختصارات البرنامج")}
          </button>
          <button
            className="button secondary"
            onClick={() => void act({ op: "desktop.update" })}
          >
            {uiText("اختيار تحديث محلي")}
          </button>
        </div>
      </section>
      <section className="paper settings-panel">
        <div className="section-heading">
          <h2>
            <Brain size={20} />
            {uiText(" ذاكرة Badawi")}
          </h2>
          <button
            className="button soft small"
            onClick={() => {
              setEdit({});
              setTitle("");
              setBody("");
            }}
          >
            {uiText("إضافة ذكرى")}
          </button>
        </div>
        <p>
          {uiText(
            "أهدافك وتفضيلاتك التي تختار حفظها، وتُشارك مع مزوّد AI في المحادثات. يمكنك تعديلها أو حذفها.",
          )}
        </p>
        {data.memories.map((m) => (
          <article className="memory-row" key={m.id}>
            <div>
              <strong>{m.title}</strong>
              <p>{m.body}</p>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setEdit(m);
                setTitle(m.title);
                setBody(m.body);
              }}
            >
              {uiText("تعديل")}
            </button>
            <button
              className="text-button"
              onClick={() => void act({ op: "memory.remove", id: m.id })}
            >
              {uiText("حذف")}
            </button>
          </article>
        ))}
      </section>
      {edit && (
        <Modal title={uiText("ذاكرة شخصية")} onClose={() => setEdit(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ op: "memory.save", id: edit.id, title, body }))
                setEdit(null);
            }}
          >
            <label className="field">
              {uiText("العنوان")}
              <input
                required
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="field">
              {uiText("ما تريد أن يتذكره Badawi")}
              <textarea
                required
                maxLength={4000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <button className="button primary">{uiText("حفظ الذاكرة")}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
