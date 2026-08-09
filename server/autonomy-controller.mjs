import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { createAgentExecutionAdapter } from "./agent-execution-adapter.mjs";
import {
  createAdapterRegistry,
  createExecutionEngine,
  createJsonExecutionStorage,
} from "./execution/index.mjs";

const LOCAL_AGENT_ADAPTER_IDS = Object.freeze([
  "local-agent-research",
  "local-agent-director",
  "ffmpeg.local_edit_qa",
  "local-authentic-capture",
  "blender.local_compositor",
  "local.2_5d_device_compositor",
  "hyperframes.local",
  "capcut.desktop_handoff",
]);

export const PRIVATE_EXECUTION_STATE_DIRECTORY = ".execution-state";

function controllerError(message, code, statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode });
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function authorityFor(actorId, grants) {
  return { actorId, grants: ["persist", ...grants] };
}

/**
 * Owns the bridge from a production run to the durable execution kernel.
 * Provider adapters remain replaceable; local tasks are delegated through the
 * connected ACP/App-Server runtime and must return verified manifests.
 */
export function createAutonomyController({
  dataDirectory,
  productionRuns,
  liveSessions,
  mediaVerifier,
  providerAdapters = [],
  storage,
  clock = () => new Date(),
  schedulerIntervalMs = 2_000,
} = {}) {
  if (!path.isAbsolute(dataDirectory || "")) throw new TypeError("dataDirectory must be absolute.");
  if (!productionRuns || typeof productionRuns.read !== "function") throw new TypeError("productionRuns is required.");
  if (!liveSessions || typeof liveSessions.read !== "function") throw new TypeError("liveSessions is required.");
  if (!mediaVerifier || typeof mediaVerifier.verify !== "function") throw new TypeError("mediaVerifier is required.");
  if (!Array.isArray(providerAdapters)) throw new TypeError("providerAdapters must be an array.");

  const dataRoot = path.resolve(dataDirectory);
  const projectsRoot = path.join(dataRoot, "projects");
  const executionStateRoot = path.join(dataRoot, PRIVATE_EXECUTION_STATE_DIRECTORY);
  const stateStorage = storage || createJsonExecutionStorage({ rootDirectory: executionStateRoot });
  const scheduled = new Map();

  async function contextFor(runId) {
    const snapshot = await productionRuns.read({ kind: "snapshot", runId });
    if (snapshot?.id !== runId) {
      throw controllerError("Production run identity does not match the requested run.", "AUTONOMY_RUN_IDENTITY_INVALID", 500);
    }
    const lexicalProjectDirectory = path.resolve(dataRoot, snapshot.projectRelativePath);
    if (!contained(projectsRoot, lexicalProjectDirectory)) {
      throw controllerError("Production run path leaves the projects workspace.", "AUTONOMY_RUN_PATH_INVALID", 500);
    }
    const [projectsStats, projectStats] = await Promise.all([
      lstat(projectsRoot),
      lstat(lexicalProjectDirectory),
    ]);
    if (!projectsStats.isDirectory() || projectsStats.isSymbolicLink()
      || !projectStats.isDirectory() || projectStats.isSymbolicLink()) {
      throw controllerError("Production workspace must use real project directories.", "AUTONOMY_RUN_PATH_INVALID", 500);
    }
    const [projectsReal, projectDirectory] = await Promise.all([
      realpath(projectsRoot),
      realpath(lexicalProjectDirectory),
    ]);
    if (!contained(projectsReal, projectDirectory)) {
      throw controllerError("Production run path leaves the real projects workspace.", "AUTONOMY_RUN_PATH_INVALID", 500);
    }
    const planHash = String(snapshot.directorPlan?.planHash || "unversioned");
    const stateKey = createHash("sha256")
      .update(`framepilot-execution-v1\0${runId}\0${planHash}`)
      .digest("hex");
    const executionDirectory = path.join(executionStateRoot, stateKey);
    if (!contained(executionStateRoot, executionDirectory)) {
      throw controllerError("Execution state path leaves private CutSteward storage.", "AUTONOMY_STATE_PATH_INVALID", 500);
    }
    return { snapshot, projectDirectory, executionDirectory };
  }

  const providerIds = new Set(providerAdapters.map((adapter) => adapter.id));
  const localAdapters = LOCAL_AGENT_ADAPTER_IDS
    .filter((id) => !providerIds.has(id))
    .map((id) => createAgentExecutionAdapter({
      id,
      liveSessions,
      mediaVerifier,
      runDirectoryFor: async (runId) => (await contextFor(runId)).projectDirectory,
      clock,
    }));
  const adapters = createAdapterRegistry([...providerAdapters, ...localAdapters]);
  const engine = createExecutionEngine({ storage: stateStorage, adapters, clock });

  async function ensure({ runId, actorId = "framepilot-system" }) {
    const { snapshot, executionDirectory } = await contextFor(runId);
    return engine.materialize({
      runId,
      runDirectory: executionDirectory,
      directorPlan: snapshot.directorPlan,
      authority: authorityFor(actorId, []),
    });
  }

  async function inspect(runId) {
    const { executionDirectory } = await contextFor(runId);
    try {
      return await engine.inspect({ runDirectory: executionDirectory });
    } catch (error) {
      if (error?.code === "EXECUTION_NOT_FOUND") return null;
      throw error;
    }
  }

  async function connect({ runId, runtimeId, actor }) {
    const { snapshot } = await contextFor(runId);
    const session = await liveSessions.read({ kind: "session", runId });
    if (session?.status === "connected" && session.runtimeId === runtimeId) return session;
    if (session?.status === "connected" && session.runtimeId !== runtimeId) {
      throw controllerError(`Run is already connected to ${session.runtimeId}.`, "AUTONOMY_RUNTIME_CONFLICT");
    }
    await liveSessions.command({
      schemaVersion: 1,
      commandId: `autonomy-connect-${snapshot.revision}-${runtimeId}`,
      runId,
      actor,
      command: { kind: "connect", runtimeId },
    });
    return liveSessions.read({ kind: "session", runId });
  }

  async function decideApprovals({ runId, decisions, actorId }) {
    const { executionDirectory } = await contextFor(runId);
    await ensure({ runId, actorId });
    return engine.command({
      runDirectory: executionDirectory,
      authority: authorityFor(actorId, ["approve"]),
      command: { type: "approve", approvals: decisions },
    });
  }

  async function advance({ runId, actorId = "framepilot-scheduler", maxJobs = 1 }) {
    const { executionDirectory } = await contextFor(runId);
    await ensure({ runId, actorId });
    return engine.command({
      runDirectory: executionDirectory,
      authority: authorityFor(actorId, ["submit", "reconcile"]),
      command: { type: "advance", maxJobs },
    });
  }

  async function reconcile({ runId, actorId = "framepilot-scheduler", maxJobs = 8 }) {
    const { executionDirectory } = await contextFor(runId);
    await ensure({ runId, actorId });
    return engine.command({
      runDirectory: executionDirectory,
      authority: authorityFor(actorId, ["reconcile"]),
      command: { type: "reconcile", maxJobs },
    });
  }

  async function cancel({ runId, actor, jobIds }) {
    if (actor?.kind !== "local-user" || typeof actor.id !== "string" || !actor.id) {
      throw controllerError(
        "Cancelling durable production work requires the authenticated local user.",
        "AUTONOMY_CANCEL_USER_REQUIRED",
        403
      );
    }
    const { executionDirectory } = await contextFor(runId);
    const command = { type: "cancel", maxJobs: 32 };
    if (Array.isArray(jobIds)) command.jobIds = jobIds;
    return engine.command({
      runDirectory: executionDirectory,
      authority: authorityFor(actor.id, ["cancel"]),
      command,
    });
  }

  async function tick(runId) {
    const current = await inspect(runId);
    if (!current || ["succeeded", "failed", "cancelled", "needs_approval"].includes(current.status)) {
      stop(runId);
      return current;
    }
    const session = await liveSessions.read({ kind: "session", runId });
    const next = session?.status === "connected"
      ? await advance({ runId, maxJobs: 2 })
      : await reconcile({ runId, maxJobs: 8 });
    if (["succeeded", "failed", "cancelled", "needs_approval"].includes(next.status)) stop(runId);
    return next;
  }

  function schedule(runId) {
    if (scheduled.has(runId)) return;
    const timer = setInterval(() => {
      void tick(runId).catch(() => stop(runId));
    }, Math.max(500, schedulerIntervalMs));
    timer.unref?.();
    scheduled.set(runId, timer);
    void tick(runId).catch(() => stop(runId));
  }

  function stop(runId) {
    const timer = scheduled.get(runId);
    if (timer) clearInterval(timer);
    scheduled.delete(runId);
  }

  async function shutdown() {
    for (const runId of [...scheduled.keys()]) stop(runId);
  }

  function capabilities() {
    return {
      schemaVersion: 1,
      executionKernel: "durable-dag-v1",
      localAgentAdapters: [...LOCAL_AGENT_ADAPTER_IDS],
      providerAdapters: providerAdapters.map((adapter) => adapter.id),
      registeredAdapters: adapters.list(),
      approvalBound: true,
      privateExecutionState: true,
      workspaceExecutionStateTrusted: false,
      restartReconciliation: true,
    };
  }

  return Object.freeze({ ensure, inspect, connect, decideApprovals, advance, reconcile, cancel, schedule, stop, tick, shutdown, capabilities });
}
