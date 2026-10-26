import { uiText } from "../localization.ts";
import React, { useEffect, useState } from "react";
import { useApp, errorText } from "./context.tsx";
import { when } from "./shared.tsx";
import type { workReport } from "../core/reports.ts";
type Report = ReturnType<typeof workReport>;
export function Reports() {
  const { data, act, go } = useApp(),
    [days, setDays] = useState(30),
    [projectId, setProjectId] = useState(""),
    [revision, setRevision] = useState(0),
    [report, setReport] = useState<Report | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setBusy(true);
    setError("");
    setReport(null);
    window.badawi
      .command({ op: "report.read", days, ...(projectId ? { projectId } : {}) })
      .then((reply) => {
        if (!current) return;
        if (reply.ok) setReport(reply.data);
        else setError(reply.error);
      })
      .catch(() => {
        if (current) setError("OPERATION_FAILED");
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [days, projectId, revision]);
  const scopes = data.projects.filter(
    (p) => p.kind !== "workfiles" && !p.archived,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{uiText("تقدّم واضح، بأدلته.")}</h1>
          <p>
            {uiText(
              "الإنجاز المعلن منفصل عن الإنجاز الذي راجعت معاييره وفُحص دليله.",
            )}
          </p>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setRevision((r) => r + 1)}
          >
            {uiText("تحديث التقرير")}
          </button>
          <button
            className="button secondary"
            disabled={busy || !report}
            onClick={() =>
              void act(
                {
                  op: "report.export",
                  days,
                  ...(projectId ? { projectId } : {}),
                },
                uiText("حُفظ التقرير"),
              )
            }
          >
            {uiText("تصدير التقرير")}
          </button>
        </div>
      </div>
      <div className="report-filters paper">
        <label className="field">
          {uiText("فترة التقرير")}
          <select
            aria-label={uiText("فترة التقرير")}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>{uiText("7 أيام")}</option>
            <option value={30}>{uiText("30 يوماً")}</option>
            <option value={90}>{uiText("90 يوماً")}</option>
          </select>
        </label>
        <label className="field">
          {uiText("المشروع")}
          <select
            aria-label={uiText("مشروع التقرير")}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">{uiText("كل المشاريع والمهام")}</option>
            {scopes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {busy && <p role="status">{uiText("جارٍ قراءة التقرير المحلي…")}</p>}
      {error && <p role="alert">{errorText(error)}</p>}
      {report && (
        <>
          <div className="report-asof">
            <strong>
              {days === 7
                ? uiText("آخر 7 أيام")
                : days === 30
                  ? uiText("آخر 30 يوماً")
                  : uiText("آخر 90 يوماً")}
            </strong>
            <span>
              {uiText("وقت إنشاء التقرير: ")}
              {when(report.generatedAt)}
            </span>
          </div>
          <p className="settings-note">
            {uiText(
              "عدادات المهام والمشاريع تمثل السجلات الحالية. فترة التقرير تخص تشغيل الأتمتة والتنبيهات والنشاط فقط؛ لا تعني أن كل المهام اكتملت خلالها. حدّث التقرير بعد تغيير البيانات.",
            )}
          </p>
          <div className="report-metrics">
            {[
              {
                id: "claimed",
                label: uiText("مكتملة حسب الحالة"),
                value: report.tasks.claimedCompleted,
              },
              {
                id: "verified",
                label: uiText("إنجاز متحقق منه"),
                value: report.tasks.verified,
              },
              {
                id: "review",
                label: uiText("تحتاج مراجعة"),
                value: report.tasks.needsReview,
              },
              {
                id: "unknown",
                label: uiText("تعذّر التحقق"),
                value: report.tasks.unverified,
              },
              {
                id: "overdue",
                label: uiText("مهام متأخرة"),
                value: report.tasks.overdue,
              },
            ].map((m) => (
              <section className="paper" key={m.id}>
                <span>{m.label}</span>
                <strong data-testid={`report-${m.id}`}>{m.value}</strong>
              </section>
            ))}
          </div>
          {report.tasks.stale > 0 && (
            <p className="warning-text">
              {report.tasks.stale}
              {uiText(
                " فحوص سابقة تغيرت متطلباتها أو مراجعاتها أو ربط مشاريعها؛ لم تُحتسب كإنجاز متحقق منه.",
              )}
            </p>
          )}
          <section className="paper report-section">
            <h2>{uiText("تقدم المشاريع")}</h2>
            {!report.projects.length ? (
              <p>{uiText("لا توجد مشاريع فعّالة ضمن هذا النطاق.")}</p>
            ) : (
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>{uiText("المشروع")}</th>
                      <th>{uiText("المهام")}</th>
                      <th>{uiText("مكتملة حسب الحالة")}</th>
                      <th>{uiText("إنجاز متحقق منه")}</th>
                      <th>{uiText("متأخرة")}</th>
                      <th>{uiText("آخر فحص أدلة")}</th>
                      <th>{uiText("آخر نسخة Drive متحقق منها")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.projects.map((p) => (
                      <tr key={p.id}>
                        <th scope="row">{p.name}</th>
                        <td>{p.tasks.total}</td>
                        <td>
                          {p.tasks.claimedCompleted} · {p.completionPercent}%
                        </td>
                        <td>
                          {p.tasks.verified} · {p.verifiedPercent}%
                        </td>
                        <td>{p.tasks.overdue}</td>
                        <td>
                          {p.lastEvidenceAt
                            ? when(p.lastEvidenceAt)
                            : uiText("لم يُفحص")}
                        </td>
                        <td>
                          {p.lastBackupAt
                            ? when(p.lastBackupAt)
                            : uiText("لا توجد نسخة مسجلة")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <div className="report-columns">
            <section className="paper report-section">
              <h2>{uiText("الأتمتة خلال الفترة")}</h2>
              <dl className="report-pairs">
                <dt>{uiText("تشغيلات مسجلة")}</dt>
                <dd>{report.automation.total}</dd>
                <dt>{uiText("نجحت")}</dt>
                <dd>{report.automation.succeeded}</dd>
                <dt>{uiText("تم تخطيها دون تنفيذ")}</dt>
                <dd>{report.automation.skipped}</dd>
                <dt>{uiText("فشلت")}</dt>
                <dd>{report.automation.failed}</dd>
                <dt>{uiText("تحتاج مراجعة / متوقفة")}</dt>
                <dd>
                  {report.automation.needsReview + report.automation.blocked}
                </dd>
                <dt>{uiText("ملغاة")}</dt>
                <dd>{report.automation.cancelled}</dd>
                <dt>{uiText("جارية / في الانتظار")}</dt>
                <dd>{report.automation.running + report.automation.queued + report.automation.retryWaiting}</dd>
              </dl>
              <small>
                {uiText("المصدر: إيصالات التنفيذ المحلية · آخر تسجيل:")}{" "}
                {report.sources.automation.latestAt
                  ? when(report.sources.automation.latestAt)
                  : uiText("لا يوجد")}
              </small>
            </section>
            <section className="paper report-section">
              <h2>{uiText("النسخ والتنبيهات")}</h2>
              <dl className="report-pairs">
                <dt>{uiText("نسخ Drive متحقق منها للحساب الحالي")}</dt>
                <dd>{report.backups.verifiedCopies}</dd>
                <dt>{uiText("نسخ تنتظر الاستكمال")}</dt>
                <dd>{report.backups.pending}</dd>
                <dt>{uiText("تنبيهات الوارد خلال الفترة")}</dt>
                <dd>{report.alerts.count}</dd>
              </dl>
              <p>
                {uiText("آخر نسخة متحقق منها:")}{" "}
                {report.backups.lastVerifiedAt
                  ? when(report.backups.lastVerifiedAt)
                  : uiText("لا توجد")}
              </p>
              <small>
                {uiText(
                  "المصدر: سجلات النسخ المحلية. لم يفحص هذا التقرير وجود النسخ على Drive مجدداً.",
                )}
              </small>
              <p>
                <button className="text-button" onClick={() => go("inbox")}>
                  {uiText("فتح التنبيهات")}
                </button>
              </p>
            </section>
          </div>
          <section className="paper report-section">
            <h2>{uiText("المهام المتأخرة")}</h2>
            {!report.overdue.length ? (
              <p>{uiText("لا توجد مهام متأخرة ضمن النطاق.")}</p>
            ) : (
              <ul>
                {report.overdue.map((t) => (
                  <li key={t.id}>
                    <strong>{t.title}</strong> · {when(t.dueAt)}
                  </li>
                ))}
              </ul>
            )}
            {report.tasks.overdue > 100 && (
              <p>{uiText("تظهر أقدم 100 مهمة؛ العداد يشمل البقية.")}</p>
            )}
            <button className="text-button" onClick={() => go("tasks")}>
              {uiText("فتح المهام")}
            </button>
          </section>
          <p className="settings-note">
            {uiText(
              "المصدر الأساسي: سجلات SQLite المحلية ومعايير المراجعة وإيصالات التحقق. أوقات Git وCI والنشر والنسخ تمثل قراءات مؤرخة؛ التقرير لا يجري فحصاً خارجياً جديداً. النشاط المتاح في ملف التصدير عينة من آخر 200 حدث عام في سجل التدقيق، حتى عند اختيار مشروع محدد.",
            )}
          </p>
        </>
      )}
    </>
  );
}
