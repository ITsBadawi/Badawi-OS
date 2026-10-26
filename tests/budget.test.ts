import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/core/store.ts";
import { Budget } from "../src/core/budget.ts";
test("unknown usage keeps its reservation and blocks a request that would exceed the chosen cap", () => {
  const s = new Store(":memory:"),
    b = new Budget(s);
  try {
    const prices = {
      dailyUSD: 0.01,
      inputPerMillion: 1,
      outputPerMillion: 10,
      date: "2026-10-21",
    };
    const req = {
      provider: "gemini" as const,
      model: "gemini-3.8-flash",
      prompt: "hello",
      maxTokens: 512,
    };
    b.reserve(req, prices);
    assert.throws(() => b.reserve(req, prices), /DAILY_SPEND_LIMIT/);
    assert.ok(b.view("gemini").heldUSD > 0);
  } finally {
    s.close();
  }
});
test("settled actual usage releases unused reservation while retaining pricing provenance", () => {
  const s = new Store(":memory:"),
    b = new Budget(s);
  try {
    const req = {
      provider: "gemini" as const,
      model: "gemini-3.8-flash",
      prompt: "hello",
      maxTokens: 512,
    };
    const r = b.reserve(req, {
      dailyUSD: 1,
      inputPerMillion: 1,
      outputPerMillion: 10,
      date: "2026-10-21",
    });
    b.settle(r, { input: 100, output: 20, thought: 5 });
    const v = b.view("gemini");
    assert.equal(v.heldUSD, 0);
    assert.equal(v.spentUSD, 0.00035);
    assert.equal(v.entries[0].pricingDate, "2026-10-21");
  } finally {
    s.close();
  }
});
