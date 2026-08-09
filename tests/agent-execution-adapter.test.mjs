import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAgentExecutionAdapter } from "../server/agent-execution-adapter.mjs";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

describe("agent execution adapter", () => {
  it("requires a live runtime before submitting", async () => {
    const adapter = createAgentExecutionAdapter({
      id: "local-agent-research",
      liveSessions: { read: async () => null, command: async () => ({}) },
      runDirectoryFor: async () => "/tmp/run",
      mediaVerifier: { verify: async () => ({ result: "pass" }) },
    });
    await expect(adapter.submit({ runId: "run-1" })).rejects.toMatchObject({ code: "AGENT_RUNTIME_NOT_CONNECTED", definitelyNotSubmitted: true });
  });

  it("does not report success until output manifests and bytes verify", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "framepilot-agent-adapter-"));
    const job = { id: "research-rights", outputRoles: ["research_packet"], payload: {} };
    let prompted = false;
    const liveSessions = {
      async read(query) {
        if (query.kind === "session") return { status: "connected" };
        return [{ turnId: "turn-1", type: "turn.completed" }];
      },
      async command() {
        prompted = true;
        return { turnId: "turn-1" };
      },
    };
    const adapter = createAgentExecutionAdapter({
      id: "local-agent-research",
      liveSessions,
      runDirectoryFor: async () => directory,
      mediaVerifier: { verify: async () => ({ result: "pass" }) },
    });
    const request = {
      runId: "run-1",
      scopeHash: "a".repeat(64),
      strategyId: "research",
      submissionKey: "b".repeat(64),
      attemptNumber: 1,
      job,
    };
    await expect(adapter.submit(request)).resolves.toEqual({ status: "accepted", externalId: "turn-1" });
    expect(prompted).toBe(true);
    await expect(adapter.reconcile({ ...request, externalId: "turn-1" })).resolves.toMatchObject({ status: "failed", reasonCode: "AGENT_OUTPUT_MISSING" });

    const artifact = "evidence packet";
    await mkdir(path.join(directory, "planning"), { recursive: true });
    await mkdir(path.join(directory, "execution-output", job.id), { recursive: true });
    await writeFile(path.join(directory, "planning", "RESEARCH_PACKET.md"), artifact);
    const manifest = {
      schemaVersion: 1,
      role: "research_packet",
      artifacts: [{ relativePath: "planning/RESEARCH_PACKET.md", sha256: hash(artifact), bytes: Buffer.byteLength(artifact), mediaType: "text/markdown" }],
      summary: "Verified research packet",
    };
    await writeFile(path.join(directory, "execution-output", job.id, "research_packet.manifest.json"), `${JSON.stringify(manifest)}\n`);
    const result = await adapter.reconcile({ ...request, externalId: "turn-1" });
    expect(result.status).toBe("succeeded");
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]).toMatchObject({ role: "research_packet", mediaType: "application/json" });
  });
});
