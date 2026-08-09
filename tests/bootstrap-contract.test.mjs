import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("portable handoff contract", () => {
  it("keeps one canonical setup command in agent instructions", async () => {
    const instructions = await readFile("AGENTS.md", "utf8");
    expect(instructions).toContain("npm run setup");
    expect(instructions).toContain("npm run setup:full");
    expect(instructions.toLowerCase()).toContain("never bind");
  });

  it("uses thin vendor discovery shims", async () => {
    expect((await readFile("CLAUDE.md", "utf8")).trimStart()).toMatch(/^@AGENTS\.md/);
    expect((await readFile(".agents/rules/00-repository.md", "utf8")).trim()).toBe("@AGENTS.md");
  });

  it("supports only macOS and Windows", async () => {
    const packageManifest = JSON.parse(await readFile("package.json", "utf8"));
    const workflow = await readFile(".github/workflows/portable.yml", "utf8");
    const bootstrap = await readFile("docs/BOOTSTRAP.md", "utf8");
    expect(packageManifest.os).toEqual(["darwin", "win32"]);
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("windows-latest");
    expect(workflow).not.toContain("ubuntu-latest");
    expect(bootstrap).toContain("macOS and Windows");
  });

  it("excludes the entire private state tree from a clean portable copy", async () => {
    const bootstrap = await readFile("docs/BOOTSTRAP.md", "utf8");
    const settings = await readFile("src/pages/SettingsPage.tsx", "utf8");
    expect(bootstrap).toContain("entire `.framepilot` directory");
    expect(bootstrap).toContain("Do not copy `.framepilot/data` wholesale");
    expect(bootstrap).not.toContain("Keep `.framepilot/data`");
    expect(settings).toContain("the entire .framepilot directory");
    expect(settings).toContain("No private run data or local keys are included");
    expect(settings).not.toContain("without node_modules, dist, or .framepilot/runtime");
  });
});
