import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { liveAgentRuntimeCapability } from "./agent-runtime.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeCatalog = JSON.parse(await readFile(path.join(ROOT, "toolchain", "agent-runtimes.json"), "utf8"));

function candidateNames(command) {
  if (process.platform !== "win32") return [command];
  const extensions = (process.env.PATHEXT || ".EXE;.CMD;.BAT")
    .split(";")
    .filter(Boolean);
  return [command, ...extensions.map((extension) => `${command}${extension.toLowerCase()}`)];
}

async function findOnPath(commands) {
  const directories = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const command of commands) {
      for (const name of candidateNames(command)) {
        const candidate = path.join(directory, name);
        try {
          await access(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
          return candidate;
        } catch {
          // Keep probing. Detection never executes the candidate.
        }
      }
    }
  }
  return null;
}

export async function detectRuntimes() {
  const detected = await Promise.all(
    runtimeCatalog.runtimes.map(async (runtime) => {
      const executable = await findOnPath(runtime.commands);
      const liveCapability = liveAgentRuntimeCapability(runtime.id);
      const liveAdapter = Boolean(executable) && Boolean(liveCapability);
      const presence = executable ? "detected" : "not-detected";
      const control = liveCapability
        ? {
            mode: "live",
            state: executable ? "ready" : "blocked",
            adapterId: liveCapability.adapterId,
            protocol: liveCapability.protocol,
            reason: executable ? null : "runtime-not-detected"
          }
        : {
            mode: "handoff",
            state: executable ? "ready" : "blocked",
            adapterId: null,
            protocol: null,
            reason: executable ? "direct-adapter-not-implemented" : "runtime-not-detected"
          };
      return {
        id: runtime.id,
        name: runtime.name,
        status: presence,
        presence,
        control,
        executable: executable ? path.basename(executable) : null,
        integration: liveAdapter ? "live-adapter" : "handoff-only",
        preferredAdapter: runtime.preferredAdapter,
        stability: runtime.stability,
        capabilitiesToProbe: runtime.capabilitiesToProbe,
        detail: liveAdapter
          ? `Found locally. ${runtime.preferredAdapter} can establish a verified per-run live session.`
          : executable
            ? `Found locally. Direct control through ${runtime.preferredAdapter} is not implemented yet.`
            : "Not found on this computer."
      };
    })
  );

  return [
    {
      id: "local-demo",
      name: "Local demo",
      status: "ready",
      presence: "built-in",
      control: {
        mode: "demo",
        state: "ready",
        adapterId: "built-in-demo",
        protocol: "local",
        reason: null
      },
      executable: null,
      integration: "built-in-demo",
      preferredAdapter: "built-in-demo",
      stability: "local-only",
      capabilitiesToProbe: [],
      detail: "UI-only sample. It never contacts a provider or uploads a file."
    },
    ...detected
  ];
}
