import { localeTag } from "../localization.ts";
import { uiFormat, uiLabels, uiText } from "../localization.ts";
import React, { useState } from "react";
import {
  Play,
  Pause,
  Square,
  Gamepad2,
  Plus,
  ArrowUpLeft,
  Clock3,
  Cloud,
  ShieldCheck,
  Check,
  Activity,
  Workflow,
  FolderKanban,
} from "lucide-react";
import { useApp } from "./context.tsx";
import { DashboardContext } from "./DashboardContext.tsx";
import { TaskForm, TaskList, ProjectCard, Empty, when } from "./shared.tsx";
export const stateLabels: Record<string, string> = uiLabels({
  Running: "يعمل الآن",
  Stopped: "متوقف",
  Paused: "موقوف مؤقتاً",
  Stopping: "جارٍ الإيقاف بأمان",
  Pausing: "جارٍ التوقف بأمان",
});
export function EnginePanel() {
  const { data, act } = useApp();
  const e = data.engine;
  return (
    <section className="engine-panel">
      <div className="engine-head">
        <span className="engine-label">
          <span
            className={`status-dot ${e.mode === "Running" ? "green" : ""}`}
          />
          {uiText("المحرك المحلي")}
        </span>
        <span className="badge" data-testid="engine-state" aria-live="polite">
          {stateLabels[e.effective]}
        </span>
      </div>
      <div className="engine-body">
        <div className="engine-copy">
          <h2>
            {e.mode === "Stop"
              ? uiText("أنت تتحكّم بالإيقاع.")
              : e.gaming
                ? uiText("مساحة أكبر للّعب.")
                : e.mode === "Pause"
                  ? uiText("خذ وقتك، كل شيء محفوظ.")
                  : uiText("مساحتك تتحرّك معك.")}
          </h2>
          <p>
            {e.active
              ? uiText("توجد عملية جارية؛ الإيقاف ينتظر نهايتها الآمنة.")
              : e.gaming
                ? uiText("الأعمال الثقيلة والذكاء الاصطناعي مؤجلة.")
                : e.mode === "Running"
                  ? uiText("المهام المفعّلة تعمل في أوقاتها وأنت المتحكّم.")
                  : uiText("البيانات متاحة. المهام المجدولة تنتظر التشغيل.")}
          </p>
        </div>
        <div
          className={`engine-orbit ${e.active ? "working" : ""}`}
          aria-hidden="true"
        >
          <svg width="120" height="120" viewBox="0 0 120 120">
            <ellipse
              cx="60"
              cy="60"
              rx="53"
              ry="25"
              fill="none"
              stroke="currentColor"
              opacity=".23"
              transform="rotate(-32 60 60)"
            />
            <ellipse
              cx="60"
              cy="60"
              rx="53"
              ry="25"
              fill="none"
              stroke="currentColor"
              opacity=".23"
              transform="rotate(32 60 60)"
            />
            <circle cx="60" cy="60" r="18" fill="currentColor" opacity=".1" />
            <path
              d="M55 46v28m8-25c15 0 15 11 0 11m0 4c13 0 13 10 0 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="103" cy="32" r="4" fill="currentColor" />
          </svg>
        </div>
      </div>
      <div className="engine-controls">
        {(
          [
            { mode: "Running", label: uiText("تشغيل"), icon: Play },
            { mode: "Pause", label: uiText("تعليق"), icon: Pause },
            { mode: "Stop", label: uiText("إيقاف"), icon: Square },
          ] as const
        ).map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            className={`mode-button ${e.mode === mode ? "selected" : ""}`}
            aria-pressed={e.mode === mode}
            onClick={() =>
              void act({ op: "engine.mode", mode, epoch: e.epoch })
            }
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
        <span className="engine-footnote">
          {e.active
            ? uiText("عملية واحدة قيد التنفيذ")
            : uiText("لا توجد عمليات جارية")}
        </span>
      </div>
    </section>
  );
}
export function GamingPanel() {
  const { data, act } = useApp();
  const e = data.engine;
  return (
    <section className={`gaming-panel paper ${e.gaming ? "gaming-on" : ""}`}>
      <div className="gaming-top">
        <div className="gaming-icon">
          <Gamepad2 size={22} />
        </div>
        <button
          className={`switch ${e.gamingManual ? "on" : ""}`}
          role="switch"
          aria-label={uiText("وضع اللعب")}
          aria-checked={e.gamingManual}
          onClick={() =>
            void act({
              op: "engine.gaming",
              enabled: !e.gamingManual,
              epoch: e.epoch,
            })
          }
        >
          <span />
        </button>
      </div>
      <h2>{uiText("وضع اللعب")}</h2>
      <p>
        {e.gamingQuiescing
          ? uiText("ننتظر توقف العملية الجارية بأمان.")
          : e.gaming
            ? uiText("مفعّل. الفهرسة والرفع وطلبات AI مؤجلة.")
            : uiText("راحة أكبر لجهازك عندما تحتاجها.")}
      </p>
      <div className="gaming-bottom">
        <span className={`status-dot ${e.gaming ? "green" : ""}`} />
        {e.gamingAutomatic
          ? uiText("لعبة محددة تعمل الآن؛ التفعيل التلقائي نشط")
          : e.gamingManual
            ? uiText("تعطيله لا يغيّر حالة المحرك")
            : uiText("فعّله يدوياً أو حدد ألعابك في الإعدادات")}
      </div>
    </section>
  );
}
export function Dashboard() {
  const { data, go, act } = useApp();
  const [task, setTask] = useState(false);
  const scopedTasks = data.tasks.filter((t) =>
    data.dashboard.taskIds.includes(t.id),
  );
  const scopedProjects = data.projects.filter((p) =>
    data.dashboard.projectIds.includes(p.id),
  );
  const upcoming = data.jobs
    .filter((j) => j.enabled && data.dashboard.jobIds.includes(j.id))
    .sort((a, b) => String(a.nextDueAt).localeCompare(String(b.nextDueAt)))
    .slice(0, 4);
  const last = data.backups.find((b) => b.id === data.dashboard.backupId);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{uiText("كل شيء في مكانه.")}</h1>
          <p>{uiText("مساحتك المحلية، بوضوح وهدوء.")}</p>
        </div>
        <div className="page-heading-actions">
          <span className="date-label">
            {new Date().toLocaleDateString(localeTag(), {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
          <button className="button primary" onClick={() => go("automations")}>
            <Plus size={17} />
            {uiText("أتمتة جديدة")}
          </button>
        </div>
      </div>
      <DashboardContext />
      <section className="paper planning-strip">
        <div>
          <h2>
            {data.dashboard.mode === "project"
              ? uiText("ملخص المشروع")
              : data.dashboard.mode === "review"
                ? uiText("ملخص المراجعة")
                : uiText("ملخص يومك")}
          </h2>
          <p>
            {
              scopedTasks.filter(
                (t) => !t.done && t.dueAt && Date.parse(t.dueAt) < Date.now(),
              ).length
            }{" "}
            {uiText("مهمة متأخرة ·")}{" "}
            {
              scopedTasks.filter(
                (t) => !t.done && ["urgent", "high"].includes(t.priority),
              ).length
            }{" "}
            {uiText("مهمة ذات أولوية ·")}{" "}
            {data.plans.filter((p) => p.status === "pending").length}
            {uiText(" اقتراح ينتظر الموافقة")}
          </p>
        </div>
        <button className="button secondary" onClick={() => go("tasks")}>
          {uiText("مهامي ومواعيدي")}
        </button>
        <button
          className="button soft"
          onClick={async () => {
            await act({
              op: "chat.create",
              provider: data.defaultProvider,
              title: uiText("خطة اليوم"),
            });
            go("chat");
          }}
        >
          {uiText("خطط يومي مع Badawi")}
        </button>
        {data.plans.some((p) => p.status === "pending") && (
          <button className="button soft" onClick={() => go("chat")}>
            {uiText("مراجعة اقتراحات المساعد")}
          </button>
        )}
      </section>
      <section className="paper dashboard-attention">
        <h2>{uiText("المشاريع والتنبيهات التي تحتاج اهتماماً")}</h2>
        <p className="muted">
          {uiText(
            "نتائج الخدمات أدناه محفوظة من وقت الفحص الموضح؛ افتح المشروع لإجراء فحص جديد.",
          )}
        </p>
        {data.dashboard.attention.map((p) => (
          <div className="dashboard-attention-row" key={p.id}>
            <button className="text-button" onClick={() => go("projects")}>
              {p.name}
            </button>
            {p.reasons.map((r, i) => (
              <small className="badge warning" key={i}>
                {r.source === "tasks" ? uiText("المهام") : r.source} ·{" "}
                {(
                  {
                    overdue: uiText("مهام متأخرة"),
                    localChanges: uiText("تغييرات محلية"),
                    unverified: uiText("غير متحقق"),
                    ahead: uiText("تغييرات محلية غير مرفوعة"),
                    behind: uiText("تحديثات في GitHub"),
                    diverged: uiText("الفرعان مختلفان"),
                  } as Record<string, string>
                )[r.state] || r.state}{" "}
                · {r.checkedAt ? when(r.checkedAt) : uiText("لم يُفحص بعد")}
              </small>
            ))}
          </div>
        ))}
        {!data.dashboard.attention.length && (
          <p className="inline-empty">
            {uiText(
              "لا توجد ملاحظات مسجلة في السياق الحالي؛ هذا لا يؤكد حالة مصادر لم تُفحص.",
            )}
          </p>
        )}
        {data.inbox
          .filter((i) => data.dashboard.inboxIds.includes(i.id))
          .slice(0, 3)
          .map((i) => (
            <div className="dashboard-attention-row" key={i.id}>
              <button className="text-button" onClick={() => go("inbox")}>
                {i.title}
              </button>
              <small>{when(i.createdAt)}</small>
            </div>
          ))}
      </section>
      <div className="main-grid">
        <div className="primary-column">
          <EnginePanel />
          <section className="section">
            <div className="section-heading">
              <h2>
                {uiText("القادم في جدولك")}{" "}
                <span className="small-count">{upcoming.length}</span>
              </h2>
              <button className="text-button" onClick={() => go("automations")}>
                {uiText("إدارة الجدول ")}
                <ArrowUpLeft size={14} />
              </button>
            </div>
            <div className="paper schedule-list">
              {upcoming.length ? (
                upcoming.map((j) => (
                  <div className="schedule-row" key={j.id}>
                    <div className="schedule-icon">
                      <Workflow size={20} />
                    </div>
                    <div className="schedule-info">
                      <h3>{j.name}</h3>
                      <p>
                        {j.kind === "backup"
                          ? "Google Drive"
                          : j.kind === "report"
                            ? uiText("تقرير محلي للمشروع")
                            : j.kind === "integration"
                              ? uiFormat("فحص {0}", [j.integration])
                              : ["summary", "briefing"].includes(j.kind)
                                ? uiText("موجز بالذكاء الاصطناعي")
                                : j.kind === "workflow"
                                  ? uiText("سلسلة خطوات")
                                  : uiText("تذكير في الوارد")}
                      </p>
                    </div>
                    <div className="schedule-time">
                      <span>
                        {j.trigger.type === "condition"
                          ? uiText("عند تحقق الشرط")
                          : j.trigger.type === "event"
                            ? uiText("عند الحدث")
                            : when(j.nextDueAt)}
                      </span>
                      <small>
                        {data.engine.mode !== "Running"
                          ? uiText("بانتظار التشغيل")
                          : data.engine.gaming
                            ? uiText("مؤجل لوضع اللعب")
                            : uiText("مجدول")}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  icon={Clock3}
                  title={uiText("جدولك يبدأ من هنا")}
                  body={uiText("أضف تذكيراً أو تقرير مشروع، وحدد وقته بنفسك.")}
                  action={
                    <button
                      className="text-button"
                      onClick={() => go("automations")}
                    >
                      {uiText("إنشاء أول أتمتة ")}
                      <Plus size={15} />
                    </button>
                  }
                />
              )}
            </div>
          </section>
          <section className="section">
            <div className="section-heading">
              <h2>{uiText("مشاريعك")}</h2>
              <button className="text-button" onClick={() => go("projects")}>
                {uiText("كل المشاريع ")}
                <ArrowUpLeft size={14} />
              </button>
            </div>
            {scopedProjects.length ? (
              <div className="projects-grid">
                {scopedProjects.slice(0, 2).map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onOpen={() => go("projects")}
                  />
                ))}
              </div>
            ) : (
              <div className="paper">
                <Empty
                  title={uiText("مكان لمشروعك القادم")}
                  body={uiText(
                    "اربط مجلداً لقراءة ملفاته ومتابعة مهامه بأمان.",
                  )}
                  action={
                    <button
                      className="button secondary"
                      onClick={() => void act({ op: "project.pick" })}
                    >
                      <Plus size={16} />
                      {uiText("إضافة مشروع")}
                    </button>
                  }
                />
              </div>
            )}
          </section>
        </div>
        <aside className="context-column">
          <GamingPanel />
          <section className="section">
            <div className="section-heading">
              <h2>
                {data.dashboard.mode === "review"
                  ? uiText("تحتاج مراجعتك")
                  : uiText("أولوياتك")}
              </h2>
              <button
                className="icon-button"
                aria-label={uiText("إضافة مهمة")}
                onClick={() => setTask(true)}
              >
                <Plus size={17} />
              </button>
            </div>
            <div className="paper priorities">
              <TaskList limit={5} tasks={scopedTasks} />
            </div>
          </section>
          <section className="section">
            <div className="section-heading">
              <h2>{uiText("نسختك الآمنة")}</h2>
              <Cloud size={18} className="muted" />
            </div>
            <button
              className="paper backup-card real-backup"
              onClick={() => go("backups")}
            >
              <div className="backup-status">
                <div className="backup-icon">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3>
                    {last
                      ? uiText("تم التحقق من النسخة")
                      : uiText("لم تُنشأ نسخة بعد")}
                  </h3>
                  <p>
                    {last ? when(last.verifiedAt) : uiText("Google Drive فقط")}
                  </p>
                </div>
              </div>
              <p className="backup-note">
                {last
                  ? uiText("نُزّلت النسخة وفُك تشفيرها للتحقق.")
                  : !data.drive.connected
                    ? uiText("اربط حساب Google Drive لتبدأ.")
                    : !data.drive.keyExported
                      ? uiText(
                          "Drive مرتبط؛ احفظ مفتاح الاسترداد قبل أول نسخة.",
                        )
                      : uiText(
                          "Drive ومفتاح الاسترداد جاهزان؛ أنشئ أول نسخة من صفحة النسخ الاحتياطية.",
                        )}
              </p>
            </button>
          </section>
          <section className="section activity-section">
            <div className="section-heading">
              <h2>{uiText("آخر النشاط")}</h2>
              <button className="text-button" onClick={() => go("audit")}>
                {uiText("السجل")}
              </button>
            </div>
            <div className="activity-list">
              {data.audit.slice(0, 3).map((a) => (
                <div className="activity-row" key={a.sequence}>
                  <span className="activity-dot" />
                  <div>
                    <p>{eventLabel(a.event)}</p>
                    <small>{when(a.created)}</small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
      {task && <TaskForm onClose={() => setTask(false)} />}
    </>
  );
}
export function eventLabel(event: string) {
  const map: Record<string, string> = {
    "workspace.relinked": uiText("أُعيد ربط مساحة ملفات بعد المراجعة"),
    "files.catalogRefreshed": uiText("حُدّث فهرس الملفات المركزي"),
    "dashboard.contextChanged": uiText("تغيّر سياق لوحة التحكم"),
    "dashboard.pinChanged": uiText("تغيّرت العناصر المثبتة"),
    "integration.monitored": uiText("حُفظت نتيجة فحص خدمة مرتبط"),
    "assistant.proposed": uiText("اقتُرحت إجراءات تحتاج موافقتك"),
    "assistant.approved": uiText("اعتُمدت إجراءات المحادثة"),
    "assistant.actionCompleted": uiText("اكتمل إجراء من المحادثة"),
    "assistant.read": uiText("قرأ المساعد مصدراً مفوضاً"),
    "assistant.followupDeferred": uiText("حُفظ التنفيذ؛ متابعة AI مؤجلة"),
    "task.saved": uiText("حُفظت مهمة"),
    "task.reminded": uiText("حان تذكير مهمة"),
    "memory.saved": uiText("حُفظ تفضيل في الذاكرة"),
    "notification.dispatched": uiText("أُرسل إشعار إلى Windows"),
    "notification.shown": uiText("عرض Windows الإشعار"),
    "notification.failed": uiText("تعذر عرض إشعار Windows"),
    "project.permissions": uiText("تغيّرت صلاحيات مشروع"),
    "desktop.shortcutsInstalled": uiText("ثُبتت اختصارات البرنامج"),
    "provider.checked": uiText("نجح اختبار خدمة AI"),
    "app.started": uiText("فُتحت مساحة العمل"),
    "app.cleanExit": uiText("أُغلقت مساحة العمل بأمان"),
    "engine.mode": uiText("تغيّرت حالة المحرك"),
    "engine.gaming": uiText("تغيّر وضع اللعب"),
    "note.saved": uiText("حُفظت ملاحظة"),
    "note.removed": uiText("حُذفت ملاحظة"),
    "project.granted": uiText("أُضيف مشروع للقراءة"),
    "project.revoked": uiText("أُلغيت صلاحية مشروع"),
    "automation.saved": uiText("حُفظت أتمتة"),
    "run.verified": uiText("اكتملت مهمة وتم التحقق منها"),
    "run.finished": uiText("انتهت محاولة تنفيذ"),
    "schedule.skipped": uiText("تم تخطي موعد فائت"),
    "ai.approved": uiText("تمت الموافقة على إرسال نص"),
    "ai.completed": uiText("حُفظت إجابة المساعد"),
    "chat.created": uiText("بدأت محادثة"),
    "chat.sent": uiText("أُرسلت رسالة إلى AI"),
    "chat.completed": uiText("حُفظ رد المحادثة"),
    "chat.failed": uiText("لم تكتمل محاولة الرد"),
    "chat.removed": uiText("حُذفت محادثة محلية"),
    "automation.permissionRevoked": uiText(
      "أُلغي تفويض أتمتة بعد تغيير مصدرها",
    ),
    "automation.draftRequested": uiText("طُلب اقتراح أتمتة"),
    "automation.draftValidated": uiText("تم التحقق من صيغة اقتراح الأتمتة"),
    "ai.backgroundApproved": uiText("بدأ تلخيص الملاحظات المفوّض"),
    "ai.backgroundCompleted": uiText("حُفظ تلخيص الملاحظات في الوارد"),
    "provider.configured": uiText("حُفظت إعدادات خدمة AI"),
    "provider.disconnected": uiText("فُصلت خدمة AI"),
    "backup.verified": uiText("تم التحقق من نسخة Drive"),
    "drive.connected": uiText("رُبط Google Drive"),
    "drive.disconnected": uiText("فُصل Google Drive"),
    "drive.configured": uiText("حُفظ إعداد Drive"),
    "recoveryKey.exported": uiText("حُفظ مفتاح الاسترداد"),
    "recoveryKey.imported": uiText("استُورد مفتاح الاسترداد"),
    "git.read": uiText("قُرئت معلومات Git"),
  };
  return map[event] || event;
}
