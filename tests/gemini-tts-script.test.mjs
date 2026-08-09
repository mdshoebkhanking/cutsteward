import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectDirectory = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(projectDirectory, "scripts/generate-gemini-tts.mjs");
const promptPath = path.join(
  projectDirectory,
  "videos/framepilot-launch-demo/planning/GEMINI_VOICE_PROMPT.txt"
);
const unusedOutputPath = path.join(
  projectDirectory,
  "videos/framepilot-launch-demo/assets/audio/gemini-test-never-write.wav"
);
const currentUtcDate = new Date().toISOString().slice(0, 10);
const pricingArguments = [
  "--approved-max-usd",
  "0.025",
  "--pricing-checked-at",
  currentUtcDate,
  "--input-usd-per-million-tokens",
  "1",
  "--audio-usd-per-million-tokens",
  "20"
];

function run(argumentsList) {
  const environment = { ...process.env };
  delete environment.GEMINI_API_KEY;
  delete environment.GOOGLE_API_KEY;
  return spawnSync(process.execPath, [scriptPath, ...argumentsList], {
    cwd: projectDirectory,
    env: environment,
    encoding: "utf8"
  });
}

describe("bounded Gemini TTS helper", () => {
  it("rejects input/output collisions before any provider call", () => {
    const result = run([
      "--input",
      promptPath,
      "--output",
      promptPath,
      ...pricingArguments
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must resolve to three different files");
  });

  it("rejects output paths outside project media roots", () => {
    const result = run([
      "--input",
      promptPath,
      "--output",
      path.join(process.env.TMPDIR || "/tmp", "framepilot-forbidden.wav"),
      ...pricingArguments
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("approved videos/ or demos/");
  });

  it("requires explicit freshly checked pricing", () => {
    const result = run(["--input", promptPath, "--output", unusedOutputPath, "--approved-max-usd", "0.025"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("re-check the official price");
    expect(existsSync(unusedOutputPath)).toBe(false);
  });

  it("fails closed without a locally configured API key", () => {
    const result = run([
      "--input",
      promptPath,
      "--output",
      unusedOutputPath,
      ...pricingArguments
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("never pass a key on the command line");
    expect(existsSync(unusedOutputPath)).toBe(false);
  });
});
