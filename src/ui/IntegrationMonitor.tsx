import { uiText } from "../localization.ts";
import React from "react";
import { useApp } from "./context.tsx";
export function IntegrationTarget({
  integration,
  projectId,
  onChange,
}: {
  integration: string;
  projectId: string;
  onChange: (v: { integration?: string; projectId?: string }) => void;
}) {
  const { data } = useApp();
  const projects = data.projects.filter(
    (p) =>
      !p.archived &&
      p.kind !== "workfiles" &&
      (integration === "github" ? p.github : p.deployments?.[integration]),
  );
  const p = projects.find((p) => p.id === projectId);
  return (
    <section className="summary-approval">
      <label className="field">
        {uiText("خدمة الفحص")}
        <select
          aria-label={uiText("خدمة الفحص")}
          value={integration}
          onChange={(e) =>
            onChange({ integration: e.target.value, projectId: undefined })
          }
        >
          <option value="github">GitHub</option>
          <option value="vercel">Vercel</option>
          <option value="railway">Railway</option>
        </select>
      </label>
      <label className="field">
        {uiText("مشروع الفحص")}
        <select
          aria-label={uiText("مشروع الفحص")}
          required
          value={projectId || ""}
          onChange={(e) => onChange({ projectId: e.target.value })}
        >
          <option value="">{uiText("اختر مشروعاً مرتبطاً بالخدمة")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {p && (
        <p dir="ltr">
          <bdi>
            {integration === "github"
              ? `${p.github.owner}/${p.github.repo} · ${p.github.branch || "default branch"}`
              : integration === "vercel"
                ? `${p.deployments.vercel.projectId} · ${p.deployments.vercel.teamId || "personal"} · ${p.deployments.vercel.target}`
                : `${p.deployments.railway.projectId} · service ${p.deployments.railway.serviceId} · environment ${p.deployments.railway.environmentId}`}
          </bdi>
        </p>
      )}
      <p className="muted">
        {uiText(
          "قراءة الحالة فقط بالحساب المضبوط في الإعدادات. تغيير الحساب أو الربط يوقف التفويض ويحتاج مراجعة جديدة. لا ينشر المشروع ولا يرفع الكود. تُحفظ الحالة ووقت الفحص في الوارد.",
        )}
      </p>
      {integration !== "github" &&
        !data.integrations[integration as "github" | "vercel" | "railway"]
          ?.configured && (
          <p className="info-strip">
            {uiText("أضف رمز الخدمة من الإعدادات قبل حفظ الأتمتة.")}
          </p>
        )}
      {!projects.length && (
        <p className="info-strip">
          {uiText("أضف ربط الخدمة من بيانات المشروع أولاً.")}
        </p>
      )}
    </section>
  );
}
