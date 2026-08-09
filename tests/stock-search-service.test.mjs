import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createStockSearchService,
  STOCK_SEARCH_CACHE_FILE_NAME,
} from "../server/stock-search-service.mjs";
import {
  buildStockDownloadIntent,
  createStockDownloadApprovalGrants,
  createStockMediaAdapter,
  stableSha256,
  STOCK_MEDIA_ADAPTER_ID,
  STOCK_QUERY_CACHE_TTL_MS,
} from "../server/providers/index.mjs";

const START = Date.parse("2026-08-09T12:00:00.000Z");

function jsonResponse(value, headers = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

function pexelsPayload(id = 101) {
  return {
    videos: [{
      id,
      url: `https://www.pexels.com/video/premium-office-${id}/`,
      image: `https://images.pexels.com/videos/${id}/preview.jpg`,
      duration: 8,
      user: {
        id: 7,
        name: "Example Creator",
        url: "https://www.pexels.com/@example-creator/",
      },
      video_files: [{
        id: id + 1_000,
        quality: "hd",
        file_type: "video/mp4",
        width: 1080,
        height: 1920,
        link: `https://videos.pexels.com/video-files/${id}/${id}-portrait.mp4`,
      }],
    }],
  };
}

function pixabayPayload(id = 202) {
  return {
    hits: [{
      id,
      pageURL: `https://pixabay.com/videos/id-${id}/`,
      duration: 10,
      user_id: 9,
      user: "Example Artist",
      videos: {
        large: {
          url: `https://cdn.pixabay.com/video/${id}/large.mp4`,
          width: 1080,
          height: 1920,
          size: 456_789,
          thumbnail: `https://cdn.pixabay.com/video/${id}/thumb.jpg`,
        },
      },
    }],
  };
}

async function fixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "framepilot-stock-search-"));
  const storageDirectory = path.join(root, "private-cache");
  let milliseconds = START;
  const fetchImpl = options.fetchImpl || vi.fn(async (url) => {
    if (String(url).startsWith("https://api.pexels.com/")) {
      return jsonResponse(pexelsPayload(), {
        "x-ratelimit-limit": "200",
        "x-ratelimit-remaining": "199",
      });
    }
    if (String(url).startsWith("https://pixabay.com/api/videos/")) {
      return jsonResponse(pixabayPayload());
    }
    throw new Error(`Unexpected fetch URL: ${new URL(url).origin}`);
  });
  const resolveCredential = options.resolveCredential || vi.fn(async ({ provider, names }) => ({
    name: names[0],
    value: provider === "pexels" ? "pexels-private-key" : "pixabay-private-key",
  }));
  const create = (overrides = {}) => createStockSearchService({
    fetchImpl,
    resolveCredential,
    storageDirectory,
    clock: () => milliseconds,
    ...options.service,
    ...overrides,
  });
  return {
    root,
    storageDirectory,
    fetchImpl,
    resolveCredential,
    create,
    setTime(value) {
      milliseconds = value;
    },
  };
}

function stockExecutionRequest(selection, seed = "stock-proof") {
  return {
    adapterId: STOCK_MEDIA_ADAPTER_ID,
    runId: "stock-proof-run",
    scopeHash: stableSha256({ scope: "stock-proof-test" }),
    strategyId: "licensed-acquisition",
    submissionKey: stableSha256({ seed }),
    attemptNumber: 1,
    routeAttempt: 1,
    externalId: null,
    job: {
      id: "licensed-acquisition",
      laneId: "licensed-acquisition",
      dependsOn: [],
      outputRoles: ["asset_manifest", "license_attribution_ledger", "source_media"],
      payload: {
        stockMedia: { selection },
        approvalGrants: createStockDownloadApprovalGrants(selection),
      },
    },
  };
}

describe("durable stock search and explicit selection", () => {
  it("persists an encrypted Pexels result across restart and returns a directly usable selection", async () => {
    const context = await fixture();
    const first = await context.create();
    const result = await first.search({
      provider: "pexels",
      query: { query: "thoughtful man in a premium office", orientation: "portrait" },
    });

    expect(result).toMatchObject({
      provider: "pexels",
      cache: { hit: false, ttlMs: STOCK_QUERY_CACHE_TTL_MS },
      items: [{ assetId: "101", renditions: [{ id: "1101" }] }],
    });
    expect(context.fetchImpl).toHaveBeenCalledTimes(1);

    const cacheText = await readFile(
      path.join(context.storageDirectory, STOCK_SEARCH_CACHE_FILE_NAME),
      "utf8",
    );
    expect(cacheText).not.toContain("thoughtful man");
    expect(cacheText).not.toContain("https://");
    expect(cacheText).not.toContain("pexels-private-key");

    const restarted = await context.create();
    const cached = await restarted.search({
      provider: "pexels",
      query: { query: "thoughtful man in a premium office", orientation: "portrait" },
    });
    expect(cached.cache.hit).toBe(true);
    expect(context.fetchImpl).toHaveBeenCalledTimes(1);

    const selection = await restarted.select({
      provider: "pexels",
      cacheKey: cached.cache.key,
      assetId: "101",
      renditionId: "1101",
    });
    expect(selection).toMatchObject({
      provider: "pexels",
      assetId: "101",
      renditionId: "1101",
      selectionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      selectionProof: {
        cacheKey: cached.cache.key,
        algorithm: "HMAC-SHA256",
        hmacSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(() => buildStockDownloadIntent(selection)).not.toThrow();
    await expect(restarted.verifySelection(selection)).resolves.toBe(true);
    expect(context.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("re-verifies a durable selection after restart before the stock adapter downloads it", async () => {
    let downloadCalls = 0;
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).startsWith("https://api.pexels.com/")) return jsonResponse(pexelsPayload(303));
      if (String(url) === "https://videos.pexels.com/video-files/303/303-portrait.mp4") {
        downloadCalls += 1;
        return new Response(Buffer.from("authenticated-stock-video"), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    const context = await fixture({ fetchImpl });
    const first = await context.create();
    const result = await first.search({
      provider: "pexels",
      query: { query: "restart proof", orientation: "portrait" },
    });
    const selection = await first.select({
      provider: "pexels",
      cacheKey: result.cache.key,
      assetId: "303",
      renditionId: "1303",
    });
    const originalIntent = buildStockDownloadIntent(selection);

    const restarted = await context.create();
    await expect(restarted.verifySelection(selection)).resolves.toBe(true);
    expect(buildStockDownloadIntent(selection).actionHash).toBe(originalIntent.actionHash);
    const runDirectory = path.join(context.root, "run");
    await mkdir(runDirectory);
    const adapter = createStockMediaAdapter({
      fetchImpl,
      resolveRunDirectory: async () => runDirectory,
      verifyStockSelection: (candidate) => restarted.verifySelection(candidate),
    });
    await expect(adapter.submit(stockExecutionRequest(selection, "restart"))).resolves.toMatchObject({
      status: "succeeded",
      externalId: "pexels:303:1303",
    });
    expect(downloadCalls).toBe(1);
  });

  it("rejects forged and tampered selection proofs before any download request", async () => {
    let downloadCalls = 0;
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).startsWith("https://api.pexels.com/")) return jsonResponse(pexelsPayload(404));
      downloadCalls += 1;
      return new Response(Buffer.from("must-not-download"), { status: 200 });
    });
    const context = await fixture({ fetchImpl });
    const service = await context.create();
    const result = await service.search({ provider: "pexels", query: { query: "proof forgery" } });
    const selection = await service.select({
      provider: "pexels",
      cacheKey: result.cache.key,
      assetId: "404",
      renditionId: "1404",
    });
    const runDirectory = path.join(context.root, "run");
    await mkdir(runDirectory);
    const adapter = createStockMediaAdapter({
      fetchImpl,
      resolveRunDirectory: async () => runDirectory,
      verifyStockSelection: (candidate) => service.verifySelection(candidate),
    });

    const { selectionProof: originalProof, selectionHash: _selectionHash, ...originalPayload } = selection;
    const forgedPayload = {
      ...originalPayload,
      assetId: "forged-999",
      renditionId: "forged-hd",
      downloadUrl: "https://videos.pexels.com/video-files/999/forged-hd.mp4",
    };
    const forgedHash = stableSha256(forgedPayload);
    const forged = {
      ...forgedPayload,
      selectionHash: forgedHash,
      selectionProof: {
        ...originalProof,
        assetId: forgedPayload.assetId,
        renditionId: forgedPayload.renditionId,
        selectionHash: forgedHash,
      },
    };
    await expect(adapter.submit(stockExecutionRequest(forged, "forged"))).rejects.toMatchObject({
      code: "STOCK_SELECTION_PROOF_INVALID",
      definitelyNotSubmitted: true,
    });

    const tamperedProof = {
      ...selection,
      selectionProof: {
        ...selection.selectionProof,
        hmacSha256: `${selection.selectionProof.hmacSha256.slice(0, -1)}${
          selection.selectionProof.hmacSha256.endsWith("0") ? "1" : "0"
        }`,
      },
    };
    await expect(adapter.submit(stockExecutionRequest(tamperedProof, "tampered-proof"))).rejects.toMatchObject({
      code: "STOCK_SELECTION_PROOF_INVALID",
      definitelyNotSubmitted: true,
    });

    const tamperedFields = {
      ...selection,
      downloadUrl: "https://videos.pexels.com/video-files/404/different.mp4",
    };
    const tamperedRequest = stockExecutionRequest(selection, "tampered-fields");
    tamperedRequest.job.payload.stockMedia.selection = tamperedFields;
    await expect(adapter.submit(tamperedRequest)).rejects.toMatchObject({
      code: "STOCK_SELECTION_INVALID",
      definitelyNotSubmitted: true,
    });
    expect(downloadCalls).toBe(0);
  });

  it("rejects expired or missing durable cache evidence before any download request", async () => {
    let downloadCalls = 0;
    const context = await fixture();
    const service = await context.create();
    const result = await service.search({ provider: "pexels", query: { query: "expiry proof" } });
    const selection = await service.select({
      provider: "pexels",
      cacheKey: result.cache.key,
      assetId: "101",
      renditionId: "1101",
    });
    const runDirectory = path.join(context.root, "run");
    await mkdir(runDirectory);
    const fetchImpl = vi.fn(async () => {
      downloadCalls += 1;
      return new Response(Buffer.from("must-not-download"), { status: 200 });
    });

    const unavailableAdapter = createStockMediaAdapter({
      fetchImpl,
      resolveRunDirectory: async () => runDirectory,
    });
    await expect(unavailableAdapter.submit(stockExecutionRequest(selection, "no-verifier"))).rejects.toMatchObject({
      code: "STOCK_SELECTION_VERIFIER_UNAVAILABLE",
      definitelyNotSubmitted: true,
    });

    context.setTime(START + STOCK_QUERY_CACHE_TTL_MS);
    const expiredAdapter = createStockMediaAdapter({
      fetchImpl,
      resolveRunDirectory: async () => runDirectory,
      verifyStockSelection: (candidate) => service.verifySelection(candidate),
    });
    await expect(expiredAdapter.submit(stockExecutionRequest(selection, "expired"))).rejects.toMatchObject({
      code: "STOCK_SELECTION_PROOF_INVALID",
      definitelyNotSubmitted: true,
    });

    const missingContext = await fixture();
    const missingService = await missingContext.create();
    const missingAdapter = createStockMediaAdapter({
      fetchImpl,
      resolveRunDirectory: async () => runDirectory,
      verifyStockSelection: (candidate) => missingService.verifySelection(candidate),
    });
    await expect(missingAdapter.submit(stockExecutionRequest(selection, "missing"))).rejects.toMatchObject({
      code: "STOCK_SELECTION_PROOF_INVALID",
      definitelyNotSubmitted: true,
    });
    expect(downloadCalls).toBe(0);
  });

  it("enforces the Pixabay 24-hour cache rule and refreshes at exact expiry", async () => {
    const context = await fixture();
    await expect(context.create({ cacheTtlMs: STOCK_QUERY_CACHE_TTL_MS - 1 })).rejects.toThrow(
      /cacheTtlMs/,
    );
    const service = await context.create();
    const request = {
      provider: "pixabay",
      query: { query: "cinematic city", safesearch: true, perPage: 3 },
    };
    const first = await service.search(request);
    expect(first.cache.ttlMs).toBe(STOCK_QUERY_CACHE_TTL_MS);
    expect(context.fetchImpl).toHaveBeenCalledTimes(1);

    context.setTime(START + STOCK_QUERY_CACHE_TTL_MS - 1);
    expect((await service.search(request)).cache.hit).toBe(true);
    expect(context.fetchImpl).toHaveBeenCalledTimes(1);

    context.setTime(START + STOCK_QUERY_CACHE_TTL_MS);
    expect((await service.search(request)).cache.hit).toBe(false);
    expect(context.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the cache is tampered, including on restart", async () => {
    const context = await fixture();
    const service = await context.create();
    const result = await service.search({ provider: "pexels", query: { query: "secure test" } });
    const cachePath = path.join(context.storageDirectory, STOCK_SEARCH_CACHE_FILE_NAME);
    const envelope = JSON.parse(await readFile(cachePath, "utf8"));
    envelope.entries[0].ciphertext = `${envelope.entries[0].ciphertext.slice(0, -2)}AA`;
    await writeFile(cachePath, `${JSON.stringify(envelope, null, 2)}\n`);

    await expect(service.select({
      provider: "pexels",
      cacheKey: result.cache.key,
      assetId: "101",
      renditionId: "1101",
    })).rejects.toMatchObject({ code: "STOCK_CACHE_INTEGRITY_INVALID" });
    await expect(context.create()).rejects.toMatchObject({ code: "STOCK_CACHE_INTEGRITY_INVALID" });
  });

  it("evicts oldest entries at the configured bound and never downloads a selection", async () => {
    let id = 100;
    const fetchImpl = vi.fn(async () => jsonResponse(pexelsPayload(id++)));
    const context = await fixture({
      fetchImpl,
      service: { maximumEntries: 2, maximumCacheBytes: 64 * 1024 },
    });
    const service = await context.create();
    const results = [];
    for (const query of ["one", "two", "three"]) {
      results.push(await service.search({ provider: "pexels", query: { query } }));
    }
    expect(service.capabilities().cache.entryCount).toBe(2);
    expect((await stat(path.join(context.storageDirectory, STOCK_SEARCH_CACHE_FILE_NAME))).size)
      .toBeLessThanOrEqual(64 * 1024);
    await expect(service.select({
      provider: "pexels",
      cacheKey: results[0].cache.key,
      assetId: "100",
      renditionId: "1100",
    })).rejects.toMatchObject({ code: "STOCK_CACHE_MISS" });
    const selected = await service.select({
      provider: "pexels",
      cacheKey: results[2].cache.key,
      assetId: "102",
      renditionId: "1102",
    });
    expect(selected.assetId).toBe("102");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("requires explicit valid choices and reports credential truth without leaking values", async () => {
    const context = await fixture({ resolveCredential: vi.fn(async () => null) });
    const service = await context.create();
    await expect(service.search({ provider: "pexels", query: { query: "credential test" } }))
      .rejects.toMatchObject({ code: "PROVIDER_CREDENTIAL_UNAVAILABLE" });
    expect(context.fetchImpl).not.toHaveBeenCalled();
    const capabilities = service.capabilities();
    expect(capabilities).toMatchObject({
      operations: { search: true, explicitSelection: true, download: false },
      providers: { pexels: { credentialStatus: "unavailable" } },
      cache: { durable: true, encryptedAtRest: true, authenticated: true },
    });
    expect(JSON.stringify(capabilities)).not.toContain("private-key");

    const validContext = await fixture();
    const validService = await validContext.create();
    const result = await validService.search({ provider: "pixabay", query: { query: "explicit", perPage: 3 } });
    await expect(validService.select({
      provider: "pixabay",
      cacheKey: result.cache.key,
      assetId: "202",
    })).rejects.toMatchObject({ code: "STOCK_SELECTION_REQUIRED" });
    await expect(validService.select({
      provider: "pexels",
      cacheKey: result.cache.key,
      assetId: "202",
      renditionId: "large",
    })).rejects.toMatchObject({ code: "STOCK_CACHE_PROVIDER_MISMATCH" });
  });

  it("rejects a symlink as the private storage directory", async () => {
    if (process.platform === "win32") return;
    const root = await mkdtemp(path.join(os.tmpdir(), "framepilot-stock-symlink-"));
    const realStorage = path.join(root, "real");
    const linkStorage = path.join(root, "link");
    await mkdir(realStorage);
    await symlink(realStorage, linkStorage, "dir");
    await expect(createStockSearchService({
      fetchImpl: vi.fn(),
      resolveCredential: vi.fn(),
      storageDirectory: linkStorage,
    })).rejects.toMatchObject({ code: "STOCK_CACHE_STORAGE_INVALID" });
  });
});
