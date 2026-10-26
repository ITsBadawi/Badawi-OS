import { uiFormat, uiText } from "../localization.ts";
import React, { useState } from "react";
import { useApp } from "./context.tsx";
import { when } from "./shared.tsx";
export function GitHubSettings() {
  const { data, act } = useApp(),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="paper settings-panel">
      <h2>GitHub</h2>
      <p>
        {uiText(
          "ربط المستودع يتم من بيانات المشروع. المستودعات العامة تُفحص بدون رمز. للمستودعات الخاصة استخدم رمزاً محدوداً للمستودعات المطلوبة، بصلاحية قراءة Metadata وContents، وأضف قراءة Actions إذا أردت فحص أدلة الاختبارات CI. للرفع بعد مراجعتك، يحتاج الرمز صلاحية كتابة Contents.",
        )}
      </p>
      <p>
        {data.integrations.github.configured
          ? uiText("رمز GitHub محفوظ ومحمي بواسطة Windows")
          : uiText("لم يُحفظ رمز GitHub")}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const result = await act(
              {
                op: "integration.save",
                integration: "github",
                token: token.trim(),
              },
              uiText("حُفظ رمز GitHub"),
            );
            if (result) setToken("");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          {uiText("رمز الوصول")}
          <input
            aria-label={uiText("رمز GitHub")}
            type="password"
            autoComplete="off"
            required
            maxLength={1000}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <button className="button secondary" disabled={busy} type="submit">
          {uiText("حفظ رمز GitHub")}
        </button>
      </form>
      {data.integrations.github.configured && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await act(
                { op: "integration.disconnect", integration: "github" },
                uiText("أُزيل رمز GitHub محلياً"),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {uiText("إزالة رمز GitHub")}
        </button>
      )}
      <p className="settings-note">
        {uiText(
          "الحفظ لا يثبت صلاحية الرمز. افحص مستودعاً للتحقق؛ لا تُحفظ الأسرار ضمن النسخ. إزالة الرمز من Badawi OS محلية؛ إبطاله من حسابك يتم في GitHub.",
        )}
      </p>
    </section>
  );
}
export function ProjectGitHub({ project }: { project: any }) {
  const { data, act } = useApp(),
    [busy, setBusy] = useState(false),
    p = data.projects.find((p) => p.id === project.id) || project,
    check = p.githubCheck;
  if (!p.github)
    return (
      <p className="muted">
        {uiText("أدخل مرجع GitHub من بيانات المشروع لفحص المستودع.")}
      </p>
    );
  const labels: Record<string, string> = {
    identical: uiText("نفس Commit محلياً وعلى GitHub"),
    ahead: uiText("Commit محلي متقدم على الفرع البعيد"),
    behind: uiText("الفرع البعيد متقدم على المحلي"),
    diverged: uiText("تغييرات محلية وبعيدة متفرعة"),
    unverified: uiText("تعذّر التحقق من المقارنة المحلية"),
  };
  return (
    <section>
      <h3>GitHub</h3>
      <p>
        <bdi>
          {p.github.owner}/{p.github.repo}
        </bdi>
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await act({ op: "github.check", projectId: p.id });
          } finally {
            setBusy(false);
          }
        }}
      >
        {uiText("فحص GitHub المرتبط")}
      </button>
      {check ? (
        <div>
          <p>
            {check.remoteHead === null
              ? uiText("المستودع فارغ؛ لا يوجد Commit بعيد بعد")
              : labels[check.comparison.state] || uiText("تحتاج مراجعة")}
            {check.comparison.ahead !== null &&
              uiFormat(" · محلي زائد: {0} · بعيد زائد: {1}", [
                check.comparison.ahead,
                check.comparison.behind,
              ])}
          </p>
          <p>
            {uiText("الفرع: ")}
            <bdi>{check.branch}</bdi>
            <br />
            GitHub HEAD: <bdi>{check.remoteHead || uiText("لا يوجد Commit بعد")}</bdi>
            <br />
            Local HEAD: <bdi>{check.localHead || uiText("غير متاح")}</bdi>
          </p>
          {check.localStatus !== null && (
            <pre className="code-preview" dir="ltr">
              {check.localStatus ||
                "No tracked changes at the recorded local read time"}
            </pre>
          )}
          <small>
            {uiText("المصدر: ")}
            {check.source}
            {uiText(" · آخر قراءة: ")}
            {when(check.checkedAt)}
          </small>
          <p className="settings-note">
            {uiText(
              "هذه نتيجة الفحص المسجلة. المقارنة المجهولة لا تثبت الرفع أو إنجاز المهام، وقد يتغير المستودع بعد قراءتها.",
            )}
          </p>
        </div>
      ) : (
        <p className="muted">
          {uiText(
            "لم يُفحص هذا الربط بعد. تُقرأ بيانات المستودع المحدد فقط عند تشغيل المحرك.",
          )}
        </p>
      )}
    </section>
  );
}
