import { hostFormat, hostText } from "./host-localization.ts";
import { Store, type Row } from "./store.ts";
import { DateTime } from "luxon";
import { type Command } from "../contracts.ts";
export { taskCalendar } from "./task-calendar.ts";

export function saveTask(
  store: Store,
  c: Extract<Command, { op: "task.save" }>,
  now = Date.now(),
): Row {
  const prior = store.get("tasks", c.id || "");
  if (c.id && !prior) throw Error("TASK_NOT_FOUND");
  if (c.projectId && !store.get("projects", c.projectId))
    throw Error("PROJECT_NOT_FOUND");
  if (
    prior?.deadlineFixed &&
    ((c.dueAt !== undefined &&
      Date.parse(c.dueAt || "") !== Date.parse(prior.dueAt || "")) ||
      c.deadlineFixed === false) &&
    !c.confirmDeadlineChange
  )
    throw Error("FIXED_DEADLINE_CONFIRMATION_REQUIRED");
  const task: any = {
    ...prior,
    ...c,
    op: undefined,
    confirmDeadlineChange: undefined,
    status:
      c.status ||
      (c.done
        ? "done"
        : prior?.status === "done"
          ? "todo"
          : prior?.status || "todo"),
    done: c.status ? c.status === "done" : c.done,
    projectId:
      c.projectId === undefined ? prior?.projectId || null : c.projectId,
  };
  if (
    task.recurrence &&
    (!task.dueAt || !DateTime.now().setZone(task.recurrence.zone).isValid)
  )
    throw Error("RECURRENCE_DATE_REQUIRED");
  return store.transaction(() => {
    let saved = store.put("tasks", task);
    if (
      saved.done &&
      !prior?.done &&
      saved.recurrence &&
      !saved.nextOccurrenceId
    ) {
      const r = saved.recurrence;
      let next = DateTime.fromISO(saved.dueAt, { zone: r.zone });
      const delta =
        r.frequency === "weekly"
          ? { weeks: 1 }
          : r.frequency === "monthly"
            ? { months: 1 }
            : { days: 1 };
      // Anchor each occurrence to its scheduled local time; skip past occurrences.
      let jumps = 0;
      do {
        next = next.plus(delta);
        if (++jumps > 100000) throw Error("INVALID_RECURRENCE");
      } while (next.toMillis() <= now);
      const reminderOffset = saved.remindAt
        ? Date.parse(saved.dueAt) - Date.parse(saved.remindAt)
        : null;
      const followup = store.put("tasks", {
        ...saved,
        id: undefined,
        done: false,
        status: "todo",
        nextOccurrenceId: undefined,
        criteriaReviews: undefined,
        verification: undefined,
        repeatFromId: saved.id,
        seriesId: saved.seriesId || saved.id,
        dueAt: next.toUTC().toISO(),
        remindAt:
          reminderOffset === null
            ? null
            : new Date(next.toMillis() - reminderOffset).toISOString(),
        notifiedFor: undefined,
        subtasks: saved.subtasks?.map((s: any) => ({ ...s, done: false })),
      });
      saved = store.put("tasks", { ...saved, nextOccurrenceId: followup.id });
    }
    return saved;
  });
}

export function dueTasks(store: Store, now = Date.now()): Row[] {
  const ready: Row[] = [];
  for (const task of store.all("tasks")) {
    const at = task.remindAt || task.dueAt;
    if (
      task.done ||
      task.status === "done" ||
      !at ||
      Date.parse(at) > now ||
      task.notifiedFor === at
    )
      continue;
    const item = store.put("inbox", {
      title: hostFormat(store, "تذكير: {0}", [task.title]),
      body:
        task.description ||
        hostText(store, "حان موعد المهمة. افتح صفحة المهام لمتابعتها."),
      taskId: task.id,
      createdAt: new Date(now).toISOString(),
    });
    store.put("tasks", { ...task, notifiedFor: at });
    store.audit("task.reminded", { taskId: task.id, inboxId: item.id });
    ready.push(item);
  }
  const day = DateTime.fromMillis(now, { zone: "Asia/Baghdad" }).toISODate()!;
  const overdue = store
    .all("tasks")
    .filter(
      (t) =>
        !t.done &&
        t.status !== "done" &&
        t.dueAt &&
        DateTime.fromISO(t.dueAt, { zone: "Asia/Baghdad" }).toISODate()! <
          day &&
        !ready.some((x) => x.taskId === t.id),
    );
  if (overdue.length && store.setting("tasks.overdueReviewDay") !== day) {
    store.transaction(() => {
      const item = store.put("inbox", {
        kind: "overdue-review",
        title: hostFormat(store, "مراجعة المهام المتأخرة ({0})", [
          overdue.length,
        ]),
        body: overdue
          .slice(0, 20)
          .map((t) => t.title)
          .join("\n"),
        taskIds: overdue.map((t) => t.id),
        createdAt: new Date(now).toISOString(),
      });
      store.setting("tasks.overdueReviewDay", day);
      store.audit("tasks.overdue-reviewed", {
        date: day,
        count: overdue.length,
        inboxId: item.id,
      });
      ready.push(item);
    });
  }
  return ready;
}
