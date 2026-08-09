import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  agent as createAgent,
  methods,
  ndJsonStream
} from "@agentclientprotocol/sdk";
import { createAcpRuntimeBridge, normalizeAcpSessionUpdate } from "../server/acp-runtime.mjs";

function streamPair() {
  const clientToAgent = new TransformStream();
  const agentToClient = new TransformStream();
  return {
    client: ndJsonStream(clientToAgent.writable, agentToClient.readable),
    agent: ndJsonStream(agentToClient.writable, clientToAgent.readable)
  };
}

async function waitFor(check, timeoutMs = 1_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for ACP test state.");
}

describe("ACP runtime bridge", () => {
  it("connects, normalizes plans/tools, and mediates exact permission options", async () => {
    const streams = streamPair();
    const events = [];
    const permissionRequests = [];
    const agentApp = createAgent({ name: "framepilot-test-agent" })
      .onRequest(methods.agent.initialize, (context) => ({
        protocolVersion: context.params.protocolVersion,
        agentCapabilities: { loadSession: false },
        authMethods: []
      }))
      .onRequest(methods.agent.session.new, () => ({ sessionId: "acp-session-1" }))
      .onRequest(methods.agent.session.prompt, async (context) => {
        await context.client.notify(methods.client.session.update, {
          sessionId: context.params.sessionId,
          update: {
            sessionUpdate: "plan",
            entries: [{ content: "Research the product", priority: "high", status: "in_progress" }]
          }
        });
        await context.client.notify(methods.client.session.update, {
          sessionId: context.params.sessionId,
          update: {
            sessionUpdate: "agent_thought_chunk",
            content: { type: "text", text: "private reasoning must not be exposed" }
          }
        });
        const permission = await context.client.request(methods.client.session.requestPermission, {
          sessionId: context.params.sessionId,
          toolCall: {
            toolCallId: "tool-1",
            title: "Run a bounded local probe",
            kind: "execute",
            status: "pending"
          },
          options: [
            { optionId: "allow-tool-once", name: "Allow once", kind: "allow_once" },
            { optionId: "reject-tool-once", name: "Reject", kind: "reject_once" }
          ]
        });
        await context.client.notify(methods.client.session.update, {
          sessionId: context.params.sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "tool-1",
            title: "Run a bounded local probe",
            kind: "execute",
            status: permission.outcome.outcome === "selected" ? "completed" : "failed"
          }
        });
        return { stopReason: "end_turn" };
      });
    const agentConnection = agentApp.connect(streams.agent);
    const bridge = createAcpRuntimeBridge({
      stream: streams.client,
      runtimeName: "Test ACP",
      onEvent: async (event) => events.push(event),
      onPermission: async (request) => permissionRequests.push(request)
    });

    const connected = await bridge.connect({ cwd: "/project" });
    expect(connected).toMatchObject({ protocol: "acp-v1", protocolVersion: PROTOCOL_VERSION, sessionId: "acp-session-1" });
    const turn = await bridge.prompt("Build the film.");
    expect(turn).toMatchObject({ accepted: true, sessionId: "acp-session-1" });
    const request = await waitFor(() => permissionRequests[0]);
    expect(request).toMatchObject({ toolCallId: "tool-1", toolKind: "execute" });
    await bridge.decide({ requestId: request.requestId, decision: "allow-once" });
    await waitFor(() => events.find((event) => event.type === "turn.completed"));

    expect(events.find((event) => event.type === "plan.updated")?.plan[0]).toMatchObject({
      step: "Research the product",
      status: "in_progress"
    });
    expect(events.find((event) => event.type === "tool.completed")).toMatchObject({
      itemId: "tool-1",
      capability: "execute",
      status: "completed"
    });
    expect(JSON.stringify(events)).not.toContain("private reasoning must not be exposed");

    await bridge.close();
    agentConnection.close();
  });

  it("keeps unsupported and private ACP updates out of the public event stream", () => {
    expect(normalizeAcpSessionUpdate({
      update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "secret" } }
    })).toEqual([]);
    expect(normalizeAcpSessionUpdate({
      update: { sessionUpdate: "current_mode_update", currentModeId: "code" }
    })).toEqual([]);
  });
});

