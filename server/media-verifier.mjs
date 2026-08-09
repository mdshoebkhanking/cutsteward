import { constants } from "node:fs";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const BUNDLED_BINARY_SHA256 = {
  "darwin-arm64": {
    ffmpeg: "a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584",
    ffprobe: "bb2db6f5d8cef919da12fbf592119a987202a8c060a886f3cab091f9cab90b64"
  },
  "darwin-x64": {
    ffmpeg: "ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894",
    ffprobe: "fa3add0ce901f7241abe0dfc0155d958fc834aca3f8ce61f87cc712ae669c1e0"
  },
  "win32-x64": {
    ffmpeg: "04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00",
    ffprobe: "3a7e2dc003dc2cd1472827e4c7c4f056ae1ae0ae7c5bbc580c99b49827351ba4"
  }
};

async function sha256(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function executableNames(name) {
  if (process.platform !== "win32") return [name];
  return [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`];
}

async function findOnPath(name, rootDirectory) {
  const directories = [
    path.join(rootDirectory, "node_modules", ".bin"),
    ...(process.env.PATH || "").split(path.delimiter).filter(Boolean)
  ];
  for (const directory of directories) {
    for (const candidateName of executableNames(name)) {
      const candidate = path.join(directory, candidateName);
      try {
        await access(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch {
        // Continue read-only discovery.
      }
    }
  }
  return null;
}

function packageBinary(packageName) {
  try {
    const value = require(packageName);
    if (typeof value === "string") return value;
    if (typeof value?.path === "string") return value.path;
  } catch {
    // Optional portable binary package is not installed.
  }
  return null;
}

async function executable(pathname) {
  if (!pathname) return null;
  try {
    await access(pathname, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return pathname;
  } catch {
    return null;
  }
}

function runBounded(command, args, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, NO_COLOR: "1" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let killedForSize = false;
    const append = (current, chunk) => {
      const next = Buffer.concat([current, chunk]);
      if (next.length <= MAX_OUTPUT_BYTES) return next;
      killedForSize = true;
      child.kill("SIGTERM");
      return next.subarray(0, MAX_OUTPUT_BYTES);
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout: "", stderr: error.code || error.message, timedOut: false });
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !killedForSize,
        code,
        signal,
        stdout: stdout.toString("utf8"),
        stderr: killedForSize ? "process output exceeded the safety limit" : stderr.toString("utf8"),
        timedOut: signal === "SIGTERM" && !killedForSize
      });
    });
  });
}

export async function resolveMediaBinaries({ rootDirectory }) {
  const systemFfmpeg = await findOnPath("ffmpeg", rootDirectory);
  const systemFfprobe = await findOnPath("ffprobe", rootDirectory);
  const ffmpeg = systemFfmpeg || await executable(packageBinary("ffmpeg-static"));
  const ffprobe = systemFfprobe || await executable(packageBinary("@derhuerst/ffprobe-static"));
  const bundled = BUNDLED_BINARY_SHA256[`${process.platform}-${process.arch}`];
  const integrity = { ok: true, detail: "System media binaries selected." };
  if ((!systemFfmpeg && ffmpeg) || (!systemFfprobe && ffprobe)) {
    if (!bundled) {
      integrity.ok = false;
      integrity.detail = `No admitted bundled-media hash exists for ${process.platform}-${process.arch}.`;
    } else {
      const [ffmpegHash, ffprobeHash] = await Promise.all([
        !systemFfmpeg && ffmpeg ? sha256(ffmpeg) : Promise.resolve(null),
        !systemFfprobe && ffprobe ? sha256(ffprobe) : Promise.resolve(null)
      ]);
      const ffmpegOk = systemFfmpeg || ffmpegHash === bundled.ffmpeg;
      const ffprobeOk = systemFfprobe || ffprobeHash === bundled.ffprobe;
      integrity.ok = Boolean(ffmpegOk && ffprobeOk);
      integrity.detail = integrity.ok
        ? "Bundled media binaries match the admitted per-platform SHA-256 values."
        : "A bundled media binary failed its admitted SHA-256 check.";
    }
  }
  return {
    ffmpeg: integrity.ok ? ffmpeg : null,
    ffprobe: integrity.ok ? ffprobe : null,
    integrity,
    sources: { ffmpeg: systemFfmpeg ? "system" : "bundled", ffprobe: systemFfprobe ? "system" : "bundled" }
  };
}

export function createMediaVerifier({ rootDirectory }) {
  let resolvedPromise;

  async function resolve() {
    resolvedPromise ||= resolveMediaBinaries({ rootDirectory });
    return resolvedPromise;
  }

  return {
    async probe() {
      const binaries = await resolve();
      if (!binaries.ffmpeg || !binaries.ffprobe) {
        return {
          ready: false,
          ffmpeg: Boolean(binaries.ffmpeg),
          ffprobe: Boolean(binaries.ffprobe),
          integrity: binaries.integrity,
          detail: binaries.integrity?.ok === false
            ? binaries.integrity.detail
            : "FFmpeg and ffprobe must both be available before media can be certified."
        };
      }
      const [ffmpegVersion, ffprobeVersion] = await Promise.all([
        runBounded(binaries.ffmpeg, ["-version"], { timeoutMs: 5_000 }),
        runBounded(binaries.ffprobe, ["-version"], { timeoutMs: 5_000 })
      ]);
      return {
        ready: ffmpegVersion.ok && ffprobeVersion.ok,
        ffmpeg: ffmpegVersion.stdout.split("\n")[0] || ffmpegVersion.stderr.split("\n")[0],
        ffprobe: ffprobeVersion.stdout.split("\n")[0] || ffprobeVersion.stderr.split("\n")[0],
        sources: binaries.sources,
        locations: { ffmpeg: binaries.ffmpeg, ffprobe: binaries.ffprobe },
        integrity: binaries.integrity,
        detail: ffmpegVersion.ok && ffprobeVersion.ok ? "Version probes passed." : "A media binary version probe failed."
      };
    },

    async verify(filePath) {
      const binaries = await resolve();
      if (!binaries.ffmpeg || !binaries.ffprobe) {
        return {
          result: "inconclusive",
          claim: "media_decode",
          method: "ffprobe-and-full-decode",
          detail: "FFmpeg or ffprobe is unavailable."
        };
      }
      const probe = await runBounded(binaries.ffprobe, [
        "-v", "error",
        "-count_frames",
        "-count_packets",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        filePath
      ], { timeoutMs: 30_000 });
      if (!probe.ok) {
        return {
          result: "fail",
          claim: "media_decode",
          method: "ffprobe-and-full-decode",
          detail: probe.stderr.trim().slice(0, 2000) || "ffprobe failed"
        };
      }
      let metadata;
      try {
        metadata = JSON.parse(probe.stdout);
      } catch {
        return {
          result: "fail",
          claim: "media_decode",
          method: "ffprobe-and-full-decode",
          detail: "ffprobe returned malformed JSON"
        };
      }
      const streams = Array.isArray(metadata.streams) ? metadata.streams : [];
      if (!streams.some((stream) => stream.codec_type === "video")) {
        return {
          result: "fail",
          claim: "media_decode",
          method: "ffprobe-and-full-decode",
          detail: "No video stream was found.",
          metadata
        };
      }
      const decode = await runBounded(binaries.ffmpeg, [
        "-v", "error",
        "-xerror",
        "-err_detect", "explode",
        "-i", filePath,
        "-map", "0",
        "-f", "null",
        process.platform === "win32" ? "NUL" : "/dev/null"
      ], { timeoutMs: 120_000 });
      return {
        result: decode.ok ? "pass" : "fail",
        claim: "media_decode",
        method: "ffprobe-and-full-decode",
        detail: decode.ok ? "ffprobe metadata and full decode passed." : decode.stderr.trim().slice(0, 2000) || "full decode failed",
        metadata: {
          format: metadata.format,
          streams: streams.map((stream) => ({
            index: stream.index,
            codec_type: stream.codec_type,
            codec_name: stream.codec_name,
            profile: stream.profile,
            width: stream.width,
            height: stream.height,
            pix_fmt: stream.pix_fmt,
            r_frame_rate: stream.r_frame_rate,
            avg_frame_rate: stream.avg_frame_rate,
            nb_read_frames: stream.nb_read_frames,
            sample_rate: stream.sample_rate,
            channels: stream.channels,
            channel_layout: stream.channel_layout,
            color_range: stream.color_range,
            color_space: stream.color_space,
            color_transfer: stream.color_transfer,
            color_primaries: stream.color_primaries
          }))
        }
      };
    }
  };
}
