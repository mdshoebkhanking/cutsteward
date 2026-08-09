import { constants, existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertSupportedPlatform } from "../server/platform-support.mjs";
import { resolveMediaBinaries } from "../server/media-verifier.mjs";
import { resolveBlenderExecutable } from "./blender.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(ROOT, "toolchain", "media-tools.json"), "utf8"));
const rootPackage = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
const lockfile = JSON.parse(await readFile(path.join(ROOT, "package-lock.json"), "utf8"));
const extensionPacks = JSON.parse(await readFile(path.join(ROOT, "toolchain", "extension-packs.json"), "utf8"));
const platform = process.platform;
const platformKey = platform;

function candidateNames(name) {
  if (platform !== "win32") return [name];
  return [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`];
}

function expandEnvironment(candidate) {
  return candidate.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
}

async function findExecutable(names) {
  const directories = [
    path.join(ROOT, "node_modules", ".bin"),
    ...(process.env.PATH || "").split(path.delimiter).filter(Boolean)
  ];
  for (const name of names) {
    for (const directory of directories) {
      for (const candidateName of candidateNames(name)) {
        const candidate = path.join(directory, candidateName);
        try {
          await access(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
          return candidate;
        } catch {
          // Continue probing without executing arbitrary files.
        }
      }
    }
  }
  return null;
}

async function inspect(tool) {
  const executablePaths = [];
  const mediaBinaries = tool.id === "ffmpeg" ? await resolveMediaBinaries({ rootDirectory: ROOT }) : null;
  const blenderExecutable = tool.id === "blender" ? await resolveBlenderExecutable() : null;
  for (const executable of tool.executables || []) {
    const located = mediaBinaries?.[executable] || (executable === "blender" ? blenderExecutable : null) || await findExecutable([executable]);
    if (located) executablePaths.push(located);
  }
  const appPaths = (tool.applicationPaths?.[platformKey] || [])
    .map(expandEnvironment)
    .filter((candidate) => !candidate.includes("%") && existsSync(candidate));
  const requiredExecutableCount = (tool.executables || []).length;
  const found = requiredExecutableCount > 0
    ? executablePaths.length === requiredExecutableCount
    : appPaths.length > 0;
  const packageName = tool.npmPackage || tool.id;
  const lockedPackage = lockfile.packages?.[`node_modules/${packageName}`];
  const integrityOk = (!tool.npmIntegrity
    || (lockedPackage?.version === tool.version && lockedPackage?.integrity === tool.npmIntegrity))
    && (mediaBinaries?.integrity?.ok ?? true);
  const probes = found && requiredExecutableCount > 0 && integrityOk
    ? executablePaths.map((executable) => {
        const result = spawnSync(executable, tool.probeArgs || ["--version"], {
          cwd: ROOT,
          encoding: "utf8",
          env: { ...process.env, NO_COLOR: "1" },
          maxBuffer: 256 * 1024,
          shell: false,
          timeout: 5000,
          windowsHide: true
        });
        const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim().slice(0, 4000);
        return {
          executable,
          ok: result.status === 0 && (!tool.version || output.includes(tool.version)),
          output,
          error: result.error?.code || null
        };
      })
    : [];
  const ready = found && probes.every((probe) => probe.ok) && integrityOk;
  return { tool, found, ready, executablePaths, appPaths, probes, integrityOk, integrityDetail: mediaBinaries?.integrity?.detail || null };
}

async function inspectAll() {
  return Promise.all(manifest.tools.map(inspect));
}

function installDescription(tool) {
  const strategy = tool.install?.[platformKey];
  if (!strategy) return "No catalogued strategy for this platform";
  if (strategy.unsupported) return `Unsupported: ${strategy.reason}`;
  if (strategy.manual) return `Manual handoff: ${strategy.reason}`;
  if (strategy.projectDependency) return `Locked project dependency: ${strategy.package}`;
  if (strategy.projectExtension) return "Install at a pinned version only when a workflow selects this extension";
  return `${strategy.manager} ${strategy.args.join(" ")}`;
}

async function doctor({ quiet = false } = {}) {
  const results = await inspectAll();
  if (!quiet) {
    console.log(`CutSteward media toolchain · ${platform}/${process.arch}\n`);
    for (const result of results) {
      const location = result.executablePaths[0] || result.appPaths[0] || "missing";
      console.log(`${result.ready ? "✓" : result.found ? "!" : "×"} ${result.tool.name}: ${location}`);
      if (result.found && !result.ready) {
        const reason = !result.integrityOk
          ? result.integrityDetail || "lockfile integrity/version does not match the approved manifest"
          : result.probes.find((probe) => !probe.ok)?.error || "version probe failed";
        console.log(`  Detected but not ready: ${reason}`);
      } else if (!result.found) {
        console.log(`  ${installDescription(result.tool)}`);
      }
    }
  }
  return results;
}

function managerCommand(strategy) {
  if (strategy.needsAdmin) {
    throw new Error(`Installing with ${strategy.manager} requires administrator rights. Stop here and let the user run the reviewed command.`);
  }
  return { command: strategy.manager, args: strategy.args };
}

function executeInstall(tool, strategy) {
  if (strategy.projectDependency) {
    const versionSeparator = strategy.package.lastIndexOf("@");
    const declaredVersion = strategy.package.slice(versionSeparator + 1);
    const packageName = strategy.package.slice(0, versionSeparator);
    const actualVersion = rootPackage.dependencies?.[packageName]
      || rootPackage.optionalDependencies?.[packageName]
      || rootPackage.devDependencies?.[packageName];
    if (actualVersion !== declaredVersion) {
      throw new Error(`${tool.name} must be declared exactly as ${strategy.package} before installation.`);
    }
    const npmCommand = platform === "win32" ? "npm.cmd" : "npm";
    console.log(`\nInstalling ${tool.name} from the project lockfile`);
    const result = spawnSync(npmCommand, ["ci", "--include=dev", "--no-audit", "--no-fund"], {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
      timeout: 10 * 60 * 1000
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${tool.name} project install exited with code ${result.status}.`);
    return;
  }
  const { command, args } = managerCommand(strategy);
  console.log(`\nInstalling ${tool.name} with ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    timeout: 20 * 60 * 1000
  });
  if (result.error?.code === "ENOENT") {
    throw new Error(`${command} is not available. Install the package manager or follow ${tool.officialUrl}`);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${tool.name} installer exited with code ${result.status}.`);
}

async function install({ approve, all }) {
  if (!approve) {
    throw new Error("Installation changes this computer. Re-run with --approve after reviewing npm run tools:plan.");
  }
  const before = await inspectAll();
  for (const result of before) {
    if (result.ready) continue;
    const tool = result.tool;
    const selected = tool.tier === "required" || tool.tier === "required-for-repositories" || (all && tool.tier === "large-optional");
    const strategy = tool.install?.[platformKey];
    if (!selected || !strategy) continue;
    if (strategy.manual || strategy.unsupported || strategy.projectExtension) {
      console.log(`\n${tool.name}: ${installDescription(tool)}\n${tool.officialUrl}`);
      continue;
    }
    try {
      executeInstall(tool, strategy);
    } catch (error) {
      if (!["required", "required-for-repositories"].includes(tool.tier)) {
        console.log(`  Optional install deferred: ${error.message}`);
        continue;
      }
      throw error;
    }
  }

  const after = await doctor();
  const missingRequired = after.filter((result) => !result.ready && ["required", "required-for-repositories"].includes(result.tool.tier));
  if (missingRequired.length) {
    throw new Error(`Required media tools are still missing: ${missingRequired.map((result) => result.tool.name).join(", ")}`);
  }
  const manual = after.filter((result) => !result.found && result.tool.tier === "manual-optional");
  if (manual.length) {
    console.log("\nManual desktop handoffs remain optional and were not reported as CLI-controlled.");
  }
}

function plan() {
  console.log(`CutSteward media install plan · ${platform}/${process.arch}\n`);
  for (const tool of manifest.tools) {
    console.log(`${tool.tier.padEnd(25)} ${tool.name}`);
    console.log(`  ${installDescription(tool)}`);
    console.log(`  ${tool.officialUrl}`);
  }
  console.log("\nNothing was installed. Use npm run tools:install -- --approve [--all] after review.");
}

function catalog() {
  console.log("CutSteward researched extension packs\n");
  for (const pack of extensionPacks.packs) {
    console.log(`${pack.id.padEnd(28)} ${pack.tool} ${pack.version}`);
    console.log(`  ${pack.contribution}`);
    console.log(`  Gates: ${pack.gates.join(", ")}`);
    console.log(`  ${pack.source}`);
  }
  console.log("\nNothing was installed. Packs activate only after a workflow selects them and their gates pass.");
}

const [command = "doctor", ...arguments_] = process.argv.slice(2);
const options = {
  approve: arguments_.includes("--approve"),
  all: arguments_.includes("--all")
};

try {
  assertSupportedPlatform();
  if (command === "doctor") await doctor();
  else if (command === "plan") plan();
  else if (command === "catalog") catalog();
  else if (command === "install") await install(options);
  else throw new Error("Usage: node scripts/toolchain.mjs <doctor|plan|catalog|install> [--approve] [--all]");
} catch (error) {
  console.error(`CutSteward toolchain: ${error.message}`);
  process.exitCode = 1;
}
