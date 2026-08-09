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

export const ELEVENLABS_TIMED_TTS_ADAPTER_ID = "elevenlabs.tts_alignment";
export const ELEVENLABS_TIMED_TTS_APPROVALS = Object.freeze([
  "likeness-and-voice-consent",
  "provider-upload",
  "generation-spend",
]);

const SUPPORTED_OUTPUT_ROLES = new Set([
  "voice_performance_map",
  "voice_media",
  "word_timings",
]);
const CONFIG_KEYS = new Set([
  "applyLanguageTextNormalization",
  "applyTextNormalization",
  "enableLogging",
  "languageCode",
  "modelId",
  "nextRequestIds",
  "nextText",
  "optimizeStreamingLatency",
  "outputFormat",
  "previousRequestIds",
  "previousText",
  "pronunciationDictionaryLocators",
  "seed",
  "text",
  "usePvcAsIvc",
  "voiceId",
  "voiceSettings",
]);
const OUTPUT_FORMAT = /^[a-z0-9]+(?:_[a-z0-9]+){1,3}$/;
const VOICE_ID = /^[a-zA-Z0-9_-]{1,128}$/;

function optionalBoolean(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw knownProviderError(`${label} must be boolean.`, "PROVIDER_REQUEST_INVALID", {
      retryable: false,
    });
  }
  return value;
}

function optionalInteger(value, label, minimum, maximum) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw knownProviderError(
      `${label} must be an integer from ${minimum} through ${maximum}.`,
      "PROVIDER_REQUEST_INVALID",
      { retryable: false },
    );
  }
  return value;
}

function optionalText(value, label, maximum) {
  return value === undefined ? undefined : assertText(value, label, maximum);
}

function optionalTextArray(value, label, maximumItems = 3) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw knownProviderError(
      `${label} must be an array with at most ${maximumItems} entries.`,
      "PROVIDER_REQUEST_INVALID",
      { retryable: false },
    );
  }
  return value.map((entry, index) => assertText(entry, `${label}[${index}]`, 128));
}

function optionalJsonObject(value, label) {
  if (value === undefined) return undefined;
  assertPlainObject(value, label);
  stableSha256(value);
  return cloneJson(value);
}

function normalizeConfig(rawConfig) {
  const config = assertPlainObject(rawConfig, "job.payload.elevenLabs");
  assertExactKeys(config, CONFIG_KEYS, "job.payload.elevenLabs");
  const voiceId = assertText(config.voiceId, "elevenLabs.voiceId", 128);
  if (!VOICE_ID.test(voiceId)) {
    throw knownProviderError(
      "elevenLabs.voiceId contains unsupported characters.",
      "PROVIDER_REQUEST_INVALID",
      { retryable: false },
    );
  }
  const outputFormat = config.outputFormat ?? "mp3_44100_128";
  if (typeof outputFormat !== "string" || !OUTPUT_FORMAT.test(outputFormat)) {
    throw knownProviderError(
      "elevenLabs.outputFormat must be an ElevenLabs output-format identifier.",
      "PROVIDER_REQUEST_INVALID",
      { retryable: false },
    );
  }
  const enableLogging = config.enableLogging ?? true;
  optionalBoolean(enableLogging, "elevenLabs.enableLogging");
  const optimizeStreamingLatency = optionalInteger(
    config.optimizeStreamingLatency,
    "elevenLabs.optimizeStreamingLatency",
    0,
    4,
  );
  const body = {
    text: assertText(config.text, "elevenLabs.text", 50_000),
    model_id: optionalText(config.modelId, "elevenLabs.modelId", 128),
    language_code: optionalText(config.languageCode, "elevenLabs.languageCode", 32),
    voice_settings: optionalJsonObject(config.voiceSettings, "elevenLabs.voiceSettings"),
    pronunciation_dictionary_locators: config.pronunciationDictionaryLocators === undefined
      ? undefined
      : (() => {
          if (!Array.isArray(config.pronunciationDictionaryLocators)) {
            throw knownProviderError(
              "elevenLabs.pronunciationDictionaryLocators must be an array.",
              "PROVIDER_REQUEST_INVALID",
              { retryable: false },
            );
          }
          stableSha256(config.pronunciationDictionaryLocators);
          return cloneJson(config.pronunciationDictionaryLocators);
        })(),
    seed: optionalInteger(config.seed, "elevenLabs.seed", 0, 4_294_967_295),
    previous_text: optionalText(config.previousText, "elevenLabs.previousText", 50_000),
    next_text: optionalText(config.nextText, "elevenLabs.nextText", 50_000),
    previous_request_ids: optionalTextArray(config.previousRequestIds, "elevenLabs.previousRequestIds"),
    next_request_ids: optionalTextArray(config.nextRequestIds, "elevenLabs.nextRequestIds"),
    apply_text_normalization: optionalText(
      config.applyTextNormalization,
      "elevenLabs.applyTextNormalization",
      32,
    ),
    apply_language_text_normalization: optionalBoolean(
      config.applyLanguageTextNormalization,
      "elevenLabs.applyLanguageTextNormalization",
    ),
    use_pvc_as_ivc: optionalBoolean(config.usePvcAsIvc, "elevenLabs.usePvcAsIvc"),
  };
  return {
    voiceId,
    outputFormat,
    enableLogging,
    optimizeStreamingLatency,
    body,
  };
}

export function buildElevenLabsTimedTtsIntent(rawConfig) {
  const normalized = normalizeConfig(rawConfig);
  const query = {
    output_format: normalized.outputFormat,
    enable_logging: String(normalized.enableLogging),
    optimize_streaming_latency: normalized.optimizeStreamingLatency === undefined
      ? undefined
      : String(normalized.optimizeStreamingLatency),
  };
  const descriptor = {
    provider: "elevenlabs",
    operation: "text_to_speech_with_timestamps",
    apiVersion: "v1",
    method: "POST",
    path: `/v1/text-to-speech/${normalized.voiceId}/with-timestamps`,
    query,
    body: normalized.body,
  };
  const requestFingerprint = stableSha256(descriptor);
  const actionHash = stableSha256({
    approvalSchemaVersion: 1,
    action: "external_mutation",
    provider: "elevenlabs",
    requestFingerprint,
  });
  return Object.freeze({
    requestFingerprint,
    actionHash,
    descriptor: cloneJson(descriptor),
  });
}

export function createElevenLabsTimedTtsApprovalGrants(rawConfig) {
  const { actionHash } = buildElevenLabsTimedTtsIntent(rawConfig);
  return ELEVENLABS_TIMED_TTS_APPROVALS.map((id) => createExactApprovalGrant(id, actionHash));
}

function requestSpec(rawConfig) {
  const normalized = normalizeConfig(rawConfig);
  const intent = buildElevenLabsTimedTtsIntent(rawConfig);
  const url = new URL(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(normalized.voiceId)}/with-timestamps`,
  );
  url.searchParams.set("output_format", normalized.outputFormat);
  url.searchParams.set("enable_logging", String(normalized.enableLogging));
  if (normalized.optimizeStreamingLatency !== undefined) {
    url.searchParams.set("optimize_streaming_latency", String(normalized.optimizeStreamingLatency));
  }
  return {
    ...normalized,
    ...intent,
    url: url.toString(),
    requestBody: canonicalJson(normalized.body),
  };
}

function decodeBase64(value) {
  if (
    typeof value !== "string"
    || value.length < 4
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new TypeError("ElevenLabs audio_base64 is not valid canonical base64.");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.byteLength < 1 || decoded.toString("base64") !== value) {
    throw new TypeError("ElevenLabs audio_base64 did not decode exactly.");
  }
  return decoded;
}

function validateAlignment(raw, label) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError(`${label} must be an alignment object.`);
  }
  const characters = raw.characters;
  const starts = raw.character_start_times_seconds;
  const ends = raw.character_end_times_seconds;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) {
    throw new TypeError(`${label} must contain character and timing arrays.`);
  }
  if (characters.length < 1 || starts.length !== characters.length || ends.length !== characters.length) {
    throw new TypeError(`${label} timing arrays must be non-empty and equal length.`);
  }
  let previousStart = -1;
  let previousEnd = -1;
  const entries = characters.map((character, index) => {
    const startSeconds = starts[index];
    const endSeconds = ends[index];
    if (typeof character !== "string" || character.length < 1) {
      throw new TypeError(`${label}.characters[${index}] must be non-empty text.`);
    }
    if (
      !Number.isFinite(startSeconds)
      || !Number.isFinite(endSeconds)
      || startSeconds < 0
      || endSeconds < startSeconds
      || startSeconds < previousStart
      || endSeconds < previousEnd
    ) {
      throw new TypeError(`${label} contains invalid or non-monotonic timing data.`);
    }
    previousStart = startSeconds;
    previousEnd = endSeconds;
    return { character, startSeconds, endSeconds };
  });
  return {
    characters: [...characters],
    character_start_times_seconds: [...starts],
    character_end_times_seconds: [...ends],
    entries,
  };
}

function wordsFromAlignment(alignment) {
  const words = [];
  let current = null;
  alignment.entries.forEach((entry, characterIndex) => {
    if (/\s/u.test(entry.character)) {
      if (current) words.push(current);
      current = null;
      return;
    }
    if (!current) {
      current = {
        text: entry.character,
        startSeconds: entry.startSeconds,
        endSeconds: entry.endSeconds,
        startCharacterIndex: characterIndex,
        endCharacterIndex: characterIndex,
      };
    } else {
      current.text += entry.character;
      current.endSeconds = entry.endSeconds;
      current.endCharacterIndex = characterIndex;
    }
  });
  if (current) words.push(current);
  return words;
}

function mediaDescription(outputFormat) {
  const [codec, sampleRate] = outputFormat.split("_");
  if (codec === "mp3") return { extension: "mp3", mediaType: "audio/mpeg" };
  if (codec === "opus") return { extension: "opus", mediaType: "audio/ogg; codecs=opus" };
  if (codec === "ulaw") return { extension: "ulaw", mediaType: "audio/basic" };
  if (codec === "alaw") return { extension: "alaw", mediaType: "audio/G711-0" };
  if (codec === "pcm") {
    return { extension: "pcm", mediaType: `audio/L16; rate=${sampleRate || "unknown"}` };
  }
  return { extension: "bin", mediaType: "application/octet-stream" };
}

function httpFailure(status) {
  if (status === 429) {
    return { status: "failed", retryable: true, reasonCode: "ELEVENLABS_RATE_LIMITED" };
  }
  return { status: "failed", retryable: false, reasonCode: "ELEVENLABS_REQUEST_REJECTED" };
}

function preflightSpec(request) {
  try {
    return requestSpec(request.job.payload.elevenLabs);
  } catch (error) {
    if (error?.definitelyNotSubmitted === true) throw error;
    throw knownProviderError(
      "ElevenLabs request validation failed before submission.",
      "PROVIDER_REQUEST_INVALID",
      { retryable: false, cause: error },
    );
  }
}

function boundedReceiptHeader(response, name) {
  const value = readHeader(response, name);
  return value !== null && value.length <= 512 ? value : null;
}

export function createElevenLabsTimedTtsAdapter({
  fetchImpl,
  resolveCredential,
  resolveRunDirectory,
  timeoutMs = 60_000,
  maximumResponseBytes = 64 * 1024 * 1024,
} = {}) {
  const providerFetch = requireInjectedFetch(fetchImpl);
  const credentialResolver = requireCredentialResolver(resolveCredential);
  const runDirectoryResolver = requireRunDirectoryResolver(resolveRunDirectory);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10 * 60_000) {
    throw new TypeError("timeoutMs must be an integer from 1 through 600000.");
  }
  if (!Number.isInteger(maximumResponseBytes) || maximumResponseBytes < 1024) {
    throw new TypeError("maximumResponseBytes must be an integer of at least 1024.");
  }

  const observations = new Map();

  async function submit(request) {
    assertExecutionRequest(request);
    assertAdapterRequestId(request, ELEVENLABS_TIMED_TTS_ADAPTER_ID);
    assertSupportedOutputRoles(request, SUPPORTED_OUTPUT_ROLES);
    const spec = preflightSpec(request);
    requireExactApprovalGrants(request, ELEVENLABS_TIMED_TTS_APPROVALS, spec.actionHash);

    const prior = observations.get(request.submissionKey);
    if (prior) return cloneJson(prior);
    if (request.externalId) {
      return {
        status: "unknown",
        externalId: request.externalId,
        reasonCode: "ELEVENLABS_RECONCILIATION_UNAVAILABLE",
      };
    }

    const apiKey = await getInjectedCredential(credentialResolver, {
      provider: "elevenlabs",
      names: ["ELEVENLABS_API_KEY"],
      request,
    });
    observations.set(request.submissionKey, {
      status: "unknown",
      reasonCode: "ELEVENLABS_SUBMISSION_AMBIGUOUS",
    });

    let response;
    try {
      response = await providerFetch(spec.url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "xi-api-key": apiKey,
        },
        body: spec.requestBody,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
    } catch (cause) {
      throw ambiguousProviderError(
        "ElevenLabs submission ended without a definitive provider response.",
        "ELEVENLABS_SUBMISSION_AMBIGUOUS",
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
        const result = httpFailure(response.status);
        observations.set(request.submissionKey, result);
        return cloneJson(result);
      }
      throw ambiguousProviderError(
        "ElevenLabs returned a server response that cannot prove whether synthesis occurred.",
        "ELEVENLABS_SUBMISSION_AMBIGUOUS",
      );
    }

    let payload;
    let audio;
    let alignment;
    let normalizedAlignment;
    try {
      payload = await readBoundedJson(response, maximumResponseBytes);
      audio = decodeBase64(payload.audio_base64);
      alignment = validateAlignment(payload.alignment, "ElevenLabs alignment");
      normalizedAlignment = payload.normalized_alignment === undefined
        ? null
        : validateAlignment(payload.normalized_alignment, "ElevenLabs normalized_alignment");
    } catch (cause) {
      throw ambiguousProviderError(
        "ElevenLabs accepted the request but returned an invalid timed-audio receipt.",
        "ELEVENLABS_RECEIPT_INVALID",
        { cause },
      );
    }

    const requestId = boundedReceiptHeader(response, "request-id");
    const traceId = boundedReceiptHeader(response, "x-trace-id");
    const characterCostHeader = readHeader(response, "character-cost");
    const characterCost = characterCostHeader !== null
      && /^\d+$/.test(characterCostHeader)
      && Number.isSafeInteger(Number(characterCostHeader))
      ? Number(characterCostHeader)
      : null;
    const format = mediaDescription(spec.outputFormat);
    const base = [
      "providers",
      "elevenlabs",
      request.job.id,
      request.submissionKey.slice(0, 24),
    ];

    try {
      const audioOutput = await writeRunArtifact({
        resolveRunDirectory: runDirectoryResolver,
        request,
        relativePath: safeArtifactPath(...base, `voice.${format.extension}`),
        contents: audio,
        role: "voice_media",
        mediaType: format.mediaType,
      });
      const timingDocument = {
        schemaVersion: 1,
        provider: "elevenlabs",
        requestFingerprint: spec.requestFingerprint,
        alignment: {
          characters: alignment.characters,
          characterStartTimesSeconds: alignment.character_start_times_seconds,
          characterEndTimesSeconds: alignment.character_end_times_seconds,
        },
        normalizedAlignment: normalizedAlignment && {
          characters: normalizedAlignment.characters,
          characterStartTimesSeconds: normalizedAlignment.character_start_times_seconds,
          characterEndTimesSeconds: normalizedAlignment.character_end_times_seconds,
        },
        words: wordsFromAlignment(normalizedAlignment || alignment),
      };
      const timingsOutput = await writeRunArtifact({
        resolveRunDirectory: runDirectoryResolver,
        request,
        relativePath: safeArtifactPath(...base, "word-timings.json"),
        contents: jsonArtifactBytes(timingDocument),
        role: "word_timings",
        mediaType: "application/json",
      });
      const performanceDocument = {
        schemaVersion: 1,
        provider: "elevenlabs",
        operation: "text_to_speech_with_timestamps",
        requestFingerprint: spec.requestFingerprint,
        actionHash: spec.actionHash,
        outputFormat: spec.outputFormat,
        textSha256: stableSha256({ text: spec.body.text }),
        requestId,
        traceId,
        characterCost,
        audio: {
          relativePath: audioOutput.relativePath,
          sha256: audioOutput.sha256,
          bytes: audioOutput.bytes,
          mediaType: audioOutput.mediaType,
        },
        timings: {
          relativePath: timingsOutput.relativePath,
          sha256: timingsOutput.sha256,
          bytes: timingsOutput.bytes,
          characters: alignment.characters.length,
          words: timingDocument.words.length,
        },
      };
      const performanceOutput = await writeRunArtifact({
        resolveRunDirectory: runDirectoryResolver,
        request,
        relativePath: safeArtifactPath(...base, "voice-performance-map.json"),
        contents: jsonArtifactBytes(performanceDocument),
        role: "voice_performance_map",
        mediaType: "application/json",
      });
      const result = {
        status: "succeeded",
        externalId: requestId || `elevenlabs:${spec.requestFingerprint}`,
        outputs: [performanceOutput, audioOutput, timingsOutput],
      };
      observations.set(request.submissionKey, cloneJson(result));
      return result;
    } catch (cause) {
      throw ambiguousProviderError(
        "Timed speech may have been generated, but its run artifacts could not be committed.",
        "ELEVENLABS_ARTIFACT_COMMIT_AMBIGUOUS",
        { cause },
      );
    }
  }

  return Object.freeze({
    id: ELEVENLABS_TIMED_TTS_ADAPTER_ID,
    kind: "provider-api",
    submit,
    async reconcile(request) {
      assertExecutionRequest(request);
      assertAdapterRequestId(request, ELEVENLABS_TIMED_TTS_ADAPTER_ID);
      const observation = observations.get(request.submissionKey);
      if (observation) return cloneJson(observation);
      return {
        status: "unknown",
        externalId: request.externalId || null,
        reasonCode: "ELEVENLABS_RECONCILIATION_UNAVAILABLE",
      };
    },
  });
}
