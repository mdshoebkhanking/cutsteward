import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function canonicalize(value, location = "value") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${location} must not contain non-finite numbers.`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      if (entry === undefined) throw new TypeError(`${location}[${index}] must not be undefined.`);
      return canonicalize(entry, `${location}[${index}]`);
    });
  }
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${location} must contain only plain JSON objects.`);
    }
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key], `${location}.${key}`)]),
    );
  }
  throw new TypeError(`${location} must contain only JSON values.`);
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function stableSha256(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function bytesSha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function jsonArtifactBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalize(value), null, 2)}\n`, "utf8");
}

export function providerError(message, {
  code = "PROVIDER_ERROR",
  definitelyNotSubmitted,
  retryable,
  fatal,
  cause,
} = {}) {
  if (!IDENTIFIER.test(code)) throw new TypeError("Provider error codes must be stable identifiers.");
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.code = code;
  if (definitelyNotSubmitted !== undefined) error.definitelyNotSubmitted = definitelyNotSubmitted;
  if (retryable !== undefined) error.retryable = retryable;
  if (fatal !== undefined) error.fatal = fatal;
  return error;
}

export function knownProviderError(message, code, options = {}) {
  return providerError(message, {
    ...options,
    code,
    definitelyNotSubmitted: true,
  });
}

export function ambiguousProviderError(message, code, options = {}) {
  return providerError(message, {
    ...options,
    code,
    definitelyNotSubmitted: false,
  });
}

export function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw knownProviderError(`${label} must be an object.`, "PROVIDER_REQUEST_INVALID", {
      retryable: false,
    });
  }
  return value;
}

export function assertExactKeys(value, allowedKeys, label) {
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    throw knownProviderError(
      `${label} contains unsupported fields: ${unexpected.sort().join(", ")}.`,
      "PROVIDER_REQUEST_INVALID",
      { retryable: false },
    );
  }
}

export function assertText(value, label, maximum = 50_000) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw knownProviderError(
      `${label} must be non-empty text no longer than ${maximum} characters.`,
      "PROVIDER_REQUEST_INVALID",
      { retryable: false },
    );
  }
  return value;
}

export function assertIdentifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw knownProviderError(`${label} must be a stable identifier.`, "PROVIDER_REQUEST_INVALID", {
      retryable: false,
    });
  }
  return value;
}

export function assertExecutionRequest(request) {
  assertPlainObject(request, "adapter request");
  assertIdentifier(request.adapterId, "adapter request adapterId");
  assertIdentifier(request.runId, "adapter request runId");
  assertText(request.scopeHash, "adapter request scopeHash", 128);
  if (!SHA256.test(request.submissionKey || "")) {
    throw knownProviderError(
      "adapter request submissionKey must be a SHA-256.",
      "PROVIDER_REQUEST_INVALID",
      { retryable: false },
    );
  }
  assertPlainObject(request.job, "adapter request job");
  assertIdentifier(request.job.id, "adapter request job.id");
  if (!Array.isArray(request.job.outputRoles)) {
    throw knownProviderError(
      "adapter request job.outputRoles must be an array.",
      "PROVIDER_REQUEST_INVALID",
      { retryable: false },
    );
  }
  assertPlainObject(request.job.payload, "adapter request job.payload");
  return request;
}

export function assertAdapterRequestId(request, expectedId) {
  if (request.adapterId !== expectedId) {
    throw knownProviderError(
      `Adapter ${expectedId} cannot execute a request routed to ${request.adapterId}.`,
      "PROVIDER_ADAPTER_MISMATCH",
      { retryable: false },
    );
  }
}

export function assertSupportedOutputRoles(request, supportedRoles) {
  const roles = [...new Set(request.job.outputRoles)];
  for (const role of roles) {
    assertIdentifier(role, "output role");
    if (!supportedRoles.has(role)) {
      throw knownProviderError(
        `Adapter ${request.adapterId} does not support output role ${role}.`,
        "PROVIDER_OUTPUT_ROLE_UNSUPPORTED",
        { retryable: false },
      );
    }
  }
  return roles;
}

export function createExactApprovalGrant(id, actionHash) {
  assertIdentifier(id, "approval grant id");
  if (!SHA256.test(actionHash || "")) {
    throw new TypeError("approval grant actionHash must be a SHA-256.");
  }
  return Object.freeze({ id, decision: "grant", actionHash });
}

export function requireExactApprovalGrants(request, requiredIds, actionHash) {
  if (!SHA256.test(actionHash || "")) {
    throw new TypeError("actionHash must be a SHA-256.");
  }
  const grants = request.job.payload.approvalGrants;
  if (!Array.isArray(grants)) {
    throw knownProviderError(
      "Exact approval grants are required in job.payload.approvalGrants.",
      "PROVIDER_APPROVAL_REQUIRED",
      { retryable: false },
    );
  }
  for (const id of requiredIds) {
    const matching = grants.filter((grant) => grant?.id === id);
    if (
      matching.length !== 1
      || matching[0].decision !== "grant"
      || matching[0].actionHash !== actionHash
    ) {
      throw knownProviderError(
        `Approval ${id} must grant this exact provider action hash.`,
        "PROVIDER_APPROVAL_REQUIRED",
        { retryable: false },
      );
    }
  }
}

export function requireInjectedFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be injected; provider adapters never fall back to global fetch.");
  }
  return fetchImpl;
}

export function requireCredentialResolver(resolveCredential) {
  if (typeof resolveCredential !== "function") {
    throw new TypeError("resolveCredential must be injected; provider adapters never read environment credentials.");
  }
  return resolveCredential;
}

export function requireRunDirectoryResolver(resolveRunDirectory) {
  if (typeof resolveRunDirectory !== "function") {
    throw new TypeError("resolveRunDirectory must be injected for run-relative provider artifacts.");
  }
  return resolveRunDirectory;
}

export async function getInjectedCredential(resolveCredential, { provider, names, request }) {
  let resolved;
  try {
    resolved = await resolveCredential({ provider, names: [...names], request });
  } catch (cause) {
    throw knownProviderError("The provider credential resolver failed.", "PROVIDER_CREDENTIAL_UNAVAILABLE", {
      retryable: false,
      cause,
    });
  }
  const value = typeof resolved === "string" ? resolved : resolved?.value;
  const resolvedName = typeof resolved === "object" && resolved ? resolved.name : null;
  if (resolvedName !== null && !names.includes(resolvedName)) {
    throw knownProviderError(
      "The credential resolver returned an unexpected credential name.",
      "PROVIDER_CREDENTIAL_UNAVAILABLE",
      { retryable: false },
    );
  }
  if (typeof value !== "string" || value.length < 1 || value.length > 16_384) {
    throw knownProviderError("A provider credential is unavailable.", "PROVIDER_CREDENTIAL_UNAVAILABLE", {
      retryable: false,
    });
  }
  return value;
}

function normalizeRelativePath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length < 1 || relativePath.length > 1024) {
    throw new TypeError("Artifact path must be a non-empty run-relative path.");
  }
  if (path.isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new TypeError("Artifact path must stay inside the run directory.");
  }
  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new TypeError("Artifact path must stay inside the run directory.");
  }
  return normalized;
}

export function safeArtifactPath(...segments) {
  if (segments.length < 1) throw new TypeError("Artifact path needs at least one segment.");
  for (const segment of segments) {
    if (typeof segment !== "string" || !SAFE_PATH_SEGMENT.test(segment)) {
      throw new TypeError("Artifact path segments must be stable safe identifiers.");
    }
  }
  return normalizeRelativePath(segments.join("/"));
}

async function ensureSafeArtifactTarget(runDirectory, relativePath) {
  if (typeof runDirectory !== "string" || !path.isAbsolute(runDirectory)) {
    throw new TypeError("resolveRunDirectory must return an absolute path.");
  }
  const rootStats = await stat(runDirectory);
  if (!rootStats.isDirectory()) throw new TypeError("The resolved run directory must be a directory.");
  const rootReal = await realpath(runDirectory);
  const normalized = normalizeRelativePath(relativePath);
  const target = path.resolve(rootReal, ...normalized.split("/"));
  if (!target.startsWith(`${rootReal}${path.sep}`)) {
    throw new TypeError("Artifact target escaped the resolved run directory.");
  }
  const parent = path.dirname(target);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const parentReal = await realpath(parent);
  if (parentReal !== rootReal && !parentReal.startsWith(`${rootReal}${path.sep}`)) {
    throw new TypeError("Artifact parent resolves outside the run directory.");
  }
  const safeTarget = path.join(parentReal, path.basename(target));
  return { normalized, target: safeTarget };
}

async function existingArtifact(target) {
  try {
    const metadata = await lstat(target);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new TypeError("An artifact target already exists and is not a regular file.");
    }
    return readFile(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeRunArtifact({
  resolveRunDirectory,
  request,
  relativePath,
  contents,
  role,
  mediaType,
}) {
  const data = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  if (data.byteLength < 1) throw new TypeError("Provider artifacts must not be empty.");
  const runDirectory = await resolveRunDirectory(request);
  const { normalized, target } = await ensureSafeArtifactTarget(runDirectory, relativePath);
  const expectedHash = bytesSha256(data);
  const existing = await existingArtifact(target);
  if (existing) {
    if (bytesSha256(existing) !== expectedHash || existing.byteLength !== data.byteLength) {
      throw new TypeError("An artifact target already exists with different contents.");
    }
  } else {
    const temporary = `${target}.tmp-${randomUUID()}`;
    try {
      await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
  return {
    role,
    relativePath: normalized,
    sha256: expectedHash,
    bytes: data.byteLength,
    mediaType,
  };
}

export function readHeader(response, name) {
  const value = response?.headers?.get?.(name);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function readBoundedJson(response, maximumBytes = 64 * 1024 * 1024) {
  const declared = Number(readHeader(response, "content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new RangeError("Provider JSON response exceeds the configured size limit.");
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > maximumBytes) {
    throw new RangeError("Provider JSON response exceeds the configured size limit.");
  }
  return JSON.parse(text);
}

export async function readBoundedBytes(response, maximumBytes = 512 * 1024 * 1024) {
  const declared = Number(readHeader(response, "content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new RangeError("Provider media response exceeds the configured size limit.");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength < 1) throw new RangeError("Provider media response is empty.");
  if (buffer.byteLength > maximumBytes) {
    throw new RangeError("Provider media response exceeds the configured size limit.");
  }
  return buffer;
}

export function cloneJson(value) {
  return value === undefined ? undefined : structuredClone(value);
}
