const STAGES = [
  { id: "plan", label: "Plan", phaseIds: ["intake", "research"] },
  { id: "script", label: "Script", phaseIds: ["script"] },
  { id: "storyboard", label: "Storyboard", phaseIds: ["storyboard"] },
  { id: "generate", label: "Generate", phaseIds: ["acquisition", "capture"] },
  { id: "voice", label: "Voice", phaseIds: ["audio"] },
  { id: "edit", label: "Edit", phaseIds: ["edit", "master"] },
  { id: "review", label: "Review", phaseIds: ["preview_qa", "delivery"] }
];

const SOURCE_LABELS = {
  "licensed-clips": { planned: "Licensed character clip planned", ready: "Licensed character clip ready" },
  "ai-video": { planned: "AI shot planned", ready: "AI shot ready" },
  "blender-mockup": { planned: "Blender shot planned", ready: "Blender shot ready" }
};

const BEAT_DEFINITIONS = [
  { id: "hook", label: "Hook", title: "Stop the scroll", description: "Open on a human question or tension." },
  { id: "setup", label: "Setup", title: "Make it matter", description: "Give the character a believable reason to act." },
  { id: "product", label: "Product", title: "Show the proof", description: "Keep authentic product pixels readable." },
  { id: "result", label: "Result", title: "Make it believable", description: "Resolve the character story without exaggeration." },
  { id: "cta", label: "CTA", title: "Land one action", description: "Finish on one clear, readable next step." }
];

const QUIET_ACTIVITY_TYPES = new Set([
  "message.delta",
  "terminal.output",
  "usage.updated"
]);

function stageStatus(run, stage) {
  const statuses = stage.phaseIds.map((id) => run.phaseStatus?.[id]?.status || "pending");
  if (stage.phaseIds.includes(run.currentPhaseId) && !statuses.every((status) => ["passed", "waived"].includes(status))) return "active";
  if (statuses.every((status) => ["passed", "waived"].includes(status))) return "complete";
  return "waiting";
}

function sourceFor(shot) {
  const assigned = Boolean(shot.selectedAssetId);
  const labels = SOURCE_LABELS[shot.primarySourceLaneId];
  return {
    laneId: shot.primarySourceLaneId,
    assigned,
    assetId: shot.selectedAssetId || null,
    label: labels ? labels[assigned ? "ready" : "planned"] : assigned ? "Source ready" : "Source planned"
  };
}

function shotJob(run, shotId) {
  return [...(run.jobs || [])].reverse().find((job) => job.shotId === shotId) || null;
}

function shotStatus(job) {
  if (!job) return "planned";
  if (["verified_output", "outputs_staged"].includes(job.state)) return job.state === "verified_output" ? "ready" : "review";
  if (["submitting", "accepted", "running", "reconciling"].includes(job.state)) return "working";
  if (job.state === "failed") return "failed";
  return "planned";
}

function connectionFor(run) {
  const runner = run.runner;
  if (runner?.status === "connected") {
    return {
      status: "connected",
      label: `${runner.name || runner.runtimeId} · Connected`,
      runtimeId: runner.runtimeId,
      adapterId: runner.adapterId,
      sessionId: runner.sessionId
    };
  }
  if (runner) {
    return {
      status: "handoff",
      label: `${runner.name || runner.runtimeId} · Handoff`,
      runtimeId: runner.runtimeId,
      adapterId: runner.adapterId,
      sessionId: null
    };
  }
  return { status: "disconnected", label: "No live session", runtimeId: null, adapterId: null, sessionId: null };
}

function aggregateBeatStatus(shots) {
  if (shots.some((shot) => shot.status === "failed")) return "failed";
  if (shots.some((shot) => shot.status === "working")) return "working";
  if (shots.some((shot) => shot.status === "review")) return "review";
  if (shots.length && shots.every((shot) => shot.status === "ready")) return "ready";
  return "planned";
}

function beatShotGroups(storyboard) {
  const groups = Object.fromEntries(BEAT_DEFINITIONS.map((beat) => [beat.id, []]));
  const hasExplicitSetup = storyboard.some((shot) => shot.storyRegion === "human-setup");
  const legacyOpening = storyboard.filter((shot) => shot.storyRegion === "human-hook");
  const legacyHookCount = Math.max(1, Math.round(legacyOpening.length * 4 / 11));
  let legacyOpeningIndex = 0;
  for (const shot of storyboard) {
    let beatId;
    if (["hook", "setup", "product", "result", "cta"].includes(shot.storyBeatId)) {
      beatId = shot.storyBeatId;
    } else if (shot.storyRegion === "human-hook") {
      beatId = hasExplicitSetup || legacyOpeningIndex < legacyHookCount ? "hook" : "setup";
      legacyOpeningIndex += 1;
    } else if (shot.storyRegion === "human-setup") beatId = "setup";
    else if (shot.storyRegion === "product-proof") beatId = "product";
    else if (shot.storyRegion === "human-resolution") beatId = "result";
    else beatId = "cta";
    groups[beatId].push(shot);
  }
  return groups;
}

function projectBeats(storyboard, continuityStatus) {
  const groups = beatShotGroups(storyboard);
  return BEAT_DEFINITIONS.map((definition, index) => {
    const shots = groups[definition.id];
    const first = shots[0] || null;
    const last = shots.at(-1) || null;
    const characterRequired = shots.some((shot) => shot.character.inFrame);
    return {
      ...definition,
      number: index + 1,
      shotIds: shots.map((shot) => shot.id),
      shotCount: shots.length,
      durationSeconds: Number(shots.reduce((sum, shot) => sum + shot.durationSeconds, 0).toFixed(3)),
      timeRangeSeconds: first && last ? { start: first.timeRangeSeconds.start, end: last.timeRangeSeconds.end } : null,
      status: aggregateBeatStatus(shots),
      sourceLabels: [...new Set(shots.map((shot) => shot.source.label))],
      character: {
        required: characterRequired,
        label: characterRequired ? "Same character" : "Product only",
        continuityStatus: characterRequired ? continuityStatus : "unavailable"
      },
      previewUrl: shots.find((shot) => shot.previewUrl)?.previewUrl || null
    };
  });
}

export function projectProductionCockpit(run) {
  const plan = run.directorPlan || null;
  const continuityId = plan?.characterBible?.continuityId || null;
  const storyboard = (plan?.shots || []).map((shot, index) => {
    const job = shotJob(run, shot.id);
    const inFrame = Boolean(shot.characterRefId);
    const continuityStatus = !inFrame
      ? "not-applicable"
      : shot.characterRefId === continuityId
        ? shot.continuity?.state === "evidence-passed"
          ? "evidence-passed"
          : shot.continuity?.state === "references-bound"
            ? "reference-bound"
            : "planned-unverified"
        : "mismatch";
    return {
      id: shot.id,
      number: index + 1,
      storyRegion: shot.storyRegion,
      storyBeatId: shot.storyBeatId || null,
      durationSeconds: shot.durationSeconds,
      timeRangeSeconds: shot.timeRangeSeconds,
      purpose: shot.purpose,
      action: shot.action || "Not specified",
      framing: shot.framing || "Not specified",
      source: sourceFor(shot),
      status: shotStatus(job),
      job: job ? {
        id: job.id,
        adapterId: job.adapterId || null,
        capability: job.capability || null,
        state: job.state,
        lastObservation: job.observations?.at(-1) || null
      } : null,
      character: {
        inFrame,
        continuityId: inFrame ? shot.characterRefId : null,
        expectedContinuityId: inFrame ? continuityId : null,
        continuityStatus,
        label: inFrame ? `Same character · ${shot.characterRefId}` : "No character in frame",
        locks: inFrame ? (plan?.characterBible?.locks || []) : []
      },
      proof: shot.proof || null,
      previewUrl: null
    };
  });
  const mismatchedShotIds = storyboard.filter((shot) => shot.character.continuityStatus === "mismatch").map((shot) => shot.id);
  const characterShots = storyboard.filter((shot) => shot.character.inFrame);
  const continuityStatus = mismatchedShotIds.length
    ? "warning"
    : characterShots.length && characterShots.every((shot) => shot.character.continuityStatus === "evidence-passed")
      ? "evidence-passed"
      : continuityId
        ? "planned-unverified"
        : "unavailable";
  const beats = projectBeats(storyboard, continuityStatus);
  const activity = [...(run.runnerEvents || [])]
    .reverse()
    .filter((event) => !QUIET_ACTIVITY_TYPES.has(event.type))
    .slice(0, 100)
    .map((event) => ({
      ...event,
      truthful: true,
      label: event.detail || event.title || event.type
    }));
  const liveJob = [...(run.jobs || [])].reverse().find((job) => ["submitting", "accepted", "running", "reconciling"].includes(job.state))
    || [...(run.jobs || [])].reverse()[0]
    || null;
  const lastObservation = liveJob?.observations?.at(-1) || null;
  return {
    schemaVersion: 1,
    runId: run.id,
    title: run.title,
    condition: run.condition,
    eventSequence: run.eventSequence || 0,
    connection: connectionFor(run),
    stages: STAGES.map((stage) => ({ id: stage.id, label: stage.label, status: stageStatus(run, stage) })),
    activity,
    currentTask: {
      title: run.currentTask || "Waiting for observed work",
      detail: run.taskDetail || "No live tool action has been observed."
    },
    toolStage: liveJob ? {
      jobId: liveJob.id,
      shotId: liveJob.shotId || null,
      adapterId: liveJob.adapterId || null,
      capability: liveJob.capability || null,
      status: liveJob.state,
      detail: lastObservation?.detail || "Observed agent work",
      observedAt: lastObservation?.at || null,
      externalReceipt: liveJob.externalReceipt || null
    } : null,
    storyboard,
    beats,
    continuity: {
      continuityId,
      sourceStatus: plan?.characterBible?.status || "unavailable",
      status: continuityStatus,
      mismatchedShotIds,
      locks: plan?.characterBible?.locks || []
    },
    preview: {
      artifactId: run.primaryArtifact?.id || null,
      contentUrl: run.primaryArtifact?.contentUrl || null,
      status: run.primaryArtifact ? "artifact" : liveJob ? "working" : "waiting"
    }
  };
}
