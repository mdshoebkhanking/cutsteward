import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const projectDirectory = path.resolve(import.meta.dirname, "..");
const releaseCheckScript = path.join(projectDirectory, "scripts/release-check.mjs");
const temporaryDirectories = [];
let mediaFixtureDirectory;
let validLaunchDemo;
let validTrustDemo;
let wrongDurationLaunchDemo;
let wrongDimensionsLaunchDemo;
let wrongFrameRateLaunchDemo;
let videoOnlyLaunchDemo;

function run(command, argumentsList, options = {}) {
  const result = spawnSync(command, argumentsList, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options
  });
  if (result.error) throw result.error;
  return result;
}

function minimalMp4() {
  const payload = Buffer.alloc(24);
  payload.writeUInt32BE(payload.length, 0);
  payload.write("ftyp", 4, "ascii");
  payload.write("isom", 8, "ascii");
  payload.writeUInt32BE(0x200, 12);
  payload.write("isom", 16, "ascii");
  payload.write("mp42", 20, "ascii");
  return payload;
}

function mp4WithSize(size) {
  const payload = Buffer.alloc(size);
  payload.writeUInt32BE(24, 0);
  payload.write("ftyp", 4, "ascii");
  payload.write("isom", 8, "ascii");
  payload.writeUInt32BE(0x200, 12);
  payload.write("isom", 16, "ascii");
  payload.write("mp42", 20, "ascii");
  return payload;
}

async function createMediaFixture({
  filename,
  duration,
  width,
  height,
  frameRate = 30,
  withAudio = true
}) {
  const outputPath = path.join(mediaFixtureDirectory, filename);
  const ffmpegExport = require("ffmpeg-static");
  const ffmpeg = typeof ffmpegExport === "string" ? ffmpegExport : ffmpegExport?.path;
  if (!ffmpeg) throw new Error("The project-local FFmpeg test dependency is unavailable");
  const result = run(ffmpeg, [
    "-hide_banner",
    "-loglevel", "error",
    "-f", "lavfi",
    "-i", `color=c=black:s=${width}x${height}:r=${frameRate}`,
    ...(withAudio ? ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"] : []),
    "-t", String(duration),
    "-r", String(frameRate),
    "-c:v", "mpeg4",
    "-q:v", "31",
    "-pix_fmt", "yuv420p",
    ...(withAudio
      ? ["-c:a", "aac", "-b:a", "32k", "-ar", "48000", "-ac", "2"]
      : []),
    "-movflags", "+faststart",
    "-y",
    outputPath
  ]);
  if (result.status !== 0) {
    throw new Error("Project-local FFmpeg could not create a release-check fixture");
  }
  return readFile(outputPath);
}

async function createRepository(files) {
  const directory = await mkdtemp(path.join(tmpdir(), "cutsteward-release-check-test-"));
  temporaryDirectories.push(directory);
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(directory, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }
  expect(run("git", ["init", "--initial-branch=main"], { cwd: directory }).status).toBe(0);
  expect(run("git", ["add", "-A"], { cwd: directory }).status).toBe(0);
  return directory;
}

function validReleaseFiles(extra = {}) {
  if (!validLaunchDemo || !validTrustDemo) {
    throw new Error("Release-check media fixtures were not initialized");
  }
  return {
    "demos/cutsteward-launch-demo-12s.mp4": validLaunchDemo,
    "demos/cutsteward-trust-demo-15s.mp4": validTrustDemo,
    ...extra
  };
}

function runReleaseCheck(directory, environment = {}) {
  return run(process.execPath, [releaseCheckScript], {
    cwd: directory,
    env: { ...process.env, ...environment }
  });
}

beforeAll(async () => {
  mediaFixtureDirectory = await mkdtemp(
    path.join(tmpdir(), "cutsteward-release-check-media-")
  );
  validLaunchDemo = await createMediaFixture({
    filename: "launch.mp4",
    duration: 12,
    width: 1920,
    height: 1080
  });
  validTrustDemo = await createMediaFixture({
    filename: "trust.mp4",
    duration: 15,
    width: 1080,
    height: 1920
  });
  wrongDurationLaunchDemo = await createMediaFixture({
    filename: "launch-11s.mp4",
    duration: 11,
    width: 1920,
    height: 1080
  });
  wrongDimensionsLaunchDemo = await createMediaFixture({
    filename: "launch-1280x720.mp4",
    duration: 12,
    width: 1280,
    height: 720
  });
  wrongFrameRateLaunchDemo = await createMediaFixture({
    filename: "launch-24fps.mp4",
    duration: 12,
    width: 1920,
    height: 1080,
    frameRate: 24
  });
  videoOnlyLaunchDemo = await createMediaFixture({
    filename: "launch-video-only.mp4",
    duration: 12,
    width: 1920,
    height: 1080,
    withAudio: false
  });
});

afterAll(async () => {
  if (mediaFixtureDirectory) {
    await rm(mediaFixtureDirectory, { recursive: true, force: true });
  }
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("public release gate", () => {
  it("passes a clean staged release index", async () => {
    const directory = await createRepository(
      validReleaseFiles({
        "README.md": [
          "[Launch](demos/cutsteward-launch-demo-12s.mp4)",
          "[Trust](demos/cutsteward-trust-demo-15s.mp4)"
        ].join("\n")
      })
    );

    const result = runReleaseCheck(directory);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Release check passed");
    expect(result.stderr).toBe("");
  });

  it("rejects a missing required demo and a Markdown link to it", async () => {
    const directory = await createRepository({
      "demos/cutsteward-launch-demo-12s.mp4": minimalMp4(),
      "README.md": "[Trust](demos/cutsteward-trust-demo-15s.mp4)\n"
    });

    const result = runReleaseCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[required]");
    expect(result.stderr).toContain("[link]");
    expect(result.stderr).toContain("README.md:1");
  });

  it("reports secret and user-home path findings without echoing sensitive text", async () => {
    const secret = ["sk", "proj", "A".repeat(32)].join("-");
    const unprefixedSecret = "c".repeat(32);
    const userName = "release-owner";
    const privatePath = ["", "Users", userName, "private", "clip.mov"].join("/");
    const directory = await createRepository(
      validReleaseFiles({
        "notes.txt": [
          `token=${secret}`,
          `ELEVENLABS_API_KEY=${unprefixedSecret}`,
          `source=${privatePath}`
        ].join("\n")
      })
    );

    const result = runReleaseCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[secret] notes.txt:1");
    expect(result.stderr).toContain("[secret] notes.txt:2");
    expect(result.stderr).toContain("[path] notes.txt:3");
    expect(result.stderr).not.toContain(secret);
    expect(result.stderr).not.toContain(unprefixedSecret);
    expect(result.stderr).not.toContain(userName);
  });

  it("allows larger public demos but rejects an ordinary file over five MiB", async () => {
    const sixMiB = 6 * 1024 * 1024;
    const directory = await createRepository({
      "demos/cutsteward-launch-demo-12s.mp4": mp4WithSize(sixMiB),
      "demos/cutsteward-trust-demo-15s.mp4": mp4WithSize(sixMiB),
      "large.bin": Buffer.alloc(5 * 1024 * 1024 + 1)
    });

    const result = runReleaseCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[size] large.bin");
    expect(result.stderr).not.toContain("[size] demos/");
  });

  it("rejects a required demo that is not an MP4 ftyp file", async () => {
    const directory = await createRepository({
      "demos/cutsteward-launch-demo-12s.mp4": Buffer.from("not a media file"),
      "demos/cutsteward-trust-demo-15s.mp4": minimalMp4()
    });

    const result = runReleaseCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "[mp4] demos/cutsteward-launch-demo-12s.mp4"
    );
  });

  it("rejects an MP4-shaped header that is not decodable media", async () => {
    const directory = await createRepository({
      "demos/cutsteward-launch-demo-12s.mp4": minimalMp4(),
      "demos/cutsteward-trust-demo-15s.mp4": validTrustDemo
    });

    const result = runReleaseCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "[media] demos/cutsteward-launch-demo-12s.mp4 is not decodable media"
    );
    expect(result.stderr).not.toContain(mediaFixtureDirectory);
  });

  it("rejects a decodable required demo with the wrong exact duration", async () => {
    const directory = await createRepository({
      "demos/cutsteward-launch-demo-12s.mp4": wrongDurationLaunchDemo,
      "demos/cutsteward-trust-demo-15s.mp4": validTrustDemo
    });

    const result = runReleaseCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "[media-spec] demos/cutsteward-launch-demo-12s.mp4 must be exactly 12.000 seconds"
    );
  });

  it("rejects a decodable required demo with the wrong dimensions", async () => {
    const directory = await createRepository({
      "demos/cutsteward-launch-demo-12s.mp4": wrongDimensionsLaunchDemo,
      "demos/cutsteward-trust-demo-15s.mp4": validTrustDemo
    });

    const result = runReleaseCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "[media-spec] demos/cutsteward-launch-demo-12s.mp4 must be 1920x1080"
    );
  });

  it("rejects a decodable required demo with the wrong frame rate", async () => {
    const directory = await createRepository({
      "demos/cutsteward-launch-demo-12s.mp4": wrongFrameRateLaunchDemo,
      "demos/cutsteward-trust-demo-15s.mp4": validTrustDemo
    });

    const result = runReleaseCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "[media-spec] demos/cutsteward-launch-demo-12s.mp4 must be exactly 30fps"
    );
  });

  it("rejects a decodable required demo without an audio stream", async () => {
    const directory = await createRepository({
      "demos/cutsteward-launch-demo-12s.mp4": videoOnlyLaunchDemo,
      "demos/cutsteward-trust-demo-15s.mp4": validTrustDemo
    });

    const result = runReleaseCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "[media-spec] demos/cutsteward-launch-demo-12s.mp4 must contain an audio stream"
    );
  });

  it("rejects symlinks, tracked ignored files, and links to untracked ignored files", async () => {
    const directory = await createRepository(
      validReleaseFiles({
        ".gitignore": "forced.txt\nignored.txt\n",
        "forced.txt": "must not be tracked\n",
        "ignored.txt": "must remain private\n",
        "README.md": "[Private](ignored.txt)\n"
      })
    );
    expect(run("git", ["add", "-f", "forced.txt"], { cwd: directory }).status).toBe(0);
    const linkBlob = run("git", ["hash-object", "-w", "--stdin"], {
      cwd: directory,
      input: "outside-target"
    }).stdout.trim();
    expect(
      run(
        "git",
        ["update-index", "--add", "--cacheinfo", `120000,${linkBlob},outside-link`],
        { cwd: directory }
      ).status
    ).toBe(0);

    const result = runReleaseCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[symlink] outside-link");
    expect(result.stderr).toContain("[ignored] forced.txt");
    expect(result.stderr).toContain("[link] README.md:1");
  });

  it("rejects credential filenames and content on the retired-asset hash denylist", async () => {
    const retiredAsset = Buffer.from("retired visual fixture");
    const retiredSha256 = createHash("sha256").update(retiredAsset).digest("hex");
    const directory = await createRepository(
      validReleaseFiles({
        ".env.local": "SERVICE_TOKEN=x\n",
        "public/retired.png": retiredAsset
      })
    );

    const result = runReleaseCheck(directory, {
      RELEASE_CHECK_EXTRA_DENIED_SHA256: retiredSha256
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[secret-file] .env.local");
    expect(result.stderr).toContain("[asset] public/retired.png");
    expect(result.stderr).not.toContain(retiredSha256);
  });

  it("rejects a tracked index whose total payload exceeds one hundred MiB", async () => {
    const files = validReleaseFiles();
    const fiveMiB = Buffer.alloc(5 * 1024 * 1024);
    for (let index = 0; index < 20; index += 1) {
      files[`assets/chunk-${String(index).padStart(2, "0")}.bin`] = fiveMiB;
    }
    const directory = await createRepository(files);

    const result = runReleaseCheck(directory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[size] tracked files total");
    expect(result.stderr).not.toContain("[size] assets/");
  });

  it("scans staged bytes rather than an unstaged working-tree replacement", async () => {
    const safeText = "public release note\n";
    const secret = ["sk", "proj", "B".repeat(32)].join("-");
    const directory = await createRepository(validReleaseFiles({ "notes.txt": safeText }));
    await writeFile(path.join(directory, "notes.txt"), `token=${secret}\n`);

    const stagedSafeResult = runReleaseCheck(directory);
    expect(stagedSafeResult.status).toBe(0);

    expect(run("git", ["add", "notes.txt"], { cwd: directory }).status).toBe(0);
    await writeFile(path.join(directory, "notes.txt"), safeText);
    const stagedSecretResult = runReleaseCheck(directory);

    expect(stagedSecretResult.status).toBe(1);
    expect(stagedSecretResult.stderr).toContain("[secret] notes.txt:1");
    expect(stagedSecretResult.stderr).not.toContain(secret);
  });
});
