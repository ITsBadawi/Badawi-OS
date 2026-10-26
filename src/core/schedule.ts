import { DateTime, IANAZone } from "luxon";
import type { Condition } from "./conditions.ts";
export type Trigger =
  | { type: "condition"; condition: Condition; checkEveryMinutes: number }
  | { type: "manual" }
  | { type: "event"; event: string; projectId?: string }
  | { type: "once"; at: string }
  | { type: "daily" | "weekly"; time: string; zone: string; weekday?: number };
export function nextOccurrence(trigger: Trigger, after: string): string | null {
  const start = DateTime.fromISO(after, { setZone: true });
  if (!start.isValid) throw Error("SCHEDULE_DATE");
  if (
    trigger.type === "manual" ||
    trigger.type === "event" ||
    trigger.type === "condition"
  )
    return null;
  if (trigger.type === "once") {
    const date = DateTime.fromISO(trigger.at, { setZone: true });
    if (!date.isValid || !/[zZ]|[+-]\d\d:\d\d$/.test(trigger.at))
      throw Error("SCHEDULE_DATE");
    return date.toMillis() > start.toMillis() ? date.toUTC().toISO() : null;
  }
  if (
    !IANAZone.isValidZone(trigger.zone) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(trigger.time) ||
    (trigger.type === "weekly" &&
      (!trigger.weekday || trigger.weekday < 1 || trigger.weekday > 7))
  )
    throw Error("SCHEDULE_INVALID");
  const [hour, minute] = trigger.time.split(":").map(Number);
  const local = start.setZone(trigger.zone).startOf("day");
  for (let i = 0; i < 9; i++) {
    const day = local.plus({ days: i });
    if (trigger.type === "weekly" && day.weekday !== trigger.weekday) continue;
    const candidate = DateTime.fromObject(
      { year: day.year, month: day.month, day: day.day, hour, minute },
      { zone: trigger.zone },
    );
    if (candidate.hour !== hour || candidate.minute !== minute) continue;
    const first = candidate
      .getPossibleOffsets()
      .sort((a, b) => a.toMillis() - b.toMillis())[0];
    if (first.toMillis() > start.toMillis()) return first.toUTC().toISO();
  }
  throw Error("SCHEDULE_RANGE");
}
export function previewSchedule(
  trigger: Trigger,
  after = new Date().toISOString(),
) {
  const dates: string[] = [];
  let cursor = after;
  for (let i = 0; i < 3; i++) {
    const next = nextOccurrence(trigger, cursor);
    if (!next) break;
    dates.push(next);
    cursor = next;
  }
  return dates;
}
