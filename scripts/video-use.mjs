import { lstat, mkdir, mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMediaBinaries } from "../server/media-verifier.mjs";

export const ADMITTED_COMMIT = "92c2b34e44c205cbc2acae7f6ca7c1c219d5dd66";
export const ADMITTED_REMOTE = "https://github.com/browser-use/video-use";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const FRAMEPILOT_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const SUPPORTED_PLATFORMS = new Set(["darwin", "win32"]);
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const SMOKE_TIMEOUT_MS = 120_000;
const SMOKE_DIRECTORY_PREFIX = "framepilot-video-use-smoke-";
const INSTALL_TIMEOUT_MS = 120_000;
const INSTALL_DIRECTORY_PREFIX = ".video-use-install-";

export function parseCommand(argv) {
  if (argv.length !== 1 || !["install", "doctor", "smoke"].includes(argv[0])) {
    throw new Error("Usage: node scripts/video-use.mjs <install|doctor|smoke>");
  }
  return argv[0];
}

export function expectedVideoUsePath(workspaceRoot = FRAMEPILOT_ROOT) {
  return path.resolve(workspaceRoot, ".framepilot", "tools", "video-use");
}

export function isContainedPath(base, candidate) {
  const relative = path.relative(path.resolve(base), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export async function inspectAdmissionPaths({
  workspaceRoot = FRAMEPILOT_ROOT,
  fileSystem = { lstat, realpath }
} = {}) {
  const root = path.resolve(workspaceRoot);
  const repository = expectedVideoUsePath(root);
  const helper = path.join(repository, "helpers", "render.py");
  const [rootReal, repositoryStats] = await Promise.all([
    fileSystem.realpath(root),
    fileSystem.lstat(repository)
  ]);

  if (repositoryStats.isSymbolicLink()) {
    throw new Error("The admitted video-use repository must not be a symbolic link.");
  }
  if (!repositoryStats.isDirectory()) {
    throw new Error("The admitted video-use path is not a directory.");
  }

  const repositoryReal = await fileSystem.realpath(repository);
  const expectedReal = path.join(rootReal, ".framepilot", "tools", "video-use");
  if (path.resolve(repositoryReal) !== path.resolve(expectedReal) || !isContainedPath(rootReal, repositoryReal)) {
    throw new Error("The admitted video-use repository escapes the CutSteward workspace.");
  }

  const helperStats = await fileSystem.lstat(helper);
  if (helperStats.isSymbolicLink()) {
    throw new Error("The admitted video-use render helper must not be a symbolic link.");
  }
  if (!helperStats.isFile()) {
    throw new Error("The admitted video-use render helper is not a regular file.");
  }
  const helperReal = await fileSystem.realpath(helper);
  const expectedHelperReal = path.join(repositoryReal, "helpers", "render.py");
  if (path.resolve(helperReal) !== path.resolve(expectedHelperReal)
      || !isContainedPath(repositoryReal, helperReal)) {
    throw new Error("The admitted video-use render helper escapes its repository.");
  }

  return {
    workspaceRoot: rootReal,
    repository: repositoryReal,
    helper: helperReal
  };
}

export function runBounded(command, args, {
  cwd = FRAMEPILOT_ROOT,
  env = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES
} = {}) {
  return new Promise((resolve) => {
    let child;
    let settled = false;
    let timedOut = false;
    let outputExceeded = false;
    let outputBytes = 0;
    const stdout = [];
    const stderr = [];

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut,
        outputExceeded,
        ...result
      });
    };

    const collect = (target, chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = Math.max(0, maxOutputBytes - outputBytes);
      if (remaining > 0) target.push(buffer.subarray(0, remaining));
      outputBytes += buffer.length;
      if (outputBytes > maxOutputBytes && !outputExceeded) {
        outputExceeded = true;
        child?.kill();
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child?.kill();
    }, timeoutMs);

    try {
      child = spawn(command, args, {
        cwd,
        env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      finish({ code: null, signal: null, errorCode: error?.code || "SPAWN_ERROR" });
      return;
    }

    child.stdout.on("data", (chunk) => collect(stdout, chunk));
    child.stderr.on("data", (chunk) => collect(stderr, chunk));
    child.once("error", (error) => finish({ code: null, signal: null, errorCode: error?.code || "SPAWN_ERROR" }));
    child.once("close", (code, signal) => finish({ code, signal, errorCode: null }));
  });
}

function samePath(left, right, platform) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function commandPassed(result) {
  return result?.code === 0 && !result.timedOut && !result.outputExceeded;
}

async function probePython(platform, runCommand, cwd, environment) {
  const pythonVersions = ["3.14", "3.13", "3.12", "3.11", "3.10"];
  const versionedPythonCommands = pythonVersions.map((version) => `python${version}`);
  const candidates = platform === "win32"
    ? [
        { command: "py", prefixArgs: ["-3"] },
        ...pythonVersions.map((version) => ({ command: "py", prefixArgs: [`-${version}`] })),
        { command: "python", prefixArgs: [] },
        { command: "python3", prefixArgs: [] },
        ...versionedPythonCommands.map((command) => ({ command, prefixArgs: [] }))
      ]
    : [
        { command: "python3", prefixArgs: [] },
        { command: "python", prefixArgs: [] },
        ...versionedPythonCommands.map((command) => ({ command, prefixArgs: [] }))
      ];
  const program = "import sys; print('.'.join(map(str, sys.version_info[:3])))";
  let firstUnsupported = null;

  for (const candidate of candidates) {
    const result = await runCommand(
      candidate.command,
      [...candidate.prefixArgs, "-I", "-S", "-c", program],
      { cwd, env: environment, timeoutMs: DEFAULT_TIMEOUT_MS, maxOutputBytes: 1024 }
    );
    if (!commandPassed(result)) continue;
    const match = result.stdout.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) continue;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const detected = {
      ...candidate,
      version: match[0],
      supported: major > 3 || (major === 3 && minor >= 10)
    };
    if (detected.supported) return detected;
    firstUnsupported ||= detected;
  }
  return firstUnsupported;
}

export async function runDoctor({
  platform = process.platform,
  workspaceRoot = FRAMEPILOT_ROOT,
  fileSystem = { lstat, realpath },
  runCommand = runBounded,
  resolveBinaries = resolveMediaBinaries
} = {}) {
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok, detail });

  if (!SUPPORTED_PLATFORMS.has(platform)) {
    add("platform", false, `unsupported platform ${platform}; macOS and Windows only`);
    return { ok: false, checks, python: null, admission: null };
  }
  add("platform", true, platform === "darwin" ? "macOS admitted" : "Windows admitted");
  const doctorEnvironment = smokeEnvironment(process.env);

  let admission = null;
  try {
    admission = await inspectAdmissionPaths({ workspaceRoot, fileSystem });
    add("repository-path", true, "exact quarantined repository path admitted");
  } catch {
    add("repository-path", false, "repository missing, unsafe, symlinked, or outside quarantine");
  }

  if (admission) {
    try {
      await fileSystem.lstat(path.join(admission.repository, ".env"));
      add("credentials", false, "clone contains a forbidden .env file");
    } catch (error) {
      add("credentials", error?.code === "ENOENT", error?.code === "ENOENT"
        ? "clone contains no .env file"
        : "could not verify absence of clone .env file");
    }

    const gitPrefix = [
      "--no-optional-locks",
      "-c", "core.fsmonitor=false",
      "-c", "core.untrackedCache=false",
      "-C", admission.repository
    ];
    const topLevel = await runCommand(
      "git",
      [...gitPrefix, "rev-parse", "--show-toplevel"],
      { cwd: workspaceRoot, env: doctorEnvironment, timeoutMs: DEFAULT_TIMEOUT_MS, maxOutputBytes: 4096 }
    );
    const repositoryIdentityOk = commandPassed(topLevel)
      && samePath(topLevel.stdout.trim(), admission.repository, platform);
    add("git-repository", repositoryIdentityOk, repositoryIdentityOk
      ? "quarantine is a standalone git checkout"
      : "quarantine is not the expected git checkout");

    const head = await runCommand(
      "git",
      [...gitPrefix, "rev-parse", "HEAD"],
      { cwd: workspaceRoot, env: doctorEnvironment, timeoutMs: DEFAULT_TIMEOUT_MS, maxOutputBytes: 4096 }
    );
    const headValue = head.stdout.trim().toLowerCase();
    const commitOk = commandPassed(head) && /^[0-9a-f]{40}$/.test(headValue) && headValue === ADMITTED_COMMIT;
    add("commit", commitOk, commitOk ? "exact admitted commit checked out" : "checkout is not at the admitted commit");

    const status = await runCommand(
      "git",
      [...gitPrefix, "status", "--porcelain=v1", "--untracked-files=all"],
      { cwd: workspaceRoot, env: doctorEnvironment, timeoutMs: DEFAULT_TIMEOUT_MS, maxOutputBytes: 32 * 1024 }
    );
    const clean = commandPassed(status) && status.stdout.length === 0;
    add("worktree", clean, clean ? "worktree is clean" : "worktree is dirty or could not be inspected");
  } else {
    add("credentials", false, "clone credential state not inspected");
    add("git-repository", false, "git checkout not inspected");
    add("commit", false, "commit not inspected");
    add("worktree", false, "worktree not inspected");
  }

  const python = await probePython(platform, runCommand, workspaceRoot, doctorEnvironment);
  add("python", Boolean(python?.supported), python?.supported
    ? `Python ${python.version} admitted`
    : python
      ? `Python ${python.version} is below 3.10`
      : "Python 3.10 or newer not detected");

  let media = null;
  try {
    media = await resolveBinaries({ rootDirectory: workspaceRoot });
  } catch {
    media = null;
  }
  const mediaIntegrityOk = Boolean(media?.integrity?.ok);
  add("media-integrity", mediaIntegrityOk, mediaIntegrityOk
    ? "selected media binaries passed admission integrity checks"
    : "media binary resolution or integrity admission failed");

  for (const executable of ["ffmpeg", "ffprobe"]) {
    const command = mediaIntegrityOk ? media?.[executable] : null;
    if (!command) {
      add(executable, false, `${executable} unavailable or invalid`);
      continue;
    }
    const result = await runCommand(
      command,
      ["-version"],
      { cwd: workspaceRoot, env: doctorEnvironment, timeoutMs: DEFAULT_TIMEOUT_MS, maxOutputBytes: 4096 }
    );
    const output = result.stdout || result.stderr || "";
    const ok = commandPassed(result) && new RegExp(`^${executable} version `, "m").test(output);
    add(executable, ok, ok ? `${executable} detected` : `${executable} unavailable or invalid`);
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
    python: python?.supported ? python : null,
    admission,
    media: mediaIntegrityOk && media?.ffmpeg && media?.ffprobe
      ? {
          ffmpeg: media.ffmpeg,
          ffprobe: media.ffprobe,
          sources: media.sources
        }
      : null
  };
}

export function formatDoctorReport(result) {
  const lines = ["CutSteward video-use quarantine doctor", ""];
  for (const check of result.checks) {
    lines.push(`${check.ok ? "✓" : "×"} ${check.id}: ${check.detail}`);
  }
  lines.push("", result.ok ? "video-use quarantine is ready" : "video-use quarantine is blocked");
  return lines.join("\n");
}

function installEnvironment(source, stagingDirectory) {
  const safe = {};
  const sensitiveName = /(auth|bearer|cookie|credential|key|pass|proxy|secret|session|token)/i;
  const injectionName = /^(BASH_ENV$|CDPATH$|DYLD_|ENV$|FFREPORT$|GCM_|GH_|GIT_|GITHUB_|LD_|NODE_OPTIONS$|PERL5OPT$|PYTHONHOME$|PYTHONPATH$|PYTHONSTARTUP$|RUBYOPT$|SSH_)/i;
  for (const [name, value] of Object.entries(source)) {
    if (!sensitiveName.test(name) && !injectionName.test(name) && typeof value === "string") {
      safe[name] = value;
    }
  }
  const existingPathEntry = Object.entries(safe).find(([name]) => name.toUpperCase() === "PATH");
  for (const name of Object.keys(safe)) {
    if (name.toUpperCase() === "PATH") delete safe[name];
  }
  return {
    ...safe,
    PATH: existingPathEntry?.[1] || "",
    GIT_ALLOW_PROTOCOL: "https",
    GIT_CONFIG_GLOBAL: path.join(stagingDirectory, ".git", "framepilot-no-global-config"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_PROTOCOL_FROM_USER: "0",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never"
  };
}

async function lstatIfPresent(candidate, fileSystem) {
  try {
    return await fileSystem.lstat(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function ensureInstallDirectory({
  root,
  rootReal,
  segments,
  platform,
  fileSystem
}) {
  const lexicalPath = path.join(root, ...segments);
  let entry = await lstatIfPresent(lexicalPath, fileSystem);
  if (!entry) {
    try {
      await fileSystem.mkdir(lexicalPath, { recursive: false, mode: 0o700 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    entry = await fileSystem.lstat(lexicalPath);
  }
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error("Install parent must be a regular directory, not a symbolic link.");
  }
  const actual = await fileSystem.realpath(lexicalPath);
  const expected = path.join(rootReal, ...segments);
  if (!samePath(actual, expected, platform) || !isContainedPath(rootReal, actual)) {
    throw new Error("Install parent escapes the CutSteward workspace.");
  }
  return actual;
}

async function inspectStagedCheckout({ stagingDirectory, platform, fileSystem, runCommand, commandOptions, gitPrefix }) {
  const topLevel = await runCommand(
    "git",
    [...gitPrefix, "rev-parse", "--show-toplevel"],
    commandOptions
  );
  if (!commandPassed(topLevel) || !samePath(topLevel.stdout.trim(), stagingDirectory, platform)) {
    return safeInstallFailure("verify-repository", "staged checkout is not the expected standalone repository");
  }

  const head = await runCommand("git", [...gitPrefix, "rev-parse", "HEAD"], commandOptions);
  const headValue = head.stdout.trim().toLowerCase();
  if (!commandPassed(head) || !/^[0-9a-f]{40}$/.test(headValue) || headValue !== ADMITTED_COMMIT) {
    return safeInstallFailure("verify-commit", "staged checkout is not at the exact admitted commit");
  }

  const status = await runCommand(
    "git",
    [...gitPrefix, "status", "--porcelain=v1", "--untracked-files=all"],
    commandOptions
  );
  if (!commandPassed(status) || status.stdout.length !== 0) {
    return safeInstallFailure("verify-worktree", "staged checkout is not clean");
  }

  if (await lstatIfPresent(path.join(stagingDirectory, ".env"), fileSystem)) {
    return safeInstallFailure("verify-credentials", "staged checkout contains a forbidden .env file");
  }
  const helper = path.join(stagingDirectory, "helpers", "render.py");
  const helperStats = await fileSystem.lstat(helper);
  const helperReal = await fileSystem.realpath(helper);
  if (helperStats.isSymbolicLink() || !helperStats.isFile()
      || !samePath(helperReal, helper, platform)
      || !isContainedPath(stagingDirectory, helperReal)) {
    return safeInstallFailure("verify-helper", "staged render helper failed confinement checks");
  }
  return null;
}

function safeInstallFailure(stage, reason, extra = {}) {
  return { ok: false, blocked: true, installed: false, idempotent: false, stage, reason, ...extra };
}

export async function runInstall({
  platform = process.platform,
  workspaceRoot = FRAMEPILOT_ROOT,
  environment = process.env,
  fileSystem = { lstat, mkdir, mkdtemp, realpath, rename, rm },
  runCommand = runBounded,
  doctorRunner = runDoctor,
  doctorOptions = {}
} = {}) {
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return safeInstallFailure("platform", "video-use installation supports only macOS and Windows");
  }

  const root = path.resolve(workspaceRoot);
  let rootReal;
  let toolsDirectory;
  try {
    rootReal = await fileSystem.realpath(root);
    await ensureInstallDirectory({
      root,
      rootReal,
      segments: [".framepilot"],
      platform,
      fileSystem
    });
    toolsDirectory = await ensureInstallDirectory({
      root,
      rootReal,
      segments: [".framepilot", "tools"],
      platform,
      fileSystem
    });
  } catch {
    return safeInstallFailure("path", "the exact quarantined install path could not be confined");
  }

  const repository = path.join(toolsDirectory, "video-use");
  let existing;
  try {
    existing = await lstatIfPresent(repository, fileSystem);
  } catch {
    return safeInstallFailure("existing", "the existing install path could not be inspected");
  }
  if (existing) {
    const doctor = await doctorRunner({
      ...doctorOptions,
      platform,
      workspaceRoot: root,
      fileSystem,
      runCommand
    });
    return {
      ok: doctor.ok,
      blocked: !doctor.ok,
      installed: false,
      idempotent: true,
      stage: doctor.ok ? "ready" : "doctor",
      reason: doctor.ok
        ? "existing exact checkout passed doctor without modification"
        : "existing checkout was not modified and did not pass doctor",
      doctor
    };
  }

  let stagingDirectory = null;
  try {
    stagingDirectory = await fileSystem.mkdtemp(path.join(toolsDirectory, INSTALL_DIRECTORY_PREFIX));
    const stagingStats = await fileSystem.lstat(stagingDirectory);
    const stagingReal = await fileSystem.realpath(stagingDirectory);
    if (stagingStats.isSymbolicLink() || !stagingStats.isDirectory()
        || !samePath(path.dirname(stagingReal), toolsDirectory, platform)
        || !path.basename(stagingReal).startsWith(INSTALL_DIRECTORY_PREFIX)) {
      return safeInstallFailure("staging", "disposable install directory failed confinement checks");
    }
    stagingDirectory = stagingReal;

    const commandOptions = {
      cwd: rootReal,
      env: installEnvironment(environment, stagingDirectory),
      timeoutMs: INSTALL_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES
    };
    const gitPrefix = [
      "--no-optional-locks",
      "-c", `core.hooksPath=${path.join(stagingDirectory, ".git", "framepilot-no-hooks")}`,
      "-c", "core.fsmonitor=false",
      "-c", "core.untrackedCache=false",
      "-c", "credential.helper=",
      "-c", "protocol.file.allow=never",
      "-c", "protocol.ext.allow=never",
      "-c", "protocol.ssh.allow=never",
      "-c", "protocol.git.allow=never",
      "-c", "submodule.recurse=false",
      "-C", stagingDirectory
    ];
    const steps = [
      { stage: "init", args: ["init", "--quiet"] },
      { stage: "remote", args: ["remote", "add", "origin", ADMITTED_REMOTE] },
      {
        stage: "fetch",
        args: ["fetch", "--quiet", "--no-tags", "--depth=1", "--recurse-submodules=no", "origin", ADMITTED_COMMIT]
      },
      { stage: "checkout", args: ["checkout", "--quiet", "--detach", ADMITTED_COMMIT] }
    ];
    for (const step of steps) {
      const result = await runCommand("git", [...gitPrefix, ...step.args], commandOptions);
      if (!commandPassed(result)) {
        return safeInstallFailure(step.stage, safeCommandFailure(result));
      }
    }

    const verificationFailure = await inspectStagedCheckout({
      stagingDirectory,
      platform,
      fileSystem,
      runCommand,
      commandOptions,
      gitPrefix
    });
    if (verificationFailure) return verificationFailure;

    if (await lstatIfPresent(repository, fileSystem)) {
      return safeInstallFailure("promote", "install path appeared during staging and was not modified");
    }
    await fileSystem.rename(stagingDirectory, repository);
    stagingDirectory = null;

    const doctor = await doctorRunner({
      ...doctorOptions,
      platform,
      workspaceRoot: root,
      fileSystem,
      runCommand
    });
    return {
      ok: doctor.ok,
      blocked: !doctor.ok,
      installed: true,
      idempotent: false,
      stage: doctor.ok ? "ready" : "doctor",
      reason: doctor.ok
        ? "exact admitted commit installed and doctor passed"
        : "exact admitted commit installed but doctor did not pass",
      doctor
    };
  } catch {
    return safeInstallFailure("install", "secure staged installation failed");
  } finally {
    if (stagingDirectory
        && samePath(path.dirname(path.resolve(stagingDirectory)), toolsDirectory, platform)
        && path.basename(stagingDirectory).startsWith(INSTALL_DIRECTORY_PREFIX)) {
      await fileSystem.rm(stagingDirectory, { recursive: true, force: true });
    }
  }
}

export function formatInstallReport(result) {
  if (result.ok && result.idempotent) {
    return "CutSteward video-use install is already admitted; existing checkout was not modified";
  }
  if (result.ok) {
    return `CutSteward video-use installed exact commit ${ADMITTED_COMMIT}`;
  }
  if (result.idempotent) {
    return "CutSteward video-use install blocked: existing checkout was not modified and failed doctor";
  }
  return `CutSteward video-use install blocked at ${result.stage}: ${result.reason}`;
}

export function buildSmokeEdl() {
  return {
    sources: { synthetic: "synthetic-input.mp4" },
    ranges: [{ source: "synthetic", start: 0.1, end: 1.9, beat: "offline smoke" }],
    grade: "",
    overlays: []
  };
}

function smokeEnvironment(source = process.env, media = null) {
  const safe = {};
  const sensitiveName = /(auth|bearer|cookie|credential|key|pass|proxy|secret|session|token)/i;
  for (const [name, value] of Object.entries(source)) {
    const injectionName = /^(DYLD_|LD_PRELOAD$|PYTHONHOME$|PYTHONPATH$|PYTHONSTARTUP$|FFREPORT$)/i;
    if (!sensitiveName.test(name) && !injectionName.test(name) && typeof value === "string") {
      safe[name] = value;
    }
  }
  const existingPathEntry = Object.entries(safe).find(([name]) => name.toUpperCase() === "PATH");
  for (const name of Object.keys(safe)) {
    if (name.toUpperCase() === "PATH") delete safe[name];
  }
  const mediaDirectories = [...new Set(
    [media?.ffmpeg, media?.ffprobe].filter(Boolean).map((binary) => path.dirname(path.resolve(binary)))
  )];
  const executablePath = [
    ...mediaDirectories,
    existingPathEntry?.[1]
  ].filter(Boolean).join(path.delimiter);

  return {
    ...safe,
    PATH: executablePath,
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1",
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    HTTP_PROXY: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
    ALL_PROXY: "http://127.0.0.1:9",
    NO_PROXY: ""
  };
}

async function inspectConfinedRegularFile(directory, candidate, fileSystem) {
  const directoryReal = await fileSystem.realpath(directory);
  const candidatePath = path.resolve(candidate);
  if (candidatePath === path.resolve(directoryReal) || !isContainedPath(directoryReal, candidatePath)) {
    throw new Error("Smoke artifact path escapes its disposable directory.");
  }
  const candidateStats = await fileSystem.lstat(candidatePath);
  if (candidateStats.isSymbolicLink() || !candidateStats.isFile()) {
    throw new Error("Smoke artifact must be a regular, non-symbolic-link file.");
  }
  const candidateReal = await fileSystem.realpath(candidatePath);
  if (path.resolve(candidateReal) !== candidatePath || !isContainedPath(directoryReal, candidateReal)) {
    throw new Error("Smoke artifact resolves outside its disposable directory.");
  }
  return candidateReal;
}

function safeCommandFailure(result) {
  if (result?.timedOut) return "command timed out";
  if (result?.outputExceeded) return "command exceeded its output limit";
  if (result?.errorCode) return "command could not be started";
  return "command exited unsuccessfully";
}

function safeSmokeFailure(stage, reason) {
  return { ok: false, blocked: true, stage, reason };
}

function doctorBlockReason(doctor) {
  if (!doctor.admission?.helper) return "the exact quarantined checkout is not admitted";
  if (!doctor.python) return "Python 3.10 or newer is not admitted";
  if (!doctor.media?.ffmpeg || !doctor.media?.ffprobe) {
    return "hash-admitted ffmpeg and ffprobe are not available";
  }
  return "one or more read-only doctor checks failed";
}

export async function runSmoke({
  doctorResult,
  doctorOptions,
  runCommand = runBounded,
  environment = process.env,
  fileSystem = { lstat, mkdtemp, realpath, rm, writeFile },
  temporaryRoot = os.tmpdir()
} = {}) {
  const doctor = doctorResult || await runDoctor({ ...doctorOptions, runCommand });
  if (!doctor.ok || !doctor.python || !doctor.admission?.helper
      || !doctor.media?.ffmpeg || !doctor.media?.ffprobe) {
    return safeSmokeFailure("doctor", doctorBlockReason(doctor));
  }

  let disposableDirectory = null;
  let disposableRootReal = null;
  try {
    disposableRootReal = await fileSystem.realpath(temporaryRoot);
    disposableDirectory = await fileSystem.mkdtemp(path.join(disposableRootReal, SMOKE_DIRECTORY_PREFIX));
    const disposableStats = await fileSystem.lstat(disposableDirectory);
    const disposableReal = await fileSystem.realpath(disposableDirectory);
    if (disposableStats.isSymbolicLink()
        || !disposableStats.isDirectory()
        || path.dirname(disposableReal) !== path.resolve(disposableRootReal)
        || !path.basename(disposableReal).startsWith(SMOKE_DIRECTORY_PREFIX)) {
      return safeSmokeFailure("temporary-directory", "disposable directory failed confinement checks");
    }
    disposableDirectory = disposableReal;

    const inputPath = path.join(disposableDirectory, "synthetic-input.mp4");
    const edlPath = path.join(disposableDirectory, "smoke-edl.json");
    const outputPath = path.join(disposableDirectory, "smoke-output.mp4");
    for (const candidate of [inputPath, edlPath, outputPath]) {
      if (!isContainedPath(disposableDirectory, candidate)) {
        return safeSmokeFailure("paths", "smoke artifact path escaped confinement");
      }
    }

    await fileSystem.writeFile(edlPath, `${JSON.stringify(buildSmokeEdl(), null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
    await inspectConfinedRegularFile(disposableDirectory, edlPath, fileSystem);

    const commandOptions = {
      cwd: disposableDirectory,
      env: smokeEnvironment(environment, doctor.media),
      timeoutMs: SMOKE_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES
    };
    const generated = await runCommand(doctor.media.ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=2",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
      "-map", "0:v:0", "-map", "1:a:0", "-shortest",
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "96k", inputPath
    ], commandOptions);
    if (!commandPassed(generated)) {
      return safeSmokeFailure("generate", safeCommandFailure(generated));
    }
    await inspectConfinedRegularFile(disposableDirectory, inputPath, fileSystem);

    const rendered = await runCommand(doctor.python.command, [
      ...doctor.python.prefixArgs,
      "-I",
      doctor.admission.helper,
      edlPath,
      "-o", outputPath,
      "--draft",
      "--no-subtitles",
      "--no-loudnorm"
    ], commandOptions);
    if (!commandPassed(rendered)) {
      return safeSmokeFailure("render", safeCommandFailure(rendered));
    }
    await inspectConfinedRegularFile(disposableDirectory, outputPath, fileSystem);

    const probed = await runCommand(doctor.media.ffprobe, [
      "-v", "error",
      "-show_entries", "stream=codec_type",
      "-show_entries", "format=duration",
      "-of", "json",
      outputPath
    ], commandOptions);
    if (!commandPassed(probed)) {
      return safeSmokeFailure("probe", safeCommandFailure(probed));
    }

    let metadata;
    try {
      metadata = JSON.parse(probed.stdout);
    } catch {
      return safeSmokeFailure("probe", "ffprobe returned invalid metadata");
    }
    const streamTypes = new Set(
      Array.isArray(metadata?.streams)
        ? metadata.streams.map((stream) => stream?.codec_type)
        : []
    );
    const duration = Number(metadata?.format?.duration);
    if (!streamTypes.has("video") || !streamTypes.has("audio")
        || !Number.isFinite(duration) || duration < 1.5 || duration > 2.1) {
      return safeSmokeFailure("probe", "rendered output failed stream or duration checks");
    }

    const decoded = await runCommand(doctor.media.ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-nostdin",
      "-i", outputPath,
      "-map", "0:v:0", "-map", "0:a:0",
      "-f", "null", "-"
    ], commandOptions);
    if (!commandPassed(decoded)) {
      return safeSmokeFailure("decode", safeCommandFailure(decoded));
    }

    return {
      ok: true,
      blocked: false,
      duration,
      streams: ["video", "audio"]
    };
  } catch {
    return safeSmokeFailure("confinement", "offline smoke failed a filesystem confinement check");
  } finally {
    if (disposableDirectory && disposableRootReal
        && path.dirname(path.resolve(disposableDirectory)) === path.resolve(disposableRootReal)
        && path.basename(disposableDirectory).startsWith(SMOKE_DIRECTORY_PREFIX)) {
      await fileSystem.rm(disposableDirectory, { recursive: true, force: true });
    }
  }
}

export function formatSmokeReport(result) {
  if (result.ok) {
    return `CutSteward video-use offline smoke passed (${result.duration.toFixed(3)}s, audio + video, full decode)`;
  }
  return `CutSteward video-use offline smoke blocked at ${result.stage}: ${result.reason}`;
}

export async function main(argv = process.argv.slice(2)) {
  let command;
  try {
    command = parseCommand(argv);
  } catch {
    console.error("Usage: node scripts/video-use.mjs <install|doctor|smoke>");
    return 2;
  }

  if (command === "install") {
    const result = await runInstall();
    console.log(formatInstallReport(result));
    if (result.doctor) console.log(`\n${formatDoctorReport(result.doctor)}`);
    return result.ok ? 0 : 1;
  }

  if (command === "doctor") {
    const result = await runDoctor();
    console.log(formatDoctorReport(result));
    return result.ok ? 0 : 1;
  }

  const result = await runSmoke();
  console.log(formatSmokeReport(result));
  return result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch(() => {
    console.error("CutSteward video-use quarantine failed safely.");
    process.exitCode = 1;
  });
}
