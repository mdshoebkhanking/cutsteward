import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLiveSessions } from "../server/live-sessions.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function harness() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "framepilot-live-sessions-"));
  temporaryDirectories.push(dataDirectory);
  const projectRelativePath = "projects/run-live-1";
  const calls = [];
  let sink = async () => {};
  const runtime = {
    read: () => ({
      runId: "run-live-1",
      runtimeId: "codex",
      runtimeName: "Codex",
      adapterId: "codex.app-server",
      protocol: "codex-app-server",
      status: "connected",
      sessionId: "thread-1",
      activeTurnId: null,
      executableVersion: "codex-cli 1.0",
      executableHash: "a".repeat(64),
      pendingApprovals: []
    }),
    async connect(command) {
      calls.push({ kind: "connect", ...command });
      await sink({
        type: "session.accepted",
        runId: command.runId,
        runtimeId: command.runtimeId,
        adapterId: "codex.app-server",
        sessionId: "thread-1",
        sequence: 1,
        at: "2026-08-08T10:00:00.000Z",
        detail: "Codex accepted a live thread."
      });
      return runtime.read();
    },
    async prompt(command) {
      calls.push({ kind: "prompt", ...command });
      await sink({
        type: "turn.accepted",
        runId: command.runId,
        runtimeId: "codex",
        adapterId: "codex.app-server",
        sessionId: "thread-1",
        sequence: 2,
        turnId: "turn-1",
        at: "2026-08-08T10:00:01.000Z",
        detail: "Agent accepted the instruction."
      });
      return { accepted: true, sessionId: "thread-1", turnId: "turn-1" };
    },
    async interrupt(command) {
      calls.push({ kind: "interrupt", ...command });
      return { accepted: true, turnId: "turn-1" };
    },
    async decide(command) {
      calls.push({ kind: "decide", ...command });
      return { accepted: true, requestId: command.requestId, decision: command.decision };
    },
    async closeRun(runId) {
      calls.push({ kind: "close", runId });
    },
    async close() {}
  };
  const createRuntimeController = ({ onEvent }) => {
    sink = onEvent;
    return runtime;
  };
  const productionRuns = {
    async read(query) {
      if (query.kind === "snapshot" && query.runId === "run-live-1") return {
        id: "run-live-1",
        projectRelativePath,
        revision: 1
      };
      throw new Error("unknown run");
    }
  };
  return {
    calls,
    create: () => createLiveSessions({
      dataDirectory,
      rootDirectory: "/project",
      productionRuns,
      createRuntimeController,
      clock: () => new Date("2026-08-08T10:00:05.000Z")
    })
  };
}

function envelope(commandId, command) {
  return {
    schemaVersion: 1,
    commandId,
    runId: "run-live-1",
    actor: { kind: "local-user", id: "desktop-user" },
    command
  };
}

describe("durable live session module", () => {
  it("persists a real session receipt and replays normalized events after reopening", async () => {
    const setup = await harness();
    const first = setup.create();
    const receipt = await first.command(envelope("connect-1", { kind: "connect", runtimeId: "codex" }));
    expect(receipt).toMatchObject({ accepted: true, commandId: "connect-1", sessionId: "thread-1" });
    expect(await first.read({ kind: "session", runId: "run-live-1" })).toMatchObject({
      runtimeId: "codex",
      status: "connected",
      sessionId: "thread-1",
      lastSequence: 1
    });
    expect(await first.read({ kind: "events", runId: "run-live-1", afterSequence: 0 })).toHaveLength(1);
    await first.shutdown();

    const reopened = setup.create();
    const session = await reopened.read({ kind: "session", runId: "run-live-1" });
    const events = await reopened.read({ kind: "events", runId: "run-live-1", afterSequence: 0 });
    expect(session).toMatchObject({ status: "disconnected", sessionId: "thread-1", lastSequence: 1 });
    expect(events[0]).toMatchObject({ sequence: 1, type: "session.accepted", previousHash: null });
    expect(events[0].eventHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("forwards chat once, replays the same command idempotently, and rejects changed reuse", async () => {
    const setup = await harness();
    const live = setup.create();
    await live.command(envelope("connect-2", { kind: "connect", runtimeId: "codex" }));
    const prompt = envelope("prompt-1", { kind: "prompt", text: "Build the storyboard." });
    const first = await live.command(prompt);
    const second = await live.command(prompt);

    expect(first).toEqual(second);
    expect(setup.calls.filter(({ kind }) => kind === "prompt")).toHaveLength(1);
    expect(await live.read({ kind: "events", runId: "run-live-1", afterSequence: 1 })).toHaveLength(1);
    await expect(live.command(envelope("prompt-1", { kind: "prompt", text: "Different work." })))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
});
