import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertSupportedPlatform, isSupportedPlatform } from "../server/platform-support.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const BLENDER_ADAPTER_ID = "blender.local_compositor";
export const BLENDER_ADAPTER_VERSION = "1.0";
export const DEVICE_STAGE_SCHEMA_VERSION = 1;
export const TRUSTED_DRIVER = path.join(ROOT, "toolchain", "blender", "device_stage.py");
export const DEVICE_STAGE_CAPABILITIES = Object.freeze([
  "device-mockup",
  "camera-lighting",
  "screen-image-texture",
  "screen-video-texture",
  "screen-replacement",
  "rgba-frame-sequence",
  "background-render",
  "python-automation"
]);
export const DEVICE_STAGE_LIMITS = Object.freeze({
  minimumDimension: 64,
  maximumDimension: 7680,
  maximumPixels: 33_177_600,
  minimumFps: 1,
  maximumFps: 60,
  maximumFrames: 1_800,
  minimumTimeoutMs: 5_000,
  maximumTimeoutMs: 30 * 60 * 1_000,
  maximumSamples: 256,
  maximumJobBytes: 256 * 1024,
  maximumInputBytes: 512 * 1024 * 1024,
  maximumManifestBytes: 8 * 1024 * 1024
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"]);
const SAFE_ENVIRONMENT_NAMES = Object.freeze([
  "PATH",
  "SystemRoot",
  "WINDIR",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE"
]);

function fail(message) {
  throw new Error(`Blender device stage: ${message}`);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
}

function assertExactKeys(value, allowed, label) {
  assertPlainObject(value, label);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${label}.${key} is not admitted by the device-stage contract.`);
  }
}

function assertInteger(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
}

function normalizeSha256(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value.toLowerCase())) {
    fail(`${label} must be an expected SHA-256 digest.`);
  }
  return value.toLowerCase();
}

function assertPortablePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail(`${label} must be a non-empty local path.`);
  }
  return value;
}

function assertPreset(value, admitted, label, fallback) {
  const selected = value === undefined ? fallback : value;
  if (!admitted.includes(selected)) fail(`${label} must be one of: ${admitted.join(", ")}.`);
  return selected;
}

function ensureContained(root, candidate, label, { allowRoot = false } = {}) {
  const relative = path.relative(root, candidate);
  if ((!allowRoot && relative === "") || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${label} escapes the absolute project root.`);
  }
  return candidate;
}

export function isContainedPath(root, candidate, options) {
  try {
    ensureContained(path.resolve(root), path.resolve(candidate), "path", options);
    return true;
  } catch {
    return false;
  }
}

function resolveProjectPath(root, value, label, options) {
  assertPortablePath(value, label);
  const resolved = path.isAbsolute(value) ? path.normalize(value) : path.resolve(root, value);
  return ensureContained(root, resolved, label, options);
}

async function assertNoSymlinkComponents(rootReal, candidate, label, { allowMissingTail = false } = {}) {
  const relative = path.relative(rootReal, candidate);
  if (relative === "") return;
  let current = rootReal;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink()) fail(`${label} contains a symbolic link.`);
    } catch (error) {
      if (allowMissingTail && error?.code === "ENOENT") return;
      throw error;
    }
  }
}

async function validateAbsoluteRoot(projectRoot) {
  if (typeof projectRoot !== "string" || !path.isAbsolute(projectRoot)) {
    fail("projectRoot must be an absolute path.");
  }
  const normalized = path.normalize(projectRoot);
  const details = await lstat(normalized);
  if (details.isSymbolicLink()) fail("projectRoot must not be a symbolic link.");
  if (!details.isDirectory()) fail("projectRoot must be a directory.");
  const rootReal = await realpath(normalized);
  return path.normalize(rootReal);
}

async function validateExistingFile(rootReal, value, label, extensions) {
  const lexical = resolveProjectPath(rootReal, value, label);
  await assertNoSymlinkComponents(rootReal, lexical, label);
  const details = await lstat(lexical);
  if (details.isSymbolicLink()) fail(`${label} must not be a symbolic link.`);
  if (!details.isFile()) fail(`${label} must be a regular file.`);
  if (details.size > DEVICE_STAGE_LIMITS.maximumInputBytes) {
    fail(`${label} exceeds the ${DEVICE_STAGE_LIMITS.maximumInputBytes}-byte input bound.`);
  }
  if (extensions && !extensions.has(path.extname(lexical).toLowerCase())) {
    fail(`${label} must be a supported image file.`);
  }
  const actual = await realpath(lexical);
  ensureContained(rootReal, actual, label);
  return actual;
}

async function prepareOutputDirectory(rootReal, value) {
  const lexical = resolveProjectPath(rootReal, value, "output.directory");
  await assertNoSymlinkComponents(rootReal, lexical, "output.directory", { allowMissingTail: true });
  await mkdir(lexical, { recursive: true });
  await assertNoSymlinkComponents(rootReal, lexical, "output.directory");
  const details = await lstat(lexical);
  if (!details.isDirectory() || details.isSymbolicLink()) fail("output.directory must be a real directory.");
  const actual = await realpath(lexical);
  ensureContained(rootReal, actual, "output.directory");
  return actual;
}

export async function sha256File(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.once("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("end", () => resolve(hash.digest("hex")));
  });
}

export function validateJobDocument(document) {
  assertExactKeys(document, ["schemaVersion", "projectRoot", "jobId", "screen", "output", "render", "scene"], "job");
  if (document.schemaVersion !== DEVICE_STAGE_SCHEMA_VERSION) fail(`schemaVersion must be ${DEVICE_STAGE_SCHEMA_VERSION}.`);
  if (typeof document.projectRoot !== "string" || !path.isAbsolute(document.projectRoot)) {
    fail("projectRoot must be an absolute path.");
  }
  if (typeof document.jobId !== "string" || !JOB_ID_PATTERN.test(document.jobId)) {
    fail("jobId must contain only 1-64 portable identifier characters.");
  }

  assertExactKeys(document.render, ["width", "height", "fps", "startFrame", "endFrame", "timeoutMs", "samples"], "render");
  assertInteger(document.render.width, DEVICE_STAGE_LIMITS.minimumDimension, DEVICE_STAGE_LIMITS.maximumDimension, "render.width");
  assertInteger(document.render.height, DEVICE_STAGE_LIMITS.minimumDimension, DEVICE_STAGE_LIMITS.maximumDimension, "render.height");
  if (document.render.width * document.render.height > DEVICE_STAGE_LIMITS.maximumPixels) {
    fail(`render dimensions exceed the ${DEVICE_STAGE_LIMITS.maximumPixels}-pixel bound.`);
  }
  assertInteger(document.render.fps, DEVICE_STAGE_LIMITS.minimumFps, DEVICE_STAGE_LIMITS.maximumFps, "render.fps");
  assertInteger(document.render.startFrame, 1, 999_999, "render.startFrame");
  assertInteger(document.render.endFrame, document.render.startFrame, 999_999, "render.endFrame");
  const frameCount = document.render.endFrame - document.render.startFrame + 1;
  if (frameCount > DEVICE_STAGE_LIMITS.maximumFrames) fail(`render frame count exceeds ${DEVICE_STAGE_LIMITS.maximumFrames}.`);
  assertInteger(document.render.timeoutMs, DEVICE_STAGE_LIMITS.minimumTimeoutMs, DEVICE_STAGE_LIMITS.maximumTimeoutMs, "render.timeoutMs");
  const samples = document.render.samples ?? 32;
  assertInteger(samples, 1, DEVICE_STAGE_LIMITS.maximumSamples, "render.samples");

  assertExactKeys(document.output, ["directory"], "output");
  assertPortablePath(document.output.directory, "output.directory");

  assertPlainObject(document.screen, "screen");
  if (document.screen.kind === "image") {
    assertExactKeys(document.screen, ["kind", "path", "sha256"], "screen");
    assertPortablePath(document.screen.path, "screen.path");
    normalizeSha256(document.screen.sha256, "screen.sha256");
  } else if (document.screen.kind === "image-sequence") {
    assertExactKeys(document.screen, ["kind", "frames"], "screen");
    if (!Array.isArray(document.screen.frames) || document.screen.frames.length !== frameCount) {
      fail(`screen.frames must contain exactly ${frameCount} normalized frames.`);
    }
    document.screen.frames.forEach((frame, index) => {
      assertExactKeys(frame, ["path", "sha256"], `screen.frames[${index}]`);
      assertPortablePath(frame.path, `screen.frames[${index}].path`);
      if (path.extname(frame.path).toLowerCase() !== ".png") fail(`screen.frames[${index}].path must be a normalized PNG frame.`);
      normalizeSha256(frame.sha256, `screen.frames[${index}].sha256`);
    });
  } else {
    fail("screen.kind must be image or image-sequence.");
  }

  const scene = document.scene ?? {};
  assertExactKeys(scene, ["devicePreset", "cameraPreset", "cameraMotion", "lightingPreset", "screenFit"], "scene");
  return {
    ...document,
    screen: document.screen.kind === "image"
      ? { ...document.screen, sha256: document.screen.sha256.toLowerCase() }
      : { ...document.screen, frames: document.screen.frames.map((frame) => ({ ...frame, sha256: frame.sha256.toLowerCase() })) },
    render: { ...document.render, samples },
    scene: {
      devicePreset: assertPreset(scene.devicePreset, ["phone-rounded-v1"], "scene.devicePreset", "phone-rounded-v1"),
      cameraPreset: assertPreset(scene.cameraPreset, ["hero-front", "three-quarter-left", "three-quarter-right"], "scene.cameraPreset", "three-quarter-left"),
      cameraMotion: assertPreset(scene.cameraMotion, ["locked", "settle"], "scene.cameraMotion", "settle"),
      lightingPreset: assertPreset(scene.lightingPreset, ["soft-studio-v1"], "scene.lightingPreset", "soft-studio-v1"),
      screenFit: assertPreset(scene.screenFit, ["contain"], "scene.screenFit", "contain")
    }
  };
}

function inputEntries(job) {
  return job.screen.kind === "image"
    ? [{ label: "screen.path", path: job.screen.path, sha256: job.screen.sha256 }]
    : job.screen.frames.map((frame, index) => ({ label: `screen.frames[${index}].path`, path: frame.path, sha256: frame.sha256 }));
}

export async function loadAndValidateJob(jobPath) {
  if (typeof jobPath !== "string" || !path.isAbsolute(jobPath)) fail("--job must name an absolute JSON file.");
  const lexicalJob = path.normalize(jobPath);
  const before = await lstat(lexicalJob);
  if (before.isSymbolicLink()) fail("job file must not be a symbolic link.");
  if (!before.isFile()) fail("job file must be a regular file.");
  if (before.size > DEVICE_STAGE_LIMITS.maximumJobBytes) fail("job file is too large.");
  const raw = await readFile(lexicalJob);
  const after = await stat(lexicalJob);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail("job file changed while it was being read.");
  let document;
  try {
    document = JSON.parse(raw.toString("utf8"));
  } catch {
    fail("job file is not valid JSON.");
  }
  const normalized = validateJobDocument(document);
  const projectRootReal = await validateAbsoluteRoot(normalized.projectRoot);
  const jobRealPath = await realpath(lexicalJob);
  ensureContained(projectRootReal, jobRealPath, "job file");
  await assertNoSymlinkComponents(projectRootReal, jobRealPath, "job file");

  const resolvedInputs = [];
  for (const input of inputEntries(normalized)) {
    const inputRealPath = await validateExistingFile(projectRootReal, input.path, input.label, IMAGE_EXTENSIONS);
    const actualSha256 = await sha256File(inputRealPath);
    if (actualSha256 !== input.sha256) fail(`${input.label} SHA-256 does not match the expected digest.`);
    resolvedInputs.push({ ...input, realPath: inputRealPath, actualSha256 });
  }

  const outputDirectoryReal = await prepareOutputDirectory(projectRootReal, normalized.output.directory);
  const intendedPaths = [
    path.join(outputDirectoryReal, "DEVICE_STAGE_MANIFEST.json"),
    ...Array.from(
      { length: normalized.render.endFrame - normalized.render.startFrame + 1 },
      (_, index) => path.join(outputDirectoryReal, `frame_${String(normalized.render.startFrame + index).padStart(6, "0")}.png`)
    )
  ];
  for (const intended of intendedPaths) {
    try {
      await access(intended, constants.F_OK);
      fail(`output target already exists: ${path.basename(intended)}.`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  return {
    job: normalized,
    jobRealPath,
    jobSha256: createHash("sha256").update(raw).digest("hex"),
    projectRootReal,
    outputDirectoryReal,
    resolvedInputs
  };
}

export function buildBlenderArguments(jobRealPath, trustedDriver = TRUSTED_DRIVER) {
  if (!path.isAbsolute(jobRealPath)) fail("validated job path must be absolute.");
  if (!path.isAbsolute(trustedDriver)) fail("trusted driver path must be absolute.");
  return [
    "--background",
    "--factory-startup",
    "--disable-autoexec",
    "--python",
    trustedDriver,
    "--",
    "--job",
    jobRealPath
  ];
}

export function parseArguments(arguments_ = process.argv.slice(2)) {
  const [command = "doctor", ...rest] = arguments_;
  if (["describe", "doctor", "smoke"].includes(command)) {
    if (rest.length !== 0) fail(`${command} does not accept additional arguments.`);
    return { command };
  }
  if (command === "render") {
    if (rest.length !== 2 || rest[0] !== "--job" || !rest[1]) {
      fail("render accepts exactly --job <absolute-job.json>; .blend files and arbitrary Python are forbidden.");
    }
    if (/\.(?:blend|py)$/i.test(rest[1])) fail(".blend files and arbitrary Python are forbidden.");
    return { command, jobPath: rest[1] };
  }
  fail("usage: node scripts/blender.mjs <describe|doctor|render --job ABSOLUTE_JSON|smoke>.");
}

export function describeAdapter() {
  return {
    id: BLENDER_ADAPTER_ID,
    version: BLENDER_ADAPTER_VERSION,
    schemaVersion: DEVICE_STAGE_SCHEMA_VERSION,
    supportedPlatforms: ["darwin", "win32"],
    access: "local-cli",
    capabilities: DEVICE_STAGE_CAPABILITIES,
    safety: {
      startup: ["--background", "--factory-startup", "--disable-autoexec"],
      trustedDriver: "toolchain/blender/device_stage.py",
      acceptsBlendFiles: false,
      acceptsArbitraryPython: false,
      shell: false,
      screenPolicy: "supplied screenshot or normalized PNG sequence, SHA-256 bound, used as an unredrawn texture"
    },
    job: {
      paths: "projectRoot is absolute; job, inputs, and output are realpath-confined beneath it",
      screenKinds: ["image", "image-sequence"],
      output: "RGBA PNG sequence plus DEVICE_STAGE_MANIFEST.json",
      frameConvention: "inclusive startFrame/endFrame",
      limits: DEVICE_STAGE_LIMITS
    }
  };
}

function executableCandidates({ platform, environment }) {
  const pathImplementation = platform === "win32" ? path.win32 : path.posix;
  const delimiter = platform === "win32" ? ";" : ":";
  const executableName = platform === "win32" ? "blender.exe" : "blender";
  const fromPath = String(environment.PATH || "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => pathImplementation.join(directory, executableName));
  if (platform === "darwin") return ["/Applications/Blender.app/Contents/MacOS/Blender", ...fromPath];
  const programFiles = [environment.ProgramFiles, environment.PROGRAMFILES, environment["ProgramW6432"]].filter(Boolean);
  return [
    ...fromPath,
    ...programFiles.map((directory) => path.win32.join(directory, "Blender Foundation", "Blender", "blender.exe"))
  ];
}

function xmlPlistValue(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`<key>\\s*${escaped}\\s*</key>\\s*<string>([^<]+)</string>`, "i").exec(source);
  return match?.[1]?.trim() || null;
}

function plutilValue(plistPath, key) {
  const result = spawnSync("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", plistPath], {
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin" },
    maxBuffer: 64 * 1024,
    shell: false,
    timeout: 2_000,
    windowsHide: true
  });
  return result.status === 0 ? String(result.stdout || "").trim() || null : null;
}

async function readMacBundleMetadata(bundlePath) {
  const plistPath = path.join(bundlePath, "Contents", "Info.plist");
  let source = "";
  try {
    source = await readFile(plistPath, "utf8");
  } catch {
    // Binary property lists are handled by the bounded system plutil probe below.
  }
  return {
    identifier: xmlPlistValue(source, "CFBundleIdentifier") || plutilValue(plistPath, "CFBundleIdentifier"),
    executable: xmlPlistValue(source, "CFBundleExecutable") || plutilValue(plistPath, "CFBundleExecutable")
  };
}

async function macApplicationBundleCandidates(environment) {
  const userApplications = environment.HOME ? path.join(environment.HOME, "Applications") : path.join(os.homedir(), "Applications");
  const roots = ["/Applications", userApplications];
  const candidates = [];
  for (const root of [...new Set(roots)]) {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.endsWith(".app")) continue;
        const bundlePath = path.join(root, entry.name);
        const metadata = await readMacBundleMetadata(bundlePath);
        if (metadata.identifier !== "org.blenderfoundation.blender" || !metadata.executable) continue;
        if (!/^[A-Za-z0-9._ -]{1,128}$/.test(metadata.executable)) continue;
        candidates.push(path.join(bundlePath, "Contents", "MacOS", metadata.executable));
      }
    } catch {
      // Missing or unreadable standard application roots are simply absent.
    }
  }
  return candidates.sort().reverse();
}

async function versionedWindowsCandidates(environment) {
  const bases = [environment.ProgramFiles, environment.PROGRAMFILES, environment["ProgramW6432"]]
    .filter(Boolean)
    .map((directory) => path.win32.join(directory, "Blender Foundation"));
  const candidates = [];
  for (const base of [...new Set(bases)]) {
    try {
      const entries = await readdir(base, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && /^Blender(?:\s+\d+(?:\.\d+)*)?$/i.test(entry.name)) {
          candidates.push(path.win32.join(base, entry.name, "blender.exe"));
        }
      }
    } catch {
      // A missing standard install directory means this candidate is absent.
    }
  }
  return candidates.sort().reverse();
}

export async function resolveBlenderExecutable({
  platform = process.platform,
  environment = process.env,
  candidates
} = {}) {
  if (!isSupportedPlatform(platform)) return null;
  const proposed = candidates || [
    ...executableCandidates({ platform, environment }),
    ...(platform === "darwin" ? await macApplicationBundleCandidates(environment) : []),
    ...(platform === "win32" ? await versionedWindowsCandidates(environment) : [])
  ];
  for (const candidate of [...new Set(proposed)]) {
    if (!candidate || !path.isAbsolute(candidate)) continue;
    try {
      await access(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
      const details = await lstat(candidate);
      if (!details.isFile() && !details.isSymbolicLink()) continue;
      return await realpath(candidate);
    } catch {
      // Continue through only the bounded, local candidate list.
    }
  }
  return null;
}

function compactOutput(value, maximum = 4_000) {
  return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, maximum);
}

export async function runDoctor({
  platform = process.platform,
  environment = process.env,
  locate = resolveBlenderExecutable,
  spawnSyncProcess = spawnSync
} = {}) {
  if (!isSupportedPlatform(platform)) {
    return {
      ok: false,
      available: false,
      platform,
      reason: `CutSteward supports macOS and Windows only (detected ${platform}).`
    };
  }
  const executable = await locate({ platform, environment });
  if (!executable) {
    return {
      ok: false,
      available: false,
      platform,
      executable: null,
      reason: "Blender was not found; no render was attempted.",
      installHint: platform === "darwin"
        ? "Review and run: brew install --cask blender"
        : "Review and run: winget install --id BlenderFoundation.Blender --exact"
    };
  }
  const result = spawnSyncProcess(executable, ["--version"], {
    cwd: ROOT,
    encoding: "utf8",
    env: safeEnvironment(environment),
    maxBuffer: 256 * 1024,
    shell: false,
    timeout: 5_000,
    windowsHide: true
  });
  const output = compactOutput(`${result.stdout || ""}\n${result.stderr || ""}`);
  const ok = result.status === 0 && /\bBlender\s+\d/i.test(output);
  return {
    ok,
    available: true,
    platform,
    executable,
    version: output.split(/\r?\n/).find((line) => /\bBlender\s+\d/i.test(line)) || null,
    reason: ok ? null : `Blender was found but its bounded version probe failed${result.error?.code ? ` (${result.error.code})` : ""}.`,
    capabilities: ok ? DEVICE_STAGE_CAPABILITIES : []
  };
}

export function formatDoctorReport(result) {
  if (result.ok) return `CutSteward Blender adapter ready\n${result.version}\n${result.executable}`;
  return ["CutSteward Blender adapter unavailable", result.reason, result.installHint].filter(Boolean).join("\n");
}

export function safeEnvironment(environment = process.env) {
  const admitted = {};
  for (const name of SAFE_ENVIRONMENT_NAMES) {
    if (environment[name]) admitted[name] = environment[name];
  }
  return { ...admitted, NO_COLOR: "1", PYTHONNOUSERSITE: "1" };
}

async function validateTrustedDriver() {
  const details = await lstat(TRUSTED_DRIVER);
  if (!details.isFile() || details.isSymbolicLink()) fail("trusted driver is missing or is a symbolic link.");
  const actual = await realpath(TRUSTED_DRIVER);
  ensureContained(ROOT, actual, "trusted driver");
  if (actual !== TRUSTED_DRIVER) fail("trusted driver did not resolve to its declared path.");
  return actual;
}

export async function launchBlenderJob({
  executable,
  arguments_,
  cwd,
  timeoutMs,
  environment = process.env,
  spawnProcess = spawn
}) {
  if (!path.isAbsolute(executable)) fail("Blender executable must resolve to an absolute path.");
  let child;
  try {
    child = spawnProcess(executable, arguments_, {
      cwd,
      env: safeEnvironment(environment),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
  } catch (error) {
    fail(`could not launch Blender (${error.message}).`);
  }
  return await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const append = (current, chunk) => (current + chunk.toString("utf8")).slice(-64 * 1024);
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    child.once("error", (error) => finish(() => reject(new Error(`Blender device stage: Blender launch failed (${error.message}).`))));
    child.once("close", (code, signal) => finish(() => {
      const result = { code: code ?? 1, signal: signal || null, stdout: compactOutput(stdout, 64 * 1024), stderr: compactOutput(stderr, 64 * 1024) };
      if (timedOut) reject(new Error(`Blender device stage: render exceeded its ${timeoutMs} ms bound.`));
      else if (signal) reject(new Error(`Blender device stage: Blender stopped by ${signal}.`));
      else if (code !== 0) reject(new Error(`Blender device stage: Blender exited with code ${code}. ${compactOutput(stderr || stdout, 2_000)}`));
      else resolve(result);
    }));
  });
}

function parsePngHeader(bytes, label) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 29 || !bytes.subarray(0, 8).equals(signature) || bytes.toString("ascii", 12, 16) !== "IHDR") {
    fail(`${label} is not a decoded PNG with an IHDR header.`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colorType: bytes[25]
  };
}

export async function verifyDeviceManifest(validated) {
  const manifestPath = path.join(validated.outputDirectoryReal, "DEVICE_STAGE_MANIFEST.json");
  const details = await lstat(manifestPath);
  if (!details.isFile() || details.isSymbolicLink()) fail("device manifest is missing or is a symbolic link.");
  if (details.size > DEVICE_STAGE_LIMITS.maximumManifestBytes) fail("device manifest exceeds its size bound.");
  const manifestReal = await realpath(manifestPath);
  ensureContained(validated.outputDirectoryReal, manifestReal, "device manifest");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestReal, "utf8"));
  } catch {
    fail("device manifest is not valid JSON.");
  }
  const frameCount = validated.job.render.endFrame - validated.job.render.startFrame + 1;
  if (manifest.schemaVersion !== DEVICE_STAGE_SCHEMA_VERSION
    || manifest.adapterId !== BLENDER_ADAPTER_ID
    || manifest.adapterVersion !== BLENDER_ADAPTER_VERSION
    || manifest.status !== "complete"
    || manifest.jobId !== validated.job.jobId
    || manifest.job?.sha256 !== validated.jobSha256) {
    fail("device manifest identity does not match the admitted job.");
  }
  if (manifest.render?.width !== validated.job.render.width
    || manifest.render?.height !== validated.job.render.height
    || manifest.render?.fps !== validated.job.render.fps
    || manifest.render?.startFrame !== validated.job.render.startFrame
    || manifest.render?.endFrame !== validated.job.render.endFrame
    || manifest.render?.colorMode !== "RGBA") {
    fail("device manifest render contract does not match the admitted job.");
  }
  if (!Array.isArray(manifest.outputs?.frames) || manifest.outputs.frames.length !== frameCount) {
    fail("device manifest does not contain the exact rendered frame set.");
  }

  for (let index = 0; index < frameCount; index += 1) {
    const frameNumber = validated.job.render.startFrame + index;
    const expectedPath = path.join(validated.outputDirectoryReal, `frame_${String(frameNumber).padStart(6, "0")}.png`);
    const expectedRelative = path.relative(validated.projectRootReal, expectedPath).split(path.sep).join("/");
    const recorded = manifest.outputs.frames[index];
    if (recorded?.frame !== frameNumber || recorded?.relativePath !== expectedRelative || !SHA256_PATTERN.test(recorded?.sha256 || "")) {
      fail(`device manifest frame ${frameNumber} is not canonical.`);
    }
    await assertNoSymlinkComponents(validated.outputDirectoryReal, expectedPath, `output frame ${frameNumber}`);
    const frameDetails = await lstat(expectedPath);
    if (!frameDetails.isFile() || frameDetails.isSymbolicLink()) fail(`output frame ${frameNumber} is not a regular file.`);
    const frameReal = await realpath(expectedPath);
    ensureContained(validated.outputDirectoryReal, frameReal, `output frame ${frameNumber}`);
    const header = parsePngHeader(await readFile(frameReal), `output frame ${frameNumber}`);
    if (header.width !== validated.job.render.width || header.height !== validated.job.render.height || header.colorType !== 6) {
      fail(`output frame ${frameNumber} is not the expected RGBA ${validated.job.render.width}x${validated.job.render.height} PNG.`);
    }
    const digest = await sha256File(frameReal);
    if (digest !== recorded.sha256) fail(`output frame ${frameNumber} SHA-256 does not match the manifest.`);
  }

  for (const input of validated.resolvedInputs) {
    if (await sha256File(input.realPath) !== input.actualSha256) fail(`${input.label} changed while Blender was rendering.`);
  }
  return { manifest, manifestPath: manifestReal, manifestSha256: await sha256File(manifestReal) };
}

export async function runRender({
  jobPath,
  platform = process.platform,
  environment = process.env,
  blenderExecutable,
  spawnProcess = spawn,
  doctor = runDoctor
} = {}) {
  assertSupportedPlatform(platform);
  const validated = await loadAndValidateJob(jobPath);
  const trustedDriver = await validateTrustedDriver();
  let executable = blenderExecutable;
  if (!executable) {
    const result = await doctor({ platform, environment });
    if (!result.ok || !result.executable) fail(result.reason || "Blender is unavailable.");
    executable = result.executable;
  }
  if (!path.isAbsolute(executable)) fail("Blender executable must resolve to an absolute path.");
  const arguments_ = buildBlenderArguments(validated.jobRealPath, trustedDriver);
  const processResult = await launchBlenderJob({
    executable,
    arguments_,
    cwd: validated.projectRootReal,
    timeoutMs: validated.job.render.timeoutMs,
    environment,
    spawnProcess
  });
  const verified = await verifyDeviceManifest(validated);
  return {
    ok: true,
    adapterId: BLENDER_ADAPTER_ID,
    jobId: validated.job.jobId,
    executable,
    arguments: arguments_,
    process: { code: processResult.code, signal: processResult.signal },
    manifestPath: verified.manifestPath,
    manifestSha256: verified.manifestSha256,
    frameCount: verified.manifest.outputs.frames.length
  };
}

export const SMOKE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAGUlEQVR4nGMwiPv8nxLMMGrAqAGjBgwXAwDPHoAf6ljkbgAAAABJRU5ErkJggg==",
  "base64"
);

export async function runSmoke({ platform = process.platform, environment = process.env, doctor = runDoctor, render = runRender } = {}) {
  assertSupportedPlatform(platform);
  const diagnosis = await doctor({ platform, environment });
  if (!diagnosis.ok || !diagnosis.executable) fail(diagnosis.reason || "Blender is unavailable; smoke was not run.");
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "framepilot-blender-smoke-"));
  try {
    const inputDirectory = path.join(temporaryRoot, "inputs");
    const outputDirectory = path.join(temporaryRoot, "outputs");
    await mkdir(inputDirectory, { recursive: true });
    await mkdir(outputDirectory, { recursive: true });
    const inputPath = path.join(inputDirectory, "screen.png");
    await writeFile(inputPath, SMOKE_PNG);
    const jobPath = path.join(temporaryRoot, "smoke-job.json");
    await writeFile(jobPath, `${JSON.stringify({
      schemaVersion: DEVICE_STAGE_SCHEMA_VERSION,
      projectRoot: temporaryRoot,
      jobId: "offline-smoke",
      screen: { kind: "image", path: "inputs/screen.png", sha256: await sha256File(inputPath) },
      output: { directory: "outputs" },
      render: { width: 64, height: 64, fps: 24, startFrame: 1, endFrame: 1, timeoutMs: 120_000, samples: 4 },
      scene: { devicePreset: "phone-rounded-v1", cameraPreset: "hero-front", cameraMotion: "locked", lightingPreset: "soft-studio-v1", screenFit: "contain" }
    }, null, 2)}\n`);
    const result = await render({ jobPath, platform, environment, blenderExecutable: diagnosis.executable });
    return { ok: true, adapterId: BLENDER_ADAPTER_ID, frameCount: result.frameCount, manifestSha256: result.manifestSha256, disposable: true };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function main(arguments_ = process.argv.slice(2), { output = console } = {}) {
  const parsed = parseArguments(arguments_);
  if (parsed.command === "describe") {
    output.log(JSON.stringify(describeAdapter(), null, 2));
    return 0;
  }
  if (parsed.command === "doctor") {
    const result = await runDoctor();
    output.log(formatDoctorReport(result));
    return result.ok ? 0 : 1;
  }
  if (parsed.command === "render") {
    const result = await runRender({ jobPath: parsed.jobPath });
    output.log(JSON.stringify(result, null, 2));
    return 0;
  }
  const result = await runSmoke();
  output.log(JSON.stringify(result, null, 2));
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
