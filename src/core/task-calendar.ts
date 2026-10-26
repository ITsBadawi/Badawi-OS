import { DateTime } from "luxon";

export function taskCalendar(
  rows: any[],
  start: string,
  count: number,
  zone: string,
) {
  const first = DateTime.fromISO(start, { zone }).startOf("day");
  if (!first.isValid || !Number.isInteger(count) || count < 1 || count > 42)
    throw Error("INVALID_CALENDAR_RANGE");
  return {
    days: Array.from({ length: count }, (_, i) => {
      const day = first.plus({ days: i }),
        date = day.toISODate()!;
      return {
        date,
        tasks: rows
          .filter(
            (t) =>
              t.dueAt &&
              DateTime.fromISO(t.dueAt, { zone }).toISODate() === date,
          )
          .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)),
      };
    }),
    undated: rows.filter((t) => !t.dueAt),
  };
}
