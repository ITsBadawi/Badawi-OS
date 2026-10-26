import { localeTag } from "../localization.ts";
import { uiFormat, uiText } from "../localization.ts";
import React, { useState, useEffect } from "react";
import {
  Plus,
  FolderOpen,
  Archive,
  Trash2,
  FileText,
  Search,
  RefreshCw,
  GitBranch,
  ArrowUpLeft,
  ShieldCheck,
  Save,
  Inbox as InboxIcon,
  Sparkles,
} from "lucide-react";
import { WorkspaceConnect, ProjectPermissions } from "./Tasks.tsx";
import { ManagedWorkspace, WorkFilesTools } from "./WorkFilesTools.tsx";
const WorkspaceReconnect = React.lazy(() =>
  import("./WorkspaceReconnect.tsx").then((m) => ({
    default: m.WorkspaceReconnect,
  })),
);
const FileCatalog = React.lazy(() =>
  import("./FileCatalog.tsx").then((m) => ({ default: m.FileCatalog })),
);
import { WorkFileMetadata } from "./WorkFileMetadata.tsx";
import { ProjectCreator, ProjectDetails } from "./ProjectDetails.tsx";
import { ProjectGitHub } from "./GitHub.tsx";
import { GitPublish } from "./GitPublish.tsx";
import { ProjectDeployments } from "./Deployments.tsx";
import { ProjectClone } from "./ProjectClone.tsx";
import { useApp } from "./context.tsx";
import {
  Modal,
  Empty,
  Confirm,
  ProjectCard,
  TaskForm,
  when,
} from "./shared.tsx";
export function Projects() {
  const { data, act, go } = useApp();
  const [filter, setFilter] = useState(false),
    [create, setCreate] = useState(false),
    [clone, setClone] = useState(false),
    [selected, setSelected] = useState<any>(null),
    [remove, setRemove] = useState<any>(null),
    [git, setGit] = useState(""),
    [task, setTask] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{uiText("مشاريعك، بصورة أوضح.")}</h1>
          <p>{uiText("اقرأ الكود وتابع المهام من مساحة واحدة.")}</p>
        </div>
        <div className="button-wrap">
          <button className="button secondary" onClick={() => setClone(true)}>
            <GitBranch size={17} />
            {uiText("استنساخ من GitHub")}
          </button>
          <button className="button secondary" onClick={() => setCreate(true)}>
            <Plus size={17} />
            {uiText("إنشاء مشروع جديد")}
          </button>
          <button
            className="button primary"
            onClick={() => void act({ op: "project.pick" })}
          >
            <Plus size={17} />
            {uiText("إضافة مشروع")}
          </button>
        </div>
      </div>
      <div className="info-strip">
        <ShieldCheck size={18} />
        <span>
          {uiText(
          "تُقرأ ملفات المشاريع دون تعديل؛ حفظ تغييرات Git ورفعها يتطلبان مراجعتك وموافقتك لكل خطوة.",
          )}
        </span>
      </div>
      <div className="filter-tabs">
        <button
          className={!filter ? "active" : ""}
          onClick={() => setFilter(false)}
        >
          {uiText("النشطة")}
        </button>
        <button
          className={filter ? "active" : ""}
          onClick={() => setFilter(true)}
        >
          {uiText("المؤرشفة")}
        </button>
      </div>
      <div className="project-grid-full">
        {data.projects
          .filter((p) => p.kind !== "workfiles" && !!p.archived === filter)
          .map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={() => {
                setSelected(p);
                setGit("");
              }}
            />
          ))}
      </div>
      {!data.projects.filter(
        (p) => p.kind !== "workfiles" && !!p.archived === filter,
      ).length && (
        <Empty
          title={
            filter ? uiText("لا مشاريع مؤرشفة") : uiText("أضف أول مشروع لك")
          }
          body={uiText(
            "اختر مجلداً من جهازك. لن نعدّل أو نشغّل أي ملف بداخله.",
          )}
          action={
            <button
              className="button secondary"
              onClick={() => void act({ op: "project.pick" })}
            >
              <FolderOpen size={17} />
              {uiText("اختيار مجلد")}
            </button>
          }
        />
      )}
      {selected && (
        <Modal title={selected.name} wide onClose={() => setSelected(null)}>
          <p className="path-line" dir="ltr">
            {selected.root || "Folder must be reconnected after restore"}
          </p>
          <div className="info-strip">
            <ShieldCheck size={17} />
            {uiText("قراءة الملفات؛ تغييرات Git بموافقتك فقط")}
          </div>
          <div className="form-actions split">
            <button
              className="button secondary"
              onClick={() => {
                sessionStorage.setItem("badawi.files.project", selected.id);
                setSelected(null);
                go("files");
              }}
            >
              {uiText("تصفح الملفات")}
            </button>
            <button className="button secondary" onClick={() => setTask(true)}>
              <Plus size={16} />
              {uiText("مهمة جديدة")}
            </button>
          </div>
          {!selected.root && (
            <button
              className="button soft"
              onClick={async () => {
                const r = await act({ op: "project.relink", id: selected.id });
                if (r) setSelected(r);
              }}
            >
              {uiText("إعادة ربط مجلد هذا المشروع")}
            </button>
          )}
          <ProjectPermissions
            project={
              data.projects.find((p) => p.id === selected.id) || selected
            }
          />
          <ProjectDetails
            key={selected.id}
            project={
              data.projects.find((p) => p.id === selected.id) || selected
            }
            onSave={setSelected}
          />
          <ProjectGitHub project={selected} />
          <GitPublish project={selected} />
          <ProjectDeployments project={selected} />
          <button
            className="button soft"
            onClick={async () => {
              await act({
                op: "chat.create",
                provider: data.defaultProvider,
                source: { projectId: selected.id },
                title: uiFormat("ناقش مشروع {0}", [selected.name]),
              });
              setSelected(null);
              go("chat");
            }}
          >
            {uiText("ناقش هذا المشروع مع Badawi")}
          </button>
          <h3 className="subheading">{uiText("مهام المشروع")}</h3>
          <h3 className="subheading">{uiText("ملفات عمل مرتبطة")}</h3>
          {data.projects
            .filter((p) => p.kind === "workfiles")
            .flatMap((p) =>
              (p.fileEntries || [])
                .filter((e: any) => e.linkedProjectIds?.includes(selected.id))
                .map((e: any) => (
                  <button
                    key={`${p.id}:${e.path}`}
                    className="button secondary small"
                    onClick={() => {
                      sessionStorage.setItem("badawi.files.project", p.id);
                      sessionStorage.setItem("badawi.files.path", e.path);
                      setSelected(null);
                      go("files");
                    }}
                  >
                    <FileText size={16} />
                    <bdi>{e.path}</bdi> · {e.category}
                  </button>
                )),
            )}
          {data.tasks
            .filter((t) => t.projectId === selected.id)
            .map((t) => (
              <label className="simple-task" key={t.id}>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={(e) =>
                    void act({
                      op: "task.save",
                      id: t.id,
                      title: t.title,
                      done: e.target.checked,
                      projectId: t.projectId,
                    })
                  }
                />
                {t.title}
              </label>
            ))}
          {!data.tasks.some((t) => t.projectId === selected.id) && (
            <p className="muted">{uiText("لا توجد مهام مرتبطة بعد.")}</p>
          )}
          <h3 className="subheading">Git</h3>
          <div className="button-wrap">
            {[
              { tool: "status", label: uiText("حالة الملفات") },
              { tool: "log", label: uiText("آخر التغييرات") },
              { tool: "branches", label: uiText("الفروع") },
              { tool: "diff", label: uiText("ملخص الفروقات") },
            ].map((t) => (
              <button
                disabled={busy}
                className="button secondary small"
                key={t.tool}
                onClick={async () => {
                  setBusy(true);
                  const r = await act({
                    op: "git.read",
                    projectId: selected.id,
                    tool: t.tool as any,
                  });
                  if (typeof r === "string")
                    setGit(r || uiText("لا توجد تغييرات"));
                  setBusy(false);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {git && (
            <pre className="code-preview" dir="ltr">
              {git}
            </pre>
          )}
          <div className="form-actions split">
            <button
              className="button secondary"
              onClick={async () => {
                await act({
                  op: "project.archive",
                  id: selected.id,
                  archived: !selected.archived,
                });
                setSelected(null);
              }}
            >
              <Archive size={15} />
              {selected.archived ? uiText("إعادة تنشيط") : uiText("أرشفة")}
            </button>
            <button
              className="button danger"
              onClick={() => {
                setRemove(selected);
                setSelected(null);
              }}
            >
              <Trash2 size={15} />
              {uiText("إزالة الربط")}
            </button>
          </div>
        </Modal>
      )}
      {remove && (
        <Confirm
          title={uiText("إزالة ربط المشروع؟")}
          body={uiText(
            "ستُلغى صلاحية القراءة وتتوقف أتمتاته. سيبقى مجلدك على القرص كما هو.",
          )}
          button={uiText("إزالة الربط")}
          onClose={() => setRemove(null)}
          onConfirm={() => act({ op: "project.remove", id: remove.id })}
        />
      )}
      {task && <TaskForm onClose={() => setTask(false)} />}
      {create && <ProjectCreator onClose={() => setCreate(false)} />}
      {clone && <ProjectClone onClose={() => setClone(false)} />}
    </>
  );
}
export function Files() {
  const { data, act, go } = useApp();
  const [folder, setFolder] = useState("");
  const [catalogTarget, setCatalogTarget] = useState<{
    projectId: string;
    path: string;
    catalogedAt: string;
  } | null>(null);
  const [directories, setDirectories] = useState<string[]>([]);
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [indexInfo, setIndexInfo] = useState<any>(null);
  const [searchMode, setSearchMode] = useState("name"),
    [searchResult, setSearchResult] = useState<any>(null);
  const [project, setProject] = useState(
      () =>
        data.projects.find(
          (p) =>
            p.root && p.id === sessionStorage.getItem("badawi.files.project"),
        )?.id ||
        data.projects.find((p) => p.root)?.id ||
        "",
    ),
    [files, setFiles] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [body, setBody] = useState(""),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [truncated, setTruncated] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFiles([]);
    setDirectories([]);
    setFolder("");
    setPreviewFile(null);
    setBody("");
    setSelected("");
    setLoaded(false);
    setSearchResult(null);
    setIndexInfo(null);
    const linked = sessionStorage.getItem("badawi.files.path");
    if (linked && project) {
      sessionStorage.removeItem("badawi.files.path");
      void act({ op: "files.preview", projectId: project, path: linked }).then(
        (r) => {
          if (r) {
            setSelected(linked);
            setBody(r.text || "");
            setPreviewFile(r);
          }
        },
      );
    }
  }, [project, data.projects.find((p) => p.id === project)?.root]);
  useEffect(() => {
    if (!catalogTarget || catalogTarget.projectId !== project) return;
    let cancelled = false;
    setSelected("");
    setBody("");
    setPreviewFile(null);
    void act({
      op: "files.preview",
      projectId: project,
      path: catalogTarget.path,
      catalogedAt: catalogTarget.catalogedAt,
    }).then((r) => {
      if (r && !cancelled) {
        setSelected(catalogTarget.path);
        setBody(r.text || "");
        setPreviewFile(r);
        requestAnimationFrame(() => {
          if (!cancelled)
            document
              .querySelector(".file-preview")
              ?.scrollIntoView({ block: "start", behavior: "smooth" });
        });
        setFolder(
          catalogTarget.path.includes("/")
            ? catalogTarget.path.slice(
                0,
                catalogTarget.path.lastIndexOf("/") + 1,
              )
            : "",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    catalogTarget,
    project,
    data.projects.find((p) => p.id === project)?.root,
  ]);
  const folders = [
    ...new Set<string>(
      [...files, ...directories.map((p) => ({ path: p + "/" }))]
        .filter((f) => f.path.startsWith(folder))
        .map((f) => f.path.slice(folder.length))
        .filter((p) => p.includes("/"))
        .map((p) => p.split("/")[0]),
    ),
  ].sort();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{uiText("ملفاتك، بدون فوضى.")}</h1>
          <p>{uiText("معاينة نصية آمنة، بدون تعديل الملفات أو تشغيلها.")}</p>
        </div>
      </div>
      <details
        className="paper workspace-connect"
        open={!data.projects.some((p) => p.root)}
      >
        <summary>{uiText("إضافة أو إنشاء مساحة عمل")}</summary>
        <WorkspaceConnect onAdded={(p: any) => setProject(p.id)} />
        <ManagedWorkspace onCreated={(p) => setProject(p.id)} />
      </details>
      <React.Suspense
        fallback={<p className="info-strip">{uiText("نفتح أدوات الملفات…")}</p>}
      >
        <WorkspaceReconnect
          onLinked={(p) => {
            setCatalogTarget(null);
            setProject(p.id);
          }}
        />
        <FileCatalog
          onOpen={async (id, filePath, catalogedAt) => {
            setCatalogTarget({ projectId: id, path: filePath, catalogedAt });
            setProject(id);
          }}
        />
      </React.Suspense>
      <WorkFilesTools
        project={data.projects.find((p) => p.id === project)}
        selected={selected}
        folder={folder}
        onChanged={async () => {
          const r = await act({ op: "files.list", projectId: project });
          if (r) {
            setFiles(r.files);
            setDirectories(r.directories || []);
            setSelected("");
            setBody("");
            setPreviewFile(null);
            setLoaded(true);
          }
        }}
      />
      {project && (
        <div className="workspace-location paper">
          <strong>{uiText("المسار الحالي")}</strong>
          <code dir="ltr">
            {data.projects.find((p) => p.id === project)?.root}
          </code>
          <button
            className="button secondary small"
            onClick={() =>
              void act({ op: "desktop.openFolder", projectId: project })
            }
          >
            {uiText("فتح المجلد في Windows")}
          </button>
          <ProjectPermissions
            project={data.projects.find((p) => p.id === project)}
          />
        </div>
      )}
      <div className="filter-tabs" aria-label={uiText("نوع مستعرض الملفات")}>
        <button
          className={
            data.projects.find((p) => p.id === project)?.kind === "workfiles"
              ? "active"
              : ""
          }
          disabled={
            !data.projects.some(
              (p) => p.root && p.kind === "workfiles" && !p.archived,
            )
          }
          onClick={() => {
            const p = data.projects.find(
              (p) => p.root && p.kind === "workfiles" && !p.archived,
            );
            if (p) setProject(p.id);
          }}
        >
          {uiText("Files · ملفات العمل")}
        </button>
        <button
          className={
            data.projects.find((p) => p.id === project)?.kind !== "workfiles"
              ? "active"
              : ""
          }
          disabled={
            !data.projects.some(
              (p) => p.root && p.kind !== "workfiles" && !p.archived,
            )
          }
          onClick={() => {
            const p = data.projects.find(
              (p) => p.root && p.kind !== "workfiles" && !p.archived,
            );
            if (p) setProject(p.id);
          }}
        >
          {uiText("Projects · قراءة فقط")}
        </button>
      </div>
      <div className="file-toolbar">
        <label className="field compact-field">
          {uiText("المشروع")}
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">{uiText("اختر مشروعاً")}</option>
            {data.projects
              .filter(
                (p) =>
                  p.root &&
                  !p.archived &&
                  (data.projects.find((p) => p.id === project)?.kind ===
                  "workfiles"
                    ? p.kind === "workfiles"
                    : p.kind !== "workfiles"),
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <button
          className="button secondary"
          disabled={!project || busy}
          onClick={async () => {
            setBusy(true);
            if (data.engine.mode !== "Running")
              await act({
                op: "engine.mode",
                mode: "Running",
                epoch: data.engine.epoch,
              });
            const r = await act({ op: "files.list", projectId: project });
            if (r) {
              setFiles(r.files);
              setDirectories(r.directories || []);
              setTruncated(r.truncated);
              setLoaded(true);
            }
            setBusy(false);
          }}
        >
          <RefreshCw size={16} />
          {busy
            ? uiText("جارٍ القراءة…")
            : data.engine.mode !== "Running"
              ? uiText("تشغيل المحرك وقراءة الملفات")
              : uiText("قراءة قائمة الملفات")}
        </button>
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label={
              searchMode === "content"
                ? uiText("بحث داخل الملفات")
                : uiText("بحث في أسماء الملفات")
            }
            placeholder={
              searchMode === "content"
                ? uiText("ابحث عن نص…")
                : uiText("ابحث عن اسم ملف…")
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="file-search-mode"
          aria-label={uiText("نطاق البحث")}
          value={searchMode}
          onChange={(e) => {
            setSearchMode(e.target.value);
            setSearchResult(null);
          }}
        >
          <option value="name">{uiText("أسماء الملفات")}</option>
          <option value="content">{uiText("داخل الملفات")}</option>
          <option value="type">{uiText("نوع الملف (مثل png)")}</option>
        </select>
        {searchMode === "content" && (
          <button
            className="button secondary"
            disabled={
              !project ||
              busy ||
              data.engine.mode !== "Running" ||
              data.engine.gaming
            }
            onClick={async () => {
              setBusy(true);
              try {
                const r = await act({ op: "files.index", projectId: project });
                if (r) setIndexInfo(r);
              } finally {
                setBusy(false);
              }
            }}
          >
            {uiText("بناء فهرس المحتوى")}
          </button>
        )}
        {searchMode === "content" && (
          <button
            className="button soft"
            disabled={!project || !query.trim() || busy}
            onClick={async () => {
              setBusy(true);
              const r = await act({
                op: "files.search",
                projectId: project,
                query,
              });
              if (r) setSearchResult(r);
              setBusy(false);
            }}
          >
            {uiText("بحث داخل الملفات")}
          </button>
        )}
      </div>
      <div className="info-strip">
        <ShieldCheck size={17} />
        {uiText(
          "الملفات السرية والمجلدات الثقيلة مستثناة. فهرسة الأسماء تتطلب تشغيل المحرك.",
        )}
      </div>
      {truncated && (
        <p className="warning-note">
          {uiText("القائمة محدودة إلى 10,000 عنصر. لم تُقرأ بقية المجلدات.")}
        </p>
      )}
      {searchMode === "content" && (
        <div className="info-strip">
          {uiText(
            "الفهرس محلي: حتى 1000 ملف نصي و16 MiB، وأول 32,768 حرفاً من كل ملف، و50 نتيجة. دون فهرس يقتصر الفحص المباشر على 100 ملف. أعِد بناء الفهرس لتضمين التغييرات الأخيرة؛ لا يُرسل المحتوى لأي خدمة.",
          )}
        </div>
      )}
      {indexInfo && (
        <p className="info-strip">
          {uiText("فُهرس ")}
          {indexInfo.indexed}
          {uiText(" ملف · ")}
          {when(indexInfo.indexedAt)} ·{" "}
          {indexInfo.truncated
            ? uiText("الفهرس جزئي ضمن الحدود")
            : uiText("اكتمل ضمن الحدود")}
        </p>
      )}
      {searchMode === "content" && searchResult && (
        <div className="paper file-search-results">
          <small className="muted">
            {searchResult.indexedAt && (
              <>
                {uiText("الفهرس بتاريخ ")}
                {when(searchResult.indexedAt)} ·{" "}
              </>
            )}
            {uiText("فُحص ")}
            {searchResult.scannedFiles}
            {uiText(" ملف ·")}{" "}
            {searchResult.truncated
              ? uiText("النتائج محدودة")
              : uiText("اكتمل البحث ضمن الحدود")}
          </small>
          {searchResult.matches.map((m: any) => (
            <button
              className="file-tree-row"
              key={`${m.path}:${m.line}`}
              onClick={async () => {
                const r = await act({
                  op: "files.read",
                  projectId: project,
                  path: m.path,
                });
                if (typeof r === "string") {
                  setPreviewFile({ kind: "text" });
                  setBody(r);
                  setSelected(m.path);
                }
              }}
            >
              <bdi>
                {m.path}:{m.line}
              </bdi>
              <span dir="auto">{m.text}</span>
            </button>
          ))}
          {!searchResult.matches.length && (
            <p>{uiText("لا توجد مطابقة ضمن الملفات والأجزاء المفحوصة.")}</p>
          )}
        </div>
      )}
      <div className="files-layout paper">
        <div className="file-tree">
          <div className="button-wrap">
            <button className="text-button" onClick={() => setFolder("")}>
              {uiText("جذر Workspace")}
            </button>
            {folder && (
              <button
                className="text-button"
                onClick={() =>
                  setFolder(
                    folder.split("/").slice(0, -2).join("/") +
                      (folder.split("/").length > 2 ? "/" : ""),
                  )
                }
              >
                {uiText("المجلد الأعلى")}
              </button>
            )}
          </div>
          {folder && (
            <p className="path-line" dir="ltr">
              {folder}
            </p>
          )}
          {!query &&
            folders.map((name) => (
              <button
                className="file-tree-row"
                key={name}
                onClick={() => setFolder(folder + name + "/")}
              >
                <FolderOpen size={16} />
                <span dir="ltr">{name}/</span>
              </button>
            ))}
          {files
            .filter((f) =>
              query
                ? searchMode === "type"
                  ? f.path
                      .toLowerCase()
                      .endsWith("." + query.toLowerCase().replace(/^\./, ""))
                  : f.path.toLowerCase().includes(query.toLowerCase())
                : f.path.startsWith(folder) &&
                  !f.path.slice(folder.length).includes("/"),
            )
            .slice(0, 500)
            .map((f) => (
              <button
                className={`file-tree-row ${selected === f.path ? "selected" : ""}`}
                key={f.path}
                title={f.path}
                onClick={async () => {
                  const r = await act({
                    op: "files.preview",
                    projectId: project,
                    path: f.path,
                  });
                  if (r) {
                    setPreviewFile(r);
                    setBody(r.text || "");
                    setSelected(f.path);
                  }
                }}
              >
                <FileText size={16} />
                <span dir="ltr">
                  {query ? f.path : f.path.slice(folder.length)}
                </span>
              </button>
            ))}
          {!files.length && (
            <p className="inline-empty">
              {loaded
                ? uiText("لم نجد ملفات مسموحة ضمن الحدود.")
                : uiText("اختر مشروعاً ثم اقرأ قائمة ملفاته.")}
            </p>
          )}
          {files.length > 500 && (
            <p className="inline-empty">
              {uiText("تظهر أول 500 نتيجة؛ استخدم البحث لتضييق القائمة.")}
            </p>
          )}
        </div>
        <div className="file-preview">
          {selected ? (
            <>
              <div className="preview-heading">
                <span dir="ltr">{selected}</span>
                <span className="badge">{uiText("قراءة فقط")}</span>
                <button
                  className="button soft small"
                  disabled={previewFile?.kind !== "text"}
                  onClick={async () => {
                    const c = await act({
                      op: "chat.create",
                      provider: data.defaultProvider,
                      source: { projectId: project, filePath: selected },
                    });
                    if (c) go("chat");
                  }}
                >
                  <Sparkles size={14} />
                  {uiText("ناقش الملف مع AI")}
                </button>
              </div>
              {previewFile?.kind === "image" ? (
                <img
                  className="file-image"
                  src={previewFile.data}
                  alt={selected}
                />
              ) : previewFile?.kind === "metadata" ? (
                <p className="info-strip">
                  {uiText("هذا الملف ليس نصياً. حجمه ")}
                  {previewFile.size.toLocaleString()}{" "}
                  {uiText("بايت؛ يمكنك حفظ نسخة منه أو فتح مجلده.")}
                </p>
              ) : (
                <pre dir="auto">{body}</pre>
              )}
              <button
                className="button secondary small"
                onClick={() =>
                  void act({
                    op: "files.export",
                    projectId: project,
                    path: selected,
                  })
                }
              >
                {uiText("حفظ نسخة من الملف")}
              </button>
              {data.projects.find((p) => p.id === project)?.kind ===
                "workfiles" && (
                <WorkFileMetadata
                  key={`${project}:${selected}`}
                  project={data.projects.find((p) => p.id === project)}
                  path={selected}
                />
              )}
            </>
          ) : (
            <Empty
              icon={FileText}
              title={uiText("اختر ملفاً لتقرأه")}
              body={uiText("تظهر محتوياته هنا. لن يُنفّذ HTML أو أي كود.")}
            />
          )}
        </div>
      </div>
    </>
  );
}
export function Notes() {
  const { data, act, go } = useApp();
  const [editing, setEditing] = useState<any>(null),
    [remove, setRemove] = useState<any>(null),
    [query, setQuery] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{uiText("أفكارك لها مكان.")}</h1>
          <p>{uiText("ملاحظات محفوظة محلياً، متاحة حتى بدون إنترنت.")}</p>
        </div>
        <button
          className="button primary"
          onClick={() => setEditing({ title: "", body: "" })}
        >
          <Plus size={17} />
          {uiText("ملاحظة جديدة")}
        </button>
      </div>
      <div className="search-field note-search">
        <Search size={17} />
        <input
          aria-label={uiText("بحث في الملاحظات")}
          placeholder={uiText("ابحث في ملاحظاتك…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="notes-grid">
        {data.notes
          .filter((n) =>
            (n.title + n.body).toLowerCase().includes(query.toLowerCase()),
          )
          .map((n) => (
            <article className="note-card paper" key={n.id}>
              <button className="note-open" onClick={() => setEditing(n)}>
                <FileText size={19} className="muted" />
                <h2>{n.title}</h2>
                <p>{n.body || uiText("ملاحظة فارغة")}</p>
              </button>
              <div className="note-footer">
                <small>{when(n.updatedAt)}</small>
                <button
                  className="icon-button"
                  aria-label={uiFormat("ناقش {0}", [n.title])}
                  onClick={async () => {
                    const c = await act({
                      op: "chat.create",
                      provider: data.providers.gemini.configured
                        ? "gemini"
                        : data.providers.openai.configured
                          ? "openai"
                          : "gemini",
                      source: { noteId: n.id },
                    });
                    if (c) go("chat");
                  }}
                >
                  <Sparkles size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={uiFormat("حذف {0}", [n.title])}
                  onClick={() => setRemove(n)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
      </div>
      {!data.notes.length && (
        <Empty
          icon={FileText}
          title={uiText("مساحة لفكرتك الأولى")}
          body={uiText(
            "اكتب ما تريد الاحتفاظ به. لا يُرسل أي نص لخدمات AI تلقائياً.",
          )}
        />
      )}
      {editing && (
        <NoteEditor note={editing} onClose={() => setEditing(null)} />
      )}{" "}
      {remove && (
        <Confirm
          title={uiText("حذف الملاحظة؟")}
          body={uiText("ستُحذف هذه الملاحظة من مساحة العمل.")}
          button={uiText("حذف")}
          onClose={() => setRemove(null)}
          onConfirm={() => act({ op: "note.remove", id: remove.id })}
        />
      )}
    </>
  );
}
function NoteEditor({ note, onClose }: { note: any; onClose: () => void }) {
  const { act } = useApp();
  const [title, setTitle] = useState(note.title),
    [body, setBody] = useState(note.body);
  return (
    <Modal
      title={note.id ? uiText("تعديل الملاحظة") : uiText("ملاحظة جديدة")}
      wide
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await act({ op: "note.save", id: note.id, title, body });
          if (r) onClose();
        }}
      >
        <label className="field">
          {uiText("عنوان الملاحظة")}
          <input
            required
            autoFocus
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          {uiText("نص الملاحظة")}
          <textarea
            className="note-editor"
            maxLength={100000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={uiText("اكتب هنا…")}
          />
        </label>
        <div className="form-actions">
          <span className="muted">
            {body.length.toLocaleString(localeTag())}
            {uiText(" حرف")}
          </span>
          <button className="button primary">
            <Save size={16} />
            {uiText("حفظ الملاحظة")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Inbox() {
  const { data, act } = useApp();
  const [selected, setSelected] = useState<any>(null);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{uiText("وصل إلى مساحتك.")}</h1>
          <p>{uiText("نتائج المهام والتقارير وإجابات المساعد.")}</p>
        </div>
      </div>
      <div className="paper inbox-list">
        {data.inbox.map((i) => (
          <button
            className="inbox-row"
            key={i.id}
            onClick={() => setSelected(i)}
          >
            <span className="schedule-icon">
              {i.provider ? <Sparkles size={19} /> : <InboxIcon size={19} />}
            </span>
            <div>
              <h3>{i.title}</h3>
              <p>{i.body.slice(0, 100)}</p>
            </div>
            <small>{when(i.createdAt)}</small>
            <ArrowUpLeft size={17} />
          </button>
        ))}
        {!data.inbox.length && (
          <Empty
            icon={InboxIcon}
            title={uiText("كل شيء هادئ هنا")}
            body={uiText("عند اكتمال مهمة ستجد نتيجتها في الوارد.")}
          />
        )}
      </div>
      {selected && (
        <Modal title={selected.title} wide onClose={() => setSelected(null)}>
          <div className="result-meta">
            {selected.provider && (
              <span className="badge purple" dir="ltr">
                {selected.provider} / {selected.model}
              </span>
            )}
            <span className="muted">{when(selected.createdAt)}</span>
          </div>
          <pre className="prose-output" dir="auto">
            {selected.body}
          </pre>
          {selected.usage && (
            <p className="muted">
              {uiText("الرموز: ")}
              {selected.usage.input}
              {uiText(" إدخال، ")}
              {selected.usage.output}{" "}
              {uiText("إخراج. هذه أرقام استخدام وليست فاتورة.")}
            </p>
          )}
          {selected.provider && !selected.usage && (
            <p className="dialog-note">
              {uiText(
                "لم يوفّر المزوّد أرقام الاستهلاك. لا يعني ذلك أن الطلب كان مجانياً.",
              )}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button danger"
              onClick={async () => {
                await act({ op: "inbox.remove", id: selected.id });
                setSelected(null);
              }}
            >
              <Trash2 size={15} />
              {uiText("حذف النتيجة")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
