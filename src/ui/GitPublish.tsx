import React, { useState } from "react";
import { uiText } from "../localization.ts";
import { useApp } from "./context.tsx";
import { when } from "./shared.tsx";

type Changed = { path: string; state: string; modifiedAt: string | null; blocked: boolean };

export function GitPublish({ project }: { project: any }) {
  const { data, act, go } = useApp();
  const p = data.projects.find((row) => row.id === project.id) || project;
  const [changes, setChanges] = useState<Changed[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [commitReview, setCommitReview] = useState<any>(null);
  const [pushReview, setPushReview] = useState<any>(null);
  const [receipt, setReceipt] = useState("");
  const [proposal, setProposal] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  if (!p.root || p.archived || p.kind === "workfiles") return null;
  const refresh = async () => {
    setBusy(true);
    setCommitReview(null);
    setPushReview(null);
    try {
      const result = await act({ op: "git.changes", projectId: p.id });
      if (result) {
        setChanges(result.changes);
        const suggestion = await act({ op: "git.selection.read", projectId: p.id });
        setSelected(suggestion?.proposal?.paths || []);
        setProposal(suggestion?.proposal || null);
        setReceipt("");
        setAuthorName((old) => old || result.authorName || "");
        setAuthorEmail((old) => old || result.authorEmail || "");
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="paper">
      <h3>{uiText("حفظ التغييرات ورفعها إلى GitHub")}</h3>
      <p className="settings-note">
        {uiText("اختر الملفات بنفسك بعد مراجعتها. الأحدث تظهر أولاً. لا تُضم ملفات الأسرار أو الملفات المحضّرة مسبقاً، ولا يُرسل شيء إلى GitHub قبل موافقة رفع منفصلة.")}
      </p>
      <button className="button secondary" disabled={busy} onClick={() => void refresh()}>
        {uiText("عرض الملفات المتغيرة")}
      </button>
      <button className="button soft" disabled={busy} onClick={async () => {
        const chat = await act({ op: "chat.create", provider: data.defaultProvider, source: { projectId: p.id }, title: uiText("اختيار ملفات Git") });
        if (chat) go("chat");
      }}>{uiText("اسأل Badawi أي الملفات تختار")}</button>
      <p className="settings-note">{uiText("يمكن للمساعد اقتراح أسماء ملفات وأسباب ضمها أو استبعادها بعد إذن القراءة؛ الاختيار والموافقة عليك.")}</p>
      {changes && (
        <div>
          {proposal && <p className="info-strip">{uiText("اختيار اقترحه Badawi بعد موافقتك: ")}{proposal.explanation}{uiText(". يمكنك تغييره قبل المعاينة.")}</p>}
          <p>{changes.length ? uiText("اختر الملفات المراد حفظها") : uiText("لا توجد ملفات متغيرة")}</p>
          {changes.map((row) => (
            <label className="simple-task" key={row.path}>
              <input
                type="checkbox"
                disabled={busy || row.blocked}
                checked={selected.includes(row.path)}
                onChange={(e) => {
                  setCommitReview(null);
                  setProposal(null);
                  setSelected((old) => e.target.checked ? [...old, row.path] : old.filter((item) => item !== row.path));
                }}
              />
              <bdi dir="ltr">{row.path}</bdi>
              <small> · {row.state === "??" ? uiText("جديد") : row.state === " D" ? uiText("محذوف") : uiText("معدّل")}</small>
              {row.modifiedAt && <small> · {when(row.modifiedAt)}</small>}
              {row.blocked && <small> · {uiText("غير قابل للضم")}</small>}
            </label>
          ))}
          {changes.length > 0 && (
            <form onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const review = await act({ op: "git.commit.preview", projectId: p.id, paths: selected, message, authorName, authorEmail });
                if (review) setCommitReview(review);
              } finally { setBusy(false); }
            }}>
              <label className="field">
                {uiText("وصف التغيير")}
                <input aria-label={uiText("وصف Commit")} value={message} maxLength={160} required disabled={busy} onChange={(e) => { setMessage(e.target.value); setCommitReview(null); }} />
              </label>
              <label className="field">{uiText("اسم الكاتب")}
                <input aria-label={uiText("اسم كاتب Commit")} value={authorName} maxLength={100} required disabled={busy} onChange={(e) => { setAuthorName(e.target.value); setCommitReview(null); }} />
              </label>
              <label className="field">{uiText("بريد الكاتب")}
                <input aria-label={uiText("بريد كاتب Commit")} value={authorEmail} type="email" maxLength={160} required disabled={busy} onChange={(e) => { setAuthorEmail(e.target.value); setCommitReview(null); }} />
              </label>
              <button type="submit" className="button secondary" disabled={busy || selected.length === 0}>{uiText("معاينة Commit")}</button>
            </form>
          )}
        </div>
      )}
      {commitReview && (
        <div className="info-strip">
          <div>
            <h4>{uiText("راجع الحفظ المحلي")}</h4>
            <p>{uiText("المجلد: ")}<bdi dir="ltr">{commitReview.root}</bdi><br />
              {uiText("الفرع: ")}<bdi>{commitReview.branch}</bdi><br />
              {uiText("النسخة الحالية: ")}<bdi dir="ltr">{commitReview.head || uiText("لا يوجد Commit بعد")}</bdi><br />
              {uiText("الكاتب: ")}<bdi>{commitReview.author}</bdi><br />
              {uiText("الوصف: ")}<bdi>{commitReview.message}</bdi></p>
            <ul>{commitReview.selected.map((file: string) => <li key={file}><bdi dir="ltr">{file}</bdi></li>)}</ul>
            <p>{uiText("هذا ينشئ Commit محلياً فقط. لا يرفع الملفات إلى GitHub.")}</p>
            <button className="button primary" disabled={busy} onClick={async () => {
              setBusy(true);
              const review = commitReview;
              setCommitReview(null);
              try {
                const result = await act({ op: "git.commit.apply", previewId: review.previewId });
                if (result) { await refresh(); setReceipt(`${uiText("حُفظ Commit المحلي: ")}${result.head}`); }
              } finally { setBusy(false); }
            }}>{uiText("أوافق، احفظ Commit المحلي")}</button>
          </div>
        </div>
      )}
      {receipt && <p role="status"><bdi>{receipt}</bdi></p>}
      {p.github && (
        <div>
          <button className="button secondary" disabled={busy} onClick={async () => {
            setBusy(true);
            setPushReview(null);
            try {
              const review = await act({ op: "git.push.preview", projectId: p.id });
              if (review) setPushReview(review);
            } finally { setBusy(false); }
          }}>{uiText("معاينة الرفع إلى GitHub")}</button>
          {pushReview && (
            <div className="info-strip">
              <div>
                <h4>{uiText("راجع الرفع إلى GitHub")}</h4>
                <p>{uiText("المجلد: ")}<bdi dir="ltr">{pushReview.root}</bdi><br />
                  {uiText("المستودع: ")}<bdi>{pushReview.owner}/{pushReview.repo}</bdi><br />
                  {uiText("الفرع: ")}<bdi>{pushReview.branch}</bdi><br />
                  GitHub HEAD: <bdi dir="ltr">{pushReview.remoteHead || uiText("لا يوجد Commit بعد")}</bdi><br />
                  Local HEAD: <bdi dir="ltr">{pushReview.localHead}</bdi></p>
                {pushReview.dirty && <p>{uiText("توجد تغييرات محلية غير محفوظة؛ الرفع يشمل الـCommit فقط.")}</p>}
                <button className="button primary" disabled={busy} onClick={async () => {
                  setBusy(true);
                  const review = pushReview;
                  setPushReview(null);
                  try {
                    const result = await act({ op: "git.push.apply", previewId: review.previewId });
                    if (result) setReceipt(`${uiText("تأكد الرفع إلى GitHub: ")}${result.head}`);
                  } finally { setBusy(false); }
                }}>{uiText("أوافق، ارفع الـCommit إلى GitHub")}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
