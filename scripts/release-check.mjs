#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const REQUIRED_DEMOS = ["demos/cutsteward-product-walkthrough-30s.mp4"];
const REQUIRED_DEMO_SET = new Set(REQUIRED_DEMOS);
const REQUIRED_DEMO_SPECS = new Map([
  [REQUIRED_DEMOS[0], { durationSeconds: 30, width: 1920, height: 1080, frameRate: 30 }]
]);
const MAX_REGULAR_FILE_BYTES = 5 * 1024 * 1024;
const MAX_DEMO_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const BATCH_CONTENT_BUFFER_BYTES = MAX_TOTAL_BYTES + 2 * 1024 * 1024;
const REGULAR_FILE_MODES = new Set(["100644", "100755"]);
const MAX_MEDIA_TOOL_OUTPUT_BYTES = 1024 * 1024;
const RETIRED_ASSET_SHA256 = new Set([
  "669738d09d7669d47ac2215c523d61b67210c920253402fdb90802935c347ca9",
  "45406f6536d0804cc306cb3278ca6cf4ed449361815c7c3380987c4bfaf4edb3",
  "9b4b56e167b6e8553999c1baf8fbc7c8bb31b0d99c04e897acec339a8125597f",
  "dfec2a58a0b1e8f353e30b4b058fc4bc3e52078f0c4591580073cec5d19c896b",
  "ee16449e7bd610da693cc55a01893ebef5e6825c812252ce67fe9eb4def46749",
  "cbd109b0ce867b79c9fe984e607e11f23ebd4067f27623ee1e16555fe0794e9f",
  "395617227b492d0e465fab58acafbf37b06c3d48837e9561399d585ff09a6a1f",
  "b41a07aedfb78de6e2b12899fe49470220c6e2ac0412f9aa6817d75f53d1646a",
  "9610870a09774bff3ad2fc15716623f83d380139becc7cf4c12b697c27bacbef",
  "a8f87fcb6559c83958aa438ad9caf1af6db673f8777ea60d8b8261ca1e4b0a97",
  "0aa1e070f3826b10728da5f5a6ac9bc33cbd3e3507c30c5c49d5a07de48facfb",
  "7ffcc236c235fbf87b687f7aa90ee27eb1abdb1fabba52297c2ee6044a1b65fd"
]);
const ALLOWED_SECRET_FIXTURE_SHA256 = new Set([
  "24b10445095b299e57f231c64a747f01c3732cd34746eeef0e0e09c7f7e54505",
  "8bcb0278400b02fd94834db3b2bdf9b063ffe58b2bec0cf4da81b68e0f546809",
  "480399cc3331bc69326bbae9035c80227a2722fdf9fa1503df21d0a9f852c541",
  "6d618ce7795a80630cfa5fd5bb62471be48765e276d36b6ef1d2c26253890ff1"
]);

function runGit(rootDirectory, argumentsList, options = {}) {
  const result = spawnSync("git", argumentsList, {
    cwd: rootDirectory,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${argumentsList[0]} failed`);
  }
  return result.stdout;
}

function stagedEntries(rootDirectory) {
  const output = runGit(rootDirectory, ["ls-files", "--stage", "-z"]);
  return output
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const separator = record.indexOf("\t");
      const [mode, objectId, stageText] = record.slice(0, separator).split(" ");
      return {
        mode,
        objectId,
        stage: Number(stageText),
        path: record.slice(separator + 1)
      };
    });
}

function trackedIgnoredPaths(rootDirectory) {
  return runGit(rootDirectory, [
    "ls-files",
    "--cached",
    "--ignored",
    "--exclude-standard",
    "-z"
  ])
    .split("\0")
    .filter(Boolean);
}

function indexObjectMetadata(rootDirectory, entries) {
  const objectIds = [...new Set(entries.map((entry) => entry.objectId))];
  if (objectIds.length === 0) return new Map();
  const output = runGit(
    rootDirectory,
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    { input: `${objectIds.join("\n")}\n` }
  );
  const metadata = new Map();
  for (const line of output.trim().split("\n")) {
    const [objectId, type, sizeText] = line.split(" ");
    const size = Number(sizeText);
    if (!objectId || !type || !Number.isSafeInteger(size) || size < 0) {
      throw new Error("Git returned invalid object metadata");
    }
    metadata.set(objectId, { type, size });
  }
  if (metadata.size !== objectIds.length) {
    throw new Error("Git did not return every staged object");
  }
  return metadata;
}

function readIndexBlobs(rootDirectory, objectIds, metadata) {
  if (objectIds.length === 0) return new Map();
  const output = runGit(rootDirectory, ["cat-file", "--batch"], {
    encoding: null,
    input: Buffer.from(`${objectIds.join("\n")}\n`, "utf8"),
    maxBuffer: BATCH_CONTENT_BUFFER_BYTES
  });
  const blobs = new Map();
  let offset = 0;
  for (const requestedObjectId of objectIds) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd < 0) throw new Error("Git returned a truncated object header");
    const [objectId, type, sizeText] = output.subarray(offset, headerEnd).toString("ascii").split(" ");
    const size = Number(sizeText);
    const expected = metadata.get(requestedObjectId);
    if (
      objectId !== requestedObjectId ||
      type !== "blob" ||
      !expected ||
      size !== expected.size
    ) {
      throw new Error("Git returned unexpected staged object content");
    }
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (contentEnd >= output.length || output[contentEnd] !== 0x0a) {
      throw new Error("Git returned a truncated staged blob");
    }
    blobs.set(objectId, output.subarray(contentStart, contentEnd));
    offset = contentEnd + 1;
  }
  return blobs;
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function localLinkFinding(sourcePath, source, target, index, trackedPaths) {
  let candidate = target.trim();
  if (candidate.startsWith("<") && candidate.endsWith(">")) {
    candidate = candidate.slice(1, -1);
  }
  candidate = candidate.split(/\s+["']/)[0];
  if (!candidate || candidate.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    return null;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(candidate.split(/[?#]/)[0]);
  } catch {
    decoded = candidate.split(/[?#]/)[0];
  }
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(sourcePath), decoded)
  );
  const isTracked =
    trackedPaths.has(resolved) ||
    [...trackedPaths].some((trackedPath) => trackedPath.startsWith(`${resolved}/`));
  if (isTracked) return null;
  return `[link] ${sourcePath}:${lineNumberAt(source, index)} local target is not tracked`;
}

function markdownLinkFindings(sourcePath, source, trackedPaths) {
  const findings = [];
  const patterns = [
    /!?\[[^\]]*\]\(([^)]+)\)/g,
    /^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const target = match[1] || match[2];
      const finding = localLinkFinding(sourcePath, source, target, match.index, trackedPaths);
      if (finding) findings.push(finding);
    }
  }
  return findings;
}

const SECRET_PATTERNS = [
  {
    id: "private-key",
    expression: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g
  },
  {
    id: "github-token",
    expression: /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,})\b/g
  },
  { id: "google-api-key", expression: /\bAIza[A-Za-z0-9_-]{30,}\b/g },
  { id: "provider-key", expression: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { id: "slack-token", expression: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { id: "aws-access-key", expression: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: "bearer-token", expression: /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}\b/g }
];

const USER_PATH_PATTERNS = [
  /(?:file:\/\/)?\/(?:Users|home)\/[^/\s"'`<>]+(?:\/|$)/g,
  /\b[A-Za-z]:\\Users\\[^\\\r\n"'`<>]+\\/g
];

const SECRET_ASSIGNMENT_PATTERNS = [
  {
    id: "environment-secret",
    expression:
      /\b[A-Z][A-Z0-9_]*(?:API_?KEY|ACCESS_?TOKEN|REFRESH_?TOKEN|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_?KEY)\s*=\s*(["']?)([A-Za-z0-9_./+=-]{16,})\1/g,
    valueIndex: 2
  },
  {
    id: "structured-secret",
    expression:
      /["'](?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passwd|private[_-]?key)["']\s*:\s*["']([^"']{12,})["']/gi,
    valueIndex: 1
  }
];

const PROVIDER_RECORD_ID_PATTERNS = [
  {
    id: "provider-record-id",
    expression:
      /\b(?:provider[\s_-]*)?(?:record|request|generation|history(?:[\s_-]*item)?|job)[\s_-]*id["']?\s*[:=]\s*["']?([A-Za-z0-9][A-Za-z0-9._:-]{11,})/gi
  }
];

function isAllowedSecretFixture(value) {
  const digest = createHash("sha256").update(value).digest("hex");
  return ALLOWED_SECRET_FIXTURE_SHA256.has(digest);
}

function looksLikeText(bytes) {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function sensitiveTextFindings(sourcePath, source) {
  const findings = [];
  for (const { id, expression } of SECRET_PATTERNS) {
    for (const match of source.matchAll(expression)) {
      if (isAllowedSecretFixture(match[0])) continue;
      findings.push(
        `[secret] ${sourcePath}:${lineNumberAt(source, match.index)} credential pattern detected (${id})`
      );
    }
  }
  for (const { id, expression, valueIndex } of SECRET_ASSIGNMENT_PATTERNS) {
    for (const match of source.matchAll(expression)) {
      if (isAllowedSecretFixture(match[valueIndex])) continue;
      findings.push(
        `[secret] ${sourcePath}:${lineNumberAt(source, match.index)} credential assignment detected (${id})`
      );
    }
  }
  for (const expression of USER_PATH_PATTERNS) {
    for (const match of source.matchAll(expression)) {
      findings.push(
        `[path] ${sourcePath}:${lineNumberAt(source, match.index)} absolute user-home path detected`
      );
    }
  }
  return findings;
}

function sensitiveBinaryStringFindings(sourcePath, source) {
  const findings = [];
  for (const { id, expression } of SECRET_PATTERNS) {
    for (const match of source.matchAll(expression)) {
      if (isAllowedSecretFixture(match[0])) continue;
      findings.push(
        `[metadata-secret] ${sourcePath} binary metadata contains a credential pattern (${id})`
      );
    }
  }
  for (const { id, expression, valueIndex } of SECRET_ASSIGNMENT_PATTERNS) {
    for (const match of source.matchAll(expression)) {
      if (isAllowedSecretFixture(match[valueIndex])) continue;
      findings.push(
        `[metadata-secret] ${sourcePath} binary metadata contains a credential assignment (${id})`
      );
    }
  }
  for (const expression of USER_PATH_PATTERNS) {
    if (expression.test(source)) {
      findings.push(
        `[metadata-path] ${sourcePath} binary metadata contains an absolute user-home path`
      );
    }
    expression.lastIndex = 0;
  }
  for (const { id, expression } of PROVIDER_RECORD_ID_PATTERNS) {
    if (expression.test(source)) {
      findings.push(
        `[metadata-id] ${sourcePath} binary metadata contains a private provider record identifier (${id})`
      );
    }
    expression.lastIndex = 0;
  }
  return findings;
}

function* utf16AsciiMetadataStrings(binarySource) {
  const encodings = [
    { expression: /(?:[\x20-\x7e]\x00){8,}/g, characterOffset: 0 },
    { expression: /(?:\x00[\x20-\x7e]){8,}/g, characterOffset: 1 }
  ];
  for (const { expression, characterOffset } of encodings) {
    for (const match of binarySource.matchAll(expression)) {
      let decoded = "";
      for (let index = characterOffset; index < match[0].length; index += 2) {
        decoded += match[0][index];
      }
      yield decoded;
    }
  }
}

function binaryMetadataFindings(sourcePath, bytes) {
  const binarySource = bytes.toString("latin1");
  const findings = new Set(sensitiveBinaryStringFindings(sourcePath, binarySource));
  for (const decoded of utf16AsciiMetadataStrings(binarySource)) {
    for (const finding of sensitiveBinaryStringFindings(sourcePath, decoded)) {
      findings.add(finding);
    }
  }
  return [...findings];
}

function hasMp4FileTypeBox(bytes) {
  return bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp";
}

function projectBinary(packageName) {
  try {
    const exported = require(packageName);
    const candidate = typeof exported === "string" ? exported : exported?.path;
    if (typeof candidate !== "string" || !path.isAbsolute(candidate)) return null;
    accessSync(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

function projectMediaBinaries() {
  return {
    ffmpeg: projectBinary("ffmpeg-static"),
    ffprobe: projectBinary("@derhuerst/ffprobe-static")
  };
}

function runMediaCommand(command, argumentsList, timeout) {
  return spawnSync(command, argumentsList, {
    encoding: "utf8",
    maxBuffer: MAX_MEDIA_TOOL_OUTPUT_BYTES,
    shell: false,
    timeout,
    windowsHide: true,
    env: { ...process.env, NO_COLOR: "1" }
  });
}

function inspectMedia(bytes, binaries) {
  const directory = mkdtempSync(path.join(tmpdir(), "cutsteward-release-media-"));
  const mediaPath = path.join(directory, "staged-demo.mp4");
  try {
    writeFileSync(mediaPath, bytes, { flag: "wx" });
    const probe = runMediaCommand(
      binaries.ffprobe,
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", mediaPath],
      30_000
    );
    if (probe.error || probe.status !== 0) return { decodable: false, metadata: null };
    let metadata;
    try {
      metadata = JSON.parse(probe.stdout);
    } catch {
      return { decodable: false, metadata: null };
    }
    const decode = runMediaCommand(
      binaries.ffmpeg,
      [
        "-nostdin",
        "-v", "error",
        "-xerror",
        "-err_detect", "explode",
        "-i", mediaPath,
        "-map", "0:v?",
        "-map", "0:a?",
        "-f", "null",
        process.platform === "win32" ? "NUL" : "/dev/null"
      ],
      120_000
    );
    return {
      decodable: !decode.error && decode.status === 0,
      metadata
    };
  } catch {
    return { decodable: false, metadata: null };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function hasExactDuration(metadata, expectedSeconds) {
  const duration = Number(metadata?.format?.duration);
  return Number.isFinite(duration) && Math.abs(duration - expectedSeconds) <= 0.0005;
}

function primaryVideoStream(metadata) {
  const streams = Array.isArray(metadata?.streams) ? metadata.streams : [];
  return streams.find((stream) => stream?.codec_type === "video") || null;
}

function hasExpectedDimensions(metadata, width, height) {
  const stream = primaryVideoStream(metadata);
  return stream?.width === width && stream?.height === height;
}

function isExactFrameRate(value, expectedFrameRate) {
  if (typeof value !== "string") return false;
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match) return false;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  return (
    Number.isSafeInteger(numerator) &&
    Number.isSafeInteger(denominator) &&
    denominator > 0 &&
    numerator === expectedFrameRate * denominator
  );
}

function hasExpectedFrameRate(metadata, spec) {
  const stream = primaryVideoStream(metadata);
  return Boolean(
    stream &&
    isExactFrameRate(stream.r_frame_rate, spec.frameRate) &&
    isExactFrameRate(stream.avg_frame_rate, spec.frameRate)
  );
}

function hasAudioStream(metadata) {
  const streams = Array.isArray(metadata?.streams) ? metadata.streams : [];
  return streams.some((stream) => stream?.codec_type === "audio");
}

function deniedAssetHashes() {
  const hashes = new Set(RETIRED_ASSET_SHA256);
  for (const candidate of (process.env.RELEASE_CHECK_EXTRA_DENIED_SHA256 || "").split(/[\s,]+/)) {
    if (/^[a-f0-9]{64}$/i.test(candidate)) hashes.add(candidate.toLowerCase());
  }
  return hashes;
}

function isForbiddenCredentialPath(candidatePath) {
  const basename = path.posix.basename(candidatePath).toLowerCase();
  if (basename === ".env.example") return false;
  if (basename === ".env" || basename.startsWith(".env.")) return true;
  if (new Set([".npmrc", ".pypirc", "credentials.json", "service-account.json"]).has(basename)) {
    return true;
  }
  if (/^id_(?:rsa|dsa|ecdsa|ed25519)$/.test(basename)) return true;
  return /\.(?:pem|key|p12|pfx|jks|keystore)$/.test(basename);
}

function main() {
  try {
    const rootDirectory = runGit(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
    const entries = stagedEntries(rootDirectory);
    const stagedFiles = entries.filter((entry) => entry.stage === 0);
    const objectMetadata = indexObjectMetadata(rootDirectory, stagedFiles);
    const paths = new Set(stagedFiles.map((entry) => entry.path));
    const deniedHashes = deniedAssetHashes();
    const findings = REQUIRED_DEMOS.filter((requiredPath) => !paths.has(requiredPath)).map(
      (requiredPath) => `[required] missing tracked file: ${requiredPath}`
    );
    for (const ignoredPath of trackedIgnoredPaths(rootDirectory)) {
      findings.push(`[ignored] ${ignoredPath} is tracked despite an ignore rule`);
    }
    for (const entry of stagedFiles) {
      if (isForbiddenCredentialPath(entry.path)) {
        findings.push(`[secret-file] ${entry.path} is a forbidden credential path`);
      }
      if (entry.mode === "120000") {
        findings.push(`[symlink] ${entry.path} is a tracked symbolic link`);
      } else if (!REGULAR_FILE_MODES.has(entry.mode)) {
        findings.push(`[index] ${entry.path} is not a regular tracked file`);
      }
    }
    for (const entry of entries.filter((candidate) => candidate.stage !== 0)) {
      findings.push(`[index] ${entry.path} has an unresolved merge stage`);
    }
    let totalBytes = 0;
    const readableObjectIds = new Set();
    for (const entry of stagedFiles) {
      const metadata = objectMetadata.get(entry.objectId);
      if (!metadata || metadata.type !== "blob") {
        findings.push(`[index] ${entry.path} does not reference a Git blob`);
        continue;
      }
      const { size } = metadata;
      totalBytes += size;
      const maximum = REQUIRED_DEMO_SET.has(entry.path)
        ? MAX_DEMO_FILE_BYTES
        : MAX_REGULAR_FILE_BYTES;
      if (size > maximum) {
        findings.push(
          `[size] ${entry.path} is ${size} bytes; maximum is ${maximum} bytes`
        );
        continue;
      }
      if (REGULAR_FILE_MODES.has(entry.mode)) readableObjectIds.add(entry.objectId);
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      findings.push(
        `[size] tracked files total ${totalBytes} bytes; maximum is ${MAX_TOTAL_BYTES} bytes`
      );
    }
    const stagedBlobs =
      totalBytes <= MAX_TOTAL_BYTES
        ? readIndexBlobs(rootDirectory, [...readableObjectIds], objectMetadata)
        : new Map();
    let mediaBinaries;
    for (const entry of stagedFiles) {
      const bytes = stagedBlobs.get(entry.objectId);
      if (!bytes) continue;
      const contentSha256 = createHash("sha256").update(bytes).digest("hex");
      if (deniedHashes.has(contentSha256)) {
        findings.push(`[asset] ${entry.path} matches a retired or blocked asset`);
      }
      if (REQUIRED_DEMO_SET.has(entry.path) && !hasMp4FileTypeBox(bytes)) {
        findings.push(`[mp4] ${entry.path} does not start with an MP4 ftyp box`);
      }
      if (REQUIRED_DEMO_SET.has(entry.path) && hasMp4FileTypeBox(bytes)) {
        mediaBinaries ||= projectMediaBinaries();
        if (!mediaBinaries.ffmpeg || !mediaBinaries.ffprobe) {
          findings.push(
            `[media-tool] ${entry.path} cannot be verified because project-local media tools are unavailable`
          );
        } else {
          const inspection = inspectMedia(bytes, mediaBinaries);
          if (!inspection.decodable) {
            findings.push(`[media] ${entry.path} is not decodable media`);
          } else {
            const spec = REQUIRED_DEMO_SPECS.get(entry.path);
            if (!hasExactDuration(inspection.metadata, spec.durationSeconds)) {
              findings.push(
                `[media-spec] ${entry.path} must be exactly ${spec.durationSeconds.toFixed(3)} seconds`
              );
            }
            if (!hasExpectedDimensions(inspection.metadata, spec.width, spec.height)) {
              findings.push(
                `[media-spec] ${entry.path} must be ${spec.width}x${spec.height}`
              );
            }
            if (!hasExpectedFrameRate(inspection.metadata, spec)) {
              findings.push(
                `[media-spec] ${entry.path} must be exactly ${spec.frameRate}fps`
              );
            }
            if (!hasAudioStream(inspection.metadata)) {
              findings.push(
                `[media-spec] ${entry.path} must contain an audio stream`
              );
            }
          }
        }
      }
      if (!looksLikeText(bytes)) {
        findings.push(...binaryMetadataFindings(entry.path, bytes));
        continue;
      }
      const source = bytes.toString("utf8");
      findings.push(...sensitiveTextFindings(entry.path, source));
      if (entry.path.toLowerCase().endsWith(".md")) {
        findings.push(...markdownLinkFindings(entry.path, source, paths));
      }
    }
    if (findings.length > 0) {
      console.error(`Release check failed with ${findings.length} issue(s):`);
      for (const finding of findings) console.error(`- ${finding}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Release check passed: ${paths.size} tracked files, ${totalBytes} bytes.`);
  } catch {
    console.error("Release check failed: run it inside an initialized Git worktree.");
    process.exitCode = 1;
  }
}

main();
