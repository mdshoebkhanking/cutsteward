import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildElevenLabsTimedTtsIntent,
  buildGoogleVeoIntent,
  createElevenLabsTimedTtsAdapter,
  createElevenLabsTimedTtsApprovalGrants,
  createGoogleVeoAdapter,
  createGoogleVeoApprovalGrants,
  createPexelsVideoClient,
  createPixabayVideoClient,
  createStockDownloadApprovalGrants,
  createStockMediaAdapter,
  ELEVENLABS_TIMED_TTS_ADAPTER_ID,
  GOOGLE_VEO_ADAPTER_ID,
  STOCK_MEDIA_ADAPTER_ID,
  STOCK_QUERY_CACHE_TTL_MS,
} from "../server/providers/index.mjs";
import {
  createAdapterRegistry,
  createExecutionEngine,
  createJsonExecutionStorage,
} from "../server/execution/index.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const TEST_STOCK_PROOF_HMAC = sha256("provider-adapter-test-stock-proof");

function withTestStockProof(selection) {
  return {
    ...selection,
    selectionProof: {
      schemaVersion: 1,
      kind: "stock-search-explicit-selection",
      provider: selection.provider,
      cacheKey: sha256("provider-adapter-test-cache"),
      cacheEntryHash: sha256("provider-adapter-test-entry"),
      cacheExpiresAt: "2026-08-10T12:00:00.000Z",
      selectionHash: selection.selectionHash,
      assetId: selection.assetId,
      renditionId: selection.renditionId,
      selectedAt: "2026-08-09T12:00:00.000Z",
      algorithm: "HMAC-SHA256",
      keyId: "0123456789abcdef01234567",
      hmacSha256: TEST_STOCK_PROOF_HMAC,
    },
  };
}

async function verifyTestStockProof(selection) {
  return selection.selectionProof?.hmacSha256 === TEST_STOCK_PROOF_HMAC;
}

function requestFor({ adapterId, payload, outputRoles, externalId = null, seed = "request" }) {
  return {
    adapterId,
    runId: "provider-test-run",
    scopeHash: sha256("provider-test-scope"),
    strategyId: "provider-test-strategy",
    submissionKey: sha256(seed),
    attemptNumber: 1,
    routeAttempt: 1,
    externalId,
    job: {
      id: "provider-job",
      laneId: "provider-lane",
      dependsOn: [],
      outputRoles,
      payload,
    },
  };
}

async function temporaryRunDirectory(label) {
  return mkdtemp(path.join(tmpdir(), `framepilot-provider-${label}-`));
}

function jsonResponse(value, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function verifyOutput(runDirectory, output) {
  const contents = await readFile(path.join(runDirectory, ...output.relativePath.split("/")));
  expect(contents.byteLength).toBe(output.bytes);
  expect(sha256(contents)).toBe(output.sha256);
  return contents;
}

describe("ElevenLabs timed TTS execution adapter", () => {
  const config = {
    voiceId: "voice_test_123",
    text: "Hello brave world",
    modelId: "eleven_multilingual_v2",
    outputFormat: "mp3_44100_128",
    voiceSettings: { stability: 0.45, similarity_boost: 0.8 },
    seed: 41,
  };

  it("fingerprints the exact request, requires exact grants, writes verified timed artifacts, and deduplicates", async () => {
    const runDirectory = await temporaryRunDirectory("elevenlabs");
    const calls = [];
    let credentialCalls = 0;
    const audio = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01]);
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({
        audio_base64: audio.toString("base64"),
        alignment: {
          characters: ["H", "i", " ", "a", "l", "l"],
          character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
          character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
        },
        normalized_alignment: {
          characters: ["H", "i", " ", "a", "l", "l"],
          character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
          character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
        },
      }, {
        headers: {
          "request-id": "eleven-request-1",
          "x-trace-id": "trace-1",
          "character-cost": "17",
        },
      });
    };
    const adapter = createElevenLabsTimedTtsAdapter({
      fetchImpl,
      resolveCredential: async ({ provider, names }) => {
        credentialCalls += 1;
        expect(provider).toBe("elevenlabs");
        expect(names).toEqual(["ELEVENLABS_API_KEY"]);
        return "injected-eleven-key";
      },
      resolveRunDirectory: async () => runDirectory,
    });
    const request = requestFor({
      adapterId: ELEVENLABS_TIMED_TTS_ADAPTER_ID,
      outputRoles: ["voice_performance_map", "voice_media", "word_timings"],
      payload: {
        elevenLabs: config,
        approvalGrants: createElevenLabsTimedTtsApprovalGrants(config),
      },
      seed: "eleven-success",
    });

    const fingerprint = buildElevenLabsTimedTtsIntent(config);
    expect(fingerprint.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(buildElevenLabsTimedTtsIntent({ ...config, seed: 42 }).requestFingerprint)
      .not.toBe(fingerprint.requestFingerprint);

    const result = await adapter.submit(request);
    expect(result).toMatchObject({ status: "succeeded", externalId: "eleven-request-1" });
    expect(result.outputs.map((output) => output.role).sort()).toEqual([
      "voice_media",
      "voice_performance_map",
      "word_timings",
    ]);
    expect(calls).toHaveLength(1);
    expect(credentialCalls).toBe(1);
    expect(calls[0].url).toContain("/v1/text-to-speech/voice_test_123/with-timestamps");
    expect(calls[0].url).toContain("output_format=mp3_44100_128");
    expect(calls[0].options.headers["xi-api-key"]).toBe("injected-eleven-key");
    expect(JSON.parse(calls[0].options.body)).toMatchObject({
      text: config.text,
      model_id: config.modelId,
      seed: 41,
      voice_settings: config.voiceSettings,
    });

    for (const output of result.outputs) await verifyOutput(runDirectory, output);
    const manifestOutput = result.outputs.find((output) => output.role === "voice_performance_map");
    const manifestText = (await verifyOutput(runDirectory, manifestOutput)).toString("utf8");
    expect(manifestText).toContain(fingerprint.requestFingerprint);
    expect(manifestText).not.toContain("injected-eleven-key");
    expect(manifestText).not.toContain(config.text);
    const timingOutput = result.outputs.find((output) => output.role === "word_timings");
    const timings = JSON.parse(await readFile(path.join(runDirectory, ...timingOutput.relativePath.split("/")), "utf8"));
    expect(timings.words.map((word) => word.text)).toEqual(["Hi", "all"]);

    expect(await adapter.submit(request)).toEqual(result);
    expect(calls).toHaveLength(1);
    expect(credentialCalls).toBe(1);
  });

  it("blocks stale approvals before credentials/fetch and makes a post-send transport failure ambiguous without re-sending", async () => {
    const runDirectory = await temporaryRunDirectory("elevenlabs-ambiguity");
    let fetchCalls = 0;
    let credentialCalls = 0;
    const adapter = createElevenLabsTimedTtsAdapter({
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("simulated connection reset after request write");
      },
      resolveCredential: async () => {
        credentialCalls += 1;
        return "injected-key";
      },
      resolveRunDirectory: async () => runDirectory,
    });
    const invalidRequest = requestFor({
      adapterId: ELEVENLABS_TIMED_TTS_ADAPTER_ID,
      outputRoles: ["voice_media"],
      payload: {
        elevenLabs: config,
        approvalGrants: createElevenLabsTimedTtsApprovalGrants({ ...config, seed: 999 }),
      },
      seed: "eleven-stale-grant",
    });
    await expect(adapter.submit(invalidRequest)).rejects.toMatchObject({
      code: "PROVIDER_APPROVAL_REQUIRED",
      definitelyNotSubmitted: true,
      retryable: false,
    });
    expect(credentialCalls).toBe(0);
    expect(fetchCalls).toBe(0);

    const ambiguousRequest = requestFor({
      adapterId: ELEVENLABS_TIMED_TTS_ADAPTER_ID,
      outputRoles: ["voice_media"],
      payload: {
        elevenLabs: config,
        approvalGrants: createElevenLabsTimedTtsApprovalGrants(config),
      },
      seed: "eleven-ambiguous",
    });
    await expect(adapter.submit(ambiguousRequest)).rejects.toMatchObject({
      code: "ELEVENLABS_SUBMISSION_AMBIGUOUS",
      definitelyNotSubmitted: false,
    });
    expect(fetchCalls).toBe(1);
    expect(await adapter.submit(ambiguousRequest)).toMatchObject({
      status: "unknown",
      reasonCode: "ELEVENLABS_SUBMISSION_AMBIGUOUS",
    });
    expect(fetchCalls).toBe(1);
  });
});

describe("Google Veo long-running execution adapter", () => {
  const config = {
    model: "veo-3.1-generate-preview",
    instances: [{ prompt: "A locked-off macro shot of a glass prism" }],
    parameters: { aspectRatio: "9:16", sampleCount: 1 },
    sampleIndex: 0,
  };

  it("submits once, persists the operation name, polls, downloads, and commits exact artifacts", async () => {
    const runDirectory = await temporaryRunDirectory("veo");
    const calls = [];
    const video = Buffer.from("mock-mp4-video-payload");
    const responses = [
      jsonResponse({ name: "operations/veo-job-123" }),
      jsonResponse({ name: "operations/veo-job-123", done: false }),
      jsonResponse({
        name: "operations/veo-job-123",
        done: true,
        response: {
          generateVideoResponse: {
            generatedSamples: [{
              video: {
                uri: "https://generativelanguage.googleapis.com/v1beta/files/veo-file-1:download?alt=media",
              },
            }],
          },
        },
      }),
      new Response(video, { status: 200, headers: { "content-type": "video/mp4" } }),
    ];
    const adapter = createGoogleVeoAdapter({
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        const response = responses.shift();
        if (!response) throw new Error("unexpected fetch");
        return response;
      },
      resolveCredential: async ({ names }) => {
        expect(names).toEqual(["GEMINI_API_KEY", "GOOGLE_API_KEY"]);
        return { name: "GEMINI_API_KEY", value: "injected-google-key" };
      },
      resolveRunDirectory: async () => runDirectory,
    });
    const baseRequest = requestFor({
      adapterId: GOOGLE_VEO_ADAPTER_ID,
      outputRoles: ["generation_manifest", "source_media"],
      payload: {
        googleVeo: config,
        approvalGrants: createGoogleVeoApprovalGrants(config),
      },
      seed: "veo-long-running",
    });

    expect(buildGoogleVeoIntent(config).requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    const accepted = await adapter.submit(baseRequest);
    expect(accepted).toEqual({ status: "accepted", externalId: "operations/veo-job-123" });
    expect(await adapter.submit(baseRequest)).toEqual(accepted);
    expect(calls.filter((call) => call.options.method === "POST")).toHaveLength(1);
    expect(calls[0].url).toContain("/v1beta/models/veo-3.1-generate-preview:predictLongRunning");
    expect(calls[0].options.headers["x-goog-api-key"]).toBe("injected-google-key");
    expect(JSON.parse(calls[0].options.body)).toEqual({
      instances: config.instances,
      parameters: config.parameters,
    });

    const reconcileRequest = { ...baseRequest, externalId: accepted.externalId };
    expect(await adapter.reconcile(reconcileRequest)).toEqual({
      status: "running",
      externalId: accepted.externalId,
    });
    const succeeded = await adapter.reconcile(reconcileRequest);
    expect(succeeded).toMatchObject({ status: "succeeded", externalId: accepted.externalId });
    expect(succeeded.outputs.map((output) => output.role).sort()).toEqual([
      "generation_manifest",
      "source_media",
    ]);
    expect(calls.filter((call) => call.options.method === "POST")).toHaveLength(1);
    expect(calls.filter((call) => call.url.includes("/v1beta/operations/veo-job-123"))).toHaveLength(2);
    expect(calls.at(-1).url).toContain("/v1beta/files/veo-file-1:download");
    for (const output of succeeded.outputs) await verifyOutput(runDirectory, output);
    const manifestOutput = succeeded.outputs.find((output) => output.role === "generation_manifest");
    const manifest = JSON.parse(await readFile(
      path.join(runDirectory, ...manifestOutput.relativePath.split("/")),
      "utf8",
    ));
    expect(manifest).toMatchObject({
      operationName: "operations/veo-job-123",
      model: config.model,
      selectedSampleIndex: 0,
      availableSampleCount: 1,
    });
    expect(JSON.stringify(manifest)).not.toContain("injected-google-key");
  });

  it("never submits a second operation when a durable externalId is already present", async () => {
    let fetchCalls = 0;
    const runDirectory = await temporaryRunDirectory("veo-existing-operation");
    const adapter = createGoogleVeoAdapter({
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("must not fetch");
      },
      resolveCredential: async () => "unused-key",
      resolveRunDirectory: async () => runDirectory,
    });
    const request = requestFor({
      adapterId: GOOGLE_VEO_ADAPTER_ID,
      outputRoles: ["generation_manifest", "source_media"],
      externalId: "operations/already-submitted",
      payload: {
        googleVeo: config,
        approvalGrants: createGoogleVeoApprovalGrants(config),
      },
      seed: "veo-existing-operation",
    });
    expect(await adapter.submit(request)).toEqual({
      status: "accepted",
      externalId: "operations/already-submitted",
    });
    expect(fetchCalls).toBe(0);
  });
});

describe("Pexels and Pixabay stock provenance", () => {
  it("caches Pexels queries for 24 hours, exposes quota state, requires explicit selection, and downloads with a license ledger", async () => {
    let now = Date.parse("2026-08-09T10:00:00.000Z");
    let searchCalls = 0;
    let credentialCalls = 0;
    const client = createPexelsVideoClient({
      clock: () => now,
      resolveCredential: async ({ provider }) => {
        credentialCalls += 1;
        expect(provider).toBe("pexels");
        return "injected-pexels-key";
      },
      fetchImpl: async (url, options) => {
        searchCalls += 1;
        expect(url).toContain("https://api.pexels.com/v1/videos/search");
        expect(options.headers.Authorization).toBe("injected-pexels-key");
        return jsonResponse({
          videos: [{
            id: 901,
            url: "https://www.pexels.com/video/prism-901/",
            duration: 8,
            image: "https://images.pexels.com/videos/901/preview.jpg",
            user: { id: 77, name: "Example Creator", url: "https://www.pexels.com/@creator" },
            video_files: [
              {
                id: 1001,
                quality: "hd",
                file_type: "video/mp4",
                width: 1080,
                height: 1920,
                link: "https://videos.pexels.com/video-files/901/1001.mp4",
              },
              {
                id: 1002,
                quality: "sd",
                file_type: "video/mp4",
                width: 540,
                height: 960,
                link: "https://videos.pexels.com/video-files/901/1002.mp4",
              },
            ],
          }],
        }, {
          headers: {
            "x-ratelimit-limit": "200",
            "x-ratelimit-remaining": "199",
            "x-ratelimit-reset": "1786269600",
          },
        });
      },
    });

    const query = { query: "glass prism", orientation: "portrait", perPage: 15 };
    const first = await client.searchVideos(query);
    const cached = await client.searchVideos(query);
    expect(searchCalls).toBe(1);
    expect(credentialCalls).toBe(1);
    expect(first.cache).toMatchObject({ hit: false, ttlMs: STOCK_QUERY_CACHE_TTL_MS });
    expect(cached.cache).toMatchObject({ hit: true, key: first.cache.key });
    expect(first.quota).toMatchObject({
      limit: 200,
      remaining: 199,
      reset: 1786269600,
      resetMeaning: "unix-seconds",
    });
    expect(() => client.createSelection(first)).toThrowError(expect.objectContaining({
      code: "STOCK_SELECTION_REQUIRED",
    }));
    const selection = withTestStockProof(
      client.createSelection(first, { assetId: "901", renditionId: "1001" }),
    );
    expect(selection).toMatchObject({
      provider: "pexels",
      assetId: "901",
      renditionId: "1001",
      sourcePageUrl: "https://www.pexels.com/video/prism-901/",
    });
    expect(selection.selectionHash).toMatch(/^[a-f0-9]{64}$/);

    const runDirectory = await temporaryRunDirectory("pexels-download");
    let downloadCalls = 0;
    const adapter = createStockMediaAdapter({
      fetchImpl: async (url) => {
        downloadCalls += 1;
        expect(url).toBe(selection.downloadUrl);
        return new Response(Buffer.from("selected-pexels-video"), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        });
      },
      resolveRunDirectory: async () => runDirectory,
      verifyStockSelection: verifyTestStockProof,
    });
    const request = requestFor({
      adapterId: STOCK_MEDIA_ADAPTER_ID,
      outputRoles: ["asset_manifest", "license_attribution_ledger"],
      payload: {
        stockMedia: { selection },
        approvalGrants: createStockDownloadApprovalGrants(selection),
      },
      seed: "pexels-download",
    });
    const result = await adapter.submit(request);
    expect(result.status).toBe("succeeded");
    expect(result.outputs.map((output) => output.role).sort()).toEqual([
      "asset_manifest",
      "license_attribution_ledger",
      "source_media",
    ]);
    expect(downloadCalls).toBe(1);
    for (const output of result.outputs) await verifyOutput(runDirectory, output);
    const ledgerOutput = result.outputs.find((output) => output.role === "license_attribution_ledger");
    const ledger = JSON.parse(await readFile(
      path.join(runDirectory, ...ledgerOutput.relativePath.split("/")),
      "utf8",
    ));
    expect(ledger).toMatchObject({
      provider: "pexels",
      assetId: "901",
      renditionId: "1001",
      license: {
        name: "Pexels License",
        attributionRequiredByContentLicense: false,
        apiDisplayLinkRequired: true,
      },
    });

    now += STOCK_QUERY_CACHE_TTL_MS + 1;
    await client.searchVideos(query);
    expect(searchCalls).toBe(2);
  });

  it("keeps Pixabay credentials out of results/cache keys and preserves provider quota semantics", async () => {
    const requestedUrls = [];
    const client = createPixabayVideoClient({
      clock: () => Date.parse("2026-08-09T12:00:00.000Z"),
      resolveCredential: async () => "injected-pixabay-key",
      fetchImpl: async (url) => {
        requestedUrls.push(url);
        return jsonResponse({
          hits: [{
            id: 808,
            pageURL: "https://pixabay.com/videos/id-808/",
            duration: 12,
            user_id: 55,
            user: "Pixabay Creator",
            videos: {
              large: {
                url: "https://cdn.pixabay.com/video/808-large.mp4",
                width: 1920,
                height: 1080,
                size: 123456,
                thumbnail: "https://cdn.pixabay.com/video/808-thumb.jpg",
              },
            },
          }],
        }, {
          headers: {
            "x-ratelimit-limit": "100",
            "x-ratelimit-remaining": "87",
            "x-ratelimit-reset": "42",
          },
        });
      },
    });
    const result = await client.searchVideos({ query: "forest", perPage: 20 });
    expect(requestedUrls).toHaveLength(1);
    expect(new URL(requestedUrls[0]).searchParams.get("key")).toBe("injected-pixabay-key");
    expect(JSON.stringify(result)).not.toContain("injected-pixabay-key");
    expect(result.cache.key).toMatch(/^[a-f0-9]{64}$/);
    expect(result.quota).toMatchObject({
      limit: 100,
      remaining: 87,
      reset: 42,
      resetMeaning: "seconds-until-reset",
      resetsAt: null,
    });
    const selection = client.createSelection(result, { assetId: "808", renditionId: "large" });
    expect(selection).toMatchObject({
      provider: "pixabay",
      assetId: "808",
      renditionId: "large",
      downloadUrl: "https://cdn.pixabay.com/video/808-large.mp4",
      license: { name: "Pixabay Content License" },
    });
  });

  it("rejects selection tampering and missing exact stock approval before download", async () => {
    const client = createPixabayVideoClient({
      clock: () => Date.parse("2026-08-09T12:00:00.000Z"),
      resolveCredential: async () => "pixabay-key",
      fetchImpl: async () => jsonResponse({
        hits: [{
          id: 1,
          pageURL: "https://pixabay.com/videos/id-1/",
          user_id: 2,
          user: "Creator",
          videos: {
            tiny: {
              url: "https://cdn.pixabay.com/video/1.mp4",
              width: 320,
              height: 180,
              size: 1000,
            },
          },
        }],
      }),
    });
    const result = await client.searchVideos({ query: "safe" });
    const selection = withTestStockProof(
      client.createSelection(result, { assetId: "1", renditionId: "tiny" }),
    );
    const runDirectory = await temporaryRunDirectory("stock-approval");
    let downloadCalls = 0;
    const adapter = createStockMediaAdapter({
      fetchImpl: async () => {
        downloadCalls += 1;
        return new Response(Buffer.from("never reached"));
      },
      resolveRunDirectory: async () => runDirectory,
      verifyStockSelection: verifyTestStockProof,
    });
    const tampered = { ...selection, downloadUrl: "https://cdn.pixabay.com/video/other.mp4" };
    const tamperedRequest = requestFor({
      adapterId: STOCK_MEDIA_ADAPTER_ID,
      outputRoles: ["asset_manifest", "license_attribution_ledger"],
      payload: {
        stockMedia: { selection: tampered },
        approvalGrants: createStockDownloadApprovalGrants(selection),
      },
      seed: "stock-tampered",
    });
    await expect(adapter.submit(tamperedRequest)).rejects.toMatchObject({
      code: "STOCK_SELECTION_INVALID",
      definitelyNotSubmitted: true,
    });

    const missingApprovalRequest = requestFor({
      adapterId: STOCK_MEDIA_ADAPTER_ID,
      outputRoles: ["asset_manifest", "license_attribution_ledger"],
      payload: { stockMedia: { selection }, approvalGrants: [] },
      seed: "stock-no-approval",
    });
    await expect(adapter.submit(missingApprovalRequest)).rejects.toMatchObject({
      code: "PROVIDER_APPROVAL_REQUIRED",
      definitelyNotSubmitted: true,
    });
    expect(downloadCalls).toBe(0);
  });
});

describe("provider construction safety", () => {
  it("plugs directly into createExecutionEngine and produces normalized receipts", async () => {
    const runDirectory = await temporaryRunDirectory("engine-seam");
    const config = {
      voiceId: "engine_voice",
      text: "Engine seam",
      outputFormat: "mp3_44100_128",
    };
    const adapter = createElevenLabsTimedTtsAdapter({
      fetchImpl: async () => jsonResponse({
        audio_base64: Buffer.from("engine-audio").toString("base64"),
        alignment: {
          characters: ["O", "K"],
          character_start_times_seconds: [0, 0.1],
          character_end_times_seconds: [0.1, 0.2],
        },
      }),
      resolveCredential: async () => "engine-key",
      resolveRunDirectory: async () => runDirectory,
    });
    const engine = createExecutionEngine({
      storage: createJsonExecutionStorage(),
      adapters: createAdapterRegistry([adapter]),
      clock: () => new Date("2026-08-09T14:00:00.000Z"),
    });
    const jobs = [{
      id: "voice-job",
      laneId: "voice",
      selected: true,
      adapterCandidates: [ELEVENLABS_TIMED_TTS_ADAPTER_ID],
      dependsOn: [],
      approvalIds: [],
      outputRoles: ["voice_performance_map", "voice_media", "word_timings"],
      payload: {
        elevenLabs: config,
        approvalGrants: createElevenLabsTimedTtsApprovalGrants(config),
      },
    }];
    await engine.materialize({
      runId: "provider-engine-run",
      runDirectory,
      directorPlan: {
        planHash: sha256(JSON.stringify(jobs)),
        approvals: [],
        execution: { jobs },
      },
      authority: { actorId: "test-host", grants: ["persist"] },
    });
    const snapshot = await engine.command({
      runDirectory,
      command: { type: "advance" },
      authority: { actorId: "test-runner", grants: ["persist", "submit", "reconcile"] },
    });
    expect(snapshot.status).toBe("succeeded");
    expect(snapshot.receipts).toHaveLength(1);
    expect(snapshot.receipts[0]).toMatchObject({
      adapterId: ELEVENLABS_TIMED_TTS_ADAPTER_ID,
      outputs: expect.arrayContaining([
        expect.objectContaining({ role: "voice_media", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      ]),
    });
  });

  it("does not fall back to global fetch, environment credentials, or a static key", () => {
    expect(() => createElevenLabsTimedTtsAdapter({
      resolveCredential: async () => "key",
      resolveRunDirectory: async () => "/tmp",
    })).toThrow(/fetchImpl must be injected/);
    expect(() => createGoogleVeoAdapter({
      fetchImpl: async () => jsonResponse({}),
      resolveRunDirectory: async () => "/tmp",
      apiKey: "must-not-be-used",
    })).toThrow(/resolveCredential must be injected/);
    expect(() => createPexelsVideoClient({
      fetchImpl: async () => jsonResponse({}),
      apiKey: "must-not-be-used",
    })).toThrow(/resolveCredential must be injected/);
  });
});
