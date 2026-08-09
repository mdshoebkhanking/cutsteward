import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const catalog = JSON.parse(
  await readFile(path.resolve("toolchain/director-adapters.json"), "utf8"),
);

const requiredAdapterIds = [
  "elevenlabs-timed-tts",
  "consented-human-recording",
  "heygen-synthetic-presenter",
  "tavus-synthetic-presenter",
  "gemini-omni-video",
  "veo-3-1-video",
  "google-flow-supervised",
  "shutterstock-video",
  "pexels-video",
  "pixabay-video",
  "blender-local",
  "ffmpeg-local",
];

const truthStateVocabulary = [
  "unavailable",
  "installed",
  "configured",
  "authenticated",
  "capability_verified",
  "generation_verified",
  "qa_verified",
];

const officialHostsByAdapter = {
  "elevenlabs-timed-tts": "elevenlabs.io",
  "consented-human-recording": "www.sagaftra.org",
  "heygen-synthetic-presenter": "developers.heygen.com",
  "tavus-synthetic-presenter": "docs.tavus.io",
  "gemini-omni-video": "ai.google.dev",
  "veo-3-1-video": "ai.google.dev",
  "google-flow-supervised": "support.google.com",
  "shutterstock-video": "api-reference.shutterstock.com",
  "pexels-video": "www.pexels.com",
  "pixabay-video": "pixabay.com",
  "blender-local": "docs.blender.org",
  "ffmpeg-local": "ffmpeg.org",
};

const adapterById = (id) => catalog.adapters.find((adapter) => adapter.id === id);

describe("director adapter catalog", () => {
  it("declares every required production route", () => {
    expect(catalog.adapters.map((adapter) => adapter.id)).toEqual(requiredAdapterIds);
  });

  it("has unique IDs, a closed truth vocabulary, and no optimistic initial claims", () => {
    const ids = catalog.adapters.map((adapter) => adapter.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(catalog.truthStateVocabulary).toEqual(truthStateVocabulary);
    expect(catalog.adapters.every((adapter) => adapter.truthState === "unavailable")).toBe(true);
    expect(catalog.adapters.every((adapter) => truthStateVocabulary.includes(adapter.truthState))).toBe(true);
  });

  it("declares an implementation-ready access, gate, fallback, and source contract", () => {
    const ids = new Set(catalog.adapters.map((adapter) => adapter.id));
    const gatePolicies = new Set(["required", "conditional", "not-applicable"]);

    for (const adapter of catalog.adapters) {
      expect(adapter.access).toMatchObject({
        mode: expect.any(String),
        execution: expect.stringMatching(/^(cloud|local|human)$/),
        platforms: ["darwin", "win32"],
      });
      expect(adapter.capabilities.length).toBeGreaterThan(0);
      expect(adapter.credentialVariables).toEqual(expect.any(Array));
      expect(adapter.credentialVariables.every((name) => /^[A-Z][A-Z0-9_]*$/.test(name))).toBe(true);
      expect(Object.keys(adapter.gates).sort()).toEqual(["consent", "license", "spend", "upload"]);

      for (const gate of Object.values(adapter.gates)) {
        expect(gatePolicies.has(gate.policy)).toBe(true);
        expect(gate.reason.length).toBeGreaterThan(0);
      }

      expect(adapter.fallbackIds).toEqual(expect.any(Array));
      expect(adapter.fallbackIds.every((id) => ids.has(id) && id !== adapter.id)).toBe(true);

      const source = new URL(adapter.officialSource);
      expect(source.protocol).toBe("https:");
      expect(source.hostname).toBe(officialHostsByAdapter[adapter.id]);
    }
  });

  it("stores credential variable names only and no credential values", () => {
    const forbiddenKey = /^(api[_-]?key|token|password|secret|cookie|credential[_-]?value)$/i;
    const secretLikeValue = /(?:sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{16,})/;

    const inspect = (value) => {
      if (Array.isArray(value)) {
        value.forEach(inspect);
        return;
      }
      if (!value || typeof value !== "object") return;

      for (const [key, child] of Object.entries(value)) {
        expect(forbiddenKey.test(key)).toBe(false);
        inspect(child);
      }
    };

    inspect(catalog);
    expect(JSON.stringify(catalog)).not.toMatch(secretLikeValue);
  });

  it("keeps photographed humans, synthetic presenters, and synthetic voices distinct", () => {
    expect(adapterById("consented-human-recording").representation).toMatchObject({
      visualHuman: "real-photographed",
      voice: "real-human",
      isRealPhotographedHuman: true,
      isRealHumanVoice: true,
    });

    for (const id of ["heygen-synthetic-presenter", "tavus-synthetic-presenter"]) {
      expect(adapterById(id).representation).toMatchObject({
        visualHuman: "synthetic-presenter",
        isRealPhotographedHuman: false,
      });
      expect(adapterById(id).capabilities).toContain("synthetic-presenter");
    }

    expect(adapterById("elevenlabs-timed-tts").representation).toMatchObject({
      voice: "synthetic",
      isRealHumanVoice: false,
    });
  });

  it("keeps Flow supervised and browser-only", () => {
    const flow = adapterById("google-flow-supervised");

    expect(flow.access).toMatchObject({
      mode: "supervised-browser",
      execution: "cloud",
      browserOnly: true,
      apiAvailable: false,
      supervision: "required",
    });
    expect(flow.credentialVariables).toEqual([]);
    expect(flow.capabilities).toContain("user-supervised-generation");
  });

  it("rights-gates stock footage and keeps local renderers local", () => {
    for (const id of ["shutterstock-video", "pexels-video", "pixabay-video"]) {
      const stock = adapterById(id);
      expect(stock.gates.license.policy).toBe("required");
      expect(stock.capabilities).toContain("rights-manifest");
      expect(stock.representation.visualHuman).toBe("licensed-real-footage");
    }

    for (const id of ["blender-local", "ffmpeg-local"]) {
      const local = adapterById(id);
      expect(local.access).toMatchObject({ mode: "local-cli", execution: "local" });
      expect(local.credentialVariables).toEqual([]);
      expect(local.gates.upload.policy).toBe("not-applicable");
      expect(local.gates.spend.policy).toBe("not-applicable");
    }
  });
});
