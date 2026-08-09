import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createProviderActionAdapter,
  createProviderActionAdapters,
  createProviderActionService,
  createEmptyProviderRequestsDocument,
  createProviderRequestsDocument,
  EMPTY_PROVIDER_REQUESTS_DOCUMENT,
  PROVIDER_REQUEST_NAMESPACES,
  PROVIDER_REQUESTS_RELATIVE_PATH,
} from "../server/provider-action-service.mjs";
import {
  buildElevenLabsTimedTtsIntent,
  createElevenLabsTimedTtsApprovalGrants,
  createGoogleVeoApprovalGrants,
  createStockDownloadApprovalGrants,
  ELEVENLABS_TIMED_TTS_ADAPTER_ID,
  GOOGLE_VEO_ADAPTER_ID,
  PEXELS_LICENSE_METADATA,
  stableSha256,
  STOCK_MEDIA_ADAPTER_ID,
} from "../server/providers/index.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const runId = "provider-action-run";
const scopeHash = sha256("provider-action-scope");
const actor = Object.freeze({ kind: "local-user", id: "desktop-user" });
const voiceConfig = Object.freeze({
  voiceId: "voice_test_123",
  text: "A natural international-English performance.",
  modelId: "eleven_multilingual_v2",
  outputFormat: "mp3_44100_128",
  seed: 41,
});
const veoConfig = Object.freeze({
  model: "veo-3.1-generate-preview",
  instances: [{ prompt: "A premium vertical macro shot of a glass prism." }],
  parameters: { aspectRatio: "9:16", sampleCount: 1 },
  sampleIndex: 0,
});
const stockSelectionPayload = Object.freeze({
  schemaVersion: 1,
  provider: "pexels",
  assetId: "video-101",
  renditionId: "portrait-hd",
  downloadUrl: "https://videos.pexels.com/video-files/101/portrait-hd.mp4?signature=private-capability",
  mediaType: "video/mp4",
  width: 1080,
  height: 1920,
  declaredBytes: 123456,
  sourcePageUrl: "https://www.pexels.com/video/101/",
  creator: { id: "creator-1", name: "Example Creator" },
  license: PEXELS_LICENSE_METADATA,
  searchQueryHash: sha256("thoughtful man office portrait"),
  retrievedAt: "2026-08-09T10:00:00.000Z",
});
const stockSelectionHash = stableSha256(stockSelectionPayload);
const stockSelection = Object.freeze({
  ...stockSelectionPayload,
  selectionHash: stockSelectionHash,
  selectionProof: Object.freeze({
    schemaVersion: 1,
    kind: "stock-search-explicit-selection",
    provider: "pexels",
    cacheKey: sha256("stock-cache-key"),
    cacheEntryHash: sha256("stock-cache-entry"),
    cacheExpiresAt: "2026-08-10T10:00:00.000Z",
    selectionHash: stockSelectionHash,
    assetId: "video-101",
    renditionId: "portrait-hd",
    selectedAt: "2026-08-09T10:01:00.000Z",
    algorithm: "HMAC-SHA256",
    keyId: "0123456789abcdef01234567",
    hmacSha256: sha256("stock-selection-proof"),
  }),
});

async function fixture({
  document,
  storageDirectory,
  approvalSecret,
  persistSecret = false,
  verifyStockSelection,
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "framepilot-provider-action-"));
  const runDirectory = path.join(root, "run");
  const privateDirectory = storageDirectory || path.join(root, "private");
  await mkdir(path.join(runDirectory, "planning"), { recursive: true });
  await writeFile(
    path.join(runDirectory, ...PROVIDER_REQUESTS_RELATIVE_PATH.split("/")),
    `${JSON.stringify(document || {
      schemaVersion: 1,
      requests: { "voice-timing": { elevenLabs: voiceConfig } },
    }, null, 2)}\n`,
  );
  const resolveRunDirectory = vi.fn(async (request) => {
    expect(request.runId).toBe(runId);
    return runDirectory;
  });
  const options = {
    resolveRunDirectory,
    storageDirectory: privateDirectory,
    clock: () => new Date("2026-08-09T12:00:00.000Z"),
  };
  if (!persistSecret) {
    options.approvalSecret = approvalSecret || "0123456789abcdef0123456789abcdef";
  }
  if (verifyStockSelection) options.verifyStockSelection = verifyStockSelection;
  const service = await createProviderActionService(options);
  return { root, runDirectory, privateDirectory, resolveRunDirectory, service };
}

async function writeRequests(runDirectory, document) {
  await writeFile(
    path.join(runDirectory, ...PROVIDER_REQUESTS_RELATIVE_PATH.split("/")),
    `${JSON.stringify(document, null, 2)}\n`,
  );
}

function executionRequest({ payload = {}, externalId = null, submissionSeed = "submission" } = {}) {
  return {
    adapterId: ELEVENLABS_TIMED_TTS_ADAPTER_ID,
    runId,
    scopeHash,
    strategyId: "voice",
    submissionKey: sha256(submissionSeed),
    attemptNumber: 1,
    routeAttempt: 1,
    externalId,
    job: {
      id: "voice-timing",
      laneId: "voice",
      dependsOn: ["script-animatic"],
      outputRoles: ["voice_media"],
      payload,
    },
  };
}

function providerExecutionRequest({ adapterId, jobId, payload = {}, submissionSeed = jobId }) {
  return {
    adapterId,
    runId,
    scopeHash,
    strategyId: jobId,
    submissionKey: sha256(submissionSeed),
    attemptNumber: 1,
    routeAttempt: 1,
    externalId: null,
    job: {
      id: jobId,
      laneId: jobId,
      dependsOn: [],
      outputRoles: ["source_media"],
      payload,
    },
  };
}

describe("provider action proposal inspection", () => {
  it("exports the exact strict request template contract for server and agent integration", () => {
    expect(createEmptyProviderRequestsDocument()).toEqual({ schemaVersion: 1, requests: {} });
    expect(createEmptyProviderRequestsDocument()).not.toBe(EMPTY_PROVIDER_REQUESTS_DOCUMENT);
    expect(PROVIDER_REQUEST_NAMESPACES).toEqual({
      "voice-timing": { adapterId: ELEVENLABS_TIMED_TTS_ADAPTER_ID, path: ["elevenLabs"] },
      "ai-video-pilot": { adapterId: GOOGLE_VEO_ADAPTER_ID, path: ["googleVeo"] },
      "licensed-acquisition": { adapterId: STOCK_MEDIA_ADAPTER_ID, path: ["stockMedia", "selection"] },
    });
    expect(createProviderRequestsDocument({
      "voice-timing": { elevenLabs: voiceConfig },
    })).toEqual({
      schemaVersion: 1,
      requests: { "voice-timing": { elevenLabs: voiceConfig } },
    });
    expect(() => createProviderRequestsDocument({
      "voice-timing": { elevenLabs: voiceConfig, extra: true },
    })).toThrow(/unsupported fields/i);
  });

  it("treats the safe empty scaffold as no action, not as an executable request", async () => {
    const { service } = await fixture({ document: createEmptyProviderRequestsDocument() });
    await expect(service.inspect({ runId, jobId: "voice-timing", scopeHash })).resolves.toMatchObject({
      readiness: "blocked",
      ready: false,
      blocker: { code: "PROVIDER_ACTION_REQUEST_MISSING" },
      proposal: null,
    });
  });

  it("validates the canonical request file and returns an exact sanitized approval proposal", async () => {
    const { service } = await fixture();

    const result = await service.inspect({ runId, jobId: "voice-timing", scopeHash });
    const expected = buildElevenLabsTimedTtsIntent(voiceConfig);

    expect(result).toMatchObject({
      schemaVersion: 1,
      runId,
      jobId: "voice-timing",
      scopeHash,
      readiness: "approval-required",
      ready: false,
      blocker: {
        code: "PROVIDER_ACTION_APPROVAL_REQUIRED",
      },
      proposal: {
        adapterId: ELEVENLABS_TIMED_TTS_ADAPTER_ID,
        namespace: "elevenLabs",
        actionHash: expected.actionHash,
        requestFingerprint: expected.requestFingerprint,
        requiredApprovalIds: [
          "likeness-and-voice-consent",
          "provider-upload",
          "generation-spend",
        ],
        exactRequest: expected.descriptor,
      },
    });
    expect(JSON.stringify(result)).not.toContain("credential");
  });

  it("fails stock proposals closed without trusted proof verification and rejects a self-hashed forgery", async () => {
    const legitimateDocument = {
      schemaVersion: 1,
      requests: {
        "licensed-acquisition": { stockMedia: { selection: stockSelection } },
      },
    };
    const unavailable = await fixture({ document: legitimateDocument });
    await expect(unavailable.service.inspect({
      runId,
      jobId: "licensed-acquisition",
      scopeHash,
    })).resolves.toMatchObject({
      readiness: "blocked",
      ready: false,
      blocker: { code: "STOCK_SELECTION_VERIFIER_UNAVAILABLE" },
      proposal: null,
    });

    const forgedPayload = {
      ...stockSelectionPayload,
      assetId: "forged-video-999",
      renditionId: "forged-hd",
      downloadUrl: "https://videos.pexels.com/video-files/999/forged-hd.mp4",
    };
    const forgedHash = stableSha256(forgedPayload);
    const forgedSelection = {
      ...forgedPayload,
      selectionHash: forgedHash,
      selectionProof: {
        ...stockSelection.selectionProof,
        selectionHash: forgedHash,
        assetId: forgedPayload.assetId,
        renditionId: forgedPayload.renditionId,
      },
    };
    const verifyStockSelection = vi.fn(async (selection) => (
      selection.selectionHash === stockSelection.selectionHash
      && selection.selectionProof?.hmacSha256 === stockSelection.selectionProof.hmacSha256
    ));
    const forged = await fixture({
      document: {
        schemaVersion: 1,
        requests: {
          "licensed-acquisition": { stockMedia: { selection: forgedSelection } },
        },
      },
      verifyStockSelection,
    });
    await expect(forged.service.inspect({
      runId,
      jobId: "licensed-acquisition",
      scopeHash,
    })).resolves.toMatchObject({
      readiness: "blocked",
      ready: false,
      blocker: { code: "STOCK_SELECTION_PROOF_INVALID" },
      proposal: null,
    });
    expect(verifyStockSelection).toHaveBeenCalledTimes(1);
  });

  it("blocks unsupported schema, job, namespace, and provider config fields", async () => {
    const cases = [
      {
        schemaVersion: 2,
        requests: { "voice-timing": { elevenLabs: voiceConfig } },
      },
      {
        schemaVersion: 1,
        requests: { "unknown-provider-job": { elevenLabs: voiceConfig } },
      },
      {
        schemaVersion: 1,
        requests: { "voice-timing": { elevenLabs: voiceConfig, apiKey: "must-not-exist" } },
      },
      {
        schemaVersion: 1,
        requests: { "voice-timing": { elevenLabs: { ...voiceConfig, apiKey: "must-not-exist" } } },
      },
      {
        schemaVersion: 1,
        requests: {
          "ai-video-pilot": {
            googleVeo: {
              ...veoConfig,
              instances: [{ prompt: "A test", apiKey: "must-not-exist" }],
            },
          },
        },
      },
      {
        schemaVersion: 1,
        requests: {
          "ai-video-pilot": {
            googleVeo: {
              ...veoConfig,
              instances: [{ prompt: "Never send sk-example-placeholder-value in a prompt" }],
            },
          },
        },
      },
    ];

    for (const document of cases) {
      const { service } = await fixture({ document });
      await expect(service.inspect({ runId, jobId: "voice-timing", scopeHash })).resolves.toMatchObject({
        readiness: "blocked",
        ready: false,
        proposal: null,
      });
    }
  });
});

describe("exact local-user provider approval", () => {
  it("rejects agent, unconfirmed, and stale approvals, then survives restart with a private persisted secret", async () => {
    const { service, runDirectory, privateDirectory, resolveRunDirectory } = await fixture({ persistSecret: true });
    const inspected = await service.inspect({ runId, jobId: "voice-timing", scopeHash });

    await expect(service.approve({
      runId,
      jobId: "voice-timing",
      scopeHash,
      actionHash: inspected.proposal.actionHash,
      confirmed: true,
      actor: { kind: "local-agent", id: "desktop-agent" },
    })).rejects.toMatchObject({ code: "PROVIDER_ACTION_LOCAL_USER_REQUIRED" });
    await expect(service.approve({
      runId,
      jobId: "voice-timing",
      scopeHash,
      actionHash: inspected.proposal.actionHash,
      confirmed: false,
      actor,
    })).rejects.toMatchObject({ code: "PROVIDER_ACTION_CONFIRMATION_REQUIRED" });
    await expect(service.approve({
      runId,
      jobId: "voice-timing",
      scopeHash,
      actionHash: "0".repeat(64),
      confirmed: true,
      actor,
    })).rejects.toMatchObject({ code: "PROVIDER_ACTION_APPROVAL_STALE" });

    const receipt = await service.approve({
      runId,
      jobId: "voice-timing",
      scopeHash,
      actionHash: inspected.proposal.actionHash,
      confirmed: true,
      actor,
    });
    expect(receipt).toMatchObject({
      runId,
      jobId: "voice-timing",
      scopeHash,
      actionHash: inspected.proposal.actionHash,
      approvedBy: actor.id,
      signatureVerified: true,
    });

    const keyPath = path.join(privateDirectory, "approval-hmac.key");
    const secretBytes = await readFile(keyPath);
    expect(secretBytes.byteLength).toBe(32);
    if (process.platform !== "win32") expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
    const receiptNames = await readdir(path.join(privateDirectory, "receipts"));
    expect(receiptNames).toHaveLength(1);
    const receiptPath = path.join(privateDirectory, "receipts", receiptNames[0]);
    expect(path.relative(runDirectory, receiptPath).startsWith("..")).toBe(true);
    const persistedText = await readFile(receiptPath, "utf8");
    expect(persistedText).not.toContain(voiceConfig.text);
    expect(persistedText).not.toContain("approval-hmac.key");
    expect(persistedText).not.toContain(secretBytes.toString("hex"));
    expect(persistedText).not.toContain(secretBytes.toString("base64"));

    const restarted = await createProviderActionService({
      resolveRunDirectory,
      storageDirectory: privateDirectory,
      clock: () => new Date("2026-08-09T12:01:00.000Z"),
    });
    await expect(restarted.inspect({ runId, jobId: "voice-timing", scopeHash })).resolves.toMatchObject({
      readiness: "ready",
      ready: true,
      blocker: null,
      approval: { status: "approved", receipt: { receiptId: receipt.receiptId } },
    });
  });

  it("blocks a receipt changed after approval instead of treating it as valid or absent", async () => {
    const { service, privateDirectory } = await fixture();
    const inspected = await service.inspect({ runId, jobId: "voice-timing", scopeHash });
    await service.approve({
      runId,
      jobId: "voice-timing",
      scopeHash,
      actionHash: inspected.proposal.actionHash,
      confirmed: true,
      actor,
    });
    const [name] = await readdir(path.join(privateDirectory, "receipts"));
    const receiptPath = path.join(privateDirectory, "receipts", name);
    const envelope = JSON.parse(await readFile(receiptPath, "utf8"));
    envelope.payload.actionHash = "f".repeat(64);
    await writeFile(receiptPath, `${JSON.stringify(envelope, null, 2)}\n`);

    await expect(service.inspect({ runId, jobId: "voice-timing", scopeHash })).resolves.toMatchObject({
      readiness: "blocked",
      ready: false,
      blocker: { code: "PROVIDER_ACTION_RECEIPT_INVALID" },
    });
  });
});

describe("approval-gated provider adapter", () => {
  it("makes no adapter call before approval and hydrates only canonical config plus exact grants", async () => {
    const { service } = await fixture();
    const submit = vi.fn(async () => ({ status: "accepted", externalId: "voice-request-1" }));
    const reconcile = vi.fn(async () => ({ status: "running", externalId: "voice-request-1" }));
    const adapter = service.wrapAdapter({
      id: ELEVENLABS_TIMED_TTS_ADAPTER_ID,
      kind: "provider-api",
      submit,
      reconcile,
    });
    const request = executionRequest({
      payload: {
        apiKey: "must-not-flow",
        elevenLabs: { ...voiceConfig, text: "stale unapproved text" },
      },
    });
    request.authorization = "Bearer must-not-flow";
    request.job.secret = "must-not-flow";

    await expect(adapter.submit(request)).rejects.toMatchObject({
      code: "PROVIDER_ACTION_APPROVAL_REQUIRED",
      definitelyNotSubmitted: true,
    });
    await expect(adapter.reconcile(request)).rejects.toMatchObject({
      code: "PROVIDER_ACTION_APPROVAL_REQUIRED",
      definitelyNotSubmitted: true,
    });
    expect(submit).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();

    const inspected = await service.inspect({ runId, jobId: "voice-timing", scopeHash });
    await service.approve({
      runId,
      jobId: "voice-timing",
      scopeHash,
      actionHash: inspected.proposal.actionHash,
      confirmed: true,
      actor,
    });
    await expect(adapter.submit(request)).resolves.toEqual({
      status: "accepted",
      externalId: "voice-request-1",
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0].job.payload).toEqual({
      elevenLabs: voiceConfig,
      approvalGrants: createElevenLabsTimedTtsApprovalGrants(voiceConfig),
    });
    expect(JSON.stringify(submit.mock.calls[0][0])).not.toContain("must-not-flow");
    expect(request.job.payload.apiKey).toBe("must-not-flow");

    await expect(adapter.reconcile(request)).resolves.toEqual({
      status: "running",
      externalId: "voice-request-1",
    });
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile.mock.calls[0][0].job.payload).toEqual({
      elevenLabs: voiceConfig,
      approvalGrants: createElevenLabsTimedTtsApprovalGrants(voiceConfig),
    });
    expect(JSON.stringify(reconcile.mock.calls[0][0])).not.toContain("must-not-flow");
  });

  it("invalidates approval when the canonical provider config changes", async () => {
    const { service, runDirectory } = await fixture();
    const submit = vi.fn(async () => ({ status: "accepted", externalId: "voice-request-1" }));
    const adapter = service.wrapAdapter({ id: ELEVENLABS_TIMED_TTS_ADAPTER_ID, submit });
    const inspected = await service.inspect({ runId, jobId: "voice-timing", scopeHash });
    await service.approve({
      runId,
      jobId: "voice-timing",
      scopeHash,
      actionHash: inspected.proposal.actionHash,
      confirmed: true,
      actor,
    });
    const staleScopeRequest = executionRequest({ submissionSeed: "stale-scope" });
    staleScopeRequest.scopeHash = sha256("different-execution-scope");
    await expect(adapter.submit(staleScopeRequest)).rejects.toMatchObject({
      code: "PROVIDER_ACTION_APPROVAL_REQUIRED",
      definitelyNotSubmitted: true,
    });
    await writeRequests(runDirectory, {
      schemaVersion: 1,
      requests: { "voice-timing": { elevenLabs: { ...voiceConfig, seed: 42 } } },
    });

    await expect(adapter.submit(executionRequest())).rejects.toMatchObject({
      code: "PROVIDER_ACTION_APPROVAL_REQUIRED",
      definitelyNotSubmitted: true,
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("hydrates all three canonical job namespaces with their exact grants", async () => {
    const document = {
      schemaVersion: 1,
      requests: {
        "voice-timing": { elevenLabs: voiceConfig },
        "ai-video-pilot": { googleVeo: veoConfig },
        "licensed-acquisition": { stockMedia: { selection: stockSelection } },
      },
    };
    const verifyStockSelection = vi.fn(async (selection) => (
      selection.selectionProof?.hmacSha256 === stockSelection.selectionProof.hmacSha256
    ));
    const { service } = await fixture({ document, verifyStockSelection });
    const rawAdapters = [
      { id: ELEVENLABS_TIMED_TTS_ADAPTER_ID, submit: vi.fn(async () => ({ status: "accepted" })) },
      { id: GOOGLE_VEO_ADAPTER_ID, submit: vi.fn(async () => ({ status: "accepted" })) },
      { id: STOCK_MEDIA_ADAPTER_ID, submit: vi.fn(async () => ({ status: "accepted" })) },
    ];
    const adapters = createProviderActionAdapters({ actionService: service, rawAdapters });
    expect(adapters.map((adapter) => adapter.id)).toEqual(rawAdapters.map((adapter) => adapter.id));
    expect(createProviderActionAdapter({ actionService: service, rawAdapter: rawAdapters[0] }).id)
      .toBe(ELEVENLABS_TIMED_TTS_ADAPTER_ID);

    for (const jobId of ["voice-timing", "ai-video-pilot", "licensed-acquisition"]) {
      const inspected = await service.inspect({ runId, jobId, scopeHash });
      expect(inspected.readiness).toBe("approval-required");
      await service.approve({
        runId,
        jobId,
        scopeHash,
        actionHash: inspected.proposal.actionHash,
        confirmed: true,
        actor,
      });
    }

    await adapters[0].submit(providerExecutionRequest({
      adapterId: ELEVENLABS_TIMED_TTS_ADAPTER_ID,
      jobId: "voice-timing",
    }));
    await adapters[1].submit(providerExecutionRequest({
      adapterId: GOOGLE_VEO_ADAPTER_ID,
      jobId: "ai-video-pilot",
    }));
    await adapters[2].submit(providerExecutionRequest({
      adapterId: STOCK_MEDIA_ADAPTER_ID,
      jobId: "licensed-acquisition",
    }));

    expect(rawAdapters[0].submit.mock.calls[0][0].job.payload).toEqual({
      elevenLabs: voiceConfig,
      approvalGrants: createElevenLabsTimedTtsApprovalGrants(voiceConfig),
    });
    expect(rawAdapters[1].submit.mock.calls[0][0].job.payload).toEqual({
      googleVeo: veoConfig,
      approvalGrants: createGoogleVeoApprovalGrants(veoConfig),
    });
    expect(rawAdapters[2].submit.mock.calls[0][0].job.payload).toEqual({
      stockMedia: { selection: stockSelection },
      approvalGrants: createStockDownloadApprovalGrants(stockSelection),
    });

    const stockProposal = await service.inspect({ runId, jobId: "licensed-acquisition", scopeHash });
    expect(JSON.stringify(stockProposal)).not.toContain("private-capability");
    expect(stockProposal.proposal.exactRequest.download).toMatchObject({
      queryPresent: true,
      exactUrlSha256: stableSha256({ url: stockSelection.downloadUrl }),
    });
    expect(verifyStockSelection).toHaveBeenCalled();
  });

  it("persists ambiguity before returning and never resubmits the same external attempt after restart", async () => {
    const approvalSecret = "provider-action-restart-secret-0001";
    const { service, privateDirectory, resolveRunDirectory } = await fixture({ approvalSecret });
    const inspected = await service.inspect({ runId, jobId: "voice-timing", scopeHash });
    await service.approve({
      runId,
      jobId: "voice-timing",
      scopeHash,
      actionHash: inspected.proposal.actionHash,
      confirmed: true,
      actor,
    });
    const ambiguous = Object.assign(new Error("connection ended after write"), {
      code: "ELEVENLABS_SUBMISSION_AMBIGUOUS",
      definitelyNotSubmitted: false,
    });
    const firstSubmit = vi.fn(async () => { throw ambiguous; });
    const first = service.wrapAdapter({ id: ELEVENLABS_TIMED_TTS_ADAPTER_ID, submit: firstSubmit });
    const request = executionRequest({ submissionSeed: "ambiguous-once" });

    await expect(first.submit(request)).rejects.toBe(ambiguous);
    await expect(first.submit(request)).resolves.toMatchObject({
      status: "unknown",
      reasonCode: "ELEVENLABS_SUBMISSION_AMBIGUOUS",
    });
    expect(firstSubmit).toHaveBeenCalledTimes(1);

    const restarted = await createProviderActionService({
      resolveRunDirectory,
      storageDirectory: privateDirectory,
      approvalSecret,
      clock: () => new Date("2026-08-09T12:05:00.000Z"),
    });
    const afterRestartSubmit = vi.fn(async () => ({ status: "accepted", externalId: "must-not-happen" }));
    const afterRestart = restarted.wrapAdapter({
      id: ELEVENLABS_TIMED_TTS_ADAPTER_ID,
      submit: afterRestartSubmit,
    });
    await expect(afterRestart.submit(request)).resolves.toMatchObject({
      status: "unknown",
      reasonCode: "ELEVENLABS_SUBMISSION_AMBIGUOUS",
    });
    expect(afterRestartSubmit).not.toHaveBeenCalled();
  });
});
