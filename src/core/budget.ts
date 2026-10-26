import { randomUUID } from "node:crypto";
import { Store } from "./store.ts";
import type { ProviderRequest, Generation } from "./providers.ts";
export type Prices = {
  dailyUSD: number;
  inputPerMillion: number;
  outputPerMillion: number;
  date: string;
};
export type Reservation = { key: string; id: string } | null;
export class Budget {
  constructor(private store: Store) {}
  view(provider: string) {
    const v = this.store.setting(
      `budget.${provider}.${new Date().toISOString().slice(0, 10)}`,
    ) || { entries: [] };
    return {
      ...v,
      heldUSD:
        v.entries.reduce(
          (n: number, e: any) => n + (e.actualMicro === null ? e.heldMicro : 0),
          0,
        ) / 1e6,
      spentUSD:
        v.entries.reduce((n: number, e: any) => n + (e.actualMicro || 0), 0) /
        1e6,
    };
  }
  reserve(req: ProviderRequest, prices?: Prices | null): Reservation {
    if (!prices) return null;
    const key = `budget.${req.provider}.${new Date().toISOString().slice(0, 10)}`,
      ledger = this.store.setting(key) || { entries: [] };
    // UTF-8 bytes plus a fixed overhead deliberately overestimate text input; no cache discount assumed.
    const inputBound = Buffer.byteLength(JSON.stringify(req), "utf8") + 4096;
    const heldMicro = Math.ceil(
      inputBound * prices.inputPerMillion +
        req.maxTokens * prices.outputPerMillion,
    );
    const committed = ledger.entries.reduce(
      (n: number, e: any) =>
        n + (e.actualMicro === null ? e.heldMicro : e.actualMicro),
      0,
    );
    if (committed + heldMicro > Math.floor(prices.dailyUSD * 1e6))
      throw Error("DAILY_SPEND_LIMIT");
    const id = randomUUID();
    ledger.entries.push({
      id,
      model: req.model,
      heldMicro,
      actualMicro: null,
      inputPrice: prices.inputPerMillion,
      outputPrice: prices.outputPerMillion,
      pricingDate: prices.date,
    });
    this.store.setting(key, ledger);
    return { key, id };
  }
  settle(reservation: Reservation, usage: Generation["usage"]) {
    if (!reservation || !usage) return;
    const ledger = this.store.setting(reservation.key),
      entry = ledger?.entries.find((e: any) => e.id === reservation.id);
    if (!entry || entry.actualMicro !== null) return;
    // Counting thought separately is conservative even if a provider includes it in output totals.
    entry.actualMicro = Math.ceil(
      usage.input * entry.inputPrice +
        (usage.output + usage.thought) * entry.outputPrice,
    );
    this.store.setting(reservation.key, ledger);
  }
}
