import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSupportedPlatform } from "../server/platform-support.mjs";
import { createMediaVerifier, resolveMediaBinaries } from "../server/media-verifier.mjs";
import { runCapcut } from "./capcut.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREFIX = "framepilot-capcut-smoke-";

function run(command, arguments_, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: ROOT,
      env: { ...process.env, NO_COLOR: "1" },
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 256 * 1024) stderr += chunk.toString("utf8");
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Command stopped with ${signal || `exit ${code}`}.`));
    });
  });
}

async function capcut(arguments_, environment) {
  const code = await runCapcut(arguments_, { environment });
  if (code !== 0) throw new Error(`CapCut CLI command failed: ${arguments_[0]}`);
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function assertDisposableRoot(directory) {
  if (path.dirname(directory) !== os.tmpdir() || !path.basename(directory).startsWith(PREFIX)) {
    throw new Error("Refusing to clean a CapCut smoke directory outside the admitted temporary root.");
  }
}

async function main() {
  assertSupportedPlatform();
  const directory = await mkdtemp(path.join(os.tmpdir(), PREFIX));
  const source = path.join(directory, "source.mp4");
  const drafts = path.join(directory, "drafts");
  const draft = path.join(drafts, "CutStewardSmoke");
  const output = path.join(directory, "capcut-preview.mp4");
  const capcutEnvironment = {
    ...process.env,
    CAPCUT_CLI_APP_VERSIONS: path.join(directory, "capcut-app-versions.json"),
    XDG_CONFIG_HOME: path.join(directory, "config")
  };

  try {
    const binaries = await resolveMediaBinaries({ rootDirectory: ROOT });
    if (!binaries.integrity.ok || !binaries.ffmpeg || !binaries.ffprobe) {
      throw new Error(binaries.integrity.detail || "Admitted media binaries are unavailable.");
    }

    await run(binaries.ffmpeg, [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30",
      "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000",
      "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-shortest", source
    ]);

    await capcut(["init", "CutStewardSmoke", "--drafts", drafts], capcutEnvironment);
    await capcut(["add-video", draft, source, "0", "2"], capcutEnvironment);
    await capcut(["add-text", draft, "0", "2", "CutSteward verified", "--font-size", "18", "--color", "#FFFFFF"], capcutEnvironment);
    await capcut(["lint", draft], capcutEnvironment);
    await capcut(["render", draft, "--out", output, "--scale", "1", "--fps", "30"], capcutEnvironment);

    const verification = await createMediaVerifier({ rootDirectory: ROOT }).verify(output);
    if (verification.result !== "pass") throw new Error(`Proxy verification failed: ${verification.detail}`);
    const file = await stat(output);
    const videoStream = verification.metadata?.streams?.find((stream) => stream.codec_type === "video");
    return {
      ok: true,
      platform: `${process.platform}/${process.arch}`,
      lint: "0 errors, 0 warnings",
      render: {
        bytes: file.size,
        sha256: await sha256(output),
        durationSeconds: Number(verification.metadata?.format?.duration || 0),
        codec: videoStream?.codec_name,
        width: videoStream?.width,
        height: videoStream?.height,
        frames: Number(videoStream?.nb_read_frames || 0)
      },
      verification: verification.detail,
      temporaryDataPreserved: false
    };
  } finally {
    assertDisposableRoot(directory);
    await rm(directory, { recursive: true });
  }
}

try {
  console.log(JSON.stringify(await main(), null, 2));
} catch (error) {
  console.error(`CutSteward CapCut smoke: ${error.message}`);
  process.exitCode = 1;
}
