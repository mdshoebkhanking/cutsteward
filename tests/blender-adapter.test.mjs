import { EventEmitter } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  BLENDER_ADAPTER_ID,
  TRUSTED_DRIVER,
  buildBlenderArguments,
  describeAdapter,
  launchBlenderJob,
  loadAndValidateJob,
  parseArguments,
  resolveBlenderExecutable,
  runDoctor,
  SMOKE_PNG,
  sha256File,
  validateJobDocument
} from "../scripts/blender.mjs";

async function createProject({ sequence = false, expectedSha } = {}) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "framepilot-blender-adapter-test-"));
  const inputDirectory = path.join(projectRoot, "inputs");
  await mkdir(inputDirectory);
  await mkdir(path.join(projectRoot, "outputs"));
  const first = path.join(inputDirectory, "screen-0001.png");
  const second = path.join(inputDirectory, "screen-0002.png");
  await writeFile(first, Buffer.from("normalized-screen-frame-one"));
  await writeFile(second, Buffer.from("normalized-screen-frame-two"));
  const frames = [first, second];
  const screen = sequence
    ? {
        kind: "image-sequence",
        frames: await Promise.all(frames.map(async (filePath) => ({
          path: path.relative(projectRoot, filePath),
          sha256: await sha256File(filePath)
        })))
      }
    : {
        kind: "image",
        path: path.relative(projectRoot, first),
        sha256: expectedSha || await sha256File(first)
      };
  const job = {
    schemaVersion: 1,
    projectRoot,
    jobId: sequence ? "sequence-job" : "image-job",
    screen,
    output: { directory: "outputs" },
    render: {
      width: 1080,
      height: 1920,
      fps: 30,
      startFrame: 1,
      endFrame: sequence ? 2 : 1,
      timeoutMs: 60_000,
      samples: 16
    },
    scene: {
      devicePreset: "phone-rounded-v1",
      cameraPreset: "three-quarter-left",
      cameraMotion: "settle",
      lightingPreset: "soft-studio-v1",
      screenFit: "contain"
    }
  };
  const jobPath = path.join(projectRoot, "device-stage-job.json");
  await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`);
  return { projectRoot, jobPath, job, first, second };
}

describe("first-class Blender device-stage contract", () => {
  it("describes a local, macOS/Windows-only adapter with no arbitrary scene or script surface", () => {
    const adapter = describeAdapter();
    expect(adapter).toMatchObject({
      id: BLENDER_ADAPTER_ID,
      supportedPlatforms: ["darwin", "win32"],
      safety: {
        acceptsBlendFiles: false,
        acceptsArbitraryPython: false,
        shell: false,
        trustedDriver: "toolchain/blender/device_stage.py"
      }
    });
    expect(adapter.capabilities).toEqual(expect.arrayContaining([
      "device-mockup",
      "camera-lighting",
      "screen-image-texture",
      "screen-video-texture",
      "rgba-frame-sequence"
    ]));
  });

  it("builds the exact safe Blender argument array and launches with shell false", async () => {
    const jobPath = path.resolve("project/job.json");
    const driverPath = path.resolve("trusted/device_stage.py");
    const expectedArguments = [
      "--background",
      "--factory-startup",
      "--disable-autoexec",
      "--python",
      driverPath,
      "--",
      "--job",
      jobPath
    ];
    expect(buildBlenderArguments(jobPath, driverPath)).toEqual(expectedArguments);

    let invocation;
    const fakeSpawn = (command, arguments_, options) => {
      invocation = { command, arguments_, options };
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => true;
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    };
    await expect(launchBlenderJob({
      executable: path.resolve("fake/blender"),
      arguments_: expectedArguments,
      cwd: path.resolve("project"),
      timeoutMs: 5_000,
      environment: { PATH: process.env.PATH, GEMINI_API_KEY: "must-not-cross" },
      spawnProcess: fakeSpawn
    })).resolves.toMatchObject({ code: 0, signal: null });
    expect(invocation).toMatchObject({
      command: path.resolve("fake/blender"),
      arguments_: expectedArguments,
      options: { shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
    });
    expect(invocation.options.env).not.toHaveProperty("GEMINI_API_KEY");
    expect(invocation.options.env).toMatchObject({ PYTHONNOUSERSITE: "1" });
  });

  it("admits a SHA-bound image and an exact normalized image sequence", async () => {
    const image = await createProject();
    const sequence = await createProject({ sequence: true });
    try {
      const imageResult = await loadAndValidateJob(image.jobPath);
      expect(imageResult.job.screen.kind).toBe("image");
      expect(imageResult.resolvedInputs).toHaveLength(1);
      expect(imageResult.outputDirectoryReal).toBe(await import("node:fs/promises").then(({ realpath }) => realpath(path.join(image.projectRoot, "outputs"))));

      const sequenceResult = await loadAndValidateJob(sequence.jobPath);
      expect(sequenceResult.job.screen.kind).toBe("image-sequence");
      expect(sequenceResult.resolvedInputs).toHaveLength(2);
      expect(sequenceResult.job.render.endFrame - sequenceResult.job.render.startFrame + 1).toBe(2);
    } finally {
      await rm(image.projectRoot, { recursive: true, force: true });
      await rm(sequence.projectRoot, { recursive: true, force: true });
    }
  });

  it("rejects path escape, symlink components, and a changed screen hash", async () => {
    const escape = await createProject();
    const linked = await createProject();
    const wrongHash = await createProject({ expectedSha: "0".repeat(64) });
    try {
      const outside = path.join(path.dirname(escape.projectRoot), "outside-screen.png");
      await writeFile(outside, "outside");
      escape.job.screen.path = "../outside-screen.png";
      await writeFile(escape.jobPath, JSON.stringify(escape.job));
      await expect(loadAndValidateJob(escape.jobPath)).rejects.toThrow(/escapes the absolute project root/);
      await rm(outside, { force: true });

      const realDirectory = path.join(linked.projectRoot, "real-inputs");
      const linkedDirectory = path.join(linked.projectRoot, "linked-inputs");
      await mkdir(realDirectory);
      const linkedImage = path.join(realDirectory, "screen.png");
      await writeFile(linkedImage, "linked screen");
      await symlink(realDirectory, linkedDirectory, process.platform === "win32" ? "junction" : "dir");
      linked.job.screen.path = "linked-inputs/screen.png";
      linked.job.screen.sha256 = await sha256File(linkedImage);
      await writeFile(linked.jobPath, JSON.stringify(linked.job));
      await expect(loadAndValidateJob(linked.jobPath)).rejects.toThrow(/symbolic link/);

      await expect(loadAndValidateJob(wrongHash.jobPath)).rejects.toThrow(/SHA-256 does not match/);
    } finally {
      await rm(escape.projectRoot, { recursive: true, force: true });
      await rm(linked.projectRoot, { recursive: true, force: true });
      await rm(wrongHash.projectRoot, { recursive: true, force: true });
    }
  });

  it("forbids arbitrary Python, .blend files, unknown executable fields, and unbounded jobs", () => {
    expect(() => parseArguments(["render", "--python", "/tmp/evil.py"])).toThrow(/arbitrary Python/);
    expect(() => parseArguments(["render", "--job", path.resolve("evil.blend")])).toThrow(/\.blend files/);
    expect(() => parseArguments(["render", "--job", path.resolve("evil.py")])).toThrow(/arbitrary Python/);
    expect(() => validateJobDocument({
      schemaVersion: 1,
      projectRoot: path.resolve("project"),
      jobId: "forbidden",
      python: "/tmp/evil.py",
      screen: {},
      output: {},
      render: {}
    })).toThrow(/job\.python is not admitted/);

    expect(() => validateJobDocument({
      schemaVersion: 1,
      projectRoot: path.resolve("project"),
      jobId: "too-large",
      screen: { kind: "image", path: "screen.png", sha256: "0".repeat(64) },
      output: { directory: "outputs" },
      render: { width: 8000, height: 8000, fps: 30, startFrame: 1, endFrame: 1, timeoutMs: 60_000 }
    })).toThrow(/render\.width/);
  });

  it("reports absent Blender truthfully without executing a probe", async () => {
    let probeCalls = 0;
    const result = await runDoctor({
      platform: "darwin",
      environment: { PATH: "" },
      locate: async () => null,
      spawnSyncProcess: () => {
        probeCalls += 1;
        return { status: 0, stdout: "Blender 99.0" };
      }
    });
    expect(result).toMatchObject({
      ok: false,
      available: false,
      executable: null,
      reason: "Blender was not found; no render was attempted."
    });
    expect(result.installHint).toMatch(/brew install --cask blender/);
    expect(probeCalls).toBe(0);
  });

  it("finds a renamed Blender bundle in the bounded user Applications directory by exact bundle id", async () => {
    const fakeHome = await mkdtemp(path.join(os.tmpdir(), "framepilot-blender-home-"));
    try {
      const bundle = path.join(fakeHome, "Applications", "Blender-4.5.12-Project.app");
      const executable = path.join(bundle, "Contents", "MacOS", "Blender");
      await mkdir(path.dirname(executable), { recursive: true });
      await writeFile(executable, "#!/bin/sh\nexit 0\n");
      await chmod(executable, 0o755);
      await writeFile(path.join(bundle, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>org.blenderfoundation.blender</string>
<key>CFBundleExecutable</key><string>Blender</string>
</dict></plist>`);

      await expect(resolveBlenderExecutable({ platform: "darwin", environment: { HOME: fakeHome, PATH: "" } }))
        .resolves.toBe(await import("node:fs/promises").then(({ realpath }) => realpath(executable)));
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });

  it("ships a fully decodable RGBA PNG for the real Blender smoke input", () => {
    expect(SMOKE_PNG.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const width = SMOKE_PNG.readUInt32BE(16);
    const height = SMOKE_PNG.readUInt32BE(20);
    expect(SMOKE_PNG[25]).toBe(6);
    const chunks = [];
    for (let offset = 8; offset + 12 <= SMOKE_PNG.length;) {
      const length = SMOKE_PNG.readUInt32BE(offset);
      const type = SMOKE_PNG.toString("ascii", offset + 4, offset + 8);
      if (type === "IDAT") chunks.push(SMOKE_PNG.subarray(offset + 8, offset + 8 + length));
      offset += 12 + length;
    }
    expect(() => inflateSync(Buffer.concat(chunks))).not.toThrow();
    expect(inflateSync(Buffer.concat(chunks))).toHaveLength(height * (1 + width * 4));
  });

  it("keeps the checked-in driver fixed and free of untrusted scene-loading calls", async () => {
    const source = await readFile(TRUSTED_DRIVER, "utf8");
    expect(source).toContain("clear_factory_scene");
    expect(source).toContain("Trusted procedural phone");
    expect(source).toContain('"colorMode": "RGBA"');
    expect(source).not.toMatch(/open_mainfile|read_factory_settings|enable-autoexec|exec\s*\(|eval\s*\(/);
    expect(source).toContain("if unknown:");
    expect(source).not.toContain('require(not unknown, f"{label}.{unknown[0]}');
    expect(source).toContain('scene.frame_start = job["render"]["startFrame"]');
    expect(source).toContain('scene.frame_end = job["render"]["endFrame"]');
    expect(source).not.toContain("scene.render.frame_start");
    expect(source).not.toContain("scene.render.frame_end");
    expect(source).toContain('hasattr(scene.eevee, "gtao_distance")');
    expect(source).toContain('hasattr(scene.eevee, "gtao_factor")');
  });
});
