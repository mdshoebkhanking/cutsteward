import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAgentRuntimeController } from "./agent-runtime.mjs";

const SCHEMA_VERSION = 1;
const EVENT_FILE = /^\d{8}\.json$/;

function liveError(message, code, statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode });
}

function safeId(value, label) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) {
    throw liveError(`${label} is invalid.`, "VALIDATION_ERROR", 422);
  }
  return value;
}

function valueHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function atomicWrite(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, filePath);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function publicSession(session, { attached = false } = {}) {
  if (!session) return null;
  const status = !attached && ["connected", "connecting"].includes(session.status) ? "disconnected" : session.status;
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: session.runId,
    runtimeId: session.runtimeId || null,
    runtimeName: session.runtimeName || null,
    adapterId: session.adapterId || null,
    protocol: session.protocol || null,
    status,
    sessionId: session.sessionId || null,
    activeTurnId: attached ? session.activeTurnId || null : null,
    model: session.model || null,
    modelProvider: session.modelProvider || null,
    executableVersion: session.executableVersion || null,
    executableHash: session.executableHash || null,
    connectedAt: session.connectedAt || null,
    lastEventAt: session.lastEventAt || null,
    lastError: session.lastError || null,
    pendingApprovals: attached ? session.pendingApprovals || [] : [],
    lastSequence: Number(session.lastSequence || 0),
    lastEventHash: session.lastEventHash || null,
    updatedAt: session.updatedAt || null,
    resumeAvailable: Boolean(session.sessionId)
  };
}

export function createLiveSessions({
  dataDirectory,
  rootDirectory,
  productionRuns,
  createRuntimeController = (options) => createAgentRuntimeController({ rootDirectory, ...options }),
  clock = () => new Date()
}) {
  const activeRuns = new Set();
  const commandQueues = new Map();
  const eventQueues = new Map();

  async function location(runId) {
    safeId(runId, "Run ID");
    const snapshot = await productionRuns.read({ kind: "snapshot", runId });
    const projectDirectory = path.resolve(dataDirectory, snapshot.projectRelativePath);
    if (!contained(path.resolve(dataDirectory), projectDirectory)) {
      throw liveError("Run project path leaves CutSteward data storage.", "INVALID_PROJECT_PATH", 500);
    }
    const liveDirectory = path.join(projectDirectory, "live");
    return {
      snapshot,
      projectDirectory,
      liveDirectory,
      sessionPath: path.join(liveDirectory, "SESSION.json"),
      eventsDirectory: path.join(liveDirectory, "events"),
      commandsDirectory: path.join(liveDirectory, "commands")
    };
  }

  function serialize(queue, runId, operation) {
    const previous = queue.get(runId) || Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    queue.set(runId, next);
    void next.finally(() => {
      if (queue.get(runId) === next) queue.delete(runId);
    }).catch(() => undefined);
    return next;
  }

  async function loadSession(runId) {
    const paths = await location(runId);
    try {
      return { paths, session: await readJson(paths.sessionPath) };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      return { paths, session: null };
    }
  }

  async function persistRuntimeSession(runId, runtimeView, event = null) {
    const { paths, session: previous } = await loadSession(runId);
    const next = {
      schemaVersion: SCHEMA_VERSION,
      runId,
      runtimeId: runtimeView?.runtimeId || event?.runtimeId || previous?.runtimeId || null,
      runtimeName: runtimeView?.runtimeName || previous?.runtimeName || (event?.runtimeId === "codex" ? "Codex" : null),
      adapterId: runtimeView?.adapterId || event?.adapterId || previous?.adapterId || null,
      protocol: runtimeView?.protocol || previous?.protocol || null,
      status: runtimeView?.status || previous?.status || "disconnected",
      sessionId: runtimeView?.sessionId || event?.sessionId || previous?.sessionId || null,
      activeTurnId: runtimeView?.activeTurnId ?? event?.turnId ?? previous?.activeTurnId ?? null,
      model: runtimeView?.model || previous?.model || null,
      modelProvider: runtimeView?.modelProvider || previous?.modelProvider || null,
      executableVersion: runtimeView?.executableVersion || previous?.executableVersion || null,
      executableHash: runtimeView?.executableHash || previous?.executableHash || null,
      connectedAt: runtimeView?.connectedAt || previous?.connectedAt || null,
      lastEventAt: event?.recordedAt || event?.at || runtimeView?.lastEventAt || previous?.lastEventAt || null,
      lastError: runtimeView?.lastError || previous?.lastError || null,
      pendingApprovals: runtimeView?.pendingApprovals || previous?.pendingApprovals || [],
      lastSequence: event?.sequence ?? previous?.lastSequence ?? 0,
      lastEventHash: event?.eventHash ?? previous?.lastEventHash ?? null,
      updatedAt: clock().toISOString()
    };
    if (event?.type === "session.accepted") next.status = "connected";
    if (event?.type === "session.disconnected") next.status = "disconnected";
    if (event?.type === "session.closed") next.status = "closed";
    if (event?.type === "session.failed") next.status = "failed";
    if (["turn.completed", "turn.failed", "turn.interrupted"].includes(event?.type)) next.activeTurnId = null;
    await atomicWrite(paths.sessionPath, next);
    return next;
  }

  async function appendEvent(nativeEvent) {
    const runId = safeId(nativeEvent.runId, "Run ID");
    return serialize(eventQueues, runId, async () => {
      const { paths, session } = await loadSession(runId);
      await mkdir(paths.eventsDirectory, { recursive: true });
      const sequence = Number(session?.lastSequence || 0) + 1;
      const eventWithoutHash = {
        schemaVersion: SCHEMA_VERSION,
        runId,
        sessionId: nativeEvent.sessionId || session?.sessionId || null,
        sequence,
        eventId: nativeEvent.eventId || `live-${randomUUID()}`,
        previousHash: session?.lastEventHash || null,
        recordedAt: nativeEvent.at || clock().toISOString(),
        source: {
          runtimeId: nativeEvent.runtimeId || session?.runtimeId || null,
          adapterId: nativeEvent.adapterId || session?.adapterId || null,
          nativeSequence: nativeEvent.sequence || null,
          nativeMethod: nativeEvent.nativeMethod || null
        },
        type: nativeEvent.type,
        turnId: nativeEvent.turnId || null,
        payload: Object.fromEntries(Object.entries(nativeEvent).filter(([key]) => ![
          "schemaVersion", "runId", "sessionId", "sequence", "eventId", "at", "runtimeId", "adapterId", "nativeMethod", "type", "turnId"
        ].includes(key)))
      };
      const event = { ...eventWithoutHash, eventHash: valueHash(eventWithoutHash) };
      await atomicWrite(path.join(paths.eventsDirectory, `${String(sequence).padStart(8, "0")}.json`), event);
      await persistRuntimeSession(runId, runtimeController.read(runId), event);
      return event;
    });
  }

  const runtimeController = createRuntimeController({ onEvent: appendEvent });

  async function events(runId, afterSequence = 0) {
    const paths = await location(runId);
    let entries;
    try {
      entries = (await readdir(paths.eventsDirectory)).filter((name) => EVENT_FILE.test(name)).sort();
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    return Promise.all(entries
      .filter((name) => Number(name.slice(0, 8)) > Number(afterSequence || 0))
      .map((name) => readJson(path.join(paths.eventsDirectory, name))));
  }

  async function command(envelope) {
    if (!envelope || typeof envelope !== "object" || envelope.schemaVersion !== SCHEMA_VERSION) {
      throw liveError("Live session command schema is invalid.", "VALIDATION_ERROR", 422);
    }
    const runId = safeId(envelope.runId, "Run ID");
    const commandId = safeId(envelope.commandId, "Command ID");
    if (!envelope.actor || !["local-user", "system"].includes(envelope.actor.kind)) {
      throw liveError("Live session command actor is invalid.", "POLICY_BLOCKED", 403);
    }
    if (!envelope.command || typeof envelope.command.kind !== "string") {
      throw liveError("Live session command is required.", "VALIDATION_ERROR", 422);
    }
    return serialize(commandQueues, runId, async () => {
      const paths = await location(runId);
      await mkdir(paths.commandsDirectory, { recursive: true });
      const commandPath = path.join(paths.commandsDirectory, `${commandId}.json`);
      const commandHash = valueHash(envelope);
      try {
        const existing = await readJson(commandPath);
        if (existing.commandHash !== commandHash) throw liveError("Command ID was already used with different input.", "IDEMPOTENCY_CONFLICT", 409);
        if (existing.receipt) return existing.receipt;
        throw liveError("This command has an unresolved prior submission and will not be resubmitted automatically.", "AMBIGUOUS_SUBMISSION", 409);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      const record = {
        schemaVersion: SCHEMA_VERSION,
        runId,
        commandId,
        commandHash,
        envelope,
        state: "queued",
        queuedAt: clock().toISOString(),
        submittedAt: null,
        completedAt: null,
        receipt: null,
        error: null
      };
      await atomicWrite(commandPath, record);
      record.state = "submitted";
      record.submittedAt = clock().toISOString();
      await atomicWrite(commandPath, record);
      let providerReceipt;
      try {
        if (envelope.command.kind === "connect") {
          const runtimeId = safeId(envelope.command.runtimeId, "Runtime ID");
          providerReceipt = await runtimeController.connect({ runId, runtimeId, cwd: paths.projectDirectory });
          activeRuns.add(runId);
          await persistRuntimeSession(runId, providerReceipt);
        } else if (envelope.command.kind === "prompt") {
          if (typeof envelope.command.text !== "string" || !envelope.command.text.trim()) {
            throw liveError("Prompt text is required.", "VALIDATION_ERROR", 422);
          }
          providerReceipt = await runtimeController.prompt({ runId, text: envelope.command.text.trim() });
        } else if (envelope.command.kind === "interrupt") {
          providerReceipt = await runtimeController.interrupt({ runId });
        } else if (envelope.command.kind === "decide") {
          if (envelope.actor.kind !== "local-user") throw liveError("Only the local user may decide an approval.", "POLICY_BLOCKED", 403);
          providerReceipt = await runtimeController.decide({
            runId,
            requestId: safeId(String(envelope.command.requestId), "Request ID"),
            decision: envelope.command.decision
          });
        } else if (envelope.command.kind === "close") {
          await runtimeController.closeRun(runId);
          activeRuns.delete(runId);
          providerReceipt = { accepted: true, closed: true };
        } else {
          throw liveError("Live session command is not supported.", "VALIDATION_ERROR", 422);
        }
      } catch (error) {
        record.state = "failed";
        record.completedAt = clock().toISOString();
        record.error = { code: error.code || "LIVE_COMMAND_FAILED", message: error.message };
        await atomicWrite(commandPath, record);
        throw error;
      }
      const view = runtimeController.read(runId) || (await loadSession(runId)).session;
      const receipt = {
        accepted: providerReceipt?.accepted !== false,
        commandId,
        runId,
        sessionId: providerReceipt?.sessionId || view?.sessionId || null,
        turnId: providerReceipt?.turnId || null,
        status: view?.status || null,
        eventCursor: Number(view?.lastSequence || (await loadSession(runId)).session?.lastSequence || 0),
        providerReceipt
      };
      record.state = "completed";
      record.completedAt = clock().toISOString();
      record.receipt = receipt;
      await atomicWrite(commandPath, record);
      return receipt;
    });
  }

  async function read(query) {
    if (query.kind === "session") {
      const { session } = await loadSession(query.runId);
      if (!session) return null;
      const runtimeView = activeRuns.has(query.runId) ? runtimeController.read(query.runId) : null;
      return publicSession(runtimeView ? { ...session, ...runtimeView } : session, { attached: Boolean(runtimeView) });
    }
    if (query.kind === "events") return events(query.runId, query.afterSequence);
    throw liveError("Live session query is not supported.", "VALIDATION_ERROR", 422);
  }

  async function* follow({ runId, afterSequence = 0, signal, pollMs = 250 }) {
    let cursor = Number(afterSequence || 0);
    while (!signal?.aborted) {
      const batch = await events(runId, cursor);
      for (const event of batch) {
        cursor = event.sequence;
        yield event;
      }
      if (signal?.aborted) break;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  async function shutdown() {
    await runtimeController.close();
    activeRuns.clear();
  }

  return { command, read, follow, shutdown };
}
