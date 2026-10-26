import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDraft } from "../src/core/plans.ts";
test("retry drafts are bounded proposals for integration reads only and never activate consent",()=>{
  const base={name:"Monitor",kind:"integration",integration:"vercel",projectId:"p",trigger:{type:"manual"},retry:{maxAttempts:3,delaySeconds:30}};
  const draft=parseDraft(JSON.stringify(base),[],["p"]);
  assert.equal(draft.enabled,false);
  assert.deepEqual(draft.retry,base.retry);
  assert.ok(!("allowBackgroundIntegration" in draft));
  assert.throws(()=>parseDraft(JSON.stringify({...base,kind:"reminder"}),[],["p"]),/INVALID_AUTOMATION_DRAFT/);
  assert.throws(()=>parseDraft(JSON.stringify({...base,retry:{maxAttempts:4,delaySeconds:30}}),[],["p"]),/INVALID_AUTOMATION_DRAFT/);
  assert.equal(parseDraft(JSON.stringify({...base,retry:null}),[],["p"]).retry,undefined);
});
test("conditional automation drafts canonicalize nullable scope without enabling or widening an unknown project", () => {
  const make = (projectId: string | null) =>
    JSON.stringify({
      name: "Overdue notice",
      kind: "reminder",
      message: "Review overdue work",
      noteIds: [],
      projectId: null,
      missedPolicy: "skip",
      trigger: {
        type: "condition",
        checkEveryMinutes: 5,
        condition: { kind: "tasks.overdue", minCount: 2, projectId },
      },
    });
  const global = parseDraft(make(null), [], []);
  assert.equal(global.enabled, false);
  assert.equal(global.trigger.type, "condition");
  if (global.trigger.type === "condition") {
    assert.equal(global.trigger.condition.projectId, undefined);
    assert.equal(global.trigger.checkEveryMinutes, 5);
  }
  assert.throws(
    () => parseDraft(make("unknown"), [], []),
    /DRAFT_SOURCE_DENIED/,
  );
  const scoped = parseDraft(make("p"), [], ["p"]);
  assert.equal(scoped.enabled, false);
  assert.equal(scoped.trigger.type, "condition");
});
test("schema-required null and empty fields cannot widen the canonical reminder draft", () => {
  const d = parseDraft(
    JSON.stringify({
      name: "Review",
      kind: "reminder",
      message: "Review notes",
      noteIds: [],
      projectId: null,
      trigger: { type: "daily", time: "18:00", zone: "Asia/Baghdad" },
      missedPolicy: "skip",
    }),
    [],
    [],
  );
  assert.equal(d.kind, "reminder");
  assert.equal(d.projectId, undefined);
  assert.equal(d.noteIds, undefined);
  assert.equal(d.enabled, false);
});
test("a real provider draft omitting missedPolicy receives the safe skip default", () => {
  const draft = parseDraft(
    '```json\n{"name":"Daily Notes Review","kind":"reminder","message":"Review notes","trigger":{"type":"daily","time":"18:00","zone":"Asia/Baghdad"}}\n```',
    [],
    [],
  );
  assert.equal(draft.missedPolicy, "skip");
  assert.equal(draft.enabled, false);
});
test("a model automation draft is validated and always disabled until reviewed", () => {
  const d = parseDraft(
    "```json\n" +
      JSON.stringify({
        name: "Evening",
        kind: "summary",
        noteIds: ["n1"],
        trigger: { type: "daily", time: "18:00", zone: "Asia/Baghdad" },
        missedPolicy: "skip",
      }) +
      "\n```",
    ["n1"],
    [],
  );
  assert.equal(d.enabled, false);
  assert.equal(d.kind, "summary");
});
test("model drafts cannot acquire a new source or inject executable tools", () => {
  assert.throws(
    () =>
      parseDraft(
        JSON.stringify({
          name: "Leak",
          kind: "summary",
          noteIds: ["other"],
          trigger: { type: "manual" },
          missedPolicy: "skip",
        }),
        ["n1"],
        [],
      ),
    /DRAFT_SOURCE_DENIED/,
  );
  assert.throws(
    () =>
      parseDraft(
        JSON.stringify({
          name: "Run",
          kind: "shell",
          command: "anything",
          trigger: { type: "manual" },
          missedPolicy: "skip",
        }),
        [],
        [],
      ),
    /INVALID_AUTOMATION_DRAFT/,
  );
  assert.throws(
    () =>
      parseDraft(
        JSON.stringify({
          name: "Run",
          kind: "reminder",
          message: "x",
          enabled: true,
          trigger: { type: "manual" },
          missedPolicy: "skip",
        }),
        [],
        [],
      ),
    /INVALID_AUTOMATION_DRAFT/,
  );
});
