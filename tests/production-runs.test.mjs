import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProductionRuns, PRODUCTION_PHASES } from "../server/production-runs.mjs";

const temporaryDirectories = [];
const localUser = { kind: "local-user", id: "production-test-user" };

const passingMediaVerifier = {
  async verify() {
    return {
      result: "pass",
      claim: "media_decode",
      method: "fake-full-decode",
      detail: "Known test media passed its deterministic verifier.",
      metadata: {
        format: { duration: "1.000000" },
        streams: [{
          index: 0,
          codec_type: "video",
          codec_name: "h264",
          width: 1920,
          height: 1080,
          r_frame_rate: "30/1",
          avg_frame_rate: "30/1",
          nb_read_frames: "30"
        }]
      }
    };
  }
};

const failingMediaVerifier = {
  async verify() {
    return {
      result: "fail",
      claim: "media_decode",
      method: "fake-full-decode",
      detail: "Fixture intentionally failed full decode."
    };
  }
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function createHarness({ mediaVerifier = passingMediaVerifier } = {}) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "framepilot-production-runs-"));
  temporaryDirectories.push(temporaryDirectory);
  const dataDirectory = path.join(temporaryDirectory, "data");
  const source = {
    id: "source-approved",
    kind: "file",
    name: "approved-source.mov",
    mediaType: "video/quicktime",
    size: 1024,
    sha256: "a".repeat(64),
    localOnly: true,
    createdAt: "2026-08-08T10:00:00.000Z"
  };
  const addedSource = {
    id: "source-added",
    kind: "file",
    name: "newly-added-source.mov",
    mediaType: "video/quicktime",
    size: 2048,
    sha256: "b".repeat(64),
    localOnly: true,
    createdAt: "2026-08-08T10:01:00.000Z"
  };
  const sourcesById = new Map([
    [source.id, source],
    [addedSource.id, addedSource]
  ]);
  let runNumber = 0;
  let clockTick = 0;
  const options = {
    dataDirectory,
    rootDirectory: process.cwd(),
    resolveSources: async (ids) => ids.flatMap((id) => {
      const resolved = sourcesById.get(id);
      return resolved ? [resolved] : [];
    }),
    mediaVerifier,
    clock: () => new Date(Date.UTC(2026, 7, 8, 10, 0, clockTick++)),
    idFactory: () => `run-production-${++runNumber}`
  };
  return {
    addedSource,
    dataDirectory,
    options,
    runs: createProductionRuns(options),
    source,
    temporaryDirectory
  };
}

let commandNumber = 0;
function commandId(label = "command") {
  commandNumber += 1;
  return `${label}-${commandNumber}-${randomUUID()}`;
}

async function startRun(harness, overrides = {}) {
  const envelope = {
    commandId: overrides.commandId || commandId("start"),
    actor: localUser,
    command: {
      kind: "start",
      outcome: overrides.outcome || "Create and verify a careful local production.",
      mode: overrides.mode || "Guided",
      sourceIds: overrides.sourceIds || []
    }
  };
  const receipt = await harness.runs.command(envelope);
  return { envelope, receipt, runId: receipt.runId };
}

async function snapshot(harness, runId) {
  return harness.runs.read({ kind: "snapshot", runId });
}

async function issue(harness, runId, command, options = {}) {
  const before = await snapshot(harness, runId);
  const envelope = {
    commandId: options.commandId || commandId(command.kind),
    expectedRevision: options.expectedRevision ?? before.revision,
    actor: options.actor || localUser,
    command: { ...command, runId }
  };
  const receipt = await harness.runs.command(envelope);
  return { before, envelope, receipt };
}

async function approveBrief(harness, runId) {
  const before = await snapshot(harness, runId);
  const attention = before.attentions.find((item) => item.status === "pending");
  await issue(harness, runId, {
    kind: "respond",
    attentionId: attention.id,
    response: {
      kind: "approve-once",
      requestHash: attention.requestHash,
      rightsConfirmed: true,
      notes: "Rights confirmed for the exact displayed source hashes."
    }
  });
}

async function projectDirectory(harness, runId) {
  const state = await snapshot(harness, runId);
  return path.join(harness.dataDirectory, state.projectRelativePath);
}

async function writeProjectFile(harness, runId, relativePath, contents) {
  const directory = await projectDirectory(harness, runId);
  const absolutePath = path.join(directory, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
  return absolutePath;
}

async function recordArtifact(harness, runId, {
  role,
  relativePath,
  contents,
  parentArtifactId = null,
  title = `${role} evidence`
}) {
  await writeProjectFile(harness, runId, relativePath, contents);
  await issue(harness, runId, {
    kind: "record-artifact",
    role,
    relativePath,
    parentArtifactId,
    title
  });
  const state = await snapshot(harness, runId);
  return state.artifacts.at(-1);
}

async function approveArtifact(harness, runId, artifact, reason = "Reviewed against the current phase gate.") {
  await issue(harness, runId, {
    kind: "review-artifact",
    artifactId: artifact.id,
    verdict: "approve",
    reason
  });
  return (await snapshot(harness, runId)).artifacts.find((item) => item.id === artifact.id);
}

async function recordAndApprove(harness, runId, input) {
  return approveArtifact(harness, runId, await recordArtifact(harness, runId, input));
}

async function evidenceForRole(harness, runId, role) {
  const state = await snapshot(harness, runId);
  const base = `evidence/${role}`;
  if (role === "profile_validation") {
    return recordAndApprove(harness, runId, {
      role,
      relativePath: `${base}.json`,
      contents: JSON.stringify({ status: "passed", unresolved: [] })
    });
  }
  if (role === "preview_media" || role === "master_media") {
    return recordAndApprove(harness, runId, {
      role,
      relativePath: role === "preview_media" ? "renders/previews/preview.mp4" : "renders/masters/master.mp4",
      contents: Buffer.from(`known-${role}-fixture`)
    });
  }
  if (role === "preview_qa" || role === "master_qa") {
    const parentRole = role === "preview_qa" ? "preview_media" : "master_media";
    const parent = [...state.artifacts].reverse().find((artifact) =>
      artifact.role === parentRole && artifact.status === "approved"
    );
    return recordAndApprove(harness, runId, {
      role,
      relativePath: `${base}.json`,
      parentArtifactId: parent.id,
      contents: JSON.stringify({ status: "passed", artifactSha256: parent.sha256 })
    });
  }
  if (role === "final_release") {
    const master = [...state.artifacts].reverse().find((artifact) =>
      artifact.role === "master_media" && artifact.status === "approved"
    );
    return recordAndApprove(harness, runId, {
      role,
      relativePath: "delivery/FINAL_RELEASE.json",
      contents: JSON.stringify({
        run_status: "release_passed",
        canonical_master: { relativePath: master.relativePath, sha256: master.sha256 }
      })
    });
  }
  if (role === "sha256sums") {
    const master = [...state.artifacts].reverse().find((artifact) =>
      artifact.role === "master_media" && artifact.status === "approved"
    );
    return recordAndApprove(harness, runId, {
      role,
      relativePath: "delivery/SHA256SUMS",
      contents: `${master.sha256}  ${master.relativePath}\n`
    });
  }
  return recordAndApprove(harness, runId, {
    role,
    relativePath: `${base}.md`,
    contents: `# ${role}\n\nReviewed evidence for ${role}.\n`
  });
}

async function satisfyAndPassCurrentPhase(harness, runId) {
  const before = await snapshot(harness, runId);
  const phase = PRODUCTION_PHASES.find((item) => item.id === before.currentPhaseId);
  for (const role of phase.requiredRoles) await evidenceForRole(harness, runId, role);
  await issue(harness, runId, { kind: "pass-phase" });
}

describe("ProductionRun module", () => {
  it("turns a premium app-film brief into a persisted, non-executed Autopilot Director plan", async () => {
    const harness = await createHarness();
    const { runId } = await startRun(harness, {
      mode: "Autonomous",
      sourceIds: [harness.source.id],
      outcome: "Create a 30-second premium vertical app film with one realistic character, natural timed voice, licensed web clips, Gemini or Flow AI shots, and a Blender phone mockup using authentic screenshots and screen video."
    });

    const state = await snapshot(harness, runId);
    const run = await harness.runs.read({ kind: "run", runId });
    const directory = await projectDirectory(harness, runId);
    const expectedFiles = [
      "planning/DIRECTOR_PLAN.json",
      "planning/REFERENCE_ANALYSIS.md",
      "planning/CHARACTER_BIBLE.json",
      "planning/VOICE_DIRECTION.json",
      "planning/SHOT_MANIFEST.json",
      "planning/BLENDER_MOCKUP_PLAN.json"
    ];
    await Promise.all(expectedFiles.map((entry) => access(path.join(directory, entry))));

    expect(state.directorPlan).toMatchObject({
      schemaVersion: 1,
      directorVersion: "1.1",
      presetId: "premium-vertical-story",
      target: {
        durationSeconds: 30,
        aspectRatio: "9:16",
        masterResolution: { width: 2160, height: 3840 },
        fps: 30
      },
      execution: { status: "planned", claims: [] }
    });
    expect(run.directorPlan).toEqual(state.directorPlan);
    expect(state.directorPlan.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(state.directorPlan.lanes.map(({ id }) => id)).toEqual([
      "character",
      "voice",
      "licensed-clips",
      "ai-video",
      "blender-mockup",
      "edit-qa"
    ]);
    expect(state.directorPlan.blenderMockup).toMatchObject({
      adapterId: "blender.local_compositor",
      requiredForProductProof: true,
      screenMediaPolicy: "immutable-authentic-texture",
      fallbackAdapterId: "local.2_5d_device_compositor"
    });
    expect(state.phaseStatus.capture.optional).toBe(false);
    expect(state.phaseStatus.audio.optional).toBe(false);
    expect(state.directorPlan.blenderMockup.inputs).toEqual(expect.arrayContaining([
      "authentic-screenshot",
      "authentic-screen-video"
    ]));
    expect(state.directorPlan.approvals.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "likeness-and-voice-consent",
      "provider-upload",
      "generation-spend",
      "stock-license",
      "publish"
    ]));
    expect(state.directorPlan.shots).toHaveLength(22);
    expect(new Set(state.directorPlan.shots.map((shot) => shot.storyBeatId))).toEqual(
      new Set(["hook", "setup", "product", "result", "cta"])
    );
    expect(state.directorPlan.shots.some((shot) => shot.laneIds.includes("blender-mockup"))).toBe(true);
    expect(JSON.parse(await readFile(path.join(directory, "planning", "DIRECTOR_PLAN.json"), "utf8")))
      .toEqual(state.directorPlan);
    expect(JSON.parse(await readFile(path.join(directory, "planning", "BLENDER_MOCKUP_PLAN.json"), "utf8")))
      .toEqual(state.directorPlan.blenderMockup);
  });

  it("creates the real project scaffold and requires rights approval bound to the displayed source hashes", async () => {
    const harness = await createHarness();
    const { runId } = await startRun(harness, { sourceIds: [harness.source.id] });
    const state = await snapshot(harness, runId);
    const directory = await projectDirectory(harness, runId);

    await Promise.all([
      "MASTER_WORKFLOW_COPY.md",
      "PROJECT_PROFILE.yaml",
      "RUN_LOG.md",
      "SPEND_LEDGER.json",
      "ASSET_MANIFEST.json",
      "planning/BRIEF.md",
      "planning/RIGHTS_AND_CONSENT.md",
      "source/SOURCE_REFERENCES.json",
      "renders/masters",
      "qa/master",
      "delivery"
    ].map((entry) => access(path.join(directory, entry))));
    expect(await readFile(path.join(directory, "MASTER_WORKFLOW_COPY.md"), "utf8"))
      .toBe(await readFile(path.join(process.cwd(), "UNIVERSAL_AI_VIDEO_AGENT_WORKFLOW.md"), "utf8"));

    const attention = state.attentions[0];
    expect(attention.proposal.sourceHashes).toEqual([harness.source.sha256]);
    expect(attention.requestHash).toMatch(/^[a-f0-9]{64}$/);

    await expect(issue(harness, runId, {
      kind: "respond",
      attentionId: attention.id,
      response: { kind: "approve-once", requestHash: "0".repeat(64), rightsConfirmed: true }
    })).rejects.toMatchObject({ code: "STALE_DECISION" });
    await expect(issue(harness, runId, {
      kind: "respond",
      attentionId: attention.id,
      response: { kind: "approve-once", requestHash: attention.requestHash, rightsConfirmed: false }
    })).rejects.toThrow(/may use/i);

    await approveBrief(harness, runId);
    const approved = await snapshot(harness, runId);
    expect(approved.attentions[0]).toMatchObject({ status: "approved" });
    expect(approved.condition).toBe("active");
  });

  it("supersedes the prior rights approval and creates a new hash-bound pending approval when a source is attached", async () => {
    const harness = await createHarness();
    const { runId } = await startRun(harness, { sourceIds: [harness.source.id] });
    const originalAttention = (await snapshot(harness, runId)).attentions[0];

    await approveBrief(harness, runId);
    expect((await snapshot(harness, runId)).attentions.find(({ id }) => id === originalAttention.id))
      .toMatchObject({ status: "approved" });
    for (const role of PRODUCTION_PHASES[0].requiredRoles) await evidenceForRole(harness, runId, role);
    await issue(harness, runId, { kind: "pass-phase" });
    const priorArtifact = (await snapshot(harness, runId)).artifacts[0];

    await issue(harness, runId, {
      kind: "attach-source",
      sourceIds: [harness.addedSource.id]
    });

    const updated = await snapshot(harness, runId);
    const superseded = updated.attentions.find(({ id }) => id === originalAttention.id);
    const pending = updated.attentions.find(({ category, status }) =>
      category === "brief-rights-budget" && status === "pending"
    );

    expect(superseded).toMatchObject({ status: "superseded" });
    expect(pending).toMatchObject({
      category: "brief-rights-budget",
      status: "pending",
      proposal: {
        sourceHashes: [harness.source.sha256, harness.addedSource.sha256]
      }
    });
    expect(pending.id).not.toBe(originalAttention.id);
    expect(pending.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pending.requestHash).not.toBe(originalAttention.requestHash);
    expect(updated.sourceIds).toEqual([harness.source.id, harness.addedSource.id]);
    expect(updated.condition).toBe("needs_approval");
    expect(updated.currentPhaseId).toBe("intake");
    expect(updated.phaseStatus.intake.status).toBe("waiting");
    expect(updated.phaseStatus.research.status).toBe("pending");
    expect(updated.artifacts.find(({ id }) => id === priorArtifact.id)).toMatchObject({ status: "superseded" });
    expect(updated.releaseGate).toMatchObject({ status: "pending", certificate: null });
    const sourceReferences = JSON.parse(await readFile(path.join(await projectDirectory(harness, runId), "source", "SOURCE_REFERENCES.json"), "utf8"));
    expect(sourceReferences.sources.map(({ id }) => id)).toEqual([harness.source.id, harness.addedSource.id]);

    await expect(issue(harness, runId, {
      kind: "respond",
      attentionId: pending.id,
      response: {
        kind: "approve-once",
        requestHash: originalAttention.requestHash,
        rightsConfirmed: true
      }
    })).rejects.toMatchObject({ code: "STALE_DECISION" });
    expect((await snapshot(harness, runId)).attentions.find(({ id }) => id === pending.id))
      .toMatchObject({ status: "pending" });
  });

  it("makes start and mutation commands idempotent while rejecting payload and revision conflicts", async () => {
    const harness = await createHarness();
    const startEnvelope = {
      commandId: commandId("idempotent-start"),
      actor: localUser,
      command: { kind: "start", outcome: "Build one idempotent film.", mode: "Guided", sourceIds: [] }
    };
    const firstStart = await harness.runs.command(startEnvelope);
    expect(await harness.runs.command(startEnvelope)).toEqual(firstStart);
    await expect(harness.runs.command({
      ...startEnvelope,
      command: { ...startEnvelope.command, outcome: "A conflicting film." }
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const mutationEnvelope = {
      commandId: commandId("idempotent-mutation"),
      expectedRevision: 1,
      actor: localUser,
      command: { kind: "direct", runId: firstStart.runId, text: "Keep the opening restrained." }
    };
    const firstMutation = await harness.runs.command(mutationEnvelope);
    expect(await harness.runs.command(mutationEnvelope)).toEqual(firstMutation);
    await expect(harness.runs.command({
      ...mutationEnvelope,
      command: { ...mutationEnvelope.command, text: "Use a different opening." }
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(harness.runs.command({
      commandId: commandId("stale-revision"),
      expectedRevision: 1,
      actor: localUser,
      command: { kind: "direct", runId: firstStart.runId, text: "This write is stale." }
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await harness.runs.read({ kind: "messages", runId: firstStart.runId })).toHaveLength(2);
  });

  it("recovers a missing STATE.json from the append-only journal", async () => {
    const harness = await createHarness();
    const { runId } = await startRun(harness);
    await approveBrief(harness, runId);
    const before = await snapshot(harness, runId);
    const statePath = path.join(await projectDirectory(harness, runId), "STATE.json");
    await rm(statePath);

    const recovered = await snapshot(harness, runId);
    expect(recovered).toEqual(before);
    expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual(before);
  });

  it("recovers a malformed STATE.json from the append-only journal", async () => {
    const harness = await createHarness();
    const { runId } = await startRun(harness);
    await approveBrief(harness, runId);
    const before = await snapshot(harness, runId);
    const statePath = path.join(await projectDirectory(harness, runId), "STATE.json");
    await writeFile(statePath, "{malformed-json", "utf8");

    const recovered = await snapshot(harness, runId);
    expect(recovered).toEqual(before);
    expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual(before);
  });

  it("rejects lexical outside paths and symlinks that escape the project", async () => {
    const harness = await createHarness();
    const { runId } = await startRun(harness);
    const directory = await projectDirectory(harness, runId);
    const outsideDirectory = path.join(harness.temporaryDirectory, "outside");
    const outsideFile = path.join(outsideDirectory, "escape.txt");
    await mkdir(outsideDirectory, { recursive: true });
    await writeFile(outsideFile, "must stay outside", "utf8");

    await expect(issue(harness, runId, {
      kind: "record-artifact",
      role: "other_evidence",
      title: "Outside file",
      relativePath: path.relative(directory, outsideFile)
    })).rejects.toThrow(/leaves the project/i);

    const linkDirectory = path.join(directory, "planning", "outside-link");
    await symlink(outsideDirectory, linkDirectory, process.platform === "win32" ? "junction" : "dir");
    await expect(issue(harness, runId, {
      kind: "record-artifact",
      role: "other_evidence",
      title: "Symlink escape",
      relativePath: path.join("planning", "outside-link", "escape.txt")
    })).rejects.toThrow(/symlink leaves the project/i);
  });

  it("does not let an external job's verified_output observation complete a run", async () => {
    const harness = await createHarness();
    const { runId } = await startRun(harness);
    await issue(harness, runId, {
      kind: "observe-job",
      jobId: "provider-job-1",
      adapterId: "fake-browser",
      capability: "video-generation",
      state: "verified_output",
      externalReceipt: "provider-receipt-1",
      detail: "The external agent claims an output is verified."
    });

    const state = await snapshot(harness, runId);
    expect(state.jobs[0].state).toBe("verified_output");
    expect(state.condition).not.toBe("completed");
    expect(state.releaseGate).toMatchObject({ status: "pending", certificate: null });
  });

  it("does not let a local agent decide approvals or approve its own media", async () => {
    const harness = await createHarness();
    const { runId } = await startRun(harness);
    const before = await snapshot(harness, runId);
    const attention = before.attentions[0];
    const agent = { kind: "local-agent", id: "untrusted-agent" };
    await expect(issue(harness, runId, {
      kind: "respond",
      attentionId: attention.id,
      response: { kind: "approve-once", requestHash: attention.requestHash, rightsConfirmed: true }
    }, { actor: agent })).rejects.toMatchObject({ code: "POLICY_BLOCKED" });

    const media = await recordArtifact(harness, runId, {
      role: "preview_media",
      relativePath: "renders/previews/agent-candidate.mp4",
      contents: Buffer.from("verified-by-fake-media-seam")
    });
    await expect(issue(harness, runId, {
      kind: "review-artifact",
      artifactId: media.id,
      verdict: "approve",
      reason: "The producing agent must not self-approve media."
    }, { actor: agent })).rejects.toMatchObject({ code: "POLICY_BLOCKED" });
    expect((await snapshot(harness, runId)).artifacts.at(-1).status).toBe("candidate");
  });

  it("reserves irreversible run cancellation for the authenticated local user", async () => {
    const harness = await createHarness();
    const { runId } = await startRun(harness);
    const agent = { kind: "local-agent", id: "local-cli" };
    await expect(issue(harness, runId, {
      kind: "control",
      operation: "cancel"
    }, { actor: agent })).rejects.toMatchObject({ code: "POLICY_BLOCKED", statusCode: 403 });
    expect((await snapshot(harness, runId)).condition).not.toBe("cancelled");

    await issue(harness, runId, { kind: "control", operation: "cancel" });
    expect((await snapshot(harness, runId)).condition).toBe("cancelled");
  });

  it("blocks artifact approval when the media verifier fails", async () => {
    const harness = await createHarness({ mediaVerifier: failingMediaVerifier });
    const { runId } = await startRun(harness);
    const artifact = await recordArtifact(harness, runId, {
      role: "preview_media",
      title: "Broken preview",
      relativePath: "renders/previews/broken.mp4",
      contents: Buffer.from("not-decodable")
    });
    expect(artifact.verification).toMatchObject({ result: "fail", claim: "media_decode" });

    await expect(issue(harness, runId, {
      kind: "review-artifact",
      artifactId: artifact.id,
      verdict: "approve",
      reason: "This must not override a failed verifier."
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect((await snapshot(harness, runId)).artifacts[0].status).toBe("candidate");
  });

  it("accepts QA only when it passes and binds the exact immutable parent hash", async () => {
    const harness = await createHarness();
    const { runId } = await startRun(harness);
    const parent = await recordAndApprove(harness, runId, {
      role: "preview_media",
      title: "Verified preview",
      relativePath: "renders/previews/verified.mp4",
      contents: Buffer.from("verified-preview-fixture")
    });
    const wrongQa = await recordArtifact(harness, runId, {
      role: "preview_qa",
      title: "Wrong-parent QA",
      relativePath: "qa/preview/wrong-parent.json",
      parentArtifactId: parent.id,
      contents: JSON.stringify({ status: "passed", artifactSha256: "f".repeat(64) })
    });
    expect(wrongQa.verification.result).toBe("fail");
    await expect(approveArtifact(harness, runId, wrongQa)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    const exactQa = await recordArtifact(harness, runId, {
      role: "preview_qa",
      title: "Exact-parent QA",
      relativePath: "qa/preview/exact-parent.json",
      parentArtifactId: parent.id,
      contents: JSON.stringify({ status: "passed", artifactSha256: parent.sha256 })
    });
    expect(exactQa.verification.result).toBe("pass");
    expect((await approveArtifact(harness, runId, exactQa)).status).toBe("approved");
  });

  it("allows explicit, reasoned N/A waivers for the optional capture and audio phases", async () => {
    const harness = await createHarness();
    const { runId } = await startRun(harness);
    await approveBrief(harness, runId);
    for (const phaseId of ["intake", "research", "script", "storyboard", "acquisition"]) {
      expect((await snapshot(harness, runId)).currentPhaseId).toBe(phaseId);
      await satisfyAndPassCurrentPhase(harness, runId);
    }

    expect((await snapshot(harness, runId)).currentPhaseId).toBe("capture");
    await issue(harness, runId, {
      kind: "waive-phase",
      reason: "No authentic product capture is applicable to this abstract motion graphic."
    });
    expect((await snapshot(harness, runId)).currentPhaseId).toBe("audio");
    await issue(harness, runId, {
      kind: "waive-phase",
      reason: "The approved creative treatment is intentionally silent with no audio layer."
    });

    const state = await snapshot(harness, runId);
    expect(state.phaseStatus.capture).toMatchObject({ status: "waived" });
    expect(state.phaseStatus.audio).toMatchObject({ status: "waived" });
    expect(state.currentPhaseId).toBe("edit");
  });

  it("completes every phase from hash-bound evidence and preserves the certificate after reopening", async () => {
    const harness = await createHarness();
    const { runId } = await startRun(harness, { sourceIds: [harness.source.id] });
    await approveBrief(harness, runId);

    for (const phase of PRODUCTION_PHASES) {
      expect((await snapshot(harness, runId)).currentPhaseId).toBe(phase.id);
      await satisfyAndPassCurrentPhase(harness, runId);
    }

    const completed = await snapshot(harness, runId);
    expect(completed.condition).toBe("completed");
    expect(completed.releaseGate.status).toBe("release_passed");
    expect(completed.releaseGate.openGates).toEqual([]);
    expect(completed.releaseGate.certificate).toMatchObject({
      schemaVersion: 2,
      runId,
      runStatus: "release_passed",
      passedGates: PRODUCTION_PHASES.map((phase) => phase.id),
      naModules: [],
      relativePath: "delivery/COMPLETION_CERTIFICATE.json"
    });

    const certificatePath = path.join(
      await projectDirectory(harness, runId),
      completed.releaseGate.certificate.relativePath
    );
    const certificateBytes = await readFile(certificatePath);
    expect(sha256(certificateBytes)).toBe(completed.releaseGate.certificateFileSha256);

    const reopenedRuns = createProductionRuns(harness.options);
    const reopened = await reopenedRuns.read({ kind: "snapshot", runId });
    expect(reopened.condition).toBe("completed");
    expect(reopened.releaseGate).toEqual(completed.releaseGate);
    expect(reopened.lastEventHash).toBe(completed.lastEventHash);
  });
});
