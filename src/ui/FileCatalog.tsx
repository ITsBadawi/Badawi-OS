import { uiFormat, uiText } from "../localization.ts";
import React, { useState, useEffect, useRef } from "react";
import { Search, RefreshCw, Inbox } from "lucide-react";
import { useApp } from "./context.tsx";
import { when } from "./shared.tsx";
export function FileCatalog({
  onOpen,
}: {
  onOpen: (
    projectId: string,
    path: string,
    catalogedAt: string,
  ) => Promise<void>;
}) {
  const { data, act } = useApp();
  const [space, setSpace] = useState<"files" | "projects" | "all">("files"),
    [projectId, setProject] = useState(""),
    [query, setQuery] = useState(""),
    [mode, setMode] = useState<"name" | "content">("name"),
    [extension, setExtension] = useState(""),
    [category, setCategory] = useState(""),
    [tag, setTag] = useState(""),
    [linked, setLinked] = useState(""),
    [inboxOnly, setInbox] = useState(false),
    [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const sources = data.projects.filter(
    (p) =>
      p.root &&
      !p.archived &&
      (space === "all" ||
        (space === "files" ? p.kind === "workfiles" : p.kind !== "workfiles")),
  );
  const requestVersion = useRef(0);
  const sourceIdentity = JSON.stringify(
    sources.map((p) => [p.id, p.root, p.updatedAt]),
  );
  useEffect(() => {
    requestVersion.current++;
    setResult(null);
  }, [sourceIdentity]);
  const args = {
    op: "files.catalog" as const,
    space,
    projectId: projectId || undefined,
    query: query.trim() || undefined,
    mode,
    extension: extension.trim() || undefined,
    category: (category || undefined) as any,
    tag: tag.trim() || undefined,
    linkedProjectId: linked || undefined,
    inboxOnly,
  };
  async function search(offset = 0, sourceOffset = 0) {
    const version = ++requestVersion.current;
    setBusy(true);
    try {
      const r = await act({ ...args, offset, sourceOffset });
      if (r && requestVersion.current === version) setResult(r);
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    requestVersion.current++;
    setResult(null);
  }
  async function refresh(content: boolean) {
    const ids = projectId
      ? [projectId]
      : result?.sources?.map((s: any) => s.projectId) ||
        sources.slice(0, 10).map((p) => p.id);
    if (!ids.length) return;
    const version = ++requestVersion.current;
    setBusy(true);
    try {
      if (content) {
        if (ids.length !== 1) return;
        const indexed = await act({ op: "files.index", projectId: ids[0] });
        if (!indexed) return;
      }
      const refreshed = await act({
        op: "files.catalog.refresh",
        projectIds: ids,
      });
      if (refreshed) {
        const r = await act({
          ...args,
          sourceOffset: result?.sourceOffset || 0,
        });
        if (r && requestVersion.current === version) setResult(r);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="paper workspace-connect central-catalog">
      <h2>{uiText("الفهرس المركزي للملفات")}</h2>
      <p className="muted">
        {uiText(
          "بحث محلي في المصادر المرتبطة فقط. النتائج محفوظة من وقت الفهرسة؛ فتح الملف يفحص مساره وصلاحيته مجدداً. الكود في Projects يبقى للقراءة فقط.",
        )}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <div className="form-grid">
          <label className="field">
            {uiText("مساحة البحث")}
            <select
              aria-label={uiText("مساحة البحث المركزي")}
              value={space}
              onChange={(e) => {
                setSpace(e.target.value as typeof space);
                setProject("");
                reset();
              }}
            >
              <option value="files">{uiText("Files · ملفات العمل")}</option>
              <option value="projects">
                {uiText("Projects · قراءة الكود")}
              </option>
              <option value="all">{uiText("كل المصادر المرتبطة")}</option>
            </select>
          </label>
          <label className="field">
            {uiText("المصدر")}
            <select
              aria-label={uiText("مصدر الفهرس المركزي")}
              value={projectId}
              onChange={(e) => {
                setProject(e.target.value);
                reset();
              }}
            >
              <option value="">{uiText("كل مصادر المساحة")}</option>
              {sources.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {uiText("طريقة البحث")}
            <select
              aria-label={uiText("طريقة البحث المركزي")}
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as typeof mode);
                reset();
              }}
            >
              <option value="name">{uiText("الاسم والمسار")}</option>
              <option value="content">{uiText("المحتوى المفهرس")}</option>
            </select>
          </label>
          <label className="field">
            {uiText("عبارة البحث")}
            <input
              aria-label={uiText("عبارة البحث المركزي")}
              value={query}
              maxLength={200}
              required={mode === "content"}
              onChange={(e) => {
                setQuery(e.target.value);
                reset();
              }}
            />
          </label>
          <label className="field">
            {uiText("امتداد الملف")}
            <input
              aria-label={uiText("امتداد الملف المركزي")}
              value={extension}
              maxLength={21}
              pattern="\.?[a-zA-Z0-9]{1,20}"
              placeholder="png / pdf / md"
              onChange={(e) => {
                setExtension(e.target.value);
                reset();
              }}
            />
          </label>
          <label className="field">
            {uiText("التصنيف")}
            <select
              aria-label={uiText("تصنيف البحث المركزي")}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                reset();
              }}
            >
              <option value="">{uiText("كل التصنيفات")}</option>
              <option value="unclassified">{uiText("غير مصنّف")}</option>
              <option value="design">{uiText("تصميم")}</option>
              <option value="document">{uiText("مستند")}</option>
              <option value="asset">{uiText("وسائط")}</option>
              <option value="other">{uiText("أخرى")}</option>
            </select>
          </label>
          <label className="field">
            {uiText("الوسم")}
            <input
              aria-label={uiText("وسم البحث المركزي")}
              value={tag}
              maxLength={50}
              onChange={(e) => {
                setTag(e.target.value);
                reset();
              }}
            />
          </label>
          <label className="field">
            {uiText("مرتبط بالمشروع")}
            <select
              aria-label={uiText("المشروع المرتبط بالملفات")}
              value={linked}
              onChange={(e) => {
                setLinked(e.target.value);
                reset();
              }}
            >
              <option value="">{uiText("كل الروابط")}</option>
              {data.projects
                .filter((p) => p.kind !== "workfiles" && !p.archived)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={inboxOnly}
            onChange={(e) => {
              setInbox(e.target.checked);
              reset();
            }}
          />
          {uiText("ملفات Inbox فقط")}
        </label>
        <div className="button-wrap">
          <button className="button primary" disabled={busy}>
            <Search size={16} />
            {uiText("بحث في الفهرس")}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={
              busy ||
              data.engine.mode !== "Running" ||
              data.engine.gaming ||
              !sources.length
            }
            onClick={() => void refresh(false)}
          >
            <RefreshCw size={16} />
            {uiText("تحديث قائمة المصادر المعروضة")}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={
              busy ||
              !projectId ||
              data.engine.mode !== "Running" ||
              data.engine.gaming
            }
            onClick={() => void refresh(true)}
          >
            {uiText("فهرسة محتوى المصدر المحدد")}
          </button>
          <button
            type="button"
            className="button soft"
            onClick={() => {
              setSpace("files");
              setProject("");
              setInbox(true);
              setCategory("unclassified");
              reset();
            }}
          >
            <Inbox size={16} />
            {uiText("تنظيم Inbox")}
          </button>
        </div>
      </form>
      <p className="muted">
        {uiText(
          "تحديث الفهرس يحتاج تشغيل المحرك وخروج وضع اللعب. افتح ملف Inbox من النتائج لتصنيفه وربطه بمشروع، ثم استخدم النقل بمعاينة إذا أردت وضعه في مجلد آخر. لا تُنقل الملفات تلقائياً.",
        )}
      </p>
      {result && (
        <>
          <p role="status">
            {result.matched}
            {uiText(" نتيجة في صفحة المصادر الحالية ·")} {result.totalSources}
            {uiText(" مصدر مرتبط.")}{" "}
            {result.unindexedFiles > 0 &&
              uiFormat(
                "{0} ملفاً بلا محتوى مفهرس مطابق لهذه القائمة؛ افهرس المصدر لبحث محتواه.",
                [result.unindexedFiles],
              )}
          </p>
          <div className="catalog-sources">
            {result.sources.map((s: any) => (
              <small key={s.projectId}>
                {s.name} · {s.space === "files" ? "Files" : "Projects"} ·{" "}
                {s.catalogedAt
                  ? uiFormat("القائمة: {0}", [when(s.catalogedAt)])
                  : uiText("القائمة غير مفهرسة")}
                {s.contentIndexedAt &&
                  uiFormat(" · المحتوى: {0}", [when(s.contentIndexedAt)])}
                {s.truncated && uiText(" · قائمة محدودة")}
                {s.contentTruncated && uiText(" · المحتوى المفهرس محدود")}
              </small>
            ))}
          </div>
          <div className="file-list">
            {result.matches.map((f: any) => (
              <button
                className="file-row catalog-row"
                key={`${f.projectId}:${f.path}`}
                onClick={() => void onOpen(f.projectId, f.path, f.catalogedAt)}
              >
                <span>
                  <bdi>{f.path}</bdi>
                  <small>
                    {f.projectName} ·{" "}
                    {f.space === "files" ? "Files" : "Projects"} · {f.category}
                    {f.inbox ? " · Inbox" : ""} · {f.size} bytes
                  </small>
                  {f.text && (
                    <small>
                      <bdi>
                        {f.line}: {f.text}
                      </bdi>
                    </small>
                  )}
                </span>
              </button>
            ))}
          </div>
          {!result.matches.length && (
            <p className="inline-empty">
              {uiText(
                "لا نتائج في هذه الصفحة من الفهرس. حدّث المصادر غير المفهرسة أو انتقل إلى صفحة مصادر أخرى قبل اعتبار البحث شاملاً.",
              )}
            </p>
          )}
          <div className="button-wrap">
            {result.offset > 0 && (
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() =>
                  void search(
                    Math.max(0, result.offset - 50),
                    result.sourceOffset,
                  )
                }
              >
                {uiText("النتائج السابقة")}
              </button>
            )}
            {result.hasMore && (
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() =>
                  void search(result.offset + 50, result.sourceOffset)
                }
              >
                {uiText("المزيد من النتائج")}
              </button>
            )}
            {result.sourceOffset > 0 && (
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() =>
                  void search(0, Math.max(0, result.sourceOffset - 10))
                }
              >
                {uiText("المصادر السابقة")}
              </button>
            )}
            {result.nextSourceOffset !== null && (
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => void search(0, result.nextSourceOffset)}
              >
                {uiText("المصادر التالية")}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
