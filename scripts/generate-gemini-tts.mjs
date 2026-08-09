#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  open,
  readFile,
  realpath,
  statfs,
  unlink
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-3.1-flash-tts-preview";
const DEFAULT_VOICE = "Iapetus";
const SAMPLE_RATE = 24_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const MAX_ATTEMPTS = 3;
const AUDIO_TOKENS_PER_SECOND = 25;
const PRICING_SOURCE = "https://ai.google.dev/gemini-api/docs/pricing";
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, "..");
const VIDEO_DIRECTORY = path.join(PROJECT_DIRECTORY, "videos");
const DEMO_DIRECTORY = path.join(PROJECT_DIRECTORY, "demos");

function fail(message) {
  throw new Error(`Gemini TTS: ${message}`);
}

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function containedPath(candidate, label, allowedRoots) {
  const resolved = path.resolve(candidate);
  const allowed = allowedRoots.some((root) => resolved.startsWith(`${root}${path.sep}`));
  if (!allowed) {
    fail(`${label} must stay inside an approved videos/ or demos/ project directory`);
  }
  return resolved;
}

function isInside(candidate, root) {
  return candidate.startsWith(`${root}${path.sep}`);
}

async function canonicalInputPath(candidate) {
  const lexicalPath = containedPath(candidate, "--input", [VIDEO_DIRECTORY]);
  const lexicalStat = await lstat(lexicalPath);
  if (lexicalStat.isSymbolicLink() || !lexicalStat.isFile()) {
    fail("--input must be a regular, non-symlink file");
  }
  const [canonicalPath, canonicalVideoRoot] = await Promise.all([
    realpath(lexicalPath),
    realpath(VIDEO_DIRECTORY)
  ]);
  if (!isInside(canonicalPath, canonicalVideoRoot)) {
    fail("--input resolves outside the videos/ directory");
  }
  return canonicalPath;
}

async function reserveOutput(candidate, label, allowedRoots) {
  const lexicalPath = containedPath(candidate, label, allowedRoots);
  const lexicalParent = path.dirname(lexicalPath);
  const parentStat = await lstat(lexicalParent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    fail(`${label} parent must be an existing, non-symlink directory`);
  }
  const [canonicalParent, canonicalRoots] = await Promise.all([
    realpath(lexicalParent),
    Promise.all(allowedRoots.map((root) => realpath(root)))
  ]);
  if (canonicalParent !== lexicalParent) {
    fail(`${label} parent must not traverse a symlink or junction`);
  }
  if (!canonicalRoots.some((root) => canonicalParent === root || isInside(canonicalParent, root))) {
    fail(`${label} parent resolves outside the approved media roots`);
  }
  const canonicalTarget = path.join(canonicalParent, path.basename(lexicalPath));
  try {
    await lstat(canonicalTarget);
    fail(`${label} already exists; move it aside or choose a new path`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const filesystem = await statfs(canonicalParent);
  const freeBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
  if (!Number.isFinite(freeBytes) || freeBytes < 64 * 1024 * 1024) {
    fail(`${label} filesystem needs at least 64 MiB free before a paid request`);
  }

  const temporaryPath = path.join(
    canonicalParent,
    `.${path.basename(canonicalTarget)}.pending-${process.pid}-${randomUUID()}`
  );
  const handle = await open(temporaryPath, "wx", 0o600);
  await handle.writeFile(Buffer.alloc(4096));
  await handle.truncate(0);
  await handle.sync();
  return { targetPath: canonicalTarget, temporaryPath, handle };
}

function pcmToWave(pcm) {
  const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
  const byteRate = SAMPLE_RATE * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function requestAudio({ apiKey, model, voice, prompt, maxOutputTokens }) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        model,
        input: prompt,
        response_format: { type: "audio" },
        generation_config: {
          max_output_tokens: maxOutputTokens,
          // Gemini TTS detects the English prompt language. Keep the request
          // schema to the documented single-speaker fields instead of sending
          // an unsupported language hint.
          speech_config: [{ voice }]
        },
        store: false
      })
    });

    if (response.ok) {
      const payload = await response.json();
      const encoded = payload?.output_audio?.data;
      if (typeof encoded !== "string" || encoded.length === 0) {
        throw new Error("provider returned no audio payload");
      }
      return {
        pcm: Buffer.from(encoded, "base64"),
        usage: payload?.usage ?? payload?.usage_metadata ?? null,
        attemptCount: attempt
      };
    }

    await response.body?.cancel().catch(() => {});
    lastError = new Error(`HTTP ${response.status}; provider response body omitted`);
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_ATTEMPTS) break;
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  throw lastError || new Error("request failed");
}

async function main() {
  const inputArgument = argument("input");
  const outputArgument = argument("output");
  if (!inputArgument) fail("--input is required");
  if (!outputArgument) fail("--output is required");

  const inputPath = await canonicalInputPath(inputArgument);
  const lexicalOutputPath = containedPath(outputArgument, "--output", [
    VIDEO_DIRECTORY,
    DEMO_DIRECTORY
  ]);
  const lexicalReceiptPath = containedPath(
    argument("receipt", `${lexicalOutputPath}.receipt.json`),
    "--receipt",
    [VIDEO_DIRECTORY, DEMO_DIRECTORY]
  );
  if (new Set([inputPath, lexicalOutputPath, lexicalReceiptPath]).size !== 3) {
    fail("--input, --output, and --receipt must resolve to three different files");
  }

  const model = argument("model", DEFAULT_MODEL);
  if (model !== DEFAULT_MODEL) {
    fail(`this bounded helper is price-locked to ${DEFAULT_MODEL}`);
  }
  const voice = argument("voice", DEFAULT_VOICE);
  const language = argument("language", "en");
  const approvedMaxUsd = Number(argument("approved-max-usd", "0"));
  const inputPriceArgument = argument("input-usd-per-million-tokens");
  const audioPriceArgument = argument("audio-usd-per-million-tokens");
  const pricingCheckedAt = argument("pricing-checked-at");
  if (!inputPriceArgument || !audioPriceArgument || !pricingCheckedAt) {
    fail(
      "re-check the official price and pass --pricing-checked-at, " +
        "--input-usd-per-million-tokens, and --audio-usd-per-million-tokens"
    );
  }
  const inputUsdPerMillionTokens = Number(inputPriceArgument);
  const audioUsdPerMillionTokens = Number(audioPriceArgument);
  if (!Number.isFinite(approvedMaxUsd) || approvedMaxUsd <= 0) {
    fail("set a positive --approved-max-usd after the user approves the local estimate ceiling");
  }
  if (!Number.isFinite(inputUsdPerMillionTokens) || inputUsdPerMillionTokens <= 0) {
    fail("--input-usd-per-million-tokens must be positive");
  }
  if (!Number.isFinite(audioUsdPerMillionTokens) || audioUsdPerMillionTokens <= 0) {
    fail("--audio-usd-per-million-tokens must be positive");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pricingCheckedAt)) {
    fail("--pricing-checked-at must use YYYY-MM-DD");
  }
  const pricingAgeDays =
    (Date.now() - Date.parse(`${pricingCheckedAt}T00:00:00Z`)) / (24 * 60 * 60 * 1000);
  if (!Number.isFinite(pricingAgeDays) || pricingAgeDays < -1 || pricingAgeDays > 7) {
    fail("official pricing confirmation must be no more than seven days old");
  }

  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    fail("set GOOGLE_API_KEY or GEMINI_API_KEY locally; never pass a key on the command line");
  }
  const prompt = await readFile(inputPath, "utf8");
  if (!prompt.trim()) fail("input prompt is empty");

  // One UTF-8 byte per input token is deliberately conservative. This is a
  // local estimate using freshly caller-confirmed prices, not a provider-side
  // billing cap. Failed-request billing must still be verified in the provider
  // dashboard.
  const conservativeInputTokens = Buffer.byteLength(prompt, "utf8");
  const perAttemptUsd = approvedMaxUsd / MAX_ATTEMPTS;
  const inputCostBoundPerAttempt =
    (conservativeInputTokens * inputUsdPerMillionTokens) / 1_000_000;
  const outputBudgetPerAttempt = perAttemptUsd - inputCostBoundPerAttempt;
  const maxOutputTokens = Math.floor(
    (outputBudgetPerAttempt * 1_000_000) / audioUsdPerMillionTokens
  );
  if (maxOutputTokens < 64) {
    fail("approved ceiling is too small for a useful bounded TTS response at the supplied prices");
  }
  const preflightEstimatedWorstCaseUsd = MAX_ATTEMPTS * (
    inputCostBoundPerAttempt +
    (maxOutputTokens * audioUsdPerMillionTokens) / 1_000_000
  );
  if (preflightEstimatedWorstCaseUsd > approvedMaxUsd + Number.EPSILON) {
    fail("internal spend-envelope calculation exceeded the approved local estimate");
  }

  let outputReservation;
  let receiptReservation;
  let finalOutputHandle;
  let finalReceiptHandle;
  let createdFinalOutput = false;
  let createdFinalReceipt = false;
  try {
    outputReservation = await reserveOutput(lexicalOutputPath, "--output", [
      VIDEO_DIRECTORY,
      DEMO_DIRECTORY
    ]);
    receiptReservation = await reserveOutput(lexicalReceiptPath, "--receipt", [
      VIDEO_DIRECTORY,
      DEMO_DIRECTORY
    ]);

    const { pcm, usage, attemptCount } = await requestAudio({
      apiKey,
      model,
      voice,
      prompt,
      maxOutputTokens
    });
    if (pcm.length < SAMPLE_RATE * 2 * 0.25) {
      fail("returned audio is unexpectedly short");
    }

    const wave = pcmToWave(pcm);
    const durationSeconds = pcm.length / (SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8));
    const durationImpliedAudioTokens = Math.ceil(durationSeconds * AUDIO_TOKENS_PER_SECOND);
    const durationImpliedEstimatedCostUsd =
      (attemptCount * conservativeInputTokens * inputUsdPerMillionTokens +
        durationImpliedAudioTokens * audioUsdPerMillionTokens) /
      1_000_000;
    const receipt = {
      schemaVersion: 1,
      provider: "google-gemini-api",
      model,
      voice,
      language,
      inputPromptSha256: sha256(prompt),
      outputSha256: sha256(wave),
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: BITS_PER_SAMPLE,
      durationSeconds,
      approvedMaxUsd,
      localCostEstimateOnly: true,
      providerBillingCapEnforced: false,
      actualProviderCostUsd: null,
      billingDashboardVerificationRequired: true,
      pricing: {
        checkedAt: pricingCheckedAt,
        source: PRICING_SOURCE,
        inputUsdPerMillionTokens,
        audioUsdPerMillionTokens,
        audioTokensPerSecond: AUDIO_TOKENS_PER_SECOND
      },
      conservativeInputTokens,
      maxOutputTokensPerAttempt: maxOutputTokens,
      preflightEstimatedWorstCaseUsd,
      durationImpliedAudioTokens,
      durationImpliedEstimatedCostUsd,
      providerUsage: usage,
      attemptsBound: MAX_ATTEMPTS,
      actualAttemptCount: attemptCount,
      providerStorageRequested: false,
      generatedAt: new Date().toISOString(),
      provenanceDisclosure: "AI-generated voice using Google Gemini TTS Preview"
    };

    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    try {
      finalOutputHandle = await open(outputReservation.targetPath, "wx", 0o600);
      createdFinalOutput = true;
      finalReceiptHandle = await open(receiptReservation.targetPath, "wx", 0o600);
      createdFinalReceipt = true;
      await Promise.all([
        finalOutputHandle.writeFile(wave),
        finalReceiptHandle.writeFile(receiptBytes)
      ]);
      await Promise.all([finalOutputHandle.sync(), finalReceiptHandle.sync()]);
    } catch (error) {
      await finalOutputHandle?.close().catch(() => {});
      await finalReceiptHandle?.close().catch(() => {});
      finalOutputHandle = undefined;
      finalReceiptHandle = undefined;
      if (createdFinalOutput) await unlink(outputReservation.targetPath).catch(() => {});
      if (createdFinalReceipt) await unlink(receiptReservation.targetPath).catch(() => {});
      throw error;
    }

    await Promise.all([finalOutputHandle.close(), finalReceiptHandle.close()]);
    finalOutputHandle = undefined;
    finalReceiptHandle = undefined;

    console.log(
      `Gemini TTS wrote ${outputReservation.targetPath} ` +
        `(${durationSeconds.toFixed(3)}s, ${voice}, ${model})`
    );
    console.log(`Receipt: ${receiptReservation.targetPath}`);
  } finally {
    await finalOutputHandle?.close().catch(() => {});
    await finalReceiptHandle?.close().catch(() => {});
    await outputReservation?.handle.close().catch(() => {});
    await receiptReservation?.handle.close().catch(() => {});
    if (outputReservation) await unlink(outputReservation.temporaryPath).catch(() => {});
    if (receiptReservation) await unlink(receiptReservation.temporaryPath).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
