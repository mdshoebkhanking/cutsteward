import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const catalog = JSON.parse(await readFile(path.resolve("toolchain/media-tools.json"), "utf8"));
const agentCatalog = JSON.parse(await readFile(path.resolve("toolchain/agent-runtimes.json"), "utf8"));
const extensionCatalog = JSON.parse(await readFile(path.resolve("toolchain/extension-packs.json"), "utf8"));

describe("media toolchain manifest", () => {
  it("catalogues only the supported desktop platforms", () => {
    expect(catalog.policy.supportedPlatforms).toEqual(["darwin", "win32"]);
    expect(catalog.tools.every((tool) => !Object.hasOwn(tool.install, "linux"))).toBe(true);
  });

  it("has unique, attributable tools", () => {
    const ids = catalog.tools.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(catalog.tools.every((tool) => tool.officialUrl.startsWith("https://"))).toBe(true);
  });

  it("never misrepresents CapCut Desktop as a CLI", () => {
    const capcut = catalog.tools.find((tool) => tool.id === "capcut");
    expect(capcut.kind).toBe("desktop-handoff");
    expect(capcut.executables).toEqual([]);
    expect(capcut.install.darwin.manual).toBe(true);
    expect(capcut.install.win32.manual).toBe(true);
  });

  it("pins the vetted community CapCut CLI and its registry integrity", () => {
    const capcutCli = catalog.tools.find((tool) => tool.id === "capcut-cli");
    expect(capcutCli.kind).toBe("project-cli");
    expect(capcutCli.version).toBe("0.17.2");
    expect(capcutCli.npmIntegrity).toBe("sha512-wbxAX2npJwZ2atMWXCLFKOj3h7OgxfXY0Vq3DEfpmCvLtF0sQ/UdGTQBkobAD4jsejRfIZZek0S4VlLFULfxWw==");
    expect(capcutCli.disclaimer).toContain("not affiliated with ByteDance");
    expect(capcutCli.install.darwin.package).toBe("capcut-cli@0.17.2");
  });

  it("requires approval for machine-level changes", () => {
    expect(catalog.policy.requireApprovalForSystemChanges).toBe(true);
    expect(catalog.policy.neverAutoInstallUnsignedRepositories).toBe(true);
  });

  it("treats Blender as the authenticated-screen device compositor", () => {
    const blender = catalog.tools.find((tool) => tool.id === "blender");
    expect(blender.capabilities).toEqual(expect.arrayContaining([
      "device-mockup",
      "camera-lighting",
      "screen-image-texture",
      "screen-video-texture",
      "screen-replacement",
      "rgba-frame-sequence",
      "background-render",
      "python-automation"
    ]));
    expect(blender.trustedDriver).toBe("toolchain/blender/device_stage.py");
  });
});

describe("agent runtime catalog", () => {
  it("targets only macOS and Windows", () => {
    expect(agentCatalog.policy.supportedPlatforms).toEqual(["darwin", "win32"]);
  });

  it("keeps installation separate from conformance-gated connection", () => {
    expect(agentCatalog.policy.autoInstall).toBe(false);
    expect(agentCatalog.policy.requireConformanceBeforeConnection).toBe(true);
    expect(agentCatalog.policy.neverScrapeInteractiveTui).toBe(true);
  });

  it("uses native control surfaces in the researched implementation order", () => {
    expect(agentCatalog.runtimes.map((runtime) => runtime.id)).toEqual(["codex", "claude", "gemini", "hermes", "kimi", "antigravity"]);
    expect(agentCatalog.runtimes.find((runtime) => runtime.id === "codex").preferredAdapter).toBe("codex-app-server-stdio");
    expect(agentCatalog.runtimes.find((runtime) => runtime.id === "gemini").preferredAdapter).toBe("acp-v1-stdio");
    expect(agentCatalog.runtimes.find((runtime) => runtime.id === "hermes").preferredAdapter).toBe("acp-v1-stdio");
    expect(agentCatalog.runtimes.find((runtime) => runtime.id === "kimi").knownUnsupported).toContain("acp-fork");
  });
});

describe("researched extension packs", () => {
  it("keeps every optional pack gated and version-pinned", () => {
    expect(extensionCatalog.policy.defaultPacks).toEqual([]);
    expect(extensionCatalog.policy.forbidImplicitModelDownloads).toBe(true);
    expect(extensionCatalog.packs.every((pack) => pack.automatic === false && pack.version && pack.gates.length > 0)).toBe(true);
    expect(new Set(extensionCatalog.packs.map((pack) => pack.id)).size).toBe(extensionCatalog.packs.length);
  });

  it("rights-gates acquisition and license-gates Remotion", () => {
    expect(extensionCatalog.packs.find((pack) => pack.id === "rights-gated-acquisition").gates).toContain("no-drm-bypass");
    expect(extensionCatalog.packs.find((pack) => pack.id === "motion-code").gates).toContain("company-license-review");
  });

  it("keeps video-use quarantined at the exact admitted commit", () => {
    const videoUse = extensionCatalog.packs.find((pack) => pack.id === "speech-edit-video-use");

    expect(videoUse.version).toBe("commit-92c2b34e44c205cbc2acae7f6ca7c1c219d5dd66");
    expect(videoUse.automatic).toBe(false);
    expect(videoUse.gates).toEqual(expect.arrayContaining([
      "exact-clean-commit",
      "offline-smoke",
      "macos-windows-conformance"
    ]));
  });
});
