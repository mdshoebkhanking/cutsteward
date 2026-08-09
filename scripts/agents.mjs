import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertSupportedPlatform } from "../server/platform-support.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(path.join(ROOT, "toolchain", "agent-runtimes.json"), "utf8"));

function candidateNames(name) {
  if (process.platform !== "win32") return [name];
  return [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`];
}

async function findExecutable(commands) {
  for (const directory of (process.env.PATH || "").split(path.delimiter).filter(Boolean)) {
    for (const command of commands) {
      for (const name of candidateNames(command)) {
        const candidate = path.join(directory, name);
        try {
          await access(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
          return candidate;
        } catch {
          // Continue read-only discovery.
        }
      }
    }
  }
  return null;
}

function probe(executable, runtime) {
  const result = spawnSync(executable, runtime.versionArgs, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 128 * 1024,
    shell: false,
    timeout: 5000,
    windowsHide: true
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim().split("\n")[0];
  return { ok: result.status === 0, output: output || result.error?.code || "probe failed" };
}

function probeCodexInitialize(executable) {
  return new Promise((resolve) => {
      const childProcess = spawn(executable, ["app-server", "--stdio"], {
        cwd: ROOT,
        env: { ...process.env, NO_COLOR: "1" },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        childProcess.kill("SIGTERM");
        resolve(result);
      };
      const timer = setTimeout(() => finish({ ok: false, detail: "initialize timed out" }), 5000);
      childProcess.stdout.setEncoding("utf8");
      childProcess.stderr.setEncoding("utf8");
      childProcess.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (stdout.length > 256 * 1024) return finish({ ok: false, detail: "initialize output exceeded limit" });
        const lines = stdout.split("\n");
        stdout = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const message = JSON.parse(line);
            if (message.id === 1 && message.result?.userAgent) {
              return finish({ ok: true, detail: `${message.result.userAgent} · ${message.result.platformOs}` });
            }
          } catch {
            return finish({ ok: false, detail: "initialize emitted malformed JSON" });
          }
        }
      });
      childProcess.stderr.on("data", (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-16 * 1024);
      });
      childProcess.once("error", (error) => finish({ ok: false, detail: error.code || error.message }));
      childProcess.once("exit", (code) => {
        if (!settled) finish({ ok: false, detail: stderr.trim().split("\n")[0] || `app-server exited ${code}` });
      });
      childProcess.stdin.write(`${JSON.stringify({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "cutsteward-probe", version: "0.1.0" },
          capabilities: { experimentalApi: false }
        }
      })}\n`);
  });
}

async function doctor() {
  console.log(`CutSteward agent runtimes · ${process.platform}/${process.arch}\n`);
  for (const runtime of catalog.runtimes) {
    const executable = await findExecutable(runtime.commands);
    if (!executable) {
      console.log(`× ${runtime.name}: not detected`);
      console.log(`  Preferred adapter: ${runtime.preferredAdapter}`);
      continue;
    }
    const result = probe(executable, runtime);
    console.log(`${result.ok ? "✓" : "!"} ${runtime.name}: ${result.output}`);
    if (result.ok && runtime.protocolProbe === "codex-initialize-v1") {
      const protocol = await probeCodexInitialize(executable);
      console.log(`  ${protocol.ok ? "✓" : "!"} app-server initialize: ${protocol.detail}`);
      console.log(protocol.ok
        ? `  ${runtime.preferredAdapter} · transport ready; connect it per production run`
        : `  ${runtime.preferredAdapter} · handoff-only until the handshake passes`);
    } else {
      console.log(`  ${runtime.preferredAdapter} · handoff-only until adapter conformance passes`);
    }
  }
}

function plan() {
  console.log("CutSteward agent adapter order\n");
  for (const [index, runtime] of catalog.runtimes.entries()) {
    console.log(`${index + 1}. ${runtime.name} · ${runtime.preferredAdapter}`);
    console.log(`   Research anchor: ${runtime.researchAnchor} · ${runtime.stability}`);
    console.log(`   ${runtime.source}`);
  }
  console.log("\nNo runtime was installed or connected. See docs/GITHUB_AGENT_CONTROL_ECOSYSTEM.md.");
}

const command = process.argv[2] || "doctor";
try {
  assertSupportedPlatform();
  if (command === "doctor") await doctor();
  else if (command === "plan") plan();
  else throw new Error("Usage: node scripts/agents.mjs <doctor|plan>");
} catch (error) {
  console.error(`CutSteward agents: ${error.message}`);
  process.exitCode = 1;
}
