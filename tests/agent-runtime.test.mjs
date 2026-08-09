import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  createAgentRuntimeController,
  liveAgentRuntimeCapability,
  supportsLiveAgentRuntime
} from "../server/agent-runtime.mjs";

function fakeCodexProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr.setEncoding = () => {};
  child.killed = false;
  child.requests = [];

  const emit = (message) => queueMicrotask(() => child.stdout.emit("data", `${JSON.stringify(message)}\n`));
  child.stdin = {
    destroyed: false,
    write(chunk) {
      for (const line of String(chunk).trim().split("\n")) {
        if (!line) continue;
        const request = JSON.parse(line);
        child.requests.push(request);
        if (request.method === "initialize") {
          emit({ id: request.id, result: { userAgent: "codex-test/1.0", platformOs: "test" } });
        }
        if (request.method === "thread/start") {
          emit({
            id: request.id,
            result: {
              thread: { id: "thread-live-1" },
              model: "gpt-test",
              modelProvider: "openai",
              cwd: request.params.cwd
            }
          });
        }
        if (request.method === "turn/start") {
          emit({ id: request.id, result: { turn: { id: "turn-live-1", status: "inProgress", items: [] } } });
          emit({ method: "turn/started", params: { threadId: "thread-live-1", turn: { id: "turn-live-1" } } });
          emit({
            method: "turn/plan/updated",
            params: {
              threadId: "thread-live-1",
              turnId: "turn-live-1",
              explanation: "Build the storyboard first.",
              plan: [{ step: "Lock character", status: "in_progress" }]
            }
          });
          emit({
            method: "item/started",
            params: {
              threadId: "thread-live-1",
              turnId: "turn-live-1",
              item: { id: "tool-1", type: "commandExecution", command: "inspect storyboard", status: "inProgress" }
            }
          });
          emit({
            method: "item/completed",
            params: {
              threadId: "thread-live-1",
              turnId: "turn-live-1",
              item: { id: "tool-1", type: "commandExecution", command: "inspect storyboard", status: "completed", exitCode: 0 }
            }
          });
          emit({
            method: "item/completed",
            params: {
              threadId: "thread-live-1",
              turnId: "turn-live-1",
              item: { id: "message-1", type: "agentMessage", text: "Storyboard is ready." }
            }
          });
          emit({
            method: "turn/completed",
            params: { threadId: "thread-live-1", turn: { id: "turn-live-1", status: "completed", items: [] } }
          });
        }
      }
      return true;
    },
    end() {
      this.destroyed = true;
    }
  };
  child.kill = () => {
    child.killed = true;
    queueMicrotask(() => child.emit("exit", 0, null));
    return true;
  };
  return child;
}

describe("live agent runtime controller", () => {
  it("exposes the same live-adapter registry used by discovery and execution", () => {
    expect(liveAgentRuntimeCapability("codex")).toEqual({
      adapterId: "codex.app-server",
      protocol: "codex-app-server"
    });
    expect(supportsLiveAgentRuntime("codex")).toBe(true);
    expect(supportsLiveAgentRuntime("claude")).toBe(false);
    expect(liveAgentRuntimeCapability("gemini")).toEqual({ adapterId: "acp.v1", protocol: "acp-v1" });
    expect(liveAgentRuntimeCapability("hermes")).toEqual({ adapterId: "acp.v1", protocol: "acp-v1" });
    expect(liveAgentRuntimeCapability("kimi")).toEqual({ adapterId: "acp.v1", protocol: "acp-v1" });
    expect(supportsLiveAgentRuntime("hermes")).toBe(true);
    expect(supportsLiveAgentRuntime("kimi")).toBe(true);
    expect(supportsLiveAgentRuntime("gemini")).toBe(true);
  });

  it("connects a Codex app-server thread and emits normalized live work events", async () => {
    const child = fakeCodexProcess();
    const events = [];
    const controller = createAgentRuntimeController({
      rootDirectory: "/project",
      resolveRuntime: async () => ({
        runtimeId: "codex",
        executable: "/trusted/codex",
        version: "codex-cli 1.0",
        executableHash: "a".repeat(64)
      }),
      spawnProcess: () => child,
      onEvent: async (event) => events.push(event),
      requestTimeoutMs: 1_000
    });

    const session = await controller.connect({ runId: "run-1", runtimeId: "codex", cwd: "/project" });
    expect(session).toMatchObject({
      runId: "run-1",
      runtimeId: "codex",
      status: "connected",
      sessionId: "thread-live-1",
      protocol: "codex-app-server"
    });
    expect(child.requests.map(({ method }) => method)).toEqual([
      "initialize",
      "initialized",
      "thread/start"
    ]);
    expect(child.requests.find(({ method }) => method === "thread/start")?.params).toMatchObject({
      cwd: "/project",
      approvalPolicy: "on-request",
      sandbox: "workspace-write"
    });
    expect(child.requests.find(({ method }) => method === "thread/start")?.params)
      .not.toHaveProperty("runtimeWorkspaceRoots");

    const receipt = await controller.prompt({ runId: "run-1", text: "Build the storyboard." });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(receipt).toMatchObject({ accepted: true, sessionId: "thread-live-1", turnId: "turn-live-1" });
    expect(events.map(({ type }) => type)).toEqual(expect.arrayContaining([
      "session.accepted",
      "turn.started",
      "plan.updated",
      "tool.started",
      "tool.completed",
      "message.completed",
      "turn.completed"
    ]));
    expect(events.find(({ type }) => type === "plan.updated")?.plan[0]).toMatchObject({
      step: "Lock character",
      status: "in_progress"
    });
    expect(controller.read("run-1")).toMatchObject({ status: "connected", activeTurnId: null });

    await controller.close();
    expect(child.killed).toBe(true);
  });

  it("never fabricates a connection for an unsupported or missing runtime", async () => {
    const controller = createAgentRuntimeController({
      rootDirectory: "/project",
      resolveRuntime: async () => null,
      spawnProcess: () => {
        throw new Error("must not spawn");
      }
    });

    await expect(controller.connect({ runId: "run-2", runtimeId: "hermes", cwd: "/project" }))
      .rejects.toMatchObject({ code: "RUNTIME_UNAVAILABLE" });
    await expect(controller.prompt({ runId: "run-2", text: "Do work" }))
      .rejects.toMatchObject({ code: "SESSION_NOT_CONNECTED" });
  });
});
