import { createHash } from "node:crypto";

const TERMINAL_RESULTS = new Set(["succeeded", "failed", "cancelled"]);

function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertAdapterId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id)) {
    throw new TypeError("Execution adapter IDs must be stable non-empty identifiers.");
  }
}

function defaultLocalOutputs(request) {
  return request.job.outputRoles.map((role) => {
    const body = JSON.stringify({
      adapterId: request.adapterId,
      jobId: request.job.id,
      role,
      submissionKey: request.submissionKey,
    });
    return {
      role,
      relativePath: `execution-output/${request.job.id}/${role}-${request.submissionKey.slice(0, 12)}.json`,
      sha256: sha256(body),
      bytes: Buffer.byteLength(body),
      mediaType: "application/json",
    };
  });
}

async function evaluate(action, request, fallback) {
  if (action instanceof Error) throw action;
  if (typeof action === "function") return copy(await action(copy(request)));
  if (action === undefined) return copy(fallback);
  return copy(action);
}

/**
 * Registry used by the engine's internal adapter seam. The registry is closed
 * over its entries so callers cannot swap an adapter during an attempt.
 */
export function createAdapterRegistry(adapters = []) {
  if (!Array.isArray(adapters)) throw new TypeError("adapters must be an array.");
  const entries = new Map();

  for (const adapter of adapters) {
    assertAdapterId(adapter?.id);
    if (typeof adapter.submit !== "function") {
      throw new TypeError(`Execution adapter ${adapter.id} must implement submit().`);
    }
    if (entries.has(adapter.id)) throw new TypeError(`Duplicate execution adapter: ${adapter.id}.`);
    entries.set(adapter.id, adapter);
  }

  return Object.freeze({
    get(id) {
      return entries.get(id) || null;
    },
    has(id) {
      return entries.has(id);
    },
    list() {
      return [...entries.keys()];
    },
  });
}

/**
 * A scripted, in-memory stand-in for an external provider. Every scenario is
 * assigned once per new idempotency key and reconciliation advances through
 * its declared states. Duplicate submissions return the original observation.
 */
export function createInMemoryAdapter({ id, scenarios = [] } = {}) {
  assertAdapterId(id);
  if (!Array.isArray(scenarios)) throw new TypeError("scenarios must be an array.");

  const records = new Map();
  let scenarioCursor = 0;
  const activity = {
    submissions: [],
    reconciliations: [],
    cancellations: [],
  };

  return {
    id,
    kind: "in-memory",
    activity,

    async submit(request) {
      const prior = records.get(request.submissionKey);
      activity.submissions.push({
        submissionKey: request.submissionKey,
        jobId: request.job.id,
        duplicate: Boolean(prior),
      });
      if (prior) {
        if (prior.submitError) throw prior.submitError;
        return copy(prior.lastResult);
      }

      const scenario = scenarios[scenarioCursor] || {};
      scenarioCursor += 1;
      const record = {
        scenario,
        reconcileCursor: 0,
        lastResult: null,
        submitError: null,
      };
      records.set(request.submissionKey, record);

      try {
        record.lastResult = await evaluate(scenario.submit, request, {
          status: "accepted",
          externalId: `${id}:${request.submissionKey.slice(0, 16)}`,
        });
        return copy(record.lastResult);
      } catch (error) {
        record.submitError = error;
        throw error;
      }
    },

    async reconcile(request) {
      activity.reconciliations.push({
        submissionKey: request.submissionKey,
        jobId: request.job.id,
      });
      const record = records.get(request.submissionKey);
      if (!record) return { status: "unknown" };
      const sequence = Array.isArray(record.scenario.reconcile)
        ? record.scenario.reconcile
        : record.scenario.reconcile === undefined
          ? []
          : [record.scenario.reconcile];
      const action = sequence[Math.min(record.reconcileCursor, Math.max(0, sequence.length - 1))];
      if (record.reconcileCursor < sequence.length) record.reconcileCursor += 1;
      record.lastResult = await evaluate(action, request, record.lastResult || { status: "unknown" });
      return copy(record.lastResult);
    },

    async cancel(request) {
      activity.cancellations.push({
        cancellationKey: request.cancellationKey,
        submissionKey: request.submissionKey,
        jobId: request.job.id,
      });
      const record = records.get(request.submissionKey);
      if (!record) return { status: "cancelled" };
      if (TERMINAL_RESULTS.has(record.lastResult?.status)) return copy(record.lastResult);
      record.lastResult = await evaluate(record.scenario.cancel, request, { status: "cancelled" });
      return copy(record.lastResult);
    },
  };
}

/**
 * A second concrete adapter for deterministic local work. It caches the exact
 * result by idempotency key and therefore proves the seam independently of the
 * scripted provider fake. It intentionally performs no I/O unless the caller's
 * injected execute function does so.
 */
export function createLocalFakeAdapter({ id, execute } = {}) {
  assertAdapterId(id);
  if (execute !== undefined && typeof execute !== "function") {
    throw new TypeError("execute must be a function when supplied.");
  }

  const records = new Map();
  const activity = {
    submissions: [],
    reconciliations: [],
    cancellations: [],
  };

  return {
    id,
    kind: "local-fake",
    activity,

    async submit(request) {
      const prior = records.get(request.submissionKey);
      activity.submissions.push({
        submissionKey: request.submissionKey,
        jobId: request.job.id,
        duplicate: Boolean(prior),
      });
      if (prior) return copy(prior);

      const result = await evaluate(execute, request, {
        status: "succeeded",
        externalId: `local:${request.submissionKey.slice(0, 16)}`,
        outputs: defaultLocalOutputs(request),
      });
      records.set(request.submissionKey, copy(result));
      return copy(result);
    },

    async reconcile(request) {
      activity.reconciliations.push({
        submissionKey: request.submissionKey,
        jobId: request.job.id,
      });
      return copy(records.get(request.submissionKey) || { status: "unknown" });
    },

    async cancel(request) {
      activity.cancellations.push({
        cancellationKey: request.cancellationKey,
        submissionKey: request.submissionKey,
        jobId: request.job.id,
      });
      const current = records.get(request.submissionKey);
      if (TERMINAL_RESULTS.has(current?.status)) return copy(current);
      const cancelled = { status: "cancelled" };
      records.set(request.submissionKey, cancelled);
      return cancelled;
    },
  };
}
