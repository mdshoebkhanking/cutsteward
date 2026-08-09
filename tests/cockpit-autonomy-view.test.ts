import { afterEach, describe, expect, it, vi } from "vitest";
import {
  projectExecutionControls,
  requiresExactProposal,
  supervisedBrowserProfileId,
  validateSupervisedBrowserAddress
} from "../src/components/ProductionCockpit";
import { api } from "../src/lib/api";
import type { ExecutionJob, ExecutionJobState, ExecutionSnapshot } from "../src/types";

afterEach(() => vi.unstubAllGlobals());

function job(state: ExecutionJobState): ExecutionJob {
  return {
    id: "research-rights",
    laneId: "research",
    dependsOn: [],
    approvalIds: [],
    outputRoles: ["research_packet"],
    payload: {},
    strategy: { id: "local-first", routes: [{ adapterId: "local-agent-research", strategyId: "local", maxAttempts: 1 }] },
    maxAttempts: 1,
    attempts: [],
    exhaustedRouteIndexes: [],
    state,
    lastError: null,
    receipt: null,
    cancellationRequested: false,
    cancellationKey: null
  };
}

function execution(overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot {
  return {
    schemaVersion: 1,
    runId: "run-one",
    scopeHash: "scope-hash",
    directorPlanHash: "plan-hash",
    status: "active",
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:00.000Z",
    revision: 1,
    dagOrder: ["research-rights"],
    jobs: [job("runnable")],
    approvals: [],
    receipts: [],
    runnableJobIds: ["research-rights"],
    cancelRequestedAt: null,
    cancelledBy: null,
    ...overrides
  };
}

describe("cockpit autonomy controls", () => {
  it("requires a verified live connection before scheduling", () => {
    expect(projectExecutionControls(null, false)).toMatchObject({ canSchedule: false, canStop: false });
    expect(projectExecutionControls(null, true)).toMatchObject({ canSchedule: true, canStop: false });
  });

  it("keeps pending exact proposals from being scheduled", () => {
    const projected = projectExecutionControls(execution({
      status: "needs_approval",
      approvals: [{ id: "generation-spend", scope: "One preview up to $4", status: "pending", actorId: null, scopeHash: null, evidenceHash: null, decidedAt: null }]
    }), true);
    expect(projected.canSchedule).toBe(false);
    expect(projected.pendingApprovals).toBe(1);
    expect(projected.scheduleReason).toContain("exact proposal");
  });

  it("allows dependency-safe earlier work while future provider approvals remain pending", () => {
    const projected = projectExecutionControls(execution({
      status: "active",
      approvals: [{ id: "generation-spend", scope: "Future Veo pilot", status: "pending", actorId: null, scopeHash: null, evidenceHash: null, decidedAt: null }]
    }), true);
    expect(projected.canSchedule).toBe(true);
    expect(projected.pendingApprovals).toBe(1);
  });

  it("offers reconciliation only for unsettled provider state", () => {
    expect(projectExecutionControls(execution({ jobs: [job("unknown")] }), true)).toMatchObject({ canReconcile: true, canCancel: true });
    expect(projectExecutionControls(execution({ status: "succeeded", jobs: [job("succeeded")] }), true)).toMatchObject({ canSchedule: false, canStop: false, canReconcile: false, canCancel: false });
  });

  it("recognizes actions that need a separate exact proposal", () => {
    expect(requiresExactProposal({ title: "Upload the master" })).toBe(true);
    expect(requiresExactProposal({ detail: "Spend four credits and publish" })).toBe(true);
    expect(requiresExactProposal({ detail: "Use the approved voice clone" })).toBe(true);
    expect(requiresExactProposal({ title: "Read the local storyboard" })).toBe(false);
  });
});

describe("supervised browser input projection", () => {
  it("accepts only credential-free HTTP(S) destinations and drops fragments", () => {
    expect(validateSupervisedBrowserAddress("https://example.com/path#private-fragment")).toEqual({ valid: true, url: "https://example.com/path", error: "" });
    expect(validateSupervisedBrowserAddress("https://user:secret@example.com").valid).toBe(false);
    expect(validateSupervisedBrowserAddress("file:///tmp/source.mov").valid).toBe(false);
    expect(validateSupervisedBrowserAddress("example.com").valid).toBe(false);
  });

  it("derives a stable profile identifier without path separators", () => {
    const profileId = supervisedBrowserProfileId("run id/../../launch");
    expect(profileId).toBe("run-run-id-..-..-launch");
    expect(profileId).not.toMatch(/[\\/]/);
    expect(profileId.length).toBeLessThanOrEqual(128);
  });
});

describe("autonomy API requests", () => {
  it("sends constrained browser actions through same-origin fetch without a real network call", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ session: null, result: { kind: "navigate", url: "https://example.com/", title: "Example" } })
    } as Response));
    vi.stubGlobal("fetch", fetchMock);

    await api.navigateSupervisedBrowser("run/one", "https://example.com/");

    expect(fetchMock).toHaveBeenCalledWith("/api/runs/run%2Fone/browser", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ operation: "act", action: { kind: "navigate", url: "https://example.com/" } })
    }));
  });

  it("inspects and approves only the exact provider action hash", async () => {
    const actionHash = "a".repeat(64);
    const payload = {
      providerAction: {
        schemaVersion: 1,
        readiness: "approval-required",
        ready: false,
        blocker: null,
        proposal: { actionHash },
        approval: { status: "required" }
      }
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => payload
    } as Response));
    vi.stubGlobal("fetch", fetchMock);

    await api.inspectProviderAction("run/one", "voice-timing");
    await api.approveProviderAction("run/one", "voice-timing", actionHash);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/runs/run%2Fone/provider-actions/voice-timing");
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/runs/run%2Fone/provider-actions/voice-timing",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ actionHash, confirmed: true })
      })
    ]);
  });
});
