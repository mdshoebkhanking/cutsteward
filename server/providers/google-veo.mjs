import {
  ambiguousProviderError,
  assertAdapterRequestId,
  assertExactKeys,
  assertExecutionRequest,
  assertPlainObject,
  assertSupportedOutputRoles,
  assertText,
  canonicalJson,
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

export const GOOGLE_VEO_ADAPTER_ID = "google.veo_3_1";
export const GOOGLE_VEO_APPROVALS = Object.freeze([
  "provider-upload",
  "generation-spend",
]);

const SUPPORTED_OUTPUT_ROLES = new Set(["generation_manifest", "source_media"]);
const CONFIG_KEYS = new Set(["instances", "model", "parameters", "sampleIndex"]);
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const OPERATION_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._~-]{0,255}$/;
const GOOGLE_API_ORIGIN = "https://generativelanguage.googleapis.com";

function validateJsonObject(value, label) {
  assertPlainObject(value, label);
  stableSha256(value);
  return cloneJson(value);
}

function normalizeConfig(rawConfig) {
  const config = assertPlainObject(rawConfig, "job.payload.googleVeo");
  assertExactKeys(config, CONFIG_KEYS, "job.payload.googleVeo");
  const model = assertText(config.model, "googleVeo.model", 128);
  if (!MODEL_ID.test(model)) {
    throw knownProviderError(
      "googleVeo.model must be an unqualified Gemini API model identifier.",
      "PROVIDER_REQUEST_INVALID",
      { retryable: false },
    );
  }
  if (!Array.isArray(config.instances) || config.instances.length < 1 || config.instances.length > 8) {
    throw knownProviderError(
      "googleVeo.instances must contain from 1 through 8 request objects.",
      "PROVIDER_REQUEST_INVALID",
      { retryable: false },
    );
  }
  const instances = config.instances.map((instance, index) =>
    validateJsonObject(instance, `googleVeo.instances[${index}]`));
  const parameters = config.parameters === undefined
    ? {}
    : validateJsonObject(config.parameters, "googleVeo.parameters");
  const sampleIndex = config.sampleIndex ?? 0;
  if (!Number.isInteger(sampleIndex) || sampleIndex < 0 || sampleIndex > 7) {
    throw knownProviderError(
      "googleVeo.sampleIndex must be an integer from 0 through 7.",
      "PROVIDER_REQUEST_INVALID",
      { retryable: false },
    );
  }
  return { model, instances, parameters, sampleIndex };
}

export function buildGoogleVeoIntent(rawConfig) {
  const normalized = normalizeConfig(rawConfig);
  const body = {
    instances: normalized.instances,
    parameters: normalized.parameters,
  };
  const descriptor = {
    provider: "google-gemini-api",
    operation: "predictLongRunning",
    apiVersion: "v1beta",
    method: "POST",
    path: `/v1beta/models/${normalized.model}:predictLongRunning`,
    body,
  };
  const requestFingerprint = stableSha256(descriptor);
  const actionHash = stableSha256({
    approvalSchemaVersion: 1,
    action: "external_mutation",
    provider: "google-veo",
    requestFingerprint,
    selectedSampleIndex: normalized.sampleIndex,
  });
  return Object.freeze({
    requestFingerprint,
    actionHash,
    descriptor: cloneJson(descriptor),
  });
}

export function createGoogleVeoApprovalGrants(rawConfig) {
  const { actionHash } = buildGoogleVeoIntent(rawConfig);
  return GOOGLE_VEO_APPROVALS.map((id) => createExactApprovalGrant(id, actionHash));
}

function requestSpec(rawConfig) {
  const normalized = normalizeConfig(rawConfig);
  const intent = buildGoogleVeoIntent(rawConfig);
  const body = {
    instances: normalized.instances,
    parameters: normalized.parameters,
  };
  return {
    ...normalized,
    ...intent,
    url: `${GOOGLE_API_ORIGIN}/v1beta/models/${encodeURIComponent(normalized.model)}:predictLongRunning`,
    requestBody: canonicalJson(body),
  };
}

function operationPath(name) {
  if (typeof name !== "string" || name.length < 1 || name.length > 512 || name.includes("?") || name.includes("#")) {
    throw new TypeError("Google returned an invalid long-running operation name.");
  }
  const segments = name.split("/");
  if (segments.some((segment) => !OPERATION_SEGMENT.test(segment))) {
    throw new TypeError("Google returned an invalid long-running operation name.");
  }
  if (!segments.includes("operations")) {
    throw new TypeError("Google response did not name a long-running operation.");
  }
  return segments.map(encodeURIComponent).join("/");
}

function videoDownloadUrl(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new TypeError("Google returned an invalid generated-video URI.");
  }
  if (parsed.origin !== GOOGLE_API_ORIGIN || parsed.username || parsed.password) {
    throw new TypeError("Google returned a generated-video URI outside its API origin.");
  }
  return parsed.toString();
}

function terminalSamples(operation) {
  const samples = operation?.response?.generateVideoResponse?.generatedSamples;
  if (!Array.isArray(samples) || samples.length < 1) {
    throw new TypeError("Completed Veo operation did not include generatedSamples.");
  }
  return samples.map((sample, index) => {
    const uri = sample?.video?.uri;
    if (typeof uri !== "string" || uri.length < 1) {
      throw new TypeError(`Completed Veo sample ${index} did not include video.uri.`);
    }
    return {
      uri: videoDownloadUrl(uri),
      uriSha256: stableSha256({ uri }),
    };
  });
}

function submitHttpFailure(status) {
  if (status === 429) {
    return { status: "failed", retryable: true, reasonCode: "VEO_SUBMISSION_THROTTLED" };
  }
  return { status: "failed", retryable: false, reasonCode: "VEO_SUBMISSION_REJECTED" };
}

function safeMediaType(response) {
  const value = readHeader(response, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (value?.startsWith("video/") || value === "application/octet-stream") return value;
  return "video/mp4";
}

function preflightSpec(request) {
  try {
    return requestSpec(request.job.payload.googleVeo);
  } catch (error) {
    if (error?.definitelyNotSubmitted === true) throw error;
    throw knownProviderError(
      "Google Veo request validation failed before submission.",
      "PROVIDER_REQUEST_INVALID",
      { retryable: false, cause: error },
    );
  }
}

export function createGoogleVeoAdapter({
  fetchImpl,
  resolveCredential,
  resolveRunDirectory,
  timeoutMs = 60_000,
  maximumPollBytes = 8 * 1024 * 1024,
  maximumVideoBytes = 1024 * 1024 * 1024,
} = {}) {
  const providerFetch = requireInjectedFetch(fetchImpl);
  const credentialResolver = requireCredentialResolver(resolveCredential);
  const runDirectoryResolver = requireRunDirectoryResolver(resolveRunDirectory);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10 * 60_000) {
    throw new TypeError("timeoutMs must be an integer from 1 through 600000.");
  }
  if (!Number.isInteger(maximumPollBytes) || maximumPollBytes < 1024) {
    throw new TypeError("maximumPollBytes must be an integer of at least 1024.");
  }
  if (!Number.isInteger(maximumVideoBytes) || maximumVideoBytes < 1024) {
    throw new TypeError("maximumVideoBytes must be an integer of at least 1024.");
  }

  const observations = new Map();

  async function submit(request) {
    assertExecutionRequest(request);
    assertAdapterRequestId(request, GOOGLE_VEO_ADAPTER_ID);
    assertSupportedOutputRoles(request, SUPPORTED_OUTPUT_ROLES);
    const spec = preflightSpec(request);
    requireExactApprovalGrants(request, GOOGLE_VEO_APPROVALS, spec.actionHash);

    const prior = observations.get(request.submissionKey);
    if (prior) return cloneJson(prior);
    if (request.externalId) {
      const accepted = { status: "accepted", externalId: request.externalId };
      observations.set(request.submissionKey, accepted);
      return accepted;
    }

    const apiKey = await getInjectedCredential(credentialResolver, {
      provider: "google-veo",
      names: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
      request,
    });
    observations.set(request.submissionKey, {
      status: "unknown",
      reasonCode: "VEO_SUBMISSION_AMBIGUOUS",
    });

    let response;
    try {
      response = await providerFetch(spec.url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: spec.requestBody,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
    } catch (cause) {
      throw ambiguousProviderError(
        "Veo submission ended without a definitive provider response.",
        "VEO_SUBMISSION_AMBIGUOUS",
        { cause },
      );
    }

    if (!response?.ok) {
      if (
        Number.isInteger(response?.status)
        && response.status >= 400
        && response.status < 500
        && response.status !== 408
      ) {
        const result = submitHttpFailure(response.status);
        observations.set(request.submissionKey, result);
        return cloneJson(result);
      }
      throw ambiguousProviderError(
        "Veo returned a server response that cannot prove whether an operation was created.",
        "VEO_SUBMISSION_AMBIGUOUS",
      );
    }

    let operation;
    let externalId;
    try {
      operation = await readBoundedJson(response, maximumPollBytes);
      externalId = operation.name;
      operationPath(externalId);
    } catch (cause) {
      throw ambiguousProviderError(
        "Veo accepted the request without a valid durable operation name.",
        "VEO_OPERATION_NAME_MISSING",
        { cause },
      );
    }
    const accepted = { status: "accepted", externalId };
    observations.set(request.submissionKey, accepted);
    return accepted;
  }

  async function reconcile(request) {
    assertExecutionRequest(request);
    assertAdapterRequestId(request, GOOGLE_VEO_ADAPTER_ID);
    assertSupportedOutputRoles(request, SUPPORTED_OUTPUT_ROLES);
    const spec = preflightSpec(request);
    requireExactApprovalGrants(request, GOOGLE_VEO_APPROVALS, spec.actionHash);
    const prior = observations.get(request.submissionKey);
    if (prior?.status === "succeeded" || prior?.status === "failed" || prior?.status === "cancelled") {
      return cloneJson(prior);
    }
    const externalId = request.externalId || prior?.externalId;
    if (!externalId) {
      return { status: "unknown", reasonCode: "VEO_OPERATION_NAME_MISSING" };
    }

    let pollPath;
    try {
      pollPath = operationPath(externalId);
    } catch {
      return { status: "unknown", externalId, reasonCode: "VEO_OPERATION_NAME_INVALID" };
    }
    const apiKey = await getInjectedCredential(credentialResolver, {
      provider: "google-veo",
      names: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
      request,
    });
    let response;
    try {
      response = await providerFetch(`${GOOGLE_API_ORIGIN}/v1beta/${pollPath}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
    } catch {
      return { status: "unknown", externalId, reasonCode: "VEO_RECONCILIATION_UNAVAILABLE" };
    }
    if (!response?.ok) {
      return { status: "unknown", externalId, reasonCode: "VEO_RECONCILIATION_UNAVAILABLE" };
    }

    let operation;
    try {
      operation = await readBoundedJson(response, maximumPollBytes);
    } catch {
      return { status: "unknown", externalId, reasonCode: "VEO_RECONCILIATION_INVALID" };
    }
    if (operation.done !== true) {
      const running = { status: "running", externalId };
      observations.set(request.submissionKey, running);
      return running;
    }
    if (operation.error) {
      const failed = {
        status: "failed",
        externalId,
        retryable: false,
        reasonCode: "VEO_OPERATION_FAILED",
      };
      observations.set(request.submissionKey, failed);
      return failed;
    }

    let samples;
    let selected;
    try {
      samples = terminalSamples(operation);
      selected = samples[spec.sampleIndex];
      if (!selected) throw new TypeError("Configured sampleIndex is absent from the Veo result.");
    } catch {
      return { status: "unknown", externalId, reasonCode: "VEO_OPERATION_RECEIPT_INVALID" };
    }

    let mediaResponse;
    try {
      mediaResponse = await providerFetch(selected.uri, {
        method: "GET",
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
    } catch {
      return { status: "running", externalId, reasonCode: "VEO_DOWNLOAD_PENDING" };
    }
    if (!mediaResponse?.ok) {
      return { status: "running", externalId, reasonCode: "VEO_DOWNLOAD_PENDING" };
    }
    if (typeof mediaResponse.url === "string" && mediaResponse.url.length > 0) {
      try {
        videoDownloadUrl(mediaResponse.url);
      } catch {
        return { status: "unknown", externalId, reasonCode: "VEO_DOWNLOAD_ORIGIN_REJECTED" };
      }
    }

    let videoBytes;
    try {
      videoBytes = await readBoundedBytes(mediaResponse, maximumVideoBytes);
    } catch {
      return { status: "unknown", externalId, reasonCode: "VEO_DOWNLOAD_INVALID" };
    }
    const base = [
      "providers",
      "google-veo",
      request.job.id,
      stableSha256({ operationName: externalId }).slice(0, 24),
    ];
    try {
      const mediaOutput = await writeRunArtifact({
        resolveRunDirectory: runDirectoryResolver,
        request,
        relativePath: safeArtifactPath(...base, `sample-${spec.sampleIndex}.mp4`),
        contents: videoBytes,
        role: "source_media",
        mediaType: safeMediaType(mediaResponse),
      });
      const manifest = {
        schemaVersion: 1,
        provider: "google-veo",
        operationName: externalId,
        requestFingerprint: spec.requestFingerprint,
        actionHash: spec.actionHash,
        model: spec.model,
        selectedSampleIndex: spec.sampleIndex,
        availableSampleCount: samples.length,
        selectedUriSha256: selected.uriSha256,
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
        relativePath: safeArtifactPath(...base, "generation-manifest.json"),
        contents: jsonArtifactBytes(manifest),
        role: "generation_manifest",
        mediaType: "application/json",
      });
      const succeeded = {
        status: "succeeded",
        externalId,
        outputs: [manifestOutput, mediaOutput],
      };
      observations.set(request.submissionKey, cloneJson(succeeded));
      return succeeded;
    } catch {
      return { status: "unknown", externalId, reasonCode: "VEO_ARTIFACT_COMMIT_PENDING" };
    }
  }

  return Object.freeze({
    id: GOOGLE_VEO_ADAPTER_ID,
    kind: "provider-long-running-api",
    submit,
    reconcile,
  });
}
