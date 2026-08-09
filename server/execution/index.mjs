import { createHash } from "node:crypto";
import path from "node:path";
import { createAdapterRegistry } from "./adapters.mjs";

export {
  createAdapterRegistry,
  createInMemoryAdapter,
  createLocalFakeAdapter,
} from "./adapters.mjs";
export {
  createJsonExecutionStorage,
  EXECUTION_JOURNAL_FILE,
  EXECUTION_SNAPSHOT_FILE,
} from "./json-storage.mjs";

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ACTIVE_JOB_STATES = new Set([
  "submitting",
  "accepted",
  "running",
  "reconciling",
  "unknown",
  "cancel_pending",
  "cancel_unknown",
]);
const RECONCILABLE_JOB_STATES = new Set([
  "submitting",
  "accepted",
  "running",
  "reconciling",
  "unknown",
]);
const TERMINAL_JOB_STATES = new Set(["succeeded", "failed", "cancelled"]);
const ADAPTER_RESULT_STATES = new Set([
  "accepted",
  "running",
  "succeeded",
  "failed",
  "unknown",
  "cancelled",
]);

function executionError(message, code = "EXECUTION_INVALID") {
  return Object.assign(new Error(message), { code });
}

function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw executionError("Execution state cannot contain non-finite numbers.");
  }
  return value;
}

function stableHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw executionError(`${label} must be a stable identifier.`);
  }
  return value;
}

function assertString(value, label, maximum = 512) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw executionError(`${label} must be non-empty text no longer than ${maximum} characters.`);
  }
  return value;
}

function integerInRange(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw executionError(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

function nowFrom(clock) {
  const value = typeof clock === "function" ? clock() : clock.now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw executionError("clock returned an invalid time.");
  return date.toISOString();
}

function normalizeAuthority(authority, requiredGrant) {
  if (!authority || typeof authority !== "object") {
    throw executionError("Explicit authority is required for execution mutations.", "EXECUTION_AUTHORITY_REQUIRED");
  }
  const actorId = assertIdentifier(authority.actorId, "authority.actorId");
  if (!Array.isArray(authority.grants)) {
    throw executionError("authority.grants must be an array.", "EXECUTION_AUTHORITY_REQUIRED");
  }
  const grants = new Set(authority.grants.map((grant) => assertIdentifier(grant, "authority grant")));
  if (!grants.has(requiredGrant)) {
    throw executionError(
      `Authority grant ${requiredGrant} is required.`,
      "EXECUTION_AUTHORITY_REQUIRED",
    );
  }
  return { actorId, grants };
}

function normalizeRoute(candidate, strategyId, index) {
  const route = typeof candidate === "string" ? { adapterId: candidate } : candidate;
  if (!route || typeof route !== "object") {
    throw executionError(`Strategy route ${index + 1} must be an adapter ID or route object.`);
  }
  const routeStrategyId = route.strategyId || strategyId;
  if (routeStrategyId !== strategyId) {
    throw executionError(
      `Fallback route ${route.adapterId || index + 1} leaves strategy ${strategyId}.`,
      "EXECUTION_STRATEGY_ESCAPE",
    );
  }
  return {
    adapterId: assertIdentifier(route.adapterId, `strategy route ${index + 1} adapterId`),
    strategyId,
    maxAttempts: integerInRange(route.maxAttempts ?? 1, "route maxAttempts", 1, 20),
  };
}

function topologicalOrder(jobs) {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const indegree = new Map(jobs.map((job) => [job.id, job.dependsOn.length]));
  const dependents = new Map(jobs.map((job) => [job.id, []]));
  for (const job of jobs) {
    for (const dependencyId of job.dependsOn) dependents.get(dependencyId).push(job.id);
  }

  const ready = jobs.filter((job) => indegree.get(job.id) === 0).map((job) => job.id);
  const order = [];
  while (ready.length > 0) {
    const id = ready.shift();
    order.push(id);
    for (const dependentId of dependents.get(id)) {
      const next = indegree.get(dependentId) - 1;
      indegree.set(dependentId, next);
      if (next === 0) ready.push(dependentId);
    }
  }
  if (order.length !== jobs.length) {
    throw executionError("Director execution jobs must form an acyclic graph.", "EXECUTION_DAG_CYCLE");
  }
  return { order, byId };
}

function materializeDag(directorPlan) {
  const rawJobs = directorPlan?.execution?.jobs;
  if (!Array.isArray(rawJobs) || rawJobs.length < 1) {
    throw executionError("directorPlan.execution.jobs must contain at least one job.");
  }

  const rawById = new Map();
  for (const rawJob of rawJobs) {
    const id = assertIdentifier(rawJob?.id, "Director job ID");
    if (rawById.has(id)) throw executionError(`Duplicate Director job ID: ${id}.`);
    rawById.set(id, rawJob);
  }
  const selectedIds = new Set(
    rawJobs.filter((job) => job.selected !== false).map((job) => job.id),
  );

  const jobs = rawJobs
    .filter((rawJob) => rawJob.selected !== false)
    .map((rawJob) => {
      const dependencies = rawJob.dependsOn ?? [];
      if (!Array.isArray(dependencies)) throw executionError(`${rawJob.id}.dependsOn must be an array.`);
      const dependsOn = [...new Set(dependencies.map((id) => assertIdentifier(id, "dependency ID")))];
      for (const dependencyId of dependsOn) {
        if (!rawById.has(dependencyId)) {
          throw executionError(`${rawJob.id} depends on missing job ${dependencyId}.`);
        }
        if (!selectedIds.has(dependencyId)) {
          throw executionError(`${rawJob.id} depends on unselected job ${dependencyId}.`);
        }
      }

      const strategyId = assertIdentifier(
        rawJob.strategy?.id || rawJob.strategyId || rawJob.laneId || rawJob.id,
        `${rawJob.id} strategy ID`,
      );
      const candidateRoutes = rawJob.strategy?.routes ?? rawJob.adapterCandidates;
      if (!Array.isArray(candidateRoutes) || candidateRoutes.length < 1) {
        throw executionError(`${rawJob.id} needs at least one strategy-scoped adapter route.`);
      }
      const routes = candidateRoutes.map((candidate, index) => normalizeRoute(candidate, strategyId, index));
      const routeAttemptCapacity = routes.reduce((sum, route) => sum + route.maxAttempts, 0);
      const maxAttempts = integerInRange(
        rawJob.maxAttempts ?? routeAttemptCapacity,
        `${rawJob.id} maxAttempts`,
        1,
        routeAttemptCapacity,
      );
      const approvalIds = [...new Set(
        (rawJob.approvalIds ?? []).map((id) => assertIdentifier(id, "approval ID")),
      )];
      const outputRoles = [...new Set(
        (rawJob.outputRoles ?? []).map((role) => assertIdentifier(role, "output role")),
      )];

      return {
        id: rawJob.id,
        laneId: rawJob.laneId ? assertIdentifier(rawJob.laneId, `${rawJob.id} laneId`) : null,
        dependsOn,
        approvalIds,
        outputRoles,
        payload: copy(rawJob.payload ?? {}),
        strategy: { id: strategyId, routes },
        maxAttempts,
        attempts: [],
        exhaustedRouteIndexes: [],
        state: "waiting_dependencies",
        lastError: null,
        receipt: null,
        cancellationRequested: false,
        cancellationKey: null,
      };
    });

  const { order } = topologicalOrder(jobs);
  const approvalDefinitions = new Map(
    (directorPlan.approvals ?? []).map((approval) => [approval.id, approval]),
  );
  const requiredApprovalIds = [...new Set(jobs.flatMap((job) => job.approvalIds))];
  const approvals = requiredApprovalIds.map((id) => ({
    id,
    scope: typeof approvalDefinitions.get(id)?.scope === "string"
      ? approvalDefinitions.get(id).scope.slice(0, 512)
      : null,
    status: "pending",
    actorId: null,
    scopeHash: null,
    evidenceHash: null,
    decidedAt: null,
  }));

  const dagDefinition = {
    order,
    jobs: jobs.map((job) => ({
      id: job.id,
      laneId: job.laneId,
      dependsOn: job.dependsOn,
      approvalIds: job.approvalIds,
      outputRoles: job.outputRoles,
      payload: job.payload,
      strategy: job.strategy,
      maxAttempts: job.maxAttempts,
    })),
  };
  return { jobs, order, approvals, dagDefinition };
}

function jobById(snapshot, id) {
  const job = snapshot.jobs.find((candidate) => candidate.id === id);
  if (!job) throw executionError(`Unknown execution job: ${id}.`, "EXECUTION_JOB_NOT_FOUND");
  return job;
}

function approvalById(snapshot, id) {
  const approval = snapshot.approvals.find((candidate) => candidate.id === id);
  if (!approval) throw executionError(`Unknown execution approval: ${id}.`, "EXECUTION_APPROVAL_NOT_FOUND");
  return approval;
}

function nextRoute(job) {
  if (job.attempts.length >= job.maxAttempts) return null;
  const exhausted = new Set(job.exhaustedRouteIndexes);
  for (let routeIndex = 0; routeIndex < job.strategy.routes.length; routeIndex += 1) {
    if (exhausted.has(routeIndex)) continue;
    const route = job.strategy.routes[routeIndex];
    const used = job.attempts.filter((attempt) => attempt.routeIndex === routeIndex).length;
    if (used < route.maxAttempts) return { route, routeIndex, routeAttempt: used + 1 };
  }
  return null;
}

function refreshSnapshot(snapshot) {
  const approvals = new Map(snapshot.approvals.map((approval) => [approval.id, approval]));
  const jobs = new Map(snapshot.jobs.map((job) => [job.id, job]));

  for (const id of snapshot.dagOrder) {
    const job = jobs.get(id);
    if (TERMINAL_JOB_STATES.has(job.state) || ACTIVE_JOB_STATES.has(job.state)) continue;

    const denied = job.approvalIds.find((approvalId) => approvals.get(approvalId)?.status === "denied");
    if (denied) {
      job.state = "failed";
      job.lastError = { code: "APPROVAL_DENIED", approvalId: denied };
      continue;
    }

    const terminalDependency = job.dependsOn
      .map((dependencyId) => jobs.get(dependencyId))
      .find((dependency) => dependency.state === "failed" || dependency.state === "cancelled");
    if (terminalDependency) {
      job.state = snapshot.cancelRequestedAt ? "cancelled" : "failed";
      job.lastError = {
        code: terminalDependency.state === "cancelled" ? "UPSTREAM_CANCELLED" : "UPSTREAM_FAILED",
        dependencyId: terminalDependency.id,
      };
      continue;
    }

    if (!job.dependsOn.every((dependencyId) => jobs.get(dependencyId).state === "succeeded")) {
      job.state = "waiting_dependencies";
      continue;
    }

    const missingApproval = job.approvalIds.find((approvalId) => {
      const approval = approvals.get(approvalId);
      return approval?.status !== "granted" || approval.scopeHash !== snapshot.scopeHash;
    });
    if (missingApproval) {
      job.state = "blocked_approval";
      continue;
    }

    if (!nextRoute(job)) {
      job.state = "failed";
      job.lastError ||= { code: "ATTEMPTS_EXHAUSTED" };
      continue;
    }
    job.state = "runnable";
  }

  const states = snapshot.jobs.map((job) => job.state);
  if (snapshot.cancelRequestedAt) {
    snapshot.status = states.some((state) => ACTIVE_JOB_STATES.has(state)) ? "cancelling" : "cancelled";
  } else if (states.every((state) => state === "succeeded")) {
    snapshot.status = "succeeded";
  } else if (states.some((state) => state === "unknown" || state === "reconciling" || state === "submitting")) {
    snapshot.status = "needs_reconciliation";
  } else if (states.some((state) => state === "accepted" || state === "running")) {
    snapshot.status = "active";
  } else if (states.includes("runnable")) {
    snapshot.status = "active";
  } else if (states.some((state) => state === "failed")) {
    snapshot.status = "failed";
  } else if (states.some((state) => state === "blocked_approval") && !states.includes("runnable")) {
    snapshot.status = "needs_approval";
  } else {
    snapshot.status = "active";
  }
  snapshot.runnableJobIds = snapshot.dagOrder.filter((id) => jobById(snapshot, id).state === "runnable");
  return snapshot;
}

function safeRelativePath(relativePath, label) {
  assertString(relativePath, label, 1024);
  if (path.isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw executionError(`${label} must be a safe run-relative path.`);
  }
  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw executionError(`${label} must stay inside the run directory.`);
  }
  return normalized;
}

function normalizeOutputs(outputs, expectedRoles) {
  if (!Array.isArray(outputs)) throw executionError("A succeeded adapter result must include outputs.");
  const normalized = outputs.map((output, index) => {
    if (!output || typeof output !== "object") throw executionError(`Output ${index + 1} must be an object.`);
    return {
      role: assertIdentifier(output.role, `output ${index + 1} role`),
      relativePath: safeRelativePath(output.relativePath, `output ${index + 1} relativePath`),
      sha256: SHA256.test(output.sha256 || "")
        ? output.sha256
        : (() => { throw executionError(`Output ${index + 1} needs an exact SHA-256.`); })(),
      bytes: integerInRange(output.bytes, `output ${index + 1} bytes`, 1, Number.MAX_SAFE_INTEGER),
      mediaType: output.mediaType === undefined ? null : assertString(output.mediaType, "output mediaType", 128),
    };
  });
  const roles = new Set(normalized.map((output) => output.role));
  for (const role of expectedRoles) {
    if (!roles.has(role)) throw executionError(`Succeeded result is missing required output role ${role}.`);
  }
  return normalized;
}

function normalizeAdapterResult(result, expectedRoles) {
  if (!result || typeof result !== "object" || !ADAPTER_RESULT_STATES.has(result.status)) {
    throw executionError("Adapter result has an unknown or missing status.");
  }
  return {
    status: result.status,
    externalId: result.externalId === undefined || result.externalId === null
      ? null
      : assertString(String(result.externalId), "adapter externalId", 512),
    outputs: result.status === "succeeded" ? normalizeOutputs(result.outputs ?? [], expectedRoles) : [],
    retryable: result.retryable !== false,
    fatal: result.fatal === true,
    reasonCode: result.reasonCode && IDENTIFIER.test(result.reasonCode)
      ? result.reasonCode
      : null,
  };
}

function lastAttempt(job) {
  return job.attempts.at(-1) || null;
}

function makeReceipt(snapshot, job, attempt, observation, at) {
  const receipt = {
    schemaVersion: 1,
    runId: snapshot.runId,
    scopeHash: snapshot.scopeHash,
    jobId: job.id,
    strategyId: job.strategy.id,
    adapterId: attempt.adapterId,
    attemptNumber: attempt.number,
    submissionKey: attempt.submissionKey,
    externalId: observation.externalId || attempt.externalId,
    completedAt: at,
    outputs: observation.outputs,
  };
  return { ...receipt, receiptHash: stableHash(receipt) };
}

function applyObservation(snapshot, job, attempt, observation, at) {
  attempt.observedAt = at;
  if (observation.externalId) attempt.externalId = observation.externalId;

  if (observation.status === "accepted" || observation.status === "running") {
    attempt.state = observation.status;
    job.state = observation.status;
    job.lastError = null;
    return;
  }
  if (observation.status === "unknown") {
    attempt.state = "unknown";
    job.state = "unknown";
    job.lastError = { code: observation.reasonCode || "SUBMISSION_UNKNOWN" };
    return;
  }
  if (observation.status === "cancelled") {
    attempt.state = "cancelled";
    attempt.completedAt = at;
    job.state = "cancelled";
    job.lastError = null;
    return;
  }
  if (observation.status === "failed") {
    attempt.state = "failed";
    attempt.completedAt = at;
    job.lastError = { code: observation.reasonCode || "ADAPTER_REPORTED_FAILURE" };
    if (observation.fatal) {
      job.state = "failed";
    } else {
      if (!observation.retryable && !job.exhaustedRouteIndexes.includes(attempt.routeIndex)) {
        job.exhaustedRouteIndexes.push(attempt.routeIndex);
      }
      job.state = "runnable";
    }
    return;
  }

  attempt.state = "succeeded";
  attempt.completedAt = at;
  const receipt = makeReceipt(snapshot, job, attempt, observation, at);
  job.receipt = receipt;
  job.state = "succeeded";
  job.lastError = null;
  snapshot.receipts = snapshot.receipts.filter((candidate) => candidate.jobId !== job.id);
  snapshot.receipts.push(receipt);
}

function markUnknown(job, attempt, code, at) {
  attempt.state = "unknown";
  attempt.observedAt = at;
  job.state = "unknown";
  job.lastError = { code };
}

function markKnownSubmissionFailure(job, attempt, error, at) {
  attempt.state = "failed";
  attempt.observedAt = at;
  attempt.completedAt = at;
  job.lastError = {
    code: IDENTIFIER.test(error?.code || "") ? error.code : "ADAPTER_SUBMISSION_REJECTED",
  };
  if (error?.fatal === true) {
    job.state = "failed";
  } else {
    if (error?.retryable === false && !job.exhaustedRouteIndexes.includes(attempt.routeIndex)) {
      job.exhaustedRouteIndexes.push(attempt.routeIndex);
    }
    job.state = "runnable";
  }
}

function adapterRequest(snapshot, job, attempt) {
  return {
    adapterId: attempt.adapterId,
    runId: snapshot.runId,
    scopeHash: snapshot.scopeHash,
    strategyId: job.strategy.id,
    submissionKey: attempt.submissionKey,
    attemptNumber: attempt.number,
    routeAttempt: attempt.routeAttempt,
    externalId: attempt.externalId,
    job: {
      id: job.id,
      laneId: job.laneId,
      dependsOn: copy(job.dependsOn),
      outputRoles: copy(job.outputRoles),
      payload: copy(job.payload),
    },
  };
}

function normalizeRegistry(adapters) {
  if (Array.isArray(adapters)) return createAdapterRegistry(adapters);
  if (adapters && typeof adapters.get === "function" && typeof adapters.list === "function") return adapters;
  throw new TypeError("adapters must be an adapter registry or adapter array.");
}

function normalizeStorage(storage) {
  if (!storage || typeof storage.load !== "function" || typeof storage.commit !== "function") {
    throw new TypeError("storage must implement load() and commit().");
  }
  return storage;
}

/**
 * Deep execution module. Callers learn three methods; scheduling, authority,
 * idempotency, fallback, reconciliation, receipts, and durable continuation
 * remain inside the module.
 */
export function createExecutionEngine({ storage, adapters, clock = () => new Date() } = {}) {
  const stateStorage = normalizeStorage(storage);
  const registry = normalizeRegistry(adapters);
  if (typeof clock !== "function" && typeof clock?.now !== "function") {
    throw new TypeError("clock must be a function or expose now().");
  }

  async function persist(previous, proposed, event, actorId) {
    const next = refreshSnapshot(copy(proposed));
    next.revision = (previous?.revision ?? -1) + 1;
    next.updatedAt = nowFrom(clock);
    return stateStorage.commit({
      runDirectory: event.runDirectory,
      expectedRevision: previous?.revision ?? -1,
      snapshot: next,
      event: {
        type: event.type,
        actorId,
        details: copy(event.details ?? {}),
      },
    });
  }

  async function materialize({ runId, runDirectory, directorPlan, authority }) {
    const { actorId } = normalizeAuthority(authority, "persist");
    assertIdentifier(runId, "runId");
    const existing = await stateStorage.load(runDirectory);
    const { jobs, order, approvals, dagDefinition } = materializeDag(directorPlan);
    const scopeHash = stableHash({
      directorPlanHash: directorPlan.planHash || null,
      dag: dagDefinition,
    });

    if (existing) {
      if (existing.runId !== runId || existing.scopeHash !== scopeHash) {
        throw executionError(
          "The supplied run directory already contains a different execution.",
          "EXECUTION_RUN_CONFLICT",
        );
      }
      return copy(existing);
    }

    const createdAt = nowFrom(clock);
    const initial = {
      schemaVersion: 1,
      runId,
      scopeHash,
      directorPlanHash: directorPlan.planHash || null,
      status: "active",
      createdAt,
      updatedAt: createdAt,
      revision: -1,
      dagOrder: order,
      jobs,
      approvals,
      receipts: [],
      runnableJobIds: [],
      cancelRequestedAt: null,
      cancelledBy: null,
    };
    return persist(null, initial, {
      runDirectory,
      type: "execution_materialized",
      details: { runId, scopeHash, jobIds: order },
    }, actorId);
  }

  async function commitApprovalCommand(current, runDirectory, executionCommand, authorityInfo) {
    if (!authorityInfo.grants.has("approve")) {
      throw executionError("Authority grant approve is required.", "EXECUTION_AUTHORITY_REQUIRED");
    }
    if (!Array.isArray(executionCommand.approvals) || executionCommand.approvals.length < 1) {
      throw executionError("approve requires at least one approval decision.");
    }
    const next = copy(current);
    const decidedAt = nowFrom(clock);
    const decisions = [];
    for (const decision of executionCommand.approvals) {
      const id = assertIdentifier(decision?.id, "approval decision ID");
      if (decision.scopeHash !== current.scopeHash) {
        throw executionError(`Approval ${id} is not bound to this execution scope.`, "EXECUTION_STALE_APPROVAL");
      }
      const status = decision.decision === "deny" ? "denied" : decision.decision === "grant" ? "granted" : null;
      if (!status) throw executionError("Approval decision must be grant or deny.");
      if (decision.evidenceHash !== undefined && !SHA256.test(decision.evidenceHash)) {
        throw executionError("approval evidenceHash must be a SHA-256 when supplied.");
      }
      const approval = approvalById(next, id);
      approval.status = status;
      approval.actorId = authorityInfo.actorId;
      approval.scopeHash = current.scopeHash;
      approval.evidenceHash = decision.evidenceHash || null;
      approval.decidedAt = decidedAt;
      decisions.push({ id, status });
    }
    return persist(current, next, {
      runDirectory,
      type: "approval_decided",
      details: { decisions },
    }, authorityInfo.actorId);
  }

  async function reconcileOne(current, runDirectory, jobId, actorId) {
    let next = copy(current);
    let job = jobById(next, jobId);
    const attempt = lastAttempt(job);
    if (!attempt) return current;
    job.state = "reconciling";
    attempt.state = "reconciling";
    next = await persist(current, next, {
      runDirectory,
      type: "reconciliation_started",
      details: { jobId, submissionKey: attempt.submissionKey },
    }, actorId);

    job = jobById(next, jobId);
    const activeAttempt = lastAttempt(job);
    const adapter = registry.get(activeAttempt.adapterId);
    const observedAt = nowFrom(clock);
    let eventDetails;
    if (!adapter || typeof adapter.reconcile !== "function") {
      markUnknown(job, activeAttempt, "RECONCILIATION_UNAVAILABLE", observedAt);
      eventDetails = { jobId, status: "unknown", code: "RECONCILIATION_UNAVAILABLE" };
    } else {
      try {
        const raw = await adapter.reconcile(adapterRequest(next, job, activeAttempt));
        try {
          const observation = normalizeAdapterResult(raw, job.outputRoles);
          applyObservation(next, job, activeAttempt, observation, observedAt);
          eventDetails = { jobId, status: observation.status };
        } catch {
          markUnknown(job, activeAttempt, "INVALID_RECONCILIATION_RECEIPT", observedAt);
          eventDetails = { jobId, status: "unknown", code: "INVALID_RECONCILIATION_RECEIPT" };
        }
      } catch (error) {
        markUnknown(
          job,
          activeAttempt,
          IDENTIFIER.test(error?.code || "") ? error.code : "RECONCILIATION_ERROR",
          observedAt,
        );
        eventDetails = { jobId, status: "unknown", code: job.lastError.code };
      }
    }
    return persist(next, next, {
      runDirectory,
      type: "reconciliation_observed",
      details: eventDetails,
    }, actorId);
  }

  async function submitOne(current, runDirectory, jobId, actorId) {
    let next = copy(current);
    let job = jobById(next, jobId);
    const routeSelection = nextRoute(job);
    if (!routeSelection) {
      job.state = "failed";
      job.lastError = { code: "ATTEMPTS_EXHAUSTED" };
      return persist(current, next, {
        runDirectory,
        type: "attempts_exhausted",
        details: { jobId },
      }, actorId);
    }

    const number = job.attempts.length + 1;
    const submissionKey = stableHash({
      runId: next.runId,
      scopeHash: next.scopeHash,
      jobId,
      strategyId: job.strategy.id,
      routeIndex: routeSelection.routeIndex,
      routeAttempt: routeSelection.routeAttempt,
    });
    const startedAt = nowFrom(clock);
    job.attempts.push({
      number,
      routeIndex: routeSelection.routeIndex,
      routeAttempt: routeSelection.routeAttempt,
      strategyId: job.strategy.id,
      adapterId: routeSelection.route.adapterId,
      submissionKey,
      externalId: null,
      state: "submitting",
      startedAt,
      observedAt: null,
      completedAt: null,
    });
    job.state = "submitting";
    job.lastError = null;
    next = await persist(current, next, {
      runDirectory,
      type: "submission_intent_recorded",
      details: {
        jobId,
        adapterId: routeSelection.route.adapterId,
        strategyId: job.strategy.id,
        submissionKey,
      },
    }, actorId);

    job = jobById(next, jobId);
    const attempt = lastAttempt(job);
    const adapter = registry.get(attempt.adapterId);
    const observedAt = nowFrom(clock);
    let eventDetails;
    if (!adapter) {
      markKnownSubmissionFailure(job, attempt, {
        code: "ADAPTER_UNAVAILABLE",
        definitelyNotSubmitted: true,
        retryable: false,
      }, observedAt);
      eventDetails = { jobId, status: "failed", code: "ADAPTER_UNAVAILABLE" };
    } else {
      try {
        const raw = await adapter.submit(adapterRequest(next, job, attempt));
        try {
          const observation = normalizeAdapterResult(raw, job.outputRoles);
          applyObservation(next, job, attempt, observation, observedAt);
          eventDetails = { jobId, status: observation.status };
        } catch {
          markUnknown(job, attempt, "INVALID_SUBMISSION_RECEIPT", observedAt);
          eventDetails = { jobId, status: "unknown", code: "INVALID_SUBMISSION_RECEIPT" };
        }
      } catch (error) {
        if (error?.definitelyNotSubmitted === true) {
          markKnownSubmissionFailure(job, attempt, error, observedAt);
          eventDetails = { jobId, status: "failed", code: job.lastError.code };
        } else {
          markUnknown(
            job,
            attempt,
            IDENTIFIER.test(error?.code || "") ? error.code : "SUBMISSION_AMBIGUOUS",
            observedAt,
          );
          eventDetails = { jobId, status: "unknown", code: job.lastError.code };
        }
      }
    }
    return persist(next, next, {
      runDirectory,
      type: "submission_observed",
      details: eventDetails,
    }, actorId);
  }

  async function advanceCommand(current, runDirectory, executionCommand, authorityInfo, reconcileOnly) {
    let next = current;
    let remaining = integerInRange(executionCommand.maxJobs ?? 1, "maxJobs", 1, 32);

    if (authorityInfo.grants.has("reconcile")) {
      const activeIds = next.dagOrder.filter((id) => RECONCILABLE_JOB_STATES.has(jobById(next, id).state));
      for (const id of activeIds) {
        if (remaining < 1) break;
        next = await reconcileOne(next, runDirectory, id, authorityInfo.actorId);
        remaining -= 1;
      }
    } else if (reconcileOnly) {
      throw executionError("Authority grant reconcile is required.", "EXECUTION_AUTHORITY_REQUIRED");
    }

    if (!reconcileOnly && authorityInfo.grants.has("submit")) {
      while (remaining > 0) {
        const runnableId = next.dagOrder.find((id) => jobById(next, id).state === "runnable");
        if (!runnableId) break;
        next = await submitOne(next, runDirectory, runnableId, authorityInfo.actorId);
        remaining -= 1;
      }
    }
    return next;
  }

  async function cancelOne(current, runDirectory, jobId, actorId) {
    let next = copy(current);
    let job = jobById(next, jobId);
    const attempt = lastAttempt(job);
    if (!attempt || TERMINAL_JOB_STATES.has(job.state)) return current;
    const adapter = registry.get(attempt.adapterId);
    const observedAt = nowFrom(clock);

    if (!adapter || typeof adapter.cancel !== "function") {
      job.state = "cancel_unknown";
      job.lastError = { code: "CANCELLATION_UNAVAILABLE" };
    } else {
      try {
        const raw = await adapter.cancel({
          ...adapterRequest(next, job, attempt),
          cancellationKey: job.cancellationKey,
        });
        let observation;
        try {
          observation = normalizeAdapterResult(raw, job.outputRoles);
        } catch {
          observation = { status: "unknown" };
        }
        if (observation.status === "cancelled" || observation.status === "succeeded") {
          applyObservation(next, job, attempt, observation, observedAt);
        } else {
          job.state = "cancel_unknown";
          job.lastError = { code: "CANCELLATION_UNCONFIRMED" };
        }
      } catch (error) {
        job.state = "cancel_unknown";
        job.lastError = {
          code: IDENTIFIER.test(error?.code || "") ? error.code : "CANCELLATION_ERROR",
        };
      }
    }
    return persist(current, next, {
      runDirectory,
      type: "cancellation_observed",
      details: { jobId, status: job.state, code: job.lastError?.code || null },
    }, actorId);
  }

  async function cancelCommand(current, runDirectory, executionCommand, authorityInfo) {
    if (!authorityInfo.grants.has("cancel")) {
      throw executionError("Authority grant cancel is required.", "EXECUTION_AUTHORITY_REQUIRED");
    }
    if (executionCommand.jobIds !== undefined && !Array.isArray(executionCommand.jobIds)) {
      throw executionError("cancel jobIds must be an array when supplied.");
    }
    const isRunCancellation = executionCommand.jobIds === undefined;
    const requestedIds = isRunCancellation
      ? current.dagOrder.filter((id) => !TERMINAL_JOB_STATES.has(jobById(current, id).state))
      : [...new Set(executionCommand.jobIds.map((id) => assertIdentifier(id, "cancel job ID")))];
    requestedIds.forEach((id) => jobById(current, id));
    if (requestedIds.length === 0) return current;

    let next = copy(current);
    const requestedAt = nowFrom(clock);
    if (isRunCancellation) {
      next.cancelRequestedAt ||= requestedAt;
      next.cancelledBy ||= authorityInfo.actorId;
    }
    const activeCancellationIds = [];
    for (const id of requestedIds) {
      const job = jobById(next, id);
      if (TERMINAL_JOB_STATES.has(job.state)) continue;
      job.cancellationRequested = true;
      job.cancellationKey ||= stableHash({
        runId: next.runId,
        scopeHash: next.scopeHash,
        jobId: id,
        operation: "cancel",
      });
      if (lastAttempt(job) && ACTIVE_JOB_STATES.has(job.state)) {
        job.state = "cancel_pending";
        activeCancellationIds.push(id);
      } else {
        job.state = "cancelled";
        job.lastError = null;
      }
    }
    next = await persist(current, next, {
      runDirectory,
      type: "cancellation_requested",
      details: { jobIds: requestedIds },
    }, authorityInfo.actorId);

    const maxJobs = integerInRange(executionCommand.maxJobs ?? 32, "maxJobs", 1, 32);
    for (const id of activeCancellationIds.slice(0, maxJobs)) {
      next = await cancelOne(next, runDirectory, id, authorityInfo.actorId);
    }
    return next;
  }

  async function command({ runDirectory, command: executionCommand, authority }) {
    const authorityInfo = normalizeAuthority(authority, "persist");
    const current = await stateStorage.load(runDirectory);
    if (!current) throw executionError("No execution exists in this run directory.", "EXECUTION_NOT_FOUND");
    if (!executionCommand || typeof executionCommand !== "object") {
      throw executionError("command must be an object.");
    }

    if (executionCommand.type === "approve") {
      return commitApprovalCommand(current, runDirectory, executionCommand, authorityInfo);
    }
    if (executionCommand.type === "advance") {
      return advanceCommand(current, runDirectory, executionCommand, authorityInfo, false);
    }
    if (executionCommand.type === "reconcile") {
      return advanceCommand(current, runDirectory, executionCommand, authorityInfo, true);
    }
    if (executionCommand.type === "cancel") {
      return cancelCommand(current, runDirectory, executionCommand, authorityInfo);
    }
    throw executionError("command.type must be approve, advance, reconcile, or cancel.");
  }

  async function inspect({ runDirectory }) {
    const snapshot = await stateStorage.load(runDirectory);
    if (!snapshot) throw executionError("No execution exists in this run directory.", "EXECUTION_NOT_FOUND");
    return copy(snapshot);
  }

  return Object.freeze({ materialize, command, inspect });
}
