import { uiFormat, uiLabels, uiText } from "../localization.ts";
import React, { useState } from "react";
import { useApp } from "./context.tsx";
import { Confirm } from "./shared.tsx";
const labels: Record<string, string> = uiLabels({
  "condition.preview": "معاينة شروط الأتمتة المحلية",
  "deployment.check": "متابعة حالة النشر",
  "report.read": "قراءة تقارير التقدم المحلية",
  "files.catalog": "البحث في فهرس الملفات المركزي",
  "files.list": "قائمة الملفات",
  "files.read": "قراءة الملفات",
  "files.search": "البحث في الملفات",
  "git.read": "قراءة Git",
  "task.list": "قائمة المهام",
  "task.read": "قراءة المهام",
  "note.read": "قراءة الملاحظات",
  "files.classify": "تصنيف ملفات العمل",
  "task.save": "حفظ المهام",
  "task.verify": "فحص أدلة المهام",
  "task.remove": "حذف المهام",
  "note.save": "حفظ الملاحظات",
  "note.remove": "حذف الملاحظات",
  "memory.save": "حفظ الذاكرة",
  "memory.remove": "حذف الذاكرة",
  "project.pick": "ربط مشروع محلي",
  "project.archive": "أرشفة المشاريع",
  "project.permissions": "صلاحيات المشاريع",
  "project.details": "بيانات المشاريع",
  "project.create": "إنشاء مشاريع فارغة",
  "github.check": "قراءة GitHub",
  "job.save": "حفظ الأتمتة",
  "job.remove": "حذف الأتمتة",
  "job.run": "تشغيل الأتمتة",
  "backup.run": "إنشاء نسخ Drive",
  "backup.list": "قائمة نسخ Drive",
  "desktop.openFolder": "فتح مجلد",
  "shell.exec": "تشغيل أوامر النظام",
  "code.write": "تعديل كود المشاريع",
});
export function ToolPolicies() {
  const { data, act } = useApp(),
    [review, setReview] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const save = async (
    tool: string,
    policy: "readOnly" | "auto" | "approval" | "forbidden",
  ) => {
    setBusy(true);
    try {
      return await act(
        { op: "tool.policy.set", tool: tool as any, policy },
        uiText("حُفظت سياسة الأداة"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="paper settings-panel">
      <details>
        <summary>{uiText("سياسات أدوات المساعد")}</summary>
        <p>
          {uiText(
            "تحدد هذه السياسات ما يستطيع AI فعله عبر المحادثة. صلاحيات المسارات وموافقة إرسال المصادر وحدود الاستخدام تبقى مطلوبة. الأتمتة التي تراجعها وتفعّلها من واجهتها لها تفويض مستقل. تغيير السياسة يلغي العمليات الجارية بأمان.",
          )}
        </p>
        <p>
          {uiText(
            "القراءة فقط تسمح بأدوات القراءة وتمنع الكتابة. التنفيذ التلقائي متاح لحفظ المهام والملاحظات والذاكرة وبعض القراءات فقط؛ بقية الإجراءات تحتاج موافقة أو تُمنع. قراءات GitHub ونسخ Drive الخارجية تبقى بحاجة لمراجعة إجراء حتى مع سياسة القراءة فقط.",
          )}
        </p>
        {data.toolPolicies.map((p) => (
          <label className="field" key={p.op}>
            {labels[p.op] || p.op}
            <select
              aria-label={uiFormat("سياسة {0}", [labels[p.op] || p.op])}
              disabled={busy || p.locked}
              value={p.policy}
              onChange={(e) => {
                const policy = e.target.value as typeof p.policy;
                if (policy === "auto") setReview(p.op);
                else void save(p.op, policy);
              }}
            >
              <option value="readOnly">{uiText("قراءة فقط")}</option>
              <option value="auto" disabled={!p.automaticAllowed}>
                {uiText("تنفيذ تلقائي ضمن الصلاحيات")}
              </option>
              <option value="approval">{uiText("يتطلب موافقة")}</option>
              <option value="forbidden">{uiText("ممنوع")}</option>
            </select>
            {p.locked && (
              <small>{uiText("ممنوع دائماً في هذا الإصدار.")}</small>
            )}
          </label>
        ))}
        <p className="settings-note">
          {uiText(
            "تُسجل السياسة وكل عملية في سجل التحقق. السياسات التلقائية لا تدخل النسخ الاحتياطية، لتعود الاستعادة إلى الإعدادات الآمنة.",
          )}
        </p>
      </details>
      {review && (
        <Confirm
          title={uiText("السماح بالتنفيذ التلقائي؟")}
          body={uiFormat(
            "الأداة: {0}. يمكن للمساعد تنفيذها في محادثاتك القادمة دون بطاقة موافقة لكل عملية، ضمن المصادر والصلاحيات وحدود التطبيق. لا يسمح هذا بالحذف أو تعديل الكود أو تجاوز تأكيد المواعيد الثابتة.",
            [labels[review]],
          )}
          button={uiText("أسمح بالتنفيذ التلقائي لهذه الأداة")}
          onClose={() => setReview(null)}
          onConfirm={() => save(review, "auto")}
        />
      )}
    </section>
  );
}
