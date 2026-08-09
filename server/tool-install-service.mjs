import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactSensitiveText } from "./redaction.mjs";

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_APPROVAL_TTL_MS = 5 * 60 * 1000;
const DEFAULT_INSTALL_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_OUTPUT_LIMIT_BYTES = 128 * 1024;
const MAX_PENDING_APPROVALS = 100;
const SAFE_PLATFORMS = new Set(["darwin", "win32"]);
const SAFE_WINGET_FLAGS = new Set([
  "--accept-package-agreements",
  "--accept-source-agreements",
  "--disable-interactivity",
  "--silent"
]);

function installError(message, code, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function cloneJson(value, label) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw installError(`${label} must be JSON-serializable.`, "INSTALL_CONFIGURATION_INVALID", 500);
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function toolIdFrom(request) {
  const toolId = typeof request === "string" ? request : request?.toolId;
  if (typeof toolId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(toolId)) {
    throw installError("A valid catalogued tool ID is required.", "TOOL_ID_INVALID");
  }
  return toolId;
}

function assertLocalUser(actor) {
  if (!actor || actor.kind !== "local-user" || typeof actor.id !== "string" || !actor.id.trim()) {
    throw installError(
      "Only an authenticated local user may approve or execute a tool installation.",
      "LOCAL_USER_APPROVAL_REQUIRED",
      403
    );
  }
  return actor.id;
}

function canonicalBinding(binding) {
  return JSON.stringify({
    toolId: binding.toolId,
    platform: binding.platform,
    manager: binding.manager,
    command: binding.command,
    args: binding.args,
    cwd: binding.cwd
  });
}

function planHashFor(binding) {
  return createHash("sha256").update(canonicalBinding(binding)).digest("hex");
}

function validHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function reviewedFree(tool, strategy) {
  const marker = strategy?.cost ?? tool.cost ?? tool.pricing;
  return marker === undefined
    || marker === null
    || marker === 0
    || marker === "free"
    || marker === "open-source";
}

function safeDocumentationUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function parseExactNpmPackage(packageSpec) {
  if (typeof packageSpec !== "string" || packageSpec.includes(" ")) return null;
  const separator = packageSpec.lastIndexOf("@");
  if (separator < 1) return null;
  const packageName = packageSpec.slice(0, separator);
  const version = packageSpec.slice(separator + 1);
  const validName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(packageName);
  const validVersion = /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i.test(version);
  return validName && validVersion ? { packageName, version } : null;
}

function declaredPackageVersion(rootPackage, packageName) {
  return rootPackage.dependencies?.[packageName]
    ?? rootPackage.optionalDependencies?.[packageName]
    ?? rootPackage.devDependencies?.[packageName]
    ?? null;
}

function reviewedNpmLockfile(lockfile) {
  if (!lockfile || typeof lockfile !== "object" || !lockfile.packages || typeof lockfile.packages !== "object") {
    return false;
  }
  for (const [packagePath, locked] of Object.entries(lockfile.packages)) {
    if (!packagePath) continue;
    if (!locked || locked.link === true || typeof locked.resolved !== "string") return false;
    if (typeof locked.integrity !== "string" || !locked.integrity.startsWith("sha512-")) return false;
    try {
      const resolved = new URL(locked.resolved);
      if (resolved.protocol !== "https:"
        || resolved.hostname !== "registry.npmjs.org"
        || resolved.port
        || resolved.username
        || resolved.password
        || resolved.search
        || resolved.hash) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

function forbiddenStrategyFields(strategy) {
  const forbidden = [
    "command",
    "commandLine",
    "elevated",
    "installerUrl",
    "repository",
    "repo",
    "runAsAdministrator",
    "script",
    "shell",
    "sudo",
    "url"
  ];
  return forbidden.filter((field) => strategy[field] !== undefined && strategy[field] !== false);
}

function npmLockfileExecution({ tool, strategy, platform, projectRoot, rootPackage, lockfile, timeoutMs, outputLimitBytes }) {
  const parsed = parseExactNpmPackage(strategy.package);
  if (!parsed) {
    return { blocked: "The catalogued npm dependency is not pinned to an exact semantic version." };
  }
  if (tool.npmPackage && tool.npmPackage !== parsed.packageName) {
    return { blocked: "The catalogued npm package identity does not match the tool identity." };
  }
  if (declaredPackageVersion(rootPackage, parsed.packageName) !== parsed.version) {
    return { blocked: `The project must declare ${strategy.package} exactly before it can be installed.` };
  }
  if (!reviewedNpmLockfile(lockfile)) {
    return { blocked: "The project lockfile contains an unreviewed registry, repository, link, URL, or missing integrity." };
  }
  const locked = lockfile.packages?.[`node_modules/${parsed.packageName}`];
  if (locked?.version !== parsed.version) {
    return { blocked: `The project lockfile does not contain ${strategy.package} exactly.` };
  }
  if (typeof tool.npmIntegrity !== "string"
    || !tool.npmIntegrity.startsWith("sha512-")
    || locked.integrity !== tool.npmIntegrity) {
    return { blocked: "The project lockfile integrity does not match the reviewed catalog integrity." };
  }
  const execution = {
    manager: "npm-lockfile",
    command: platform === "win32" ? "npm.cmd" : "npm",
    args: ["ci", "--include=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
    cwd: projectRoot,
    shell: false,
    timeoutMs,
    outputLimitBytes,
    package: strategy.package,
    integrity: tool.npmIntegrity
  };
  return { execution };
}

function homebrewExecution({ strategy, projectRoot, timeoutMs, outputLimitBytes }) {
  if (strategy.manager !== "brew" || !Array.isArray(strategy.args)) {
    return { blocked: "Only a catalogued Homebrew install strategy is allowed on macOS." };
  }
  const [verb, maybeCask, maybePackage, ...rest] = strategy.args;
  const cask = maybeCask === "--cask";
  const packageName = cask ? maybePackage : maybeCask;
  const expectedLength = cask ? 3 : 2;
  if (verb !== "install"
    || strategy.args.length !== expectedLength
    || rest.length > 0
    || typeof packageName !== "string"
    || !/^[a-z0-9][a-z0-9@+._-]*$/i.test(packageName)) {
    return { blocked: "The Homebrew strategy contains an unreviewed formula, tap, URL, flag, or command." };
  }
  return {
    execution: {
      manager: "brew",
      command: "brew",
      args: [...strategy.args],
      cwd: projectRoot,
      shell: false,
      timeoutMs,
      outputLimitBytes
    }
  };
}

function wingetExecution({ strategy, projectRoot, timeoutMs, outputLimitBytes }) {
  if (strategy.manager !== "winget" || !Array.isArray(strategy.args)) {
    return { blocked: "Only a catalogued WinGet install strategy is allowed on Windows." };
  }
  const [verb, idFlag, packageId, exactFlag, ...flags] = strategy.args;
  if (verb !== "install"
    || idFlag !== "--id"
    || exactFlag !== "--exact"
    || typeof packageId !== "string"
    || !/^[a-z0-9][a-z0-9._-]*$/i.test(packageId)
    || flags.some((flag) => !SAFE_WINGET_FLAGS.has(flag))
    || new Set(flags).size !== flags.length) {
    return { blocked: "The WinGet strategy contains an unreviewed source, URL, flag, package ID, or command." };
  }
  return {
    execution: {
      manager: "winget",
      command: "winget.exe",
      args: [...strategy.args],
      cwd: projectRoot,
      shell: false,
      timeoutMs,
      outputLimitBytes
    }
  };
}

function executablePlan(context) {
  const { tool, strategy, platform } = context;
  if (strategy.needsAdmin === true || forbiddenStrategyFields(strategy).length > 0) {
    return { blocked: "The strategy requests elevation, a shell/script, a URL, or an external repository." };
  }
  if (!reviewedFree(tool, strategy)) {
    return { deferred: "Only tools catalogued as free may be installed automatically." };
  }
  if (strategy.projectDependency === true) return npmLockfileExecution(context);
  if (platform === "darwin") return homebrewExecution(context);
  if (platform === "win32") return wingetExecution(context);
  return { deferred: "This platform has no reviewed automatic installation strategy." };
}

function probeReady(probe) {
  return probe?.ready === true || probe?.status === "ready";
}

function probeView(probe) {
  return {
    status: typeof probe?.status === "string" ? probe.status : probeReady(probe) ? "ready" : "unknown",
    ready: probeReady(probe),
    location: typeof probe?.location === "string" ? probe.location : null,
    detail: typeof probe?.probe?.detail === "string"
      ? redactSensitiveText(probe.probe.detail).slice(0, 1000)
      : typeof probe?.detail === "string"
        ? redactSensitiveText(probe.detail).slice(0, 1000)
        : null
  };
}

function approvalView(required) {
  return {
    required,
    localUserOnly: true,
    explicitConfirmationRequired: true,
    oneShot: true
  };
}

function safeEnvironment(environment = process.env) {
  const admitted = [
    "APPDATA",
    "COMSPEC",
    "HOME",
    "HOMEDRIVE",
    "HOMEPATH",
    "LOCALAPPDATA",
    "PATH",
    "PATHEXT",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USERPROFILE",
    "WINDIR"
  ];
  const result = {};
  for (const name of admitted) {
    const matched = Object.keys(environment).find((candidate) => candidate.toUpperCase() === name);
    if (matched && typeof environment[matched] === "string") result[matched] = environment[matched];
  }
  return {
    ...result,
    CI: "1",
    HOMEBREW_NO_ANALYTICS: "1",
    HOMEBREW_NO_AUTO_UPDATE: "1",
    NO_COLOR: "1",
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
    NPM_CONFIG_UPDATE_NOTIFIER: "false"
  };
}

function capOutputs(stdout, stderr, maximumBytes) {
  let remaining = maximumBytes;
  let truncated = false;
  const take = (value) => {
    const source = Buffer.from(typeof value === "string" ? value : "", "utf8");
    const selected = source.subarray(0, Math.max(remaining, 0));
    remaining -= selected.length;
    if (selected.length < source.length) truncated = true;
    return redactSensitiveText(selected.toString("utf8"));
  };
  return { stdout: take(stdout), stderr: take(stderr), truncated };
}

function defaultSpawnCommand(execution) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(execution.command, execution.args, {
        cwd: execution.cwd,
        env: safeEnvironment(),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      resolve({
        started: false,
        exitCode: null,
        signal: null,
        timedOut: false,
        stdout: "",
        stderr: "",
        errorCode: error?.code || "SPAWN_FAILED",
        errorMessage: error?.message || "The installer process could not be started."
      });
      return;
    }

    const stdout = [];
    const stderr = [];
    let capturedBytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;
    let processError = null;

    const capture = (target, chunk) => {
      const source = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = Math.max(execution.outputLimitBytes - capturedBytes, 0);
      if (remaining > 0) {
        const selected = source.subarray(0, remaining);
        target.push(selected);
        capturedBytes += selected.length;
      }
      if (source.length > remaining) truncated = true;
    };
    child.stdout?.on("data", (chunk) => capture(stdout, chunk));
    child.stderr?.on("data", (chunk) => capture(stderr, chunk));

    const finish = (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(forceFinish);
      resolve({
        started: !processError,
        exitCode: Number.isInteger(exitCode) ? exitCode : null,
        signal: typeof signal === "string" ? signal : null,
        timedOut,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        truncated,
        errorCode: processError?.code || null,
        errorMessage: processError?.message || null
      });
    };

    let forceFinish;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
      forceFinish = setTimeout(() => {
        child.kill("SIGKILL");
        finish(null, "SIGKILL");
      }, 2_000);
      forceFinish.unref?.();
    }, execution.timeoutMs);
    timeout.unref?.();

    child.once("error", (error) => {
      processError = error;
      finish(null, null);
    });
    child.once("close", finish);
  });
}

function normalizedProcessResult(result, outputLimitBytes) {
  const outputs = capOutputs(result?.stdout, result?.stderr, outputLimitBytes);
  return {
    started: result?.started !== false && !result?.errorCode,
    exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : null,
    signal: typeof result?.signal === "string" ? result.signal : null,
    timedOut: result?.timedOut === true,
    stdout: outputs.stdout,
    stderr: outputs.stderr,
    outputTruncated: outputs.truncated || result?.truncated === true,
    errorCode: typeof result?.errorCode === "string" ? result.errorCode : null,
    errorMessage: typeof result?.errorMessage === "string"
      ? redactSensitiveText(result.errorMessage).slice(0, 1000)
      : null
  };
}

function publicExecution(execution) {
  if (!execution) return null;
  return {
    manager: execution.manager,
    command: execution.command,
    args: [...execution.args],
    cwd: execution.cwd,
    shell: false,
    timeoutMs: execution.timeoutMs,
    outputLimitBytes: execution.outputLimitBytes,
    ...(execution.package ? { package: execution.package, integrity: execution.integrity } : {})
  };
}

/**
 * Creates the policy module used by the loopback server for missing-tool installs.
 * The caller supplies authenticated actors; process execution and probing are
 * injectable so the same interface is exercised without machine changes in tests.
 */
export async function createToolInstallService(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || MODULE_ROOT);
  const platform = options.platform || process.platform;
  const catalogInput = options.catalog
    || await readJson(path.join(projectRoot, "toolchain", "media-tools.json"));
  const rootPackageInput = options.rootPackage
    || await readJson(path.join(projectRoot, "package.json"));
  const lockfileInput = options.lockfile
    || await readJson(path.join(projectRoot, "package-lock.json"));
  const catalog = cloneJson(catalogInput, "Tool catalog");
  const rootPackage = cloneJson(rootPackageInput, "Root package manifest");
  const lockfile = cloneJson(lockfileInput, "Project lockfile");
  const timeoutMs = Math.min(Math.max(options.timeoutMs || DEFAULT_INSTALL_TIMEOUT_MS, 1_000), DEFAULT_INSTALL_TIMEOUT_MS);
  const outputLimitBytes = Math.min(Math.max(options.outputLimitBytes || DEFAULT_OUTPUT_LIMIT_BYTES, 1_024), 1024 * 1024);
  const approvalTtlMs = Math.min(Math.max(options.approvalTtlMs || DEFAULT_APPROVAL_TTL_MS, 1_000), 30 * 60 * 1000);
  const now = options.now || (() => Date.now());
  const spawnCommand = options.spawnCommand || defaultSpawnCommand;
  const nonce = options.nonce || (() => randomBytes(32).toString("hex"));
  const approvalSecret = options.approvalSecret
    ? Buffer.from(options.approvalSecret)
    : randomBytes(32);
  if (approvalSecret.length < 32) {
    throw installError("The approval secret must contain at least 32 bytes.", "INSTALL_CONFIGURATION_INVALID", 500);
  }
  if (!Array.isArray(catalog.tools)) {
    throw installError("The tool catalog must contain a tools array.", "INSTALL_CONFIGURATION_INVALID", 500);
  }
  const tools = new Map();
  for (const tool of catalog.tools) {
    if (!tool || typeof tool.id !== "string" || tools.has(tool.id)) {
      throw installError("The tool catalog contains an invalid or duplicate ID.", "INSTALL_CONFIGURATION_INVALID", 500);
    }
    tools.set(tool.id, tool);
  }

  const defaultProbe = async (toolId) => {
    const { detectTools } = await import("./tool-catalog.mjs");
    return (await detectTools({ probe: true })).find((tool) => tool.id === toolId) || null;
  };
  const probeTool = options.probeTool || defaultProbe;
  const approvals = new Map();

  function purgeExpiredApprovals() {
    const currentTime = now();
    for (const [hash, approval] of approvals) {
      if (approval.expiresAt <= currentTime) approvals.delete(hash);
    }
    while (approvals.size >= MAX_PENDING_APPROVALS) {
      approvals.delete(approvals.keys().next().value);
    }
  }

  async function inspect(request) {
    const toolId = toolIdFrom(request);
    const tool = tools.get(toolId);
    if (!tool) throw installError(`Tool ${toolId} is not in the reviewed catalog.`, "TOOL_NOT_CATALOGUED", 404);

    let observed;
    try {
      observed = await probeTool(toolId, { probe: true, platform, projectRoot });
    } catch (error) {
      throw installError(
        `Could not inspect ${tool.name}: ${redactSensitiveText(error?.message || "probe failed")}`,
        "TOOL_PROBE_FAILED",
        503
      );
    }
    if (!observed || typeof observed !== "object") {
      throw installError(`The ${tool.name} probe returned no result.`, "TOOL_PROBE_FAILED", 503);
    }

    const probe = probeView(observed);
    const strategy = tool.install?.[platform];
    const base = {
      schemaVersion: 1,
      tool: { id: tool.id, name: tool.name, tier: tool.tier || null, kind: tool.kind || null },
      platform,
      observed: probe,
      approval: approvalView(false),
      execution: null,
      planHash: null,
      documentationUrl: null
    };

    if (!SAFE_PLATFORMS.has(platform) || !catalog.policy?.supportedPlatforms?.includes(platform)) {
      return { ...base, disposition: "deferred", reason: "This platform is outside the reviewed tool-install policy." };
    }
    if (!strategy) {
      return { ...base, disposition: "deferred", reason: "No catalogued installation strategy exists for this platform." };
    }
    if (strategy.manual === true) {
      return {
        ...base,
        disposition: "manual",
        reason: typeof strategy.reason === "string" ? strategy.reason.slice(0, 1000) : "This tool requires a manual installer.",
        documentationUrl: safeDocumentationUrl(tool.officialUrl)
      };
    }
    if (strategy.unsupported === true || strategy.projectExtension === true) {
      return {
        ...base,
        disposition: "deferred",
        reason: typeof strategy.reason === "string"
          ? strategy.reason.slice(0, 1000)
          : strategy.projectExtension
            ? "Project extensions require a separate workflow-specific review."
            : "The catalog marks this strategy as unsupported."
      };
    }

    const candidate = executablePlan({
      tool,
      strategy,
      platform,
      projectRoot,
      rootPackage,
      lockfile,
      timeoutMs,
      outputLimitBytes
    });
    if (candidate.blocked) return { ...base, disposition: "blocked", reason: candidate.blocked };
    if (candidate.deferred) return { ...base, disposition: "deferred", reason: candidate.deferred };

    const execution = candidate.execution;
    const binding = {
      toolId: tool.id,
      platform,
      manager: execution.manager,
      command: execution.command,
      args: execution.args,
      cwd: execution.cwd
    };
    const planHash = planHashFor(binding);
    if (probe.ready) {
      return {
        ...base,
        disposition: "already-ready",
        reason: "The reviewed probe already reports this tool as ready.",
        planHash
      };
    }
    return {
      ...base,
      disposition: "approval-required",
      reason: "This missing free tool has a reviewed automatic installation strategy.",
      approval: approvalView(true),
      execution: publicExecution(execution),
      planHash
    };
  }

  async function approve(request = {}) {
    const toolId = toolIdFrom(request);
    const actorId = assertLocalUser(request.actor);
    if (request.confirmed !== true) {
      throw installError("Explicit local-user confirmation is required.", "INSTALL_CONFIRMATION_REQUIRED", 403);
    }
    if (!validHash(request.planHash)) {
      throw installError("A valid reviewed plan hash is required.", "INSTALL_PLAN_HASH_INVALID");
    }
    const plan = await inspect(toolId);
    if (plan.disposition !== "approval-required" || !plan.execution) {
      throw installError("This tool does not currently have an executable approval-required plan.", "INSTALL_PLAN_NOT_EXECUTABLE", 409);
    }
    if (plan.planHash !== request.planHash) {
      throw installError("The reviewed install plan changed; inspect and review it again.", "INSTALL_PLAN_STALE", 409);
    }

    purgeExpiredApprovals();
    const issuedAt = now();
    const expiresAt = issuedAt + approvalTtlMs;
    const approvalNonce = nonce();
    const approvalHash = createHmac("sha256", approvalSecret)
      .update(canonicalBinding({
        toolId,
        platform,
        manager: plan.execution.manager,
        command: plan.execution.command,
        args: plan.execution.args,
        cwd: plan.execution.cwd
      }))
      .update("\0")
      .update(actorId)
      .update("\0")
      .update(String(issuedAt))
      .update("\0")
      .update(String(approvalNonce))
      .digest("hex");
    approvals.set(approvalHash, {
      actorId,
      toolId,
      platform,
      planHash: plan.planHash,
      execution: plan.execution,
      issuedAt,
      expiresAt
    });
    return {
      schemaVersion: 1,
      approvalHash,
      toolId,
      platform,
      planHash: plan.planHash,
      actorId,
      issuedAt,
      expiresAt,
      oneShot: true
    };
  }

  async function execute(request = {}) {
    const toolId = toolIdFrom(request);
    const actorId = assertLocalUser(request.actor);
    if (!validHash(request.approvalHash) || !validHash(request.planHash)) {
      throw installError("A valid one-shot approval and reviewed plan hash are required.", "INSTALL_APPROVAL_INVALID", 403);
    }
    purgeExpiredApprovals();
    const approval = approvals.get(request.approvalHash);
    if (!approval
      || approval.toolId !== toolId
      || approval.platform !== platform
      || approval.actorId !== actorId
      || approval.planHash !== request.planHash) {
      throw installError("The install approval is invalid, expired, already used, or bound to another plan.", "INSTALL_APPROVAL_INVALID", 403);
    }

    // Consume before inspecting or spawning. A failed attempt can never replay a
    // machine-change approval; the user must review a fresh plan.
    approvals.delete(request.approvalHash);
    if (approval.expiresAt <= now()) {
      throw installError("The install approval expired; review the current plan again.", "INSTALL_APPROVAL_EXPIRED", 403);
    }

    const currentPlan = await inspect(toolId);
    if (currentPlan.planHash !== approval.planHash) {
      throw installError("The install plan changed after approval; no process was started.", "INSTALL_PLAN_STALE", 409);
    }

    const startedAt = now();
    if (currentPlan.disposition === "already-ready") {
      return {
        schemaVersion: 1,
        receiptId: randomUUID(),
        toolId,
        platform,
        planHash: approval.planHash,
        approvedBy: actorId,
        approvalConsumed: true,
        startedAt,
        finishedAt: startedAt,
        outcome: "already-ready-before-install",
        ok: true,
        installed: false,
        ready: true,
        execution: null,
        process: null,
        verification: currentPlan.observed
      };
    }
    if (currentPlan.disposition !== "approval-required") {
      throw installError("The approved plan is no longer executable; no process was started.", "INSTALL_PLAN_STALE", 409);
    }

    let rawProcessResult;
    try {
      rawProcessResult = await spawnCommand({
        ...approval.execution,
        args: [...approval.execution.args],
        shell: false
      });
    } catch (error) {
      rawProcessResult = {
        started: false,
        exitCode: null,
        signal: null,
        timedOut: false,
        stdout: "",
        stderr: "",
        errorCode: error?.code || "SPAWN_FAILED",
        errorMessage: error?.message || "The installer process failed before returning a result."
      };
    }
    const processResult = normalizedProcessResult(rawProcessResult, outputLimitBytes);

    let verification = null;
    let verificationError = null;
    try {
      verification = probeView(await probeTool(toolId, { probe: true, platform, projectRoot }));
    } catch (error) {
      verificationError = redactSensitiveText(error?.message || "The post-install probe failed.").slice(0, 1000);
    }

    const processSucceeded = processResult.started
      && !processResult.timedOut
      && processResult.exitCode === 0;
    const ready = verification?.ready === true;
    let outcome;
    if (verificationError) outcome = "verification-failed";
    else if (processResult.timedOut) outcome = ready ? "ready-after-timed-out-attempt" : "installer-timed-out";
    else if (!processSucceeded) outcome = ready ? "ready-after-failed-attempt" : "installer-failed";
    else if (!ready) outcome = "installer-exited-but-tool-not-ready";
    else outcome = "installed-and-ready";

    return {
      schemaVersion: 1,
      receiptId: randomUUID(),
      toolId,
      platform,
      planHash: approval.planHash,
      approvedBy: actorId,
      approvalConsumed: true,
      startedAt,
      finishedAt: now(),
      outcome,
      ok: processSucceeded && ready,
      installed: processSucceeded && ready,
      ready,
      execution: publicExecution(approval.execution),
      process: processResult,
      verification: verification || { status: "unknown", ready: false, location: null, detail: verificationError }
    };
  }

  return Object.freeze({ inspect, approve, execute });
}
