import { constants, existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMediaBinaries } from "./media-verifier.mjs";
import { resolveBlenderExecutable } from "../scripts/blender.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(path.join(ROOT, "toolchain", "media-tools.json"), "utf8"));
const lockfile = JSON.parse(await readFile(path.join(ROOT, "package-lock.json"), "utf8"));
const platformKey = process.platform;

function candidateNames(name) {
  if (process.platform !== "win32") return [name];
  return [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`];
}

function expandEnvironment(candidate) {
  return candidate.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
}

async function findExecutable(name) {
  const directories = [
    path.join(ROOT, "node_modules", ".bin"),
    ...(process.env.PATH || "").split(path.delimiter).filter(Boolean)
  ];
  for (const directory of directories) {
    for (const candidateName of candidateNames(name)) {
      const candidate = path.join(directory, candidateName);
      try {
        await access(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch {
        // Detection is intentionally read-only and never executes a candidate.
      }
    }
  }
  return null;
}

function missingStatus(tool, strategy) {
  if (strategy?.unsupported) return "unavailable";
  if (strategy?.projectExtension) return "available-on-demand";
  if (["required", "required-for-repositories"].includes(tool.tier)) return "missing";
  return "optional";
}

function probeExecutable(executable, tool) {
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
    ok: result.status === 0 && (!tool.version || output.includes(tool.version)),
    detail: output.split("\n")[0] || result.error?.code || "Version probe failed"
  };
}

function approvedIntegrity(tool) {
  if (!tool.npmIntegrity) return true;
  const packageName = tool.npmPackage || tool.id;
  const locked = lockfile.packages?.[`node_modules/${packageName}`];
  return locked?.version === tool.version && locked?.integrity === tool.npmIntegrity;
}

export async function detectTools({ probe = false } = {}) {
  return Promise.all(catalog.tools.map(async (tool) => {
    const executablePaths = [];
    const mediaBinaries = tool.id === "ffmpeg" ? await resolveMediaBinaries({ rootDirectory: ROOT }) : null;
    const blenderExecutable = tool.id === "blender" ? await resolveBlenderExecutable() : null;
    for (const executable of tool.executables || []) {
      const found = mediaBinaries?.[executable] || (executable === "blender" ? blenderExecutable : null) || await findExecutable(executable);
      if (found) executablePaths.push(found);
    }
    const appPaths = (tool.applicationPaths?.[platformKey] || [])
      .map(expandEnvironment)
      .filter((candidate) => !candidate.includes("%") && existsSync(candidate));
    const hasAllExecutables = (tool.executables || []).length > 0
      && executablePaths.length === tool.executables.length;
    const found = hasAllExecutables || appPaths.length > 0;
    const strategy = tool.install?.[platformKey];
    const integrityOk = approvedIntegrity(tool) && (mediaBinaries?.integrity?.ok ?? true);
    const probeResults = probe && hasAllExecutables && integrityOk
      ? executablePaths.map((executable) => probeExecutable(executable, tool))
      : [];
    const probeOk = probeResults.length > 0 && probeResults.every((result) => result.ok) && integrityOk;
    const status = !found
      ? missingStatus(tool, strategy)
      : probeOk
        ? "ready"
        : integrityOk
          ? "detected"
          : "blocked";
    return {
      id: tool.id,
      name: tool.name,
      tier: tool.tier,
      kind: tool.kind,
      status,
      location: found ? (executablePaths[0] || appPaths[0]) : null,
      capabilities: tool.capabilities,
      disclaimer: tool.disclaimer || null,
      probe: {
        checked: probeResults.length > 0,
        ok: probeOk,
        detail: probeResults.map((result) => result.detail).join(" · ")
          || (mediaBinaries?.integrity?.ok === false ? mediaBinaries.integrity.detail : found ? "Detected; run the device check to verify" : "Not detected")
      },
      integrityOk
    };
  }));
}
