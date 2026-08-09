import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { acpStreamFromChild, createAcpRuntimeBridge } from "./acp-runtime.mjs";
import { redactSensitiveText } from "./redaction.mjs";

const MAX_LINE_BYTES = 512 * 1024;
const MAX_EVENT_TEXT = 12_000;
const LIVE_AGENT_RUNTIME_CAPABILITIES = Object.freeze({
  codex: Object.freeze({ adapterId: "codex.app-server", protocol: "codex-app-server" }),
  gemini: Object.freeze({ adapterId: "acp.v1", protocol: "acp-v1" }),
  hermes: Object.freeze({ adapterId: "acp.v1", protocol: "acp-v1" }),
  kimi: Object.freeze({ adapterId: "acp.v1", protocol: "acp-v1" })
});
const RUNTIME_SPECS = Object.freeze({
  codex: Object.freeze({ name: "Codex", commands: ["codex"], pathEnvironment: "FRAMEPILOT_CODEX_PATH", launchArgs: ["app-server", "--stdio"] }),
  gemini: Object.freeze({ name: "Gemini CLI", commands: ["gemini"], pathEnvironment: "FRAMEPILOT_GEMINI_PATH", launchArgs: ["--acp"] }),
  hermes: Object.freeze({ name: "Hermes", commands: ["hermes"], pathEnvironment: "FRAMEPILOT_HERMES_PATH", launchArgs: ["acp"] }),
  kimi: Object.freeze({ name: "Kimi Code", commands: ["kimi"], pathEnvironment: "FRAMEPILOT_KIMI_PATH", launchArgs: ["acp"] })
});
export const LIVE_AGENT_RUNTIME_IDS = Object.freeze(Object.keys(LIVE_AGENT_RUNTIME_CAPABILITIES));

export function liveAgentRuntimeCapability(runtimeId) {
  return LIVE_AGENT_RUNTIME_CAPABILITIES[runtimeId] || null;
}

export function supportsLiveAgentRuntime(runtimeId) {
  return Boolean(liveAgentRuntimeCapability(runtimeId));
}

function runtimeError(message, code, statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode });
}

function limitedText(value, maximum = MAX_EVENT_TEXT) {
  if (typeof value !== "string") return null;
  const text = redactSensitiveText(value).trim();
  if (!text) return null;
  return text.slice(0, maximum);
}

function commandName(command) {
  const text = limitedText(command, 240) || "Terminal command";
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function toolFields(item = {}) {
  if (item.type === "commandExecution") {
    return {
      toolName: "Terminal",
      adapterId: "codex.command-execution",
      capability: "shell",
      detail: commandName(item.command)
    };
  }
  if (item.type === "mcpToolCall") {
    return {
      toolName: [item.server, item.tool].filter(Boolean).join(" · ") || "Connected tool",
      adapterId: item.server ? `mcp.${item.server}` : "codex.mcp",
      capability: item.tool || "mcp-tool",
      detail: limitedText(item.tool, 240)
    };
  }
  if (item.type === "dynamicToolCall") {
    return {
      toolName: [item.namespace, item.tool].filter(Boolean).join(" · ") || "Agent tool",
      adapterId: item.namespace ? `dynamic.${item.namespace}` : "codex.dynamic-tool",
      capability: item.tool || "dynamic-tool",
      detail: limitedText(item.tool, 240)
    };
  }
  if (item.type === "imageGeneration") {
    return {
      toolName: "Image generation",
      adapterId: "codex.image-generation",
      capability: "image-generation",
      detail: "Generating a visual asset"
    };
  }
  if (item.type === "webSearch") {
    return {
      toolName: "Web search",
      adapterId: "codex.web-search",
      capability: "web-search",
      detail: "Researching a source"
    };
  }
  return {
    toolName: item.type || "Agent work",
    adapterId: "codex.app-server",
    capability: item.type || "work-item",
    detail: limitedText(item.text, 240)
  };
}

function normalizeNotification(message) {
  const method = message?.method;
  const params = message?.params || {};
  const base = { nativeMethod: method, turnId: params.turnId || params.turn?.id || null };
  if (method === "turn/started") return [{ ...base, type: "turn.started", detail: "Agent turn accepted" }];
  if (method === "turn/plan/updated") {
    return [{
      ...base,
      type: "plan.updated",
      detail: limitedText(params.explanation, 2_000) || "Agent plan updated",
      plan: Array.isArray(params.plan) ? params.plan.slice(0, 100).map((step) => ({
        step: limitedText(step?.step, 1_000) || "Untitled step",
        status: step?.status || "pending"
      })) : []
    }];
  }
  if (method === "item/agentMessage/delta") {
    return [{ ...base, type: "message.delta", itemId: params.itemId || null, delta: limitedText(params.delta) || "" }];
  }
  if (["command/exec/outputDelta", "item/commandExecution/outputDelta", "process/outputDelta"].includes(method)) {
    return [{
      ...base,
      type: "terminal.output",
      itemId: params.itemId || params.processId || null,
      detail: limitedText(params.delta || params.output) || ""
    }];
  }
  if (method === "turn/completed") {
    const status = params.turn?.status || "completed";
    return [{
      ...base,
      type: status === "completed" ? "turn.completed" : status === "interrupted" ? "turn.interrupted" : "turn.failed",
      status,
      detail: status === "completed" ? "Agent turn completed" : `Agent turn ${status}`,
      error: params.turn?.error || null
    }];
  }
  if (method === "error") {
    return [{ ...base, type: "turn.failed", detail: limitedText(params.message, 2_000) || "Agent runtime error" }];
  }
  if (method === "item/started" || method === "item/completed") {
    const item = params.item || {};
    if (item.type === "agentMessage" && method === "item/completed") {
      return [{
        ...base,
        type: "message.completed",
        itemId: item.id || null,
        text: limitedText(item.text) || "",
        detail: limitedText(item.text, 240) || "Agent replied"
      }];
    }
    if (item.type === "fileChange") {
      return [{
        ...base,
        type: "file.diff",
        itemId: item.id || null,
        status: item.status || (method === "item/completed" ? "completed" : "running"),
        changes: Array.isArray(item.changes) ? item.changes.slice(0, 100) : [],
        detail: method === "item/completed" ? "File changes completed" : "File changes proposed"
      }];
    }
    const tool = toolFields(item);
    return [{
      ...base,
      ...tool,
      type: method === "item/started" ? "tool.started" : "tool.completed",
      itemId: item.id || null,
      status: item.status || (method === "item/completed" ? "completed" : "running"),
      exitCode: Number.isInteger(item.exitCode) ? item.exitCode : null
    }];
  }
  if (method === "thread/tokenUsage/updated") {
    return [{ ...base, type: "usage.updated", detail: "Token usage updated", usage: params.tokenUsage || params }];
  }
  return [];
}

function isServerRequest(message) {
  return message && Object.hasOwn(message, "id") && typeof message.method === "string" && !Object.hasOwn(message, "result") && !Object.hasOwn(message, "error");
}

function approvalEvent(message) {
  const params = message.params || {};
  return {
    type: message.method === "item/tool/requestUserInput" ? "input.requested" : "approval.requested",
    requestId: String(message.id),
    nativeMethod: message.method,
    turnId: params.turnId || null,
    itemId: params.itemId || null,
    title: message.method === "item/commandExecution/requestApproval"
      ? "Allow terminal command?"
      : message.method === "item/fileChange/requestApproval"
        ? "Allow file changes?"
        : message.method === "item/tool/requestUserInput"
          ? "Agent needs input"
          : "Agent needs approval",
    detail: limitedText(params.reason || params.command, 2_000) || "Review the exact agent request before continuing.",
    request: {
      command: limitedText(params.command, 2_000),
      cwd: limitedText(params.cwd, 2_000),
      reason: limitedText(params.reason, 2_000),
      questions: Array.isArray(params.questions) ? params.questions.slice(0, 20) : null
    }
  };
}

function publicSession(session) {
  if (!session) return null;
  return {
    runId: session.runId,
    runtimeId: session.runtimeId,
    runtimeName: session.runtimeName,
    adapterId: session.adapterId,
    protocol: session.protocol,
    status: session.status,
    sessionId: session.sessionId,
    activeTurnId: session.activeTurnId,
    model: session.model,
    modelProvider: session.modelProvider,
    executableVersion: session.executableVersion,
    executableHash: session.executableHash,
    connectedAt: session.connectedAt,
    lastEventAt: session.lastEventAt,
    lastError: session.lastError,
    pendingApprovals: [...session.approvals.values()].map(({ raw, ...approval }) => approval)
  };
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  const file = await import("node:fs");
  await new Promise((resolve, reject) => {
    const stream = file.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function executableNames(command) {
  if (process.platform !== "win32") return [command];
  return [`${command}.exe`, command, `${command}.cmd`, `${command}.bat`];
}

export async function resolveAgentRuntime(runtimeId) {
  if (!supportsLiveAgentRuntime(runtimeId)) return null;
  const spec = RUNTIME_SPECS[runtimeId];
  if (!spec) return null;
  const candidates = [];
  if (process.env[spec.pathEnvironment]) candidates.push(process.env[spec.pathEnvironment]);
  for (const directory of (process.env.PATH || "").split(path.delimiter).filter(Boolean)) {
    for (const command of spec.commands) {
      for (const name of executableNames(command)) candidates.push(path.join(directory, name));
    }
  }
  for (const candidate of candidates) {
    try {
      await access(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
      const resolved = await realpath(candidate);
      const info = await stat(resolved);
      if (!info.isFile()) continue;
      const probe = spawnSync(resolved, ["--version"], {
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
        shell: false,
        timeout: 5_000,
        windowsHide: true,
        maxBuffer: 128 * 1024
      });
      if (probe.status !== 0) continue;
      return {
        runtimeId,
        executable: resolved,
        version: limitedText(`${probe.stdout || ""}\n${probe.stderr || ""}`.trim().split("\n")[0], 240) || spec.name,
        executableHash: await hashFile(resolved)
      };
    } catch {
      // Continue bounded PATH discovery.
    }
  }
  return null;
}

export function createAgentRuntimeController({
  rootDirectory,
  resolveRuntime = resolveAgentRuntime,
  spawnProcess = spawn,
  onEvent = async () => {},
  requestTimeoutMs = 15_000,
  clock = () => new Date()
}) {
  const sessions = new Map();

  async function emit(session, event) {
    session.eventSequence += 1;
    session.lastEventAt = clock().toISOString();
    const normalized = {
      schemaVersion: 1,
      eventId: `live-${randomUUID()}`,
      sequence: session.eventSequence,
      runId: session.runId,
      runtimeId: session.runtimeId,
      adapterId: session.adapterId,
      sessionId: session.sessionId,
      at: session.lastEventAt,
      ...event
    };
    session.eventQueue = session.eventQueue.then(() => onEvent(normalized));
    await session.eventQueue;
    return normalized;
  }

  function request(session, method, params) {
    if (!session.child || session.child.stdin?.destroyed) {
      return Promise.reject(runtimeError("Agent transport is not available.", "SESSION_DISCONNECTED"));
    }
    const id = ++session.requestId;
    const message = { id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pending.delete(String(id));
        reject(runtimeError(`${method} timed out.`, "RUNTIME_TIMEOUT", 504));
      }, requestTimeoutMs);
      session.pending.set(String(id), { resolve, reject, timer, method });
      try {
        session.child.stdin.write(`${JSON.stringify(message)}\n`);
      } catch (error) {
        clearTimeout(timer);
        session.pending.delete(String(id));
        reject(runtimeError(error.message, "RUNTIME_WRITE_FAILED", 502));
      }
    });
  }

  function notify(session, method, params) {
    session.child.stdin.write(`${JSON.stringify(params === undefined ? { method } : { method, params })}\n`);
  }

  async function handleMessage(session, message) {
    if (Object.hasOwn(message, "id") && (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"))) {
      const pending = session.pending.get(String(message.id));
      if (!pending) return;
      clearTimeout(pending.timer);
      session.pending.delete(String(message.id));
      if (message.error) pending.reject(runtimeError(message.error.message || `${pending.method} failed.`, "RUNTIME_REQUEST_FAILED", 502));
      else pending.resolve(message.result);
      return;
    }
    if (isServerRequest(message)) {
      const event = approvalEvent(message);
      session.approvals.set(String(message.id), { ...event, raw: message });
      await emit(session, event);
      return;
    }
    for (const event of normalizeNotification(message)) {
      if (event.type === "turn.started") session.activeTurnId = event.turnId;
      if (["turn.completed", "turn.failed", "turn.interrupted"].includes(event.type)) session.activeTurnId = null;
      await emit(session, event);
    }
  }

  function supervise(session) {
    let output = "";
    session.child.stdout.setEncoding("utf8");
    session.child.stderr.setEncoding("utf8");
    session.child.stdout.on("data", (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output, "utf8") > MAX_LINE_BYTES) {
        session.lastError = "Agent emitted an oversized protocol line.";
        session.child.kill();
        return;
      }
      const lines = output.split("\n");
      output = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          session.messageQueue = session.messageQueue.then(() => handleMessage(session, message));
        } catch {
          session.lastError = "Agent emitted malformed JSON.";
          session.child.kill();
        }
      }
    });
    session.child.stderr.on("data", (chunk) => {
      session.stderr = `${session.stderr}${chunk}`.slice(-16 * 1024);
    });
    session.child.once("error", (error) => {
      session.lastError = error.code || error.message;
    });
    session.child.once("exit", (code, signal) => {
      for (const pending of session.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(runtimeError("Agent process exited before replying.", "SESSION_DISCONNECTED", 502));
      }
      session.pending.clear();
      if (session.status !== "closed") {
        session.status = "disconnected";
        session.lastError ||= session.stderr.trim().split("\n")[0] || `Agent process exited (${signal || code}).`;
        void emit(session, { type: "session.disconnected", detail: session.lastError });
      }
    });
  }

  function superviseAcpTransport(session) {
    session.child.stderr.setEncoding("utf8");
    session.child.stderr.on("data", (chunk) => {
      session.stderr = `${session.stderr}${chunk}`.slice(-16 * 1024);
    });
    session.child.once("error", (error) => {
      session.lastError = error.code || error.message;
    });
    session.child.once("exit", (code, signal) => {
      if (session.status !== "closed") {
        session.status = "disconnected";
        session.lastError ||= session.stderr.trim().split("\n")[0] || `ACP agent process exited (${signal || code}).`;
        void emit(session, { type: "session.disconnected", detail: session.lastError });
      }
    });
  }

  async function connect({ runId, runtimeId = "codex", cwd = rootDirectory }) {
    const capability = liveAgentRuntimeCapability(runtimeId);
    if (!capability) throw runtimeError(`${runtimeId} has no conformance-passed live adapter yet.`, "RUNTIME_UNAVAILABLE", 422);
    const runtimeSpec = RUNTIME_SPECS[runtimeId];
    const existing = sessions.get(runId);
    if (existing?.status === "connected") return publicSession(existing);
    const runtime = await resolveRuntime(runtimeId);
    if (!runtime) throw runtimeError(`${runtimeId} is not available for a live session.`, "RUNTIME_UNAVAILABLE", 422);
    const session = {
      runId,
      runtimeId,
      runtimeName: runtimeSpec.name,
      adapterId: capability.adapterId,
      protocol: capability.protocol,
      status: "connecting",
      sessionId: null,
      activeTurnId: null,
      model: null,
      modelProvider: null,
      executableVersion: runtime.version,
      executableHash: runtime.executableHash,
      connectedAt: null,
      lastEventAt: null,
      lastError: null,
      eventSequence: 0,
      requestId: 0,
      pending: new Map(),
      approvals: new Map(),
      stderr: "",
      eventQueue: Promise.resolve(),
      messageQueue: Promise.resolve(),
      child: null,
      bridge: null
    };
    sessions.set(runId, session);
    session.child = spawnProcess(runtime.executable, runtimeSpec.launchArgs, {
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    if (capability.protocol === "acp-v1") superviseAcpTransport(session);
    else supervise(session);
    try {
      if (capability.protocol === "acp-v1") {
        session.bridge = createAcpRuntimeBridge({
          stream: acpStreamFromChild(session.child),
          runtimeName: session.runtimeName,
          closeTransport: () => session.child?.kill?.(),
          onEvent: async (event) => {
            if (event.type === "turn.started") session.activeTurnId = event.turnId;
            if (["turn.completed", "turn.failed", "turn.interrupted"].includes(event.type)) session.activeTurnId = null;
            await emit(session, event);
          },
          onPermission: async (approval) => {
            const event = {
              ...approval,
              type: "approval.requested",
              nativeMethod: "acp/session/request_permission",
              turnId: session.activeTurnId,
              request: { toolCallId: approval.toolCallId, toolKind: approval.toolKind, options: approval.options }
            };
            session.approvals.set(String(approval.requestId), { ...event, raw: null });
            await emit(session, event);
          }
        });
        const view = await session.bridge.connect({ cwd });
        session.sessionId = view.sessionId;
        if (!session.sessionId) throw runtimeError(`${session.runtimeName} did not return an ACP session receipt.`, "CONFORMANCE_FAILED", 502);
        session.status = "connected";
        session.connectedAt = clock().toISOString();
        await emit(session, {
          type: "session.accepted",
          detail: `${session.runtimeName} accepted an ACP v1 session.`,
          receipt: {
            sessionId: session.sessionId,
            protocolVersion: view.protocolVersion,
            executableVersion: session.executableVersion,
            executableHash: session.executableHash,
            capabilities: view.capabilities
          }
        });
        return publicSession(session);
      }
      await request(session, "initialize", {
        clientInfo: { name: "cutsteward", title: "CutSteward", version: "0.1.0" },
        capabilities: { experimentalApi: false, requestAttestation: false }
      });
      notify(session, "initialized");
      const response = await request(session, "thread/start", {
        cwd,
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        ephemeral: false,
        baseInstructions: "You are connected to CutSteward as the production runner. Work only inside the supplied project scope. Keep planning, script, storyboard, generation, voice, edit, and QA progress observable through real tool events. Never claim a website action, upload, spend, render, artifact, or QA result without an observed receipt. Ask before uploads, spend, publishing, sign-in, MFA/CAPTCHA, secrets, destructive actions, or expanding scope. Preserve authentic app source files unless the user explicitly authorizes edits."
      });
      session.sessionId = response?.thread?.id;
      if (!session.sessionId) throw runtimeError("Codex did not return a thread receipt.", "CONFORMANCE_FAILED", 502);
      session.status = "connected";
      session.model = response.model || null;
      session.modelProvider = response.modelProvider || null;
      session.connectedAt = clock().toISOString();
      await emit(session, {
        type: "session.accepted",
        detail: `${session.runtimeName} app-server accepted a live thread.`,
        receipt: {
          threadId: session.sessionId,
          executableVersion: session.executableVersion,
          executableHash: session.executableHash
        }
      });
      return publicSession(session);
    } catch (error) {
      session.status = "failed";
      session.lastError = error.message;
      session.child?.kill();
      throw error;
    }
  }

  async function prompt({ runId, text }) {
    const session = sessions.get(runId);
    if (!session || session.status !== "connected") throw runtimeError("No live agent session is connected for this run.", "SESSION_NOT_CONNECTED", 409);
    const instruction = limitedText(text, 4_000);
    if (!instruction) throw runtimeError("Agent instruction is empty.", "INVALID_PROMPT", 422);
    if (session.activeTurnId) throw runtimeError("The agent is already working. Steer or interrupt the active turn first.", "TURN_IN_PROGRESS", 409);
    if (session.bridge) {
      const receipt = await session.bridge.prompt(instruction);
      session.activeTurnId = receipt.turnId;
      return { ...receipt, runId };
    }
    const response = await request(session, "turn/start", {
      threadId: session.sessionId,
      input: [{ type: "text", text: instruction, text_elements: [] }]
    });
    const turnId = response?.turn?.id;
    if (!turnId) throw runtimeError("Agent did not return a turn receipt.", "CONFORMANCE_FAILED", 502);
    session.activeTurnId = turnId;
    await emit(session, { type: "turn.accepted", turnId, detail: "Agent accepted the instruction." });
    return { accepted: true, runId, sessionId: session.sessionId, turnId };
  }

  async function interrupt({ runId }) {
    const session = sessions.get(runId);
    if (!session || session.status !== "connected") throw runtimeError("No live agent session is connected for this run.", "SESSION_NOT_CONNECTED", 409);
    if (!session.activeTurnId) return { accepted: false, reason: "no-active-turn" };
    if (session.bridge) return session.bridge.cancel();
    const turnId = session.activeTurnId;
    await request(session, "turn/interrupt", { threadId: session.sessionId, turnId });
    return { accepted: true, turnId };
  }

  async function decide({ runId, requestId, decision }) {
    const session = sessions.get(runId);
    if (!session || session.status !== "connected") throw runtimeError("No live agent session is connected for this run.", "SESSION_NOT_CONNECTED", 409);
    const approval = session.approvals.get(String(requestId));
    if (!approval) throw runtimeError("Approval request is stale or unknown.", "STALE_DECISION", 409);
    if (!["allow-once", "deny"].includes(decision)) throw runtimeError("Approval decision is invalid.", "INVALID_DECISION", 422);
    if (session.bridge) {
      const result = await session.bridge.decide({ requestId, decision });
      session.approvals.delete(String(requestId));
      await emit(session, {
        type: "approval.resolved",
        requestId: String(requestId),
        decision,
        turnId: approval.turnId,
        detail: decision === "allow-once" ? "User allowed this exact ACP request once." : "User denied this ACP request."
      });
      return result;
    }
    if (!["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(approval.nativeMethod)) {
      throw runtimeError("This request needs a typed response and cannot be approved generically.", "UNSUPPORTED_DECISION", 422);
    }
    session.child.stdin.write(`${JSON.stringify({
      id: approval.raw.id,
      result: { decision: decision === "allow-once" ? "accept" : "decline" }
    })}\n`);
    session.approvals.delete(String(requestId));
    await emit(session, {
      type: "approval.resolved",
      requestId: String(requestId),
      decision,
      turnId: approval.turnId,
      detail: decision === "allow-once" ? "User allowed this exact request once." : "User denied this request."
    });
    return { accepted: true, requestId: String(requestId), decision };
  }

  async function closeRun(runId) {
    const session = sessions.get(runId);
    if (!session) return;
    session.status = "closed";
    if (session.bridge) await session.bridge.close();
    else {
      session.child?.stdin?.end?.();
      session.child?.kill?.();
    }
    await emit(session, { type: "session.closed", detail: "Live agent session closed." });
    sessions.delete(runId);
  }

  async function close() {
    await Promise.all([...sessions.keys()].map(closeRun));
  }

  return {
    connect,
    prompt,
    interrupt,
    decide,
    read: (runId) => publicSession(sessions.get(runId)),
    closeRun,
    close
  };
}
