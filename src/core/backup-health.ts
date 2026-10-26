import { hostFormat, hostText } from "./host-localization.ts";
import { DateTime } from "luxon";
import { Store } from "./store.ts";
export function backupExpiryReminder(store: Store, now = Date.now()) {
  const account = store.setting("drive.account");
  if (!account) return null;
  const expiry = store.setting(`backup.planExpiry.${account}`);
  if (!expiry) return null;
  const current = DateTime.fromMillis(now, { zone: "Asia/Baghdad" }).startOf(
      "day",
    ),
    date = DateTime.fromISO(expiry, { zone: "Asia/Baghdad" });
  if (!date.isValid) return null;
  const days = Math.round(date.diff(current, "days").days);
  if (days > 7) return null;
  const marker = `${expiry}:${current.toISODate()}`;
  if (store.setting(`backup.expiryNotified.${account}`) === marker) return null;
  return store.transaction(() => {
    const item = store.put("inbox", {
      kind: "backup-expiry",
      title:
        days < 0
          ? hostText(store, "راجع تجديد باقة Google Drive")
          : hostFormat(store, "تذكير باقة Google Drive: {0} أيام", [days]),
      body: hostFormat(
        store,
        "التاريخ الذي أدخلته لانتهاء الباقة: {0}. تحقق من اشتراكك وسعة التخزين في Google. هذا تذكير وفق إدخالك، وليس كشفاً تلقائياً للفوترة.",
        [expiry],
      ),
      createdAt: new Date(now).toISOString(),
    });
    store.setting(`backup.expiryNotified.${account}`, marker);
    store.audit("backup.expiryReminder", { date: expiry, inboxId: item.id });
    return item;
  });
}
