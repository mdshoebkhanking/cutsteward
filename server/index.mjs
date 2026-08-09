import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { detectRuntimes } from "./runtime-catalog.mjs";
import { createStore } from "./store.mjs";
import { detectTools } from "./tool-catalog.mjs";
import { assertSupportedPlatform } from "./platform-support.mjs";
import { allowedHost, allowedMutationOrigin, containedStaticPath } from "./request-security.mjs";
import { createUrlSource, ingestFileSource } from "./source-ingest.mjs";
import { createMediaVerifier } from "./media-verifier.mjs";
import { createProductionRuns } from "./production-runs.mjs";
import { DIRECTOR_VERSION, inspectDirectorCapabilities } from "./director.mjs";
import { createLiveSessions } from "./live-sessions.mjs";
import { projectProductionCockpit } from "./cockpit-projection.mjs";
import { createAutonomyController } from "./autonomy-controller.mjs";
import { createBrowserRuntime } from "./browser-runtime.mjs";
import { createLocalAuthority } from "./local-authority.mjs";
import { redactSensitiveText } from "./redaction.mjs";
import { createToolInstallService } from "./tool-install-service.mjs";
import {
  createElevenLabsTimedTtsAdapter,
  createGoogleVeoAdapter,
  createStockMediaAdapter
} from "./providers/index.mjs";
import {
  createProviderActionAdapters,
  createProviderActionService
} from "./provider-action-service.mjs";
import { createStockSearchService } from "./stock-search-service.mjs";

assertSupportedPlatform();

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.join(rootDirectory, "dist");
const dataDirectory = path.resolve(
  process.env.FRAMEPILOT_DATA_DIR || path.join(rootDirectory, ".framepilot", "data")
);
const port = Number.parseInt(process.env.FRAMEPILOT_PORT || "4173", 10);
const host = "127.0.0.1";
const instanceId = process.env.FRAMEPILOT_INSTANCE_ID || `foreground-${process.pid}`;
const buildHash = process.env.FRAMEPILOT_BUILD_HASH || "development";
const localAuthority = await createLocalAuthority({ dataDirectory });
const toolInstallService = await createToolInstallService({ projectRoot: rootDirectory });

function resolveProviderCredential({ names }) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) return { name, value };
  }
  return null;
}

function providerConfigurationView() {
  const entries = [
    { id: "elevenlabs.tts_alignment", credentialNames: ["ELEVENLABS_API_KEY"] },
    { id: "google.veo_3_1", credentialNames: ["GEMINI_API_KEY", "GOOGLE_API_KEY"] },
    { id: "stock.rights_gated", credentialNames: ["PEXELS_API_KEY", "PIXABAY_API_KEY"], credentialOptionalForSelectedDownload: true }
  ].map((entry) => ({
    id: entry.id,
    registered: true,
    configured: entry.credentialNames.some((name) => typeof process.env[name] === "string" && process.env[name].length > 0),
    credentialOptionalForSelectedDownload: entry.credentialOptionalForSelectedDownload === true
  }));
  return {
    status: entries.every((entry) => entry.configured || entry.credentialOptionalForSelectedDownload) ? "ready" : "configuration-required",
    entries,
    configured: entries.filter((entry) => entry.configured).map((entry) => entry.id)
  };
}

const store = createStore(dataDirectory);
const mediaVerifier = createMediaVerifier({ rootDirectory });
const productionRuns = createProductionRuns({
  dataDirectory,
  rootDirectory,
  resolveSources: (ids) => store.getSources(ids),
  mediaVerifier
});
const liveSessions = createLiveSessions({ dataDirectory, rootDirectory, productionRuns });
const browserRuntime = createBrowserRuntime({ dataDirectory });
const stockSearchService = await createStockSearchService({
  fetchImpl: globalThis.fetch.bind(globalThis),
  resolveCredential: resolveProviderCredential,
  storageDirectory: path.join(dataDirectory, ".stock-search")
});
const verifyStockSelection = (selection) => stockSearchService.verifySelection(selection);
const rawProviderAdapters = [
  createElevenLabsTimedTtsAdapter({
    fetchImpl: globalThis.fetch.bind(globalThis),
    resolveCredential: resolveProviderCredential,
    resolveRunDirectory: (request) => projectDirectoryForRun(request.runId)
  }),
  createGoogleVeoAdapter({
    fetchImpl: globalThis.fetch.bind(globalThis),
    resolveCredential: resolveProviderCredential,
    resolveRunDirectory: (request) => projectDirectoryForRun(request.runId)
  }),
  createStockMediaAdapter({
    fetchImpl: globalThis.fetch.bind(globalThis),
    resolveRunDirectory: (request) => projectDirectoryForRun(request.runId),
    verifyStockSelection
  })
];
const providerActionService = await createProviderActionService({
  resolveRunDirectory: ({ runId }) => projectDirectoryForRun(runId),
  storageDirectory: path.join(dataDirectory, ".provider-actions"),
  verifyStockSelection
});
const providerAdapters = createProviderActionAdapters({
  actionService: providerActionService,
  rawAdapters: rawProviderAdapters
});
const autonomyController = createAutonomyController({
  dataDirectory,
  productionRuns,
  liveSessions,
  mediaVerifier,
  providerAdapters
});

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".aac", "audio/aac"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".m4v", "video/x-m4v"],
  [".m4a", "audio/mp4"],
  [".mkv", "video/x-matroska"],
  [".mov", "video/quicktime"],
  [".mp4", "video/mp4"],
  [".mp3", "audio/mpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".wav", "audio/wav"],
  [".webp", "image/webp"]
]);

function setSecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function sendJson(response, statusCode, value) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(value)}\n`);
}

function sendProblem(response, statusCode, title, detail) {
  sendJson(response, statusCode, {
    type: "about:blank",
    title,
    status: statusCode,
    detail
  });
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 32 * 1024) throw Object.assign(new Error("Request is too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON"), { statusCode: 400 });
  }
}

function actorFor(request, fallbackKind = "local-user") {
  const actor = localAuthority.requireActor(request);
  if (fallbackKind === "local-agent" && actor.kind === "local-user") {
    return { kind: "local-agent", id: "desktop-ui-agent-command" };
  }
  return actor;
}

async function productionRunOrNull(runId) {
  try {
    return await productionRuns.read({ kind: "run", runId });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.statusCode === 404) return null;
    throw error;
  }
}

async function projectDirectoryForRun(runId) {
  const snapshot = await productionRuns.read({ kind: "snapshot", runId });
  const projectDirectory = path.resolve(dataDirectory, snapshot.projectRelativePath);
  const relative = path.relative(path.resolve(dataDirectory), projectDirectory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw Object.assign(new Error("Production project path is invalid."), { statusCode: 500, code: "INVALID_PROJECT_PATH" });
  }
  return projectDirectory;
}

function browserAuthorityFor(request) {
  const actor = actorFor(request);
  return { actorId: actor.id, grants: ["browser:use"] };
}

function observedJobsFromExecution(execution) {
  if (!execution?.jobs) return [];
  const stateMap = {
    waiting_dependencies: "planned",
    blocked_approval: "waiting_approval",
    runnable: "planned",
    succeeded: "verified_output",
    cancel_pending: "reconciling",
    cancel_unknown: "unknown"
  };
  return execution.jobs.map((job) => {
    const latestAttempt = job.attempts?.at(-1) || null;
    const state = stateMap[job.state] || job.state;
    const observations = (job.attempts || []).flatMap((attempt) => [
      { state: "submitting", at: attempt.startedAt, detail: `${attempt.adapterId} attempt ${attempt.number} recorded before submission.` },
      ...(attempt.observedAt ? [{ state: attempt.state, at: attempt.observedAt, detail: attempt.externalId ? `Provider/agent receipt ${attempt.externalId}` : `Attempt observed as ${attempt.state}.` }] : [])
    ]);
    return {
      id: job.id,
      shotId: null,
      adapterId: latestAttempt?.adapterId || null,
      capability: job.laneId || null,
      state,
      externalReceipt: job.receipt?.externalId || latestAttempt?.externalId || null,
      observations,
      executionScopeHash: execution.scopeHash
    };
  });
}

async function productionCommand(request, run, command, body = {}) {
  const receipt = await productionRuns.command({
    commandId: typeof body.commandId === "string" ? body.commandId : `command-${randomUUID()}`,
    expectedRevision: Number.isInteger(body.expectedRevision) ? body.expectedRevision : run.revision,
    actor: actorFor(request),
    command: { ...command, runId: run.id }
  });
  return { receipt, run: await productionRuns.read({ kind: "run", runId: run.id }) };
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    await store.ensure();
    await productionRuns.ensure();
    await access(dataDirectory, constants.R_OK | constants.W_OK);
    return sendJson(response, 200, {
      schemaVersion: 2,
      ready: true,
      status: "ok",
      instanceId,
      buildHash,
      version: "0.1.0",
      storage: { writable: true },
      production: { workflowVersion: "2.0", directorVersion: DIRECTOR_VERSION, evidenceGated: true },
      liveSessions: { schemaVersion: 1, codexAppServer: true, durableReplay: true },
      autonomy: autonomyController.capabilities(),
      providers: providerConfigurationView(),
      providerActions: providerActionService.capabilities(),
      stockSearch: stockSearchService.capabilities(),
      toolInstallation: { reviewedPlans: true, localUserApprovalRequired: true, automaticForPaidOrManualTools: false }
    });
  }

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    localAuthority.issueBrowserCookie(response);
    const [tools, browser] = await Promise.all([detectTools(), browserRuntime.probe()]);
    return sendJson(response, 200, {
      projectReady: true,
      server: { host, port, loopbackOnly: true },
      storage: { label: "CutSteward / Projects", local: true },
      runtimes: await detectRuntimes(),
      tools,
      mediaVerification: await mediaVerifier.probe(),
      production: { workflowVersion: "2.0", directorVersion: DIRECTOR_VERSION, completionRequiresCertificate: true },
      authority: localAuthority.publicView(),
      autonomy: autonomyController.capabilities(),
      browser,
      toolInstallation: { reviewedPlans: true, localUserApprovalRequired: true, automaticForPaidOrManualTools: false },
      providers: providerConfigurationView(),
      providerActions: providerActionService.capabilities(),
      stockSearch: stockSearchService.capabilities(),
      director: {
        version: DIRECTOR_VERSION,
        presetId: "premium-vertical-story",
        adapters: inspectDirectorCapabilities({ tools })
      }
    });
  }

  if (request.method === "POST" && url.pathname === "/api/tools/probe") {
    return sendJson(response, 200, { tools: await detectTools({ probe: true }) });
  }

  const toolInstallMatch = url.pathname.match(/^\/api\/tools\/install\/([^/]+)$/);
  if (request.method === "GET" && toolInstallMatch) {
    const toolId = decodeURIComponent(toolInstallMatch[1]);
    return sendJson(response, 200, { plan: await toolInstallService.inspect(toolId) });
  }

  if (request.method === "POST" && toolInstallMatch) {
    const toolId = decodeURIComponent(toolInstallMatch[1]);
    const body = await readJson(request);
    const actor = actorFor(request);
    if (body.action === "approve") {
      const approval = await toolInstallService.approve({
        toolId,
        planHash: body.planHash,
        confirmed: body.confirmed === true,
        actor
      });
      return sendJson(response, 200, { approval });
    }
    if (body.action === "execute") {
      const receipt = await toolInstallService.execute({
        toolId,
        planHash: body.planHash,
        approvalHash: body.approvalHash,
        actor
      });
      return sendJson(response, receipt.ok ? 200 : 409, { receipt });
    }
    return sendProblem(response, 422, "Invalid install action", "Inspect the exact plan, then approve or execute that reviewed plan.");
  }

  if (request.method === "POST" && url.pathname === "/api/stock/search") {
    const body = await readJson(request);
    return sendJson(response, 200, {
      result: await stockSearchService.search({ provider: body.provider, query: body.query })
    });
  }

  if (request.method === "POST" && url.pathname === "/api/stock/select") {
    const body = await readJson(request);
    return sendJson(response, 200, {
      selection: await stockSearchService.select({
        provider: body.provider,
        cacheKey: body.cacheKey,
        assetId: body.assetId,
        renditionId: body.renditionId
      })
    });
  }

  if (request.method === "GET" && url.pathname === "/api/browser/probe") {
    return sendJson(response, 200, { browser: await browserRuntime.probe() });
  }

  if (request.method === "POST" && url.pathname === "/api/sources") {
    const source = await store.registerSource(await ingestFileSource(request, dataDirectory));
    return sendJson(response, 201, { source });
  }

  if (request.method === "POST" && url.pathname === "/api/sources/url") {
    const body = await readJson(request);
    const source = await store.registerSource(createUrlSource(body.url));
    return sendJson(response, 201, { source });
  }

  if (request.method === "GET" && url.pathname === "/api/sources") {
    return sendJson(response, 200, { sources: await store.listSources() });
  }

  if (request.method === "GET" && url.pathname === "/api/runs") {
    const [production, demonstrations] = await Promise.all([
      productionRuns.read({ kind: "list" }),
      store.listRuns()
    ]);
    return sendJson(response, 200, {
      runs: [...production, ...demonstrations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    });
  }

  if (request.method === "POST" && url.pathname === "/api/runs") {
    const body = await readJson(request);
    const outcome = typeof body.outcome === "string" ? body.outcome.trim() : "";
    if (outcome.length < 3 || outcome.length > 4000) {
      return sendProblem(response, 422, "Invalid outcome", "Describe the desired result in 3 to 4000 characters.");
    }
    const receipt = await productionRuns.command({
      commandId: typeof body.commandId === "string" ? body.commandId : `start-${randomUUID()}`,
      actor: actorFor(request),
      command: {
        kind: "start",
        outcome,
        mode: body.mode,
        sourceIds: body.sourceIds,
        runnerId: body.runnerId
      }
    });
    const run = await productionRuns.read({ kind: "run", runId: receipt.runId });
    let execution = null;
    let runtimeConnection = null;
    try {
      execution = await autonomyController.ensure({ runId: run.id, actorId: actorFor(request).id });
      if (run.mode === "Autonomous" && typeof body.runnerId === "string" && body.runnerId.trim()) {
        runtimeConnection = await autonomyController.connect({
          runId: run.id,
          runtimeId: body.runnerId.trim(),
          actor: actorFor(request)
        });
      }
    } catch (error) {
      runtimeConnection = { status: "not-connected", error: { code: error.code || "AUTONOMY_START_FAILED", message: error.message } };
    }
    return sendJson(response, 201, { run, execution, runtimeConnection });
  }

  const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (request.method === "GET" && runMatch) {
    const id = decodeURIComponent(runMatch[1]);
    const run = await productionRunOrNull(id) || await store.getRun(id);
    return run ? sendJson(response, 200, { run }) : sendProblem(response, 404, "Run not found", "This local run does not exist.");
  }

  const eventsMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
  if (request.method === "GET" && eventsMatch) {
    const runId = decodeURIComponent(eventsMatch[1]);
    const run = await productionRunOrNull(runId);
    if (!run) return sendProblem(response, 404, "Run not found", "This production run does not exist.");
    const controller = new AbortController();
    request.once("close", () => controller.abort());
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders?.();
    const afterSequence = Number.parseInt(url.searchParams.get("after") || "0", 10) || 0;
    for await (const event of productionRuns.follow({ runId, afterSequence, signal: controller.signal })) {
      if (controller.signal.aborted) break;
      response.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
    if (!response.writableEnded) response.end();
    return;
  }

  const cockpitMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/cockpit$/);
  if (request.method === "GET" && cockpitMatch) {
    const runId = decodeURIComponent(cockpitMatch[1]);
    const production = await productionRunOrNull(runId);
    if (!production) return sendProblem(response, 404, "Run not found", "This production run does not exist.");
    const [snapshot, session, liveEvents, execution] = await Promise.all([
      productionRuns.read({ kind: "snapshot", runId }),
      liveSessions.read({ kind: "session", runId }),
      liveSessions.read({ kind: "events", runId, afterSequence: 0 }),
      autonomyController.inspect(runId)
    ]);
    if (session) {
      snapshot.runner = {
        runtimeId: session.runtimeId,
        name: session.runtimeName,
        status: session.status === "connected" ? "connected" : session.status === "disconnected" ? "handoff_only" : session.status,
        adapterId: session.adapterId,
        sessionId: session.sessionId
      };
    }
    snapshot.runnerEvents = liveEvents.map((event) => ({
      sequence: event.sequence,
      type: event.type,
      at: event.recordedAt,
      turnId: event.turnId,
      ...event.payload
    }));
    snapshot.jobs = [...(snapshot.jobs || []), ...observedJobsFromExecution(execution)];
    const activeExecutionJob = execution?.jobs?.find((job) => ["submitting", "accepted", "running", "reconciling", "unknown"].includes(job.state))
      || execution?.jobs?.find((job) => ["runnable", "blocked_approval"].includes(job.state));
    if (activeExecutionJob) {
      snapshot.currentTask = activeExecutionJob.state === "blocked_approval"
        ? `Approval needed for ${activeExecutionJob.id}`
        : `Execution · ${activeExecutionJob.id}`;
      snapshot.taskDetail = activeExecutionJob.lastError?.code
        ? `${activeExecutionJob.state} · ${activeExecutionJob.lastError.code}`
        : `${activeExecutionJob.state} · ${activeExecutionJob.laneId || "production"}`;
    }
    return sendJson(response, 200, {
      cockpit: projectProductionCockpit(snapshot),
      session,
      execution
    });
  }

  const executionMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/execution$/);
  if (request.method === "GET" && executionMatch) {
    const runId = decodeURIComponent(executionMatch[1]);
    const run = await productionRunOrNull(runId);
    if (!run) return sendProblem(response, 404, "Run not found", "This production run does not exist.");
    return sendJson(response, 200, {
      execution: await autonomyController.inspect(runId),
      session: await liveSessions.read({ kind: "session", runId }),
      capabilities: autonomyController.capabilities()
    });
  }

  if (request.method === "POST" && executionMatch) {
    const runId = decodeURIComponent(executionMatch[1]);
    const run = await productionRunOrNull(runId);
    if (!run) return sendProblem(response, 404, "Run not found", "This production run does not exist.");
    const body = await readJson(request);
    const actor = actorFor(request);
    let execution;
    let session = await liveSessions.read({ kind: "session", runId });
    if (body.operation === "materialize") {
      execution = await autonomyController.ensure({ runId, actorId: actor.id });
    } else if (body.operation === "connect") {
      if (actor.kind !== "local-user") return sendProblem(response, 403, "User confirmation required", "Connecting an agent runtime must be initiated from the local UI.");
      session = await autonomyController.connect({ runId, runtimeId: String(body.runtimeId || ""), actor });
      execution = await autonomyController.ensure({ runId, actorId: actor.id });
    } else if (body.operation === "approve") {
      return sendProblem(
        response,
        422,
        "Exact approval route required",
        "Sensitive production approvals cannot be granted generically. Approve the exact brief/source request or exact provider-action proposal instead."
      );
    } else if (body.operation === "advance") {
      execution = await autonomyController.advance({ runId, actorId: actor.id, maxJobs: body.maxJobs });
    } else if (body.operation === "reconcile") {
      execution = await autonomyController.reconcile({ runId, actorId: actor.id, maxJobs: body.maxJobs });
    } else if (body.operation === "cancel") {
      if (actor.kind !== "local-user") {
        return sendProblem(response, 403, "User confirmation required", "Cancelling durable production work must be initiated by the authenticated local user.");
      }
      execution = await autonomyController.cancel({ runId, actor, jobIds: body.jobIds });
      autonomyController.stop(runId);
    } else if (body.operation === "schedule") {
      autonomyController.schedule(runId);
      execution = await autonomyController.inspect(runId) || await autonomyController.ensure({ runId, actorId: actor.id });
    } else if (body.operation === "stop-scheduler") {
      autonomyController.stop(runId);
      execution = await autonomyController.inspect(runId);
    } else {
      return sendProblem(response, 422, "Invalid execution operation", "Use materialize, connect, advance, reconcile, schedule, stop-scheduler, or cancel. Sensitive approvals use their exact reviewed-action routes.");
    }
    return sendJson(response, 200, { execution, session, capabilities: autonomyController.capabilities() });
  }

  const providerActionMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/provider-actions\/([^/]+)$/);
  if (["GET", "POST"].includes(request.method) && providerActionMatch) {
    const runId = decodeURIComponent(providerActionMatch[1]);
    const jobId = decodeURIComponent(providerActionMatch[2]);
    const run = await productionRunOrNull(runId);
    if (!run) return sendProblem(response, 404, "Run not found", "This production run does not exist.");
    const execution = await autonomyController.inspect(runId);
    if (!execution) {
      return sendProblem(response, 409, "Execution not materialized", "Materialize this run before inspecting provider actions.");
    }
    const job = execution.jobs.find((candidate) => candidate.id === jobId);
    if (!job) return sendProblem(response, 404, "Job not found", "This execution does not contain the requested provider job.");

    if (request.method === "GET") {
      return sendJson(response, 200, {
        providerAction: await providerActionService.inspect({ runId, jobId, scopeHash: execution.scopeHash })
      });
    }

    const actor = actorFor(request);
    if (actor.kind !== "local-user") {
      return sendProblem(response, 403, "Local user required", "Only the authenticated local user may approve an exact provider action.");
    }
    const body = await readJson(request);
    if (body.confirmed !== true) {
      return sendProblem(response, 403, "Explicit confirmation required", "Review the exact provider request and confirm this one action.");
    }
    const inspected = await providerActionService.inspect({ runId, jobId, scopeHash: execution.scopeHash });
    if (!inspected.proposal || inspected.proposal.actionHash !== body.actionHash) {
      return sendProblem(response, 409, "Provider action changed", "Inspect and review the current exact provider request again.");
    }
    const approval = await providerActionService.approve({
      runId,
      jobId,
      scopeHash: execution.scopeHash,
      actionHash: body.actionHash,
      confirmed: true,
      actor
    });
    const updatedExecution = await autonomyController.decideApprovals({
      runId,
      actorId: actor.id,
      decisions: inspected.proposal.requiredApprovalIds.map((id) => ({
        id,
        decision: "grant",
        scopeHash: execution.scopeHash,
        evidenceHash: inspected.proposal.actionHash
      }))
    });
    if (run.mode === "Autonomous") autonomyController.schedule(runId);
    return sendJson(response, 200, {
      providerAction: await providerActionService.inspect({ runId, jobId, scopeHash: execution.scopeHash }),
      approval,
      execution: updatedExecution
    });
  }

  const browserMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/browser$/);
  if (request.method === "GET" && browserMatch) {
    const runId = decodeURIComponent(browserMatch[1]);
    const run = await productionRunOrNull(runId);
    if (!run) return sendProblem(response, 404, "Run not found", "This production run does not exist.");
    return sendJson(response, 200, { browser: browserRuntime.read(runId), probe: await browserRuntime.probe() });
  }

  if (request.method === "POST" && browserMatch) {
    const runId = decodeURIComponent(browserMatch[1]);
    const run = await productionRunOrNull(runId);
    if (!run) return sendProblem(response, 404, "Run not found", "This production run does not exist.");
    const body = await readJson(request);
    const authority = browserAuthorityFor(request);
    if (body.operation === "start") {
      const browser = await browserRuntime.start({
        runId,
        runDirectory: await projectDirectoryForRun(runId),
        profileId: body.profileId,
        authority
      });
      return sendJson(response, 200, { browser });
    }
    if (body.operation === "act") {
      const result = await browserRuntime.act({ runId, action: body.action, authority });
      return sendJson(response, 200, result);
    }
    if (body.operation === "close") {
      return sendJson(response, 200, { browser: await browserRuntime.close({ runId, authority }) });
    }
    return sendProblem(response, 422, "Invalid browser operation", "Use start, act, or close.");
  }

  const sessionMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/session$/);
  if (request.method === "GET" && sessionMatch) {
    const runId = decodeURIComponent(sessionMatch[1]);
    const run = await productionRunOrNull(runId);
    if (!run) return sendProblem(response, 404, "Run not found", "This production run does not exist.");
    return sendJson(response, 200, { session: await liveSessions.read({ kind: "session", runId }) });
  }

  const sessionEventsMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/session\/events$/);
  if (request.method === "GET" && sessionEventsMatch) {
    const runId = decodeURIComponent(sessionEventsMatch[1]);
    const run = await productionRunOrNull(runId);
    if (!run) return sendProblem(response, 404, "Run not found", "This production run does not exist.");
    const controller = new AbortController();
    request.once("close", () => controller.abort());
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders?.();
    const afterHeader = Number.parseInt(String(request.headers["last-event-id"] || "0"), 10) || 0;
    const afterQuery = Number.parseInt(url.searchParams.get("after") || "0", 10) || 0;
    const heartbeat = setInterval(() => {
      if (!response.writableEnded) response.write(": framepilot-live\n\n");
    }, 15_000);
    heartbeat.unref?.();
    try {
      for await (const event of liveSessions.follow({ runId, afterSequence: Math.max(afterHeader, afterQuery), signal: controller.signal })) {
        if (controller.signal.aborted) break;
        response.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } finally {
      clearInterval(heartbeat);
    }
    if (!response.writableEnded) response.end();
    return;
  }

  const sessionCommandsMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/session\/commands$/);
  if (request.method === "POST" && sessionCommandsMatch) {
    const runId = decodeURIComponent(sessionCommandsMatch[1]);
    const run = await productionRunOrNull(runId);
    if (!run) return sendProblem(response, 404, "Run not found", "This production run does not exist.");
    const body = await readJson(request);
    if (!body.command || typeof body.command !== "object") {
      return sendProblem(response, 422, "Invalid live command", "Provide a live session command.");
    }
    const receipt = await liveSessions.command({
      schemaVersion: 1,
      commandId: typeof body.commandId === "string" ? body.commandId : `live-${randomUUID()}`,
      runId,
      actor: actorFor(request),
      command: body.command
    });
    return sendJson(response, 202, {
      receipt,
      session: await liveSessions.read({ kind: "session", runId })
    });
  }

  const commandsMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/commands$/);
  if (request.method === "POST" && commandsMatch) {
    const runId = decodeURIComponent(commandsMatch[1]);
    const run = await productionRunOrNull(runId);
    if (!run) return sendProblem(response, 404, "Run not found", "This production run does not exist.");
    const body = await readJson(request);
    if (!body.command || typeof body.command !== "object" || body.command.kind === "start") {
      return sendProblem(response, 422, "Invalid command", "Provide one non-start production command.");
    }
    const receipt = await productionRuns.command({
      commandId: typeof body.commandId === "string" ? body.commandId : `agent-${randomUUID()}`,
      expectedRevision: body.expectedRevision,
      actor: actorFor(request, "local-agent"),
      command: { ...body.command, runId }
    });
    return sendJson(response, 202, {
      receipt,
      run: await productionRuns.read({ kind: "run", runId })
    });
  }

  const actionMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/actions$/);
  if (request.method === "POST" && actionMatch) {
    const body = await readJson(request);
    const id = decodeURIComponent(actionMatch[1]);
    const production = await productionRunOrNull(id);
    if (production) {
      const pendingBeforeAction = production.pendingAttention;
      let command;
      if (body.action === "approve-plan" || body.action === "allow-once") {
        const attention = production.pendingAttention;
        if (!attention) return sendProblem(response, 409, "No approval pending", "This production run has no live approval request.");
        command = {
          kind: "respond",
          attentionId: attention.id,
          response: {
            kind: "approve-once",
            requestHash: attention.requestHash,
            rightsConfirmed: body.rightsConfirmed === true,
            notes: body.notes
          }
        };
      } else if (body.action === "not-now") {
        const attention = production.pendingAttention;
        if (!attention) return sendProblem(response, 409, "No approval pending", "This production run has no live approval request.");
        command = { kind: "respond", attentionId: attention.id, response: { kind: "deny", requestHash: attention.requestHash, notes: body.notes } };
      } else if (["pause", "resume"].includes(body.action)) {
        command = { kind: "control", operation: body.action };
      } else if (["approve-artifact", "reject-artifact"].includes(body.action)) {
        if (typeof body.artifactId !== "string") {
          return sendProblem(response, 422, "Artifact required", "Choose the exact artifact bytes to review.");
        }
        command = {
          kind: "review-artifact",
          artifactId: body.artifactId,
          verdict: body.action === "approve-artifact" ? "approve" : "reject",
          reason: typeof body.reason === "string" ? body.reason : body.action === "approve-artifact"
            ? "Reviewed in the local CutSteward UI."
            : "Rejected in the local CutSteward UI."
        };
      } else if (body.action === "approve-final") {
        command = { kind: "pass-phase" };
      } else {
        return sendProblem(response, 422, "Invalid action", "This production action is not supported.");
      }
      const result = await productionCommand(request, production, command, body);
      let execution = await autonomyController.inspect(id);
      let autonomyError = null;
      if (pendingBeforeAction?.category === "brief-rights-budget" && ["approve-plan", "allow-once", "not-now"].includes(body.action)) {
        try {
          execution ||= await autonomyController.ensure({ runId: id, actorId: actorFor(request).id });
          execution = await autonomyController.decideApprovals({
            runId: id,
            actorId: actorFor(request).id,
            decisions: [{
              id: "brief-and-source-rights",
              decision: body.action === "not-now" ? "deny" : "grant",
              scopeHash: execution.scopeHash,
              evidenceHash: pendingBeforeAction.requestHash
            }]
          });
          if (body.action !== "not-now" && result.run.mode === "Autonomous") autonomyController.schedule(id);
        } catch (error) {
          autonomyError = { code: error.code || "AUTONOMY_APPROVAL_SYNC_FAILED", message: error.message };
        }
      }
      return sendJson(response, 200, { run: result.run, receipt: result.receipt, execution, autonomyError });
    }
    const run = await store.actOnRun(id, body.action);
    return run ? sendJson(response, 200, { run }) : sendProblem(response, 404, "Run not found", "This local run does not exist.");
  }

  const messagesMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/messages$/);
  if (request.method === "GET" && messagesMatch) {
    const id = decodeURIComponent(messagesMatch[1]);
    const production = await productionRunOrNull(id);
    const messages = production ? await productionRuns.read({ kind: "messages", runId: id }) : await store.listMessages(id);
    return messages
      ? sendJson(response, 200, { messages })
      : sendProblem(response, 404, "Run not found", "This local run does not exist.");
  }

  if (request.method === "POST" && messagesMatch) {
    const body = await readJson(request);
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (content.length < 1 || content.length > 4000) {
      return sendProblem(response, 422, "Invalid message", "A production instruction must be 1 to 4000 characters.");
    }
    const id = decodeURIComponent(messagesMatch[1]);
    const production = await productionRunOrNull(id);
    let result;
    if (production) {
      const before = await productionRuns.read({ kind: "messages", runId: id });
      await productionCommand(request, production, { kind: "direct", text: content }, body);
      const after = await productionRuns.read({ kind: "messages", runId: id });
      let liveDispatch = { accepted: false, status: "not-connected" };
      const session = await liveSessions.read({ kind: "session", runId: id });
      if (session?.status === "connected") {
        try {
          const receipt = await liveSessions.command({
            schemaVersion: 1,
            commandId: typeof body.liveCommandId === "string" ? body.liveCommandId : `prompt-${randomUUID()}`,
            runId: id,
            actor: actorFor(request),
            command: { kind: "prompt", text: content }
          });
          liveDispatch = { accepted: true, status: "submitted", receipt };
        } catch (error) {
          liveDispatch = { accepted: false, status: "recorded-not-submitted", error: { code: error.code || "LIVE_DISPATCH_FAILED", message: error.message } };
        }
      }
      result = { messages: after.slice(before.length), run: await productionRuns.read({ kind: "run", runId: id }), liveDispatch };
    } else {
      result = await store.addMessage(id, content);
    }
    return result
      ? sendJson(response, 201, result)
      : sendProblem(response, 404, "Run not found", "This local run does not exist.");
  }

  const sourcesMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/sources$/);
  if (request.method === "POST" && sourcesMatch) {
    const body = await readJson(request);
    const id = decodeURIComponent(sourcesMatch[1]);
    const production = await productionRunOrNull(id);
    const run = production
      ? (await productionCommand(request, production, { kind: "attach-source", sourceIds: body.sourceIds }, body)).run
      : await store.attachSources(id, body.sourceIds);
    if (production && run?.directorPlan?.planHash !== production.directorPlan?.planHash) {
      autonomyController.stop(id);
      const session = await liveSessions.read({ kind: "session", runId: id });
      if (session?.status === "connected" && session.activeTurnId) {
        await liveSessions.command({
          schemaVersion: 1,
          commandId: `source-scope-interrupt-${randomUUID()}`,
          runId: id,
          actor: { kind: "system", id: "framepilot-source-scope" },
          command: { kind: "interrupt" }
        }).catch(() => undefined);
      }
    }
    return run
      ? sendJson(response, 200, { run })
      : sendProblem(response, 404, "Run not found", "This local run does not exist.");
  }

  if (request.method === "GET" && url.pathname === "/api/artifacts") {
    const [production, demonstrations] = await Promise.all([
      productionRuns.read({ kind: "artifacts" }),
      store.listArtifacts()
    ]);
    return sendJson(response, 200, { artifacts: [...production, ...demonstrations] });
  }

  const artifactContentMatch = url.pathname.match(/^\/api\/artifacts\/([^/]+)\/content$/);
  if (["GET", "HEAD"].includes(request.method) && artifactContentMatch) {
    const artifact = await productionRuns.read({ kind: "artifact-path", artifactId: decodeURIComponent(artifactContentMatch[1]) });
    if (!artifact || !artifact.contentUrl) return sendProblem(response, 404, "Artifact not found", "This verified media artifact does not exist.");
    const rangeHeader = request.headers.range;
    let start = 0;
    let end = artifact.size - 1;
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (!match || (!match[1] && !match[2])) {
        response.statusCode = 416;
        response.setHeader("Content-Range", `bytes */${artifact.size}`);
        return response.end();
      }
      if (!match[1]) {
        const suffixLength = Number.parseInt(match[2], 10);
        if (!Number.isInteger(suffixLength) || suffixLength < 1) {
          response.statusCode = 416;
          response.setHeader("Content-Range", `bytes */${artifact.size}`);
          return response.end();
        }
        start = Math.max(0, artifact.size - suffixLength);
      } else {
        start = Number.parseInt(match[1], 10);
        if (match[2]) end = Number.parseInt(match[2], 10);
      }
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= artifact.size) {
        response.statusCode = 416;
        response.setHeader("Content-Range", `bytes */${artifact.size}`);
        return response.end();
      }
      end = Math.min(end, artifact.size - 1);
      response.statusCode = 206;
      response.setHeader("Content-Range", `bytes ${start}-${end}/${artifact.size}`);
    } else {
      response.statusCode = 200;
    }
    response.setHeader("Content-Type", contentTypes.get(path.extname(artifact.absolutePath).toLowerCase()) || "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("ETag", `"sha256-${artifact.sha256}"`);
    response.setHeader("Content-Length", end - start + 1);
    if (request.method === "HEAD") return response.end();
    await new Promise((resolve, reject) => {
      const stream = createReadStream(artifact.absolutePath, { start, end });
      stream.on("error", reject);
      stream.on("end", resolve);
      stream.pipe(response);
    });
    return;
  }

  const artifactMatch = url.pathname.match(/^\/api\/artifacts\/([^/]+)$/);
  if (request.method === "GET" && artifactMatch) {
    const id = decodeURIComponent(artifactMatch[1]);
    const artifact = await productionRuns.read({ kind: "artifact", artifactId: id }) || await store.getArtifact(id);
    return artifact
      ? sendJson(response, 200, { artifact })
      : sendProblem(response, 404, "Artifact not found", "This local artifact does not exist.");
  }

  return sendProblem(response, 404, "Not found", "The requested local API route does not exist.");
}

async function serveStatic(response, pathname) {
  let requestedPath = pathname === "/" ? "/index.html" : pathname;
  requestedPath = decodeURIComponent(requestedPath);
  let filePath = containedStaticPath(distDirectory, requestedPath);
  if (!filePath) return false;

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;
  } catch {
    filePath = path.join(distDirectory, "index.html");
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", contentTypes.get(path.extname(filePath)) || "application/octet-stream");
  response.setHeader("Cache-Control", filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("end", resolve);
    stream.pipe(response);
  });
  return true;
}

await mkdir(dataDirectory, { recursive: true });
await store.ensure();

const server = http.createServer(async (request, response) => {
  setSecurityHeaders(response);
  try {
    if (!allowedHost(request)) return sendProblem(response, 403, "Forbidden", "CutSteward accepts loopback requests only.");
    if (!allowedMutationOrigin(request)) return sendProblem(response, 403, "Forbidden", "Cross-site mutations are not accepted.");
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      localAuthority.requireMutation(request);
      return await handleApi(request, response, url);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendProblem(response, 405, "Method not allowed", "Static content is read-only.");
    }
    if (!(await serveStatic(response, url.pathname))) {
      return sendProblem(response, 404, "UI not built", "Run npm run setup to build the local UI.");
    }
  } catch (error) {
    console.error(redactSensitiveText(error?.stack || error?.message || String(error)));
    if (!response.headersSent) {
      sendProblem(response, error?.statusCode || 500, "Local server error", error?.statusCode ? error.message : "See the local server log for details.");
    } else {
      response.destroy();
    }
  }
});

server.listen(port, host, () => {
  console.log(`CutSteward ${instanceId} listening on http://${host}:${port}`);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await autonomyController.shutdown().catch((error) => console.error(redactSensitiveText(error?.message || String(error))));
  await browserRuntime.shutdown().catch((error) => console.error(redactSensitiveText(error?.message || String(error))));
  await liveSessions.shutdown().catch((error) => console.error(redactSensitiveText(error?.message || String(error))));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
