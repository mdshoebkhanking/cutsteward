import { describe, expect, it } from "vitest";
import { projectRuntimeConnection } from "../src/lib/runtime-connection";
import type { LiveSession, RuntimeStatus } from "../src/types";

function runtime(overrides: Partial<RuntimeStatus> = {}): RuntimeStatus {
  return {
    id: "codex",
    name: "Codex",
    status: "detected",
    presence: "detected",
    control: {
      mode: "live",
      state: "ready",
      adapterId: "codex.app-server",
      protocol: "codex-app-server",
      reason: null
    },
    executable: "codex",
    integration: "live-adapter",
    preferredAdapter: "codex-app-server-stdio",
    stability: "stable",
    capabilitiesToProbe: [],
    detail: "Found locally.",
    ...overrides
  };
}

function session(overrides: Partial<LiveSession> = {}): LiveSession {
  return {
    schemaVersion: 1,
    runId: "run-a",
    runtimeId: "codex",
    runtimeName: "Codex",
    adapterId: "codex.app-server",
    protocol: "codex-app-server",
    status: "connected",
    sessionId: "thread-1",
    activeTurnId: null,
    model: null,
    modelProvider: null,
    executableVersion: "codex-cli 1.0",
    executableHash: "a".repeat(64),
    connectedAt: "2026-08-08T20:00:00.000Z",
    lastEventAt: "2026-08-08T20:00:00.000Z",
    lastError: null,
    pendingApprovals: [],
    lastSequence: 1,
    lastEventHash: "b".repeat(64),
    updatedAt: "2026-08-08T20:00:00.000Z",
    resumeAvailable: true,
    ...overrides
  };
}

function project(agent: RuntimeStatus, live: LiveSession | null, runId: string | null = "run-a") {
  return projectRuntimeConnection({
    runtime: agent,
    session: live,
    activeRunId: runId,
    connectingRuntimeId: null,
    selected: agent.id === "codex"
  });
}

describe("runtime connection projection", () => {
  it("requires the matching run, runtime, connected state, and native session ID", () => {
    expect(project(runtime(), session())).toMatchObject({ label: "Connected", tone: "connected", action: null });
    expect(project(runtime(), session({ sessionId: null }))).toMatchObject({ label: "Connect", action: "connect" });
    expect(project(runtime(), session({ runId: "run-b" }))).toMatchObject({ label: "Connect", action: "connect" });
    expect(project(runtime(), session({ runtimeId: "claude" }))).toMatchObject({ label: "Connect", action: "connect" });
  });

  it("offers a retry without calling an old receipt connected", () => {
    expect(project(runtime(), session({ status: "disconnected", resumeAvailable: true })))
      .toMatchObject({ label: "Retry", tone: "failed", action: "connect" });
    expect(project(runtime(), session({ status: "failed", lastError: "Child exited" })))
      .toMatchObject({ label: "Retry", detail: "Child exited", action: "connect" });
  });

  it("keeps detected handoff-only agents pending and absent agents missing", () => {
    const claude = runtime({
      id: "claude",
      name: "Claude Code",
      control: { mode: "handoff", state: "ready", adapterId: null, protocol: null, reason: "direct-adapter-not-implemented" },
      integration: "handoff-only"
    });
    const hermes = runtime({
      id: "hermes",
      name: "Hermes",
      status: "not-detected",
      presence: "not-detected",
      control: { mode: "handoff", state: "blocked", adapterId: null, protocol: null, reason: "runtime-not-detected" },
      executable: null,
      integration: "handoff-only"
    });
    expect(project(claude, null)).toMatchObject({ label: "Adapter pending", action: null });
    expect(project(hermes, null)).toMatchObject({ label: "Not found", action: null });
  });

  it("shows global availability without claiming a run connection", () => {
    expect(project(runtime(), null, null)).toMatchObject({ label: "Selected", action: null });
    expect(projectRuntimeConnection({
      runtime: runtime({ id: "codex-two" }),
      session: null,
      activeRunId: null,
      connectingRuntimeId: null,
      selected: false
    })).toMatchObject({ label: "Detected", action: "select" });
  });

  it("describes a live adapter without claiming provider or session availability", () => {
    expect(project(runtime(), null)).toMatchObject({
      label: "Connect",
      detail: "Live adapter detected for this run. A real session receipt is required before CutSteward calls it connected.",
      action: "connect"
    });
  });
});
