import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMITTED_COMMIT,
  ADMITTED_REMOTE,
  buildSmokeEdl,
  expectedVideoUsePath,
  formatDoctorReport,
  inspectAdmissionPaths,
  isContainedPath,
  parseCommand,
  runDoctor,
  runInstall,
  runSmoke
} from "../scripts/video-use.mjs";

function stats({ directory = false, file = false, symlink = false } = {}) {
  return {
    isDirectory: () => directory,
    isFile: () => file,
    isSymbolicLink: () => symlink
  };
}

function fakeAdmissionFs(workspaceRoot, options = {}) {
  const repository = expectedVideoUsePath(workspaceRoot);
  const helper = path.join(repository, "helpers", "render.py");
  return {
    async lstat(candidate) {
      if (candidate === repository) {
        return stats({ directory: true, symlink: options.repositorySymlink === true });
      }
      if (candidate === helper) {
        return stats({ file: true, symlink: options.helperSymlink === true });
      }
      if (candidate === path.join(repository, ".env") && options.environmentFile === true) {
        return stats({ file: true });
      }
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    },
    async realpath(candidate) {
      if (candidate === workspaceRoot) return workspaceRoot;
      if (candidate === repository) return options.repositoryReal || repository;
      if (candidate === helper) return options.helperReal || helper;
      return candidate;
    }
  };
}

describe("video-use quarantine command", () => {
  it("admits only install, doctor, and smoke without trailing arguments", () => {
    expect(parseCommand(["install"])).toBe("install");
    expect(parseCommand(["doctor"])).toBe("doctor");
    expect(parseCommand(["smoke"])).toBe("smoke");
    expect(() => parseCommand([])).toThrow(/install\|doctor\|smoke/);
    expect(() => parseCommand(["doctor", "--path", "/tmp/repo"])).toThrow(/install\|doctor\|smoke/);
    expect(() => parseCommand(["clone"])).toThrow(/install\|doctor\|smoke/);
  });

  it("pins one repository location and commit", () => {
    expect(ADMITTED_COMMIT).toBe("92c2b34e44c205cbc2acae7f6ca7c1c219d5dd66");
    expect(expectedVideoUsePath("/workspace")).toBe(path.resolve("/workspace/.framepilot/tools/video-use"));
    expect(isContainedPath("/workspace", "/workspace/.framepilot/tools/video-use")).toBe(true);
    expect(isContainedPath("/workspace", "/workspace-other/video-use")).toBe(false);
  });

  it("rejects symlinks and realpath escapes before admitting the helper", async () => {
    const workspaceRoot = path.resolve("/workspace");
    await expect(inspectAdmissionPaths({
      workspaceRoot,
      fileSystem: fakeAdmissionFs(workspaceRoot, { repositorySymlink: true })
    })).rejects.toThrow(/symbolic link/);

    await expect(inspectAdmissionPaths({
      workspaceRoot,
      fileSystem: fakeAdmissionFs(workspaceRoot, { helperReal: path.resolve("/outside/render.py") })
    })).rejects.toThrow(/escapes/);

    await expect(inspectAdmissionPaths({
      workspaceRoot,
      fileSystem: fakeAdmissionFs(workspaceRoot, {
        helperReal: path.join(expectedVideoUsePath(workspaceRoot), "other", "render.py")
      })
    })).rejects.toThrow(/escapes/);
  });
});

describe("video-use secure installer", () => {
  it("stages only the admitted public commit and becomes a no-write idempotent check", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "framepilot-video-use-install-test-"));
    const repository = expectedVideoUsePath(workspaceRoot);
    const commands = [];
    let doctorCalls = 0;
    const doctorResult = {
      ok: true,
      checks: [],
      python: { command: "python3.10", prefixArgs: [], version: "3.10.20" },
      admission: { repository, helper: path.join(repository, "helpers", "render.py") },
      media: { ffmpeg: "/admitted/ffmpeg", ffprobe: "/admitted/ffprobe" }
    };
    const runCommand = async (command, args, options) => {
      commands.push({ command, args, options });
      const repositoryIndex = args.indexOf("-C") + 1;
      const stagingRepository = repositoryIndex > 0 ? args[repositoryIndex] : null;
      if (args.includes("checkout")) {
        await mkdir(path.join(stagingRepository, "helpers"), { recursive: true });
        await writeFile(path.join(stagingRepository, "helpers", "render.py"), "# pinned helper\n");
      }
      if (args.includes("--show-toplevel")) {
        return { code: 0, stdout: `${stagingRepository}\n`, stderr: "" };
      }
      if (args.includes("HEAD")) return { code: 0, stdout: `${ADMITTED_COMMIT}\n`, stderr: "" };
      if (args.includes("--porcelain=v1")) return { code: 0, stdout: "", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    };
    const doctorRunner = async ({ workspaceRoot: inspectedRoot }) => {
      doctorCalls += 1;
      expect(inspectedRoot).toBe(workspaceRoot);
      return doctorResult;
    };

    try {
      const installed = await runInstall({
        platform: "darwin",
        workspaceRoot,
        runCommand,
        doctorRunner,
        environment: {
          PATH: process.env.PATH || "",
          GITHUB_TOKEN: "must-not-cross-the-boundary",
          DYLD_INSERT_LIBRARIES: "/unsafe/injection.dylib"
        }
      });

      expect(installed).toMatchObject({ ok: true, installed: true, idempotent: false });
      expect(await readFile(path.join(repository, "helpers", "render.py"), "utf8")).toBe("# pinned helper\n");
      expect(commands.every(({ command }) => command === "git")).toBe(true);
      expect(commands.some(({ args }) => args.includes("remote")
        && args.slice(-4).join(" ") === `remote add origin ${ADMITTED_REMOTE}`)).toBe(true);
      expect(commands.some(({ args }) => args.includes("fetch") && args.includes(ADMITTED_COMMIT))).toBe(true);
      expect(commands.some(({ args }) => args.includes("HEAD"))).toBe(true);
      expect(commands.some(({ args }) => args.includes("--porcelain=v1"))).toBe(true);
      expect(commands.every(({ args }) => !args.includes("submodule") && !args.includes("--recurse-submodules"))).toBe(true);
      expect(commands.every(({ args }) => args.some((argument) => String(argument).startsWith("core.hooksPath=")))).toBe(true);
      expect(commands.every(({ options }) => options.timeoutMs > 0 && options.timeoutMs <= 120_000)).toBe(true);
      expect(commands.every(({ options }) => options.maxOutputBytes <= 64 * 1024)).toBe(true);
      expect(commands[0].options.env).toMatchObject({
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
        GIT_CONFIG_NOSYSTEM: "1"
      });
      expect(commands[0].options.env).not.toHaveProperty("GITHUB_TOKEN");
      expect(commands[0].options.env).not.toHaveProperty("DYLD_INSERT_LIBRARIES");

      const commandCount = commands.length;
      const existing = await runInstall({
        platform: "darwin",
        workspaceRoot,
        runCommand,
        doctorRunner
      });
      expect(existing).toMatchObject({ ok: true, installed: false, idempotent: true });
      expect(commands).toHaveLength(commandCount);
      expect(doctorCalls).toBe(2);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("never modifies or replaces a pre-existing checkout that doctor rejects", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "framepilot-video-use-existing-test-"));
    const repository = expectedVideoUsePath(workspaceRoot);
    const marker = path.join(repository, "user-marker.txt");
    await mkdir(repository, { recursive: true });
    await writeFile(marker, "preserve me\n");
    let commandCalls = 0;

    try {
      const result = await runInstall({
        platform: "darwin",
        workspaceRoot,
        runCommand: async () => {
          commandCalls += 1;
          throw new Error("git must not run for an existing path");
        },
        doctorRunner: async () => ({ ok: false, checks: [] })
      });

      expect(result).toMatchObject({
        ok: false,
        blocked: true,
        installed: false,
        idempotent: true,
        stage: "doctor"
      });
      expect(commandCalls).toBe(0);
      expect((await lstat(repository)).isDirectory()).toBe(true);
      expect(await readFile(marker, "utf8")).toBe("preserve me\n");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

describe("video-use quarantine doctor", () => {
  it("admits a clean exact checkout with supported local runtimes", async () => {
    const workspaceRoot = path.resolve("/workspace");
    const repository = expectedVideoUsePath(workspaceRoot);
    const commands = [];
    const runCommand = async (command, args) => {
      commands.push({ command, args });
      if (command === "git" && args.includes("--show-toplevel")) return { code: 0, stdout: `${repository}\n`, stderr: "" };
      if (command === "git" && args.includes("HEAD")) return { code: 0, stdout: `${ADMITTED_COMMIT}\n`, stderr: "" };
      if (command === "git" && args.includes("--porcelain=v1")) return { code: 0, stdout: "", stderr: "" };
      if (command === "python3") return { code: 0, stdout: "3.11.8\n", stderr: "" };
      if (command === "ffmpeg") return { code: 0, stdout: "ffmpeg version 8.1.2\n", stderr: "" };
      if (command === "ffprobe") return { code: 0, stdout: "ffprobe version 8.1.2\n", stderr: "" };
      return { code: null, stdout: "", stderr: "", errorCode: "ENOENT" };
    };

    const result = await runDoctor({
      platform: "darwin",
      workspaceRoot,
      fileSystem: fakeAdmissionFs(workspaceRoot),
      runCommand,
      resolveBinaries: async () => ({
        ffmpeg: "ffmpeg",
        ffprobe: "ffprobe",
        integrity: { ok: true },
        sources: { ffmpeg: "bundled", ffprobe: "bundled" }
      })
    });

    expect(result.ok).toBe(true);
    expect(result.python).toMatchObject({ command: "python3", version: "3.11.8" });
    expect(result.checks.every((check) => check.ok)).toBe(true);
    expect(formatDoctorReport(result)).not.toMatch(/api[_-]?key|secret|token/i);
    expect(commands.filter(({ command }) => command === "git")
      .every(({ args }) => args.includes("--no-optional-locks"))).toBe(true);
  });

  it("blocks unsupported hosts, dirty or wrong revisions, and clone credentials without leaking output", async () => {
    const workspaceRoot = path.resolve("/workspace");
    const repository = expectedVideoUsePath(workspaceRoot);
    let commandCalls = 0;
    const unsupported = await runDoctor({
      platform: "linux",
      workspaceRoot,
      fileSystem: fakeAdmissionFs(workspaceRoot),
      runCommand: async () => {
        commandCalls += 1;
        return { code: 0, stdout: "", stderr: "" };
      }
    });
    expect(unsupported.ok).toBe(false);
    expect(commandCalls).toBe(0);

    const secretMarker = "super-secret-api-key";
    const runCommand = async (command, args) => {
      if (command === "git" && args.includes("--show-toplevel")) return { code: 0, stdout: `${repository}\n`, stderr: "" };
      if (command === "git" && args.includes("HEAD")) return { code: 0, stdout: `${"a".repeat(40)}\n`, stderr: "" };
      if (command === "git" && args.includes("--porcelain=v1")) return { code: 0, stdout: `?? ${secretMarker}\n`, stderr: "" };
      if (command === "python3") return { code: 0, stdout: "3.9.19\n", stderr: secretMarker };
      if (command === "python") return { code: null, stdout: "", stderr: secretMarker, errorCode: "ENOENT" };
      return { code: 1, stdout: secretMarker, stderr: secretMarker };
    };
    const blocked = await runDoctor({
      platform: "darwin",
      workspaceRoot,
      fileSystem: fakeAdmissionFs(workspaceRoot, { environmentFile: true }),
      runCommand,
      resolveBinaries: async () => ({
        ffmpeg: "ffmpeg",
        ffprobe: "ffprobe",
        integrity: { ok: true },
        sources: { ffmpeg: "system", ffprobe: "system" }
      })
    });
    const report = formatDoctorReport(blocked);

    expect(blocked.ok).toBe(false);
    expect(blocked.checks.find((check) => check.id === "credentials")?.ok).toBe(false);
    expect(blocked.checks.find((check) => check.id === "commit")?.ok).toBe(false);
    expect(blocked.checks.find((check) => check.id === "worktree")?.ok).toBe(false);
    expect(blocked.checks.find((check) => check.id === "python")?.ok).toBe(false);
    expect(report).not.toContain(secretMarker);
  });
});

describe("video-use offline disposable smoke", () => {
  it("uses a confined one-range EDL and cleans its temporary directory", async () => {
    expect(buildSmokeEdl()).toEqual({
      sources: { synthetic: "synthetic-input.mp4" },
      ranges: [{ source: "synthetic", start: 0.1, end: 1.9, beat: "offline smoke" }],
      grade: "",
      overlays: []
    });

    let temporaryDirectory;
    const commands = [];
    const runCommand = async (command, args, options) => {
      commands.push({ command, args, options });
      if (command === "ffmpeg" && args.some((argument) => String(argument).startsWith("testsrc2="))) {
        temporaryDirectory = path.dirname(args.at(-1));
        await writeFile(args.at(-1), "synthetic input");
        return { code: 0, stdout: "", stderr: "" };
      }
      if (command === "python3") {
        const outputIndex = args.indexOf("-o") + 1;
        await writeFile(args[outputIndex], "synthetic output");
        return { code: 0, stdout: "rendered", stderr: "" };
      }
      if (command === "ffprobe") {
        return {
          code: 0,
          stdout: JSON.stringify({
            streams: [{ codec_type: "video" }, { codec_type: "audio" }],
            format: { duration: "1.800000" }
          }),
          stderr: ""
        };
      }
      if (command === "ffmpeg" && args.includes("null")) return { code: 0, stdout: "", stderr: "" };
      return { code: 1, stdout: "", stderr: "unexpected command" };
    };
    const result = await runSmoke({
      doctorResult: {
        ok: true,
        checks: [],
        python: { command: "python3", prefixArgs: [], version: "3.11.8" },
        admission: { helper: path.resolve("/admitted/helpers/render.py") },
        media: { ffmpeg: "ffmpeg", ffprobe: "ffprobe" }
      },
      runCommand,
      environment: {
        PATH: process.env.PATH || "",
        VIDEO_USE_TOKEN: "must-not-cross-the-boundary",
        PYTHONPATH: "/unsafe/python/path"
      }
    });

    expect(result).toMatchObject({ ok: true, blocked: false, duration: 1.8 });
    expect(commands.map(({ command }) => command)).toEqual(["ffmpeg", "python3", "ffprobe", "ffmpeg"]);
    expect(commands[0].args).toContain("testsrc2=size=320x180:rate=24:duration=2");
    expect(commands[1].args).toEqual(expect.arrayContaining([
      "-I",
      path.resolve("/admitted/helpers/render.py"),
      "--draft",
      "--no-subtitles",
      "--no-loudnorm"
    ]));
    expect(commands[0].options).toMatchObject({ timeoutMs: 120_000, maxOutputBytes: 64 * 1024 });
    expect(commands[0].options.env).not.toHaveProperty("VIDEO_USE_TOKEN");
    expect(commands[0].options.env).not.toHaveProperty("PYTHONPATH");
    await expect(access(temporaryDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not create disposable state when doctor is blocked", async () => {
    let commandCalls = 0;
    const result = await runSmoke({
      doctorResult: { ok: false, checks: [], python: null, admission: null },
      runCommand: async () => {
        commandCalls += 1;
        return { code: 0, stdout: "", stderr: "" };
      },
      fileSystem: {
        async mkdtemp() {
          throw new Error("must not be called");
        }
      }
    });

    expect(result).toMatchObject({ ok: false, blocked: true, stage: "doctor" });
    expect(commandCalls).toBe(0);
  });
});
