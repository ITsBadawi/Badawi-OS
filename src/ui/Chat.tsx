import { uiText } from "../localization.ts";
import React, { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  Plus,
  Send,
  Square,
  Paperclip,
  Trash2,
  Sparkles,
  RefreshCw,
  ArrowUpLeft,
} from "lucide-react";
import { useApp, errorText } from "./context.tsx";
import { Confirm, when } from "./shared.tsx";
import { PlanCard } from "./Tasks.tsx";
const JobEditor = React.lazy(() =>
  import("./Automations.tsx").then((module) => ({ default: module.JobEditor })),
);
export function Chat({ embedded = false }: { embedded?: boolean }) {
  const { data, act, send: sendCommand, go } = useApp();
  const [id, setId] = useState(() => {
      const active = sessionStorage.getItem("badawi.chat.active");
      return (
        data.chats.find((c) => c.id === active)?.id || data.chats[0]?.id || ""
      );
    }),
    [chat, setChat] = useState<any>(null),
    [provider, setProvider] = useState<"gemini" | "openai" | "chatgpt">(
      data.defaultProvider,
    ),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [project, setProject] = useState(""),
    [sources, setSources] = useState(false),
    [remove, setRemove] = useState(false);
  const [history, setHistory] = useState(false);
  useEffect(() => setProvider(data.defaultProvider), [data.defaultProvider]);
  useEffect(() => {
    if (id) sessionStorage.setItem("badawi.chat.active", id);
  }, [id]);
  const bottom = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<any>(null),
    [drafting, setDrafting] = useState(false),
    [draftError, setDraftError] = useState("");
  const [filePath, setFilePath] = useState(""),
    [sourcePreview, setSourcePreview] = useState("");
  const version = data.chats
    .map((c) => `${c.id}:${c.updatedAt}:${c.status}`)
    .join("|");
  useEffect(() => {
    let current = true;
    if (!id) {
      setChat(null);
      return;
    }
    void window.badawi.command({ op: "chat.read", chatId: id }).then((r) => {
      if (current && r.ok) setChat(r.data);
    });
    return () => {
      current = false;
    };
  }, [id, version]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [chat?.messages.length, chat?.status]);
  useEffect(() => {
    setNote(chat?.source?.noteId || "");
    setProject(chat?.source?.projectId || "");
    setFilePath(chat?.source?.filePath || "");
    setSourcePreview("");
    setSources(!!chat?.source);
  }, [chat?.id]);
  const pending = busy || chat?.status === "pending";
  const activeProvider = chat?.provider || provider;
  const configured =
    data.providers[activeProvider as "gemini" | "openai" | "chatgpt"]
      .configured;
  const last = chat?.messages.at(-1);
  const failed =
    last?.role === "assistant" &&
    ["failed", "cancelled", "interrupted"].includes(last.status);
  async function create() {
    const c = await act({ op: "chat.create", provider });
    if (c) {
      setId(c.id);
      setChat(c);
      setText("");
      setNote("");
      setProject("");
    }
  }
  async function send() {
    if (!text.trim() || pending) return;
    setBusy(true);
    try {
      const c = chat || (await act({ op: "chat.create", provider }));
      if (!c) return;
      if (!chat) {
        setId(c.id);
        setChat(c);
      }
      const result = await act({
        op: "chat.send",
        chatId: c.id,
        text: text.trim(),
        noteId: note || undefined,
        projectId: project || undefined,
        filePath: project && filePath.trim() ? filePath.trim() : undefined,
      });
      if (result) {
        setText("");
        setNote("");
        setProject("");
        setChat(result);
      } else {
        const r = await window.badawi.command({
          op: "chat.read",
          chatId: c.id,
        });
        if (r.ok) {
          setChat(r.data);
          if (r.data.messages.length) setText("");
        }
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!embedded && (
        <div className="page-heading chat-page-heading">
          <div>
            <h1>{uiText("مساحة للأفكار، والمحادثة.")}</h1>
            <p>{uiText("كمل من حيث وقفت. محادثاتك محفوظة على جهازك.")}</p>
          </div>
          <span className="badge">Gemini + OpenAI</span>
        </div>
      )}
      {embedded && (
        <button
          className="button secondary small"
          aria-expanded={history}
          onClick={() => setHistory(!history)}
        >
          {uiText("المحادثات والخدمة")}
        </button>
      )}
      <div className={`chat-layout paper ${embedded ? "embedded-chat" : ""}`}>
        {(!embedded || history) && (
          <aside className="chat-history" aria-label={uiText("محادثاتك")}>
            <div className="chat-history-title">
              <MessageCircle size={19} />
              <strong>{uiText("محادثاتك")}</strong>
            </div>
            <label className="field">
              <span>{uiText("خدمة المحادثة الجديدة")}</span>
              <select
                aria-label={uiText("خدمة المحادثة الجديدة")}
                value={provider}
                onChange={(e) => setProvider(e.target.value as any)}
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="chatgpt">ChatGPT Subscription</option>
              </select>
            </label>
            <button
              className="button primary"
              onClick={() => void create()}
              disabled={pending}
            >
              <Plus size={16} />
              {uiText("محادثة جديدة")}
            </button>
            <div className="chat-threads">
              {data.chats.map((c) => (
                <button
                  key={c.id}
                  className={`chat-thread ${id === c.id ? "selected" : ""}`}
                  onClick={() => {
                    setId(c.id);
                    setText("");
                    setNote("");
                    setProject("");
                  }}
                >
                  <strong>{c.title}</strong>
                  <span>
                    <bdi>
                      {c.provider === "gemini"
                        ? "Gemini"
                        : c.provider === "chatgpt"
                          ? "ChatGPT Subscription"
                          : "OpenAI API"}
                    </bdi>{" "}
                    · {when(c.updatedAt)}
                  </span>
                  {c.status === "pending" && (
                    <small>{uiText("يكتب الآن…")}</small>
                  )}
                </button>
              ))}
            </div>
            <small className="muted">
              {uiText(
                "السجل محلي. إرسال رسالة يشارك سياق هذه المحادثة مع الخدمة المختارة.",
              )}
            </small>
          </aside>
        )}
        <section className="chat-main" aria-label={uiText("المحادثة الحالية")}>
          <header className="chat-header">
            <div>
              <strong>{chat?.title || uiText("نبدأ بفكرة؟")}</strong>
              <small dir="ltr">
                {chat?.model ||
                  data.providers[provider].model ||
                  "Choose a model in Settings"}
              </small>
            </div>
            {chat?.messages.some((m: any) => m.status === "complete") && (
              <button
                className="button soft small"
                title={uiText("يستخدم طلب AI إضافياً ويعرض مسودة للمراجعة")}
                disabled={
                  pending ||
                  drafting ||
                  data.engine.mode !== "Running" ||
                  data.engine.gaming
                }
                onClick={async () => {
                  setDrafting(true);
                  setDraftError("");
                  try {
                    const d = await sendCommand({
                      op: "chat.draft",
                      chatId: id,
                    });
                    setDraft(d);
                  } catch (error) {
                    setDraftError(
                      errorText(
                        error instanceof Error
                          ? error.message
                          : "OPERATION_FAILED",
                      ),
                    );
                  } finally {
                    setDrafting(false);
                  }
                }}
              >
                <Sparkles size={14} />
                {drafting ? uiText("يقترح…") : uiText("اقتراح أتمتة")}
              </button>
            )}
            {chat && (
              <button
                className="icon-button"
                aria-label={uiText("حذف المحادثة")}
                disabled={pending}
                onClick={() => setRemove(true)}
              >
                <Trash2 size={17} />
              </button>
            )}
          </header>
          <div
            className="chat-transcript"
            role="log"
            aria-label={uiText("رسائل المحادثة")}
            aria-live="polite"
          >
            {!chat?.messages.length && (
              <div className="chat-welcome">
                <span className="chat-spark">
                  <Sparkles size={29} />
                </span>
                <h2>{uiText("شنو نشتغل عليه اليوم؟")}</h2>
                <p>
                  {uiText("اسأل، ناقش فكرة، أو أرفق ملاحظة أو ملخص مشروعك.")}
                </p>
                <div className="chat-suggestions">
                  {[
                    uiText("ساعدني أرتّب أولوياتي اليوم"),
                    uiText("ناقش وياي فكرة مشروع جديد"),
                    uiText("اقترح روتيناً أسبوعياً بسيطاً"),
                  ].map((s) => (
                    <button key={s} onClick={() => setText(s)}>
                      {s}
                      <ArrowUpLeft size={15} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chat?.messages.map((m: any) => (
              <article
                key={m.id}
                className={`chat-message ${m.role}`}
                data-chat-status={m.role === "assistant" ? m.status : undefined}
              >
                <div className="chat-message-meta">
                  <strong>
                    {m.role === "user"
                      ? uiText("أنت")
                      : chat.provider === "gemini"
                        ? "Gemini"
                        : chat.provider === "chatgpt"
                          ? "ChatGPT"
                          : "OpenAI API"}
                  </strong>
                  <time>{when(m.createdAt)}</time>
                </div>
                {(m.noteId || m.projectId) && (
                  <small className="chat-source-label">
                    <Paperclip size={12} />
                    {m.noteId ? uiText("ملاحظة مختارة ") : ""}
                    {m.projectId
                      ? m.filePath
                        ? uiText("ملف مختار")
                        : uiText("ملخص مشروع مختار")
                      : ""}
                  </small>
                )}
                {m.status === "pending" ? (
                  <div>
                    <div className="chat-message-text" dir="auto">
                      {m.text}
                    </div>
                    <p className="chat-thinking">{uiText("يكتب الآن…")}</p>
                  </div>
                ) : m.text ? (
                  <div className="chat-message-text" dir="auto">
                    {m.text}
                  </div>
                ) : (
                  <div className="chat-failure" role="status">
                    {errorText(m.error || "OPERATION_UNCERTAIN")}
                  </div>
                )}
                {m.toolReceipts?.length > 0 && (
                  <details className="tool-receipts">
                    <summary>
                      {uiText("قرأ ")}
                      {m.toolReceipts.length}
                      {uiText(" مصدراً محلياً")}
                    </summary>
                    {m.toolReceipts.map((r: any, i: number) => (
                      <div key={i}>
                        <b>{r.operation}</b> ·{" "}
                        {r.path ||
                          data.projects.find((p) => p.id === r.projectId)?.name}
                        <pre dir="auto">
                          {typeof r.result === "string"
                            ? r.result
                            : JSON.stringify(r.result, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </details>
                )}
                {m.planId && (
                  <PlanCard plan={data.plans.find((p) => p.id === m.planId)} />
                )}
                {m.usage && (
                  <small className="chat-usage" dir="ltr">
                    {m.usage.input} in · {m.usage.output} out
                  </small>
                )}
              </article>
            ))}
            <div ref={bottom} />
          </div>
          <div className="chat-compose-area">
            {draftError && (
              <p className="info-strip" role="alert" data-testid="draft-error">
                {draftError}
              </p>
            )}
            {!configured && (
              <div className="info-strip">
                <span>
                  {uiText("أضف مفتاح ")}
                  {activeProvider === "gemini" ? "Gemini" : "OpenAI"}{" "}
                  {uiText("حتى تبدأ المحادثة.")}
                </span>
                <button className="text-button" onClick={() => go("settings")}>
                  {uiText("فتح الإعدادات")}
                </button>
              </div>
            )}
            {data.engine.mode !== "Running" && (
              <div className="chat-mode-note">
                <span>
                  {uiText("المحادثة محفوظة. المحرك")}{" "}
                  {data.engine.mode === "Stop"
                    ? uiText("متوقف")
                    : uiText("معلّق")}
                  .
                </span>
                <button
                  className="button soft small"
                  onClick={() =>
                    void act({
                      op: "engine.mode",
                      mode: "Running",
                      epoch: data.engine.epoch,
                    })
                  }
                >
                  {uiText("تشغيل المحرك")}
                </button>
              </div>
            )}
            {data.engine.gaming && (
              <p className="info-strip">
                {uiText(
                  "وضع اللعب مفعّل ويؤجل طلبات AI. غيّره من لوحة التحكم عندما تريد المتابعة.",
                )}
              </p>
            )}
            {failed ? (
              <div className="chat-retry">
                <p>{errorText(last.error)}</p>
                <button
                  className="button secondary"
                  disabled={
                    pending ||
                    data.engine.mode !== "Running" ||
                    data.engine.gaming
                  }
                  onClick={async () => {
                    setBusy(true);
                    const r = await act({ op: "chat.retry", chatId: id });
                    if (r) setChat(r);
                    setBusy(false);
                  }}
                >
                  <RefreshCw size={16} />
                  {uiText("إعادة المحاولة")}
                </button>
                <button className="text-button" onClick={() => void create()}>
                  {uiText("بدء محادثة جديدة")}
                </button>
              </div>
            ) : (
              <>
                {sources && (
                  <div className="chat-attachments">
                    <label className="field">
                      {uiText("إرفاق نص ملاحظة")}
                      <select
                        aria-label={uiText("إرفاق ملاحظة")}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      >
                        <option value="">{uiText("بدون ملاحظة")}</option>
                        {data.notes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      {uiText("إرفاق ملخص مشروع")}
                      <select
                        aria-label={uiText("إرفاق مشروع")}
                        value={project}
                        onChange={(e) => setProject(e.target.value)}
                      >
                        <option value="">{uiText("بدون مشروع")}</option>
                        {data.projects
                          .filter((p) => p.root)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {project && (
                      <label className="field">
                        {uiText("ملف مختار من المشروع (اختياري)")}
                        <input
                          aria-label={uiText("ملف المشروع المختار")}
                          dir="ltr"
                          value={filePath}
                          onChange={(e) => {
                            setFilePath(e.target.value);
                            setSourcePreview("");
                          }}
                          placeholder="src/main.ts"
                        />
                        {filePath && (
                          <button
                            type="button"
                            className="text-button"
                            onClick={async () => {
                              const r = await act({
                                op: "files.read",
                                projectId: project,
                                path: filePath,
                              });
                              if (typeof r === "string")
                                setSourcePreview(r.slice(0, 12000));
                            }}
                          >
                            {uiText("معاينة نص الملف المُرسل")}
                          </button>
                        )}
                      </label>
                    )}
                    {sourcePreview && (
                      <pre className="chat-source-preview" dir="auto">
                        {sourcePreview}
                      </pre>
                    )}
                    <p>
                      {uiText(
                        "الملاحظة: النص كاملاً. المشروع: أول 100 اسم ملف وحالة Git. الملف المختار: أول 12,000 حرف مع أرقام الأسطر. تبقى المرفقات ضمن سياق هذه المحادثة.",
                      )}
                    </p>
                  </div>
                )}
                <form
                  className="chat-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <textarea
                    aria-label={uiText("رسالتك")}
                    placeholder={uiText("اكتب رسالتك…")}
                    value={text}
                    maxLength={10000}
                    rows={3}
                    disabled={pending}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <div className="chat-composer-actions">
                    <button
                      type="button"
                      className={`icon-button ${sources ? "active" : ""}`}
                      aria-label={uiText("إرفاق مصادر")}
                      aria-expanded={sources}
                      onClick={() => setSources(!sources)}
                    >
                      <Paperclip size={19} />
                    </button>
                    <small>
                      {note || project
                        ? uiText("مصادر مختارة للإرسال")
                        : uiText("بدون مرفقات")}{" "}
                      {uiText("· Shift + Enter لسطر جديد")}
                    </small>
                    {pending ? (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() =>
                          void act({ op: "chat.cancel", chatId: id })
                        }
                      >
                        <Square size={15} />
                        {uiText("إيقاف الرد")}
                      </button>
                    ) : (
                      <button
                        type="submit"
                        className="button primary"
                        aria-label={uiText("إرسال الرسالة")}
                        disabled={
                          !text.trim() ||
                          !configured ||
                          data.engine.mode !== "Running" ||
                          data.engine.gaming ||
                          !!data.engine.active
                        }
                      >
                        <Send size={17} />
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}
            <p className="chat-disclosure">
              {uiText(
                "يرى AI المحادثة وبيانات المهام والمشاريع والأتمتة والذاكرة المحفوظة، ومرفقاتك المختارة. يمكنه قراءة المشاريع التي فوّضتها؛ الإجراءات تظهر للمراجعة قبل التنفيذ. كود مشاريعك للقراءة فقط.",
              )}
            </p>
          </div>
        </section>
      </div>
      {remove && (
        <Confirm
          title={uiText("حذف المحادثة؟")}
          body={uiText("يُحذف سجلها المحلي. لا يؤثر ذلك على محادثاتك الأخرى.")}
          button={uiText("حذف")}
          onClose={() => setRemove(false)}
          onConfirm={async () => {
            await act({ op: "chat.remove", chatId: id });
            setId("");
            setChat(null);
          }}
        />
      )}
      {draft && (
        <React.Suspense
          fallback={<p role="status">{uiText("نفتح مراجعة الأتمتة…")}</p>}
        >
          <JobEditor job={draft} onClose={() => setDraft(null)} />
        </React.Suspense>
      )}
    </>
  );
}
