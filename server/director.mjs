import { createHash } from "node:crypto";

export const DIRECTOR_VERSION = "1.1";

const PREMIUM_REFERENCE_GRAMMAR = Object.freeze({
  id: "premium-vertical-reference-36p5",
  use: "analysis-only-quality-grammar",
  master: { durationSeconds: 36.5, width: 2160, height: 3840, fps: 30 },
  measuredAudio: { integratedLufs: -16, loudnessRangeLu: 4.1, truePeakDbfs: -1.8 },
  cutSeconds: [0.8, 1.6, 2.4, 3.2, 4.2, 5.1, 6, 6.9, 8.2, 9, 9.8, 11.467, 13.233, 14.633, 16.067, 17.667, 19.267, 20.7, 22.1, 23.5, 25.367, 27.267, 28.8, 30.3, 32.7, 36.5],
  regions: [
    { id: "human-hook", from: 0, to: 0.088, job: "Fast real-character question and tension." },
    { id: "human-setup", from: 0.088, to: 0.269, job: "Make the situation and character intent believable." },
    { id: "product-proof", from: 0.269, to: 0.53, job: "Readable authentic UI inside a dimensional device stage." },
    { id: "human-resolution", from: 0.53, to: 0.79, job: "Calmer human performance and one believable next step." },
    { id: "product-cta", from: 0.79, to: 1, job: "Product return, finite settle, one locked action." }
  ],
  transferablePrinciples: [
    "human emotion earns the product reveal",
    "authentic product pixels remain readable",
    "opening cuts are faster than proof and CTA holds",
    "one restrained caption system changes role at story turns",
    "voice, music, picture, and CTA share one timed arc"
  ],
  protectedExpression: ["dialogue", "actor", "ordered shots", "music", "brand artwork", "caption artwork", "CTA wording"]
});

export const DIRECTOR_ADAPTERS = Object.freeze([
  {
    id: "elevenlabs.tts_alignment",
    laneId: "voice",
    access: "api-or-supervised-browser",
    truthState: "unavailable",
    credentialNames: ["ELEVENLABS_API_KEY"],
    capabilities: ["natural-narration", "character-timestamps", "pronunciation-auditions"]
  },
  {
    id: "heygen.avatar_v3",
    laneId: "character",
    access: "api-or-supervised-browser",
    truthState: "unavailable",
    credentialNames: ["HEYGEN_API_KEY"],
    capabilities: ["consented-digital-twin", "audio-driven-lip-sync"]
  },
  {
    id: "google.gemini_omni_video",
    laneId: "ai-video",
    access: "api",
    truthState: "unavailable",
    credentialNames: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    capabilities: ["reference-video-generation", "iterative-video-edit"]
  },
  {
    id: "google.veo_3_1",
    laneId: "ai-video",
    access: "api",
    truthState: "unavailable",
    credentialNames: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    capabilities: ["first-last-frame", "reference-images", "high-resolution-video"]
  },
  {
    id: "google.flow.browser",
    laneId: "ai-video",
    access: "supervised-browser",
    truthState: "unavailable",
    credentialNames: [],
    capabilities: ["user-visible-video-generation", "continuity-project"]
  },
  {
    id: "stock.rights_gated",
    laneId: "licensed-clips",
    access: "api-or-supervised-browser",
    truthState: "unavailable",
    credentialNames: ["PEXELS_API_KEY", "PIXABAY_API_KEY", "SHUTTERSTOCK_API_TOKEN"],
    capabilities: ["search", "license-ledger", "download-and-hash"]
  },
  {
    id: "blender.local_compositor",
    laneId: "blender-mockup",
    access: "local-cli",
    truthState: "unavailable",
    toolId: "blender",
    credentialNames: [],
    capabilities: ["device-mockup", "screen-image-texture", "screen-video-texture", "camera-lighting", "background-render"]
  },
  {
    id: "ffmpeg.local_edit_qa",
    laneId: "edit-qa",
    access: "local-cli",
    truthState: "unavailable",
    toolId: "ffmpeg",
    credentialNames: [],
    capabilities: ["frame-locked-edit", "audio-mix", "captions", "full-decode-qa"]
  }
]);

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function durationFrom(outcome) {
  const match = outcome.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:-|\s)?(?:seconds?|secs?|sec|s)\b/i);
  const parsed = match ? Number(match[1]) : 30;
  return Number.isFinite(parsed) && parsed >= 10 && parsed <= 180 ? parsed : 30;
}

function aspectFrom(outcome) {
  const explicit = outcome.match(/\b(9\s*:\s*16|16\s*:\s*9|4\s*:\s*5|1\s*:\s*1)\b/);
  if (explicit) return explicit[1].replaceAll(" ", "");
  return /\b(vertical|reel|shorts?|tiktok|phone|mobile|app)\b/i.test(outcome) ? "9:16" : "16:9";
}

function resolutionFor(aspectRatio) {
  if (aspectRatio === "16:9") return { width: 3840, height: 2160 };
  if (aspectRatio === "4:5") return { width: 2160, height: 2700 };
  if (aspectRatio === "1:1") return { width: 2160, height: 2160 };
  return { width: 2160, height: 3840 };
}

function sourceSummary(sources) {
  return sources.map((source) => ({
    id: source.id,
    kind: source.kind || "local-source",
    name: source.name || source.id,
    sha256: source.sha256 || null,
    mediaType: source.mediaType || null,
    localOnly: true
  }));
}

function shot({ id, startFrame, endFrame, fps, region, purpose, action, framing, laneIds, primarySourceLaneId, characterRefId, preferredAdapter, proof, matchFromShotId }) {
  const storyBeatId = {
    "human-hook": "hook",
    "human-setup": "setup",
    "product-proof": "product",
    "human-resolution": "result",
    "product-cta": "cta"
  }[region];
  return {
    id,
    frameRange: { start: startFrame, end: endFrame, convention: "half-open" },
    timeRangeSeconds: { start: Number((startFrame / fps).toFixed(3)), end: Number((endFrame / fps).toFixed(3)) },
    durationSeconds: Number(((endFrame - startFrame) / fps).toFixed(3)),
    storyRegion: region,
    storyBeatId,
    purpose,
    action,
    framing,
    laneIds,
    primarySourceLaneId,
    characterRefId,
    preferredAdapter,
    acquisitionOrder: [
      "approved-existing",
      "user-supplied",
      "licensed-stock",
      "authentic-capture",
      "verified-3d",
      "authorized-generation"
    ],
    proof,
    continuity: characterRefId ? {
      requirement: "same-character",
      groupId: "character-primary-v1",
      characterId: characterRefId,
      referenceIds: [],
      matchFromShotId,
      locks: ["face", "hair", "wardrobe", "body", "handedness", "device", "location-direction", "light-continuity"],
      state: "planned-unverified",
      evidenceArtifactIds: []
    } : {
      requirement: "none",
      groupId: null,
      characterId: null,
      referenceIds: [],
      matchFromShotId: null,
      locks: [],
      state: "not-applicable",
      evidenceArtifactIds: [],
      reason: "This planned device or environment shot has no character in frame."
    },
    status: "planned",
    selectedAssetId: null,
    keeperGate: "rights + continuity + effective detail + decoded motion + protected negative space"
  };
}

function createShots({ durationSeconds, fps, aiVideoRequested }) {
  const totalFrames = Math.round(durationSeconds * fps);
  const referenceFrames = [0, 24, 48, 72, 96, 126, 153, 180, 207, 246, 270, 294, 344, 397, 439, 482, 530, 578, 621, 663, 705, 761, 818, 864, 909, 981, 1095];
  const purposes = [
    "Cold-open character detail with an immediate visual question.",
    "Change facial angle or scale on the next hook phrase.",
    "Reveal enough environment to make the tension believable.",
    "Show a different motivated hand, prop or movement detail.",
    "Return to a medium reaction without repeating the prior crop.",
    "Add one truthful context beat from the same performer/session.",
    "Tighten the decision moment with a new action or eyeline.",
    "Hold a short recognition breath before the turn.",
    "Use an original non-human AI environment insert only if it improves the story.",
    "Build the final hook words while preserving face and negative space.",
    "Land the recognition beat and bridge cleanly into product proof.",
    "Reveal the dimensional device and first authentic UI state.",
    "Let the first product state remain readable while the shell settles.",
    "Advance only the authentic screen plane to the next proof state.",
    "Use a restrained callout while the device pose stays continuous.",
    "Advance the real screen capture without restarting shell motion.",
    "Finish the proof sequence on a readable, verified product result.",
    "Return to the licensed real character with calmer performance.",
    "Change action or scale while keeping the same identity and chronology.",
    "Let the emotional meaning land without an unnecessary effect.",
    "Optionally use a non-human AI metaphor or environment gap-fill.",
    "Show one believable next step rather than a dramatic transformation.",
    "Resolve the character arc and open space for the product return.",
    "Return to the same device stage and complete one finite settle.",
    "Resolve brand and value line without colliding with the device.",
    "Lock one action for the fully readable CTA and music tail."
  ];
  const actions = [
    "Holds a quiet thought, eyes moving toward the light.",
    "Turns slightly as the opening question lands.",
    "Notices the phone within a believable workspace.",
    "Hand reaches for the device with clear intent.",
    "Checks the screen and gives a restrained reaction.",
    "Crosses the workspace while keeping the same wardrobe and direction.",
    "Unlocks the phone and changes eyeline toward the product.",
    "Pauses for one recognition breath.",
    "Non-human environment motion creates a short visual bridge.",
    "Commits to the next step without changing identity.",
    "Reaction settles and motivates the product reveal.",
    "Device enters and settles into its first hero pose.",
    "Authentic app screen holds long enough to read.",
    "Screen content advances to the next proof state.",
    "One restrained callout points to the verified feature.",
    "Authentic capture advances while the shell motion continues.",
    "Product result lands and remains readable.",
    "Returns with calmer posture and a softened expression.",
    "Takes one believable next action with the same device.",
    "Lets the emotional result register without exaggeration.",
    "Non-human contextual motion bridges to the resolution.",
    "Completes one small, credible next step.",
    "Looks forward with resolved confidence and open negative space.",
    "Same device stage returns and completes one finite settle.",
    "Brand and value line resolve around the readable device.",
    "Final product action locks while the music tail clears."
  ];
  const framings = [
    "Extreme close-up · three-quarter face",
    "Close-up · alternate facial angle",
    "Medium wide · environmental reveal",
    "Detail insert · hand and device",
    "Medium close-up · reaction",
    "Wide profile · same location",
    "Close detail · hand, phone and eyeline",
    "Held close-up · minimal motion",
    "Context insert · no character",
    "Medium push-in · protected negative space",
    "Close reaction · product bridge",
    "Device hero · three-quarter perspective",
    "Device medium · readable screen",
    "Screen-forward detail · continuous shell",
    "Device detail · restrained callout",
    "Device medium · continuous screen advance",
    "Product result close-up · readable hold",
    "Medium close-up · calmer return",
    "Medium action · matched screen direction",
    "Close portrait · emotional hold",
    "Context insert · no character",
    "Medium wide · believable next step",
    "Hero portrait · open CTA space",
    "Device hero · returning camera path",
    "Device and brand lockup · balanced frame",
    "Locked CTA hero · fully readable"
  ];
  const beatSpecs = [
    { region: "human-hook", templateStart: 0, templateEnd: 4, referenceStart: 0, referenceEnd: 96 },
    { region: "human-setup", templateStart: 4, templateEnd: 11, referenceStart: 96, referenceEnd: 294 },
    { region: "product-proof", templateStart: 11, templateEnd: 17, referenceStart: 294, referenceEnd: 578 },
    { region: "human-resolution", templateStart: 17, templateEnd: 23, referenceStart: 578, referenceEnd: 864 },
    { region: "product-cta", templateStart: 23, templateEnd: 26, referenceStart: 864, referenceEnd: 1095 }
  ];
  const averageShotSeconds = 1.1 + durationSeconds / 120;
  const targetShotCount = Math.max(8, Math.min(72, Math.round(durationSeconds / averageShotSeconds)));
  const referenceShotCount = purposes.length;
  const exactCounts = beatSpecs.map((beat) => (
    (beat.templateEnd - beat.templateStart) * targetShotCount / referenceShotCount
  ));
  const beatCounts = exactCounts.map((count) => Math.max(1, Math.floor(count)));
  let countDelta = targetShotCount - beatCounts.reduce((sum, count) => sum + count, 0);
  const growthOrder = exactCounts
    .map((count, index) => ({ index, fraction: count - Math.floor(count) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let cursor = 0; countDelta > 0; cursor += 1, countDelta -= 1) {
    beatCounts[growthOrder[cursor % growthOrder.length].index] += 1;
  }
  for (let cursor = growthOrder.length - 1; countDelta < 0; cursor -= 1) {
    const index = growthOrder[(cursor + growthOrder.length) % growthOrder.length].index;
    if (beatCounts[index] > 1) {
      beatCounts[index] -= 1;
      countDelta += 1;
    }
  }

  let previousCharacterShotId = null;
  let shotIndex = 0;
  const plannedShots = [];
  beatSpecs.forEach((beat, beatIndex) => {
    const count = beatCounts[beatIndex];
    const beatStart = beatIndex === 0 ? 0 : Math.round(totalFrames * beat.referenceStart / 1095);
    const beatEnd = beatIndex === beatSpecs.length - 1 ? totalFrames : Math.round(totalFrames * beat.referenceEnd / 1095);
    const templateIndices = Array.from({ length: count }, (_, index) => {
      if (count === 1) return beat.templateEnd - 1;
      return beat.templateStart + Math.round(index * (beat.templateEnd - beat.templateStart - 1) / (count - 1));
    });
    const weights = templateIndices.map((templateIndex) => referenceFrames[templateIndex + 1] - referenceFrames[templateIndex]);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let startFrame = beatStart;
    let consumedWeight = 0;

    templateIndices.forEach((templateIndex, index) => {
      consumedWeight += weights[index];
      const remainingShots = count - index - 1;
      const proportionalEnd = Math.round(beatStart + (beatEnd - beatStart) * consumedWeight / totalWeight);
      const endFrame = index === count - 1
        ? beatEnd
        : Math.max(startFrame + 1, Math.min(beatEnd - remainingShots, proportionalEnd));
      const region = beat.region;
      const aiContext = aiVideoRequested && (templateIndex === 8 || templateIndex === 20);
      const device = region === "product-proof" || region === "product-cta";
      const laneIds = device
        ? ["blender-mockup", "edit-qa"]
        : aiContext
          ? ["ai-video", "edit-qa"]
          : ["character", "licensed-clips"];
      const preferredAdapter = device
        ? "blender.local_compositor"
        : aiContext
          ? (templateIndex === 8 ? "google.gemini_omni_video" : "google.veo_3_1")
          : "approved-live-action";
      const primarySourceLaneId = device ? "blender-mockup" : aiContext ? "ai-video" : "licensed-clips";
      const characterRefId = device || aiContext ? null : "character-primary-v1";
      const id = `shot-${String(shotIndex + 1).padStart(3, "0")}`;
      const matchFromShotId = characterRefId ? previousCharacterShotId : null;
      const proof = device
        ? "Authentic screen-capture pixels only; shell, camera, light and frame mapping are manifested."
        : aiContext
          ? "Generated context contains no product proof or replacement real-character claim."
          : "Same consented/licensed photographed performer; no synthetic-human substitution.";
      const continuation = templateIndices.filter((candidate, candidateIndex) => candidateIndex <= index && candidate === templateIndex).length;
      plannedShots.push(shot({
        id,
        startFrame,
        endFrame,
        fps,
        region,
        purpose: continuation > 1 ? `${purposes[templateIndex]} Continuation ${continuation}.` : purposes[templateIndex],
        action: actions[templateIndex],
        framing: framings[templateIndex],
        laneIds,
        primarySourceLaneId,
        characterRefId,
        preferredAdapter,
        proof,
        matchFromShotId
      }));
      if (characterRefId) previousCharacterShotId = id;
      startFrame = endFrame;
      shotIndex += 1;
    });
  });
  return plannedShots;
}

function adapterAvailability(adapter, tools = [], environment = process.env) {
  if (adapter.toolId) {
    const tool = tools.find((candidate) => candidate.id === adapter.toolId);
    if (tool?.status === "ready" || (tool?.status === "detected" && tool?.probe?.checked && tool?.probe?.ok && tool?.integrityOk !== false)) {
      return "capability_verified";
    }
    if (tool?.status === "detected") return "installed";
    return "unavailable";
  }
  if (adapter.credentialNames.some((name) => Boolean(environment[name]))) return "configured";
  return "unavailable";
}

export function inspectDirectorCapabilities({ tools = [], environment = process.env } = {}) {
  return DIRECTOR_ADAPTERS.map((adapter) => ({
    id: adapter.id,
    laneId: adapter.laneId,
    access: adapter.access,
    status: adapterAvailability(adapter, tools, environment),
    capabilities: adapter.capabilities,
    truth: "Configured is not verified. Generation success requires an approved real job, durable receipt, downloaded bytes, probe and full decode."
  }));
}

export function createDirectorPlan({ outcome, mode = "Guided", sources = [] }) {
  const durationSeconds = durationFrom(outcome);
  const aspectRatio = aspectFrom(outcome);
  const masterResolution = resolutionFor(aspectRatio);
  const fps = 30;
  const productProofRequired = /\b(app|website|product|phone|screen|screenshot|ui|mockup|blender)\b/i.test(outcome);
  const humanVoiceRequired = /\b(?:real|human|recorded)\s+voice\b/i.test(outcome);
  const voiceRequested = humanVoiceRequired || /\b(?:voice|voiceover|narration|spoken|audio|music|sound)\b/i.test(outcome);
  const aiVideoRequested = /\b(?:ai|gemini|flow|veo|generated?|generate)\b/i.test(outcome);
  const sourceInputs = sourceSummary(sources);
  const shots = createShots({ durationSeconds, fps, aiVideoRequested });
  const characterBible = {
    strategy: "licensed-real-human-first",
    realPhotographedDefinition: "A consented or appropriately licensed photographed performer; synthetic photoreal people do not satisfy this class.",
    syntheticFallback: "Only after the profile explicitly permits synthetic humans and disclosure/likeness gates pass.",
    continuityId: "character-primary-v1",
    locks: ["face", "hair", "wardrobe", "body", "handedness", "device", "location-direction", "light-continuity"],
    sourcePriority: ["approved-user-footage", "licensed-same-performer-series", "commissioned-shoot", "consented-digital-twin"],
    status: "unresolved-casting-and-consent"
  };
  const voiceDirection = {
    masterTimeline: "selected narration timings drive picture, captions and music cues",
    voiceClass: humanVoiceRequired ? "consented-human-performance" : "natural-synthetic-or-human",
    primaryAdapterId: humanVoiceRequired ? "consented-human-recording" : "elevenlabs.tts_alignment",
    fallbackAdapterIds: humanVoiceRequired
      ? ["licensed-human-voice-talent"]
      : ["consented-human-recording", "azure.dragon_hd_omni"],
    arc: ["immediate hook", "contained tension", "recognition", "small turn", "believable relief", "calm CTA"],
    requiredAuditions: 4,
    requirements: ["pronunciation lexicon", "character or word timestamps", "natural breaths", "picture audition", "ASR comparison", "human listening gate"],
    target: { integratedLufs: -15, maxTruePeakDbtp: -1.2, sampleRateHz: 48000 },
    status: "planned-not-generated"
  };
  const blenderMockup = {
    adapterId: "blender.local_compositor",
    requiredForProductProof: productProofRequired,
    screenMediaPolicy: "immutable-authentic-texture",
    inputs: ["authentic-screenshot", "authentic-screen-video"],
    forbiddenInputs: ["application-source-code", "generated-readable-ui", "untrusted-blend-file"],
    output: { width: masterResolution.width, height: masterResolution.height, fps, format: "rgba-png-sequence-or-locked-mezzanine" },
    scene: {
      startup: "factory-startup-with-autoexec-disabled",
      device: "trusted-versioned-shell",
      camera: "finite-three-quarter-reveal-and-settle",
      lighting: "soft-key-edge-light-readable-screen",
      screen: "ungraded-uv-mapped-plane",
      motionPolicy: "no-perpetual-orbit-bounce-or-screen-obscuring-blur"
    },
    requiredManifest: "assets/mockups/DEVICE_STAGE_MANIFEST.json",
    requiredChecks: ["input hashes", "exact frame mapping", "contiguous frames", "screen legibility", "alpha bounds", "edge clearance", "handoff continuity"],
    fallbackAdapterId: "local.2_5d_device_compositor",
    fallbackDisclosure: "Fallback is 2.5D and must never be called a real 3D Blender render.",
    status: "planned-needs-local-render-probe"
  };
  const planWithoutHash = {
    schemaVersion: 1,
    directorVersion: DIRECTOR_VERSION,
    presetId: "premium-vertical-story",
    outcome,
    mode,
    target: {
      durationSeconds,
      aspectRatio,
      previewResolution: aspectRatio === "9:16" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
      masterResolution,
      fps,
      totalFrames: Math.round(durationSeconds * fps),
      color: "BT.709 SDR",
      audioSampleRateHz: 48000
    },
    audience: {
      primaryLanguage: "en-US",
      marketScope: "international-english",
      priorityMarkets: ["US", "CA", "GB", "AU", "NZ", "international-english"],
      copyPolicy: "Write natural English for an international audience; avoid region-specific slang unless the brief requests it.",
      voicePolicy: "Use a clear, natural English performance whose accent and delivery are explicitly selected during voice auditions."
    },
    creativeProcess: {
      researchDepth: "primary-source-and-market-evidence",
      scriptPasses: ["strategy", "spoken-naturalness", "proof-and-timing", "picture-and-voice-lock"],
      scriptLockRequires: ["claim-proof-map", "storyboard", "selected-voice-take", "caption-plan"],
      defaultShortFormPacing: {
        openingShotSeconds: [0.6, 1.1],
        emotionalShotSeconds: [1.3, 2.0],
        productProofSeconds: [1.3, 1.8],
        resolvedCtaSeconds: [3.0, 4.0]
      }
    },
    referenceGrammar: PREMIUM_REFERENCE_GRAMMAR,
    originality: {
      minimumDeliberateDepartures: 3,
      departures: [
        "Use a product-specific character, setting and action rather than the benchmark actor/commute scene.",
        "Design a different proof progression and camera path around the authentic current UI.",
        "Create original copy, typography, color, music and CTA composition."
      ],
      neverCopy: PREMIUM_REFERENCE_GRAMMAR.protectedExpression
    },
    inputs: sourceInputs,
    lanes: [
      { id: "character", label: "Real character", sourcePolicy: "licensed-or-consented-real-human-first", preferredAdapters: ["approved-live-action", "licensed-same-performer-series", "commissioned-shoot"], syntheticAlternatives: ["heygen.avatar_v3", "tavus.replica_v2"], status: "planned" },
      { id: "voice", label: "Natural timed voice", sourcePolicy: "consented-voice-no-unapproved-clone", preferredAdapters: ["elevenlabs.tts_alignment", "consented-human-recording"], selected: voiceRequested, status: "planned" },
      { id: "licensed-clips", label: "Licensed web clips", sourcePolicy: "canonical-source-license-and-model-release-required", preferredAdapters: ["shutterstock.video", "pexels.video", "pixabay.video"], status: "planned" },
      { id: "ai-video", label: "AI hero shots", sourcePolicy: "generated-context-not-authentic-product-proof", preferredAdapters: ["google.gemini_omni_video", "google.veo_3_1", "google.flow.browser"], selected: aiVideoRequested, status: "planned" },
      { id: "blender-mockup", label: "Blender product stage", sourcePolicy: "authentic-screen-texture-only", preferredAdapters: ["blender.local_compositor", "local.2_5d_device_compositor"], status: "planned" },
      { id: "edit-qa", label: "Edit, sound & QA", sourcePolicy: "frame-locked-and-evidence-gated", preferredAdapters: ["ffmpeg.local_edit_qa", "hyperframes.local", "capcut.desktop_handoff"], status: "planned" }
    ],
    characterBible,
    voiceDirection,
    blenderMockup,
    shots,
    approvals: [
      { id: "brief-and-source-rights", required: true, status: "pending", scope: "exact brief and input hashes" },
      { id: "likeness-and-voice-consent", required: true, status: "pending", scope: "performer, avatar, voice and sensitive portrayal" },
      { id: "provider-upload", required: true, status: "pending", scope: "named provider plus exact asset hashes/classes" },
      { id: "generation-spend", required: true, status: "pending", scope: "cash or quota bucket, model and attempt ceiling" },
      { id: "stock-license", required: true, status: "pending", scope: "asset ID, creator, license, model release and campaign use" },
      { id: "publish", required: true, status: "pending", scope: "public upload or external send" }
    ],
    execution: {
      status: "planned",
      claims: [],
      graph: [
        "research-and-rights",
        "script-routes-and-animatic",
        "exact-provider-request-preflight",
        "voice-audition-and-timing-lock",
        "character-stock-ai-pilot",
        "authentic-ui-capture",
        "blender-device-stage",
        "frame-locked-edit-and-mix",
        "preview-review",
        "master-and-release-qa"
      ],
      jobs: [
        { id: "research-rights", laneId: "licensed-clips", selected: true, adapterCandidates: ["local-agent-research"], dependsOn: [], approvalIds: ["brief-and-source-rights"], outputRoles: ["research_packet", "rights_and_consent"] },
        { id: "script-animatic", laneId: "edit-qa", selected: true, adapterCandidates: ["local-agent-director", "ffmpeg.local_edit_qa"], dependsOn: ["research-rights"], approvalIds: [], outputRoles: ["locked_script", "storyboard", "edit_map"] },
        { id: "provider-requests", laneId: "edit-qa", selected: true, adapterCandidates: ["local-agent-director"], dependsOn: ["research-rights", "script-animatic"], approvalIds: [], outputRoles: ["provider_requests"] },
        { id: "voice-timing", laneId: "voice", selected: voiceRequested, adapterCandidates: humanVoiceRequired ? ["consented-human-recording"] : ["elevenlabs.tts_alignment", "consented-human-recording"], dependsOn: ["provider-requests"], approvalIds: ["likeness-and-voice-consent", "provider-upload", "generation-spend"], outputRoles: ["voice_performance_map", "voice_media", "word_timings"] },
        { id: "licensed-acquisition", laneId: "licensed-clips", selected: true, adapterCandidates: ["stock.rights_gated"], dependsOn: ["provider-requests"], approvalIds: ["stock-license"], outputRoles: ["asset_manifest", "license_attribution_ledger"] },
        { id: "ai-video-pilot", laneId: "ai-video", selected: aiVideoRequested, adapterCandidates: ["google.gemini_omni_video", "google.veo_3_1", "google.flow.browser"], dependsOn: ["provider-requests"], approvalIds: ["provider-upload", "generation-spend"], outputRoles: ["generation_manifest", "source_media"] },
        { id: "authentic-ui-capture", laneId: "blender-mockup", selected: productProofRequired, adapterCandidates: ["local-authentic-capture"], dependsOn: ["script-animatic"], approvalIds: [], outputRoles: ["capture_manifest", "authentic_ui_media"] },
        { id: "blender-device-stage", laneId: "blender-mockup", selected: productProofRequired, adapterCandidates: ["blender.local_compositor", "local.2_5d_device_compositor"], dependsOn: ["authentic-ui-capture"], approvalIds: [], outputRoles: ["device_stage_manifest", "source_media"] },
        { id: "edit-mix", laneId: "edit-qa", selected: true, adapterCandidates: ["ffmpeg.local_edit_qa", "hyperframes.local", "capcut.desktop_handoff"], dependsOn: ["licensed-acquisition", ...(voiceRequested ? ["voice-timing"] : []), ...(aiVideoRequested ? ["ai-video-pilot"] : []), ...(productProofRequired ? ["blender-device-stage"] : [])], approvalIds: [], outputRoles: ["preview_media", "audio_mix"] },
        { id: "release-qa", laneId: "edit-qa", selected: true, adapterCandidates: ["ffmpeg.local_edit_qa", "local-user-review"], dependsOn: ["edit-mix"], approvalIds: [], outputRoles: ["preview_qa", "master_media", "master_qa", "final_release", "sha256sums"] }
      ],
      nextAction: "approve-boundaries-then-probe-selected-adapters",
      truth: "No provider generation, stock license, Blender render, upload, spend or final QA is claimed by this plan."
    }
  };
  return { ...planWithoutHash, planHash: hash(planWithoutHash) };
}
