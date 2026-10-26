import { uiFormat, uiText } from "../localization.ts";
import React, { useState } from "react";
import { useApp, errorText } from "./context.tsx";
import { when } from "./shared.tsx";
type Provider = "vercel" | "railway";
const names = { vercel: "Vercel", railway: "Railway" };
export function DeploymentSettings() {
  return (
    <>
      <DeploymentCredential provider="vercel" />
      <DeploymentCredential provider="railway" />
    </>
  );
}
function DeploymentCredential({ provider }: { provider: Provider }) {
  const { data, act } = useApp(),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    name = names[provider],
    configured = data.integrations[provider].configured;
  return (
    <section className="paper settings-panel">
      <h2>
        {name}
        {uiText(" · متابعة النشر")}
      </h2>
      <p>
        {provider === "vercel"
          ? uiText(
              "استخدم رمز Vercel محدود النطاق للفريق المطلوب، ثم أدخل Project ID وTeam ID من بيانات المشروع.",
            )
          : uiText(
              "استخدم Project Token من إعدادات مشروع Railway للبيئة المطلوبة. رموز الحساب العامة غير مدعومة هنا؛ يطابق البرنامج معرّف المشروع والبيئة قبل قراءة الحالة.",
            )}
      </p>
      <p>
        {configured
          ? uiFormat("رمز {0} محفوظ ومحمي بواسطة Windows", [name])
          : uiFormat("لم يُحفظ رمز {0}", [name])}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const result = await act(
              {
                op: "integration.save",
                integration: provider,
                token: token.trim(),
              },
              uiFormat("حُفظ رمز {0}", [name]),
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
            aria-label={uiFormat("رمز {0}", [name])}
            type="password"
            autoComplete="off"
            maxLength={1000}
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <button className="button secondary" disabled={busy}>
          {uiText("حفظ رمز ")}
          {name}
        </button>
      </form>
      {configured && (
        <button
          className="text-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await act(
                { op: "integration.disconnect", integration: provider },
                uiFormat("أُزيل رمز {0} محلياً", [name]),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {uiText("إزالة رمز ")}
          {name}
        </button>
      )}
      <small>
        {uiText(
          "الحفظ لا يثبت صلاحية الرمز؛ فحص النشر من المشروع يختبره فعلياً. المتابعة تقرأ الحالة فقط؛ لا تنشر ولا تعيد التشغيل ولا تغيّر خدمة بعيدة. الأسرار مستثناة من النسخ.",
        )}
      </small>
    </section>
  );
}
export function DeploymentLinkFields({
  value,
  onChange,
}: {
  value: any;
  onChange: (value: any) => void;
}) {
  const v = value?.vercel,
    r = value?.railway;
  const update = (provider: Provider, field: string, text: string) =>
    onChange({
      ...value,
      [provider]: { ...value[provider], [field]: text || undefined },
    });
  return (
    <fieldset className="deployment-links">
      <legend>{uiText("خدمات النشر المرتبطة")}</legend>
      <label className="check-field">
        <input
          aria-label={uiText("ربط Vercel")}
          type="checkbox"
          checked={!!v}
          onChange={(e) =>
            onChange({
              ...value,
              vercel: e.target.checked
                ? { projectId: "", target: "production" }
                : null,
            })
          }
        />
        {uiText("متابعة Vercel")}
      </label>
      {v && (
        <>
          <label className="field">
            Vercel Project ID
            <input
              aria-label="Vercel Project ID"
              dir="ltr"
              required
              maxLength={84}
              placeholder="prj_…"
              value={v.projectId || ""}
              onChange={(e) => update("vercel", "projectId", e.target.value)}
            />
          </label>
          <label className="field">
            {uiText("Vercel Team ID، اختياري")}
            <input
              aria-label="Vercel Team ID"
              dir="ltr"
              maxLength={85}
              placeholder="team_…"
              value={v.teamId || ""}
              onChange={(e) => update("vercel", "teamId", e.target.value)}
            />
          </label>
          <label className="field">
            {uiText("بيئة Vercel")}
            <select
              aria-label={uiText("بيئة Vercel")}
              value={v.target}
              onChange={(e) => update("vercel", "target", e.target.value)}
            >
              <option value="production">Production</option>
              <option value="preview">Preview</option>
            </select>
          </label>
        </>
      )}
      <label className="check-field">
        <input
          aria-label={uiText("ربط Railway")}
          type="checkbox"
          checked={!!r}
          onChange={(e) =>
            onChange({
              ...value,
              railway: e.target.checked
                ? { projectId: "", serviceId: "", environmentId: "" }
                : null,
            })
          }
        />
        {uiText("متابعة Railway")}
      </label>
      {r &&
        (["projectId", "serviceId", "environmentId"] as const).map((field) => {
          const label = `Railway ${field === "projectId" ? "Project" : field === "serviceId" ? "Service" : "Environment"} ID`;
          return (
            <label className="field" key={field}>
              {label}
              <input
                aria-label={label}
                dir="ltr"
                required
                maxLength={36}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={r[field] || ""}
                onChange={(e) => update("railway", field, e.target.value)}
              />
            </label>
          );
        })}
      <small>
        {uiText(
          "تُحفظ معرّفات الربط فقط هنا. مفاتيح الخدمة تدخل من الإعدادات.",
        )}
      </small>
    </fieldset>
  );
}
export function ProjectDeployments({ project }: { project: any }) {
  const { data, act } = useApp(),
    [busy, setBusy] = useState<Provider | null>(null),
    p = data.projects.find((p) => p.id === project.id) || project;
  return (
    <section className="project-deployments">
      <h3>{uiText("حالة النشر")}</h3>
      {!p.deployments?.vercel && !p.deployments?.railway ? (
        <p className="muted">
          {uiText(
            "اربط Vercel أو Railway من بيانات المشروع، ثم أضف رمز الخدمة من الإعدادات.",
          )}
        </p>
      ) : (
        (["vercel", "railway"] as const)
          .filter((provider) => p.deployments?.[provider])
          .map((provider) => {
            const receipt = p.deploymentChecks?.[provider],
              name = names[provider];
            return (
              <section className="paper" key={provider}>
                <h4>{name}</h4>
                {!data.integrations[provider].configured && (
                  <p>
                    {uiText("أضف رمز ")}
                    {name}
                    {uiText(" من الإعدادات لإجراء الفحص.")}
                  </p>
                )}
                <button
                  className="button secondary small"
                  disabled={!!busy || !data.integrations[provider].configured}
                  onClick={async () => {
                    setBusy(provider);
                    try {
                      await act({
                        op: "deployment.check",
                        projectId: p.id,
                        provider,
                      });
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {uiText("فحص نشر ")}
                  {name}
                </button>
                {receipt ? (
                  <>
                    <p>
                      <strong data-testid={`deployment-${provider}-state`}>
                        {receipt.state}
                      </strong>{" "}
                      ·{" "}
                      {receipt.status === "verified"
                        ? uiText("الحالة متحققة من المصدر")
                        : receipt.status === "failed"
                          ? uiText("فشل مسجل لدى الخدمة")
                          : uiText("تعذّر إثبات جاهزية النشر")}
                    </p>
                    <p>
                      {uiText("مرجع النشر: ")}
                      <bdi>{receipt.reference || uiText("غير متاح")}</bdi>
                    </p>
                    {receipt.commit && (
                      <p>
                        Commit: <bdi>{receipt.commit}</bdi>
                      </p>
                    )}
                    <small>
                      {uiText("المصدر: ")}
                      {receipt.provider}
                      {uiText(" API · وقت قراءة الحالة:")}{" "}
                      {when(receipt.observedAt)}
                      {receipt.createdAt && (
                        <>
                          {uiText(" · إنشاء النشر: ")}
                          {when(receipt.createdAt)}
                        </>
                      )}
                    </small>
                    {receipt.reason && <p>{errorText(receipt.reason)}</p>}
                  </>
                ) : (
                  <p className="muted">{uiText("لم يُفحص هذا الربط بعد.")}</p>
                )}
              </section>
            );
          })
      )}
      <small>
        {uiText(
          "هذه قراءات مؤرخة وليست مراقبة لحظية لاستمرارية الخدمة. حالة READY أو SUCCESS وحدها لا تثبت تحقق متطلبات المهمة. Railway يثبت حالة الخدمة؛ مطابقة Commit المحدد تبقى غير متحققة عند غياب مرجعه الموثوق.",
        )}
      </small>
    </section>
  );
}
