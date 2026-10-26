import { uiLabels, uiText } from "../localization.ts";
import React, { useState, useEffect, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  ChartNoAxesCombined,
  FolderKanban,
  Files as FilesIcon,
  Workflow,
  Cloud,
  ShieldCheck,
  Settings2,
  Search,
  Moon,
  Sun,
  FileText,
  Inbox as InboxIcon,
  Bell,
  Sparkles,
  Menu,
  X,
  ChevronLeft,
  ArrowUpLeft,
} from "lucide-react";
import { Provider, useApp } from "./context.tsx";
import { Dashboard, stateLabels } from "./Dashboard.tsx";
import { Projects, Files, Notes, Inbox } from "./Workspace.tsx";
import { Settings, Backups, Audit } from "./Settings.tsx";
import { Tasks } from "./Tasks.tsx";
import { Chat } from "./Chat.tsx";
import { Modal, Empty } from "./shared.tsx";
import "./design.css";
import "./app.css";
const Reports = React.lazy(() =>
  import("./Reports.tsx").then((module) => ({ default: module.Reports })),
);
const Automations = React.lazy(() =>
  import("./Automations.tsx").then((module) => ({
    default: module.Automations,
  })),
);
const nav = uiLabels([
  { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { id: "tasks", label: "المهام", icon: FolderKanban },
  { id: "chat", label: "المحادثة", icon: Sparkles },
  { id: "projects", label: "المشاريع", icon: FolderKanban },
  { id: "files", label: "الملفات", icon: FilesIcon },
  { id: "notes", label: "الملاحظات", icon: FileText },
  { id: "automations", label: "الأتمتة", icon: Workflow },
  { id: "inbox", label: "الوارد", icon: InboxIcon },
  { id: "backups", label: "النسخ الاحتياطية", icon: Cloud },
  { id: "reports", label: "التقارير", icon: ChartNoAxesCombined },
  { id: "audit", label: "سجل التحقق", icon: ShieldCheck },
]);
function App() {
  const { data, act, page, go } = useApp();
  const [search, setSearch] = useState(false),
    [assistantOpen, setAssistantOpen] = useState(false),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (page !== "chat") setAssistantOpen((s) => !s);
      }
      if (e.key === "Escape") setAssistantOpen(false);
    };
    addEventListener("keydown", listener);
    return () => removeEventListener("keydown", listener);
  }, [go, page]);
  useEffect(() => {
    if (page === "chat") setAssistantOpen(false);
  }, [page]);
  const navigate = (id: string) => {
    go(id);
    setMenu(false);
  };
  const title = nav.find((n) => n.id === page)?.label || uiText("الإعدادات");
  const count = (id: string) =>
    id === "projects"
      ? data.projects.filter((p) => p.kind !== "workfiles" && !p.archived)
          .length
      : id === "inbox"
        ? data.inbox.length
        : id === "automations"
          ? data.jobs.length
          : 0;
  return (
    <>
      <div
        className={`mobile-shade ${menu ? "show" : ""}`}
        onClick={() => setMenu(false)}
      />
      <div className="app">
        <aside
          className={`sidebar ${menu ? "open" : ""}`}
          aria-label={uiText("القائمة الرئيسية")}
        >
          <button
            className="brand"
            onClick={() => navigate("dashboard")}
            aria-label={uiText("الرئيسية")}
          >
            <svg className="brand-mark" viewBox="0 0 36 38" fill="none">
              <rect
                x="2"
                y="2"
                width="11"
                height="34"
                rx="5.5"
                fill="currentColor"
              />
              <path
                d="M18 2h3c7 0 12 4 12 9s-5 8-12 8h-3V2Z"
                fill="currentColor"
              />
              <path
                d="M18 22h3c7 0 12 3 12 7s-5 7-12 7h-3V22Z"
                fill="currentColor"
                opacity=".42"
              />
            </svg>
            <div>
              <div className="brand-name">badawi os</div>
              <small>{uiText("مساحة لكل ما يهمّك")}</small>
            </div>
          </button>
          <div className="workspace-button">
            <div className="workspace-avatar">{uiText("ب")}</div>
            <div className="details">
              <strong>{uiText("مساحتي")}</strong>
              <span>{uiText("محفوظة على هذا الجهاز")}</span>
            </div>
            <ShieldCheck size={15} className="muted" />
          </div>
          <div className="nav-caption">{uiText("مساحتك")}</div>
          <nav>
            {nav.map(({ id, label, icon: Icon }, index) => (
              <React.Fragment key={id}>
                {index === 6 && <div className="sidebar-divider" />}
                <button
                  className={`nav-item ${page === id ? "active" : ""}`}
                  aria-label={label}
                  aria-current={page === id ? "page" : undefined}
                  onClick={() => navigate(id)}
                >
                  <Icon size={19} strokeWidth={1.7} />
                  {label}
                  {count(id) > 0 && (
                    <span className="nav-count" dir="ltr">
                      {count(id)}
                    </span>
                  )}
                </button>
              </React.Fragment>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button
              className={`nav-item ${page === "settings" ? "active" : ""}`}
              onClick={() => navigate("settings")}
            >
              <Settings2 size={19} />
              {uiText("الإعدادات")}
            </button>
            <div className="local-status">
              <span
                className={`status-dot ${data.engine.mode === "Running" ? "green" : ""}`}
              />
              {stateLabels[data.engine.effective]}
            </div>
            <div className="profile">
              <div className="profile-avatar">{uiText("ب")}</div>
              <div>
                <strong>{uiText("مساحتك الخاصة")}</strong>
                <small>Badawi OS · {data.version}</small>
              </div>
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumbs">
              <button
                className="icon-button mobile-menu"
                aria-label={uiText("فتح القائمة")}
                onClick={() => setMenu(true)}
              >
                <Menu size={20} />
              </button>
              <span>{uiText("مساحتي")}</span>
              <ChevronLeft size={13} />
              <span className="crumb-current">{title}</span>
            </div>
            <div className="top-actions">
              <button
                className="search-trigger"
                onClick={() => setSearch(true)}
              >
                <Search size={17} />
                <span>{uiText("ابحث في مساحتك…")}</span>
                <kbd dir="ltr">Ctrl K</kbd>
              </button>
              <div className="top-separator" />
              <button
                className="icon-button"
                aria-label={uiText("تغيير المظهر")}
                onClick={() =>
                  void act({
                    op: "theme.set",
                    theme: data.theme === "dark" ? "light" : "dark",
                  })
                }
              >
                {data.theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
              </button>
              <button
                className="icon-button"
                aria-label={uiText("فتح الوارد")}
                onClick={() => go("inbox")}
              >
                <Bell size={19} />
                {data.inbox.length > 0 && <span className="notif-dot" />}
              </button>
            </div>
          </header>
          <main className="content" id="main-content">
            {data.runs.some(
              (r) => r.status === "needsReview" || r.reason === "restartReview",
            ) && (
              <div className="info-strip">
                <ShieldCheck size={18} />
                <span>
                  {uiText(
                    "توجد مهام من جلسة سابقة تحتاج مراجعة. افحص نتائجها قبل إعادة تشغيلها.",
                  )}
                </span>
                <button
                  className="text-button"
                  onClick={() => go("automations")}
                >
                  {uiText("مراجعة المهام")}
                </button>
              </div>
            )}
            {!data.auditValid && (
              <div className="info-strip danger-strip" role="alert">
                {uiText("تعذر التحقق من السجل. العمليات الخارجية متوقفة.")}
              </div>
            )}
            {page === "dashboard" ? (
              <Dashboard />
            ) : page === "tasks" ? (
              <Tasks />
            ) : page === "chat" ? (
              <Chat />
            ) : page === "projects" ? (
              <Projects />
            ) : page === "files" ? (
              <Files />
            ) : page === "notes" ? (
              <Notes />
            ) : page === "automations" ? (
              <React.Suspense
                fallback={<p role="status">{uiText("نفتح الأتمتة…")}</p>}
              >
                <Automations />
              </React.Suspense>
            ) : page === "inbox" ? (
              <Inbox />
            ) : page === "backups" ? (
              <Backups />
            ) : page === "audit" ? (
              <Audit />
            ) : page === "reports" ? (
              <React.Suspense
                fallback={<p role="status">{uiText("نفتح التقارير…")}</p>}
              >
                <Reports />
              </React.Suspense>
            ) : (
              <Settings />
            )}
            <footer className="page-footer">
              <span>
                <ShieldCheck size={14} />
                {uiText("محلي أولاً. بياناتك تحت تحكّمك.")}
              </span>
              <span>
                {data.engine.gaming
                  ? uiText("وضع اللعب مفعّل")
                  : data.jobs.some(
                        (j) =>
                          j.enabled &&
                          (["summary", "briefing"].includes(j.kind) ||
                            j.steps?.some((s: any) =>
                              ["summary", "briefing"].includes(s.kind),
                            )),
                      )
                    ? uiText("تلخيص AI مفوّض ضمن جداولك")
                    : uiText("بدون اتصال AI في الخلفية")}
              </span>
            </footer>
          </main>
        </div>
      </div>
      {page !== "chat" && (
        <button
          className="assistant-launch"
          aria-expanded={assistantOpen}
          onClick={() => setAssistantOpen((s) => !s)}
        >
          <Sparkles size={18} />
          {uiText("المحادثة مع AI ")}
          <kbd dir="ltr">Ctrl J</kbd>
        </button>
      )}
      {assistantOpen && page !== "chat" && (
        <aside
          className="assistant-panel"
          aria-label={uiText("مساعد Badawi الجانبي")}
        >
          <header className="assistant-panel-heading">
            <strong>{uiText("مساعد Badawi")}</strong>
            <div className="button-row">
              <button
                className="button secondary small"
                onClick={() => {
                  setAssistantOpen(false);
                  go("chat");
                }}
              >
                {uiText("فتح المحادثة كاملة")}
              </button>
              <button
                className="icon-button"
                aria-label={uiText("إغلاق المساعد الجانبي")}
                onClick={() => setAssistantOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
          </header>
          <Chat embedded />
        </aside>
      )}
      {search && <SearchDialog onClose={() => setSearch(false)} />}
    </>
  );
}
function SearchDialog({ onClose }: { onClose: () => void }) {
  const { data, go } = useApp();
  const [q, setQ] = useState("");
  const items = [
    ...data.notes.map((n) => ({
      name: n.title,
      body: n.body,
      type: uiText("ملاحظة"),
      page: "notes",
    })),
    ...data.projects.map((p) => ({
      name: p.name,
      body: "",
      type: uiText("مشروع"),
      page: "projects",
    })),
    ...data.tasks.map((t) => ({
      name: t.title,
      body: "",
      type: uiText("مهمة"),
      page: "dashboard",
    })),
    ...data.inbox.map((i) => ({
      name: i.title,
      body: i.body,
      type: uiText("الوارد"),
      page: "inbox",
    })),
  ]
    .filter(
      (x) =>
        q.trim() && (x.name + x.body).toLowerCase().includes(q.toLowerCase()),
    )
    .slice(0, 30);
  return (
    <Modal title={uiText("ابحث في مساحتك")} onClose={onClose}>
      <div className="search-field">
        <Search size={19} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={uiText("ملاحظة، مشروع، أو مهمة…")}
          aria-label={uiText("بحث شامل")}
        />
      </div>
      <div className="global-results">
        {items.map((x, i) => (
          <button
            key={i}
            className="global-result"
            onClick={() => {
              go(x.page);
              onClose();
            }}
          >
            <span>
              <strong>{x.name}</strong>
              <small>{x.type}</small>
            </span>
            <ArrowUpLeft size={16} />
          </button>
        ))}
        {q && !items.length && (
          <p className="inline-empty">{uiText("لم نجد نتيجة بهذا الاسم.")}</p>
        )}
        {!q && (
          <p className="inline-empty">
            {uiText("بحث محلي. لا يُرسل نص بحثك لأي خدمة.")}
          </p>
        )}
      </div>
    </Modal>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="launch-error">
        <h1>{uiText("تعذّر عرض هذه الصفحة")}</h1>
        <p>{uiText("بياناتك محفوظة. أعد فتح النافذة للمحاولة.")}</p>
        <button className="button secondary" onClick={() => location.reload()}>
          {uiText("إعادة الفتح")}
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Provider>
      <App />
    </Provider>
  </ErrorBoundary>,
);
