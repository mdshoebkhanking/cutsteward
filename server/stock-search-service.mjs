import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import {
  canonicalJson,
  createPexelsVideoClient,
  createPixabayVideoClient,
  stableSha256,
  STOCK_QUERY_CACHE_TTL_MS,
} from "./providers/index.mjs";
import { knownProviderError } from "./providers/common.mjs";

const CACHE_SCHEMA_VERSION = 1;
const SELECTION_PROOF_SCHEMA_VERSION = 1;
const CACHE_FILE_NAME = "stock-search-cache.json";
const KEY_FILE_NAME = "stock-search-cache.key";
const DEFAULT_MAXIMUM_ENTRIES = 100;
const DEFAULT_MAXIMUM_CACHE_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAXIMUM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAXIMUM_KEY_BYTES = 128;
const SHA256 = /^[a-f0-9]{64}$/;
const PROVIDERS = new Set(["pexels", "pixabay"]);
const SENSITIVE_FIELD = /(?:^|[_-])(?:api[_-]?key|authorization|bearer|cookie|credential|password|secret|token)(?:$|[_-])/i;

function stockError(message, code, options = {}) {
  return knownProviderError(message, code, { retryable: false, ...options });
}

function copyJson(value, label = "value") {
  try {
    return JSON.parse(canonicalJson(value));
  } catch (cause) {
    throw stockError(`${label} must contain only bounded JSON values.`, "STOCK_CACHE_VALUE_INVALID", {
      cause,
    });
  }
}

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw stockError(`${label} must be an object.`, "STOCK_CACHE_VALUE_INVALID");
  }
  return value;
}

function exactKeys(value, expected, label, code = "STOCK_CACHE_INTEGRITY_INVALID") {
  const observed = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (observed.length !== wanted.length || observed.some((key, index) => key !== wanted[index])) {
    throw stockError(`${label} has an invalid schema.`, code);
  }
}

function positiveInteger(value, label, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

function normalizeClock(clock) {
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

function assertCacheKey(cacheKey) {
  if (typeof cacheKey !== "string" || !SHA256.test(cacheKey)) {
    throw stockError("cacheKey must be an exact SHA-256 returned by stock search.", "STOCK_CACHE_KEY_INVALID");
  }
  return cacheKey;
}

function assertProvider(provider) {
  if (!PROVIDERS.has(provider)) {
    throw stockError("provider must be pexels or pixabay.", "STOCK_PROVIDER_UNSUPPORTED");
  }
  return provider;
}

function assertSecretFreeUrls(value, location = "stock result") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSecretFreeUrls(entry, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_FIELD.test(key)) {
        throw stockError(
          `${location} contains a credential-like field and cannot cross the stock-search boundary.`,
          "STOCK_RESULT_SECRET_REJECTED",
        );
      }
      assertSecretFreeUrls(child, `${location}.${key}`);
    }
    return;
  }
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw stockError(`${location} contains an invalid URL.`, "STOCK_RESULT_URL_REJECTED");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    throw stockError(
      `${location} contains a URL credential, query, fragment, or non-HTTPS URL.`,
      "STOCK_RESULT_URL_REJECTED",
    );
  }
}

function containedBy(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function secureDirectory(storageDirectory) {
  if (typeof storageDirectory !== "string" || !path.isAbsolute(storageDirectory)) {
    throw new TypeError("storageDirectory must be an absolute private directory.");
  }
  const normalized = path.resolve(storageDirectory);
  if (normalized === path.parse(normalized).root) {
    throw new TypeError("storageDirectory cannot be a filesystem root.");
  }
  await mkdir(normalized, { recursive: true, mode: 0o700 });
  const observed = await lstat(normalized);
  if (observed.isSymbolicLink() || !observed.isDirectory()) {
    throw stockError("Stock cache storage must be a real directory, not a symlink.", "STOCK_CACHE_STORAGE_INVALID");
  }
  if (process.platform !== "win32") await chmod(normalized, 0o700);
  const resolved = await realpath(normalized);
  if (!path.isAbsolute(resolved)) {
    throw stockError("Stock cache storage did not resolve to an absolute directory.", "STOCK_CACHE_STORAGE_INVALID");
  }
  return resolved;
}

async function assertRootSafe(storageRoot) {
  const observed = await lstat(storageRoot);
  if (observed.isSymbolicLink() || !observed.isDirectory() || await realpath(storageRoot) !== storageRoot) {
    throw stockError("Stock cache storage changed or became unsafe.", "STOCK_CACHE_STORAGE_INVALID");
  }
}

async function readSecureFile(filePath, maximumBytes, { missing = false } = {}) {
  let before;
  try {
    before = await lstat(filePath);
  } catch (error) {
    if (missing && error?.code === "ENOENT") return null;
    throw error;
  }
  if (before.isSymbolicLink() || !before.isFile() || before.size < 1 || before.size > maximumBytes) {
    throw stockError("A stock cache file is not a bounded regular file.", "STOCK_CACHE_STORAGE_INVALID");
  }
  const noFollow = process.platform === "win32" ? 0 : (constants.O_NOFOLLOW || 0);
  let handle;
  try {
    handle = await open(filePath, constants.O_RDONLY | noFollow);
    const after = await handle.stat();
    if (
      !after.isFile()
      || after.size < 1
      || after.size > maximumBytes
      || (process.platform !== "win32" && (before.dev !== after.dev || before.ino !== after.ino))
    ) {
      throw stockError("A stock cache file changed while it was opened.", "STOCK_CACHE_STORAGE_INVALID");
    }
    return await handle.readFile();
  } finally {
    await handle?.close();
  }
}

async function writeExclusive(filePath, contents) {
  let handle;
  try {
    handle = await open(filePath, "wx", 0o600);
    await handle.writeFile(contents);
    await handle.sync();
    if (process.platform !== "win32") await handle.chmod(0o600);
  } finally {
    await handle?.close();
  }
}

async function atomicReplace(storageRoot, filePath, contents) {
  await assertRootSafe(storageRoot);
  if (!containedBy(storageRoot, filePath)) {
    throw stockError("Stock cache path escaped private storage.", "STOCK_CACHE_STORAGE_INVALID");
  }
  try {
    const observed = await lstat(filePath);
    if (observed.isSymbolicLink() || !observed.isFile()) {
      throw stockError("Stock cache destination is not a regular file.", "STOCK_CACHE_STORAGE_INVALID");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporaryPath = path.join(storageRoot, `.${CACHE_FILE_NAME}.${process.pid}.${randomUUID()}.tmp`);
  if (!containedBy(storageRoot, temporaryPath)) {
    throw stockError("Stock cache temporary path escaped private storage.", "STOCK_CACHE_STORAGE_INVALID");
  }
  try {
    await writeExclusive(temporaryPath, contents);
    await rename(temporaryPath, filePath);
    if (process.platform !== "win32") await chmod(filePath, 0o600);
  } finally {
    try {
      await unlink(temporaryPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function loadOrCreateMasterKey(storageRoot) {
  const keyPath = path.join(storageRoot, KEY_FILE_NAME);
  if (!containedBy(storageRoot, keyPath)) {
    throw stockError("Stock cache key path escaped private storage.", "STOCK_CACHE_STORAGE_INVALID");
  }
  await assertRootSafe(storageRoot);
  const fresh = randomBytes(32);
  try {
    await writeExclusive(keyPath, fresh);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const key = await readSecureFile(keyPath, MAXIMUM_KEY_BYTES);
  if (key.byteLength !== 32) {
    throw stockError("The persisted stock cache key is invalid.", "STOCK_CACHE_KEY_INVALID");
  }
  if (process.platform !== "win32") await chmod(keyPath, 0o600);
  return key;
}

function derivedKey(masterKey, purpose) {
  return createHmac("sha256", masterKey).update(`framepilot-stock-search:${purpose}:v1`).digest();
}

function secureMatch(candidate, expected) {
  const left = Buffer.from(typeof candidate === "string" ? candidate : "", "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function hmacHex(key, value) {
  return createHmac("sha256", key).update(canonicalJson(value)).digest("hex");
}

function emptyDocument(keyId) {
  return { schemaVersion: CACHE_SCHEMA_VERSION, keyId, revision: 0, entries: [] };
}

function signedDocument(signingKey, document) {
  return { ...document, hmacSha256: hmacHex(signingKey, document) };
}

function documentBytes(signingKey, document) {
  return Buffer.from(`${JSON.stringify(signedDocument(signingKey, document), null, 2)}\n`, "utf8");
}

function aadFor(entry) {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    cacheKey: entry.cacheKey,
    provider: entry.provider,
    expiresAtMs: entry.expiresAtMs,
    writtenAtMs: entry.writtenAtMs,
  };
}

function encryptEntry(encryptionKey, metadata, payload) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
  cipher.setAAD(Buffer.from(canonicalJson(aadFor(metadata)), "utf8"));
  const plaintext = Buffer.from(canonicalJson(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ...metadata,
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptEntry(encryptionKey, encrypted) {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey,
      Buffer.from(encrypted.nonce, "base64"),
    );
    decipher.setAAD(Buffer.from(canonicalJson(aadFor(encrypted)), "utf8"));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch (cause) {
    throw stockError("A stock cache entry failed authenticated decryption.", "STOCK_CACHE_INTEGRITY_INVALID", {
      cause,
    });
  }
}

function validateEncryptedEntry(entry) {
  plainObject(entry, "stock cache entry");
  exactKeys(
    entry,
    new Set(["cacheKey", "provider", "expiresAtMs", "writtenAtMs", "nonce", "authTag", "ciphertext"]),
    "stock cache entry",
  );
  assertCacheKey(entry.cacheKey);
  assertProvider(entry.provider);
  if (!Number.isSafeInteger(entry.expiresAtMs) || !Number.isSafeInteger(entry.writtenAtMs)) {
    throw stockError("Stock cache timestamps are invalid.", "STOCK_CACHE_INTEGRITY_INVALID");
  }
  for (const [field, expectedBytes] of [["nonce", 12], ["authTag", 16]]) {
    if (typeof entry[field] !== "string" || Buffer.from(entry[field], "base64").byteLength !== expectedBytes) {
      throw stockError(`Stock cache ${field} is invalid.`, "STOCK_CACHE_INTEGRITY_INVALID");
    }
  }
  if (typeof entry.ciphertext !== "string" || entry.ciphertext.length < 1) {
    throw stockError("Stock cache ciphertext is invalid.", "STOCK_CACHE_INTEGRITY_INVALID");
  }
}

function validatePayload(cacheKey, encrypted, payload, maximumTtlMs) {
  plainObject(payload, "stock cache payload");
  exactKeys(payload, new Set(["expiresAtMs", "value"]), "stock cache payload");
  const value = plainObject(payload.value, "stock cache payload value");
  if (payload.expiresAtMs !== encrypted.expiresAtMs || value.expiresAtMs !== encrypted.expiresAtMs) {
    throw stockError("Stock cache expiry binding is invalid.", "STOCK_CACHE_INTEGRITY_INVALID");
  }
  if (value.provider !== encrypted.provider || !PROVIDERS.has(value.provider)) {
    throw stockError("Stock cache provider binding is invalid.", "STOCK_CACHE_INTEGRITY_INVALID");
  }
  if (!Number.isSafeInteger(value.fetchedAtMs) || value.fetchedAtMs > value.expiresAtMs) {
    throw stockError("Stock cache retrieval time is invalid.", "STOCK_CACHE_INTEGRITY_INVALID");
  }
  const ttlMs = value.expiresAtMs - value.fetchedAtMs;
  if (ttlMs < STOCK_QUERY_CACHE_TTL_MS || ttlMs > maximumTtlMs) {
    throw stockError("Stock cache TTL is outside its bounded policy.", "STOCK_CACHE_INTEGRITY_INVALID");
  }
  const expectedCacheKey = stableSha256({
    provider: value.provider,
    resource: "video-search",
    query: value.query,
  });
  if (cacheKey !== expectedCacheKey) {
    throw stockError("Stock cache key does not match the exact provider query.", "STOCK_CACHE_INTEGRITY_INVALID");
  }
  assertSecretFreeUrls(value);
  return copyJson(payload, "stock cache payload");
}

function entryProofHash(cacheKey, payload) {
  return stableSha256({
    schemaVersion: CACHE_SCHEMA_VERSION,
    cacheKey,
    expiresAtMs: payload.expiresAtMs,
    value: payload.value,
  });
}

/**
 * Creates the private async get/set cache consumed directly by the existing
 * Pexels and Pixabay clients. Values are encrypted and the full JSON document
 * is authenticated before any cached result is trusted.
 */
export async function createDurableStockSearchCache({
  storageDirectory,
  clock = () => Date.now(),
  maximumEntries = DEFAULT_MAXIMUM_ENTRIES,
  maximumCacheBytes = DEFAULT_MAXIMUM_CACHE_BYTES,
  maximumTtlMs = DEFAULT_MAXIMUM_TTL_MS,
} = {}) {
  const now = normalizeClock(clock);
  positiveInteger(maximumEntries, "maximumEntries", { maximum: 10_000 });
  positiveInteger(maximumCacheBytes, "maximumCacheBytes", { minimum: 1024, maximum: 256 * 1024 * 1024 });
  positiveInteger(maximumTtlMs, "maximumTtlMs", {
    minimum: STOCK_QUERY_CACHE_TTL_MS,
    maximum: 30 * 24 * 60 * 60 * 1000,
  });
  const storageRoot = await secureDirectory(storageDirectory);
  const cachePath = path.join(storageRoot, CACHE_FILE_NAME);
  if (!containedBy(storageRoot, cachePath)) {
    throw stockError("Stock cache path escaped private storage.", "STOCK_CACHE_STORAGE_INVALID");
  }
  const masterKey = await loadOrCreateMasterKey(storageRoot);
  const encryptionKey = derivedKey(masterKey, "encryption");
  const signingKey = derivedKey(masterKey, "document-signing");
  const selectionKey = derivedKey(masterKey, "selection-signing");
  const keyId = createHash("sha256").update(masterKey).digest("hex").slice(0, 24);
  let observedEntryCount = 0;
  let queue = Promise.resolve();

  async function readDocument() {
    await assertRootSafe(storageRoot);
    const bytes = await readSecureFile(cachePath, maximumCacheBytes, { missing: true });
    if (bytes === null) {
      observedEntryCount = 0;
      return emptyDocument(keyId);
    }
    let envelope;
    try {
      envelope = JSON.parse(bytes.toString("utf8"));
    } catch (cause) {
      throw stockError("Stock cache is not valid JSON.", "STOCK_CACHE_INTEGRITY_INVALID", { cause });
    }
    plainObject(envelope, "stock cache");
    exactKeys(
      envelope,
      new Set(["schemaVersion", "keyId", "revision", "entries", "hmacSha256"]),
      "stock cache",
    );
    const { hmacSha256, ...document } = envelope;
    if (
      document.schemaVersion !== CACHE_SCHEMA_VERSION
      || document.keyId !== keyId
      || !Number.isSafeInteger(document.revision)
      || document.revision < 0
      || !Array.isArray(document.entries)
      || document.entries.length > maximumEntries
      || !secureMatch(hmacSha256, hmacHex(signingKey, document))
    ) {
      throw stockError("Stock cache failed document integrity verification.", "STOCK_CACHE_INTEGRITY_INVALID");
    }
    const seen = new Set();
    for (const encrypted of document.entries) {
      validateEncryptedEntry(encrypted);
      if (seen.has(encrypted.cacheKey)) {
        throw stockError("Stock cache contains duplicate keys.", "STOCK_CACHE_INTEGRITY_INVALID");
      }
      seen.add(encrypted.cacheKey);
      const payload = decryptEntry(encryptionKey, encrypted);
      validatePayload(encrypted.cacheKey, encrypted, payload, maximumTtlMs);
    }
    observedEntryCount = document.entries.length;
    return document;
  }

  function serializedWithinLimit(document) {
    const bytes = documentBytes(signingKey, document);
    return bytes.byteLength <= maximumCacheBytes ? bytes : null;
  }

  async function inspect(cacheKey) {
    assertCacheKey(cacheKey);
    const document = await readDocument();
    const encrypted = document.entries.find((entry) => entry.cacheKey === cacheKey);
    if (!encrypted) return { state: "missing", cacheKey };
    const payload = validatePayload(
      cacheKey,
      encrypted,
      decryptEntry(encryptionKey, encrypted),
      maximumTtlMs,
    );
    return {
      state: payload.expiresAtMs <= now() ? "expired" : "valid",
      cacheKey,
      provider: encrypted.provider,
      expiresAtMs: payload.expiresAtMs,
      entryHash: entryProofHash(cacheKey, payload),
      entry: payload,
    };
  }

  async function set(cacheKey, rawEntry) {
    assertCacheKey(cacheKey);
    const entry = copyJson(rawEntry, "stock cache entry value");
    const value = plainObject(entry.value, "stock cache entry value.value");
    const currentTime = now();
    if (
      !Number.isSafeInteger(entry.expiresAtMs)
      || entry.expiresAtMs <= currentTime
      || entry.expiresAtMs - currentTime > maximumTtlMs
    ) {
      throw stockError("Stock cache entry expiry is outside its bounded policy.", "STOCK_CACHE_TTL_INVALID");
    }
    const provider = assertProvider(value.provider);
    const metadata = {
      cacheKey,
      provider,
      expiresAtMs: entry.expiresAtMs,
      writtenAtMs: currentTime,
    };
    validatePayload(cacheKey, metadata, entry, maximumTtlMs);
    const encrypted = encryptEntry(encryptionKey, metadata, entry);

    const operation = queue.then(async () => {
      const document = await readDocument();
      const candidates = document.entries
        .filter((candidate) => candidate.cacheKey !== cacheKey && candidate.expiresAtMs > currentTime)
        .concat(encrypted)
        .sort((left, right) => left.writtenAtMs - right.writtenAtMs || left.cacheKey.localeCompare(right.cacheKey));
      while (candidates.length > maximumEntries) candidates.shift();
      let next = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        keyId,
        revision: document.revision + 1,
        entries: candidates,
      };
      let bytes = serializedWithinLimit(next);
      while (!bytes && next.entries.length > 1) {
        next = { ...next, entries: next.entries.slice(1) };
        bytes = serializedWithinLimit(next);
      }
      if (!bytes) {
        throw stockError("The stock search result exceeds the private cache size limit.", "STOCK_CACHE_SIZE_LIMIT");
      }
      await atomicReplace(storageRoot, cachePath, bytes);
      observedEntryCount = next.entries.length;
    });
    queue = operation.catch(() => undefined);
    await operation;
  }

  async function get(cacheKey) {
    const result = await inspect(cacheKey);
    return result.state === "valid" ? copyJson(result.entry) : null;
  }

  async function readExact(cacheKey) {
    const result = await inspect(cacheKey);
    if (result.state === "missing") {
      throw stockError("The exact stock search result is not present in the private cache.", "STOCK_CACHE_MISS");
    }
    if (result.state === "expired") {
      throw stockError("The exact stock search result has expired and must be searched again.", "STOCK_CACHE_EXPIRED");
    }
    return {
      cacheKey: result.cacheKey,
      provider: result.provider,
      expiresAtMs: result.expiresAtMs,
      entryHash: result.entryHash,
      entry: copyJson(result.entry),
    };
  }

  function signSelection(binding) {
    return hmacHex(selectionKey, binding);
  }

  function verifySelectionSignature(binding, signature) {
    return secureMatch(signature, signSelection(binding));
  }

  // Validate an existing cache immediately so restart never silently accepts a
  // corrupt document and only discovers it after a user chooses an asset.
  await readDocument();

  return Object.freeze({
    get,
    set,
    readExact,
    signSelection,
    verifySelectionSignature,
    capabilities() {
      return {
        schemaVersion: CACHE_SCHEMA_VERSION,
        durable: true,
        encryptedAtRest: true,
        authenticated: true,
        atomicReplace: true,
        storageDirectory: storageRoot,
        cacheFile: cachePath,
        keyId,
        entryCount: observedEntryCount,
        maximumEntries,
        maximumCacheBytes,
        maximumTtlMs,
      };
    },
  });
}

function selectionBinding({ provider, cacheKey, entryHash, expiresAtMs, selection, selectedAtMs }) {
  return {
    schemaVersion: SELECTION_PROOF_SCHEMA_VERSION,
    kind: "stock-search-explicit-selection",
    provider,
    cacheKey,
    cacheEntryHash: entryHash,
    cacheExpiresAt: new Date(expiresAtMs).toISOString(),
    selectionHash: selection.selectionHash,
    assetId: selection.assetId,
    renditionId: selection.renditionId,
    selectedAt: new Date(selectedAtMs).toISOString(),
  };
}

/**
 * Search-only stock bridge. It performs provider search calls and creates an
 * explicit, cache-bound selection, but deliberately exposes no download API.
 */
export async function createStockSearchService({
  fetchImpl,
  resolveCredential,
  storageDirectory,
  clock = () => Date.now(),
  cacheTtlMs = STOCK_QUERY_CACHE_TTL_MS,
  maximumTtlMs = DEFAULT_MAXIMUM_TTL_MS,
  maximumEntries = DEFAULT_MAXIMUM_ENTRIES,
  maximumCacheBytes = DEFAULT_MAXIMUM_CACHE_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be injected; stock search never falls back to global fetch.");
  }
  if (typeof resolveCredential !== "function") {
    throw new TypeError("resolveCredential must be injected; stock search never reads environment credentials.");
  }
  positiveInteger(cacheTtlMs, "cacheTtlMs", {
    minimum: STOCK_QUERY_CACHE_TTL_MS,
    maximum: maximumTtlMs,
  });
  positiveInteger(timeoutMs, "timeoutMs", { maximum: 10 * 60_000 });
  const now = normalizeClock(clock);
  const credentialStatus = { pexels: "unverified", pixabay: "unverified" };
  const cache = await createDurableStockSearchCache({
    storageDirectory,
    clock: now,
    maximumEntries,
    maximumCacheBytes,
    maximumTtlMs,
  });

  async function observedCredentialResolver(request) {
    try {
      const resolved = await resolveCredential(request);
      const value = typeof resolved === "string" ? resolved : resolved?.value;
      credentialStatus[request.provider] = typeof value === "string" && value.length > 0
        ? "resolved-not-verified"
        : "unavailable";
      return resolved;
    } catch (error) {
      credentialStatus[request.provider] = "unavailable";
      throw error;
    }
  }

  const clients = Object.freeze({
    pexels: createPexelsVideoClient({
      fetchImpl,
      resolveCredential: observedCredentialResolver,
      cache,
      clock: now,
      cacheTtlMs,
      timeoutMs,
    }),
    pixabay: createPixabayVideoClient({
      fetchImpl,
      resolveCredential: observedCredentialResolver,
      cache,
      clock: now,
      cacheTtlMs,
      timeoutMs,
    }),
  });

  async function search({ provider, query } = {}) {
    const selectedProvider = assertProvider(provider);
    try {
      const result = await clients[selectedProvider].searchVideos(query);
      assertSecretFreeUrls(result);
      credentialStatus[selectedProvider] = result.cache.hit
        ? credentialStatus[selectedProvider]
        : "verified-by-search";
      return copyJson(result, "stock search result");
    } catch (error) {
      if (error?.code === "PROVIDER_CREDENTIAL_UNAVAILABLE") {
        credentialStatus[selectedProvider] = "unavailable";
      }
      throw error;
    }
  }

  async function select({ provider, cacheKey, assetId, renditionId } = {}) {
    const selectedProvider = assertProvider(provider);
    const exact = await cache.readExact(assertCacheKey(cacheKey));
    if (exact.provider !== selectedProvider || exact.entry.value.provider !== selectedProvider) {
      throw stockError("The provider does not match the exact cached stock search.", "STOCK_CACHE_PROVIDER_MISMATCH");
    }
    const selection = clients[selectedProvider].createSelection(exact.entry.value, {
      assetId,
      renditionId,
    });
    assertSecretFreeUrls(selection);
    const binding = selectionBinding({
      provider: selectedProvider,
      cacheKey,
      entryHash: exact.entryHash,
      expiresAtMs: exact.expiresAtMs,
      selection,
      selectedAtMs: now(),
    });
    return Object.freeze({
      ...copyJson(selection, "stock selection"),
      selectionProof: Object.freeze({
        ...binding,
        algorithm: "HMAC-SHA256",
        keyId: cache.capabilities().keyId,
        hmacSha256: cache.signSelection(binding),
      }),
    });
  }

  async function verifySelection(rawSelection) {
    const selection = plainObject(rawSelection, "stock selection");
    const proof = plainObject(selection.selectionProof, "stock selection proof");
    exactKeys(
      proof,
      new Set([
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
      ]),
      "stock selection proof",
      "STOCK_SELECTION_PROOF_INVALID",
    );
    const exact = await cache.readExact(assertCacheKey(proof.cacheKey));
    const expectedSelection = clients[assertProvider(proof.provider)].createSelection(exact.entry.value, {
      assetId: proof.assetId,
      renditionId: proof.renditionId,
    });
    const { algorithm, keyId: proofKeyId, hmacSha256, ...binding } = proof;
    if (
      algorithm !== "HMAC-SHA256"
      || proofKeyId !== cache.capabilities().keyId
      || exact.entryHash !== proof.cacheEntryHash
      || exact.provider !== proof.provider
      || stableSha256(expectedSelection) !== stableSha256(
        Object.fromEntries(Object.keys(expectedSelection).map((key) => [key, selection[key]])),
      )
      || !cache.verifySelectionSignature(binding, hmacSha256)
    ) {
      throw stockError("Stock selection proof failed exact cache verification.", "STOCK_SELECTION_PROOF_INVALID");
    }
    return true;
  }

  return Object.freeze({
    search,
    select,
    verifySelection,
    capabilities() {
      return {
        schemaVersion: 1,
        service: "stock-search",
        operations: {
          search: true,
          explicitSelection: true,
          verifySelection: true,
          download: false,
        },
        providers: {
          pexels: {
            supported: true,
            credentialName: "PEXELS_API_KEY",
            credentialStatus: credentialStatus.pexels,
          },
          pixabay: {
            supported: true,
            credentialName: "PIXABAY_API_KEY",
            credentialStatus: credentialStatus.pixabay,
            minimumCacheTtlMs: STOCK_QUERY_CACHE_TTL_MS,
          },
        },
        cacheTtlMs,
        cache: cache.capabilities(),
      };
    },
  });
}

export {
  CACHE_FILE_NAME as STOCK_SEARCH_CACHE_FILE_NAME,
  KEY_FILE_NAME as STOCK_SEARCH_CACHE_KEY_FILE_NAME,
};
