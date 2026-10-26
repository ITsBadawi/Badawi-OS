import { uiFormat, uiText } from "../localization.ts";
import React, { useState } from "react";
import { useApp, errorText } from "./context.tsx";

export function ChatGPTSettings() {
  const { data, act, toast } = useApp();
  const account = data.chatgpt || { status: "disconnected", sharing: false };
  const profile = data.providers.chatgpt;
  const [busy, setBusy] = useState(false),
    [models, setModels] = useState<string[]>([]),
    [model, setModel] = useState(profile.model || ""),
    [error, setError] = useState(""),
    [maxRequests, setMaxRequests] = useState(profile.maxRequests);
  async function connect(reconsent: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await act({ op: "chatgpt.connect", reconsent });
      if (r?.sharing) {
        const list = await act({ op: "provider.models", provider: "chatgpt" });
        if (list) setModels(list);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="paper settings-panel" aria-label="ChatGPT Account">
      <h2>ChatGPT Account</h2>
      <p>
        {uiText(
          "سجّل بحساب ChatGPT. الهوية وإذن استخدام الاشتراك منفصلان في موافقة OpenAI. لا يُستخدم مفتاح API المدفوع لهذا الاتصال.",
        )}
      </p>
      <p role="status">
        {account.status === "connecting" || busy
          ? uiText("جارٍ تسجيل الدخول في المتصفح…")
          : account.status === "connected"
            ? uiText("الحساب متصل")
            : account.status === "reauth_required"
              ? uiText("يلزم تسجيل الدخول مجدداً")
              : uiText("غير متصل")}
      </p>
      {account.identity && (
        <p dir="auto">
          {account.identity.name} · {account.identity.email}
        </p>
      )}
      <p>
        {account.sharing
          ? uiText("إذن استخدام الاشتراك مفعّل؛ الأهلية والحدود تحددها OpenAI.")
          : uiText("إذن استخدام الاشتراك غير مفعّل.")}
      </p>
      {(error || account.error) && (
        <p role="alert">{error || errorText(account.error!)}</p>
      )}
      <div className="button-wrap">
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void connect(false)}
        >
          Continue with ChatGPT
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void connect(true)}
        >
          {uiText("تفعيل إذن الاشتراك / إعادة الربط")}
        </button>
        {busy && (
          <button
            className="button secondary"
            onClick={() => void act({ op: "chatgpt.cancel" })}
          >
            {uiText("إلغاء تسجيل الدخول")}
          </button>
        )}
        <button
          className="button secondary"
          disabled={busy || account.status === "disconnected"}
          onClick={() =>
            void act({ op: "provider.disconnect", provider: "chatgpt" })
          }
        >
          {uiText("فصل ChatGPT")}
        </button>
        <button
          className="button secondary"
          onClick={() => void act({ op: "chatgpt.manage" })}
        >
          Manage usage
        </button>
        <button
          className="button secondary"
          onClick={() => void act({ op: "chatgpt.status" })}
        >
          {uiText("تحديث حالة الحساب")}
        </button>
      </div>
      <label className="field">
        {uiText("نموذج ChatGPT الافتراضي")}
        <select
          aria-label={uiText("نموذج ChatGPT")}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          <option value="">{uiText("اختر من النماذج المتاحة لحسابك")}</option>
          {model && !models.includes(model) && (
            <option value={model}>{model}</option>
          )}
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {uiText("الحد المحلي للطلبات اليومية")}
        <input
          aria-label={uiText("حد طلبات ChatGPT اليومي")}
          type="number"
          min={1}
          max={100}
          value={maxRequests}
          onChange={(e) => setMaxRequests(Number(e.target.value))}
        />
      </label>
      <div className="button-wrap">
        <button
          className="button secondary"
          disabled={!account.sharing || busy}
          onClick={async () => {
            const r = await act({ op: "provider.models", provider: "chatgpt" });
            if (r) setModels(r);
          }}
        >
          {uiText("قراءة نماذج ChatGPT")}
        </button>
        <button
          className="button primary"
          disabled={
            !model ||
            busy ||
            !Number.isInteger(maxRequests) ||
            maxRequests < 1 ||
            maxRequests > 100
          }
          onClick={async () => {
            const r = await act({
              op: "provider.save",
              provider: "chatgpt",
              model,
              maxTokens: profile.maxTokens,
              maxRequests,
              budget: null,
            });
            if (r) toast(uiText("حُفظ نموذج ChatGPT"));
          }}
        >
          {uiText("حفظ نموذج ChatGPT")}
        </button>
        <button
          className="button secondary"
          disabled={
            !account.sharing ||
            !profile.model ||
            data.engine.mode !== "Running" ||
            busy
          }
          onClick={async () => {
            setError("");
            const r = await act({ op: "provider.check", provider: "chatgpt" });
            if (r) toast(uiFormat("نجح اتصال ChatGPT: {0}", [r.text]));
          }}
        >
          {uiText("اختبار اتصال ChatGPT")}
        </button>
      </div>
      {data.engine.mode !== "Running" && (
        <small>{uiText("شغّل المحرك من لوحة التحكم لاختبار المحادثة.")}</small>
      )}
      <p className="settings-note">
        {uiText(
          "الاستخدام المتاح يُعرض في Manage usage. الـDevKit الحالي لا يعيد عدّاد استهلاك الاشتراك أو تكلفة دقيقة. لا انتقال تلقائياً إلى Gemini أو OpenAI API. الأتمتة الخلفية تحتاج موافقة مستقلة على مصادرها وجدولها.",
        )}
      </p>
    </section>
  );
}
