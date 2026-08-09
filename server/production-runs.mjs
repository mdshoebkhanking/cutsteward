import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  appendFile,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { createDirectorPlan } from "./director.mjs";
import { createEmptyProviderRequestsDocument } from "./provider-action-service.mjs";

const SCHEMA_VERSION = 2;
const WORKFLOW_VERSION = "2.0";
const MAX_COMMAND_RECEIPTS = 500;
const TERMINAL_CONDITIONS = new Set(["completed", "cancelled"]);
const MEDIA_ROLES = new Set(["preview_media", "master_media", "variant_media"]);
const ROLES = new Set([
  "project_profile",
  "profile_validation",
  "rights_and_consent",
  "research_packet",
  "feature_audit",
  "locked_script",
  "script_review",
  "storyboard",
  "edit_map",
  "asset_manifest",
  "capture_manifest",
  "audio_mix",
  "preview_media",
  "preview_qa",
  "master_media",
  "master_qa",
  "variant_media",
  "variant_qa",
  "final_release",
  "sha256sums",
  "other_evidence"
]);

export const PRODUCTION_PHASES = [
  { id: "intake", label: "Intake", requiredRoles: ["project_profile", "profile_validation", "rights_and_consent"] },
  { id: "research", label: "Research", requiredRoles: ["research_packet"] },
  { id: "script", label: "Script", requiredRoles: ["locked_script", "script_review"] },
  { id: "storyboard", label: "Storyboard", requiredRoles: ["storyboard", "edit_map"] },
  { id: "acquisition", label: "Acquire", requiredRoles: ["asset_manifest"] },
  { id: "capture", label: "Capture", requiredRoles: ["capture_manifest"], optional: true },
  { id: "audio", label: "Audio", requiredRoles: ["audio_mix"], optional: true },
  { id: "edit", label: "Edit", requiredRoles: ["preview_media"] },
  { id: "preview_qa", label: "Preview QA", requiredRoles: ["preview_qa"] },
  { id: "master", label: "Master", requiredRoles: ["master_media", "master_qa"] },
  { id: "delivery", label: "Delivery", requiredRoles: ["final_release", "sha256sums"] }
];

function httpError(message, statusCode = 422, code = "VALIDATION_ERROR") {
  return Object.assign(new Error(message), { statusCode, code });
}

function jsonHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function fileHash(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function safeTitle(outcome) {
  return outcome.split(/[.!?\n]/)[0].trim().slice(0, 72) || "Untitled production";
}

function safeId(value, label) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) {
    throw httpError(`${label} is invalid.`);
  }
  return value;
}

function safeText(value, label, { minimum = 1, maximum = 4000 } = {}) {
  if (typeof value !== "string") throw httpError(`${label} must be text.`);
  const text = value.trim();
  if (text.length < minimum || text.length > maximum) {
    throw httpError(`${label} must be ${minimum} to ${maximum} characters.`);
  }
  return text;
}

async function atomicWrite(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const contents = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, filePath);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function resolveProjectFile(projectDirectory, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw httpError("Artifact paths must be project-relative.");
  }
  const lexical = path.resolve(projectDirectory, relativePath);
  if (!contained(projectDirectory, lexical)) throw httpError("Artifact path leaves the project directory.");
  const [projectReal, fileReal] = await Promise.all([realpath(projectDirectory), realpath(lexical)]);
  if (!contained(projectReal, fileReal)) throw httpError("Artifact symlink leaves the project directory.");
  const info = await stat(fileReal);
  if (!info.isFile() || info.size < 1) throw httpError("Artifact must be a non-empty regular file.");
  return { absolutePath: fileReal, relativePath: path.relative(projectReal, fileReal).split(path.sep).join("/"), info };
}

function initialPhaseStatus(directorPlan) {
  return Object.fromEntries(PRODUCTION_PHASES.map((phase, index) => [phase.id, {
    status: index === 0 ? "waiting" : "pending",
    requiredRoles: phase.requiredRoles,
    optional: phase.id === "capture"
      ? !directorPlan.blenderMockup.requiredForProductProof
      : phase.id === "audio"
        ? !directorPlan.lanes.find((lane) => lane.id === "voice")?.selected
        : Boolean(phase.optional),
    waiverReason: null,
    passedAt: null,
    evidenceArtifactIds: []
  }]));
}

function publicRun(snapshot) {
  const currentIndex = PRODUCTION_PHASES.findIndex((phase) => phase.id === snapshot.currentPhaseId);
  const progress = PRODUCTION_PHASES.filter((phase) => ["passed", "waived"].includes(snapshot.phaseStatus[phase.id]?.status)).length;
  const primaryArtifact = [...snapshot.artifacts].reverse().find((artifact) =>
    artifact.status !== "rejected" && ["master_media", "preview_media"].includes(artifact.role)
  );
  return {
    id: snapshot.id,
    title: snapshot.title,
    outcome: snapshot.outcome,
    runnerId: snapshot.runner?.runtimeId || "handoff",
    runnerName: snapshot.runner?.name || "Agent handoff",
    runnerStatus: snapshot.runner?.status || "handoff_only",
    runnerAdapterId: snapshot.runner?.adapterId || null,
    runnerSessionId: snapshot.runner?.sessionId || null,
    mode: snapshot.mode,
    state: snapshot.condition,
    phase: PRODUCTION_PHASES[currentIndex]?.label || "Intake",
    phaseId: snapshot.currentPhaseId,
    progress,
    total: PRODUCTION_PHASES.length,
    elapsed: "00:00",
    sourceIds: snapshot.sourceIds,
    currentTask: snapshot.currentTask,
    taskDetail: snapshot.taskDetail,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    demo: false,
    revision: snapshot.revision,
    eventSequence: snapshot.eventSequence,
    artifactId: primaryArtifact?.id || null,
    notice: snapshot.notice,
    projectRelativePath: snapshot.projectRelativePath,
    pendingAttention: snapshot.attentions.find((attention) => attention.status === "pending") || null,
    phaseStatus: snapshot.phaseStatus,
    releaseGate: snapshot.releaseGate,
    directorPlan: snapshot.directorPlan || null,
    jobs: (snapshot.jobs || []).map((job) => ({
      id: job.id,
      shotId: job.shotId || null,
      adapterId: job.adapterId || null,
      capability: job.capability || null,
      state: job.state,
      externalReceipt: job.externalReceipt || null,
      observations: (job.observations || []).slice(-50)
    }))
  };
}

function publicArtifact(artifact, run) {
  const videoStream = artifact.verification?.metadata?.streams?.find((stream) => stream.codec_type === "video");
  const durationSeconds = Number(artifact.verification?.metadata?.format?.duration);
  const duration = Number.isFinite(durationSeconds)
    ? `${String(Math.floor(durationSeconds / 60)).padStart(2, "0")}:${String(Math.round(durationSeconds % 60)).padStart(2, "0")}`
    : "Pending probe";
  return {
    id: artifact.id,
    runId: run.id,
    title: artifact.title,
    kind: artifact.role,
    role: artifact.role,
    version: `r${artifact.revision}`,
    duration,
    dimensions: videoStream?.width && videoStream?.height ? `${videoStream.width} × ${videoStream.height}` : "Evidence file",
    audio: artifact.verification?.result === "pass" ? "Decode passed" : "Not certified",
    rights: "See rights ledger",
    poster: null,
    demo: false,
    checks: artifact.verification ? [artifact.verification.detail] : ["Content hash recorded"],
    relativePath: artifact.relativePath,
    sha256: artifact.sha256,
    size: artifact.size,
    status: artifact.status,
    verification: artifact.verification,
    contentUrl: MEDIA_ROLES.has(artifact.role) ? `/api/artifacts/${encodeURIComponent(artifact.id)}/content` : null
  };
}

async function writeDirectorFiles(projectDirectory, directorPlan) {
  await Promise.all([
    atomicWrite(path.join(projectDirectory, "planning", "DIRECTOR_PLAN.json"), directorPlan),
    atomicWrite(path.join(projectDirectory, "planning", "CHARACTER_BIBLE.json"), directorPlan.characterBible),
    atomicWrite(path.join(projectDirectory, "planning", "VOICE_DIRECTION.json"), directorPlan.voiceDirection),
    atomicWrite(path.join(projectDirectory, "planning", "SHOT_MANIFEST.json"), {
      schemaVersion: 1,
      planHash: directorPlan.planHash,
      target: directorPlan.target,
      shots: directorPlan.shots
    }),
    atomicWrite(path.join(projectDirectory, "planning", "BLENDER_MOCKUP_PLAN.json"), directorPlan.blenderMockup)
  ]);
}

async function scaffoldProject({ projectDirectory, rootDirectory, snapshot, sources }) {
  const directories = [
    "events",
    "planning/scripts",
    "prompts",
    "references/character",
    "references/wardrobe",
    "references/locations",
    "references/props",
    "references/style",
    "source/generated/raw",
    "source/generated/approved",
    "source/stock/raw",
    "source/stock/approved",
    "source/capture/raw",
    "source/capture/approved",
    "source/rejected",
    "assets/brand",
    "assets/ui",
    "assets/mockups",
    "assets/fonts",
    "assets/images",
    "assets/overlays",
    "audio/voice/raw",
    "audio/voice/selected",
    "audio/music",
    "audio/sfx",
    "audio/stems",
    "audio/mix",
    "captions",
    "edit/filtergraphs",
    "edit/editable-project",
    "edit/mezzanine",
    "renders/previews",
    "renders/masters",
    "renders/variants",
    "qa/source",
    "qa/preview",
    "qa/master",
    "qa/variants",
    "qa/artifacts",
    "delivery"
  ];
  await Promise.all(directories.map((directory) => mkdir(path.join(projectDirectory, directory), { recursive: true })));
  const [workflow, referenceProfile] = await Promise.all([
    readFile(path.join(rootDirectory, "UNIVERSAL_AI_VIDEO_AGENT_WORKFLOW.md"), "utf8"),
    readFile(path.join(rootDirectory, "docs", "PREMIUM_REFERENCE_PROFILE.md"), "utf8")
  ]);
  await Promise.all([
    atomicWrite(path.join(projectDirectory, "MASTER_WORKFLOW_COPY.md"), workflow),
    atomicWrite(path.join(projectDirectory, "README_FIRST.md"), `# ${snapshot.title}\n\nRun ID: \`${snapshot.id}\`\n\nRead \`MASTER_WORKFLOW_COPY.md\` and \`planning/DIRECTOR_PLAN.json\` completely. Execute only selected Director jobs whose dependencies and exact approval gates are satisfied. This project is evidence-gated: an agent message or process exit cannot mark the run complete. Use the loopback API or \`npm run production:command\` to record observed jobs, immutable artifacts, and approvals.\n\nFor ElevenLabs, Google Veo, or licensed stock work, write only the strict non-secret request configuration for the selected job into \`planning/PROVIDER_REQUESTS.json\`. Never store credentials there. CutSteward will validate the file and show the authenticated local user the exact immutable provider proposal before any upload, paid/quota use, voice action, license action, or network submission.\n`),
    atomicWrite(path.join(projectDirectory, "REPRODUCE.md"), "# Reproduce\n\nThe exact commands, tool locks, input hashes, timeline, and QA receipts must be recorded before release. Browser/provider generations are provenance-reproducible, not byte-identical.\n"),
    atomicWrite(path.join(projectDirectory, "PROJECT_PROFILE.yaml"), {
      schema_version: 2,
      project: {
        id: snapshot.id,
        title: snapshot.title,
        objective: snapshot.outcome,
        duration_seconds: snapshot.directorPlan.target.durationSeconds,
        aspect_ratio: snapshot.directorPlan.target.aspectRatio,
        platforms: ["youtube-shorts", "instagram-reels", "tiktok"],
        language: "en-US",
        market_scope: "international-english",
        priority_markets: ["US", "CA", "GB", "AU", "NZ", "international-english"]
      },
      autonomy: {
        mode: snapshot.mode === "Autonomous" ? "autonomous-with-hard-stops" : "guided",
        paid_budget_limit: 0,
        authorized_provider_quota: {},
        allow_third_party_asset_uploads: false,
        permit_public_upload: false,
        install_missing_free_tools: true
      },
      applicability: Object.fromEntries(PRODUCTION_PHASES.map((phase) => [phase.id, phase.optional ? "unresolved" : "required"]))
    }),
    atomicWrite(path.join(projectDirectory, "RUN_LOG.md"), `# Run Log\n\n- Created: ${snapshot.createdAt}\n- Supported hosts: macOS and Windows\n- Status: preflight\n`),
    atomicWrite(path.join(projectDirectory, "SPEND_LEDGER.json"), { schemaVersion: 2, cash: { currency: "USD", limit: 0, reserved: 0, used: 0 }, providerQuota: {} }),
    atomicWrite(path.join(projectDirectory, "ASSET_MANIFEST.json"), { schemaVersion: 2, assets: [] }),
    atomicWrite(path.join(projectDirectory, "TOOLCHAIN_LOCK.json"), { schemaVersion: 2, lockedAt: null, tools: [], adapters: [] }),
    atomicWrite(path.join(projectDirectory, "planning", "PROFILE_VALIDATION.json"), {
      schemaVersion: 2,
      status: "blocked",
      unresolved: ["rights_and_consent", "disk_ceiling"],
      note: "Resolve required fields before production work. Unknown values must not be replaced with guesses."
    }),
    atomicWrite(path.join(projectDirectory, "planning", "BRIEF.md"), `# Brief\n\n## Requested outcome\n\n${snapshot.outcome}\n\n## Status\n\nNot locked. Research, rights, destination, budget, and proof path remain to be validated.\n`),
    atomicWrite(path.join(projectDirectory, "planning", "REFERENCE_ANALYSIS.md"), referenceProfile),
    atomicWrite(path.join(projectDirectory, "planning", "PROVIDER_REQUESTS.json"), createEmptyProviderRequestsDocument()),
    atomicWrite(path.join(projectDirectory, "planning", "PROVIDER_REQUESTS_GUIDE.md"), `# Exact provider request guide\n\nThe connected agent prepares this file; the authenticated local user approves the resulting exact action. Search, selection, request preparation, and approval are separate from submission and completion. Never store credentials, cookies, tokens, passwords, or private browser state here. Omit jobs that are not selected.\n\n## ElevenLabs timed voice\n\n\`\`\`json\n{"voice-timing":{"elevenLabs":{"voiceId":"reviewed-voice-id","text":"locked English script","modelId":"reviewed-model-id","languageCode":"en","outputFormat":"mp3_44100_128","voiceSettings":{}}}}\n\`\`\`\n\nAllowed optional continuity/settings fields are documented by the adapter and master workflow. This action requires exact voice/likeness consent, third-party upload, and paid/quota approval.\n\n## Google Veo pilot\n\n\`\`\`json\n{"ai-video-pilot":{"googleVeo":{"model":"reviewed-model-id","instances":[{"prompt":"one bounded shot prompt"}],"parameters":{},"sampleIndex":0}}}\n\`\`\`\n\nUse a pilot before any batch. Real-human requirements, reference-image rights, uploads, and quota/spend remain hard gates.\n\n## Rights-gated stock\n\nRun the local stock search and explicit selection commands. Copy only the returned \`selection\` object:\n\n\`\`\`json\n{"licensed-acquisition":{"stockMedia":{"selection":{"schemaVersion":1,"provider":"pexels","assetId":"...","renditionId":"...","downloadUrl":"https://...","mediaType":"video/mp4","width":2160,"height":3840,"declaredBytes":null,"sourcePageUrl":"https://...","creator":{},"license":{},"searchQueryHash":"...","retrievedAt":"...","selectionHash":"...","selectionProof":{}}}}}\n\`\`\`\n\nSelection proves an exact cached candidate; it does not guarantee model/property releases or campaign suitability. Record those findings in the rights ledger before approval.\n\nThe complete document is \`{"schemaVersion":1,"requests":{...}}\`.\n`),
    atomicWrite(path.join(projectDirectory, "planning", "RIGHTS_AND_CONSENT.md"), "# Rights and consent\n\nStatus: unresolved. Record ownership, licenses, consent, cloud-upload scope, and redistribution limits before using each asset.\n"),
    atomicWrite(path.join(projectDirectory, "source", "SOURCE_REFERENCES.json"), {
      schemaVersion: 2,
      sources: sources.map((source) => ({
        id: source.id,
        kind: source.kind,
        name: source.name,
        sha256: source.sha256,
        size: source.size ?? null,
        mediaType: source.mediaType ?? null,
        url: source.url ?? null,
        localOnly: true
      }))
    }),
    atomicWrite(path.join(projectDirectory, "source", "SIDE_EFFECT_AND_CLEANUP_MANIFEST.md"), "# Side effects and cleanup\n\nNo external side effects have been authorized or observed.\n")
  ]);
  await writeDirectorFiles(projectDirectory, snapshot.directorPlan);
}

export function createProductionRuns({
  dataDirectory,
  rootDirectory,
  resolveSources = async () => [],
  mediaVerifier = { verify: async () => ({ result: "inconclusive", claim: "media_decode", method: "none", detail: "No verifier configured." }) },
  clock = () => new Date(),
  idFactory = () => `run-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
}) {
  const projectsDirectory = path.join(dataDirectory, "projects");
  const indexPath = path.join(dataDirectory, "v2-index.json");
  const runQueues = new Map();
  let indexQueue = Promise.resolve();

  async function ensureIndex() {
    await mkdir(projectsDirectory, { recursive: true });
    try {
      const index = await readJson(indexPath);
      if (index.schemaVersion !== SCHEMA_VERSION) throw httpError("Unsupported CutSteward production index schema.", 500);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await atomicWrite(indexPath, { schemaVersion: SCHEMA_VERSION, runs: {}, startCommands: {} });
    }
  }

  function mutateIndex(update) {
    const operation = indexQueue.then(async () => {
      await ensureIndex();
      const index = await readJson(indexPath);
      const result = await update(index);
      await atomicWrite(indexPath, index);
      return result;
    });
    indexQueue = operation.catch(() => undefined);
    return operation;
  }

  function projectDirectory(runId) {
    safeId(runId, "Run ID");
    return path.join(projectsDirectory, runId);
  }

  function statePath(runId) {
    return path.join(projectDirectory(runId), "STATE.json");
  }

  async function recoverState(runId) {
    const stateFile = statePath(runId);
    let snapshot;
    try {
      snapshot = await readJson(stateFile);
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    const eventsDirectory = path.join(projectDirectory(runId), "events");
    let entries;
    try {
      entries = (await readdir(eventsDirectory)).filter((name) => /^\d{8}\.json$/.test(name)).sort();
    } catch (error) {
      if (error?.code === "ENOENT") throw httpError("Production run does not exist.", 404, "NOT_FOUND");
      throw error;
    }
    if (entries.length === 0) throw httpError("Production run journal is empty.", 500, "JOURNAL_ERROR");
    let previousHash = null;
    let lastEvent = null;
    for (let index = 0; index < entries.length; index += 1) {
      const event = await readJson(path.join(eventsDirectory, entries[index]));
      if (event.sequence !== index + 1 || entries[index] !== `${String(event.sequence).padStart(8, "0")}.json`) {
        throw httpError("Production journal sequence is not contiguous.", 500, "JOURNAL_ERROR");
      }
      if (event.runId !== runId || event.previousHash !== previousHash || event.snapshot?.lastEventHash !== event.eventHash) {
        throw httpError("Production journal hash chain is invalid.", 500, "JOURNAL_ERROR");
      }
      const eventWithoutHash = structuredClone(event);
      delete eventWithoutHash.eventHash;
      eventWithoutHash.snapshot.lastEventHash = eventWithoutHash.previousHash;
      if (jsonHash(eventWithoutHash) !== event.eventHash) {
        throw httpError("Production journal integrity check failed.", 500, "JOURNAL_ERROR");
      }
      previousHash = event.eventHash;
      lastEvent = event;
    }
    const journalSnapshot = lastEvent.snapshot;
    if (!snapshot || jsonHash(snapshot) !== jsonHash(journalSnapshot)) {
      snapshot = journalSnapshot;
      await atomicWrite(stateFile, snapshot);
    }
    return snapshot;
  }

  async function verifyEvidenceArtifacts(snapshot, artifactIds) {
    for (const artifactId of artifactIds) {
      const artifact = snapshot.artifacts.find((item) => item.id === artifactId);
      if (!artifact || artifact.status !== "approved" || artifact.verification?.result !== "pass") {
        throw httpError("Approved evidence is missing or no longer passed.", 409, "STALE_EVIDENCE");
      }
      const resolved = await resolveProjectFile(projectDirectory(snapshot.id), artifact.relativePath);
      if (await fileHash(resolved.absolutePath) !== artifact.sha256) {
        throw httpError(`Evidence bytes changed after approval: ${artifact.relativePath}.`, 409, "STALE_EVIDENCE");
      }
    }
  }

  async function evidenceForPhase(snapshot, phase) {
    const artifactIds = [];
    for (const role of phase.requiredRoles) {
      const artifact = [...snapshot.artifacts].reverse().find((item) => item.role === role && item.status === "approved");
      if (!artifact) {
        throw httpError(`Phase ${phase.label} is missing approved evidence: ${role}.`, 409, "PRECONDITION_FAILED");
      }
      artifactIds.push(artifact.id);
    }
    await verifyEvidenceArtifacts(snapshot, artifactIds);
    return artifactIds;
  }

  async function verifyPassedPhaseEvidence(snapshot) {
    for (const phase of PRODUCTION_PHASES) {
      const status = snapshot.phaseStatus[phase.id];
      if (status.status === "passed") await verifyEvidenceArtifacts(snapshot, status.evidenceArtifactIds || []);
      if (status.status === "waived" && (!status.optional || !status.waiverReason)) {
        throw httpError(`Invalid N/A record for ${phase.label}.`, 409, "STALE_EVIDENCE");
      }
    }
  }

  async function persistEvent(previous, next, eventType, payload, envelope) {
    const sequence = previous ? previous.eventSequence + 1 : 1;
    next.eventSequence = sequence;
    next.updatedAt = clock().toISOString();
    const snapshotForEvent = structuredClone(next);
    snapshotForEvent.lastEventHash = previous?.lastEventHash || null;
    const eventWithoutHash = {
      schemaVersion: SCHEMA_VERSION,
      runId: next.id,
      sequence,
      eventId: `event-${randomUUID()}`,
      recordedAt: next.updatedAt,
      previousHash: previous?.lastEventHash || null,
      commandId: envelope?.commandId || null,
      actor: envelope?.actor || { kind: "system", id: "framepilot" },
      type: eventType,
      payload,
      snapshot: snapshotForEvent
    };
    const event = { ...eventWithoutHash, eventHash: jsonHash(eventWithoutHash) };
    next.lastEventHash = event.eventHash;
    event.snapshot.lastEventHash = event.eventHash;
    const eventPath = path.join(projectDirectory(next.id), "events", `${String(sequence).padStart(8, "0")}.json`);
    await atomicWrite(eventPath, event);
    await atomicWrite(statePath(next.id), next);
    await appendFile(path.join(projectDirectory(next.id), "RUN_LOG.md"), `\n- ${next.updatedAt} · ${eventType} · sequence ${sequence}\n`, "utf8");
    return event;
  }

  function serializeRun(runId, update) {
    const prior = runQueues.get(runId) || Promise.resolve();
    const operation = prior.then(update);
    runQueues.set(runId, operation.catch(() => undefined));
    return operation;
  }

  async function start(envelope) {
    const command = envelope.command;
    const outcome = safeText(command.outcome, "Outcome", { minimum: 3, maximum: 4000 });
    const commandId = safeId(envelope.commandId, "Command ID");
    const commandHash = jsonHash(envelope);
    return mutateIndex(async (index) => {
      const prior = index.startCommands[commandId];
      if (prior) {
        if (prior.commandHash !== commandHash) throw httpError("Command ID was already used with different input.", 409, "IDEMPOTENCY_CONFLICT");
        return prior.receipt;
      }
      const sourceIds = [...new Set(Array.isArray(command.sourceIds) ? command.sourceIds.map((id) => safeId(id, "Source ID")) : [])];
      const sources = await resolveSources(sourceIds);
      if (sources.length !== sourceIds.length) throw httpError("One or more local source references do not exist.");
      const id = safeId(idFactory(), "Generated run ID");
      const createdAt = clock().toISOString();
      const relative = path.join("projects", id).split(path.sep).join("/");
      const approvalBody = {
        category: "brief-rights-budget",
        outcome,
        sourceHashes: sources.map((source) => source.sha256),
        externalUploads: false,
        cashBudget: 0,
        providerQuota: {}
      };
      const attention = {
        id: `attention-${randomUUID()}`,
        kind: "approval",
        category: "brief-rights-budget",
        title: "Confirm the safe production brief",
        detail: sourceIds.length
          ? "Confirm you may use the attached sources. Initial spend, provider quota, uploads, and publishing stay disabled."
          : "Confirm the brief. Initial spend, provider quota, uploads, and publishing stay disabled.",
        requestHash: jsonHash(approvalBody),
        proposal: approvalBody,
        status: "pending",
        createdAt,
        decidedAt: null,
        decision: null
      };
      const directorPlan = createDirectorPlan({
        outcome,
        mode: command.mode === "Autonomous" ? "Autonomous" : "Guided",
        sources
      });
      const snapshot = {
        schemaVersion: SCHEMA_VERSION,
        workflowVersion: WORKFLOW_VERSION,
        id,
        title: safeTitle(outcome),
        outcome,
        mode: command.mode === "Autonomous" ? "Autonomous" : "Guided",
        condition: "preflight",
        currentPhaseId: "intake",
        phaseStatus: initialPhaseStatus(directorPlan),
        revision: 1,
        eventSequence: 0,
        lastEventHash: null,
        projectRelativePath: relative,
        sourceIds,
        sources: sources.map((source) => ({ id: source.id, sha256: source.sha256 })),
        directorPlan,
        runner: command.runnerId ? { runtimeId: command.runnerId, name: command.runnerId, status: "handoff_only", adapterId: null, sessionId: null } : null,
        attentions: [attention],
        messages: [],
        jobs: [],
        artifacts: [],
        commandReceipts: {},
        currentTask: "Confirm rights, budget, and boundaries",
        taskDetail: "No provider, model, upload, spend, or render has started.",
        notice: "Preflight is waiting for an explicit, hash-bound approval.",
        releaseGate: { status: "pending", certificate: null, openGates: PRODUCTION_PHASES.map((phase) => phase.id) },
        createdAt,
        updatedAt: createdAt
      };
      const directory = projectDirectory(id);
      await mkdir(directory, { recursive: false });
      await scaffoldProject({ projectDirectory: directory, rootDirectory, snapshot, sources });
      await persistEvent(null, snapshot, "RunStarted", { outcomeHash: jsonHash(outcome), sourceIds, attentionId: attention.id }, envelope);
      const receipt = { accepted: true, runId: id, revision: snapshot.revision, sequence: snapshot.eventSequence, cursor: String(snapshot.eventSequence) };
      index.runs[id] = { createdAt, projectRelativePath: relative };
      index.startCommands[commandId] = { commandHash, receipt };
      return receipt;
    });
  }

  function existingReceipt(snapshot, envelope) {
    const prior = snapshot.commandReceipts[envelope.commandId];
    if (!prior) return null;
    if (prior.commandHash !== jsonHash(envelope)) throw httpError("Command ID was already used with different input.", 409, "IDEMPOTENCY_CONFLICT");
    return prior.receipt;
  }

  function recordReceipt(snapshot, envelope, receipt) {
    snapshot.commandReceipts[envelope.commandId] = { commandHash: jsonHash(envelope), receipt };
    const ids = Object.keys(snapshot.commandReceipts);
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_COMMAND_RECEIPTS))) delete snapshot.commandReceipts[id];
  }

  function requireRevision(snapshot, envelope) {
    if (!Number.isInteger(envelope.expectedRevision)) throw httpError("expectedRevision is required.", 409, "VERSION_CONFLICT");
    if (envelope.expectedRevision !== snapshot.revision) {
      throw httpError(`Run revision is ${snapshot.revision}; received ${envelope.expectedRevision}.`, 409, "VERSION_CONFLICT");
    }
  }

  async function mutateRun(envelope) {
    const runId = safeId(envelope.command.runId, "Run ID");
    return serializeRun(runId, async () => {
      const previous = await recoverState(runId);
      const duplicate = existingReceipt(previous, envelope);
      if (duplicate) return duplicate;
      requireRevision(previous, envelope);
      const next = structuredClone(previous);
      const command = envelope.command;
      let eventType;
      let payload = {};

      if (TERMINAL_CONDITIONS.has(previous.condition) && command.kind !== "direct") {
        throw httpError(`Run is already ${previous.condition}.`, 409, "PRECONDITION_FAILED");
      }

      if (command.kind === "respond") {
        if (envelope.actor.kind !== "local-user") {
          throw httpError("Only the local user may decide an approval request.", 403, "POLICY_BLOCKED");
        }
        const attention = next.attentions.find((item) => item.id === command.attentionId && item.status === "pending");
        if (!attention) throw httpError("Approval request is no longer pending.", 409, "STALE_DECISION");
        if (command.response?.requestHash !== attention.requestHash) throw httpError("Approval does not match the displayed proposal.", 409, "STALE_DECISION");
        if (!["approve-once", "deny"].includes(command.response?.kind)) throw httpError("Approval decision is invalid.");
        if (attention.category === "brief-rights-budget" && command.response.kind === "approve-once" && command.response.rightsConfirmed !== true) {
          throw httpError("Confirm that you may use the requested and attached material before starting.");
        }
        attention.status = command.response.kind === "approve-once" ? "approved" : "denied";
        attention.decidedAt = clock().toISOString();
        attention.decision = { kind: command.response.kind, actor: envelope.actor, notes: command.response.notes || null };
        next.condition = attention.status === "approved"
          ? (next.attentions.some((item) => item.status === "pending") ? "needs_approval" : "active")
          : "paused";
        next.currentTask = attention.status === "approved" ? "Waiting for an agent to complete intake evidence" : "Brief approval denied";
        next.taskDetail = attention.status === "approved"
          ? "Use the project folder and record real artifacts through the local command contract."
          : "No external or media action was executed.";
        next.notice = attention.status === "approved"
          ? "Brief approved once. Uploads, spend, provider quota, and publishing remain disabled."
          : "Run paused without executing the proposed work.";
        eventType = "DecisionRecorded";
        payload = { attentionId: attention.id, decision: attention.status, requestHash: attention.requestHash };
      } else if (command.kind === "direct") {
        const text = safeText(command.text, "Direction");
        const message = { id: `message-${randomUUID()}`, role: "user", content: text, createdAt: clock().toISOString(), demo: false };
        const eventMessage = { id: `message-${randomUUID()}`, role: "event", content: "Direction recorded · no unobserved tool or provider result was claimed", createdAt: clock().toISOString(), demo: false };
        next.messages.push(message, eventMessage);
        next.notice = "Direction recorded durably. Execution still requires an observed runner/tool event.";
        eventType = "DirectionRecorded";
        payload = { messages: [message, eventMessage] };
      } else if (command.kind === "control") {
        if (!["pause", "resume", "cancel"].includes(command.operation)) throw httpError("Control operation is invalid.");
        if (command.operation === "cancel" && envelope.actor.kind !== "local-user") {
          throw httpError("Only the authenticated local user may cancel a production run.", 403, "POLICY_BLOCKED");
        }
        if (command.operation === "pause") next.condition = "paused";
        if (command.operation === "resume") next.condition = next.attentions.some((item) => item.status === "pending") ? "needs_approval" : "active";
        if (command.operation === "cancel") next.condition = "cancelled";
        next.notice = command.operation === "resume" ? "Run resumed from durable state." : `Run ${command.operation}d. No new external action was started.`;
        eventType = "RunControlled";
        payload = { operation: command.operation };
      } else if (command.kind === "attach-source") {
        const requested = [...new Set((command.sourceIds || []).map((id) => safeId(id, "Source ID")))];
        if (requested.length === 0) throw httpError("At least one source ID is required.");
        const sources = await resolveSources(requested);
        if (sources.length !== requested.length) throw httpError("One or more local source references do not exist.");
        const additions = sources.filter((source) => !next.sources.some((entry) => entry.id === source.id));
        next.sourceIds = [...new Set([...next.sourceIds, ...requested])];
        next.sources = [...next.sources, ...additions.map((source) => ({ id: source.id, sha256: source.sha256 }))];
        if (additions.length > 0) {
          const allSources = await resolveSources(next.sourceIds);
          next.directorPlan = createDirectorPlan({ outcome: next.outcome, mode: next.mode, sources: allSources });
          await Promise.all([
            writeDirectorFiles(projectDirectory(runId), next.directorPlan),
            atomicWrite(path.join(projectDirectory(runId), "source", "SOURCE_REFERENCES.json"), {
              schemaVersion: 2,
              sources: allSources.map((source) => ({
                id: source.id,
                kind: source.kind,
                name: source.name,
                sha256: source.sha256,
                size: source.size ?? null,
                mediaType: source.mediaType ?? null,
                url: source.url ?? null,
                localOnly: true
              }))
            })
          ]);
          const supersededAt = clock().toISOString();
          for (const priorApproval of next.attentions.filter((attention) => ["pending", "approved"].includes(attention.status))) {
            priorApproval.status = "superseded";
            priorApproval.supersededAt = supersededAt;
          }
          for (const artifact of next.artifacts.filter((item) => item.status !== "rejected")) {
            artifact.status = "superseded";
            artifact.supersededAt = supersededAt;
            artifact.supersededReason = "The Director plan changed after new source bytes were attached.";
          }
          for (const job of next.jobs) {
            const wasActive = ["submitting", "accepted", "running", "reconciling", "unknown"].includes(job.state);
            job.state = wasActive ? "unknown" : "cancelled";
            job.observations ||= [];
            job.observations.push({
              state: job.state,
              at: supersededAt,
              detail: wasActive
                ? "Plan superseded while the external state may still exist; reconcile before any retry."
                : "Plan superseded by newly attached source bytes."
            });
          }
          next.phaseStatus = initialPhaseStatus(next.directorPlan);
          next.currentPhaseId = "intake";
          next.currentTask = "Reconfirm rights and rebuild from the updated source set";
          next.taskDetail = "All prior phase approvals and artifact reviews were superseded; immutable historical bytes remain preserved.";
          next.releaseGate = { status: "pending", certificate: null, openGates: PRODUCTION_PHASES.map((phase) => phase.id) };
          const proposal = {
            category: "brief-rights-budget",
            outcome: next.outcome,
            sourceHashes: next.sources.map((source) => source.sha256),
            externalUploads: false,
            cashBudget: 0,
            providerQuota: {}
          };
          const attention = {
            id: `attention-${randomUUID()}`,
            kind: "approval",
            category: "brief-rights-budget",
            title: "Confirm the updated source set",
            detail: "New local source bytes changed the proposal. Confirm that you may use all attached material; uploads, spend, and publishing remain disabled.",
            requestHash: jsonHash(proposal),
            proposal,
            status: "pending",
            createdAt: clock().toISOString(),
            decidedAt: null,
            decision: null
          };
          next.attentions.push(attention);
          next.condition = "needs_approval";
          next.notice = `${additions.length} new content-addressed source${additions.length === 1 ? "" : "s"} attached locally; prior execution, approvals, phase gates, and artifact reviews were superseded without deleting history.`;
        } else {
          next.notice = "The requested source was already attached; the approved proposal did not change.";
        }
        eventType = "SourcesAttached";
        payload = { sourceIds: requested, sourceHashes: sources.map((source) => source.sha256), approvalInvalidated: additions.length > 0 };
      } else if (command.kind === "bind-runner") {
        const runtimeId = safeId(command.runtimeId, "Runtime ID");
        const adapterId = safeId(command.adapterId, "Adapter ID");
        const trustedReceipt = ["system", "adapter"].includes(envelope.actor.kind)
          && command.conformance === "passed"
          && typeof command.probeReceipt === "string"
          && command.probeReceipt.trim().length >= 8;
        const status = trustedReceipt ? "connected" : "handoff_only";
        next.runner = {
          runtimeId,
          name: safeText(command.name || runtimeId, "Runtime name", { maximum: 120 }),
          adapterId,
          sessionId: command.sessionId ? safeId(command.sessionId, "Session ID") : null,
          executableVersion: command.executableVersion || null,
          conformance: trustedReceipt ? "passed" : "not-proven",
          probeReceipt: trustedReceipt ? command.probeReceipt.trim() : null,
          status
        };
        next.notice = status === "connected"
          ? `${next.runner.name} emitted a conformance-backed session receipt.`
          : `${next.runner.name} is available for folder handoff only; live control is not claimed.`;
        eventType = "RunnerObserved";
        payload = { ...next.runner };
      } else if (command.kind === "raise-attention") {
        const category = safeId(command.category, "Attention category");
        const proposal = command.proposal && typeof command.proposal === "object" ? command.proposal : {};
        const attention = {
          id: `attention-${randomUUID()}`,
          kind: "approval",
          category,
          title: safeText(command.title, "Attention title", { maximum: 160 }),
          detail: safeText(command.detail, "Attention detail", { maximum: 2000 }),
          requestHash: jsonHash({ category, proposal }),
          proposal,
          status: "pending",
          createdAt: clock().toISOString(),
          decidedAt: null,
          decision: null
        };
        next.attentions.push(attention);
        next.condition = "needs_approval";
        next.notice = `Approval required: ${attention.title}`;
        eventType = "AttentionRaised";
        payload = { attention };
      } else if (command.kind === "observe-job") {
        const jobId = safeId(command.jobId, "Job ID");
        const shotId = command.shotId ? safeId(command.shotId, "Shot ID") : null;
        if (shotId && !next.directorPlan?.shots?.some((shot) => shot.id === shotId)) throw httpError("Observed job shot does not exist.");
        const allowedStates = ["planned", "waiting_approval", "submitting", "accepted", "running", "reconciling", "outputs_staged", "verified_output", "failed", "unknown", "cancelled"];
        if (!allowedStates.includes(command.state)) throw httpError("Job state is invalid.");
        let job = next.jobs.find((item) => item.id === jobId);
        if (!job) {
          job = { id: jobId, shotId, adapterId: command.adapterId || null, capability: command.capability || null, state: "planned", observations: [] };
          next.jobs.push(job);
        }
        if (shotId) job.shotId = shotId;
        job.state = command.state;
        job.externalReceipt = command.externalReceipt || job.externalReceipt || null;
        job.observations.push({ state: command.state, at: clock().toISOString(), detail: command.detail || null });
        next.notice = `Observed job ${jobId}: ${command.state}. This is not a completion claim.`;
        eventType = "ExternalJobObserved";
        payload = { jobId, state: job.state, externalReceipt: job.externalReceipt };
      } else if (command.kind === "record-artifact") {
        if (!ROLES.has(command.role)) throw httpError("Artifact role is not recognized.");
        const resolved = await resolveProjectFile(projectDirectory(runId), command.relativePath);
        const sha256 = await fileHash(resolved.absolutePath);
        const verification = MEDIA_ROLES.has(command.role)
          ? await mediaVerifier.verify(resolved.absolutePath)
          : { result: "pass", claim: "content_addressed", method: "sha256", detail: "Non-empty file was contained and hashed." };
        const artifact = {
          id: `artifact-${randomUUID()}`,
          title: safeText(command.title || path.basename(resolved.relativePath), "Artifact title", { maximum: 180 }),
          role: command.role,
          relativePath: resolved.relativePath,
          sha256,
          size: resolved.info.size,
          status: "candidate",
          verification,
          parentArtifactId: command.parentArtifactId || null,
          revision: next.revision + 1,
          recordedAt: clock().toISOString(),
          reviewedAt: null,
          review: null
        };
        if (["preview_qa", "master_qa", "variant_qa"].includes(command.role)) {
          const parent = next.artifacts.find((item) => item.id === command.parentArtifactId);
          if (!parent) throw httpError("QA evidence must name its immutable media artifact.");
          const expectedParentRole = { preview_qa: "preview_media", master_qa: "master_media", variant_qa: "variant_media" }[command.role];
          if (parent.role !== expectedParentRole) throw httpError(`${command.role} must bind a ${expectedParentRole} artifact.`);
          try {
            const qa = await readJson(resolved.absolutePath);
            const passed = ["pass", "passed"].includes(String(qa.status || qa.result).toLowerCase());
            const boundHash = qa.artifactSha256 || qa.artifact_sha256 || qa.subjectSha256;
            artifact.verification = {
              result: passed && boundHash === parent.sha256 ? "pass" : "fail",
              claim: command.role,
              method: "hash-bound-qa-json",
              detail: passed && boundHash === parent.sha256 ? "QA result passed and matches the media hash." : "QA JSON did not pass or did not bind the exact media hash."
            };
          } catch {
            artifact.verification = { result: "fail", claim: command.role, method: "hash-bound-qa-json", detail: "QA evidence is not valid JSON." };
          }
        }
        if (command.role === "profile_validation") {
          try {
            const validation = await readJson(resolved.absolutePath);
            const unresolved = Array.isArray(validation.unresolved) ? validation.unresolved : [];
            const passed = ["pass", "passed"].includes(String(validation.status || validation.result).toLowerCase()) && unresolved.length === 0;
            artifact.verification = {
              result: passed ? "pass" : "fail",
              claim: "profile_validation",
              method: "profile-validation-json",
              detail: passed ? "Profile validation passed with no unresolved required fields." : "Profile validation is not passed or still has unresolved fields."
            };
          } catch {
            artifact.verification = { result: "fail", claim: "profile_validation", method: "profile-validation-json", detail: "Profile validation is not valid JSON." };
          }
        }
        if (command.role === "final_release") {
          const master = [...next.artifacts].reverse().find((item) => item.role === "master_media" && item.status === "approved");
          try {
            const release = await readJson(resolved.absolutePath);
            const status = String(release.run_status || release.runStatus || release.releaseDecision || "").toLowerCase();
            const masterHash = release.canonical_master?.sha256 || release.canonicalMaster?.sha256 || release.masterSha256;
            const passed = Boolean(master) && status === "release_passed" && masterHash === master.sha256;
            artifact.verification = {
              result: passed ? "pass" : "fail",
              claim: "final_release",
              method: "release-manifest-json",
              detail: passed ? "Release manifest names the exact approved master hash." : "Release manifest is not release_passed or does not bind the approved master hash."
            };
          } catch {
            artifact.verification = { result: "fail", claim: "final_release", method: "release-manifest-json", detail: "Final release manifest is not valid JSON." };
          }
        }
        if (command.role === "sha256sums") {
          const master = [...next.artifacts].reverse().find((item) => item.role === "master_media" && item.status === "approved");
          const checksumText = await readFile(resolved.absolutePath, "utf8");
          const passed = Boolean(master) && checksumText.split(/\r?\n/).some((line) => {
            const [hash, ...nameParts] = line.trim().split(/\s+/);
            const name = nameParts.join(" ").replace(/^\*/, "");
            return hash === master.sha256 && (name === master.relativePath || name === path.basename(master.relativePath));
          });
          artifact.verification = {
            result: passed ? "pass" : "fail",
            claim: "sha256sums",
            method: "checksum-manifest",
            detail: passed ? "Checksum manifest contains the exact approved master path and hash." : "Checksum manifest does not contain the approved master hash/path."
          };
        }
        next.artifacts.push(artifact);
        next.notice = `${artifact.title} staged as a candidate with SHA-256 ${sha256.slice(0, 12)}….`;
        eventType = "ArtifactStaged";
        payload = { artifactId: artifact.id, role: artifact.role, sha256, verification: artifact.verification.result };
      } else if (command.kind === "review-artifact") {
        const artifact = next.artifacts.find((item) => item.id === command.artifactId);
        if (!artifact) throw httpError("Artifact does not exist.", 404, "NOT_FOUND");
        if (artifact.status === "superseded") throw httpError("Artifact belongs to a superseded production scope.", 409, "STALE_EVIDENCE");
        if (MEDIA_ROLES.has(artifact.role) && envelope.actor.kind !== "local-user") {
          throw httpError("Media approval requires an explicit local-user review.", 403, "POLICY_BLOCKED");
        }
        const resolved = await resolveProjectFile(projectDirectory(runId), artifact.relativePath);
        if (await fileHash(resolved.absolutePath) !== artifact.sha256) throw httpError("Artifact bytes changed after registration.", 409, "STALE_EVIDENCE");
        if (!["approve", "reject"].includes(command.verdict)) throw httpError("Artifact verdict is invalid.");
        if (command.verdict === "approve" && artifact.verification?.result !== "pass") {
          throw httpError("Artifact verification has not passed.", 409, "PRECONDITION_FAILED");
        }
        artifact.status = command.verdict === "approve" ? "approved" : "rejected";
        artifact.reviewedAt = clock().toISOString();
        artifact.review = { verdict: command.verdict, reason: command.reason ? safeText(command.reason, "Review reason", { maximum: 1000 }) : null, actor: envelope.actor };
        next.notice = `${artifact.title} ${artifact.status}; verdict is bound to ${artifact.sha256.slice(0, 12)}….`;
        eventType = "ArtifactReviewed";
        payload = { artifactId: artifact.id, verdict: command.verdict, sha256: artifact.sha256 };
      } else if (command.kind === "waive-phase") {
        const phase = PRODUCTION_PHASES.find((item) => item.id === next.currentPhaseId);
        if (!phase || !next.phaseStatus[phase.id]?.optional) throw httpError("Only the current optional phase can be marked N/A.");
        const reason = safeText(command.reason, "N/A reason", { minimum: 10, maximum: 1000 });
        next.phaseStatus[phase.id].status = "waived";
        next.phaseStatus[phase.id].waiverReason = reason;
        next.phaseStatus[phase.id].passedAt = clock().toISOString();
        next.phaseStatus[phase.id].evidenceArtifactIds = [];
        eventType = "PhaseWaived";
        payload = { phaseId: phase.id, reason };
        advancePhase(next);
      } else if (command.kind === "pass-phase") {
        const phase = PRODUCTION_PHASES.find((item) => item.id === next.currentPhaseId);
        if (!phase) throw httpError("Run has no open production phase.", 409);
        if (phase.id === "intake" && !next.attentions.some((attention) => attention.category === "brief-rights-budget" && attention.status === "approved")) {
          throw httpError("Intake requires the hash-bound brief/rights/budget decision.", 409, "PRECONDITION_FAILED");
        }
        const evidenceArtifactIds = await evidenceForPhase(next, phase);
        if (phase.id === "delivery") await verifyPassedPhaseEvidence(next);
        next.phaseStatus[phase.id].status = "passed";
        next.phaseStatus[phase.id].passedAt = clock().toISOString();
        next.phaseStatus[phase.id].evidenceArtifactIds = evidenceArtifactIds;
        eventType = "PhasePassed";
        payload = { phaseId: phase.id, evidenceRoles: phase.requiredRoles };
        advancePhase(next);
      } else {
        throw httpError("Run command is not supported.");
      }

      next.revision += 1;
      if (next.condition === "completed" && !next.releaseGate.certificateFileSha256) {
        const certificatePath = path.join(projectDirectory(runId), "delivery", "COMPLETION_CERTIFICATE.json");
        await atomicWrite(certificatePath, next.releaseGate.certificate);
        next.releaseGate.certificateFileSha256 = await fileHash(certificatePath);
      }
      const receipt = { accepted: true, runId, revision: next.revision, sequence: next.eventSequence + 1, cursor: String(next.eventSequence + 1) };
      recordReceipt(next, envelope, receipt);
      await persistEvent(previous, next, eventType, payload, envelope);
      return receipt;
    });
  }

  function advancePhase(snapshot) {
    const currentIndex = PRODUCTION_PHASES.findIndex((phase) => phase.id === snapshot.currentPhaseId);
    const nextPhase = PRODUCTION_PHASES[currentIndex + 1];
    if (nextPhase) {
      snapshot.currentPhaseId = nextPhase.id;
      snapshot.phaseStatus[nextPhase.id].status = "waiting";
      snapshot.condition = "active";
      snapshot.currentTask = `${nextPhase.label} evidence required`;
      snapshot.taskDetail = `Register and approve: ${nextPhase.requiredRoles.join(", ")}${snapshot.phaseStatus[nextPhase.id].optional ? ", or record an explicit N/A reason" : ""}.`;
      snapshot.notice = `${PRODUCTION_PHASES[currentIndex].label} gate passed on recorded evidence.`;
      snapshot.releaseGate.openGates = PRODUCTION_PHASES.filter((phase) => !["passed", "waived"].includes(snapshot.phaseStatus[phase.id].status)).map((phase) => phase.id);
      return;
    }
    const master = [...snapshot.artifacts].reverse().find((artifact) => artifact.role === "master_media" && artifact.status === "approved");
    const release = [...snapshot.artifacts].reverse().find((artifact) => artifact.role === "final_release" && artifact.status === "approved");
    const checksum = [...snapshot.artifacts].reverse().find((artifact) => artifact.role === "sha256sums" && artifact.status === "approved");
    if (!master || !release || !checksum || Object.values(snapshot.phaseStatus).some((phase) => !["passed", "waived"].includes(phase.status))) {
      throw httpError("Release certificate prerequisites are incomplete.", 409, "PRECONDITION_FAILED");
    }
    const certificate = {
      schemaVersion: 2,
      workflowVersion: snapshot.workflowVersion,
      runId: snapshot.id,
      runStatus: "release_passed",
      canonicalMaster: { artifactId: master.id, relativePath: master.relativePath, sha256: master.sha256 },
      finalReleaseSha256: release.sha256,
      sha256sumsSha256: checksum.sha256,
      passedGates: PRODUCTION_PHASES.filter((phase) => snapshot.phaseStatus[phase.id].status === "passed").map((phase) => phase.id),
      naModules: PRODUCTION_PHASES.filter((phase) => snapshot.phaseStatus[phase.id].status === "waived").map((phase) => ({ id: phase.id, reason: snapshot.phaseStatus[phase.id].waiverReason })),
      evidenceByGate: Object.fromEntries(PRODUCTION_PHASES.map((phase) => [phase.id, snapshot.phaseStatus[phase.id].evidenceArtifactIds || []])),
      relativePath: "delivery/COMPLETION_CERTIFICATE.json",
      certifiedAt: clock().toISOString()
    };
    certificate.certificateHash = jsonHash(certificate);
    snapshot.releaseGate = { status: "release_passed", certificate, certificateFileSha256: null, openGates: [] };
    snapshot.condition = "completed";
    snapshot.currentTask = "Release certificate issued";
    snapshot.taskDetail = `Canonical master ${master.sha256.slice(0, 12)}… passed every applicable recorded gate.`;
    snapshot.notice = "Completed from immutable artifacts and evidence—not from agent text or an exit code.";
  }

  async function command(envelope) {
    if (!envelope || typeof envelope !== "object" || !envelope.command || typeof envelope.command !== "object") throw httpError("Command envelope is required.");
    safeId(envelope.commandId, "Command ID");
    if (!envelope.actor || !["local-user", "local-agent", "adapter", "system"].includes(envelope.actor.kind)) throw httpError("Command actor is invalid.");
    safeId(envelope.actor.id, "Actor ID");
    if (envelope.command.kind === "start") return start(envelope);
    return mutateRun(envelope);
  }

  async function read(query) {
    await ensureIndex();
    if (query.kind === "list") {
      const index = await readJson(indexPath);
      const snapshots = await Promise.all(Object.keys(index.runs).map((runId) => recoverState(runId)));
      return snapshots.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(publicRun);
    }
    if (query.kind === "run") return publicRun(await recoverState(safeId(query.runId, "Run ID")));
    if (query.kind === "snapshot") return recoverState(safeId(query.runId, "Run ID"));
    if (query.kind === "messages") return (await recoverState(safeId(query.runId, "Run ID"))).messages;
    if (query.kind === "artifacts") {
      const index = await readJson(indexPath);
      const snapshots = await Promise.all(Object.keys(index.runs).map((runId) => recoverState(runId)));
      return snapshots.flatMap((snapshot) => snapshot.artifacts.map((artifact) => publicArtifact(artifact, snapshot)));
    }
    if (query.kind === "artifact") {
      const artifacts = await read({ kind: "artifacts" });
      return artifacts.find((artifact) => artifact.id === query.artifactId) || null;
    }
    if (query.kind === "artifact-path") {
      const index = await readJson(indexPath);
      for (const runId of Object.keys(index.runs)) {
        const snapshot = await recoverState(runId);
        const artifact = snapshot.artifacts.find((item) => item.id === query.artifactId);
        if (artifact) {
          const resolved = await resolveProjectFile(projectDirectory(runId), artifact.relativePath);
          if (await fileHash(resolved.absolutePath) !== artifact.sha256) throw httpError("Artifact changed after registration.", 409, "STALE_EVIDENCE");
          return { ...publicArtifact(artifact, snapshot), absolutePath: resolved.absolutePath };
        }
      }
      return null;
    }
    if (query.kind === "events") {
      const runId = safeId(query.runId, "Run ID");
      const after = Number(query.afterSequence || 0);
      const entries = (await readdir(path.join(projectDirectory(runId), "events"))).filter((name) => /^\d{8}\.json$/.test(name)).sort();
      return Promise.all(entries.filter((name) => Number(name.slice(0, 8)) > after).map((name) => readJson(path.join(projectDirectory(runId), "events", name))));
    }
    throw httpError("Run query is not supported.");
  }

  async function* follow({ runId, afterSequence = 0, signal, pollMs = 300 }) {
    let cursor = Number(afterSequence) || 0;
    while (!signal?.aborted) {
      const events = await read({ kind: "events", runId, afterSequence: cursor });
      for (const event of events) {
        cursor = event.sequence;
        yield event;
      }
      if (signal?.aborted) break;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  return { command, read, follow, ensure: ensureIndex };
}
