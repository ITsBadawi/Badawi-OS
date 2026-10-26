import {
  prepareLanguage,
  translate,
  uiFormat,
  uiText,
} from "../localization.ts";
import React, { useState } from "react";
import {
  KeyRound,
  ShieldCheck,
  Cloud,
  Download,
  Plus,
  RefreshCw,
  ExternalLink,
  Check,
  Trash2,
  Send,
  Sparkles,
  Save,
  Settings2,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { useApp, errorText } from "./context.tsx";
import { Modal, Empty, Confirm, when } from "./shared.tsx";
import { PersonalSettings, ProjectPermissions } from "./Tasks.tsx";
import { eventLabel } from "./Dashboard.tsx";
import { ChatGPTSettings } from "./ChatGPTSettings.tsx";
import { GitHubSettings } from "./GitHub.tsx";
import { DeploymentSettings } from "./Deployments.tsx";
import { ToolPolicies } from "./ToolPolicies.tsx";
import { BackupScope } from "./BackupScope.tsx";
import { SelectiveRestore } from "./SelectiveRestore.tsx";
import { BackupHealth } from "./BackupHealth.tsx";
import { BackupRetention } from "./BackupRetention.tsx";
import { BackupCheckpoint } from "./BackupCheckpoint.tsx";
function LanguageSettings() {
  const { data, act, toast } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <section className="paper settings-panel language-settings">
      <h2>{uiText("لغة البرنامج")}</h2>
      <label className="field">
        {uiText("لغة الواجهة")}
        <select
          aria-label="Language / اللغة"
          value={data.language}
          disabled={busy}
          onChange={async (e) => {
            setBusy(true);
            try {
              const result = await act({
                op: "language.save",
                language: e.target.value as "ar" | "en",
              });
              if (result) {
                await prepareLanguage(result.language);
                toast(translate("حُفظت لغة البرنامج", result.language));
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          <option value="ar" lang="ar">
            العربية
          </option>
          <option value="en" lang="en">
            English
          </option>
        </select>
      </label>
      <p>
        {uiText(
          "تتغير لغة الواجهة واتجاهها والتواريخ. تبقى محادثاتك وأسماء ملفاتك وملاحظاتك كما كتبتها.",
        )}
      </p>
    </section>
  );
}
function GameDetectionSettings() {
  const { data, act, toast } = useApp();
  const [names, setNames] = useState(data.gameDetection.names.join("\n"));
  const [busy, setBusy] = useState(false);
  return (
    <section className="paper settings-panel">
      <h2>{uiText("كشف الألعاب تلقائياً")}</h2>
      <p>
        {uiText(
          "أدخل اسم ملف التشغيل لكل لعبة، مثل game.exe، في سطر مستقل. يفحص البرنامج أسماء العمليات فقط كل 30 ثانية ولا يغيّر اللعبة.",
        )}
      </p>
      <label className="field">
        {uiText("ملفات تشغيل الألعاب")}
        <textarea
          aria-label={uiText("ملفات تشغيل الألعاب")}
          value={names}
          onChange={(event) => setNames(event.target.value)}
          rows={4}
          spellCheck={false}
          dir="ltr"
          disabled={busy || !data.gameDetection.supported}
          placeholder="game.exe"
        />
      </label>
      <button
        className="button primary"
        disabled={busy || !data.gameDetection.supported}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await act({
              op: "game.list.save",
              names: names
                .split(/\r?\n/)
                .map((name) => name.trim())
                .filter(Boolean),
            });
            if (result) {
              setNames(result.names.join("\n"));
              toast(uiText("حُفظت قائمة الألعاب"));
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        {uiText("حفظ قائمة الألعاب")}
      </button>
      <p>
        {data.engine.gamingAutomatic
          ? uiText("لعبة محددة تعمل الآن؛ وضع اللعب التلقائي مفعّل.")
          : uiText("لا توجد لعبة محددة قيد التشغيل حالياً.")}
      </p>
      <p>
        {uiText(
          "إغلاق اللعبة يرفع التفعيل التلقائي فقط؛ اختيارك اليدوي وحالة المحرك يبقيان كما هما.",
        )}
      </p>
    </section>
  );
}
export function Settings() {
  const { data, act, toast } = useApp();
  const [provider, setProvider] = useState<"gemini" | "openai" | null>(null);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{uiText("اضبطها على راحتك.")}</h1>
          <p>{uiText("حساباتك وصلاحياتك وحدود العمل، بيدك.")}</p>
        </div>
      </div>
      <PersonalSettings />
      <LanguageSettings />
      <GameDetectionSettings />
      <ChatGPTSettings />
      <GitHubSettings />
      <DeploymentSettings />
      <ToolPolicies />
      <div className="settings-grid">
        <section className="paper settings-panel">
          <h2>{uiText("خدمات الذكاء الاصطناعي")}</h2>
          <label className="field">
            {uiText("مزوّد المحادثات والاقتراحات الجديدة")}
            <select
              aria-label={uiText("مزود AI الافتراضي")}
              value={data.defaultProvider}
              onChange={(e) =>
                void act(
                  { op: "provider.default", provider: e.target.value as any },
                  uiText("حُفظ مزوّدك الافتراضي"),
                )
              }
            >
              <option value="gemini">Gemini</option>
              <option value="openai">OpenAI API</option>
              <option value="chatgpt">ChatGPT Subscription</option>
            </select>
          </label>
          <p>
            {uiText(
              "يُطبّق على المحادثات والاقتراحات الجديدة. تبقى المحادثات والجداول السابقة مع مزوّدها المحدد، ويحتاج إرسال أي طلب خدمةً مُعدّة وموافقتك المعتادة.",
            )}
          </p>
          <p>
            {uiText(
              "إعداد الاتصال لا يرسل بيانات. المحادثة تشارك الرسائل وبيانات المهام والمشاريع والأتمتة وذاكرتك المحفوظة ومرفقاتك المختارة. قراءة محتوى المشاريع تحتاج اختيارك أو تفويضك.",
            )}
          </p>
          {(["gemini", "openai"] as const).map((p) => (
            <div className="setting-row provider-setting" key={p}>
              <span
                className={`provider-logo ${p === "gemini" ? "purple" : "green"}`}
              >
                {p === "gemini" ? (
                  <Sparkles size={22} />
                ) : (
                  <span className="openai-word">O</span>
                )}
              </span>
              <div className="setting-grow">
                <h3 dir="ltr">{p === "gemini" ? "Gemini" : "OpenAI"}</h3>
                <p>
                  {data.providers[p].configured
                    ? data.providers[p].verified
                      ? uiFormat("نجح آخر اتصال: {0}", [
                          when(data.providers[p].verified!.at),
                        ])
                      : uiText("المفتاح محفوظ؛ لم ينجح طلب بعد")
                    : uiText("غير مُعدّ")}
                </p>
                {data.providers[p].model && (
                  <small dir="ltr">{data.providers[p].model}</small>
                )}
              </div>
              <button
                className="button secondary small"
                onClick={() => setProvider(p)}
              >
                {data.providers[p].configured
                  ? uiText("إدارة")
                  : uiText("إعداد")}
              </button>
              {data.providers[p].configured && (
                <button
                  className="button secondary small"
                  onClick={async () => {
                    const r = await act({ op: "provider.check", provider: p });
                    if (r)
                      toast(
                        uiFormat("نجح الاتصال الفعلي: {0} · {1}", [
                          r.model,
                          r.text,
                        ]),
                      );
                  }}
                >
                  {uiText("اختبار الاتصال")}
                </button>
              )}
            </div>
          ))}
          <div className="info-strip">
            <ShieldCheck size={17} />
            {uiText("المفاتيح محمية بواسطة Windows ولا تدخل النسخ الاحتياطية.")}
          </div>
        </section>
        <section className="paper settings-panel">
          <h2>{uiText("مساحتك المحلية")}</h2>
          <p>
            {uiText("بياناتك محفوظة على جهازك. لا توجد خدمة تشغيل على خادم.")}
          </p>
          <div className="setting-row">
            <div>
              <h3>{uiText("المظهر الداكن")}</h3>
              <p>{uiText("يُحفظ اختيارك عند الإغلاق.")}</p>
            </div>
            <button
              className="switch"
              role="switch"
              aria-label={uiText("المظهر الداكن")}
              aria-checked={data.theme === "dark"}
              onClick={() =>
                void act({
                  op: "theme.set",
                  theme: data.theme === "dark" ? "light" : "dark",
                })
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <h3>{uiText("عند إغلاق النافذة")}</h3>
              <p>
                {data.preferences.tray
                  ? uiText(
                      "يستمر في شريط النظام؛ التنبيهات تعمل عند تشغيل المحرك.",
                    )
                  : uiText("تتوقف المهام بأمان ويُغلق البرنامج.")}
              </p>
            </div>
            <span className="badge">
              {data.preferences.tray
                ? uiText("شريط النظام")
                : uiText("خروج كامل")}
            </span>
          </div>
          <div className="setting-row">
            <div>
              <h3>{uiText("عند فتح البرنامج")}</h3>
              <p>{uiText("المحرك يبدأ متوقفاً، حتى بعد انقطاع مفاجئ.")}</p>
            </div>
            <span className="badge">{uiText("يدوي")}</span>
          </div>
          <div className="setting-row">
            <div>
              <h3>{uiText("تشغيل مع Windows")}</h3>
              <p>
                {data.preferences.startup
                  ? uiText(
                      "يفتح مخفياً في شريط النظام. المحرك يبدأ متوقفاً للأمان.",
                    )
                  : uiText("يمكن تفعيله من إعدادات التشغيل أعلاه.")}
              </p>
            </div>
            <span className="badge">
              {data.preferences.startup ? uiText("مفعّل") : uiText("متوقف")}
            </span>
          </div>
        </section>
        <section className="paper settings-panel">
          <h2>{uiText("صلاحيات المشاريع")}</h2>
          <p>
            {uiText(
              "أضف مجلدك من قسم الملفات باختيار Windows أو بإدخال مسار Workspace. أذونات AI والنسخ والمراقبة منفصلة لكل مشروع.",
            )}
          </p>
          <div className="permission-row">
            <ShieldCheck size={18} />
            <span>{uiText("القراءة فقط؛ بدون كتابة في كود مشاريعك.")}</span>
          </div>
          <div className="permission-row">
            <ShieldCheck size={18} />
            <span>
              {uiText("Git للقراءة؛ بدون commit أو push أو تشغيل أوامر حرة.")}
            </span>
          </div>
          <div className="permission-row">
            <ShieldCheck size={18} />
            <span>
              {uiText("الملفات السرية والروابط والمجلدات الثقيلة مستثناة.")}
            </span>
          </div>
        </section>
        <section className="paper settings-panel">
          <h2>{uiText("حدود الاستهلاك")}</h2>
          <p>
            {uiText(
              "AI المجدول يعمل فقط بتفويضك وبسقف يومي؛ التعليق والإيقاف يمنعان عمل الخلفية. حدّد الرموز والطلبات من إعدادات كل مزوّد.",
            )}
          </p>
          {(["gemini", "openai"] as const).map((p) => (
            <div className="setting-row" key={p}>
              <div>
                <h3>{p === "gemini" ? "Gemini" : "OpenAI"}</h3>
                <p>
                  {uiText(
                    "عداد يومي بتوقيت UTC. المحاولات غير المؤكدة تحتسب ضمن الحد.",
                  )}
                </p>
              </div>
              <span className="badge" dir="ltr">
                {data.providers[p].usedToday} / {data.providers[p].maxRequests}
              </span>
            </div>
          ))}
          <p className="settings-note">
            {uiText(
              "حدود الطلبات مشتركة للمحادثة والتلخيص والاقتراحات. الإنفاق تقدير محلي حسب الأسعار التي أدخلتها، وتبقى المحاولات غير المؤكدة محجوزة.",
            )}
          </p>
          {(["gemini", "openai"] as const).map((p) => (
            <div className="setting-row" key={`budget-${p}`}>
              <div>
                <h3>
                  {p === "gemini" ? "Gemini" : "OpenAI"}
                  {uiText(" · الإنفاق اليوم")}
                </h3>
                <p>
                  {data.providers[p].budget
                    ? uiFormat("السقف: ${0}", [
                        data.providers[p].budget!.dailyUSD,
                      ])
                    : uiText("لم تحدد سقفاً مالياً؛ AI المجدول غير مفوّض")}
                </p>
              </div>
              <span className="badge" dir="ltr">
                ${data.providers[p].budgetUsage.spentUSD.toFixed(5)} + $
                {data.providers[p].budgetUsage.heldUSD.toFixed(5)} held
              </span>
            </div>
          ))}
        </section>
      </div>
      {provider && (
        <ProviderForm provider={provider} onClose={() => setProvider(null)} />
      )}
    </>
  );
}
function ProviderForm({
  provider,
  onClose,
}: {
  provider: "gemini" | "openai";
  onClose: () => void;
}) {
  const { data, act } = useApp();
  const profile = data.providers[provider];
  const [model, setModel] = useState(profile.model),
    [models, setModels] = useState<string[]>([]),
    [discovering, setDiscovering] = useState(false),
    [key, setKey] = useState(""),
    [tokens, setTokens] = useState(profile.maxTokens),
    [requests, setRequests] = useState(profile.maxRequests),
    [budgetEnabled, setBudgetEnabled] = useState(!!profile.budget),
    [dailyUSD, setDailyUSD] = useState(
      profile.budget?.dailyUSD.toString() || "",
    ),
    [inputPrice, setInputPrice] = useState(
      profile.budget?.inputPerMillion.toString() || "",
    ),
    [outputPrice, setOutputPrice] = useState(
      profile.budget?.outputPerMillion.toString() || "",
    );
  return (
    <Modal
      title={uiFormat("إعداد {0}", [
        provider === "gemini" ? "Gemini" : "OpenAI",
      ])}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await act(
            {
              op: "provider.save",
              provider,
              model,
              key: key || undefined,
              maxTokens: tokens,
              maxRequests: requests,
              budget: budgetEnabled
                ? {
                    dailyUSD: Number(dailyUSD),
                    inputPerMillion: Number(inputPrice),
                    outputPerMillion: Number(outputPrice),
                    date: new Date().toISOString().slice(0, 10),
                  }
                : null,
            },
            uiText("حُفظ الإعداد. لم يُرسل طلب تجريبي."),
          );
          setKey("");
          if (result) onClose();
        }}
      >
        <label className="field">
          {uiText("معرّف النموذج")}
          <input
            required
            dir="ltr"
            placeholder={
              provider === "gemini"
                ? "gemini-3.8-flash"
                : uiText("اسم نموذج متاح في حسابك")
            }
            value={model}
            list="provider-models"
            onChange={(e) => setModel(e.target.value)}
          />
          <datalist id="provider-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="field">
          {uiText("مفتاح API")}
          <input
            type="password"
            autoComplete="off"
            required={!profile.configured}
            placeholder={
              profile.configured
                ? uiText("اتركه فارغاً للاحتفاظ بالمفتاح")
                : uiText("ألصق مفتاحك هنا")
            }
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="button secondary small"
          disabled={discovering || (!key && !profile.configured)}
          onClick={async () => {
            setDiscovering(true);
            try {
              const r = await act({
                op: "provider.models",
                provider,
                key: key || undefined,
              });
              if (r) setModels(r);
            } finally {
              setDiscovering(false);
            }
          }}
        >
          {discovering
            ? uiText("جارٍ قراءة النماذج…")
            : uiText("قراءة النماذج المتاحة لحسابي")}
        </button>
        {models.length > 0 && (
          <p className="dialog-note">
            {uiText("قُرئت ")}
            {models.length}
            {uiText(
              " هوية من الخدمة الرسمية. اختر من حقل النموذج؛ نجاح التوليد يحتاج اختبار اتصال والمحرك يعمل.",
            )}
          </p>
        )}
        <div className="form-grid">
          <label className="field">
            {uiText("أقصى رموز إخراج للطلب")}
            <input
              type="number"
              min={128}
              max={4096}
              required
              value={tokens}
              onChange={(e) => setTokens(Number(e.target.value))}
            />
          </label>
          <label className="field">
            {uiText("أقصى طلبات يومياً")}
            <input
              type="number"
              min={1}
              max={100}
              required
              value={requests}
              onChange={(e) => setRequests(Number(e.target.value))}
            />
          </label>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={budgetEnabled}
            onChange={(e) => setBudgetEnabled(e.target.checked)}
          />
          {uiText("تحديد سقف إنفاق يومي محلي بالدولار")}
        </label>
        {budgetEnabled && (
          <>
            <div className="form-grid">
              <label className="field">
                {uiText("السقف اليومي USD")}
                <input
                  aria-label={uiText("سقف الإنفاق اليومي")}
                  type="number"
                  min="0.000001"
                  max="1000"
                  step="any"
                  required
                  value={dailyUSD}
                  onChange={(e) => setDailyUSD(e.target.value)}
                />
              </label>
              <label className="field">
                {uiText("سعر مليون رمز إدخال USD")}
                <input
                  aria-label={uiText("سعر الإدخال")}
                  type="number"
                  min="0"
                  max="1000"
                  step="any"
                  required
                  value={inputPrice}
                  onChange={(e) => setInputPrice(e.target.value)}
                />
              </label>
              <label className="field">
                {uiText("سعر مليون رمز إخراج USD")}
                <input
                  aria-label={uiText("سعر الإخراج")}
                  type="number"
                  min="0"
                  max="1000"
                  step="any"
                  required
                  value={outputPrice}
                  onChange={(e) => setOutputPrice(e.target.value)}
                />
              </label>
            </div>
            <p className="dialog-note">
              {uiText(
                "أدخل أسعار نموذجك الحالية، أو صفراً إذا كانت خطتك مجانية. نحجز تقديراً محافظاً قبل الاتصال، ونحتفظ بالحجز إذا لم يصل استهلاك مؤكد. الأسعار مسؤولية إعدادك وقد تختلف الفاتورة الفعلية. السقف مطلوب لتفويض AI المجدول.",
              )}
            </p>
          </>
        )}
        <div className="form-actions split">
          {profile.configured && (
            <button
              type="button"
              className="button danger"
              onClick={async () => {
                await act({ op: "provider.disconnect", provider });
                onClose();
              }}
            >
              {uiText("حذف المفتاح")}
            </button>
          )}
          <button className="button primary">
            <Save size={16} />
            {uiText("حفظ الإعداد")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Backups() {
  const { data, act, toast } = useApp();
  const [setup, setSetup] = useState(false),
    [files, setFiles] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [restore, setRestore] = useState<any>(null),
    [lastRestore, setLastRestore] = useState("");
  const [restoreWorkspaces, setRestoreWorkspaces] = useState<
    { projectId: string; directory: string }[]
  >([]);
  const [inspection, setInspection] = useState<any>(null);
  const [backupProject, setBackupProject] = useState("");
  const d = data.drive;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{uiText("اطمئن على مساحتك.")}</h1>
          <p>{uiText("نسخة مشفّرة إلى Google Drive، بمفتاح تملكه أنت.")}</p>
        </div>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await act({
              op: "backup.run",
              projectIds: backupProject ? [backupProject] : undefined,
            });
            if (result)
              toast(
                result.reused
                  ? uiText(
                      "لم يتغير المحتوى؛ أُعيد استخدام النسخة المتحققة بعد فحص سلامتها على Drive.",
                    )
                  : uiText("اكتملت النسخة وتم التحقق من تنزيلها وفك تشفيرها."),
              );
            setBusy(false);
          }}
        >
          <Cloud size={18} />
          {busy ? uiText("جارٍ العمل…") : uiText("إنشاء أو استئناف نسخة")}
        </button>
      </div>
      <div className="backup-overview">
        <section className="paper backup-connect">
          <div className="backup-header">
            <div className="drive-logo">
              <Cloud size={29} />
            </div>
            <div>
              <h2>Google Drive</h2>
              <p>
                {d.connected
                  ? uiText("تم ربط الحساب")
                  : uiText("اربط حسابك لبدء النسخ")}
              </p>
            </div>
            <span className={`badge ${d.connected ? "success" : ""}`}>
              {d.connected ? uiText("مرتبط") : uiText("غير مرتبط")}
            </span>
          </div>
          <p>
            {uiText(
              "تُنسخ المحادثات والذاكرة والمهام والملاحظات والأتمتة، وملفات المشاريع التي تسمح بها أدناه. تُستثنى الأسرار والاعتماديات؛ لا تُنسخ مفاتيح API أو OAuth. لا تُحذف نسخك السابقة تلقائياً.",
            )}
          </p>
          <div className="button-wrap">
            <button
              className="button secondary"
              onClick={() =>
                void act(
                  { op: "drive.importClient" },
                  uiText("استُورد إعداد Google. اضغط ربط عبر المتصفح."),
                )
              }
              disabled={busy || d.connected}
            >
              <Download size={16} />
              {uiText("استيراد ملف Google OAuth")}
            </button>
            <button className="button secondary" onClick={() => setSetup(true)}>
              <Settings2 size={16} />
              {uiText("إعداد الربط")}
            </button>
            {d.connected ? (
              <button
                className="button danger"
                onClick={() => void act({ op: "drive.disconnect" })}
              >
                {uiText("فصل الحساب")}
              </button>
            ) : (
              <button
                className="button soft"
                disabled={busy || !d.configured}
                onClick={async () => {
                  setBusy(true);
                  await act({ op: "drive.connect" }, uiText("تم ربط Drive."));
                  setBusy(false);
                }}
              >
                {uiText("ربط عبر المتصفح")}
              </button>
            )}
          </div>
        </section>
        <section className="paper recovery-panel">
          <KeyRound size={25} className="accent" />
          <h2>{uiText("مفتاح الاسترداد")}</h2>
          <p>
            {uiText(
              "احتفظ به خارج حساب Drive الذي يحوي النسخ. تحتاجه على جهاز جديد؛ فقدانه مع بيانات الجهاز يمنع الاستعادة.",
            )}
          </p>
          <div className="button-wrap">
            <button
              className="button secondary"
              onClick={() =>
                void act(
                  { op: "backup.keyExport" },
                  uiText("إذا أكملت الحفظ، احتفظ بالملف في مكان آمن."),
                )
              }
            >
              <Download size={16} />
              {d.keyReady
                ? uiText("حفظ نسخة من المفتاح")
                : uiText("إنشاء وحفظ المفتاح")}
            </button>
            <button
              className="text-button"
              onClick={() =>
                void act(
                  { op: "backup.keyImport" },
                  uiText("تم استيراد المفتاح."),
                )
              }
            >
              {uiText("استيراد مفتاح")}
            </button>
          </div>
          <span className={`badge ${d.keyExported ? "success" : ""}`}>
            {d.keyExported
              ? uiText("تم حفظ مفتاح الاسترداد")
              : uiText("المفتاح مطلوب قبل النسخ")}
          </span>
        </section>
      </div>
      <BackupHealth />
      <label className="field">
        {uiText("ملفات النسخة اليدوية")}
        <select
          aria-label={uiText("ملفات النسخة اليدوية")}
          value={backupProject}
          onChange={(e) => setBackupProject(e.target.value)}
        >
          <option value="">{uiText("كل المجلدات المصرّح بها")}</option>
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
            "تُحفظ بيانات البرنامج كذلك. هذا الاختيار يحدد ملفات المشاريع المرفقة فقط؛ الجداول لها اختيار مستقل.",
          )}
        </small>
      </label>
      <BackupRetention />
      <section className="paper workspace-connect">
        <h2>{uiText("ملفات المشاريع داخل النسخة")}</h2>
        <p>
          {uiText(
            "اختر المشاريع التي تريد رفع ملفاتها الحالية والمستقبلية ضمن النسخة المشفّرة. تستبعد الأسرار والروابط والاعتماديات والملفات التنفيذية. حد الأرشيف 40 MiB و5000 ملف؛ الملفات الفردية فوق 8 MiB مستثناة. تُحفظ الملفات مع بصماتها وتُستعاد داخل مجلد جديد: مشاريع الكود في projects ومساحات الملفات في workspaces مع Files وProjects؛ لا يُستبدل كودك الحالي.",
          )}
        </p>
        {data.projects
          .filter((p) => p.root)
          .map((p) => (
            <details key={p.id}>
              <summary>
                {p.name} ·{" "}
                {p.backupFiles
                  ? uiText("تُنسخ ملفاته")
                  : uiText("بيانات المشروع فقط")}
              </summary>
              <ProjectPermissions project={p} />
              <BackupScope project={p} />
            </details>
          ))}
        {!data.projects.some((p) => p.root) && (
          <p>{uiText("أضف مسار Workspace من قسم الملفات أولاً.")}</p>
        )}
      </section>
      <div className="info-strip">
        <ShieldCheck size={18} />
        {uiText(
          "التعليق والإيقاف ووضع اللعب توقف العمل عند نقطة آمنة. النسخة غير المكتملة لا تظهر كمتحقق منها. يُسمح بالاستئناف فقط عندما تبقى صلاحيات المصادر مطابقة.",
        )}
      </div>
      <section className="section">
        <div className="section-heading">
          <h2>{uiText("سجل النسخ على هذا الجهاز")}</h2>
        </div>
        <div className="paper backup-table">
          {data.backups.map((b) => (
            <div className="backup-history-row" key={b.id}>
              <Cloud size={19} />
              <div>
                <strong>{when(b.createdAt)}</strong>
                <small>{Math.ceil(b.size / 1024)} KB</small>
                {b.plainSize && (
                  <small>
                    {uiText("قبل الضغط: ")}
                    {Math.ceil(b.plainSize / 1024)} KB
                  </small>
                )}
                {b.lastCheckedAt && (
                  <small>
                    {uiText("آخر فحص على Drive: ")}
                    {when(b.lastCheckedAt)}
                  </small>
                )}
              </div>
              <span
                className={`badge ${b.status === "verified" ? "success" : "warning"}`}
              >
                {(
                  {
                    verified: uiText("تم التحقق"),
                    checkpointed: uiText(
                      "متوقفة؛ تُراجع صلاحياتها قبل الاستئناف",
                    ),
                    uploading: uiText("جارٍ الرفع"),
                    verifying: uiText("جارٍ التحقق"),
                    prepared: uiText("جاهزة للرفع"),
                    remoteChanged: uiText(
                      "تغيّرت النسخة على Drive؛ تحتاج مراجعة",
                    ),
                    remoteMissing: uiText("لم تعد النسخة موجودة على Drive"),
                    trashed: uiText("في سلة Google Drive"),
                    discarded: uiText("أُلغي التجهيز المحلي"),
                  } as any
                )[b.status] || b.status}
              </span>
              {b.status === "verified" && (
                <label>
                  <input
                    type="checkbox"
                    checked={!!b.protected}
                    onChange={(e) =>
                      void act(
                        {
                          op: "backup.protect",
                          id: b.id,
                          protected: e.target.checked,
                        },
                        e.target.checked
                          ? uiText("حُميت النسخة من التنظيف")
                          : uiText("أُزيلت الحماية اليدوية"),
                      )
                    }
                  />{" "}
                  {uiText("حماية من التنظيف")}
                </label>
              )}
              {b.reason && (
                <small>
                  {b.reason === "ownerDiscard"
                    ? uiText("ألغيت المحاولة محلياً؛ لم تُحذف ملفات Drive.")
                    : b.reason === "userControl"
                      ? uiText(
                          "توقفت بأمر المستخدم؛ الاستئناف مشروط ببقاء اختيار المصادر وصلاحياتها.",
                        )
                      : errorText(b.reason)}
                </small>
              )}
              <BackupCheckpoint backup={b} />
            </div>
          ))}
          {!data.backups.length && (
            <Empty
              icon={Cloud}
              title={uiText("ابدأ بنسخة تطمئن لها")}
              body={uiText(
                "أكمل الربط واحفظ مفتاح الاسترداد، ثم شغّل المحرك وأنشئ النسخة.",
              )}
            />
          )}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <h2>{uiText("الاستعادة من Drive")}</h2>
          <button
            className="button secondary small"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await act({ op: "backup.list" });
              if (r) setFiles(r.files);
              setBusy(false);
            }}
          >
            <RefreshCw size={15} />
            {uiText("قراءة نسخ Drive")}
          </button>
        </div>
        <p className="muted">
          {uiText(
            "تُستعاد البيانات إلى مجلد جديد. لا يُستبدل أي ملف حالي، وتبقى الجداول والصلاحيات المستعادة معطّلة.",
          )}
        </p>
        <div className="paper restore-list">
          {files.map((f) => (
            <div className="backup-history-row" key={f.id}>
              <FileText size={19} />
              <div>
                <strong>{when(f.createdTime)}</strong>
                <small dir="ltr">{f.name}</small>
              </div>
              <button
                className="button secondary small"
                onClick={() => setRestore(f)}
              >
                {uiText("استعادة إلى مجلد جديد")}
              </button>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await act({ op: "backup.inspect", fileId: f.id });
                    if (r) setInspection({ ...r, file: f });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {uiText("اختيار ملف / مجلد للاستعادة")}
              </button>
            </div>
          ))}
        </div>
        {restoreWorkspaces.map((w) => (
          <p className="info-strip" key={w.projectId}>
            {uiText("مساحة Files وProjects المستعادة: ")}
            <bdi>{w.directory}</bdi>
            {uiText(
              ". لربط سجلها الموجود، افتح الملفات ثم معاينة ربط مساحة الملفات.",
            )}
          </p>
        ))}
        {lastRestore && (
          <p className="info-strip">
            {uiText("تمت الاستعادة إلى: ")}
            <bdi>{lastRestore}</bdi>
            {uiText(". لم تتغير مساحة العمل الحالية.")}
          </p>
        )}
      </section>
      {setup && <DriveSetup onClose={() => setSetup(false)} />}{" "}
      {inspection && (
        <SelectiveRestore
          inspection={inspection}
          onClose={() => setInspection(null)}
          onChoose={(selection) => {
            setRestore({ ...inspection.file, selection });
            setInspection(null);
          }}
        />
      )}
      {restore && (
        <Confirm
          title={uiText("استعادة مساحة منفصلة؟")}
          body={
            restore.selection
              ? uiFormat(
                  "ستُستعاد ملفات الاختيار فقط: {0}/{1}. اختر مجلداً أباً لإنشاء مجلد جديد؛ لن تُنشأ قاعدة بيانات نشطة.",
                  [
                    restore.selection.projectId,
                    restore.selection.path || uiText("كل ملفات المشروع"),
                  ],
                )
              : uiText(
                  "ستُنزّل النسخة وتُفك بمفتاح الاسترداد الحالي، ثم يُتحقق من قاعدة بيانات جديدة. اختر المجلد الأب الذي تريد إنشاء المساحة داخله.",
                )
          }
          button={uiText("اختيار مجلد والاستعادة")}
          onClose={() => setRestore(null)}
          onConfirm={async () => {
            const r = await act({
              op: "backup.restore",
              fileId: restore.id,
              selection: restore.selection,
            });
            if (r) {
              setLastRestore(r.directory);
              setRestoreWorkspaces(r.workspaces || []);
            }
          }}
        />
      )}
    </>
  );
}
function DriveSetup({ onClose }: { onClose: () => void }) {
  const { act } = useApp();
  const [clientId, setClientId] = useState(""),
    [secret, setSecret] = useState("");
  return (
    <Modal title={uiText("إعداد Google Drive")} wide onClose={onClose}>
      <p className="dialog-copy">
        {uiText(
          "تحتاج مشروع Google Cloud مفعّل عليه Drive API وOAuth Client من نوع Desktop app. يسمح الربط بملفات ينشئها البرنامج فقط عبر drive.file.",
        )}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await act(
            {
              op: "drive.setup",
              clientId: clientId.trim(),
              clientSecret: secret,
            },
            uiText("حُفظ الإعداد. اضغط ربط عبر المتصفح."),
          );
          setSecret("");
          if (result) onClose();
        }}
      >
        <label className="field">
          Desktop OAuth Client ID
          <input
            required
            dir="ltr"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="…apps.googleusercontent.com"
          />
        </label>
        <label className="field">
          Desktop Client secret
          <input
            type="password"
            required
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
          />
        </label>
        <p className="dialog-note">
          {uiText(
            "يسجل الدخول في متصفحك المعتاد. تُفتح وصلة محلية مؤقتة وقت الدخول فقط وتُغلق بعدها.",
          )}
        </p>
        <div className="form-actions">
          <button className="button primary">
            {uiText("حفظ إعداد Drive")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Audit() {
  const { data, act } = useApp();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{uiText("كل خطوة، واضحة.")}</h1>
          <p>
            {uiText(
              "سجل محلي للقرارات والنتائج، بدون محتوى الملاحظات أو مفاتيح الحسابات.",
            )}
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => void act({ op: "audit.export" })}
        >
          <Download size={16} />
          {uiText("تصدير السجل")}
        </button>
      </div>
      <div className={`info-strip ${!data.auditValid ? "danger-strip" : ""}`}>
        <ShieldCheck size={19} />
        {data.auditValid
          ? uiText("تسلسل التحقق سليم.")
          : uiText("اكتُشف خلل في السجل. العمليات الخارجية متوقفة.")}
        <span className="muted">{uiText("آخر 200 حدث")}</span>
      </div>
      <div className="paper audit-events">
        {data.audit.map((a) => (
          <article className="audit-event" key={a.sequence}>
            <span className="audit-number" dir="ltr">
              #{a.sequence}
            </span>
            <div>
              <h3>{eventLabel(a.event)}</h3>
              <p dir="ltr">{a.event}</p>
              <details>
                <summary>{uiText("تفاصيل التحقق")}</summary>
                <pre dir="ltr">
                  {JSON.stringify(JSON.parse(a.details), null, 2)}
                </pre>
                <code dir="ltr">{a.event_hash}</code>
              </details>
            </div>
            <time>{when(a.created)}</time>
          </article>
        ))}
      </div>
      <p className="settings-note">
        {uiText(
          "هذا التسلسل يساعد في كشف تعديل السجل؛ لا يضمن الحماية من عملية خبيثة تملك حساب Windows نفسه.",
        )}
      </p>
    </>
  );
}
