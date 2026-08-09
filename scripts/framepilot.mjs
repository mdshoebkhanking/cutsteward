import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  openSync
} from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import net from "node:net";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertSupportedPlatform } from "../server/platform-support.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_DIRECTORY = path.join(ROOT, ".framepilot", "runtime");
const DEFAULT_DATA_DIRECTORY = path.join(ROOT, ".framepilot", "data");
const DATA_DIRECTORY = validateDataDirectory(
  path.resolve(process.env.FRAMEPILOT_DATA_DIR || DEFAULT_DATA_DIRECTORY)
);
const SERVER_RECORD = path.join(RUNTIME_DIRECTORY, "server.json");
const INSTALL_RECORD = path.join(RUNTIME_DIRECTORY, "install.json");
const BUILD_RECORD = path.join(RUNTIME_DIRECTORY, "build.json");
const SERVER_LOG = path.join(RUNTIME_DIRECTORY, "server.log");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const BUILD_TARGETS = [
  "index.html",
  "package-lock.json",
  "public",
  "src",
  "tsconfig.app.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vite.config.ts"
];

function validateDataDirectory(candidate) {
  const parsed = path.parse(candidate);
  if (!candidate || candidate === parsed.root) {
    throw new Error("FRAMEPILOT_DATA_DIR must be a non-root writable directory.");
  }
  return candidate;
}

function parseArguments(argv) {
  const parsed = { command: argv[0] || "help", open: true, port: null, withMedia: false };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--no-open") parsed.open = false;
    else if (argument === "--open") parsed.open = true;
    else if (argument === "--with-media") parsed.withMedia = true;
    else if (argument === "--port") {
      const value = Number.parseInt(argv[index + 1] || "", 10);
      if (!Number.isInteger(value) || value < 1024 || value > 65535) {
        throw new Error("--port must be an integer from 1024 to 65535.");
      }
      parsed.port = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return parsed;
}

function nodeVersionCheck() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const supported = major > 22 || (major === 22 && minor >= 12);
  return {
    ok: supported,
    label: `Node ${process.versions.node}`,
    detail: supported ? "compatible" : "CutSteward requires Node 22.12 or newer"
  };
}

async function ensureDirectories() {
  await mkdir(RUNTIME_DIRECTORY, { recursive: true });
  await mkdir(DATA_DIRECTORY, { recursive: true });
}

async function assertWritable(directory) {
  await mkdir(directory, { recursive: true });
  const probe = path.join(directory, `.write-check-${process.pid}-${randomUUID()}`);
  await writeFile(probe, "ok", { flag: "wx" });
  await unlink(probe);
}

async function atomicJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, filePath);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function collectFiles(target, files = []) {
  if (!existsSync(target)) return files;
  const details = await stat(target);
  if (details.isFile()) {
    files.push(target);
    return files;
  }
  const entries = await readdir(target, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    await collectFiles(path.join(target, entry.name), files);
  }
  return files;
}

async function hashTargets(targets) {
  const files = [];
  for (const target of targets) await collectFiles(path.join(ROOT, target), files);
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(path.relative(ROOT, file));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function run(command, args, description) {
  console.log(`• ${description}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${description} failed with exit code ${result.status}.`);
}

async function ensureDependencies() {
  const lockfile = path.join(ROOT, "package-lock.json");
  await access(lockfile, constants.R_OK);
  const lockHash = await hashTargets(["package.json", "package-lock.json"]);
  const record = await readJson(INSTALL_RECORD);
  const nodeModules = path.join(ROOT, "node_modules");
  const npmVersionResult = spawnSync(npmCommand, ["--version"], { cwd: ROOT, encoding: "utf8", shell: false, windowsHide: true });
  const npmVersion = npmVersionResult.status === 0 ? npmVersionResult.stdout.trim() : "unknown";
  const installIdentity = {
    nodeMajor: process.versions.node.split(".")[0],
    modulesAbi: process.versions.modules,
    npmVersion,
    platform: process.platform,
    arch: process.arch
  };
  const matchesIdentity = Object.entries(installIdentity).every(([key, value]) => record?.[key] === value);
  if (
    existsSync(nodeModules)
    && existsSync(path.join(nodeModules, ".package-lock.json"))
    && record?.lockHash === lockHash
    && matchesIdentity
  ) {
    console.log("• Local dependencies already match the lockfile");
    return lockHash;
  }
  run(npmCommand, ["ci", "--include=dev", "--no-audit", "--no-fund"], "Installing locked local dependencies");
  await atomicJson(INSTALL_RECORD, {
    lockHash,
    ...installIdentity,
    installedAt: new Date().toISOString()
  });
  return lockHash;
}

async function ensureBuild() {
  const buildHash = await hashTargets(BUILD_TARGETS);
  const record = await readJson(BUILD_RECORD);
  if (existsSync(path.join(ROOT, "dist", "index.html")) && record?.buildHash === buildHash) {
    console.log("• Local UI build is current");
    return buildHash;
  }
  run(npmCommand, ["run", "build"], "Building the local UI");
  await atomicJson(BUILD_RECORD, { buildHash, builtAt: new Date().toISOString() });
  return buildHash;
}

async function runtimeHash(buildHash) {
  const serverHash = await hashTargets([
    "server",
    "scripts/framepilot.mjs",
    "package.json",
    "toolchain/media-tools.json",
    "toolchain/agent-runtimes.json"
  ]);
  return createHash("sha256").update(`${buildHash}:${serverHash}`).digest("hex");
}

function canListen(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      probe.close(() => resolve(true));
    });
  });
}

async function selectPort(preferred, explicit) {
  if (explicit) {
    if (!(await canListen(preferred))) throw new Error(`Requested port ${preferred} is already in use.`);
    return preferred;
  }
  for (let candidate = preferred; candidate <= preferred + 30; candidate += 1) {
    if (await canListen(candidate)) return candidate;
  }
  throw new Error(`No available loopback port found near ${preferred}.`);
}

function getHealth(url, timeout = 1200) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const request = http.get(`${url}/api/health`, {
      headers: { Accept: "application/json", Connection: "close" }
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > 64 * 1024) {
          response.destroy();
          return finish(null);
        }
        chunks.push(chunk);
      });
      response.once("end", () => {
        if (response.statusCode !== 200) return finish(null);
        try {
          finish(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          finish(null);
        }
      });
      response.once("error", () => finish(null));
    });
    request.setTimeout(timeout, () => {
      request.destroy();
      finish(null);
    });
    request.once("error", () => finish(null));
  });
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopVerified({ quiet = false } = {}) {
  const record = await readJson(SERVER_RECORD);
  if (!record) {
    if (!quiet) console.log("CutSteward is already stopped.");
    return;
  }
  const health = await getHealth(record.url);
  if (health?.instanceId === record.instanceId) {
    process.kill(record.pid, "SIGTERM");
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (!(await getHealth(record.url, 250))) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await rm(SERVER_RECORD, { force: true });
    if (!quiet) console.log("CutSteward stopped. Local data was preserved.");
    return;
  }
  if (!processExists(record.pid)) {
    await rm(SERVER_RECORD, { force: true });
    if (!quiet) console.log("Removed a stale runtime record. Local data was preserved.");
    return;
  }
  throw new Error("The recorded PID is alive but its CutSteward identity cannot be verified; it was not killed.");
}

async function pollUntilHealthy(record, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const health = await getHealth(record.url, 800);
    if (health?.ready === true && health.instanceId === record.instanceId) return health;
    await new Promise((resolve) => setTimeout(resolve, 220));
  }
  return null;
}

async function attemptBrowserOpen(url) {
  if (process.env.CI === "1" || process.env.NO_BROWSER === "1") return false;
  let command;
  let args;
  if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else if (process.platform === "win32") {
    command = "cmd.exe";
    args = ["/d", "/s", "/c", "start", "", url];
  } else {
    return false;
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
      child.once("error", () => finish(false));
      child.once("spawn", () => {
        child.unref();
        finish(true);
      });
    } catch {
      finish(false);
    }
  });
}

async function startServer(buildHash, options) {
  const expectedRuntimeHash = await runtimeHash(buildHash);
  const existing = await readJson(SERVER_RECORD);
  if (existing) {
    const health = await getHealth(existing.url);
    if (health?.instanceId === existing.instanceId && health.buildHash === expectedRuntimeHash) {
      console.log(`CutSteward is already healthy at ${existing.url}`);
      if (options.open) await attemptBrowserOpen(existing.url);
      return existing;
    }
    await stopVerified({ quiet: true });
  }

  const environmentPort = process.env.FRAMEPILOT_PORT
    ? Number.parseInt(process.env.FRAMEPILOT_PORT, 10)
    : null;
  if (environmentPort && (!Number.isInteger(environmentPort) || environmentPort < 1024 || environmentPort > 65535)) {
    throw new Error("FRAMEPILOT_PORT must be an integer from 1024 to 65535.");
  }
  const explicitPort = options.port ?? environmentPort;
  const port = await selectPort(explicitPort || 4173, explicitPort !== null);
  const instanceId = randomUUID();
  const url = `http://127.0.0.1:${port}`;
  const logDescriptor = openSync(SERVER_LOG, "a");
  const child = spawn(process.execPath, [path.join(ROOT, "server", "index.mjs")], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", logDescriptor, logDescriptor],
    windowsHide: true,
    env: {
      ...process.env,
      FRAMEPILOT_BUILD_HASH: expectedRuntimeHash,
      FRAMEPILOT_DATA_DIR: DATA_DIRECTORY,
      FRAMEPILOT_INSTANCE_ID: instanceId,
      FRAMEPILOT_PORT: String(port)
    }
  });
  closeSync(logDescriptor);
  child.unref();
  const record = {
    schemaVersion: 1,
    pid: child.pid,
    port,
    url,
    instanceId,
    buildHash: expectedRuntimeHash,
    startedAt: new Date().toISOString(),
    logPath: SERVER_LOG
  };
  const health = await pollUntilHealthy(record);
  if (!health) {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      // The process may have already exited.
    }
    throw new Error(`Local server did not become healthy within 15 seconds. See ${SERVER_LOG}`);
  }
  await atomicJson(SERVER_RECORD, record);
  console.log(`CutSteward is ready: ${url}`);
  if (options.open) {
    const attempted = await attemptBrowserOpen(url);
    console.log(attempted ? "• Opening the default browser" : "• Browser opening is unavailable; use the URL above");
  }
  return record;
}

async function doctor() {
  const checks = [];
  const node = nodeVersionCheck();
  checks.push(node);
  checks.push({ ok: existsSync(path.join(ROOT, "package-lock.json")), label: "Lockfile", detail: "package-lock.json" });
  try {
    await assertWritable(DATA_DIRECTORY);
    checks.push({ ok: true, label: "Project data", detail: DATA_DIRECTORY });
  } catch (error) {
    checks.push({ ok: false, label: "Project data", detail: error.message });
  }
  const portAvailable = await canListen(4173);
  checks.push({ ok: true, label: "Local port", detail: portAvailable ? "4173 available" : "4173 occupied; setup will choose a nearby port" });
  const buildRecord = await readJson(BUILD_RECORD);
  const currentBuildHash = await hashTargets(BUILD_TARGETS);
  const buildCurrent = existsSync(path.join(ROOT, "dist", "index.html")) && buildRecord?.buildHash === currentBuildHash;
  checks.push({ ok: buildCurrent, label: "UI build", detail: buildCurrent ? "current" : "run npm run setup" });

  const runtimeNames = ["hermes", "claude", "codex", "kimi", "agy"];
  const pathEntries = (process.env.PATH || "").split(path.delimiter);
  const detected = runtimeNames.filter((name) => pathEntries.some((entry) => {
    const candidates = process.platform === "win32" ? [name, `${name}.exe`, `${name}.cmd`] : [name];
    return candidates.some((candidate) => existsSync(path.join(entry, candidate)));
  }));

  console.log("CutSteward doctor\n");
  for (const check of checks) console.log(`${check.ok ? "✓" : "×"} ${check.label}: ${check.detail}`);
  console.log(`ℹ Agent executables detected (not connected): ${detected.join(", ") || "none"}`);
  console.log(`ℹ Platform: ${os.platform()} ${os.arch()}`);
  console.log(`ℹ Log: ${SERVER_LOG}`);
  return checks.every((check) => check.ok || check.label === "UI build");
}

async function status() {
  const record = await readJson(SERVER_RECORD);
  if (!record) {
    console.log("CutSteward is stopped.");
    return false;
  }
  const health = await getHealth(record.url);
  if (health?.instanceId === record.instanceId) {
    const buildRecord = await readJson(BUILD_RECORD);
    const currentBuildHash = await hashTargets(BUILD_TARGETS);
    const expectedRuntimeHash = buildRecord ? await runtimeHash(buildRecord.buildHash) : null;
    const current = buildRecord?.buildHash === currentBuildHash
      && record.buildHash === expectedRuntimeHash
      && health.buildHash === expectedRuntimeHash;
    if (current) {
      console.log(`CutSteward is healthy: ${record.url}`);
      return true;
    }
    console.log(`CutSteward is healthy but source/build changed; run npm run setup to restart it: ${record.url}`);
    return false;
  }
  console.log(`CutSteward runtime record is stale. See ${record.logPath || SERVER_LOG}`);
  return false;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (["help", "--help", "-h"].includes(options.command)) {
    console.log("Usage: node scripts/framepilot.mjs <setup|start|stop|status|doctor> [--no-open] [--port 4173] [--with-media]");
    return;
  }
  assertSupportedPlatform();
  const node = nodeVersionCheck();
  if (!node.ok) throw new Error(node.detail);
  await ensureDirectories();

  if (options.command === "doctor") {
    if (!(await doctor())) process.exitCode = 1;
    return;
  }
  if (options.command === "status") {
    if (!(await status())) process.exitCode = 1;
    return;
  }
  if (options.command === "stop") {
    await stopVerified();
    return;
  }
  if (options.command === "setup") {
    await assertWritable(DATA_DIRECTORY);
    await ensureDependencies();
    if (options.withMedia) {
      run(process.execPath, [path.join(ROOT, "scripts", "toolchain.mjs"), "install", "--approve", "--all"], "Installing and verifying the declared media toolchain");
      try {
        run(process.execPath, [path.join(ROOT, "scripts", "video-use.mjs"), "install"], "Admitting the pinned video-use quarantine");
        run(process.execPath, [path.join(ROOT, "scripts", "video-use.mjs"), "smoke"], "Verifying video-use with a disposable offline render");
      } catch (error) {
        console.log(`  Experimental video-use adapter deferred: ${error.message}`);
      }
    }
    const buildHash = await ensureBuild();
    await startServer(buildHash, options);
    return;
  }
  if (options.command === "start") {
    const buildRecord = await readJson(BUILD_RECORD);
    if (!buildRecord || !existsSync(path.join(ROOT, "dist", "index.html"))) {
      throw new Error("The local UI is not built. Run npm run setup first.");
    }
    await startServer(buildRecord.buildHash, options);
    return;
  }
  throw new Error(`Unknown command: ${options.command}`);
}

main().catch((error) => {
  console.error(`CutSteward: ${error.message}`);
  process.exitCode = 1;
});
