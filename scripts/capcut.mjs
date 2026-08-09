import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertSupportedPlatform } from "../server/platform-support.mjs";
import { resolveMediaBinaries } from "../server/media-verifier.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAPCUT_ENTRY = path.join(ROOT, "node_modules", "capcut-cli", "dist", "index.js");

export function mediaPath({ ffmpeg, ffprobe }, inheritedPath = "") {
  return [...new Set([path.dirname(ffmpeg), path.dirname(ffprobe)])]
    .concat(inheritedPath ? [inheritedPath] : [])
    .join(path.delimiter);
}

export async function runCapcut(arguments_ = process.argv.slice(2), { environment = process.env } = {}) {
  assertSupportedPlatform();
  await access(CAPCUT_ENTRY);

  const binaries = await resolveMediaBinaries({ rootDirectory: ROOT });
  if (!binaries.integrity.ok || !binaries.ffmpeg || !binaries.ffprobe) {
    throw new Error(binaries.integrity.detail || "FFmpeg and ffprobe are required for the admitted CapCut CLI wrapper.");
  }

  const child = spawn(process.execPath, [CAPCUT_ENTRY, ...arguments_], {
    cwd: ROOT,
    env: {
      ...environment,
      NO_COLOR: environment.NO_COLOR || "1",
      PATH: mediaPath(binaries, environment.PATH || "")
    },
    stdio: "inherit",
    shell: false,
    windowsHide: true
  });

  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal) reject(new Error(`CapCut CLI stopped by ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = await runCapcut();
  } catch (error) {
    console.error(`CutSteward CapCut wrapper: ${error.message}`);
    process.exitCode = 1;
  }
}
