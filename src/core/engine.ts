import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { Store, type Row } from "./store.ts";
import { nextOccurrence } from "./schedule.ts";
import {
  readRetryPolicy,
  retryIdentity,
  transientReadFailure,
} from "./retry.ts";
import {
  queueConditions,
  conditionIdentity,
  conditionObservation,
} from "./conditions.ts";
export type Mode = "Running" | "Pause" | "Stop";
export class Engine extends EventEmitter {
  private mode: Mode = "Stop";
  private manualGaming = false;
  private automaticGaming = false;
  private epoch = 0;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private settlingUntil = 0;
  private closed = false;
  private get gaming() {
    return this.manualGaming || this.automaticGaming;
  }
  constructor(
    readonly store: Store,
    private execute: (job: Row, signal: AbortSignal) => Promise<unknown>,
  ) {
    super();
    const saved = store.setting("engine");
    this.manualGaming = saved?.gaming || false;
    for (const r of store.all("runs"))
      if (r.status === "retryWaiting")
        store.put("runs", {
          ...r,
          status: "needsReview",
          reason: "RETRY_RESTART_REVIEW",
          nextRetryAt: null,
        });
      else if (r.status === "running")
        store.put("runs", {
          ...r,
          status: "needsReview",
          reason: "interrupted",
        });
      else if (r.status === "queued")
        store.put("runs", { ...r, status: "blocked", reason: "restartReview" });
    this.persist();
    store.audit("app.started", { recovered: saved?.mode === "Running" });
  }
  snapshot() {
    const gaming = this.manualGaming || this.automaticGaming;
    return {
      mode: this.mode,
      gaming,
      gamingManual: this.manualGaming,
      gamingAutomatic: this.automaticGaming,
      epoch: this.epoch,
      active: this.controller ? 1 : 0,
      effective:
        this.controller && this.mode !== "Running"
          ? this.mode === "Stop"
            ? "Stopping"
            : "Pausing"
          : this.mode === "Stop"
            ? "Stopped"
            : this.mode === "Pause"
              ? "Paused"
              : "Running",
      gamingQuiescing: gaming && !!this.controller,
      timerActive: !!this.timer,
      settlingUntil: this.settlingUntil,
    };
  }
  private persist() {
    this.store.setting("engine", {
      mode: this.mode,
      gaming: this.manualGaming,
      epoch: this.epoch,
    });
  }
  private notify() {
    this.persist();
    this.emit("change");
  }
  private check(epoch: number) {
    if (epoch !== this.epoch) throw Error("STALE_STATE");
    if (this.closed) throw Error("ENGINE_CLOSED");
  }
  setMode(mode: Mode, epoch: number) {
    this.check(epoch);
    if (!["Running", "Pause", "Stop"].includes(mode))
      throw Error("INVALID_MODE");
    this.mode = mode;
    this.epoch++;
    if (mode !== "Running") this.controller?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.store.audit("engine.mode", { mode, epoch: this.epoch });
    this.notify();
    if (mode !== "Stop") this.arm();
    return this.snapshot();
  }
  cancelWork() {
    this.controller?.abort();
    this.epoch++;
    this.notify();
  }
  setGaming(enabled: boolean, epoch: number) {
    this.check(epoch);
    const wasGaming = this.manualGaming || this.automaticGaming;
    this.manualGaming = enabled;
    this.epoch++;
    const gaming = this.manualGaming || this.automaticGaming;
    if (gaming && !wasGaming) this.controller?.abort();
    if (!gaming && wasGaming) this.settlingUntil = Date.now() + 30000;
    this.store.audit("engine.gaming", { enabled, source: "manual" });
    this.notify();
    return this.snapshot();
  }
  setAutomaticGaming(enabled: boolean) {
    if (this.closed || this.automaticGaming === enabled) return this.snapshot();
    const wasGaming = this.manualGaming || this.automaticGaming;
    this.automaticGaming = enabled;
    this.epoch++;
    const gaming = this.manualGaming || this.automaticGaming;
    if (gaming && !wasGaming) this.controller?.abort();
    if (!gaming && wasGaming) this.settlingUntil = Date.now() + 30000;
    this.store.audit("engine.gaming", { enabled, source: "automatic" });
    this.notify();
    return this.snapshot();
  }
  private gate() {
    if (!this.store.verifyAudit()) throw Error("AUDIT_INTEGRITY");
    if (this.mode !== "Running") throw Error("ENGINE_STOPPED_OR_PAUSED");
    if (this.manualGaming || this.automaticGaming) throw Error("GAMING_ACTIVE");
    if (this.controller) throw Error("ENGINE_BUSY");
  }
  async runTask<T>(execute: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.gate();
    const control = new AbortController();
    this.controller = control;
    this.notify();
    try {
      const result = await execute(control.signal);
      control.signal.throwIfAborted();
      return result;
    } finally {
      this.controller = null;
      this.notify();
    }
  }
  async runNow(jobId: string) {
    this.gate();
    const job = this.store.get("jobs", jobId);
    if (!job) throw Error("JOB_NOT_FOUND");
    const occurrence = `manual:${randomUUID()}`;
    if (!this.store.enqueue(jobId, occurrence)) throw Error("RUN_QUEUE_FULL");
    for (const held of this.store
      .all("runs")
      .filter((r) => r.jobId === jobId && r.status === "retryWaiting")) {
      this.store.put("runs", {
        ...held,
        status: "cancelled",
        reason: "RETRY_SUPERSEDED",
        nextRetryAt: null,
      });
      this.store.audit("run.retrySuperseded", { runId: held.id });
    }
    return this.drain();
  }
  async resume(id: string) {
    this.gate();
    const run = this.store.get("runs", id);
    if (!run || run.status !== "blocked" || run.reason !== "catchupApproval")
      throw Error("RUN_NOT_RESUMABLE");
    this.store.put("runs", { ...run, status: "queued", reason: null });
    this.store.audit("run.catchupApproved", { id });
    return this.drain();
  }
  async resumeWorkflow(
    id: string,
    fromIndex: number,
    bindings: string[],
    fingerprint: string,
    acknowledgeUncertain: boolean,
  ) {
    this.gate();
    const run = this.store.get("runs", id),
      job = run ? this.store.get("jobs", run.jobId) : null;
    if (
      !run ||
      !job ||
      job.kind !== "workflow" ||
      !["failed", "cancelled", "needsReview", "blocked"].includes(run.status) ||
      !Number.isInteger(fromIndex) ||
      fromIndex < 0 ||
      fromIndex > job.steps?.length ||
      bindings.length !== job.steps.length ||
      (run.recoveryHistory?.length || 0) >= 3 ||
      !Array.isArray(run.steps) ||
      run.steps.slice(0, fromIndex).some((s: any) => s.status !== "succeeded")
    )
      throw Error("WORKFLOW_RECOVERY_UNAVAILABLE");
    const history = {
      reviewedAt: new Date().toISOString(),
      fromIndex,
      priorStatus: run.status,
      priorReason: run.reason || null,
      steps: run.steps,
      fingerprint,
      acknowledgeUncertain,
    };
    this.store.put("runs", {
      ...run,
      status: "queued",
      reason: null,
      finishedAt: null,
      alertedAt: null,
      resumeFrom: fromIndex,
      recoveryBindings: bindings,
      recoveryHistory: [...(run.recoveryHistory || []), history],
    });
    this.store.audit("workflow.recoveryApproved", {
      runId: id,
      fromIndex,
      acknowledgeUncertain,
    });
    return this.drain();
  }
  async tick(now = Date.now()) {
    if (this.mode === "Stop" || this.closed) return;
    if (
      this.mode === "Running" &&
      !this.gaming &&
      !this.controller &&
      now >= this.settlingUntil
    ) {
      for (const run of this.store
        .all("runs")
        .filter(
          (r) =>
            r.status === "retryWaiting" && Date.parse(r.nextRetryAt) <= now,
        )) {
        const job = this.store.get("jobs", run.jobId);
        if (
          !job ||
          job.disabledReason ||
          !readRetryPolicy(job) ||
          retryIdentity(this.store, job) !== run.retryIdentity
        ) {
          this.store.put("runs", {
            ...run,
            status: "cancelled",
            reason: "RETRY_SCOPE_CHANGED",
            nextRetryAt: null,
          });
          this.store.audit("run.retryRevoked", { runId: run.id });
        } else {
          this.store.put("runs", {
            ...run,
            status: "queued",
            nextRetryAt: null,
          });
          this.store.audit("run.retryDue", { runId: run.id });
        }
      }
    }
    if (
      this.mode === "Running" &&
      !this.gaming &&
      !this.controller &&
      now >= this.settlingUntil
    )
      queueConditions(this.store, now);
    for (const job of this.store.all("jobs")) {
      if (!job.enabled || !job.nextDueAt || Date.parse(job.nextDueAt) > now)
        continue;
      const due = job.nextDueAt;
      const late = now - Date.parse(due) > 60000;
      const blocked = this.mode !== "Running" || this.gaming;
      if (!late && !blocked) this.store.enqueue(job.id, due);
      else if (job.missedPolicy === "coalesceLatest") {
        // Search only a bounded 24h window, regardless of how long the app was off.
        let candidate = nextOccurrence(
          job.trigger,
          new Date(now - 86400000).toISOString(),
        );
        let latest: string | null = null;
        for (
          let i = 0;
          i < 3 && candidate && Date.parse(candidate) <= now;
          i++
        ) {
          latest = candidate;
          candidate = nextOccurrence(job.trigger, candidate);
        }
        for (const held of this.store.all("runs")) {
          if (
            held.jobId === job.id &&
            held.status === "blocked" &&
            held.reason === "catchupApproval" &&
            held.occurrence !== latest
          )
            this.store.put("runs", {
              ...held,
              status: "cancelled",
              reason: "supersededByLatest",
            });
        }
        if (latest)
          this.store.enqueue(job.id, latest, {
            status: "blocked",
            reason: "catchupApproval",
          });
        else
          this.store.audit("schedule.skipped", {
            jobId: job.id,
            reason: "outsideCatchupWindow",
          });
      } else
        this.store.audit("schedule.skipped", {
          jobId: job.id,
          reason: blocked ? "mode" : "missed",
        });
      this.store.put("jobs", {
        ...job,
        nextDueAt: nextOccurrence(job.trigger, new Date(now).toISOString()),
        lastEvaluatedAt: new Date(now).toISOString(),
      });
    }
    if (
      this.mode === "Running" &&
      !this.gaming &&
      !this.controller &&
      now >= this.settlingUntil
    )
      await this.drain(now);
    this.emit("change");
  }
  private arm() {
    if (this.closed || this.mode === "Stop") return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick()
        .catch(() => this.store.audit("engine.tickFailed"))
        .finally(() => this.arm());
    }, 15000);
    this.timer.unref();
  }
  private async drain(now = Date.now()) {
    if (this.controller || this.mode !== "Running" || this.gaming) return;
    const run = this.store
      .all("runs")
      .reverse()
      .find((r) => r.status === "queued");
    if (!run) return;
    const job = this.store.get("jobs", run.jobId);
    if (job && !job.enabled && !run.occurrence.startsWith("manual:")) {
      this.store.put("runs", {
        ...run,
        status: "cancelled",
        reason: "automationDisabled",
      });
      this.store.audit("run.cancelled", {
        id: run.id,
        reason: "automationDisabled",
      });
      return;
    }
    if (!job) {
      this.store.put("runs", {
        ...run,
        status: "cancelled",
        reason: "jobRemoved",
      });
      return;
    }
    if (
      run.retryIdentity &&
      retryIdentity(this.store, job) !== run.retryIdentity
    ) {
      this.store.put("runs", {
        ...run,
        status: "cancelled",
        reason: "RETRY_SCOPE_CHANGED",
        nextRetryAt: null,
      });
      this.store.audit("run.retryRevoked", { runId: run.id });
      this.notify();
      return;
    }
    const conditionRun = run.occurrence.startsWith("condition:"),
      isConditional = job.trigger?.type === "condition";
    const finalizing =
      job.kind === "workflow" &&
      Number.isInteger(run.resumeFrom) &&
      run.resumeFrom === job.steps?.length;
    const changed =
      !finalizing &&
      conditionRun &&
      (!isConditional ||
        !run.occurrence.startsWith(`condition:${conditionIdentity(job)}:`));
    const observation =
      isConditional && !finalizing
        ? conditionObservation(this.store, job.trigger.condition, now)
        : null;
    if (observation && !changed) {
      const key = `condition.${job.id}`,
        saved = this.store.setting(key),
        identity = conditionIdentity(job),
        previous = saved?.identity === identity ? saved : null;
      this.store.setting(key, {
        identity,
        sequence: Number.isSafeInteger(saved?.sequence) ? saved.sequence : 0,
        matched:
          observation.matched === null
            ? !!previous?.matched
            : observation.matched,
        observation,
      });
    }
    if (changed || (observation && observation.matched !== true)) {
      const reason = changed
        ? "CONDITION_CHANGED"
        : observation?.matched === false
          ? "CONDITION_NOT_MET"
          : "CONDITION_UNAVAILABLE";
      this.store.put("runs", {
        ...run,
        status: "skipped",
        reason,
        finishedAt: new Date().toISOString(),
        result: { skipped: true, verified: false, observation },
      });
      this.store.audit("run.skipped", { runId: run.id, reason });
      this.notify();
      return;
    }
    this.gate();
    const controller = new AbortController();
    const identity = retryIdentity(this.store, job);
    const attempts = [...(run.attempts || [])];
    const startedAt = new Date(Math.max(now, Date.now())).toISOString();
    const attempt = {
      number: attempts.length + 1,
      startedAt,
      status: "running",
      finishedAt: null as string | null,
      reason: null as string | null,
    };
    attempts.push(attempt);
    this.controller = controller;
    this.store.put("runs", {
      ...run,
      status: "running",
      startedAt,
      finishedAt: null,
      reason: null,
      attempts,
      epoch: this.epoch,
    });
    this.notify();
    try {
      const result = await this.execute(
        {
          ...job,
          _runId: run.id,
          ...(Number.isInteger(run.resumeFrom)
            ? {
                _resumeFrom: run.resumeFrom,
                _resumeSteps: run.steps?.slice(0, run.resumeFrom),
                _recoveryBindings: run.recoveryBindings,
              }
            : {}),
        },
        controller.signal,
      );
      controller.signal.throwIfAborted();
      attempt.status = "succeeded";
      attempt.finishedAt = new Date(Math.max(now, Date.now())).toISOString();
      this.store.put("runs", {
        ...this.store.get("runs", run.id),
        status: "succeeded",
        result,
        attempts,
        nextRetryAt: null,
        reason: null,
        resumeFrom: null,
        recoveryBindings: null,
        finishedAt: new Date().toISOString(),
      });
      this.store.audit("run.verified", { runId: run.id });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      const code = /^[A-Z][A-Z0-9_]{1,100}$/.test(raw)
        ? raw
        : "OPERATION_FAILED";
      const policy = readRetryPolicy(job);
      const current = this.store.get("jobs", job.id);
      const retry =
        !controller.signal.aborted &&
        !!policy &&
        transientReadFailure(code) &&
        attempts.length < policy.maxAttempts &&
        !!current &&
        !current.disabledReason &&
        retryIdentity(this.store, current) === identity;
      attempt.status = controller.signal.aborted ? "cancelled" : "failed";
      attempt.reason = controller.signal.aborted ? "userControl" : code;
      attempt.finishedAt = new Date(Math.max(now, Date.now())).toISOString();
      const finished = this.store.put("runs", {
        ...this.store.get("runs", run.id),
        status: retry
          ? "retryWaiting"
          : controller.signal.aborted
            ? "cancelled"
            : code === "WAITING_APPROVAL"
              ? "blocked"
              : "failed",
        reason: controller.signal.aborted ? "userControl" : code,
        attempts,
        ...(retry ? { retryIdentity: identity } : {}),
        nextRetryAt: retry
          ? new Date(
              Math.max(now, Date.now()) + policy!.delaySeconds * 1000,
            ).toISOString()
          : null,
        finishedAt: new Date().toISOString(),
      });
      this.store.audit("run.finished", {
        runId: run.id,
        status: finished.status,
      });
      if (retry)
        this.store.audit("run.retryScheduled", {
          runId: run.id,
          attempt: attempts.length,
          nextRetryAt: finished.nextRetryAt,
        });
      else this.emit("outcome", finished);
    } finally {
      this.controller = null;
      this.notify();
    }
  }
  close() {
    this.closed = true;
    this.mode = "Stop";
    this.epoch++;
    this.controller?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.notify();
  }
}
