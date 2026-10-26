import { uiFormat, uiText } from "../localization.ts";
import React, { useState } from "react";
import {
  Plus,
  Workflow,
  Play,
  Trash2,
  Clock3,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useApp, errorText } from "./context.tsx";
import { Modal, Empty, Confirm, when } from "./shared.tsx";
import { stateLabels } from "./Dashboard.tsx";
import { IntegrationTarget } from "./IntegrationMonitor.tsx";
import { WorkflowSteps } from "./WorkflowSteps.tsx";
import { WorkflowRecovery } from "./WorkflowRecovery.tsx";
import { ProjectPermissions } from "./Tasks.tsx";
import type { Command } from "../contracts.ts";
import { ConditionEditor, conditionDescription } from "./Conditions.tsx";
export function Automations() {
  const { data, act } = useApp();
  const [edit, setEdit] = useState<any>(null),
    [remove, setRemove] = useState<any>(null),
    [recovery, setRecovery] = useState<any>(null),
    [restart, setRestart] = useState<any>(null),
    [busy, setBusy] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{uiText("دع الروتين يأخذ مساره.")}</h1>
          <p>{uiText("قواعد واضحة، تعمل محلياً وتبقى تحت تحكّمك.")}</p>
        </div>
        <button
          className="button primary"
          onClick={() =>
            setEdit({
              name: "",
              kind: "reminder",
              message: "",
              enabled: false,
              trigger: { type: "manual" },
              missedPolicy: "skip",
            })
          }
        >
          <Plus size={17} />
          {uiText("أتمتة جديدة")}
        </button>
      </div>
      <div className="automation-state paper">
        <Workflow size={20} />
        <strong>{stateLabels[data.engine.effective]}</strong>
        <span>
          {data.engine.mode !== "Running"
            ? uiText("لا يبدأ أي عمل قبل تشغيل المحرك.")
            : data.engine.gaming
              ? uiText("وضع اللعب يؤجل التنفيذ.")
              : uiText("المهام المفعّلة تعمل عند موعدها.")}
        </span>
        <small>{uiText("لا يعمل الجدول عندما يكون البرنامج مغلقاً.")}</small>
      </div>
      <div className="recipe-grid">
        {data.jobs.map((j) => (
          <article className="recipe-card" key={j.id}>
            <div className="recipe-head">
              <span className="tool-icon purple">
                <Workflow size={21} />
              </span>
              <span className={`badge ${j.enabled ? "success" : ""}`}>
                {j.enabled ? uiText("مفعّلة") : uiText("مسودة")}
              </span>
            </div>
            <h2>{j.name}</h2>
            <p>
              {j.kind === "reminder"
                ? uiText("تذكير محفوظ في الوارد")
                : j.kind === "summary"
                  ? uiText("تلخيص الملاحظات المختارة بالذكاء الاصطناعي")
                  : j.kind === "report"
                    ? uiText("تقرير ملفات وGit بدون AI")
                    : j.kind === "integration"
                      ? uiFormat("فحص {0} للقراءة فقط", [j.integration])
                      : j.kind === "workflow"
                        ? uiText("خطوات متتابعة بنتائج محفوظة")
                        : j.kind === "briefing"
                          ? uiText("موجز AI للمهام الحالية")
                          : uiText("نسخة مشفرة إلى Google Drive")}
            </p>
            {j.kind === "workflow" && (
              <ol>
                {j.steps?.map((s: any, i: number) => (
                  <li key={i}>{s.name}</li>
                ))}
              </ol>
            )}
            {j.disabledReason && (
              <small className="badge warning">
                {uiText("تغيّر المصدر أو المزوّد؛ أعد المراجعة والتفعيل")}
              </small>
            )}
            <div className="recipe-details">
              <span>
                <Clock3 size={15} />
                {j.trigger.type === "condition"
                  ? uiText("فحص الحالة المحلية")
                  : j.trigger.type === "event"
                    ? uiText("بانتظار الحدث")
                    : when(j.nextDueAt)}
              </span>
              <small>
                {j.trigger.type === "manual"
                  ? uiText("تشغيل يدوي")
                  : j.trigger.type === "condition"
                    ? uiText("حسب شرط محلي")
                    : j.trigger.type === "event"
                      ? uiText("عند حدث")
                      : j.trigger.type === "once"
                        ? uiText("مرة واحدة")
                        : j.trigger.type === "daily"
                          ? uiText("يومياً")
                          : uiText("أسبوعياً")}
                {j.trigger.zone && ` · ${j.trigger.zone}`}
              </small>
            </div>
            {j.trigger.type === "condition" && (
              <div className="condition-receipt">
                <p>
                  {conditionDescription(
                    j.trigger.condition,
                    data.projects.find(
                      (p) => p.id === j.trigger.condition.projectId,
                    )?.name,
                  )}{" "}
                  {uiText("· فحص كل ")}
                  {j.trigger.checkEveryMinutes}
                  {uiText(" دقيقة.")}
                </p>
                {j.conditionState ? (
                  <small>
                    {uiText("آخر مشاهدة: ")}
                    {when(j.conditionState.observation.observedAt)} ·{" "}
                    {j.conditionState.observation.matched === true
                      ? uiText(
                          "متحققة؛ لن تتكرر تلقائياً حتى تُشاهد غير متحققة",
                        )
                      : j.conditionState.observation.matched === false
                        ? uiText("غير متحققة")
                        : uiText("المصدر غير متاح؛ لم تُعَد تهيئة الشرط")}
                    {j.conditionState.observation.reason && (
                      <> · {errorText(j.conditionState.observation.reason)}</>
                    )}
                  </small>
                ) : (
                  <small>
                    {uiText("لم يُفحص هذا التعريف أثناء تشغيل المحرك بعد.")}
                  </small>
                )}
              </div>
            )}
            <div className="recipe-action">
              <button
                className="button secondary small"
                onClick={() => setEdit(j)}
              >
                {uiText("تعديل")}
              </button>
              <button
                className="button soft small"
                aria-label={uiFormat("تشغيل {0}", [j.name])}
                disabled={!!busy}
                onClick={async () => {
                  if (
                    j.kind === "workflow" &&
                    data.runs.some(
                      (r) =>
                        r.jobId === j.id &&
                        [
                          "failed",
                          "cancelled",
                          "needsReview",
                          "blocked",
                        ].includes(r.status) &&
                        r.steps?.some((s: any) => s.status === "succeeded"),
                    )
                  ) {
                    setRestart(j);
                    return;
                  }
                  setBusy(j.id);
                  await act(
                    { op: "job.run", id: j.id },
                    uiText(
                      "انتهت المحاولة. راجع النتيجة في الوارد أو سجل التشغيل.",
                    ),
                  );
                  setBusy("");
                }}
              >
                <Play size={14} />
                {busy === j.id ? uiText("يعمل…") : uiText("تشغيل الآن")}
              </button>
              <button
                className="icon-button"
                aria-label={uiFormat("حذف {0}", [j.name])}
                onClick={() => setRemove(j)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!data.jobs.length && (
        <Empty
          icon={Workflow}
          title={uiText("ابنِ روتيناً يناسبك")}
          body={uiText(
            "ابدأ بتذكير بسيط، ثم أضف تقارير المشاريع أو النسخ الاحتياطية.",
          )}
          action={
            <button
              className="button secondary"
              onClick={() =>
                setEdit({
                  name: "",
                  kind: "reminder",
                  enabled: false,
                  trigger: { type: "manual" },
                  message: "",
                  missedPolicy: "skip",
                })
              }
            >
              <Plus size={16} />
              {uiText("إنشاء أتمتة")}
            </button>
          }
        />
      )}
      <section className="section">
        <div className="section-heading">
          <h2>{uiText("سجل التشغيل")}</h2>
          <span className="muted">{uiText("آخر 100 محاولة")}</span>
        </div>
        <div className="paper run-list">
          {data.runs.slice(0, 20).map((r) => (
            <div className="run-row" key={r.id}>
              <span
                className={`status-dot ${r.status === "succeeded" ? "green" : ""}`}
              />
              <div>
                <strong>
                  {data.jobs.find((j) => j.id === r.jobId)?.name ||
                    uiText("مهمة سابقة")}
                </strong>
                <small>{when(r.createdAt)}</small>
              </div>
              <span
                className={`badge ${r.status === "succeeded" ? "success" : r.status === "failed" ? "warning" : ""}`}
              >
                {
                  (
                    {
                      succeeded: uiText("اكتمل التنفيذ"),
                      skipped: uiText("تم التخطي"),
                      cancelled: uiText("ملغاة"),
                      failed: uiText("فشلت"),
                      blocked: uiText("بانتظار قرارك"),
                      queued: uiText("في الانتظار"),
                      retryWaiting: uiText("بانتظار إعادة فحص الاتصال"),
                      running: uiText("قيد التنفيذ"),
                      needsReview: uiText("تحتاج مراجعة"),
                    } as any
                  )[r.status]
                }
              </span>
              {r.result?.inspection && (
                <small
                  className={`badge ${r.result.inspection.status === "verified" ? "success" : "warning"}`}
                >
                  {r.result.inspection.integration}: {r.result.inspection.state}{" "}
                  ·{" "}
                  {r.result.inspection.status === "verified"
                    ? uiText("حالة مؤكدة وقت الفحص")
                    : r.result.inspection.status === "failed"
                      ? uiText("حالة فشل مرصودة")
                      : uiText("تحتاج مراجعة")}
                </small>
              )}
              {r.reason && <small>{errorText(r.reason)}</small>}
              {["failed", "cancelled", "needsReview", "blocked"].includes(
                r.status,
              ) &&
                r.steps?.length > 0 &&
                data.jobs.find((j) => j.id === r.jobId)?.kind ===
                  "workflow" && (
                  <button
                    className="button secondary small"
                    onClick={async () => {
                      const preview = await act({
                        op: "workflow.recovery.preview",
                        runId: r.id,
                      });
                      if (preview) setRecovery(preview);
                    }}
                  >
                    {uiText("مراجعة استكمال التشغيل")}
                  </button>
                )}
              {r.recoveryHistory?.length > 0 && (
                <small>
                  {uiFormat("مرات الاستئناف المراجعة: {0}", [
                    r.recoveryHistory.length,
                  ])}
                </small>
              )}
              {r.nextRetryAt && (
                <small>
                  {uiFormat("المحاولة التالية: {0}", [when(r.nextRetryAt)])}
                </small>
              )}
              {r.attempts?.length > 0 && (
                <details>
                  <summary>
                    {uiFormat("سجل المحاولات ({0})", [r.attempts.length])}
                  </summary>
                  {r.attempts.map((a: any) => (
                    <div key={a.number}>
                      {a.number} · {when(a.startedAt)} · {a.status}
                      {a.reason && <small>{errorText(a.reason)}</small>}
                    </div>
                  ))}
                </details>
              )}
              {r.steps?.length > 0 && (
                <details>
                  <summary>
                    {uiText("نتائج الخطوات (")}
                    {r.steps.length})
                  </summary>
                  {r.steps.map((s: any, i: number) => (
                    <div key={i}>
                      <strong>
                        {s.name || uiFormat("خطوة {0}", [i + 1])} · {s.status}
                      </strong>
                      {s.reused && (
                        <small>
                          {uiText(
                            "إيصال سابق أُعيد استخدامه؛ لم تُكرر الخطوة.",
                          )}
                        </small>
                      )}
                      <pre dir="auto">
                        {JSON.stringify(s.result || s.reason || {}, null, 2)}
                      </pre>
                    </div>
                  ))}
                </details>
              )}
              {r.status === "blocked" && r.reason === "catchupApproval" && (
                <button
                  className="text-button"
                  onClick={() => void act({ op: "run.resume", id: r.id })}
                >
                  {uiText("تنفيذ هذا الموعد")}
                </button>
              )}
              {["queued", "blocked", "retryWaiting"].includes(r.status) && (
                <button
                  className="text-button"
                  onClick={() => void act({ op: "run.cancel", id: r.id })}
                >
                  {uiText("إلغاء")}
                </button>
              )}
            </div>
          ))}
          {!data.runs.length && (
            <p className="inline-empty">
              {uiText("تظهر هنا نتيجة كل محاولة، بما فيها الأخطاء والإلغاء.")}
            </p>
          )}
        </div>
      </section>
      {edit && <JobEditor job={edit} onClose={() => setEdit(null)} />}{" "}
      {recovery && (
        <WorkflowRecovery
          preview={recovery}
          onClose={() => setRecovery(null)}
        />
      )}
      {restart && (
        <Confirm
          title={uiText("بدء الأتمتة من الخطوة الأولى؟")}
          body={uiText(
            "نجحت خطوات في تشغيل سابق. البدء من جديد يكرر الخطوات كلها وقد يرسل طلب AI أو نسخة أخرى. استخدم مراجعة الاستكمال من سجل التشغيل لتجاوز الخطوات المثبتة.",
          )}
          button={uiText("أوافق على بدء تشغيل جديد بالكامل")}
          onClose={() => setRestart(null)}
          onConfirm={() =>
            act({ op: "job.run", id: restart.id, confirmReplay: true })
          }
        />
      )}
      {remove && (
        <Confirm
          title={uiText("حذف الأتمتة؟")}
          body={uiText(
            "لن تبدأ مواعيد جديدة لهذه الأتمتة. يبقى سجل المحاولات محفوظاً.",
          )}
          button={uiText("حذف")}
          onClose={() => setRemove(null)}
          onConfirm={() => act({ op: "job.remove", id: remove.id })}
        />
      )}
    </>
  );
}
export function JobEditor({ job, onClose }: { job: any; onClose: () => void }) {
  const { data, act } = useApp();
  const [steps, setSteps] = useState<any[]>(
    (job.steps || []).map(
      ({
        kind,
        name,
        message,
        projectId,
        noteIds,
        provider,
        integration,
      }: any) => ({
        kind,
        name,
        message,
        projectId,
        noteIds,
        provider,
        integration,
      }),
    ),
  );
  const [event, setEvent] = useState(job.trigger.event || "task.completed");
  const [condition, setCondition] = useState(
      job.trigger.condition || { kind: "tasks.overdue", minCount: 1 },
    ),
    [conditionMinutes, setConditionMinutes] = useState(
      job.trigger.checkEveryMinutes || 1,
    );
  const [name, setName] = useState(job.name),
    [provider, setProvider] = useState<"gemini" | "openai" | "chatgpt">(
      job.provider || data.defaultProvider,
    ),
    [noteIds, setNoteIds] = useState<string[]>(job.noteIds || []),
    [allowBackgroundAI, setAllowBackgroundAI] = useState(false),
    [allowBackgroundIntegration, setAllowBackgroundIntegration] =
      useState(false),
    [integration, setIntegration] = useState(job.integration || "github"),
    [kind, setKind] = useState(job.kind),
    [message, setMessage] = useState(job.message || ""),
    [project, setProject] = useState(
      job.projectId ||
        (job.kind === "report" ? data.projects[0]?.id : "") ||
        "",
    ),
    [type, setType] = useState(job.trigger.type),
    [time, setTime] = useState(job.trigger.time || "18:00"),
    [zone, setZone] = useState(
      job.trigger.zone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    [weekday, setWeekday] = useState(job.trigger.weekday || 1),
    [at, setAt] = useState(
      job.trigger.at
        ? new Date(
            Date.parse(job.trigger.at) -
              new Date(job.trigger.at).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "",
    ),
    [enabled, setEnabled] = useState(job.enabled),
    [policy, setPolicy] = useState(job.missedPolicy || "skip"),
    [retryEnabled, setRetryEnabled] = useState(!!job.id && !!job.retry),
    [retryAttempts, setRetryAttempts] = useState(job.retry?.maxAttempts || 2),
    [retryDelay, setRetryDelay] = useState(job.retry?.delaySeconds || 30),
    [preview, setPreview] = useState<string[]>([]);
  const trigger =
    type === "condition"
      ? {
          type: "condition" as const,
          checkEveryMinutes: conditionMinutes,
          condition,
        }
      : type === "event"
        ? {
            type: "event" as const,
            event: event as any,
            ...(event === "project.changed" ? { projectId: project } : {}),
          }
        : type === "manual"
          ? { type: "manual" as const }
          : type === "once"
            ? {
                type: "once" as const,
                at: at ? new Date(at).toISOString() : "",
              }
            : {
                type: type as "daily" | "weekly",
                time,
                zone,
                ...(type === "weekly" ? { weekday } : {}),
              };
  return (
    <Modal
      title={job.id ? uiText("تعديل الأتمتة") : uiText("أتمتة جديدة")}
      wide
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await act({
            op: "job.save",
            id: job.id,
            name,
            kind,
            ...(["summary", "briefing"].includes(kind)
              ? {
                  provider,
                  ...(kind === "summary" ? { noteIds } : {}),
                  allowBackgroundAI,
                }
              : kind === "workflow"
                ? { steps, allowBackgroundAI, allowBackgroundIntegration }
                : {}),
            ...(kind === "integration"
              ? { integration, allowBackgroundIntegration }
              : {}),
            projectId: ["report", "backup", "integration"].includes(kind)
              ? project || undefined
              : undefined,
            message,
            trigger,
            enabled,
            missedPolicy: policy,
            ...(kind === "integration" && retryEnabled
              ? {
                  retry: {
                    maxAttempts: retryAttempts,
                    delaySeconds: retryDelay,
                  },
                }
              : {}),
          } as Command);
          if (r) onClose();
        }}
      >
        <label className="field">
          {uiText("اسم الأتمتة")}
          <input
            required
            autoFocus
            value={name}
            maxLength={160}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          {uiText("نوع المهمة")}
          <select
            aria-label={uiText("نوع المهمة")}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setAllowBackgroundIntegration(false);
            }}
          >
            <option value="reminder">{uiText("تذكير في الوارد")}</option>
            <option value="report">{uiText("تقرير مشروع محلي")}</option>
            <option value="summary">
              {uiText("تلخيص ملاحظات بالذكاء الاصطناعي")}
            </option>
            <option value="backup">{uiText("نسخة Google Drive مشفّرة")}</option>
            <option value="briefing">{uiText("موجز يومي ذكي للمهام")}</option>
            <option value="workflow">{uiText("سلسلة خطوات مترابطة")}</option>
            <option value="integration">
              {uiText("فحص GitHub أو حالة النشر")}
            </option>
          </select>
        </label>
        {kind === "workflow" && (
          <WorkflowSteps
            steps={steps}
            onChange={(v) => {
              setSteps(v);
              setAllowBackgroundIntegration(false);
            }}
          />
        )}
        {kind === "workflow" &&
          steps.some((s) => s.kind === "summary" || s.kind === "briefing") && (
            <label className="check-field">
              <input
                type="checkbox"
                checked={allowBackgroundAI}
                onChange={(e) => setAllowBackgroundAI(e.target.checked)}
              />
              {uiText(
                "أوافق على إرسال مصادر AI المختارة في هذه الخطوات عند كل تشغيل ضمن سقف الإنفاق.",
              )}
            </label>
          )}
        {kind === "integration" && (
          <IntegrationTarget
            integration={integration}
            projectId={project}
            onChange={(v) => {
              if ("integration" in v) setIntegration(v.integration || "github");
              if ("projectId" in v) setProject(v.projectId || "");
              setAllowBackgroundIntegration(false);
            }}
          />
        )}
        {(kind === "integration" ||
          (kind === "workflow" &&
            steps.some((s) => s.kind === "integration"))) && (
          <label className="check-field">
            <input
              type="checkbox"
              checked={allowBackgroundIntegration}
              onChange={(e) => setAllowBackgroundIntegration(e.target.checked)}
            />
            {uiText(
              "أوافق على فحص الخدمات والمشاريع المحددة عند كل تشغيل، بالحساب الحالي وللقراءة فقط.",
            )}
          </label>
        )}
        {kind === "briefing" && (
          <section className="summary-approval">
            <p>
              {uiText(
                "يرسل عناوين المهام الحالية وحالتها وأولويتها ومواعيدها إلى الخدمة المختارة، ويضع خطة يوم قصيرة في الوارد مع إشعار Windows. يتضمن أيضاً المهام التي ستضيفها لاحقاً.",
              )}
            </p>
            <label className="field">
              {uiText("الخدمة")}
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as any);
                  setAllowBackgroundAI(false);
                }}
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="chatgpt">ChatGPT Subscription</option>
              </select>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={allowBackgroundAI}
                onChange={(e) => setAllowBackgroundAI(e.target.checked)}
              />
              {uiText(
                "أوافق على إرسال بيانات المهام هذه عند كل تشغيل ضمن حدود الخدمة والموافقة الحالية، بما فيها استهلاك اشتراك ChatGPT عند اختياره.",
              )}
            </label>
          </section>
        )}
        {kind === "summary" && (
          <section className="summary-approval">
            <label className="field">
              {uiText("خدمة التلخيص")}
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as any);
                  setAllowBackgroundAI(false);
                }}
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="chatgpt">ChatGPT Subscription</option>
              </select>
            </label>
            <h3>{uiText("الملاحظات التي سيُرسل نصها")}</h3>
            {!data.notes.length && (
              <p className="info-strip">
                {uiText("أنشئ ملاحظة أولاً من صفحة الملاحظات.")}
              </p>
            )}
            {data.notes.map((n) => (
              <div key={n.id}>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={noteIds.includes(n.id)}
                    disabled={!noteIds.includes(n.id) && noteIds.length >= 10}
                    onChange={(e) => {
                      setNoteIds(
                        e.target.checked
                          ? [...noteIds, n.id]
                          : noteIds.filter((id) => id !== n.id),
                      );
                      setAllowBackgroundAI(false);
                    }}
                  />
                  {n.title}
                </label>
                {noteIds.includes(n.id) && (
                  <details>
                    <summary>{uiText("معاينة النص المُرسل")}</summary>
                    <pre className="prose-output" dir="auto">
                      {n.body}
                    </pre>
                  </details>
                )}
              </div>
            ))}
            <p className="dialog-note">
              {uiText(
                "تُرسل الملاحظات المختارة فقط بطلب تلخيص ثابت، وتحفظ النتيجة في الوارد. تعديل أي ملاحظة أو إعداد المزوّد يلغي التفويض. حدود الرموز والطلبات في الإعدادات تنطبق على كل محاولة.",
              )}
            </p>
            <label className="check-field">
              <input
                type="checkbox"
                checked={allowBackgroundAI}
                onChange={(e) => setAllowBackgroundAI(e.target.checked)}
              />
              {uiText("أسمح بإرسال هذه النصوص إلى")}{" "}
              {provider === "gemini"
                ? "Gemini"
                : provider === "chatgpt"
                  ? "ChatGPT Subscription"
                  : "OpenAI API"}{" "}
              {uiText("للتلخيص عند التشغيل والموعد المحدد.")}
            </label>
          </section>
        )}
        {kind === "reminder" && (
          <label className="field">
            {uiText("رسالة التذكير")}
            <textarea
              value={message}
              maxLength={1000}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
        )}
        {kind === "backup" && (
          <label className="field">
            {uiText("مصدر ملفات النسخة")}
            <select
              aria-label={uiText("مصدر النسخ المجدول")}
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">{uiText("كل المجلدات المصرح بنسخها")}</option>
              {data.projects
                .filter((p) => p.root && p.backupFiles && !p.archived)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <small>
              {uiText(
                "بيانات البرنامج محفوظة أيضاً؛ ملفات المجلد المختار فقط تُضاف إلى الأرشيف وفق استثناءاته.",
              )}
            </small>
          </label>
        )}
        {kind === "report" && (
          <label className="field">
            {uiText("المشروع")}
            <select
              required
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">{uiText("اختر مشروعاً")}</option>
              {data.projects
                .filter((p) => p.root)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {kind === "backup" && (
          <p className="info-strip">
            <ShieldCheck size={18} />
            {uiText(
              "تحتاج ربط Drive وحفظ مفتاح الاسترداد. تُنسخ بيانات البرنامج وملفات المصادر التي تختارها وتسمح بنسخها؛ تُستثنى الأسرار دائماً.",
            )}
          </p>
        )}
        {kind === "integration" && (
          <section className="paper settings-panel">
            <label className="checkbox-field">
              <input
                type="checkbox"
                aria-label={uiText("إعادة محاولة فحص الاتصال تلقائياً")}
                checked={retryEnabled}
                onChange={(e) => setRetryEnabled(e.target.checked)}
              />
              {uiText("إعادة محاولة فحص الاتصال تلقائياً")}
            </label>
            <p>
              {uiText(
                "تُعاد قراءة الخدمة عند فشل الاتصال فقط، حتى الحد المحدد شاملاً المحاولة الأولى. لا تُعاد طلبات AI أو النسخ أو خطوات Workflow تلقائياً بهذه السياسة. تتوقف المحاولة عند تغيير الربط أو التفويض، وتحتاج مراجعة بعد إعادة تشغيل البرنامج.",
              )}
            </p>
            {retryEnabled && (
              <div className="form-grid">
                <label className="field">
                  {uiText("الحد الأقصى للمحاولات")}
                  <select
                    aria-label={uiText("الحد الأقصى للمحاولات")}
                    value={retryAttempts}
                    onChange={(e) => setRetryAttempts(Number(e.target.value))}
                  >
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </label>
                <label className="field">
                  {uiText("الفاصل بين المحاولات بالثواني")}
                  <input
                    aria-label={uiText("الفاصل بين المحاولات بالثواني")}
                    type="number"
                    min={15}
                    max={300}
                    value={retryDelay}
                    onChange={(e) => setRetryDelay(Number(e.target.value))}
                  />
                </label>
              </div>
            )}
          </section>
        )}
        <div className="form-grid">
          <label className="field">
            {uiText("التوقيت")}
            <select
              aria-label={uiText("التوقيت")}
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPreview([]);
              }}
            >
              <option value="event">{uiText("عند حدوث تغيير")}</option>
              <option value="condition">{uiText("عند تحقق شرط محلي")}</option>
              <option value="manual">{uiText("يدوي")}</option>
              <option value="once">{uiText("مرة واحدة")}</option>
              <option value="daily">{uiText("يومياً")}</option>
              <option value="weekly">{uiText("أسبوعياً")}</option>
            </select>
          </label>
          {type === "event" && (
            <>
              <label className="field">
                {uiText("الحدث")}
                <select
                  value={event}
                  onChange={(e) => setEvent(e.target.value)}
                >
                  <option value="task.completed">{uiText("إكمال مهمة")}</option>
                  <option value="note.saved">{uiText("حفظ ملاحظة")}</option>
                  <option value="project.added">{uiText("إضافة مشروع")}</option>
                  <option value="project.changed">
                    {uiText("تغيّر ملفات مشروع")}
                  </option>
                </select>
              </label>
              {event === "project.changed" && (
                <label className="field">
                  {uiText("المشروع")}
                  <select
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                  >
                    {data.projects
                      .filter((p) => p.root)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <ProjectPermissions
                    project={data.projects.find((p) => p.id === project)}
                  />
                </label>
              )}
            </>
          )}
          {type === "once" && (
            <label className="field">
              {uiText("التاريخ والوقت على جهازك")}
              <input
                required
                type="datetime-local"
                value={at}
                onChange={(e) => setAt(e.target.value)}
              />
            </label>
          )}
          {["daily", "weekly"].includes(type) && (
            <>
              <label className="field">
                {uiText("الوقت")}
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
              <label className="field">
                {uiText("المنطقة الزمنية")}
                <input
                  required
                  dir="ltr"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                />
              </label>
            </>
          )}
          {type === "weekly" && (
            <label className="field">
              {uiText("اليوم")}
              <select
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
              >
                {[
                  uiText("الاثنين"),
                  uiText("الثلاثاء"),
                  uiText("الأربعاء"),
                  uiText("الخميس"),
                  uiText("الجمعة"),
                  uiText("السبت"),
                  uiText("الأحد"),
                ].map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {type === "condition" && (
          <ConditionEditor
            condition={condition}
            onChange={setCondition}
            minutes={conditionMinutes}
            onMinutes={setConditionMinutes}
          />
        )}
        {!["manual", "event", "condition"].includes(type) && (
          <>
            <label className="field">
              {uiText("عند فوات الموعد")}
              <select
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
              >
                <option value="skip">{uiText("تخطي الموعد الفائت")}</option>
                <option value="coalesceLatest">
                  {uiText("اقتراح آخر موعد لمراجعتي، بدون تنفيذ تلقائي")}
                </option>
              </select>
            </label>
            <button
              type="button"
              className="button secondary small"
              onClick={async () => {
                const r = await act({ op: "schedule.preview", trigger });
                if (r) setPreview(r);
              }}
            >
              {uiText("معاينة المواعيد القادمة")}
            </button>
            {preview.length > 0 && (
              <ul className="schedule-preview">
                {preview.map((d) => (
                  <li key={d}>{when(d)}</li>
                ))}
              </ul>
            )}
          </>
        )}
        <label className="check-field">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {uiText("تفعيل الجدولة بعد الحفظ")}
        </label>
        <p className="dialog-note">
          {uiText(
            "الافتراضي مسودة. التشغيل اليدوي والجدولة يحترمان التعليق والإيقاف ووضع اللعب.",
          )}
        </p>
        <div className="form-actions">
          <button className="button primary">{uiText("حفظ الأتمتة")}</button>
        </div>
      </form>
    </Modal>
  );
}
