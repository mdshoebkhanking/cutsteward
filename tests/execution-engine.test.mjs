import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAdapterRegistry,
  createExecutionEngine,
  createInMemoryAdapter,
  createJsonExecutionStorage,
  createLocalFakeAdapter,
  EXECUTION_JOURNAL_FILE,
  EXECUTION_SNAPSHOT_FILE,
} from "../server/execution/index.mjs";

const persistAuthority = {
  actorId: "test-host",
  grants: ["persist"],
};
const approvalAuthority = {
  actorId: "local-user",
  grants: ["persist", "approve"],
};
const executionAuthority = {
  actorId: "test-runner",
  grants: ["persist", "submit", "reconcile"],
};
const submitOnlyAuthority = {
  actorId: "test-runner",
  grants: ["persist", "submit"],
};
const cancellationAuthority = {
  actorId: "local-user",
  grants: ["persist", "cancel"],
};

function testClock() {
  let current = Date.parse("2026-08-08T10:00:00.000Z");
  return () => {
    current += 1_000;
    return new Date(current);
  };
}

async function runDirectory(name) {
  return mkdtemp(path.join(tmpdir(), `framepilot-execution-${name}-`));
}

function directorPlan(jobs, approvalIds = []) {
  return {
    planHash: createHash("sha256").update(JSON.stringify(jobs)).digest("hex"),
    approvals: approvalIds.map((id) => ({ id, required: true, scope: `Exact scope for ${id}` })),
    execution: { jobs },
  };
}

function exactOutput(request, role) {
  const contents = JSON.stringify({
    jobId: request.job.id,
    role,
    submissionKey: request.submissionKey,
  });
  return {
    role,
    relativePath: `outputs/${request.job.id}/${role}.json`,
    sha256: createHash("sha256").update(contents).digest("hex"),
    bytes: Buffer.byteLength(contents),
    mediaType: "application/json",
  };
}

function engineWith(adapterList, storage = createJsonExecutionStorage()) {
  return createExecutionEngine({
    storage,
    adapters: createAdapterRegistry(adapterList),
    clock: testClock(),
  });
}

describe("deep execution engine", () => {
  it("materializes a Director DAG and runs only dependency-ready work to exact receipts", async () => {
    const directory = await runDirectory("success");
    const local = createLocalFakeAdapter({ id: "local.worker" });
    const engine = engineWith([local]);
    const plan = directorPlan([
      {
        id: "research",
        laneId: "planning",
        selected: true,
        adapterCandidates: ["local.worker"],
        dependsOn: [],
        approvalIds: ["brief-approved"],
        outputRoles: ["research_packet"],
      },
      {
        id: "edit",
        laneId: "editing",
        selected: true,
        adapterCandidates: ["local.worker"],
        dependsOn: ["research"],
        approvalIds: [],
        outputRoles: ["preview_media"],
      },
    ], ["brief-approved"]);

    let snapshot = await engine.materialize({
      runId: "success-run",
      runDirectory: directory,
      directorPlan: plan,
      authority: persistAuthority,
    });

    expect(Object.keys(engine).sort()).toEqual(["command", "inspect", "materialize"]);
    expect(snapshot.jobs.map((job) => [job.id, job.state])).toEqual([
      ["research", "blocked_approval"],
      ["edit", "waiting_dependencies"],
    ]);

    snapshot = await engine.command({
      runDirectory: directory,
      authority: approvalAuthority,
      command: {
        type: "approve",
        approvals: [{ id: "brief-approved", decision: "grant", scopeHash: snapshot.scopeHash }],
      },
    });
    expect(snapshot.runnableJobIds).toEqual(["research"]);

    snapshot = await engine.command({
      runDirectory: directory,
      authority: executionAuthority,
      command: { type: "advance" },
    });
    expect(snapshot.jobs.find((job) => job.id === "research").state).toBe("succeeded");
    expect(snapshot.jobs.find((job) => job.id === "edit").state).toBe("runnable");
    expect(local.activity.submissions.map((entry) => entry.jobId)).toEqual(["research"]);

    snapshot = await engine.command({
      runDirectory: directory,
      authority: executionAuthority,
      command: { type: "advance" },
    });
    expect(snapshot.status).toBe("succeeded");
    expect(snapshot.receipts.map((receipt) => receipt.jobId)).toEqual(["research", "edit"]);
    for (const receipt of snapshot.receipts) {
      expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.outputs[0]).toMatchObject({
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        bytes: expect.any(Number),
        relativePath: expect.stringMatching(/^execution-output\//),
      });
    }
  });

  it("keeps retries bounded and fallbacks inside the materialized strategy", async () => {
    const directory = await runDirectory("fallback");
    const primary = createInMemoryAdapter({
      id: "provider.primary",
      scenarios: [
        { submit: { status: "failed", retryable: true, reasonCode: "TRANSIENT" } },
        { submit: { status: "failed", retryable: false, reasonCode: "ROUTE_REJECTED" } },
      ],
    });
    const fallback = createLocalFakeAdapter({ id: "local.fallback" });
    const engine = engineWith([primary, fallback]);
    const plan = directorPlan([{
      id: "render",
      laneId: "render-strategy",
      selected: true,
      strategy: {
        id: "render-strategy",
        routes: [
          { adapterId: "provider.primary", maxAttempts: 2 },
          { adapterId: "local.fallback", maxAttempts: 1 },
        ],
      },
      maxAttempts: 3,
      dependsOn: [],
      approvalIds: [],
      outputRoles: ["master_media"],
    }]);

    await engine.materialize({
      runId: "fallback-run",
      runDirectory: directory,
      directorPlan: plan,
      authority: persistAuthority,
    });
    await engine.command({ runDirectory: directory, authority: executionAuthority, command: { type: "advance" } });
    await engine.command({ runDirectory: directory, authority: executionAuthority, command: { type: "advance" } });
    const snapshot = await engine.command({
      runDirectory: directory,
      authority: executionAuthority,
      command: { type: "advance" },
    });

    const render = snapshot.jobs[0];
    expect(render.state).toBe("succeeded");
    expect(render.attempts).toHaveLength(3);
    expect(render.attempts.map((attempt) => attempt.adapterId)).toEqual([
      "provider.primary",
      "provider.primary",
      "local.fallback",
    ]);
    expect(new Set(render.attempts.map((attempt) => attempt.strategyId))).toEqual(new Set(["render-strategy"]));
    expect(primary.activity.submissions).toHaveLength(2);
    expect(fallback.activity.submissions).toHaveLength(1);

    const escapedPlan = directorPlan([{
      id: "escaped",
      laneId: "safe-strategy",
      strategy: {
        id: "safe-strategy",
        routes: [{ adapterId: "local.fallback", strategyId: "other-strategy" }],
      },
      dependsOn: [],
      outputRoles: [],
    }]);
    await expect(engine.materialize({
      runId: "escaped-run",
      runDirectory: await runDirectory("escaped"),
      directorPlan: escapedPlan,
      authority: persistAuthority,
    })).rejects.toMatchObject({ code: "EXECUTION_STRATEGY_ESCAPE" });
  });

  it("blocks adapter submission until every exact approval prerequisite is granted", async () => {
    const directory = await runDirectory("approval");
    const adapter = createLocalFakeAdapter({ id: "local.approval-worker" });
    const engine = engineWith([adapter]);
    const plan = directorPlan([{
      id: "licensed-download",
      laneId: "acquisition",
      adapterCandidates: ["local.approval-worker"],
      dependsOn: [],
      approvalIds: ["license-approved"],
      outputRoles: ["asset_manifest"],
    }], ["license-approved"]);

    const materialized = await engine.materialize({
      runId: "approval-run",
      runDirectory: directory,
      directorPlan: plan,
      authority: persistAuthority,
    });
    const afterAdvance = await engine.command({
      runDirectory: directory,
      authority: executionAuthority,
      command: { type: "advance", maxJobs: 4 },
    });

    expect(materialized.status).toBe("needs_approval");
    expect(afterAdvance.jobs[0].state).toBe("blocked_approval");
    expect(afterAdvance.receipts).toEqual([]);
    expect(adapter.activity.submissions).toEqual([]);
  });

  it("holds ambiguous submissions as unknown and reconciles without resubmitting or falling back", async () => {
    const directory = await runDirectory("unknown");
    const uncertain = createInMemoryAdapter({
      id: "provider.uncertain",
      scenarios: [{
        submit: { status: "unknown", reasonCode: "NETWORK_LOST" },
        reconcile: [
          { status: "unknown", reasonCode: "HISTORY_PENDING" },
          (request) => ({
            status: "succeeded",
            externalId: "provider-job-42",
            outputs: [exactOutput(request, "generated_media")],
          }),
        ],
      }],
    });
    const forbiddenFallback = createLocalFakeAdapter({ id: "local.must-not-run" });
    const engine = engineWith([uncertain, forbiddenFallback]);
    const plan = directorPlan([{
      id: "generation",
      laneId: "generation",
      strategy: {
        id: "generation",
        routes: ["provider.uncertain", "local.must-not-run"],
      },
      dependsOn: [],
      approvalIds: [],
      outputRoles: ["generated_media"],
    }]);

    await engine.materialize({
      runId: "unknown-run",
      runDirectory: directory,
      directorPlan: plan,
      authority: persistAuthority,
    });
    let snapshot = await engine.command({
      runDirectory: directory,
      authority: executionAuthority,
      command: { type: "advance" },
    });
    expect(snapshot.jobs[0].state).toBe("unknown");

    snapshot = await engine.command({
      runDirectory: directory,
      authority: submitOnlyAuthority,
      command: { type: "advance", maxJobs: 4 },
    });
    expect(snapshot.jobs[0].state).toBe("unknown");
    expect(uncertain.activity.submissions).toHaveLength(1);
    expect(forbiddenFallback.activity.submissions).toHaveLength(0);

    snapshot = await engine.command({
      runDirectory: directory,
      authority: executionAuthority,
      command: { type: "reconcile" },
    });
    expect(snapshot.jobs[0].state).toBe("unknown");
    snapshot = await engine.command({
      runDirectory: directory,
      authority: executionAuthority,
      command: { type: "reconcile" },
    });
    expect(snapshot.status).toBe("succeeded");
    expect(snapshot.jobs[0].receipt.externalId).toBe("provider-job-42");
    expect(uncertain.activity.submissions).toHaveLength(1);
    expect(uncertain.activity.reconciliations).toHaveLength(2);
    expect(forbiddenFallback.activity.submissions).toHaveLength(0);
  });

  it("resumes from JSON snapshot/journal and preserves submission idempotency", async () => {
    const directory = await runDirectory("resume");
    const provider = createInMemoryAdapter({
      id: "provider.resumable",
      scenarios: [{
        submit: { status: "accepted", externalId: "provider-job-resume" },
        reconcile: (request) => ({
          status: "succeeded",
          externalId: "provider-job-resume",
          outputs: [exactOutput(request, "source_media")],
        }),
      }],
    });
    const registry = createAdapterRegistry([provider]);
    const firstEngine = createExecutionEngine({
      storage: createJsonExecutionStorage(),
      adapters: registry,
      clock: testClock(),
    });
    const plan = directorPlan([{
      id: "resumable-job",
      laneId: "provider-work",
      adapterCandidates: ["provider.resumable"],
      dependsOn: [],
      approvalIds: [],
      outputRoles: ["source_media"],
    }]);

    const first = await firstEngine.materialize({
      runId: "resume-run",
      runDirectory: directory,
      directorPlan: plan,
      authority: persistAuthority,
    });
    const accepted = await firstEngine.command({
      runDirectory: directory,
      authority: executionAuthority,
      command: { type: "advance" },
    });
    expect(accepted.jobs[0].state).toBe("accepted");

    const resumedEngine = createExecutionEngine({
      storage: createJsonExecutionStorage(),
      adapters: registry,
      clock: testClock(),
    });
    const rematerialized = await resumedEngine.materialize({
      runId: "resume-run",
      runDirectory: directory,
      directorPlan: plan,
      authority: persistAuthority,
    });
    expect(rematerialized.revision).toBe(accepted.revision);
    expect(rematerialized.scopeHash).toBe(first.scopeHash);

    let completed = await resumedEngine.command({
      runDirectory: directory,
      authority: executionAuthority,
      command: { type: "advance" },
    });
    completed = await resumedEngine.command({
      runDirectory: directory,
      authority: executionAuthority,
      command: { type: "advance", maxJobs: 4 },
    });
    expect(completed.status).toBe("succeeded");
    expect(provider.activity.submissions).toHaveLength(1);
    expect(provider.activity.reconciliations).toHaveLength(1);

    const snapshotFile = JSON.parse(
      await readFile(path.join(directory, EXECUTION_SNAPSHOT_FILE), "utf8"),
    );
    const journalLines = (await readFile(path.join(directory, EXECUTION_JOURNAL_FILE), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(snapshotFile.revision).toBe(completed.revision);
    expect(journalLines.at(-1).snapshot.revision).toBe(completed.revision);
    expect(journalLines.map((entry) => entry.sequence)).toEqual(
      [...journalLines.keys()],
    );
  });

  it("records cancellation intent before calling the adapter and confirms cancellation durably", async () => {
    const directory = await runDirectory("cancel");
    const provider = createInMemoryAdapter({
      id: "provider.cancellable",
      scenarios: [{
        submit: { status: "running", externalId: "provider-job-cancel" },
        cancel: { status: "cancelled" },
      }],
    });
    const engine = engineWith([provider]);
    const plan = directorPlan([{
      id: "long-render",
      laneId: "render",
      adapterCandidates: ["provider.cancellable"],
      dependsOn: [],
      approvalIds: [],
      outputRoles: ["master_media"],
    }]);

    await engine.materialize({
      runId: "cancel-run",
      runDirectory: directory,
      directorPlan: plan,
      authority: persistAuthority,
    });
    const running = await engine.command({
      runDirectory: directory,
      authority: executionAuthority,
      command: { type: "advance" },
    });
    expect(running.jobs[0].state).toBe("running");

    const cancelled = await engine.command({
      runDirectory: directory,
      authority: cancellationAuthority,
      command: { type: "cancel" },
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.jobs[0]).toMatchObject({
      state: "cancelled",
      cancellationRequested: true,
      cancellationKey: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(provider.activity.cancellations).toHaveLength(1);

    const journal = (await readFile(path.join(directory, EXECUTION_JOURNAL_FILE), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const requestIndex = journal.findIndex((entry) => entry.event.type === "cancellation_requested");
    const observedIndex = journal.findIndex((entry) => entry.event.type === "cancellation_observed");
    expect(requestIndex).toBeGreaterThanOrEqual(0);
    expect(observedIndex).toBeGreaterThan(requestIndex);
  });
});
