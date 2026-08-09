import { constants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { redactSensitiveText, sanitizeExternalUrl } from "./redaction.mjs";
import {
  buildElevenLabsTimedTtsIntent,
  buildGoogleVeoIntent,
  buildStockDownloadIntent,
  canonicalJson,
  createElevenLabsTimedTtsApprovalGrants,
  createGoogleVeoApprovalGrants,
  createStockDownloadApprovalGrants,
  ELEVENLABS_TIMED_TTS_ADAPTER_ID,
  ELEVENLABS_TIMED_TTS_APPROVALS,
  GOOGLE_VEO_ADAPTER_ID,
  GOOGLE_VEO_APPROVALS,
  stableSha256,
  STOCK_MEDIA_ADAPTER_ID,
  STOCK_MEDIA_APPROVALS,
} from "./providers/index.mjs";

export const PROVIDER_REQUESTS_SCHEMA_VERSION = 1;
export const PROVIDER_REQUESTS_RELATIVE_PATH = "planning/PROVIDER_REQUESTS.json";
export const EMPTY_PROVIDER_REQUESTS_DOCUMENT = Object.freeze({
  schemaVersion: PROVIDER_REQUESTS_SCHEMA_VERSION,
  requests: Object.freeze({}),
});
export const PROVIDER_REQUEST_NAMESPACES = Object.freeze({
  "voice-timing": Object.freeze({ adapterId: ELEVENLABS_TIMED_TTS_ADAPTER_ID, path: Object.freeze(["elevenLabs"]) }),
  "ai-video-pilot": Object.freeze({ adapterId: GOOGLE_VEO_ADAPTER_ID, path: Object.freeze(["googleVeo"]) }),
  "licensed-acquisition": Object.freeze({
    adapterId: STOCK_MEDIA_ADAPTER_ID,
    path: Object.freeze(["stockMedia", "selection"]),
  }),
});

const RECEIPT_SCHEMA_VERSION = 1;
const MAX_REQUEST_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_PRIVATE_RECORD_BYTES = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SENSITIVE_FIELD = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth(?:orization)?|bearer|secret|password|passwd|cookie|session[_-]?token|xi-api-key|x-api-key)/i;

function actionError(message, code, {
  statusCode = 400,
  definitelyNotSubmitted,
  retryable,
  fatal,
  cause,
  blocker = false,
} = {}) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.code = code;
  error.statusCode = statusCode;
  if (definitelyNotSubmitted !== undefined) error.definitelyNotSubmitted = definitelyNotSubmitted;
  if (retryable !== undefined) error.retryable = retryable;
  if (fatal !== undefined) error.fatal = fatal;
  if (blocker) error.providerActionBlocker = true;
  return error;
}

function copyJson(value, label = "value") {
  try {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  } catch (cause) {
    throw actionError(`${label} must be JSON-serializable.`, "PROVIDER_ACTION_INVALID", {
      statusCode: 500,
      definitelyNotSubmitted: true,
      cause,
    });
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw actionError(`${label} must be an object.`, "PROVIDER_REQUESTS_INVALID", {
      definitelyNotSubmitted: true,
      retryable: false,
      blocker: true,
    });
  }
  return value;
}

function assertExactKeys(value, allowed, label) {
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw actionError(
      `${label} contains unsupported fields: ${unexpected.sort().join(", ")}.`,
      "PROVIDER_REQUESTS_INVALID",
      { definitelyNotSubmitted: true, retryable: false, blocker: true },
    );
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw actionError(`${label} must be a stable identifier.`, "PROVIDER_ACTION_INVALID", {
      definitelyNotSubmitted: true,
    });
  }
  return value;
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw actionError(`${label} must be a lowercase SHA-256.`, "PROVIDER_ACTION_INVALID", {
      definitelyNotSubmitted: true,
    });
  }
  return value;
}

function nowIso(clock) {
  const raw = typeof clock === "function" ? clock() : clock.now();
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.valueOf())) {
    throw actionError("clock returned an invalid time.", "PROVIDER_ACTION_CONFIGURATION_INVALID", {
      statusCode: 500,
      definitelyNotSubmitted: true,
    });
  }
  return date.toISOString();
}

function isContained(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function secureDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const observed = await lstat(directory);
  if (observed.isSymbolicLink() || !observed.isDirectory()) {
    throw actionError("Provider approval storage must be a private directory.", "PROVIDER_ACTION_STORAGE_INVALID", {
      statusCode: 500,
      definitelyNotSubmitted: true,
    });
  }
  if (process.platform !== "win32") await chmod(directory, 0o700);
  return realpath(directory);
}

async function readRegularFile(filePath, maximumBytes) {
  const before = await lstat(filePath);
  if (before.isSymbolicLink() || !before.isFile() || before.size < 1 || before.size > maximumBytes) {
    throw actionError("A provider action file is not a bounded regular file.", "PROVIDER_ACTION_FILE_INVALID", {
      definitelyNotSubmitted: true,
    });
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
      throw actionError("A provider action file changed while it was opened.", "PROVIDER_ACTION_FILE_INVALID", {
        definitelyNotSubmitted: true,
      });
    }
    return await handle.readFile();
  } finally {
    await handle?.close();
  }
}

async function writeTemporaryFile(filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(contents);
    await handle.sync();
    if (process.platform !== "win32") await handle.chmod(0o600);
  } finally {
    await handle?.close();
  }
  return temporaryPath;
}

async function installExclusiveFile(filePath, contents) {
  const temporaryPath = await writeTemporaryFile(filePath, contents);
  try {
    await link(temporaryPath, filePath);
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  } finally {
    try {
      await unlink(temporaryPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function replaceFile(filePath, contents) {
  const temporaryPath = await writeTemporaryFile(filePath, contents);
  await rename(temporaryPath, filePath);
}

async function loadOrCreateSecret(storageRoot, injected) {
  if (injected !== undefined) {
    const secret = Buffer.isBuffer(injected) ? Buffer.from(injected) : Buffer.from(String(injected), "utf8");
    if (secret.byteLength < 32) {
      throw actionError("approvalSecret must contain at least 32 bytes.", "PROVIDER_ACTION_CONFIGURATION_INVALID", {
        statusCode: 500,
        definitelyNotSubmitted: true,
      });
    }
    return secret;
  }

  const secretPath = path.join(storageRoot, "approval-hmac.key");
  const fresh = randomBytes(32);
  const created = await installExclusiveFile(secretPath, fresh);
  const value = created ? fresh : await readRegularFile(secretPath, 512);
  if (value.byteLength !== 32) {
    throw actionError("The persisted provider approval secret is invalid.", "PROVIDER_ACTION_SECRET_INVALID", {
      statusCode: 500,
      definitelyNotSubmitted: true,
    });
  }
  if (process.platform !== "win32") await chmod(secretPath, 0o600);
  return Buffer.from(value);
}

function hmacFor(secret, payload) {
  return createHmac("sha256", secret).update(canonicalJson(payload)).digest("hex");
}

function secureHmacMatch(candidate, expected) {
  const left = Buffer.from(typeof candidate === "string" ? candidate : "", "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function signedEnvelope(secret, payload) {
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    payload: copyJson(payload),
    hmacSha256: hmacFor(secret, payload),
  };
}

async function writeSignedExclusive(filePath, secret, payload) {
  const envelope = signedEnvelope(secret, payload);
  const contents = Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  return installExclusiveFile(filePath, contents);
}

async function replaceSigned(filePath, secret, payload) {
  const envelope = signedEnvelope(secret, payload);
  await replaceFile(filePath, Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`, "utf8"));
}

async function readSigned(filePath, secret, missingAllowed = false) {
  let bytes;
  try {
    bytes = await readRegularFile(filePath, MAX_PRIVATE_RECORD_BYTES);
  } catch (error) {
    if (missingAllowed && error?.code === "ENOENT") return null;
    throw error;
  }
  let envelope;
  try {
    envelope = JSON.parse(bytes.toString("utf8"));
  } catch (cause) {
    throw actionError("A provider approval record is not valid JSON.", "PROVIDER_ACTION_RECEIPT_INVALID", {
      statusCode: 409,
      definitelyNotSubmitted: true,
      blocker: true,
      cause,
    });
  }
  try {
    assertPlainObject(envelope, "provider approval envelope");
    assertExactKeys(envelope, new Set(["schemaVersion", "payload", "hmacSha256"]), "provider approval envelope");
    if (envelope.schemaVersion !== RECEIPT_SCHEMA_VERSION) throw new TypeError("unsupported receipt schema");
    assertPlainObject(envelope.payload, "provider approval receipt");
    const expected = hmacFor(secret, envelope.payload);
    if (!secureHmacMatch(envelope.hmacSha256, expected)) throw new TypeError("receipt HMAC mismatch");
  } catch (cause) {
    if (cause?.code === "PROVIDER_ACTION_RECEIPT_INVALID") throw cause;
    throw actionError("A provider approval record failed integrity verification.", "PROVIDER_ACTION_RECEIPT_INVALID", {
      statusCode: 409,
      definitelyNotSubmitted: true,
      retryable: false,
      blocker: true,
      cause,
    });
  }
  return copyJson(envelope.payload);
}

function sanitizePublicJson(value, key = "") {
  if (SENSITIVE_FIELD.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((entry) => sanitizePublicJson(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizePublicJson(childValue, childKey)]),
    );
  }
  if (typeof value !== "string") return value;
  const redacted = redactSensitiveText(value);
  if (/^https?:\/\//i.test(redacted)) return sanitizeExternalUrl(redacted);
  return redacted;
}

function assertNoCredentialFields(value, location = "provider request") {
  if (typeof value === "string") {
    if (redactSensitiveText(value) !== value) {
      throw actionError(`${location} contains credential-like material and must not be stored in PROVIDER_REQUESTS.json.`, "PROVIDER_REQUESTS_CREDENTIAL_FORBIDDEN", {
        definitelyNotSubmitted: true,
        retryable: false,
        blocker: true,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoCredentialFields(entry, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_FIELD.test(key)) {
      throw actionError(`${location}.${key} is a credential field and must not be stored in PROVIDER_REQUESTS.json.`, "PROVIDER_REQUESTS_CREDENTIAL_FORBIDDEN", {
        definitelyNotSubmitted: true,
        retryable: false,
        blocker: true,
      });
    }
    assertNoCredentialFields(child, `${location}.${key}`);
  }
}

function publicStockRequest(intent) {
  const selection = intent.selection;
  const download = new URL(selection.downloadUrl);
  download.search = "";
  download.hash = "";
  return sanitizePublicJson({
    provider: selection.provider,
    operation: "download_explicit_stock_selection",
    method: "GET",
    assetId: selection.assetId,
    renditionId: selection.renditionId,
    selectionHash: selection.selectionHash,
    mediaType: selection.mediaType,
    width: selection.width,
    height: selection.height,
    declaredBytes: selection.declaredBytes,
    sourcePageUrl: selection.sourcePageUrl,
    download: {
      originAndPath: download.toString(),
      exactUrlSha256: stableSha256({ url: selection.downloadUrl }),
      queryPresent: new URL(selection.downloadUrl).search.length > 0,
    },
    creator: selection.creator,
    license: selection.license,
    retrievedAt: selection.retrievedAt,
  });
}

const JOB_SPECS = Object.freeze({
  "voice-timing": Object.freeze({
    jobId: "voice-timing",
    adapterId: ELEVENLABS_TIMED_TTS_ADAPTER_ID,
    namespace: "elevenLabs",
    requiredApprovalIds: ELEVENLABS_TIMED_TTS_APPROVALS,
    entryKeys: new Set(["elevenLabs"]),
    configFrom(entry) {
      return entry.elevenLabs;
    },
    buildIntent: buildElevenLabsTimedTtsIntent,
    createGrants: createElevenLabsTimedTtsApprovalGrants,
    payload(config, grants) {
      return { elevenLabs: copyJson(config), approvalGrants: copyJson(grants) };
    },
    publicRequest(intent) {
      return sanitizePublicJson(intent.descriptor);
    },
  }),
  "ai-video-pilot": Object.freeze({
    jobId: "ai-video-pilot",
    adapterId: GOOGLE_VEO_ADAPTER_ID,
    namespace: "googleVeo",
    requiredApprovalIds: GOOGLE_VEO_APPROVALS,
    entryKeys: new Set(["googleVeo"]),
    configFrom(entry) {
      return entry.googleVeo;
    },
    buildIntent: buildGoogleVeoIntent,
    createGrants: createGoogleVeoApprovalGrants,
    payload(config, grants) {
      return { googleVeo: copyJson(config), approvalGrants: copyJson(grants) };
    },
    publicRequest(intent) {
      return sanitizePublicJson(intent.descriptor);
    },
  }),
  "licensed-acquisition": Object.freeze({
    jobId: "licensed-acquisition",
    adapterId: STOCK_MEDIA_ADAPTER_ID,
    namespace: "stockMedia.selection",
    requiredApprovalIds: STOCK_MEDIA_APPROVALS,
    entryKeys: new Set(["stockMedia"]),
    configFrom(entry) {
      const stockMedia = assertPlainObject(entry.stockMedia, "requests.licensed-acquisition.stockMedia");
      assertExactKeys(stockMedia, new Set(["selection"]), "requests.licensed-acquisition.stockMedia");
      return stockMedia.selection;
    },
    buildIntent: buildStockDownloadIntent,
    createGrants: createStockDownloadApprovalGrants,
    payload(config, grants) {
      return { stockMedia: { selection: copyJson(config) }, approvalGrants: copyJson(grants) };
    },
    publicRequest: publicStockRequest,
  }),
});

const ADAPTER_SPECS = new Map(Object.values(JOB_SPECS).map((spec) => [spec.adapterId, spec]));

function normalizeProviderRequests(raw) {
  const document = assertPlainObject(raw, "PROVIDER_REQUESTS.json");
  assertExactKeys(document, new Set(["schemaVersion", "requests"]), "PROVIDER_REQUESTS.json");
  if (document.schemaVersion !== PROVIDER_REQUESTS_SCHEMA_VERSION) {
    throw actionError(
      `PROVIDER_REQUESTS.json schemaVersion must be ${PROVIDER_REQUESTS_SCHEMA_VERSION}.`,
      "PROVIDER_REQUESTS_SCHEMA_UNSUPPORTED",
      { definitelyNotSubmitted: true, retryable: false, blocker: true },
    );
  }
  const requests = assertPlainObject(document.requests, "PROVIDER_REQUESTS.json.requests");
  assertExactKeys(requests, new Set(Object.keys(JOB_SPECS)), "PROVIDER_REQUESTS.json.requests");
  const prepared = new Map();
  for (const [jobId, entryValue] of Object.entries(requests)) {
    const spec = JOB_SPECS[jobId];
    const entry = assertPlainObject(entryValue, `requests.${jobId}`);
    assertExactKeys(entry, spec.entryKeys, `requests.${jobId}`);
    try {
      const config = spec.configFrom(entry);
      assertNoCredentialFields(config, `requests.${jobId}.${spec.namespace}`);
      const intent = spec.buildIntent(config);
      prepared.set(jobId, { spec, config: copyJson(config), intent });
    } catch (cause) {
      if (cause?.providerActionBlocker) throw cause;
      throw actionError(
        `The ${jobId} provider request is invalid: ${redactSensitiveText(cause?.message || "validation failed")}`,
        "PROVIDER_REQUESTS_INVALID",
        { definitelyNotSubmitted: true, retryable: false, blocker: true, cause },
      );
    }
  }
  return prepared;
}

/**
 * Validates and returns the exact v1 document an agent may write to
 * planning/PROVIDER_REQUESTS.json. `requests` may contain any subset
 * of these strict entries:
 *
 *   { "voice-timing": { elevenLabs: <timed-TTS config> } }
 *   { "ai-video-pilot": { googleVeo: <Veo config> } }
 *   { "licensed-acquisition": { stockMedia: { selection: <stock selection> } } }
 */
export function createProviderRequestsDocument(requests) {
  const document = {
    schemaVersion: PROVIDER_REQUESTS_SCHEMA_VERSION,
    requests: copyJson(requests, "provider requests"),
  };
  normalizeProviderRequests(document);
  return copyJson(document);
}

/** Returns a fresh, safe scaffold that performs no provider action. */
export function createEmptyProviderRequestsDocument() {
  return copyJson(EMPTY_PROVIDER_REQUESTS_DOCUMENT);
}

function requestIdentity(input) {
  const request = assertPlainObject(input, "provider action request");
  return {
    runId: assertIdentifier(request.runId, "runId"),
    jobId: assertIdentifier(request.jobId, "jobId"),
    scopeHash: assertSha256(request.scopeHash, "scopeHash"),
  };
}

function assertLocalUser(actor) {
  if (!actor || actor.kind !== "local-user" || typeof actor.id !== "string" || !IDENTIFIER.test(actor.id)) {
    throw actionError(
      "Only an authenticated local user may approve a provider action.",
      "PROVIDER_ACTION_LOCAL_USER_REQUIRED",
      { statusCode: 403, definitelyNotSubmitted: true, retryable: false },
    );
  }
  return actor.id;
}

function blockerView(error) {
  return {
    code: typeof error?.code === "string" ? error.code : "PROVIDER_ACTION_BLOCKED",
    message: redactSensitiveText(error?.message || "The provider action is blocked.").slice(0, 1000),
  };
}

function approvalReceiptKey(binding) {
  return stableSha256({ receiptSchemaVersion: RECEIPT_SCHEMA_VERSION, kind: "provider-action-approval", ...binding });
}

function submissionRecordKey(request) {
  return stableSha256({
    recordSchemaVersion: RECEIPT_SCHEMA_VERSION,
    kind: "provider-action-submission",
    runId: request.runId,
    scopeHash: request.scopeHash,
    jobId: request.job.id,
    adapterId: request.adapterId,
    submissionKey: request.submissionKey,
  });
}

function receiptPublicView(receipt) {
  return {
    schemaVersion: receipt.schemaVersion,
    receiptId: receipt.receiptId,
    runId: receipt.runId,
    jobId: receipt.jobId,
    scopeHash: receipt.scopeHash,
    adapterId: receipt.adapterId,
    actionHash: receipt.actionHash,
    requestFingerprint: receipt.requestFingerprint,
    requiredApprovalIds: [...receipt.requiredApprovalIds],
    approvedBy: receipt.approvedBy,
    approvedAt: receipt.approvedAt,
    signatureVerified: true,
  };
}

/**
 * Creates the action-approval module at the seam between immutable Director
 * jobs and mutable agent-authored provider parameters.
 *
 * Integration contract:
 *   const actions = await createProviderActionService({
 *     resolveRunDirectory, storageDirectory,
 *   });
 *   const providerAdapters = actions.wrapAdapters(rawProviderAdapters);
 *
 * `resolveRunDirectory({ runId, jobId, scopeHash })` must return the absolute
 * production-run directory. `storageDirectory` must be an absolute private
 * directory outside every run directory. Call `inspect` before showing an
 * approval, then call `approve` only with the authenticated local-user actor
 * and the exact scopeHash/actionHash returned by that inspection.
 */
export async function createProviderActionService({
  resolveRunDirectory,
  storageDirectory,
  approvalSecret,
  verifyStockSelection,
  clock = () => new Date(),
} = {}) {
  if (typeof resolveRunDirectory !== "function") {
    throw new TypeError("resolveRunDirectory must be injected.");
  }
  if (typeof storageDirectory !== "string" || !path.isAbsolute(storageDirectory)) {
    throw new TypeError("storageDirectory must be an absolute private path outside run directories.");
  }
  if (typeof clock !== "function" && typeof clock?.now !== "function") {
    throw new TypeError("clock must be a function or expose now().");
  }

  const storageRoot = await secureDirectory(path.resolve(storageDirectory));
  const receiptDirectory = await secureDirectory(path.join(storageRoot, "receipts"));
  const submissionDirectory = await secureDirectory(path.join(storageRoot, "submissions"));
  const secret = await loadOrCreateSecret(storageRoot, approvalSecret);
  const queues = new Map();

  async function verifyTrustedStockSelection(selection) {
    if (typeof verifyStockSelection !== "function") {
      throw actionError(
        "The trusted stock-selection verifier is unavailable; stock approval is fail-closed.",
        "STOCK_SELECTION_VERIFIER_UNAVAILABLE",
        {
          statusCode: 503,
          definitelyNotSubmitted: true,
          retryable: false,
          blocker: true,
        },
      );
    }
    try {
      const verified = await verifyStockSelection(copyJson(selection, "stock selection"));
      if (verified !== true) throw new TypeError("stock selection verifier did not return true");
    } catch (cause) {
      if (cause?.code === "STOCK_SELECTION_VERIFIER_UNAVAILABLE") throw cause;
      throw actionError(
        "Stock selection proof failed trusted cache verification; search and select the exact rendition again.",
        "STOCK_SELECTION_PROOF_INVALID",
        {
          statusCode: 409,
          definitelyNotSubmitted: true,
          retryable: false,
          blocker: true,
          cause,
        },
      );
    }
  }

  async function withQueue(key, operation) {
    const prior = queues.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const tail = prior.then(() => current);
    queues.set(key, tail);
    await prior;
    try {
      return await operation();
    } finally {
      release();
      if (queues.get(key) === tail) queues.delete(key);
    }
  }

  async function runContext(identity) {
    const returned = await resolveRunDirectory(copyJson(identity));
    if (typeof returned !== "string" || !path.isAbsolute(returned)) {
      throw actionError("resolveRunDirectory must return an absolute path.", "PROVIDER_ACTION_RUN_PATH_INVALID", {
        statusCode: 500,
        definitelyNotSubmitted: true,
      });
    }
    const runDirectory = await realpath(path.resolve(returned));
    if (isContained(runDirectory, storageRoot)) {
      throw actionError(
        "Provider approval storage must not be inside a production run directory.",
        "PROVIDER_ACTION_STORAGE_INSIDE_RUN",
        { statusCode: 500, definitelyNotSubmitted: true },
      );
    }
    return { ...identity, runDirectory };
  }

  async function readRequests(context) {
    const filePath = path.join(context.runDirectory, ...PROVIDER_REQUESTS_RELATIVE_PATH.split("/"));
    let bytes;
    try {
      const resolvedFile = await realpath(filePath);
      if (!isContained(context.runDirectory, resolvedFile)) {
        throw actionError("PROVIDER_REQUESTS.json must stay inside the run directory.", "PROVIDER_REQUESTS_PATH_INVALID", {
          definitelyNotSubmitted: true,
          retryable: false,
          blocker: true,
        });
      }
      bytes = await readRegularFile(filePath, MAX_REQUEST_DOCUMENT_BYTES);
    } catch (cause) {
      if (cause?.providerActionBlocker) throw cause;
      if (cause?.code === "ENOENT") {
        throw actionError(
          `Create ${PROVIDER_REQUESTS_RELATIVE_PATH} before approving provider work.`,
          "PROVIDER_REQUESTS_MISSING",
          { statusCode: 404, definitelyNotSubmitted: true, retryable: false, blocker: true },
        );
      }
      throw actionError("PROVIDER_REQUESTS.json could not be read as a bounded regular run file.", "PROVIDER_REQUESTS_FILE_INVALID", {
        statusCode: 409,
        definitelyNotSubmitted: true,
        retryable: false,
        blocker: true,
        cause,
      });
    }
    let parsed;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch (cause) {
      throw actionError("PROVIDER_REQUESTS.json is not valid JSON.", "PROVIDER_REQUESTS_INVALID", {
        definitelyNotSubmitted: true,
        retryable: false,
        blocker: true,
        cause,
      });
    }
    return {
      prepared: normalizeProviderRequests(parsed),
      documentSha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  async function prepare(rawIdentity) {
    const identity = requestIdentity(rawIdentity);
    const spec = JOB_SPECS[identity.jobId];
    if (!spec) {
      throw actionError(`Job ${identity.jobId} is not a provider-action job.`, "PROVIDER_ACTION_JOB_UNSUPPORTED", {
        statusCode: 404,
        definitelyNotSubmitted: true,
        retryable: false,
        blocker: true,
      });
    }
    const context = await runContext(identity);
    const requestDocument = await readRequests(context);
    const selected = requestDocument.prepared.get(identity.jobId);
    if (!selected) {
      throw actionError(
        `PROVIDER_REQUESTS.json does not contain ${identity.jobId}.`,
        "PROVIDER_ACTION_REQUEST_MISSING",
        { statusCode: 409, definitelyNotSubmitted: true, retryable: false, blocker: true },
      );
    }
    if (selected.spec.adapterId === STOCK_MEDIA_ADAPTER_ID) {
      await verifyTrustedStockSelection(selected.config);
    }
    const binding = {
      runId: identity.runId,
      jobId: identity.jobId,
      scopeHash: identity.scopeHash,
      adapterId: selected.spec.adapterId,
      actionHash: selected.intent.actionHash,
      requestFingerprint: selected.intent.requestFingerprint,
    };
    const proposal = {
      schemaVersion: 1,
      adapterId: selected.spec.adapterId,
      namespace: selected.spec.namespace,
      actionHash: selected.intent.actionHash,
      requestFingerprint: selected.intent.requestFingerprint,
      actionBindingHash: stableSha256({ approvalBindingSchemaVersion: 1, ...binding }),
      configHash: stableSha256(selected.config),
      planningDocumentHash: requestDocument.documentSha256,
      requiredApprovalIds: [...selected.spec.requiredApprovalIds],
      exactRequest: selected.spec.publicRequest(selected.intent),
    };
    return { context, selected, binding, proposal };
  }

  function receiptPath(binding) {
    return path.join(receiptDirectory, `${approvalReceiptKey(binding)}.json`);
  }

  async function loadApproval(prepared) {
    let receipt;
    try {
      receipt = await readSigned(receiptPath(prepared.binding), secret, true);
    } catch (cause) {
      if (cause?.code === "PROVIDER_ACTION_RECEIPT_INVALID" && cause?.providerActionBlocker) throw cause;
      throw actionError("A provider approval receipt failed integrity verification.", "PROVIDER_ACTION_RECEIPT_INVALID", {
        statusCode: 409,
        definitelyNotSubmitted: true,
        retryable: false,
        blocker: true,
        cause,
      });
    }
    if (!receipt) return null;
    const expected = {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      receiptId: approvalReceiptKey(prepared.binding),
      ...prepared.binding,
      requiredApprovalIds: [...prepared.selected.spec.requiredApprovalIds],
    };
    for (const [key, value] of Object.entries(expected)) {
      let matches = false;
      try {
        matches = canonicalJson(receipt[key]) === canonicalJson(value);
      } catch {
        matches = false;
      }
      if (!matches) {
        throw actionError("A provider approval receipt is not bound to the current exact action.", "PROVIDER_ACTION_RECEIPT_INVALID", {
          statusCode: 409,
          definitelyNotSubmitted: true,
          retryable: false,
          blocker: true,
        });
      }
    }
    if (typeof receipt.approvedBy !== "string" || !IDENTIFIER.test(receipt.approvedBy)) {
      throw actionError("A provider approval receipt has an invalid actor.", "PROVIDER_ACTION_RECEIPT_INVALID", {
        statusCode: 409,
        definitelyNotSubmitted: true,
        retryable: false,
        blocker: true,
      });
    }
    if (typeof receipt.approvedAt !== "string" || Number.isNaN(Date.parse(receipt.approvedAt))) {
      throw actionError("A provider approval receipt has an invalid time.", "PROVIDER_ACTION_RECEIPT_INVALID", {
        statusCode: 409,
        definitelyNotSubmitted: true,
        retryable: false,
        blocker: true,
      });
    }
    return receipt;
  }

  async function inspect(rawIdentity) {
    let identity;
    try {
      identity = requestIdentity(rawIdentity);
      const prepared = await prepare(identity);
      const receipt = await loadApproval(prepared);
      if (!receipt) {
        return {
          schemaVersion: 1,
          ...identity,
          readiness: "approval-required",
          ready: false,
          blocker: {
            code: "PROVIDER_ACTION_APPROVAL_REQUIRED",
            message: "An authenticated local user must confirm this exact provider action.",
          },
          proposal: prepared.proposal,
          approval: {
            status: "required",
            localUserOnly: true,
            exactScopeAndActionRequired: true,
          },
        };
      }
      return {
        schemaVersion: 1,
        ...identity,
        readiness: "ready",
        ready: true,
        blocker: null,
        proposal: prepared.proposal,
        approval: { status: "approved", receipt: receiptPublicView(receipt) },
      };
    } catch (error) {
      if (!error?.providerActionBlocker) throw error;
      return {
        schemaVersion: 1,
        ...(identity || {}),
        readiness: "blocked",
        ready: false,
        blocker: blockerView(error),
        proposal: null,
        approval: { status: "unavailable" },
      };
    }
  }

  async function approve(request = {}) {
    const approvedBy = assertLocalUser(request.actor);
    if (request.confirmed !== true) {
      throw actionError("Explicit local-user confirmation is required.", "PROVIDER_ACTION_CONFIRMATION_REQUIRED", {
        statusCode: 403,
        definitelyNotSubmitted: true,
        retryable: false,
      });
    }
    const identity = requestIdentity(request);
    const suppliedActionHash = assertSha256(request.actionHash, "actionHash");
    const prepared = await prepare(identity);
    if (prepared.proposal.actionHash !== suppliedActionHash) {
      throw actionError(
        "The provider action changed; inspect and approve the current exact action.",
        "PROVIDER_ACTION_APPROVAL_STALE",
        { statusCode: 409, definitelyNotSubmitted: true, retryable: false },
      );
    }
    const filePath = receiptPath(prepared.binding);
    return withQueue(filePath, async () => {
      const prior = await loadApproval(prepared);
      if (prior) return receiptPublicView(prior);
      const payload = {
        schemaVersion: RECEIPT_SCHEMA_VERSION,
        receiptId: approvalReceiptKey(prepared.binding),
        ...prepared.binding,
        requiredApprovalIds: [...prepared.selected.spec.requiredApprovalIds],
        approvedBy,
        approvedAt: nowIso(clock),
        confirmed: true,
      };
      const created = await writeSignedExclusive(filePath, secret, payload);
      const persisted = created ? payload : await loadApproval(prepared);
      if (!persisted) {
        throw actionError("The exact provider approval receipt could not be committed.", "PROVIDER_ACTION_RECEIPT_COMMIT_FAILED", {
          statusCode: 500,
          definitelyNotSubmitted: true,
        });
      }
      return receiptPublicView(persisted);
    });
  }

  async function approvedExecutionRequest(request, expectedAdapterId) {
    const jobId = request?.job?.id;
    const identity = requestIdentity({ runId: request?.runId, jobId, scopeHash: request?.scopeHash });
    const prepared = await prepare(identity);
    if (prepared.selected.spec.adapterId !== expectedAdapterId || request?.adapterId !== expectedAdapterId) {
      throw actionError("The provider adapter does not match the canonical provider job.", "PROVIDER_ACTION_ADAPTER_MISMATCH", {
        definitelyNotSubmitted: true,
        retryable: false,
      });
    }
    let receipt;
    try {
      receipt = await loadApproval(prepared);
    } catch (cause) {
      throw actionError("The exact provider action approval failed integrity verification.", "PROVIDER_ACTION_APPROVAL_INVALID", {
        statusCode: 403,
        definitelyNotSubmitted: true,
        retryable: false,
        cause,
      });
    }
    if (!receipt) {
      throw actionError(
        "This exact provider action has not been approved by an authenticated local user.",
        "PROVIDER_ACTION_APPROVAL_REQUIRED",
        { statusCode: 403, definitelyNotSubmitted: true, retryable: false },
      );
    }
    const grants = prepared.selected.spec.createGrants(prepared.selected.config);
    const copiedJob = copyJson(request.job, "execution job");
    return {
      prepared,
      request: {
        adapterId: request.adapterId,
        runId: request.runId,
        scopeHash: request.scopeHash,
        strategyId: request.strategyId,
        submissionKey: request.submissionKey,
        attemptNumber: request.attemptNumber,
        routeAttempt: request.routeAttempt,
        externalId: request.externalId ?? null,
        job: {
          id: copiedJob.id,
          laneId: copiedJob.laneId ?? null,
          dependsOn: Array.isArray(copiedJob.dependsOn) ? copiedJob.dependsOn : [],
          outputRoles: Array.isArray(copiedJob.outputRoles) ? copiedJob.outputRoles : [],
          payload: prepared.selected.spec.payload(prepared.selected.config, grants),
        },
      },
    };
  }

  function submissionPath(request) {
    return path.join(submissionDirectory, `${submissionRecordKey(request)}.json`);
  }

  function assertSubmissionBinding(record, request, prepared) {
    const expected = {
      schemaVersion: RECEIPT_SCHEMA_VERSION,
      runId: request.runId,
      scopeHash: request.scopeHash,
      jobId: request.job.id,
      adapterId: request.adapterId,
      submissionKey: request.submissionKey,
      actionHash: prepared.proposal.actionHash,
      requestFingerprint: prepared.proposal.requestFingerprint,
    };
    for (const [key, value] of Object.entries(expected)) {
      let matches = false;
      try {
        matches = canonicalJson(record[key]) === canonicalJson(value);
      } catch {
        matches = false;
      }
      if (!matches) {
        throw actionError(
          "A durable provider submission belongs to a different action; it will not be submitted again.",
          "PROVIDER_ACTION_SUBMISSION_BINDING_CONFLICT",
          { statusCode: 409, definitelyNotSubmitted: false, retryable: false },
        );
      }
    }
  }

  function noResubmitObservation(record, request) {
    if (record.result && typeof record.result === "object") return copyJson(record.result);
    return {
      status: "unknown",
      externalId: record.externalId || request.externalId || null,
      reasonCode: record.reasonCode || "PROVIDER_ACTION_SUBMISSION_AMBIGUOUS",
    };
  }

  function wrapAdapter(rawAdapter) {
    if (!rawAdapter || typeof rawAdapter !== "object" || typeof rawAdapter.submit !== "function") {
      throw new TypeError("A raw provider adapter with submit() is required.");
    }
    const spec = ADAPTER_SPECS.get(rawAdapter.id);
    if (!spec) throw new TypeError(`Provider action policy does not support adapter ${rawAdapter.id || "unknown"}.`);

    async function submit(originalRequest) {
      const { prepared, request } = await approvedExecutionRequest(originalRequest, rawAdapter.id);
      assertSha256(request.submissionKey, "submissionKey");
      const filePath = submissionPath(request);
      return withQueue(filePath, async () => {
        let existing;
        try {
          existing = await readSigned(filePath, secret, true);
        } catch (cause) {
          throw actionError(
            "A durable provider submission record failed integrity verification; no request was sent.",
            "PROVIDER_ACTION_SUBMISSION_RECORD_INVALID",
            { statusCode: 409, definitelyNotSubmitted: false, retryable: false, cause },
          );
        }
        if (existing) {
          assertSubmissionBinding(existing, request, prepared);
          return noResubmitObservation(existing, request);
        }

        const base = {
          schemaVersion: RECEIPT_SCHEMA_VERSION,
          runId: request.runId,
          scopeHash: request.scopeHash,
          jobId: request.job.id,
          adapterId: request.adapterId,
          submissionKey: request.submissionKey,
          actionHash: prepared.proposal.actionHash,
          requestFingerprint: prepared.proposal.requestFingerprint,
          state: "submitting",
          externalId: request.externalId || null,
          reasonCode: null,
          updatedAt: nowIso(clock),
        };
        let claimed;
        try {
          claimed = await writeSignedExclusive(filePath, secret, base);
        } catch (cause) {
          throw actionError(
            "The durable provider submission guard could not be created; no request was sent.",
            "PROVIDER_ACTION_SUBMISSION_GUARD_FAILED",
            { statusCode: 500, definitelyNotSubmitted: true, retryable: false, cause },
          );
        }
        if (!claimed) {
          let claimedByAnotherProcess;
          try {
            claimedByAnotherProcess = await readSigned(filePath, secret);
          } catch (cause) {
            throw actionError(
              "A concurrent durable provider submission could not be verified; it will not be submitted again.",
              "PROVIDER_ACTION_SUBMISSION_RECORD_INVALID",
              { statusCode: 409, definitelyNotSubmitted: false, retryable: false, cause },
            );
          }
          assertSubmissionBinding(claimedByAnotherProcess, request, prepared);
          return noResubmitObservation(claimedByAnotherProcess, request);
        }

        let providerReturned = false;
        try {
          const rawResult = await rawAdapter.submit(request);
          providerReturned = true;
          let result;
          try {
            result = copyJson(rawResult, "provider adapter result");
            assertNoCredentialFields(result, "provider adapter result");
          } catch (cause) {
            throw actionError(
              "The provider returned an invalid or credential-bearing result after submission.",
              "PROVIDER_ACTION_RESULT_INVALID",
              { definitelyNotSubmitted: false, retryable: false, cause },
            );
          }
          await replaceSigned(filePath, secret, {
            ...base,
            state: typeof result?.status === "string" ? result.status : "unknown",
            externalId: result?.externalId || request.externalId || null,
            reasonCode: result?.reasonCode || null,
            result,
            updatedAt: nowIso(clock),
          });
          return result;
        } catch (error) {
          const reportedError = providerReturned && error?.definitelyNotSubmitted === true
            ? actionError(
                "Provider submission completed, but its local receipt could not be committed definitively.",
                "PROVIDER_ACTION_SUBMISSION_AMBIGUOUS",
                { definitelyNotSubmitted: false, retryable: false, cause: error },
              )
            : error;
          try {
            await replaceSigned(filePath, secret, {
              ...base,
              state: reportedError?.definitelyNotSubmitted === true ? "definitely-not-submitted" : "ambiguous",
              reasonCode: typeof reportedError?.code === "string"
                ? reportedError.code
                : reportedError?.definitelyNotSubmitted === true
                  ? "PROVIDER_ACTION_NOT_SUBMITTED"
                  : "PROVIDER_ACTION_SUBMISSION_AMBIGUOUS",
              updatedAt: nowIso(clock),
            });
          } catch (persistenceError) {
            throw actionError(
              "Provider submission ended without a durable definitive receipt.",
              "PROVIDER_ACTION_SUBMISSION_AMBIGUOUS",
              { definitelyNotSubmitted: false, retryable: false, cause: persistenceError },
            );
          }
          throw reportedError;
        }
      });
    }

    async function reconcile(originalRequest) {
      const { prepared, request } = await approvedExecutionRequest(originalRequest, rawAdapter.id);
      assertSha256(request.submissionKey, "submissionKey");
      const filePath = submissionPath(request);
      return withQueue(filePath, async () => {
        let existing;
        try {
          existing = await readSigned(filePath, secret, true);
        } catch (cause) {
          throw actionError(
            "A durable provider submission record failed integrity verification; reconciliation was not attempted.",
            "PROVIDER_ACTION_SUBMISSION_RECORD_INVALID",
            { statusCode: 409, definitelyNotSubmitted: true, retryable: false, cause },
          );
        }
        if (existing) {
          assertSubmissionBinding(existing, request, prepared);
          if (["succeeded", "failed", "cancelled"].includes(existing.state) && existing.result) {
            return copyJson(existing.result);
          }
        }
        if (typeof rawAdapter.reconcile !== "function") {
          return {
            status: "unknown",
            externalId: request.externalId || existing?.externalId || null,
            reasonCode: "PROVIDER_ACTION_RECONCILIATION_UNAVAILABLE",
          };
        }
        const result = copyJson(await rawAdapter.reconcile(request), "provider reconciliation result");
        const record = existing || {
          schemaVersion: RECEIPT_SCHEMA_VERSION,
          runId: request.runId,
          scopeHash: request.scopeHash,
          jobId: request.job.id,
          adapterId: request.adapterId,
          submissionKey: request.submissionKey,
          actionHash: prepared.proposal.actionHash,
          requestFingerprint: prepared.proposal.requestFingerprint,
        };
        await replaceSigned(filePath, secret, {
          ...record,
          state: typeof result?.status === "string" ? result.status : "unknown",
          externalId: result?.externalId || request.externalId || existing?.externalId || null,
          reasonCode: result?.reasonCode || null,
          result,
          updatedAt: nowIso(clock),
        });
        return result;
      });
    }

    return Object.freeze({
      id: rawAdapter.id,
      kind: `${rawAdapter.kind || "provider"}-action-approved`,
      submit,
      reconcile,
    });
  }

  function wrapAdapters(rawAdapters) {
    if (!Array.isArray(rawAdapters)) throw new TypeError("rawAdapters must be an array.");
    return Object.freeze(rawAdapters.map(wrapAdapter));
  }

  function capabilities() {
    return Object.freeze({
      schemaVersion: 1,
      requestDocument: PROVIDER_REQUESTS_RELATIVE_PATH,
      requestSchemaVersion: PROVIDER_REQUESTS_SCHEMA_VERSION,
      supportedJobs: Object.values(JOB_SPECS).map((spec) => ({
        jobId: spec.jobId,
        adapterId: spec.adapterId,
        namespace: spec.namespace,
      })),
      localUserApprovalOnly: true,
      exactScopeAndActionBinding: true,
      hmacReceipts: true,
      durableNoResubmitGuard: true,
    });
  }

  return Object.freeze({ inspect, approve, wrapAdapter, wrapAdapters, capabilities });
}

/** Creates one action-gated adapter while preserving the raw adapter ID. */
export function createProviderActionAdapter({ actionService, rawAdapter } = {}) {
  if (!actionService || typeof actionService.wrapAdapter !== "function") {
    throw new TypeError("actionService must be a provider action service.");
  }
  return actionService.wrapAdapter(rawAdapter);
}

/** Creates the action-gated adapter array passed to the execution registry. */
export function createProviderActionAdapters({ actionService, rawAdapters } = {}) {
  if (!actionService || typeof actionService.wrapAdapters !== "function") {
    throw new TypeError("actionService must be a provider action service.");
  }
  return actionService.wrapAdapters(rawAdapters);
}
