export type RunState =
  | "preflight"
  | "active"
  | "running"
  | "needs_approval"
  | "reconciling"
  | "review_ready"
  | "completed"
  | "paused"
  | "blocked"
  | "failed"
  | "cancelled";

export interface PendingAttention {
  id: string;
  kind: "approval";
  category: string;
  title: string;
  detail: string;
  requestHash: string;
  proposal: Record<string, unknown>;
  status: "pending";
}

export interface PhaseStatus {
  status: "pending" | "waiting" | "passed" | "waived";
  requiredRoles: string[];
  optional: boolean;
  waiverReason: string | null;
  passedAt: string | null;
  evidenceArtifactIds?: string[];
}

export interface RuntimeStatus {
  id: string;
  name: string;
  status: "ready" | "detected" | "not-detected";
  presence: "built-in" | "detected" | "not-detected";
  control: {
    mode: "demo" | "handoff" | "live";
    state: "ready" | "blocked";
    adapterId: string | null;
    protocol: string | null;
    reason: string | null;
  };
  executable: string | null;
  integration: "built-in-demo" | "live-adapter" | "handoff-only";
  preferredAdapter: string;
  stability: string;
  capabilitiesToProbe: string[];
  detail: string;
}

export interface ToolStatus {
  id: string;
  name: string;
  tier: string;
  kind: string;
  status: "ready" | "detected" | "blocked" | "missing" | "optional" | "unavailable" | "available-on-demand";
  location: string | null;
  capabilities: string[];
  disclaimer: string | null;
  probe: { checked: boolean; ok: boolean; detail: string };
  integrityOk: boolean;
}

export interface ToolInstallPlan {
  schemaVersion: 1;
  tool: { id: string; name: string; tier: string | null; kind: string | null };
  platform: "darwin" | "win32" | string;
  observed: { status: string; ready: boolean; location: string | null; detail: string | null };
  disposition: "already-ready" | "approval-required" | "manual" | "deferred" | "blocked";
  reason: string;
  planHash: string | null;
  documentationUrl: string | null;
  approval: { required: boolean; localUserOnly: true; explicitConfirmationRequired: true; oneShot: true };
  execution: null | {
    manager: string;
    command: string;
    args: string[];
    cwd: string;
    shell: false;
    timeoutMs: number;
    outputLimitBytes: number;
  };
}

export interface ToolInstallReceipt {
  schemaVersion: 1;
  receiptId: string;
  toolId: string;
  planHash: string;
  outcome: string;
  ok: boolean;
  installed: boolean;
  ready: boolean;
  approvalConsumed: true;
  process: null | {
    started: boolean;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    stdout: string;
    stderr: string;
    outputTruncated: boolean;
    errorCode: string | null;
    errorMessage: string | null;
  };
  verification: { status: string; ready: boolean; location: string | null; detail: string | null };
}

export type ExecutionStatus =
  | "active"
  | "needs_approval"
  | "needs_reconciliation"
  | "succeeded"
  | "failed"
  | "cancelling"
  | "cancelled";

export type ExecutionJobState =
  | "waiting_dependencies"
  | "blocked_approval"
  | "runnable"
  | "submitting"
  | "accepted"
  | "running"
  | "reconciling"
  | "unknown"
  | "succeeded"
  | "failed"
  | "cancel_pending"
  | "cancel_unknown"
  | "cancelled";

export interface ExecutionOutputReceipt {
  role: string;
  relativePath: string;
  sha256: string;
  bytes: number;
  mediaType: string | null;
}

export interface ExecutionReceipt {
  schemaVersion: 1;
  runId: string;
  scopeHash: string;
  jobId: string;
  strategyId: string;
  adapterId: string;
  attemptNumber: number;
  submissionKey: string;
  externalId: string | null;
  completedAt: string;
  outputs: ExecutionOutputReceipt[];
  receiptHash: string;
}

export interface ExecutionAttempt {
  number: number;
  routeIndex: number;
  routeAttempt: number;
  strategyId: string;
  adapterId: string;
  submissionKey: string;
  externalId: string | null;
  state: "submitting" | "accepted" | "running" | "reconciling" | "unknown" | "failed" | "succeeded" | "cancelled";
  startedAt: string;
  observedAt: string | null;
  completedAt: string | null;
}

export interface ExecutionJob {
  id: string;
  laneId: string | null;
  dependsOn: string[];
  approvalIds: string[];
  outputRoles: string[];
  payload: Record<string, unknown>;
  strategy: {
    id: string;
    routes: Array<{ adapterId: string; strategyId: string; maxAttempts: number }>;
  };
  maxAttempts: number;
  attempts: ExecutionAttempt[];
  exhaustedRouteIndexes: number[];
  state: ExecutionJobState;
  lastError: null | { code: string; approvalId?: string; dependencyId?: string };
  receipt: ExecutionReceipt | null;
  cancellationRequested: boolean;
  cancellationKey: string | null;
}

export interface ExecutionApproval {
  id: string;
  scope: string | null;
  status: "pending" | "granted" | "denied";
  actorId: string | null;
  scopeHash: string | null;
  evidenceHash: string | null;
  decidedAt: string | null;
}

export interface ExecutionSnapshot {
  schemaVersion: 1;
  runId: string;
  scopeHash: string;
  directorPlanHash: string | null;
  status: ExecutionStatus;
  createdAt: string;
  updatedAt: string;
  revision: number;
  dagOrder: string[];
  jobs: ExecutionJob[];
  approvals: ExecutionApproval[];
  receipts: ExecutionReceipt[];
  runnableJobIds: string[];
  cancelRequestedAt: string | null;
  cancelledBy: string | null;
}

export interface ExecutionCapabilities {
  schemaVersion: 1;
  executionKernel: string;
  localAgentAdapters: string[];
  providerAdapters: string[];
  registeredAdapters: string[];
  approvalBound: boolean;
  restartReconciliation: boolean;
}

export interface ProviderActionProposal {
  schemaVersion: 1;
  adapterId: string;
  namespace: string;
  actionHash: string;
  requestFingerprint: string;
  actionBindingHash: string;
  configHash: string;
  planningDocumentHash: string;
  requiredApprovalIds: string[];
  exactRequest: Record<string, unknown>;
}

export interface ProviderActionState {
  schemaVersion: 1;
  runId?: string;
  jobId?: string;
  scopeHash?: string;
  readiness: "blocked" | "approval-required" | "ready";
  ready: boolean;
  blocker: null | { code: string; message: string };
  proposal: ProviderActionProposal | null;
  approval: {
    status: "unavailable" | "required" | "approved";
    localUserOnly?: true;
    exactScopeAndActionRequired?: true;
    receipt?: {
      receiptId: string;
      actionHash: string;
      approvedBy: string;
      approvedAt: string;
      signatureVerified: true;
    };
  };
}

export interface ProviderActionResponse {
  providerAction: ProviderActionState;
  approval?: Record<string, unknown>;
  execution?: ExecutionSnapshot;
}

export interface SupervisedBrowserProbe {
  available: boolean;
  mode: "headed-persistent-supervised";
  executablePath: string | null;
  loginTakeoverRequired: true;
  arbitraryJavascript: false;
  cookieExport: false;
}

export interface SupervisedBrowserSession {
  schemaVersion: 1;
  runId: string;
  sessionId: string;
  profileId: string;
  status: "connected" | "closing" | "closed";
  currentUrl: string;
  startedAt: string;
  lastActionAt: string | null;
  userTakeover: string;
}

export interface BrowserNavigationResult {
  kind: "navigate";
  url: string;
  title: string;
}

export interface BrowserSnapshotResult {
  kind: "snapshot";
  url: string;
  title: string;
  visibleText: string;
  untrustedContent: true;
  instruction: string;
  screenshotRelativePath: string;
  screenshotSha256: string;
}

export type SafeBrowserResult = BrowserNavigationResult | BrowserSnapshotResult;

export interface BootstrapInfo {
  projectReady: boolean;
  server: { host: string; port: number; loopbackOnly: boolean };
  storage: { label: string; local: boolean };
  runtimes: RuntimeStatus[];
  tools: ToolStatus[];
  mediaVerification?: {
    ready: boolean;
    detail: string;
    integrity?: { ok: boolean; detail: string };
  };
  production?: { workflowVersion: string; directorVersion?: string; completionRequiresCertificate: boolean };
  autonomy?: ExecutionCapabilities;
  providerActions?: {
    schemaVersion: 1;
    requestDocument: string;
    requestSchemaVersion: number;
    supportedJobs: Array<{ jobId: string; adapterId: string; namespace: string }>;
    localUserApprovalOnly: true;
    exactScopeAndActionBinding: true;
    hmacReceipts: true;
    durableNoResubmitGuard: true;
  };
  browser?: SupervisedBrowserProbe;
  toolInstallation?: { reviewedPlans: boolean; localUserApprovalRequired: boolean; automaticForPaidOrManualTools: boolean };
  providers?: {
    status: "ready" | "configuration-required";
    configured: string[];
    entries: Array<{ id: string; registered: boolean; configured: boolean; credentialOptionalForSelectedDownload: boolean }>;
  };
  director?: {
    version: string;
    presetId: string;
    adapters: Array<{
      id: string;
      laneId: string;
      access: string;
      status: "unavailable" | "installed" | "configured" | "authenticated" | "capability_verified" | "generation_verified" | "qa_verified";
      capabilities: string[];
      truth: string;
    }>;
  };
}

export interface DirectorLane {
  id: "character" | "voice" | "licensed-clips" | "ai-video" | "blender-mockup" | "edit-qa";
  label: string;
  sourcePolicy: string;
  preferredAdapters: string[];
  selected?: boolean;
  status: "planned";
}

export interface DirectorShot {
  id: string;
  frameRange: { start: number; end: number; convention: "half-open" };
  timeRangeSeconds: { start: number; end: number };
  durationSeconds: number;
  storyRegion: "human-hook" | "human-setup" | "product-proof" | "human-resolution" | "product-cta";
  storyBeatId: "hook" | "setup" | "product" | "result" | "cta";
  purpose: string;
  action: string;
  framing: string;
  laneIds: DirectorLane["id"][];
  primarySourceLaneId: "licensed-clips" | "ai-video" | "blender-mockup";
  characterRefId: string | null;
  preferredAdapter: string;
  status: "planned";
  selectedAssetId: string | null;
  proof: string;
  continuity: {
    requirement: "same-character" | "none";
    groupId: string | null;
    characterId: string | null;
    referenceIds: string[];
    matchFromShotId: string | null;
    locks: string[];
    state: "planned-unverified" | "references-bound" | "evidence-passed" | "failed" | "not-applicable";
    evidenceArtifactIds: string[];
    reason?: string;
  };
}

export interface DirectorPlan {
  schemaVersion: 1;
  directorVersion: string;
  presetId: string;
  planHash: string;
  target: {
    durationSeconds: number;
    aspectRatio: string;
    previewResolution: { width: number; height: number };
    masterResolution: { width: number; height: number };
    fps: number;
    totalFrames: number;
  };
  lanes: DirectorLane[];
  shots: DirectorShot[];
  characterBible: {
    strategy: string;
    realPhotographedDefinition: string;
    syntheticFallback: string;
    continuityId: string;
    locks: string[];
    sourcePriority: string[];
    status: string;
  };
  approvals: Array<{ id: string; required: boolean; status: string; scope: string }>;
  blenderMockup: {
    adapterId: string;
    requiredForProductProof: boolean;
    screenMediaPolicy: string;
    inputs: string[];
    fallbackAdapterId: string;
    status: string;
  };
  execution: {
    status: "planned";
    claims: string[];
    graph: string[];
    jobs: Array<{
      id: string;
      laneId: DirectorLane["id"];
      selected: boolean;
      adapterCandidates: string[];
      dependsOn: string[];
      approvalIds: string[];
      outputRoles: string[];
    }>;
    nextAction: string;
    truth: string;
  };
}

export interface SourceReference {
  id: string;
  kind: "file" | "url";
  name: string;
  mediaType?: string;
  size?: number;
  sha256: string;
  url?: string;
  localOnly: true;
  createdAt: string;
}

export interface Run {
  id: string;
  title: string;
  outcome: string;
  runnerId: string;
  runnerName: string;
  runnerStatus?: "connected" | "handoff_only" | "ready";
  runnerAdapterId?: string | null;
  runnerSessionId?: string | null;
  mode: "Guided" | "Autonomous";
  state: RunState;
  phase: string;
  phaseId?: string;
  progress: number;
  total: number;
  elapsed: string;
  sourceIds?: string[];
  currentTask?: string;
  taskDetail?: string;
  createdAt: string;
  updatedAt: string;
  demo: boolean;
  artifactId: string | null;
  notice: string;
  revision?: number;
  eventSequence?: number;
  projectRelativePath?: string;
  pendingAttention?: PendingAttention | null;
  phaseStatus?: Record<string, PhaseStatus>;
  releaseGate?: {
    status: "pending" | "release_passed";
    openGates: string[];
    certificate?: Record<string, unknown> | null;
    certificateFileSha256?: string | null;
  };
  directorPlan?: DirectorPlan | null;
  jobs?: ObservedJob[];
}

export interface ObservedJob {
  id: string;
  shotId: string | null;
  adapterId: string | null;
  capability: string | null;
  state: "planned" | "waiting_approval" | "submitting" | "accepted" | "running" | "reconciling" | "outputs_staged" | "verified_output" | "failed" | "unknown" | "cancelled";
  externalReceipt: string | null;
  observations: Array<{ state: string; at: string; detail: string | null }>;
}

export interface Artifact {
  id: string;
  runId: string;
  title: string;
  kind: string;
  version: string;
  duration: string;
  dimensions: string;
  audio: string;
  rights: string;
  poster: string | null;
  demo: boolean;
  checks: string[];
  role?: string;
  relativePath?: string;
  sha256?: string;
  size?: number;
  status?: "candidate" | "approved" | "rejected";
  contentUrl?: string | null;
  verification?: {
    result: "pass" | "fail" | "inconclusive";
    claim: string;
    method: string;
    detail: string;
  } | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "event";
  content: string;
  createdAt: string;
  demo: boolean;
}

export type LiveEventType =
  | "session.accepted"
  | "session.connected"
  | "session.disconnected"
  | "session.failed"
  | "session.closed"
  | "turn.accepted"
  | "turn.started"
  | "turn.completed"
  | "turn.failed"
  | "turn.interrupted"
  | "message.delta"
  | "message.completed"
  | "plan.updated"
  | "tool.started"
  | "tool.completed"
  | "terminal.output"
  | "file.diff"
  | "approval.requested"
  | "approval.resolved"
  | "input.requested"
  | "usage.updated"
  | "artifact.staged";

export interface LiveEvent {
  schemaVersion: 1;
  runId: string;
  sessionId: string | null;
  sequence: number;
  eventId: string;
  previousHash: string | null;
  eventHash: string;
  recordedAt: string;
  source: { runtimeId: string | null; adapterId: string | null; nativeSequence: number | null; nativeMethod: string | null };
  type: LiveEventType;
  turnId: string | null;
  payload: Record<string, unknown> & {
    detail?: string;
    title?: string;
    itemId?: string;
    requestId?: string;
    toolName?: string;
    adapterId?: string;
    capability?: string;
    shotId?: string;
    plan?: Array<{ step: string; status: string }>;
  };
}

export interface LiveSession {
  schemaVersion: 1;
  runId: string;
  runtimeId: string | null;
  runtimeName: string | null;
  adapterId: string | null;
  protocol: string | null;
  status: "connecting" | "connected" | "disconnected" | "failed" | "closed";
  sessionId: string | null;
  activeTurnId: string | null;
  model: string | null;
  modelProvider: string | null;
  executableVersion: string | null;
  executableHash: string | null;
  connectedAt: string | null;
  lastEventAt: string | null;
  lastError: string | null;
  pendingApprovals: Array<{
    type: "approval.requested" | "input.requested";
    requestId: string;
    nativeMethod: string;
    title: string;
    detail: string;
    turnId: string | null;
    itemId: string | null;
  }>;
  lastSequence: number;
  lastEventHash: string | null;
  updatedAt: string | null;
  resumeAvailable: boolean;
}

export interface CockpitStage {
  id: "plan" | "script" | "storyboard" | "generate" | "voice" | "edit" | "review";
  label: string;
  status: "complete" | "active" | "waiting";
}

export interface CockpitShot {
  id: string;
  number: number;
  storyRegion: DirectorShot["storyRegion"];
  storyBeatId: DirectorShot["storyBeatId"] | null;
  durationSeconds: number;
  timeRangeSeconds: { start: number; end: number };
  purpose: string;
  action: string;
  framing: string;
  source: { laneId: string; assigned: boolean; assetId: string | null; label: string };
  status: "planned" | "working" | "review" | "ready" | "failed";
  job: ObservedJob | null;
  character: {
    inFrame: boolean;
    continuityId: string | null;
    expectedContinuityId: string | null;
    continuityStatus: "planned-unverified" | "reference-bound" | "evidence-passed" | "mismatch" | "not-applicable";
    label: string;
    locks: string[];
  };
  proof: string | null;
  previewUrl: string | null;
}

export interface CockpitBeat {
  id: "hook" | "setup" | "product" | "result" | "cta";
  number: number;
  label: string;
  title: string;
  description: string;
  shotIds: string[];
  shotCount: number;
  durationSeconds: number;
  timeRangeSeconds: { start: number; end: number } | null;
  status: CockpitShot["status"];
  sourceLabels: string[];
  character: {
    required: boolean;
    label: string;
    continuityStatus: ProductionCockpit["continuity"]["status"];
  };
  previewUrl: string | null;
}

export interface ProductionCockpit {
  schemaVersion: 1;
  runId: string;
  title: string;
  condition: RunState;
  eventSequence: number;
  connection: {
    status: "connected" | "handoff" | "disconnected";
    label: string;
    runtimeId: string | null;
    adapterId: string | null;
    sessionId: string | null;
  };
  stages: CockpitStage[];
  activity: Array<Record<string, unknown> & { sequence: number; type: LiveEventType; at: string; label: string; truthful: true }>;
  currentTask: { title: string; detail: string };
  toolStage: null | {
    jobId: string;
    shotId: string | null;
    adapterId: string | null;
    capability: string | null;
    status: string;
    detail: string;
    observedAt: string | null;
    externalReceipt: string | null;
  };
  storyboard: CockpitShot[];
  beats: CockpitBeat[];
  continuity: {
    continuityId: string | null;
    sourceStatus: string;
    status: "planned-unverified" | "evidence-passed" | "warning" | "unavailable";
    mismatchedShotIds: string[];
    locks: string[];
  };
  preview: { artifactId: string | null; contentUrl: string | null; status: "artifact" | "working" | "waiting" };
}

export interface CockpitResponse {
  cockpit: ProductionCockpit;
  session: LiveSession | null;
  execution: ExecutionSnapshot | null;
}

export interface ExecutionResponse {
  execution: ExecutionSnapshot | null;
  session: LiveSession | null;
  capabilities: ExecutionCapabilities;
}

export interface SupervisedBrowserStatusResponse {
  browser: SupervisedBrowserSession | null;
  probe: SupervisedBrowserProbe;
}

export interface SupervisedBrowserMutationResponse {
  browser?: SupervisedBrowserSession | null;
  session?: SupervisedBrowserSession;
  result?: SafeBrowserResult;
}
