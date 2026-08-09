import { randomUUID } from "node:crypto";
import { Readable, Writable } from "node:stream";
import path from "node:path";
import {
  PROTOCOL_VERSION,
  client as createClient,
  methods,
  ndJsonStream
} from "@agentclientprotocol/sdk";
import { redactSensitiveText } from "./redaction.mjs";

const MAX_TEXT = 12_000;

function limitedText(value, maximum = MAX_TEXT) {
  if (typeof value !== "string") return null;
  const text = redactSensitiveText(value).trim();
  return text ? text.slice(0, maximum) : null;
}

function textContent(content) {
  return content?.type === "text" ? limitedText(content.text) : null;
}

function toolEvent(update) {
  const status = update.status || "in_progress";
  const terminal = ["completed", "failed"].includes(status);
  return {
    type: terminal ? "tool.completed" : "tool.started",
    itemId: update.toolCallId || null,
    toolName: limitedText(update.name, 240) || limitedText(update.title, 240) || "ACP tool",
    adapterId: "acp.tool",
    capability: update.kind || "other",
    detail: limitedText(update.title, 1_000) || "Agent tool activity",
    status,
    locations: Array.isArray(update.locations) ? update.locations.slice(0, 100) : []
  };
}

/**
 * Normalize only user-observable ACP events. Agent thought chunks are
 * deliberately excluded: CutSteward exposes plans, actions, evidence and
 * decisions, not hidden chain-of-thought.
 */
export function normalizeAcpSessionUpdate(notification) {
  const update = notification?.update || {};
  if (update.sessionUpdate === "agent_message_chunk") {
    const delta = textContent(update.content);
    return delta ? [{ type: "message.delta", itemId: update.messageId || null, delta }] : [];
  }
  if (update.sessionUpdate === "plan") {
    return [{
      type: "plan.updated",
      detail: "Agent plan updated",
      plan: Array.isArray(update.entries) ? update.entries.slice(0, 100).map((entry) => ({
        step: limitedText(entry?.content, 1_000) || "Untitled step",
        status: entry?.status || "pending",
        priority: entry?.priority || "medium"
      })) : []
    }];
  }
  if (update.sessionUpdate === "plan_update") {
    return [{ type: "plan.updated", detail: "Agent plan changed", plan: [] }];
  }
  if (["tool_call", "tool_call_update"].includes(update.sessionUpdate)) return [toolEvent(update)];
  if (update.sessionUpdate === "usage_update") {
    return [{
      type: "usage.updated",
      detail: "Token usage updated",
      usage: {
        inputTokens: Number.isFinite(update.inputTokens) ? update.inputTokens : null,
        outputTokens: Number.isFinite(update.outputTokens) ? update.outputTokens : null,
        cachedReadTokens: Number.isFinite(update.cachedReadTokens) ? update.cachedReadTokens : null,
        cachedWriteTokens: Number.isFinite(update.cachedWriteTokens) ? update.cachedWriteTokens : null
      }
    }];
  }
  return [];
}

export function acpStreamFromChild(child) {
  if (!child?.stdin || !child?.stdout) throw new Error("ACP child process requires stdin and stdout pipes.");
  return ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));
}

function permissionChoice(options, decision) {
  const preferredKinds = decision === "allow-once"
    ? ["allow_once"]
    : ["reject_once", "reject_always"];
  return options.find((option) => preferredKinds.includes(option.kind)) || null;
}

/**
 * Deep ACP v1 bridge. The caller supplies a transport stream and observes a
 * small interface: connect, prompt, decide/cancel and close. Capability
 * negotiation, update routing and permission correlation stay behind the seam.
 */
export function createAcpRuntimeBridge({
  stream,
  runtimeName = "ACP agent",
  onEvent = async () => {},
  onPermission = async () => {},
  closeTransport = () => {}
}) {
  if (!stream) throw new Error("ACP transport stream is required.");
  const permissions = new Map();
  let connection = null;
  let activeSession = null;
  let initializeResponse = null;
  let activeTurnId = null;
  let closed = false;

  const app = createClient({ name: "cutsteward" })
    .onNotification(methods.client.session.update, async (context) => {
      for (const event of normalizeAcpSessionUpdate(context.params)) await onEvent(event);
    })
    .onRequest(methods.client.session.requestPermission, async (context) => {
      const params = context.params;
      const requestId = `acp-permission-${params.toolCall?.toolCallId || randomUUID()}`;
      return new Promise((resolve) => {
        permissions.set(requestId, { params, resolve });
        void Promise.resolve(onPermission({
          requestId,
          title: limitedText(params.toolCall?.title, 240) || `${runtimeName} requests permission`,
          detail: limitedText(params.toolCall?.title, 2_000) || "Review this exact ACP tool request.",
          toolCallId: params.toolCall?.toolCallId || null,
          toolKind: params.toolCall?.kind || null,
          options: params.options.map(({ optionId, name, kind }) => ({ optionId, name, kind }))
        })).catch(() => {
          permissions.delete(requestId);
          resolve({ outcome: { outcome: "cancelled" } });
        });
      });
    });

  async function connect({ cwd } = {}) {
    if (closed) throw new Error("ACP bridge is closed.");
    if (connection && activeSession) return view();
    if (typeof cwd !== "string" || !path.isAbsolute(cwd)) throw new Error("ACP cwd must be an absolute path.");
    connection = app.connect(stream);
    initializeResponse = await connection.agent.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {}
    });
    if (initializeResponse.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(`ACP protocol mismatch: expected ${PROTOCOL_VERSION}, received ${initializeResponse.protocolVersion}.`);
    }
    activeSession = await connection.agent.buildSession({ cwd, mcpServers: [] }).start();
    return view();
  }

  async function prompt(text) {
    const instruction = limitedText(text, 4_000);
    if (!activeSession) throw new Error("ACP session is not connected.");
    if (!instruction) throw new Error("ACP prompt is empty.");
    if (activeTurnId) throw new Error("ACP agent is already working.");
    const turnId = `acp-turn-${randomUUID()}`;
    activeTurnId = turnId;
    await onEvent({ type: "turn.started", turnId, detail: "ACP agent turn accepted" });
    void activeSession.prompt(instruction).then(async (response) => {
      const interrupted = response.stopReason === "cancelled";
      await onEvent({
        type: interrupted ? "turn.interrupted" : "turn.completed",
        turnId,
        status: response.stopReason,
        detail: interrupted ? "ACP agent turn cancelled" : `ACP agent turn stopped: ${response.stopReason}`
      });
      activeTurnId = null;
    }).catch(async (error) => {
      await onEvent({ type: "turn.failed", turnId, detail: limitedText(error.message, 2_000) || "ACP turn failed" });
      activeTurnId = null;
    });
    return { accepted: true, sessionId: activeSession.sessionId, turnId };
  }

  async function decide({ requestId, decision }) {
    const pending = permissions.get(String(requestId));
    if (!pending) throw new Error("ACP permission request is stale or unknown.");
    const choice = permissionChoice(pending.params.options, decision);
    permissions.delete(String(requestId));
    if (choice) pending.resolve({ outcome: { outcome: "selected", optionId: choice.optionId } });
    else pending.resolve({ outcome: { outcome: "cancelled" } });
    return { accepted: true, requestId: String(requestId), decision, optionId: choice?.optionId || null };
  }

  async function cancel() {
    if (!connection || !activeSession || !activeTurnId) return { accepted: false, reason: "no-active-turn" };
    await connection.agent.notify(methods.agent.session.cancel, { sessionId: activeSession.sessionId });
    return { accepted: true, turnId: activeTurnId };
  }

  function view() {
    return {
      protocol: "acp-v1",
      protocolVersion: initializeResponse?.protocolVersion || null,
      sessionId: activeSession?.sessionId || null,
      activeTurnId,
      capabilities: initializeResponse?.agentCapabilities || {},
      authMethods: initializeResponse?.authMethods || [],
      pendingPermissionIds: [...permissions.keys()]
    };
  }

  async function close() {
    if (closed) return;
    closed = true;
    for (const { resolve } of permissions.values()) resolve({ outcome: { outcome: "cancelled" } });
    permissions.clear();
    activeSession?.dispose?.();
    connection?.close?.();
    await closeTransport();
    activeSession = null;
    connection = null;
    activeTurnId = null;
  }

  return { connect, prompt, decide, cancel, close, view };
}
