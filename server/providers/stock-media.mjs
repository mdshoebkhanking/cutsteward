import {
  assertAdapterRequestId,
  assertExactKeys,
  assertExecutionRequest,
  assertPlainObject,
  assertSupportedOutputRoles,
  assertText,
  cloneJson,
  createExactApprovalGrant,
  getInjectedCredential,
  jsonArtifactBytes,
  knownProviderError,
  readBoundedBytes,
  readBoundedJson,
  readHeader,
  requireCredentialResolver,
  requireExactApprovalGrants,
  requireInjectedFetch,
  requireRunDirectoryResolver,
  safeArtifactPath,
  stableSha256,
  writeRunArtifact,
} from "./common.mjs";

export const STOCK_MEDIA_ADAPTER_ID = "stock.rights_gated";
export const STOCK_MEDIA_APPROVALS = Object.freeze(["stock-license"]);
export const STOCK_QUERY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const SUPPORTED_OUTPUT_ROLES = new Set([
  "asset_manifest",
  "license_attribution_ledger",
  "source_media",
]);
const HTTPS = "https:";
const SHA256 = /^[a-f0-9]{64}$/;
const STOCK_SELECTION_PROOF_KEYS = new Set([
  "schemaVersion",
  "kind",
  "provider",
  "cacheKey",
  "cacheEntryHash",
  "cacheExpiresAt",
  "selectionHash",
  "assetId",
  "renditionId",
  "selectedAt",
  "algorithm",
  "keyId",
  "hmacSha256",
]);
const STOCK_SELECTION_KEYS = new Set([
  "schemaVersion",
  "provider",
  "assetId",
  "renditionId",
  "downloadUrl",
  "mediaType",
  "width",
  "height",
  "declaredBytes",
  "sourcePageUrl",
  "creator",
  "license",
  "searchQueryHash",
  "retrievedAt",
  "selectionHash",
  "selectionProof",
]);

export const PEXELS_LICENSE_METADATA = Object.freeze({
  name: "Pexels License",
  url: "https://www.pexels.com/license/",
  apiTermsUrl: "https://www.pexels.com/api/documentation/",
  attributionRequiredByContentLicense: false,
  apiDisplayLinkRequired: true,
});
export const PIXABAY_LICENSE_METADATA = Object.freeze({
  name: "Pixabay Content License",
  url: "https://pixabay.com/service/license-summary/",
  apiTermsUrl: "https://pixabay.com/api/docs/",
  attributionRequiredByContentLicense: false,
  apiDisplayLinkRequired: true,
});

function asClock(clock) {
  if (typeof clock !== "function" && typeof clock?.now !== "function") {
    throw new TypeError("clock must be a function or expose now().");
  }
  return () => {
    const raw = typeof clock === "function" ? clock() : clock.now();
    const milliseconds = raw instanceof Date ? raw.valueOf() : Number(raw);
    if (!Number.isFinite(milliseconds)) throw new TypeError("clock returned an invalid time.");
    return milliseconds;
  };
}

function isoTime(milliseconds) {
  return new Date(milliseconds).toISOString();
}

function normalizeCache(cache) {
  const store = cache ?? new Map();
  if (typeof store.get !== "function" || typeof store.set !== "function") {
    throw new TypeError("cache must implement get(key) and set(key, value).");
  }
  return store;
}

async function readCache(cache, key, now) {
  const entry = await cache.get(key);
  if (!entry || !Number.isFinite(entry.expiresAtMs) || entry.expiresAtMs <= now) return null;
  return cloneJson(entry);
}

async function writeCache(cache, key, entry) {
  await cache.set(key, cloneJson(entry));
}

function integer(value, label, minimum, maximum, fallback) {
  const selected = value ?? fallback;
  if (!Number.isInteger(selected) || selected < minimum || selected > maximum) {
    throw knownProviderError(
      `${label} must be an integer from ${minimum} through ${maximum}.`,
      "STOCK_QUERY_INVALID",
      { retryable: false },
    );
  }
  return selected;
}

function optionalEnum(value, label, allowed) {
  if (value === undefined) return undefined;
  if (!allowed.has(value)) {
    throw knownProviderError(
      `${label} must be one of: ${[...allowed].join(", ")}.`,
      "STOCK_QUERY_INVALID",
      { retryable: false },
    );
  }
  return value;
}

function optionalShortText(value, label, maximum = 64) {
  if (value === undefined) return undefined;
  return assertText(value, label, maximum);
}

function parseNonnegativeHeader(response, name) {
  const value = readHeader(response, name);
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function quotaHeaders(response, provider) {
  const limit = parseNonnegativeHeader(response, "x-ratelimit-limit");
  const remaining = parseNonnegativeHeader(response, "x-ratelimit-remaining");
  const reset = parseNonnegativeHeader(response, "x-ratelimit-reset");
  return {
    limit,
    remaining,
    reset,
    resetMeaning: provider === "pexels" ? "unix-seconds" : "seconds-until-reset",
    resetsAt: provider === "pexels" && reset !== null ? isoTime(reset * 1000) : null,
  };
}

function httpsUrl(value, label, allowedHosts) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${label} must be a valid URL.`);
  }
  if (
    parsed.protocol !== HTTPS
    || parsed.username
    || parsed.password
    || !allowedHosts.some((allowed) => parsed.hostname === allowed || parsed.hostname.endsWith(`.${allowed}`))
  ) {
    throw new TypeError(`${label} must be an approved HTTPS provider URL.`);
  }
  return parsed.toString();
}

function nullableHttpsUrl(value, label, allowedHosts) {
  return typeof value === "string" && value.length > 0
    ? httpsUrl(value, label, allowedHosts)
    : null;
}

function finiteOrNull(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function stringId(value, label) {
  const id = String(value ?? "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) {
    throw new TypeError(`${label} is not a safe provider identifier.`);
  }
  return id;
}

function searchResult({ provider, query, items, quota, cacheKey, fetchedAtMs, expiresAtMs, cacheHit }) {
  return {
    schemaVersion: 1,
    provider,
    query: cloneJson(query),
    items,
    quota,
    cache: {
      hit: cacheHit,
      key: cacheKey,
      fetchedAt: isoTime(fetchedAtMs),
      expiresAt: isoTime(expiresAtMs),
      ttlMs: expiresAtMs - fetchedAtMs,
    },
    license: cloneJson(
      provider === "pexels" ? PEXELS_LICENSE_METADATA : PIXABAY_LICENSE_METADATA,
    ),
  };
}

function selectionPayload(item, rendition) {
  return {
    schemaVersion: 1,
    provider: item.provider,
    assetId: item.assetId,
    renditionId: rendition.id,
    downloadUrl: rendition.url,
    mediaType: rendition.mediaType,
    width: rendition.width,
    height: rendition.height,
    declaredBytes: rendition.bytes,
    sourcePageUrl: item.sourcePageUrl,
    creator: item.creator,
    license: item.license,
    searchQueryHash: item.searchQueryHash,
    retrievedAt: item.retrievedAt,
  };
}

function makeSelection(result, { assetId, renditionId } = {}) {
  if (assetId === undefined || renditionId === undefined) {
    throw knownProviderError(
      "Stock selection requires explicit assetId and renditionId values.",
      "STOCK_SELECTION_REQUIRED",
      { retryable: false },
    );
  }
  const item = result.items.find((candidate) => candidate.assetId === String(assetId));
  if (!item) {
    throw knownProviderError(
      "The explicitly selected stock asset is absent from this search result.",
      "STOCK_SELECTION_INVALID",
      { retryable: false },
    );
  }
  const rendition = item.renditions.find((candidate) => candidate.id === String(renditionId));
  if (!rendition) {
    throw knownProviderError(
      "The explicitly selected rendition is absent from this stock asset.",
      "STOCK_SELECTION_INVALID",
      { retryable: false },
    );
  }
  const payload = selectionPayload(item, rendition);
  return Object.freeze({ ...cloneJson(payload), selectionHash: stableSha256(payload) });
}

function exactIsoTime(value, label) {
  if (
    typeof value !== "string"
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw knownProviderError(`${label} must be an exact ISO timestamp.`, "STOCK_SELECTION_PROOF_INVALID", {
      retryable: false,
    });
  }
  return value;
}

function validateSelectionProof(rawProof, selection) {
  const proof = assertPlainObject(rawProof, "stockMedia.selection.selectionProof");
  assertExactKeys(proof, STOCK_SELECTION_PROOF_KEYS, "stockMedia.selection.selectionProof");
  const cacheExpiresAt = exactIsoTime(proof.cacheExpiresAt, "selection proof cacheExpiresAt");
  const selectedAt = exactIsoTime(proof.selectedAt, "selection proof selectedAt");
  if (
    proof.schemaVersion !== 1
    || proof.kind !== "stock-search-explicit-selection"
    || proof.provider !== selection.provider
    || !SHA256.test(proof.cacheKey || "")
    || !SHA256.test(proof.cacheEntryHash || "")
    || proof.selectionHash !== selection.selectionHash
    || proof.assetId !== selection.assetId
    || proof.renditionId !== selection.renditionId
    || proof.algorithm !== "HMAC-SHA256"
    || !/^[a-f0-9]{24}$/.test(proof.keyId || "")
    || !SHA256.test(proof.hmacSha256 || "")
    || Date.parse(selectedAt) > Date.parse(cacheExpiresAt)
  ) {
    throw knownProviderError(
      "Stock selection proof is not structurally bound to the exact asset and rendition.",
      "STOCK_SELECTION_PROOF_INVALID",
      { retryable: false },
    );
  }
  return cloneJson(proof);
}

function validateSelection(rawSelection) {
  const selection = assertPlainObject(rawSelection, "stockMedia.selection");
  assertExactKeys(selection, STOCK_SELECTION_KEYS, "stockMedia.selection");
  const provider = selection.provider;
  if (provider !== "pexels" && provider !== "pixabay") {
    throw knownProviderError(
      "stockMedia.selection.provider must be pexels or pixabay.",
      "STOCK_SELECTION_INVALID",
      { retryable: false },
    );
  }
  const allowedDownloadHosts = provider === "pexels"
    ? ["pexels.com", "vimeo.com"]
    : ["pixabay.com"];
  const allowedPageHosts = provider === "pexels" ? ["pexels.com"] : ["pixabay.com"];
  const normalized = {
    schemaVersion: 1,
    provider,
    assetId: stringId(selection.assetId, "selection assetId"),
    renditionId: stringId(selection.renditionId, "selection renditionId"),
    downloadUrl: httpsUrl(selection.downloadUrl, "selection downloadUrl", allowedDownloadHosts),
    mediaType: typeof selection.mediaType === "string" && selection.mediaType.length <= 128
      ? selection.mediaType
      : null,
    width: finiteOrNull(selection.width),
    height: finiteOrNull(selection.height),
    declaredBytes: finiteOrNull(selection.declaredBytes),
    sourcePageUrl: httpsUrl(selection.sourcePageUrl, "selection sourcePageUrl", allowedPageHosts),
    creator: cloneJson(selection.creator ?? null),
    license: cloneJson(selection.license),
    searchQueryHash: selection.searchQueryHash,
    retrievedAt: selection.retrievedAt,
  };
  if (!/^[a-f0-9]{64}$/.test(normalized.searchQueryHash || "")) {
    throw knownProviderError(
      "Stock selection is missing its exact search-query hash.",
      "STOCK_SELECTION_INVALID",
      { retryable: false },
    );
  }
  const expectedLicense = provider === "pexels"
    ? PEXELS_LICENSE_METADATA
    : PIXABAY_LICENSE_METADATA;
  if (stableSha256(normalized.license) !== stableSha256(expectedLicense)) {
    throw knownProviderError(
      "Stock selection license metadata does not match the provider contract.",
      "STOCK_SELECTION_INVALID",
      { retryable: false },
    );
  }
  if (
    typeof normalized.retrievedAt !== "string"
    || Number.isNaN(Date.parse(normalized.retrievedAt))
    || new Date(normalized.retrievedAt).toISOString() !== normalized.retrievedAt
  ) {
    throw knownProviderError(
      "Stock selection is missing its exact API retrieval time.",
      "STOCK_SELECTION_INVALID",
      { retryable: false },
    );
  }
  const expectedHash = stableSha256(normalized);
  if (selection.selectionHash !== expectedHash) {
    throw knownProviderError(
      "Stock selection hash does not match its exact asset and rendition metadata.",
      "STOCK_SELECTION_INVALID",
      { retryable: false },
    );
  }
  const selectionProof = validateSelectionProof(selection.selectionProof, {
    ...normalized,
    selectionHash: expectedHash,
  });
  return { ...normalized, selectionHash: expectedHash, selectionProof };
}

export function buildStockDownloadIntent(rawSelection) {
  const selection = validateSelection(rawSelection);
  const requestFingerprint = stableSha256({
    provider: selection.provider,
    operation: "download_explicit_stock_selection",
    method: "GET",
    selectionHash: selection.selectionHash,
    assetId: selection.assetId,
    renditionId: selection.renditionId,
    downloadUrl: selection.downloadUrl,
  });
  const actionHash = stableSha256({
    approvalSchemaVersion: 1,
    action: "licensed_asset_acquisition",
    provider: selection.provider,
    requestFingerprint,
  });
  return Object.freeze({ requestFingerprint, actionHash, selection: cloneJson(selection) });
}

export function createStockDownloadApprovalGrants(rawSelection) {
  const { actionHash } = buildStockDownloadIntent(rawSelection);
  return STOCK_MEDIA_APPROVALS.map((id) => createExactApprovalGrant(id, actionHash));
}

function commonClientOptions({ fetchImpl, resolveCredential, cache, clock, cacheTtlMs, timeoutMs }) {
  const providerFetch = requireInjectedFetch(fetchImpl);
  const credentialResolver = requireCredentialResolver(resolveCredential);
  const queryCache = normalizeCache(cache);
  const now = asClock(clock ?? (() => Date.now()));
  if (!Number.isInteger(cacheTtlMs) || cacheTtlMs < 1) {
    throw new TypeError("cacheTtlMs must be a positive integer.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10 * 60_000) {
    throw new TypeError("timeoutMs must be an integer from 1 through 600000.");
  }
  return { providerFetch, credentialResolver, queryCache, now, cacheTtlMs, timeoutMs };
}

export function createPexelsVideoClient({
  fetchImpl,
  resolveCredential,
  cache,
  clock = () => Date.now(),
  cacheTtlMs = STOCK_QUERY_CACHE_TTL_MS,
  timeoutMs = 30_000,
} = {}) {
  const options = commonClientOptions({
    fetchImpl,
    resolveCredential,
    cache,
    clock,
    cacheTtlMs,
    timeoutMs,
  });
  async function searchVideos(rawQuery) {
    const queryInput = assertPlainObject(rawQuery, "Pexels video query");
    const query = {
      query: assertText(queryInput.query, "Pexels query", 256),
      page: integer(queryInput.page, "Pexels page", 1, 10_000, 1),
      perPage: integer(queryInput.perPage, "Pexels perPage", 1, 80, 15),
      orientation: optionalEnum(
        queryInput.orientation,
        "Pexels orientation",
        new Set(["landscape", "portrait", "square"]),
      ),
      size: optionalEnum(queryInput.size, "Pexels size", new Set(["large", "medium", "small"])),
      locale: optionalShortText(queryInput.locale, "Pexels locale", 16),
    };
    const cacheKey = stableSha256({ provider: "pexels", resource: "video-search", query });
    const requestedAt = options.now();
    const cached = await readCache(options.queryCache, cacheKey, requestedAt);
    if (cached) {
      return searchResult({ ...cached.value, cacheKey, cacheHit: true });
    }
    const apiKey = await getInjectedCredential(options.credentialResolver, {
      provider: "pexels",
      names: ["PEXELS_API_KEY"],
      request: { operation: "video-search", query: cloneJson(query) },
    });
    const url = new URL("https://api.pexels.com/v1/videos/search");
    url.searchParams.set("query", query.query);
    url.searchParams.set("page", String(query.page));
    url.searchParams.set("per_page", String(query.perPage));
    if (query.orientation) url.searchParams.set("orientation", query.orientation);
    if (query.size) url.searchParams.set("size", query.size);
    if (query.locale) url.searchParams.set("locale", query.locale);
    let response;
    try {
      response = await options.providerFetch(url.toString(), {
        method: "GET",
        headers: { Authorization: apiKey, accept: "application/json" },
        signal: AbortSignal.timeout(options.timeoutMs),
        redirect: "error",
      });
    } catch (cause) {
      throw knownProviderError("Pexels video search was unavailable.", "STOCK_SEARCH_UNAVAILABLE", {
        retryable: true,
        cause,
      });
    }
    if (!response?.ok) {
      throw knownProviderError("Pexels rejected the video search.", "STOCK_SEARCH_REJECTED", {
        retryable: response?.status === 429 || response?.status >= 500,
      });
    }
    let payload;
    try {
      payload = await readBoundedJson(response, 32 * 1024 * 1024);
    } catch (cause) {
      throw knownProviderError("Pexels returned an invalid video search response.", "STOCK_SEARCH_INVALID", {
        retryable: false,
        cause,
      });
    }
    const fetchedAtMs = options.now();
    const expiresAtMs = fetchedAtMs + options.cacheTtlMs;
    const searchQueryHash = stableSha256(query);
    const items = (Array.isArray(payload?.videos) ? payload.videos : []).flatMap((video) => {
      try {
        const assetId = stringId(video.id, "Pexels video ID");
        const sourcePageUrl = httpsUrl(video.url, "Pexels source page", ["pexels.com"]);
        const renditions = (Array.isArray(video.video_files) ? video.video_files : []).flatMap((file) => {
          try {
            return [{
              id: stringId(file.id, "Pexels rendition ID"),
              quality: typeof file.quality === "string" ? file.quality.slice(0, 64) : null,
              mediaType: typeof file.file_type === "string" ? file.file_type.slice(0, 128) : "video/mp4",
              width: finiteOrNull(file.width),
              height: finiteOrNull(file.height),
              bytes: null,
              url: httpsUrl(file.link, "Pexels rendition URL", ["pexels.com", "vimeo.com"]),
            }];
          } catch {
            return [];
          }
        });
        if (renditions.length < 1) return [];
        return [{
          provider: "pexels",
          assetId,
          sourcePageUrl,
          durationSeconds: finiteOrNull(video.duration),
          previewImageUrl: nullableHttpsUrl(video.image, "Pexels preview image", ["pexels.com"]),
          creator: video.user ? {
            id: stringId(video.user.id, "Pexels creator ID"),
            name: typeof video.user.name === "string" ? video.user.name.slice(0, 256) : null,
            url: nullableHttpsUrl(video.user.url, "Pexels creator URL", ["pexels.com"]),
          } : null,
          renditions,
          license: cloneJson(PEXELS_LICENSE_METADATA),
          searchQueryHash,
          retrievedAt: isoTime(fetchedAtMs),
        }];
      } catch {
        return [];
      }
    });
    const value = {
      provider: "pexels",
      query,
      items,
      quota: quotaHeaders(response, "pexels"),
      fetchedAtMs,
      expiresAtMs,
    };
    await writeCache(options.queryCache, cacheKey, { expiresAtMs, value });
    return searchResult({ ...value, cacheKey, cacheHit: false });
  }

  return Object.freeze({
    provider: "pexels",
    searchVideos,
    createSelection(result, choice) {
      if (result?.provider !== "pexels") throw new TypeError("Pexels selection needs a Pexels search result.");
      return makeSelection(result, choice);
    },
  });
}

export function createPixabayVideoClient({
  fetchImpl,
  resolveCredential,
  cache,
  clock = () => Date.now(),
  cacheTtlMs = STOCK_QUERY_CACHE_TTL_MS,
  timeoutMs = 30_000,
} = {}) {
  const options = commonClientOptions({
    fetchImpl,
    resolveCredential,
    cache,
    clock,
    cacheTtlMs,
    timeoutMs,
  });
  if (cacheTtlMs < STOCK_QUERY_CACHE_TTL_MS) {
    throw new TypeError("Pixabay query cache TTL must be at least 24 hours.");
  }

  async function searchVideos(rawQuery) {
    const queryInput = assertPlainObject(rawQuery, "Pixabay video query");
    const query = {
      query: assertText(queryInput.query, "Pixabay query", 100),
      page: integer(queryInput.page, "Pixabay page", 1, 10_000, 1),
      perPage: integer(queryInput.perPage, "Pixabay perPage", 3, 200, 20),
      videoType: optionalEnum(
        queryInput.videoType,
        "Pixabay videoType",
        new Set(["all", "film", "animation"]),
      ) ?? "all",
      category: optionalShortText(queryInput.category, "Pixabay category", 64),
      safesearch: queryInput.safesearch === undefined ? true : queryInput.safesearch,
    };
    if (typeof query.safesearch !== "boolean") {
      throw knownProviderError("Pixabay safesearch must be boolean.", "STOCK_QUERY_INVALID", {
        retryable: false,
      });
    }
    const cacheKey = stableSha256({ provider: "pixabay", resource: "video-search", query });
    const requestedAt = options.now();
    const cached = await readCache(options.queryCache, cacheKey, requestedAt);
    if (cached) {
      return searchResult({ ...cached.value, cacheKey, cacheHit: true });
    }
    const apiKey = await getInjectedCredential(options.credentialResolver, {
      provider: "pixabay",
      names: ["PIXABAY_API_KEY"],
      request: { operation: "video-search", query: cloneJson(query) },
    });
    const url = new URL("https://pixabay.com/api/videos/");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("q", query.query);
    url.searchParams.set("page", String(query.page));
    url.searchParams.set("per_page", String(query.perPage));
    url.searchParams.set("video_type", query.videoType);
    if (query.category) url.searchParams.set("category", query.category);
    url.searchParams.set("safesearch", String(query.safesearch));
    let response;
    try {
      response = await options.providerFetch(url.toString(), {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(options.timeoutMs),
        redirect: "error",
      });
    } catch (cause) {
      throw knownProviderError("Pixabay video search was unavailable.", "STOCK_SEARCH_UNAVAILABLE", {
        retryable: true,
        cause,
      });
    }
    if (!response?.ok) {
      throw knownProviderError("Pixabay rejected the video search.", "STOCK_SEARCH_REJECTED", {
        retryable: response?.status === 429 || response?.status >= 500,
      });
    }
    let payload;
    try {
      payload = await readBoundedJson(response, 32 * 1024 * 1024);
    } catch (cause) {
      throw knownProviderError("Pixabay returned an invalid video search response.", "STOCK_SEARCH_INVALID", {
        retryable: false,
        cause,
      });
    }
    const fetchedAtMs = options.now();
    const expiresAtMs = fetchedAtMs + options.cacheTtlMs;
    const searchQueryHash = stableSha256(query);
    const items = (Array.isArray(payload?.hits) ? payload.hits : []).flatMap((video) => {
      try {
        const assetId = stringId(video.id, "Pixabay video ID");
        const sourcePageUrl = httpsUrl(video.pageURL, "Pixabay source page", ["pixabay.com"]);
        const renditionEntries = video.videos && typeof video.videos === "object"
          ? Object.entries(video.videos)
          : [];
        const renditions = renditionEntries.flatMap(([id, file]) => {
          try {
            return [{
              id: stringId(id, "Pixabay rendition ID"),
              quality: id,
              mediaType: "video/mp4",
              width: finiteOrNull(file.width),
              height: finiteOrNull(file.height),
              bytes: finiteOrNull(file.size),
              url: httpsUrl(file.url, "Pixabay rendition URL", ["pixabay.com"]),
              thumbnailUrl: nullableHttpsUrl(file.thumbnail, "Pixabay rendition thumbnail", ["pixabay.com"]),
            }];
          } catch {
            return [];
          }
        });
        if (renditions.length < 1) return [];
        return [{
          provider: "pixabay",
          assetId,
          sourcePageUrl,
          durationSeconds: finiteOrNull(video.duration),
          previewImageUrl: renditions.find((entry) => entry.thumbnailUrl)?.thumbnailUrl || null,
          creator: {
            id: video.user_id === undefined ? null : stringId(video.user_id, "Pixabay creator ID"),
            name: typeof video.user === "string" ? video.user.slice(0, 256) : null,
            url: null,
          },
          renditions,
          license: cloneJson(PIXABAY_LICENSE_METADATA),
          searchQueryHash,
          retrievedAt: isoTime(fetchedAtMs),
        }];
      } catch {
        return [];
      }
    });
    const value = {
      provider: "pixabay",
      query,
      items,
      quota: quotaHeaders(response, "pixabay"),
      fetchedAtMs,
      expiresAtMs,
    };
    await writeCache(options.queryCache, cacheKey, { expiresAtMs, value });
    return searchResult({ ...value, cacheKey, cacheHit: false });
  }

  return Object.freeze({
    provider: "pixabay",
    searchVideos,
    createSelection(result, choice) {
      if (result?.provider !== "pixabay") throw new TypeError("Pixabay selection needs a Pixabay search result.");
      return makeSelection(result, choice);
    },
  });
}

function downloadExtension(selection, response) {
  const contentType = readHeader(response, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType === "video/webm") return { extension: "webm", mediaType: contentType };
  if (contentType === "video/quicktime") return { extension: "mov", mediaType: contentType };
  if (contentType?.startsWith("video/")) return { extension: "mp4", mediaType: contentType };
  const pathname = new URL(selection.downloadUrl).pathname.toLowerCase();
  if (pathname.endsWith(".webm")) return { extension: "webm", mediaType: "video/webm" };
  if (pathname.endsWith(".mov")) return { extension: "mov", mediaType: "video/quicktime" };
  return { extension: "mp4", mediaType: selection.mediaType || "video/mp4" };
}

export function createStockMediaAdapter({
  fetchImpl,
  resolveRunDirectory,
  verifyStockSelection,
  timeoutMs = 60_000,
  maximumVideoBytes = 1024 * 1024 * 1024,
} = {}) {
  const providerFetch = requireInjectedFetch(fetchImpl);
  const runDirectoryResolver = requireRunDirectoryResolver(resolveRunDirectory);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10 * 60_000) {
    throw new TypeError("timeoutMs must be an integer from 1 through 600000.");
  }
  if (!Number.isInteger(maximumVideoBytes) || maximumVideoBytes < 1024) {
    throw new TypeError("maximumVideoBytes must be an integer of at least 1024.");
  }
  const observations = new Map();

  async function preflightIntent(request) {
    const rawSelection = request.job.payload.stockMedia?.selection;
    let intent;
    try {
      intent = buildStockDownloadIntent(rawSelection);
    } catch (error) {
      if (error?.definitelyNotSubmitted === true) throw error;
      throw knownProviderError(
        "Stock selection validation failed before download.",
        "STOCK_SELECTION_INVALID",
        { retryable: false, cause: error },
      );
    }
    if (typeof verifyStockSelection !== "function") {
      throw knownProviderError(
        "The trusted stock-selection verifier is unavailable; download is fail-closed.",
        "STOCK_SELECTION_VERIFIER_UNAVAILABLE",
        { retryable: false },
      );
    }
    try {
      const verified = await verifyStockSelection(cloneJson(rawSelection));
      if (verified !== true) throw new TypeError("stock selection verifier did not return true");
    } catch (cause) {
      throw knownProviderError(
        "Stock selection proof failed trusted cache verification before download.",
        "STOCK_SELECTION_PROOF_INVALID",
        { retryable: false, cause },
      );
    }
    return intent;
  }

  async function submit(request) {
    assertExecutionRequest(request);
    assertAdapterRequestId(request, STOCK_MEDIA_ADAPTER_ID);
    assertSupportedOutputRoles(request, SUPPORTED_OUTPUT_ROLES);
    const intent = await preflightIntent(request);
    requireExactApprovalGrants(request, STOCK_MEDIA_APPROVALS, intent.actionHash);
    const prior = observations.get(request.submissionKey);
    if (prior) return cloneJson(prior);
    if (request.externalId) {
      return { status: "unknown", externalId: request.externalId, reasonCode: "STOCK_RECEIPT_UNAVAILABLE" };
    }

    let response;
    try {
      response = await providerFetch(intent.selection.downloadUrl, {
        method: "GET",
        headers: { accept: "video/*,application/octet-stream;q=0.8" },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
    } catch (cause) {
      throw knownProviderError("The explicitly selected stock rendition was unavailable.", "STOCK_DOWNLOAD_UNAVAILABLE", {
        retryable: true,
        cause,
      });
    }
    if (!response?.ok) {
      const failed = {
        status: "failed",
        retryable: response?.status === 408 || response?.status === 429 || response?.status >= 500,
        reasonCode: "STOCK_DOWNLOAD_REJECTED",
      };
      observations.set(request.submissionKey, failed);
      return failed;
    }
    if (typeof response.url === "string" && response.url.length > 0) {
      try {
        const hosts = intent.selection.provider === "pexels"
          ? ["pexels.com", "vimeo.com"]
          : ["pixabay.com"];
        httpsUrl(response.url, "stock response URL", hosts);
      } catch {
        const failed = { status: "failed", retryable: false, reasonCode: "STOCK_DOWNLOAD_ORIGIN_REJECTED" };
        observations.set(request.submissionKey, failed);
        return failed;
      }
    }
    let videoBytes;
    try {
      videoBytes = await readBoundedBytes(response, maximumVideoBytes);
    } catch (cause) {
      throw knownProviderError("The stock rendition response was invalid.", "STOCK_DOWNLOAD_INVALID", {
        retryable: false,
        cause,
      });
    }

    const format = downloadExtension(intent.selection, response);
    const base = [
      "providers",
      "stock",
      intent.selection.provider,
      request.job.id,
      intent.selection.selectionHash.slice(0, 24),
    ];
    try {
      const mediaOutput = await writeRunArtifact({
        resolveRunDirectory: runDirectoryResolver,
        request,
        relativePath: safeArtifactPath(
          ...base,
          `asset-${intent.selection.assetId}-${intent.selection.renditionId}.${format.extension}`,
        ),
        contents: videoBytes,
        role: "source_media",
        mediaType: format.mediaType,
      });
      const assetManifest = {
        schemaVersion: 1,
        provider: intent.selection.provider,
        assetId: intent.selection.assetId,
        renditionId: intent.selection.renditionId,
        selectionHash: intent.selection.selectionHash,
        requestFingerprint: intent.requestFingerprint,
        actionHash: intent.actionHash,
        sourcePageUrl: intent.selection.sourcePageUrl,
        retrievedAt: intent.selection.retrievedAt,
        creator: intent.selection.creator,
        selectedRendition: {
          width: intent.selection.width,
          height: intent.selection.height,
          declaredBytes: intent.selection.declaredBytes,
        },
        media: {
          relativePath: mediaOutput.relativePath,
          sha256: mediaOutput.sha256,
          bytes: mediaOutput.bytes,
          mediaType: mediaOutput.mediaType,
        },
      };
      const manifestOutput = await writeRunArtifact({
        resolveRunDirectory: runDirectoryResolver,
        request,
        relativePath: safeArtifactPath(...base, "asset-manifest.json"),
        contents: jsonArtifactBytes(assetManifest),
        role: "asset_manifest",
        mediaType: "application/json",
      });
      const ledger = {
        schemaVersion: 1,
        provider: intent.selection.provider,
        assetId: intent.selection.assetId,
        renditionId: intent.selection.renditionId,
        selectionHash: intent.selection.selectionHash,
        actionHash: intent.actionHash,
        searchQueryHash: intent.selection.searchQueryHash,
        sourcePageUrl: intent.selection.sourcePageUrl,
        retrievedAt: intent.selection.retrievedAt,
        creator: intent.selection.creator,
        license: intent.selection.license,
        attribution: {
          requiredByContentLicense: intent.selection.license.attributionRequiredByContentLicense,
          apiDisplayLinkRequired: intent.selection.license.apiDisplayLinkRequired,
        },
        acquiredMediaSha256: mediaOutput.sha256,
      };
      const ledgerOutput = await writeRunArtifact({
        resolveRunDirectory: runDirectoryResolver,
        request,
        relativePath: safeArtifactPath(...base, "license-attribution-ledger.json"),
        contents: jsonArtifactBytes(ledger),
        role: "license_attribution_ledger",
        mediaType: "application/json",
      });
      const succeeded = {
        status: "succeeded",
        externalId: `${intent.selection.provider}:${intent.selection.assetId}:${intent.selection.renditionId}`,
        outputs: [manifestOutput, ledgerOutput, mediaOutput],
      };
      observations.set(request.submissionKey, cloneJson(succeeded));
      return succeeded;
    } catch (cause) {
      throw knownProviderError("Stock artifacts could not be committed safely.", "STOCK_ARTIFACT_COMMIT_FAILED", {
        retryable: true,
        cause,
      });
    }
  }

  return Object.freeze({
    id: STOCK_MEDIA_ADAPTER_ID,
    kind: "licensed-stock-download",
    submit,
    async reconcile(request) {
      assertExecutionRequest(request);
      assertAdapterRequestId(request, STOCK_MEDIA_ADAPTER_ID);
      return cloneJson(observations.get(request.submissionKey) || {
        status: "unknown",
        externalId: request.externalId || null,
        reasonCode: "STOCK_RECEIPT_UNAVAILABLE",
      });
    },
  });
}
