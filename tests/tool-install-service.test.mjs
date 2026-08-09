import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { createToolInstallService } from "../server/tool-install-service.mjs";

const localUser = { kind: "local-user", id: "desktop-user" };
const localAgent = { kind: "local-agent", id: "desktop-agent" };
const approvalSecret = "framepilot-test-only-approval-secret";
const projectRoot = path.resolve("/tmp/framepilot-install-service-test");

function catalogWith(...tools) {
  return {
    schemaVersion: 1,
    policy: { supportedPlatforms: ["darwin", "win32"] },
    tools
  };
}

function brewTool(overrides = {}) {
  return {
    id: "ffmpeg",
    name: "FFmpeg",
    tier: "required",
    kind: "cli",
    install: {
      darwin: { manager: "brew", args: ["install", "ffmpeg"] },
      win32: {
        manager: "winget",
        args: [
          "install",
          "--id",
          "Gyan.FFmpeg",
          "--exact",
          "--accept-package-agreements",
          "--accept-source-agreements"
        ]
      }
    },
    ...overrides
  };
}

function probeState(ready = false) {
  return {
    id: "ffmpeg",
    status: ready ? "ready" : "missing",
    location: ready ? "/opt/homebrew/bin/ffmpeg" : null,
    probe: { detail: ready ? "ffmpeg version 7" : "Not detected" }
  };
}

async function serviceFor({
  catalog = catalogWith(brewTool()),
  platform = "darwin",
  probeTool = vi.fn(async () => probeState(false)),
  spawnCommand = vi.fn(async () => ({ started: true, exitCode: 0, stdout: "", stderr: "" })),
  rootPackage = { dependencies: {} },
  lockfile = { packages: {} },
  ...options
} = {}) {
  return createToolInstallService({
    catalog,
    platform,
    projectRoot,
    probeTool,
    spawnCommand,
    rootPackage,
    lockfile,
    approvalSecret,
    ...options
  });
}

describe("tool installation plan inspection", () => {
  it("returns the exact reviewed command array without running it", async () => {
    const spawnCommand = vi.fn();
    const service = await serviceFor({ spawnCommand });

    const plan = await service.inspect("ffmpeg");

    expect(plan).toMatchObject({
      disposition: "approval-required",
      platform: "darwin",
      approval: {
        required: true,
        localUserOnly: true,
        explicitConfirmationRequired: true,
        oneShot: true
      },
      execution: {
        manager: "brew",
        command: "brew",
        args: ["install", "ffmpeg"],
        cwd: projectRoot,
        shell: false
      }
    });
    expect(plan.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(spawnCommand).not.toHaveBeenCalled();
  });

  it("rejects unknown IDs instead of accepting commands from the request", async () => {
    const service = await serviceFor();

    await expect(service.inspect("curl-https-evil.example")).rejects.toMatchObject({
      code: "TOOL_NOT_CATALOGUED",
      statusCode: 404
    });
  });

  it("reports manual, paid, and unsafe strategies without making them executable", async () => {
    const catalog = catalogWith(
      {
        id: "manual-app",
        name: "Manual App",
        install: { darwin: { manual: true, reason: "Use the signed desktop installer." } },
        officialUrl: "https://example.com/download"
      },
      brewTool({ id: "paid-tool", name: "Paid Tool", cost: "paid" }),
      brewTool({
        id: "unsafe-tool",
        name: "Unsafe Tool",
        install: { darwin: { manager: "brew", args: ["install", "https://evil.example/tool"] } }
      }),
      brewTool({
        id: "admin-tool",
        name: "Admin Tool",
        install: { darwin: { manager: "brew", args: ["install", "admin-tool"], needsAdmin: true } }
      })
    );
    const probeTool = vi.fn(async (id) => ({ id, status: "missing", probe: { detail: "Not detected" } }));
    const service = await serviceFor({ catalog, probeTool });

    await expect(service.inspect("manual-app")).resolves.toMatchObject({
      disposition: "manual",
      execution: null,
      documentationUrl: "https://example.com/download"
    });
    await expect(service.inspect("paid-tool")).resolves.toMatchObject({ disposition: "deferred", execution: null });
    await expect(service.inspect("unsafe-tool")).resolves.toMatchObject({ disposition: "blocked", execution: null });
    await expect(service.inspect("admin-tool")).resolves.toMatchObject({ disposition: "blocked", execution: null });
  });

  it("admits only the catalogued WinGet package ID and flags on Windows", async () => {
    const service = await serviceFor({ platform: "win32" });

    const plan = await service.inspect("ffmpeg");

    expect(plan.execution).toMatchObject({
      manager: "winget",
      command: "winget.exe",
      args: [
        "install",
        "--id",
        "Gyan.FFmpeg",
        "--exact",
        "--accept-package-agreements",
        "--accept-source-agreements"
      ],
      shell: false
    });
  });
});

describe("one-shot local-user installation approval", () => {
  it("requires explicit approval from a local user for the current plan hash", async () => {
    const service = await serviceFor();
    const plan = await service.inspect("ffmpeg");

    await expect(service.approve({
      toolId: "ffmpeg",
      planHash: plan.planHash,
      confirmed: true,
      actor: localAgent
    })).rejects.toMatchObject({ code: "LOCAL_USER_APPROVAL_REQUIRED" });
    await expect(service.approve({
      toolId: "ffmpeg",
      planHash: plan.planHash,
      confirmed: false,
      actor: localUser
    })).rejects.toMatchObject({ code: "INSTALL_CONFIRMATION_REQUIRED" });
    await expect(service.approve({
      toolId: "ffmpeg",
      planHash: "0".repeat(64),
      confirmed: true,
      actor: localUser
    })).rejects.toMatchObject({ code: "INSTALL_PLAN_STALE" });

    const approval = await service.approve({
      toolId: "ffmpeg",
      planHash: plan.planHash,
      confirmed: true,
      actor: localUser
    });
    expect(approval).toMatchObject({
      toolId: "ffmpeg",
      platform: "darwin",
      planHash: plan.planHash,
      actorId: localUser.id,
      oneShot: true
    });
    expect(approval.approvalHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("binds execution to the actor, tool, platform, manager, args, and reviewed hash", async () => {
    let ready = false;
    const probeTool = vi.fn(async () => probeState(ready));
    const spawnCommand = vi.fn(async (execution) => {
      ready = true;
      return { started: true, exitCode: 0, signal: null, stdout: "installed", stderr: "" };
    });
    const service = await serviceFor({ probeTool, spawnCommand });
    const plan = await service.inspect("ffmpeg");
    const approval = await service.approve({
      toolId: "ffmpeg",
      planHash: plan.planHash,
      confirmed: true,
      actor: localUser
    });

    await expect(service.execute({
      toolId: "ffmpeg",
      planHash: plan.planHash,
      approvalHash: approval.approvalHash,
      actor: { kind: "local-user", id: "another-user" }
    })).rejects.toMatchObject({ code: "INSTALL_APPROVAL_INVALID" });

    const receipt = await service.execute({
      toolId: "ffmpeg",
      planHash: plan.planHash,
      approvalHash: approval.approvalHash,
      actor: localUser
    });

    expect(spawnCommand).toHaveBeenCalledTimes(1);
    expect(spawnCommand).toHaveBeenCalledWith(expect.objectContaining({
      manager: "brew",
      command: "brew",
      args: ["install", "ffmpeg"],
      cwd: projectRoot,
      shell: false
    }));
    expect(receipt).toMatchObject({
      outcome: "installed-and-ready",
      ok: true,
      installed: true,
      ready: true,
      approvalConsumed: true,
      approvedBy: localUser.id,
      process: { exitCode: 0, timedOut: false },
      verification: { status: "ready", ready: true }
    });

    await expect(service.execute({
      toolId: "ffmpeg",
      planHash: plan.planHash,
      approvalHash: approval.approvalHash,
      actor: localUser
    })).rejects.toMatchObject({ code: "INSTALL_APPROVAL_INVALID" });
    expect(spawnCommand).toHaveBeenCalledTimes(1);
  });

  it("consumes approval before a failed attempt and never claims an unverified install", async () => {
    const spawnCommand = vi.fn(async () => ({
      started: true,
      exitCode: 1,
      stdout: `Authorization: Bearer this-is-a-secret-token\n${"x".repeat(4000)}`,
      stderr: "installer failed"
    }));
    const service = await serviceFor({ spawnCommand, outputLimitBytes: 1024 });
    const plan = await service.inspect("ffmpeg");
    const approval = await service.approve({
      toolId: "ffmpeg",
      planHash: plan.planHash,
      confirmed: true,
      actor: localUser
    });

    const receipt = await service.execute({
      toolId: "ffmpeg",
      planHash: plan.planHash,
      approvalHash: approval.approvalHash,
      actor: localUser
    });

    expect(receipt).toMatchObject({
      outcome: "installer-failed",
      ok: false,
      installed: false,
      ready: false,
      approvalConsumed: true,
      process: { exitCode: 1, outputTruncated: true }
    });
    expect(Buffer.byteLength(`${receipt.process.stdout}${receipt.process.stderr}`)).toBeLessThanOrEqual(1024);
    expect(receipt.process.stdout).not.toContain("this-is-a-secret-token");

    await expect(service.execute({
      toolId: "ffmpeg",
      planHash: plan.planHash,
      approvalHash: approval.approvalHash,
      actor: localUser
    })).rejects.toMatchObject({ code: "INSTALL_APPROVAL_INVALID" });
  });

  it("does not spawn when another process made the tool ready after approval", async () => {
    let ready = false;
    const spawnCommand = vi.fn();
    const service = await serviceFor({
      probeTool: vi.fn(async () => probeState(ready)),
      spawnCommand
    });
    const plan = await service.inspect("ffmpeg");
    const approval = await service.approve({
      toolId: "ffmpeg",
      planHash: plan.planHash,
      confirmed: true,
      actor: localUser
    });
    ready = true;

    const receipt = await service.execute({
      toolId: "ffmpeg",
      planHash: plan.planHash,
      approvalHash: approval.approvalHash,
      actor: localUser
    });

    expect(receipt).toMatchObject({
      outcome: "already-ready-before-install",
      ok: true,
      installed: false,
      ready: true,
      execution: null,
      process: null
    });
    expect(spawnCommand).not.toHaveBeenCalled();
  });
});

describe("locked npm installation strategy", () => {
  const integrity = `sha512-${"a".repeat(64)}`;
  const npmTool = {
    id: "capcut-cli",
    name: "CapCut CLI",
    npmPackage: "capcut-cli",
    npmIntegrity: integrity,
    install: {
      darwin: { projectDependency: true, package: "capcut-cli@0.17.2" },
      win32: { projectDependency: true, package: "capcut-cli@0.17.2" }
    }
  };

  it("uses npm ci with scripts disabled only when manifest, lock, and integrity all match", async () => {
    const probeTool = vi.fn(async () => ({ id: "capcut-cli", status: "missing" }));
    const service = await serviceFor({
      catalog: catalogWith(npmTool),
      probeTool,
      rootPackage: { dependencies: { "capcut-cli": "0.17.2" } },
      lockfile: {
        packages: {
          "node_modules/capcut-cli": {
            version: "0.17.2",
            resolved: "https://registry.npmjs.org/capcut-cli/-/capcut-cli-0.17.2.tgz",
            integrity
          }
        }
      }
    });

    const plan = await service.inspect("capcut-cli");

    expect(plan).toMatchObject({
      disposition: "approval-required",
      execution: {
        manager: "npm-lockfile",
        command: "npm",
        args: ["ci", "--include=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
        package: "capcut-cli@0.17.2",
        integrity,
        shell: false
      }
    });
  });

  it("blocks npm when the reviewed integrity is not the lockfile integrity", async () => {
    const service = await serviceFor({
      catalog: catalogWith(npmTool),
      probeTool: vi.fn(async () => ({ id: "capcut-cli", status: "missing" })),
      rootPackage: { dependencies: { "capcut-cli": "0.17.2" } },
      lockfile: {
        packages: {
          "node_modules/capcut-cli": {
            version: "0.17.2",
            resolved: "https://registry.npmjs.org/capcut-cli/-/capcut-cli-0.17.2.tgz",
            integrity: `sha512-${"b".repeat(64)}`
          }
        }
      }
    });

    await expect(service.inspect("capcut-cli")).resolves.toMatchObject({
      disposition: "blocked",
      execution: null
    });
  });

  it("blocks git, file, linked, and arbitrary registry entries anywhere in npm ci's lockfile", async () => {
    const service = await serviceFor({
      catalog: catalogWith(npmTool),
      probeTool: vi.fn(async () => ({ id: "capcut-cli", status: "missing" })),
      rootPackage: { dependencies: { "capcut-cli": "0.17.2" } },
      lockfile: {
        packages: {
          "node_modules/capcut-cli": {
            version: "0.17.2",
            resolved: "https://registry.npmjs.org/capcut-cli/-/capcut-cli-0.17.2.tgz",
            integrity
          },
          "node_modules/unreviewed": {
            version: "1.0.0",
            resolved: "https://evil.example/unreviewed.tgz",
            integrity: `sha512-${"c".repeat(64)}`
          }
        }
      }
    });

    await expect(service.inspect("capcut-cli")).resolves.toMatchObject({
      disposition: "blocked",
      execution: null,
      reason: expect.stringContaining("unreviewed")
    });
  });
});
