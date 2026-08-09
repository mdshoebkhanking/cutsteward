import {
  Activity,
  ArrowUp,
  Check,
  Circle,
  Clock3,
  Film,
  Globe2,
  Image as ImageIcon,
  LoaderCircle,
  Pause,
  Play,
  Plug,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  Square,
  UserRound,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import {
  projectActivityEntries,
  projectCockpitPlan,
  type ActivityCategory,
  type PlanStepStatus
} from "../lib/cockpit-view";
import { Sheet } from "./Sheet";
import type {
  Artifact,
  CockpitResponse,
  CockpitBeat,
  CockpitShot,
  ExecutionApproval,
  ExecutionJobState,
  ExecutionSnapshot,
  LiveSession,
  ProductionCockpit as CockpitData,
  ProviderActionState,
  Run,
  SafeBrowserResult,
  SupervisedBrowserProbe,
  SupervisedBrowserSession
} from "../types";

interface ProductionCockpitProps {
  run: Run;
  artifact: Artifact | null;
  busy: boolean;
  onRunAction: (action: string, input?: Record<string, unknown>) => void;
  onRunChange: (run: Run) => void;
  onOpenRunner: () => void;
  onConnectionChange?: (session: LiveSession | null) => void;
}

const NON_AUTOCONNECT_STATES = new Set(["completed", "cancelled", "failed", "paused", "blocked"]);
const LIVE_RUNNER_IDS = new Set(["codex", "gemini", "hermes", "kimi"]);
const TERMINAL_EXECUTION_STATUSES = new Set(["succeeded", "failed", "cancelled"]);
const TERMINAL_EXECUTION_JOB_STATES = new Set<ExecutionJobState>(["succeeded", "failed", "cancelled"]);
const RECONCILABLE_JOB_STATES = new Set<ExecutionJobState>(["submitting", "accepted", "running", "reconciling", "unknown"]);
const PROVIDER_ACTION_JOB_IDS = new Set(["voice-timing", "ai-video-pilot", "licensed-acquisition"]);
const EXACT_PROPOSAL_PATTERN = /\b(?:upload|spend|purchase|paid|payment|quota|credit|likeness|face|voice clone|consent|rights|license|publish|post|go live|destructive|delete|remove permanently|login|log in|sign in|mfa|captcha|password|secret)\b/i;

export function validateSupervisedBrowserAddress(value: string) {
  const candidate = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { valid: false as const, url: null, error: "Enter a complete HTTP(S) URL." };
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    return { valid: false as const, url: null, error: "Only credential-free HTTP(S) URLs are allowed." };
  }
  parsed.hash = "";
  return { valid: true as const, url: parsed.toString(), error: "" };
}

export function supervisedBrowserProfileId(runId: string) {
  const safeRunId = runId.replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 112) || "run";
  return `run-${safeRunId}`;
}

export function requiresExactProposal(input: { title?: string; detail?: string; nativeMethod?: string }) {
  return EXACT_PROPOSAL_PATTERN.test([input.title, input.detail, input.nativeMethod].filter(Boolean).join(" "));
}

export function projectExecutionControls(execution: ExecutionSnapshot | null, liveConnected: boolean) {
  const terminal = Boolean(execution && TERMINAL_EXECUTION_STATUSES.has(execution.status));
  const pendingApprovals = execution?.approvals.filter((approval) => approval.status === "pending").length || 0;
  const hasRunnableSafeWork = !execution || execution.status === "active";
  const hasReconcilableJobs = execution?.jobs.some((job) => RECONCILABLE_JOB_STATES.has(job.state)) || false;
  const hasUnfinishedJobs = execution?.jobs.some((job) => !TERMINAL_EXECUTION_JOB_STATES.has(job.state)) || false;
  const canSchedule = liveConnected && !terminal && hasRunnableSafeWork;
  return {
    canSchedule,
    canStop: Boolean(execution && !terminal),
    canReconcile: Boolean(execution && hasReconcilableJobs),
    canCancel: Boolean(execution && hasUnfinishedJobs),
    pendingApprovals,
    scheduleReason: canSchedule
      ? "Only approval-cleared jobs can be submitted."
      : !liveConnected
        ? "Connect a live runner before scheduling execution."
        : pendingApprovals
          ? `${pendingApprovals} exact ${pendingApprovals === 1 ? "proposal is" : "proposals are"} blocking the next dependency-ready jobs.`
          : terminal
            ? "This durable execution is already terminal."
            : "Execution cannot be scheduled from the current state."
  };
}

function ProviderActionsPanel({
  runId,
  execution,
  onExecutionChange
}: {
  runId: string;
  execution: ExecutionSnapshot | null;
  onExecutionChange: (next: ExecutionSnapshot) => void;
}) {
  const providerJobs = useMemo(() => (
    execution?.jobs.filter((job) =>
      PROVIDER_ACTION_JOB_IDS.has(job.id)
      && ["blocked_approval", "runnable"].includes(job.state)
    ) || []
  ), [execution]);
  const providerJobKey = providerJobs.map((job) => `${job.id}:${job.state}`).join("|");
  const [actions, setActions] = useState<Record<string, ProviderActionState>>({});
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!execution || providerJobs.length === 0) {
      setActions({});
      return () => { active = false; };
    }
    Promise.all(providerJobs.map(async (job) => {
      const response = await api.inspectProviderAction(runId, job.id);
      return [job.id, response.providerAction] as const;
    })).then((entries) => {
      if (active) setActions(Object.fromEntries(entries));
    }).catch((nextError) => {
      if (active) setError(nextError instanceof Error ? nextError.message : "Could not inspect provider proposals.");
    });
    return () => { active = false; };
  }, [execution?.scopeHash, providerJobKey, providerJobs, runId]);

  async function approve(jobId: string, action: ProviderActionState) {
    if (!action.proposal || !acknowledged[jobId] || busyJobId) return;
    setBusyJobId(jobId);
    setError("");
    try {
      const response = await api.approveProviderAction(runId, jobId, action.proposal.actionHash);
      setActions((current) => ({ ...current, [jobId]: response.providerAction }));
      setAcknowledged((current) => ({ ...current, [jobId]: false }));
      if (response.execution) onExecutionChange(response.execution);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The exact provider action could not be approved.");
    } finally {
      setBusyJobId(null);
    }
  }

  if (!providerJobs.length) return null;

  return (
    <section className="provider-actions-panel" aria-labelledby="provider-actions-title">
      <header>
        <div><strong id="provider-actions-title">Exact provider actions</strong><span>Local-user approval only</span></div>
        <ShieldAlert size={16} />
      </header>
      <p className="provider-actions-truth">The connected agent prepares non-secret parameters. Nothing is uploaded, charged, licensed, or generated until you review one exact request below.</p>
      <div className="provider-action-list">
        {providerJobs.map((job) => {
          const action = actions[job.id];
          if (!action) return <div className="provider-action-card" key={job.id}><strong>{job.id.replaceAll("-", " ")}</strong><p>Inspecting the current request…</p></div>;
          if (action.readiness === "blocked") {
            return (
              <div className="provider-action-card provider-action-blocked" key={job.id}>
                <strong>{job.id.replaceAll("-", " ")}</strong>
                <p>{action.blocker?.message || "The connected agent has not prepared a valid exact request yet."}</p>
                <small>{action.blocker?.code || "PROVIDER_ACTION_BLOCKED"}</small>
              </div>
            );
          }
          if (action.readiness === "ready") {
            return (
              <div className="provider-action-card provider-action-ready" key={job.id}>
                <strong><Check size={14} /> {job.id.replaceAll("-", " ")}</strong>
                <p>Exact scope and action receipt verified. This is permission to submit once, not proof of provider completion.</p>
                <small>Action {shortReceipt(action.proposal?.actionHash)}</small>
              </div>
            );
          }
          const approvals = action.proposal?.requiredApprovalIds || [];
          const mayCharge = approvals.includes("generation-spend");
          return (
            <div className="provider-action-card provider-action-review" key={job.id}>
              <div className="provider-action-card-heading">
                <div><strong>{job.id.replaceAll("-", " ")}</strong><span>{action.proposal?.adapterId}</span></div>
                <small>{approvals.join(" · ")}</small>
              </div>
              <details>
                <summary>Review exact request</summary>
                <pre>{JSON.stringify(action.proposal?.exactRequest, null, 2)}</pre>
                <p>Scope {shortReceipt(action.scopeHash)} · action {shortReceipt(action.proposal?.actionHash)} · planning file {shortReceipt(action.proposal?.planningDocumentHash)}</p>
              </details>
              <label className="provider-action-confirm">
                <input
                  type="checkbox"
                  checked={acknowledged[job.id] === true}
                  onChange={(event) => setAcknowledged((current) => ({ ...current, [job.id]: event.target.checked }))}
                />
                <span>I reviewed this exact request, have the required rights/voice/likeness consent, allow its named third-party transfer, and authorize one submission{mayCharge ? " that may consume provider credits or money under my account limit" : " or licensed download"}. No price or provider completion is being claimed.</span>
              </label>
              <button
                type="button"
                disabled={!acknowledged[job.id] || busyJobId !== null}
                onClick={() => void approve(job.id, action)}
              >
                {busyJobId === job.id ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}
                Approve this one exact action
              </button>
            </div>
          );
        })}
      </div>
      {error ? <p className="provider-action-error" role="alert">{error}</p> : null}
    </section>
  );
}

function executionStatusLabel(status: ExecutionSnapshot["status"]) {
  if (status === "needs_approval") return "Exact proposal needed";
  if (status === "needs_reconciliation") return "Receipt reconciliation needed";
  if (status === "succeeded") return "Receipts complete";
  if (status === "failed") return "Execution failed";
  if (status === "cancelling") return "Cancellation pending";
  if (status === "cancelled") return "Execution cancelled";
  return "Execution active";
}

function jobStateLabel(state: ExecutionJobState) {
  const labels: Record<ExecutionJobState, string> = {
    waiting_dependencies: "Waiting on dependencies",
    blocked_approval: "Exact proposal needed",
    runnable: "Ready, not submitted",
    submitting: "Submission intent recorded",
    accepted: "Adapter accepted",
    running: "Adapter reports running",
    reconciling: "Reconciling receipt",
    unknown: "Outcome unknown",
    succeeded: "Receipt complete",
    failed: "Observed failure",
    cancel_pending: "Cancellation pending",
    cancel_unknown: "Cancellation unconfirmed",
    cancelled: "Cancelled"
  };
  return labels[state];
}

function shortReceipt(value: string | null | undefined) {
  return value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "none";
}

function ExecutionPanel({
  execution,
  liveConnected,
  busy,
  notice,
  error,
  cancelConfirmation,
  onSchedule,
  onStop,
  onReconcile,
  onRequestCancel,
  onCancel,
  onKeepRunning,
  onOpenBrowser
}: {
  execution: ExecutionSnapshot | null;
  liveConnected: boolean;
  busy: boolean;
  notice: string;
  error: string;
  cancelConfirmation: boolean;
  onSchedule: () => void;
  onStop: () => void;
  onReconcile: () => void;
  onRequestCancel: () => void;
  onCancel: () => void;
  onKeepRunning: () => void;
  onOpenBrowser: () => void;
}) {
  const controls = projectExecutionControls(execution, liveConnected);
  const pendingApprovals = execution?.approvals.filter((approval) => approval.status === "pending") || [];
  const terminal = Boolean(execution && TERMINAL_EXECUTION_STATUSES.has(execution.status));

  return (
    <section className="execution-panel" aria-labelledby="execution-panel-title">
      <header className="execution-panel-heading">
        <div>
          <strong id="execution-panel-title">Durable execution</strong>
          <span>{execution ? executionStatusLabel(execution.status) : "Not materialized"}</span>
        </div>
        <button type="button" onClick={onOpenBrowser} aria-label="Open supervised browser for this run">
          <Globe2 size={13} /> Browser
        </button>
      </header>

      {execution ? (
        <>
          <p className="execution-truth">
            Revision {execution.revision} · scope {shortReceipt(execution.scopeHash)}. Job success means a receipt exists; it does not certify the film or delivery.
          </p>
          <div className="execution-summary" aria-label="Execution receipt summary">
            <span><strong>{execution.jobs.length}</strong> jobs</span>
            <span><strong>{execution.receipts.length}</strong> completion receipts</span>
            <span><strong>{execution.runnableJobIds.length}</strong> ready</span>
          </div>

          {pendingApprovals.length ? (
            <div className="execution-approvals" aria-label="Exact proposals required">
              <strong><ShieldAlert size={13} /> Exact proposals required</strong>
              <p>These cannot be granted generically here. Brief approval stays in the production decision; upload, spend, likeness, and publish actions need their own exact proposal.</p>
              {pendingApprovals.map((approval: ExecutionApproval) => (
                <div key={approval.id}>
                  <span>{approval.id}</span>
                  <small>{approval.scope || "No exact scope was recorded; approval is unavailable."}</small>
                </div>
              ))}
            </div>
          ) : null}

          <div className="execution-job-list" aria-label="Durable execution jobs and receipts">
            {execution.jobs.map((job) => (
              <details className={`execution-job execution-job-${job.state}`} key={job.id}>
                <summary>
                  <span><strong>{job.id.replaceAll("-", " ")}</strong><small>{jobStateLabel(job.state)}</small></span>
                  <span>{job.attempts.length}/{job.maxAttempts}</span>
                </summary>
                <div className="execution-attempts">
                  {job.attempts.length ? job.attempts.map((attempt) => (
                    <div key={`${job.id}-${attempt.number}`}>
                      <span>Attempt {attempt.number} · {attempt.adapterId}</span>
                      <small>{attempt.state}{attempt.externalId ? ` · external ID ${shortReceipt(attempt.externalId)}` : " · no external ID recorded"}</small>
                    </div>
                  )) : <p>No submission attempt has been recorded.</p>}
                  {job.receipt ? (
                    <div className="execution-receipt">
                      <ReceiptText size={13} />
                      <span>Receipt {shortReceipt(job.receipt.receiptHash)} · {job.receipt.outputs.length} receipt-bound {job.receipt.outputs.length === 1 ? "output" : "outputs"}</span>
                    </div>
                  ) : <p>No completion receipt exists.</p>}
                  {job.lastError?.code ? <p className="execution-job-error">Observed code · {job.lastError.code}</p> : null}
                </div>
              </details>
            ))}
          </div>
        </>
      ) : (
        <div className="execution-empty">
          <ReceiptText size={16} />
          <div><strong>No durable execution yet</strong><p>Scheduling first materializes the Director DAG; it does not prove any job ran.</p></div>
        </div>
      )}

      {!terminal ? (
        <div className="execution-controls" aria-label="Safe execution controls">
          <button type="button" disabled={busy || !controls.canSchedule} onClick={onSchedule}><Play size={12} /> Schedule safe work</button>
          {controls.canStop ? <button type="button" disabled={busy} onClick={onStop}><Square size={11} /> Stop scheduler</button> : null}
          {controls.canReconcile ? <button type="button" disabled={busy} onClick={onReconcile}><RefreshCw size={12} /> Reconcile receipts</button> : null}
          {controls.canCancel ? <button className="execution-cancel-button" type="button" disabled={busy} onClick={onRequestCancel}><X size={12} /> Cancel jobs</button> : null}
        </div>
      ) : null}
      <p className="execution-control-note">{controls.scheduleReason}</p>

      {cancelConfirmation ? (
        <div className="execution-cancel-confirm" role="group" aria-label="Confirm execution cancellation">
          <strong>Cancel every unfinished execution job?</strong>
          <p>This asks adapters to cancel and stops scheduling. It does not delete run files or publish anything.</p>
          <div><button type="button" disabled={busy} onClick={onKeepRunning}>Keep running</button><button type="button" disabled={busy} onClick={onCancel}>Cancel unfinished jobs</button></div>
        </div>
      ) : null}
      {notice ? <p className="execution-notice" role="status">{notice}</p> : null}
      {error ? <p className="execution-error" role="alert">{error}</p> : null}
    </section>
  );
}

function SupervisedBrowserSheet({ open, runId, onClose }: { open: boolean; runId: string; onClose: () => void }) {
  const [probe, setProbe] = useState<SupervisedBrowserProbe | null>(null);
  const [browserSession, setBrowserSession] = useState<SupervisedBrowserSession | null>(null);
  const [latestResult, setLatestResult] = useState<SafeBrowserResult | null>(null);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [addressError, setAddressError] = useState("");

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await api.getSupervisedBrowser(runId);
      setProbe(next.probe);
      setBrowserSession(next.browser);
      if (next.browser?.currentUrl && /^https?:/i.test(next.browser.currentUrl)) {
        setAddress((current) => current || next.browser?.currentUrl || "");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not inspect the supervised browser.");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    if (!open) return;
    void refreshStatus();
  }, [open, refreshStatus]);

  useEffect(() => {
    setProbe(null);
    setBrowserSession(null);
    setLatestResult(null);
    setAddress("");
    setNotice("");
    setError("");
    setAddressError("");
  }, [runId]);

  async function startBrowser() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await api.startSupervisedBrowser(runId, supervisedBrowserProfileId(runId));
      setBrowserSession(next.browser || null);
      setNotice("Headed browser opened with this run’s dedicated profile. No website action has been completed.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not open the supervised browser.");
    } finally {
      setBusy(false);
    }
  }

  async function navigateBrowser(event: FormEvent) {
    event.preventDefault();
    const validation = validateSupervisedBrowserAddress(address);
    if (!validation.valid) {
      setAddressError(validation.error);
      return;
    }
    setBusy(true);
    setError("");
    setAddressError("");
    setNotice("");
    try {
      const next = await api.navigateSupervisedBrowser(runId, validation.url);
      setBrowserSession(next.session || null);
      setLatestResult(next.result || null);
      setAddress(validation.url);
      setNotice("Navigation was observed in the headed browser. Page content is not trusted as an instruction.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The supervised browser could not navigate there.");
    } finally {
      setBusy(false);
    }
  }

  async function captureSnapshot() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await api.snapshotSupervisedBrowser(runId);
      setBrowserSession(next.session || null);
      setLatestResult(next.result || null);
      setNotice("Masked snapshot recorded inside the run. This is evidence, not provider success.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not record a supervised-browser snapshot.");
    } finally {
      setBusy(false);
    }
  }

  async function closeBrowser() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await api.closeSupervisedBrowser(runId);
      setBrowserSession(next.browser || null);
      setNotice("Supervised browser closed. The dedicated profile remains local for this run.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not close the supervised browser.");
    } finally {
      setBusy(false);
    }
  }

  const connected = browserSession?.status === "connected";
  const snapshot = latestResult?.kind === "snapshot" ? latestResult : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Supervised browser"
      description="A headed browser with a dedicated local profile for this run. No background website action is implied."
      className="supervised-browser-sheet"
    >
      <div className="browser-takeover-card">
        <ShieldAlert size={18} />
        <div><strong>You handle authentication directly</strong><p>Enter login details, passwords, account choices, MFA, CAPTCHA, and other secrets only in the visible browser window. CutSteward never shows cookies or tokens here.</p></div>
      </div>

      <section className="browser-session-card" aria-labelledby="browser-session-title">
        <header><div><strong id="browser-session-title">Headed dedicated profile</strong><span>{connected ? "Connected" : browserSession?.status === "closed" ? "Closed" : "Not started"}</span></div><button type="button" disabled={loading || busy} onClick={() => void refreshStatus()}><RefreshCw className={loading ? "spin" : ""} size={14} /> Refresh status</button></header>
        <p>{probe?.available === false
          ? "No supported Chrome, Edge, or Chromium executable was detected."
          : connected
            ? `${browserSession.profileId} · ${browserSession.currentUrl}`
            : "Starting opens a visible browser. It does not navigate or sign in automatically."}</p>
        <div className="browser-session-actions">
          {!connected ? <button className="primary-button small" type="button" disabled={busy || loading || probe?.available !== true} onClick={() => void startBrowser()}><Globe2 size={15} /> Start headed browser</button> : null}
          {connected ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void closeBrowser()}><Square size={13} /> Close browser</button> : null}
        </div>
      </section>

      {connected ? (
        <section className="browser-navigation-card" aria-labelledby="browser-navigation-title">
          <header><strong id="browser-navigation-title">Credential-free navigation</strong><span>HTTP(S) only</span></header>
          <form onSubmit={(event) => void navigateBrowser(event)}>
            <label htmlFor="supervised-browser-url">Destination URL</label>
            <div><input id="supervised-browser-url" type="url" inputMode="url" autoComplete="off" spellCheck={false} value={address} onChange={(event) => { setAddress(event.target.value); setAddressError(""); }} placeholder="https://example.com" /><button type="submit" disabled={busy || !address.trim()}>Navigate</button></div>
            {addressError ? <p className="browser-address-error" role="alert">{addressError}</p> : null}
          </form>
          <div className="browser-evidence-actions">
            <button type="button" disabled={busy} onClick={() => void captureSnapshot()}><ImageIcon size={14} /> Capture masked snapshot</button>
          </div>
        </section>
      ) : null}

      {latestResult ? (
        <section className="browser-evidence-card" aria-label="Latest supervised browser evidence">
          <strong>{latestResult.kind === "snapshot" ? "Latest masked snapshot" : "Latest navigation"}</strong>
          <span>{latestResult.title || "Untitled page"}</span>
          <p>{latestResult.url}</p>
          {snapshot ? <small>{snapshot.screenshotRelativePath} · SHA-256 {shortReceipt(snapshot.screenshotSha256)} · untrusted page evidence</small> : null}
        </section>
      ) : null}

      <p className="browser-boundary-note">Upload, spend, purchase, likeness, publishing, and destructive actions require a separate exact confirmation and are unavailable in this drawer. Arbitrary JavaScript, cookie export, and token access are not exposed.</p>
      {notice ? <p className="browser-notice" role="status">{notice}</p> : null}
      {error ? <p className="browser-error" role="alert">{error}</p> : null}
    </Sheet>
  );
}

function timeLabel(value: string | null | undefined) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Observed";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function activityIcon(category: ActivityCategory) {
  if (category === "tool") return <Activity size={15} />;
  if (category === "plan") return <Film size={15} />;
  if (category === "approval" || category === "input") return <ShieldAlert size={15} />;
  if (category === "turn") return <Clock3 size={15} />;
  if (category === "message") return <UserRound size={15} />;
  if (category === "session") return <Plug size={15} />;
  if (category === "terminal") return <Activity size={15} />;
  if (category === "usage") return <Clock3 size={15} />;
  if (category === "artifact" || category === "file") return <ImageIcon size={15} />;
  return <Circle size={9} fill="currentColor" />;
}

function planStatusIcon(status: PlanStepStatus) {
  if (status === "reported-complete" || status === "observed-complete") return <Check size={13} />;
  if (status === "working") return <LoaderCircle className="spin" size={13} />;
  if (status === "failed" || status === "cancelled") return <X size={13} />;
  return <Circle size={8} />;
}

function statusLabel(status: CockpitShot["status"] | CockpitBeat["status"]) {
  if (status === "working") return "Working";
  if (status === "review") return "Review";
  if (status === "ready") return "Verified";
  if (status === "failed") return "Failed";
  return "Planned";
}

function friendlyTool(adapterId: string | null | undefined) {
  const value = String(adapterId || "").toLowerCase();
  if (value.includes("gemini") || value.includes("veo") || value.includes("flow")) return "Gemini / Flow";
  if (value.includes("eleven")) return "ElevenLabs";
  if (value.includes("blender")) return "Blender";
  if (value.includes("capcut")) return "CapCut";
  if (value.includes("ffmpeg")) return "FFmpeg";
  if (value.includes("codex")) return "Codex";
  return adapterId ? "Production tool" : "Director";
}

function continuityCopy(status: CockpitData["continuity"]["status"]) {
  if (status === "warning") return "Character mismatch needs review";
  if (status === "evidence-passed") return "Character continuity verified";
  if (status === "planned-unverified") return "Character reference not verified yet";
  return "No character reference selected";
}

export function ProductionCockpit({
  run,
  artifact,
  busy,
  onRunAction,
  onRunChange,
  onOpenRunner,
  onConnectionChange
}: ProductionCockpitProps) {
  const query = new URLSearchParams(window.location.search);
  const [cockpit, setCockpit] = useState<CockpitData | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [selectedBeatId, setSelectedBeatId] = useState(() => query.get("beat"));
  const [selectedShotId, setSelectedShotId] = useState(() => query.get("shot"));
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [execution, setExecution] = useState<ExecutionSnapshot | null>(null);
  const [executionBusy, setExecutionBusy] = useState(false);
  const [executionNotice, setExecutionNotice] = useState("");
  const [executionError, setExecutionError] = useState("");
  const [cancelExecutionConfirm, setCancelExecutionConfirm] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [eventConnection, setEventConnection] = useState<"connected" | "reconnecting">("reconnecting");
  const [error, setError] = useState("");
  const refreshTimer = useRef<number | null>(null);
  const autoConnectAttempted = useRef(false);

  const applyCockpitResponse = useCallback((next: CockpitResponse) => {
    setCockpit(next.cockpit);
    setSession(next.session);
    setExecution(next.execution || null);
    onConnectionChange?.(next.session);
  }, [onConnectionChange]);

  const refresh = useCallback(async () => {
    const next = await api.getCockpit(run.id);
    applyCockpitResponse(next);
  }, [applyCockpitResponse, run.id]);

  useEffect(() => {
    autoConnectAttempted.current = false;
    const nextQuery = new URLSearchParams(window.location.search);
    setSelectedBeatId(nextQuery.get("beat"));
    setSelectedShotId(nextQuery.get("shot"));
    setExecution(null);
    setExecutionNotice("");
    setExecutionError("");
    setCancelExecutionConfirm(false);
    setBrowserOpen(false);
  }, [run.id]);

  useEffect(() => {
    let active = true;
    api.getCockpit(run.id).then((next) => {
      if (!active) return;
      applyCockpitResponse(next);
    }).catch((nextError) => {
      if (active) setError(nextError instanceof Error ? nextError.message : "Could not open the production cockpit.");
    });
    return () => { active = false; };
  }, [applyCockpitResponse, run.id]);

  useEffect(() => {
    const unsubscribe = api.subscribeLiveEvents(run.id, 0, (event) => {
      if (["message.delta", "terminal.output"].includes(event.type)) return;
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => void refresh().catch(() => undefined), 80);
    }, setEventConnection);
    return () => {
      unsubscribe();
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, [run.id, refresh]);

  const selectedBeat = useMemo(() => {
    if (!cockpit) return null;
    const explicit = cockpit.beats.find((beat) => beat.id === selectedBeatId);
    const fromShot = cockpit.beats.find((beat) => selectedShotId && beat.shotIds.includes(selectedShotId));
    return fromShot || explicit || cockpit.beats[0] || null;
  }, [cockpit, selectedBeatId, selectedShotId]);

  const selectedBeatShots = useMemo(() => {
    if (!cockpit || !selectedBeat) return [];
    const byId = new Map(cockpit.storyboard.map((shot) => [shot.id, shot]));
    return selectedBeat.shotIds.map((id) => byId.get(id)).filter((shot): shot is CockpitShot => Boolean(shot));
  }, [cockpit, selectedBeat]);

  const selectedShot = useMemo(() => (
    selectedBeatShots.find((shot) => shot.id === selectedShotId)
    || selectedBeatShots.find((shot) => ["working", "review", "failed"].includes(shot.status))
    || selectedBeatShots[0]
    || null
  ), [selectedBeatShots, selectedShotId]);

  async function connectRunner() {
    if (connecting || !LIVE_RUNNER_IDS.has(run.runnerId)) return;
    setConnecting(true);
    setError("");
    try {
      const next = await api.liveCommand(run.id, { kind: "connect", runtimeId: run.runnerId });
      if (next.session?.status !== "connected" || !next.session.sessionId) {
        throw new Error(`${run.runnerName} did not return a verified live session.`);
      }
      setSession(next.session);
      onConnectionChange?.(next.session);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : `${run.runnerName} could not connect.`);
    } finally {
      setConnecting(false);
    }
  }

  useEffect(() => {
    const connected = session?.status === "connected" && Boolean(session.sessionId);
    if (!cockpit || connected || connecting || autoConnectAttempted.current) return;
    if (!LIVE_RUNNER_IDS.has(run.runnerId) || NON_AUTOCONNECT_STATES.has(run.state)) return;
    autoConnectAttempted.current = true;
    void connectRunner();
  }, [cockpit, connecting, run.runnerId, run.state, session?.sessionId, session?.status]);

  function updateSelection(beat: CockpitBeat, shot: CockpitShot | null) {
    setSelectedBeatId(beat.id);
    setSelectedShotId(shot?.id || null);
    const url = new URL(window.location.href);
    url.searchParams.set("beat", beat.id);
    if (shot) url.searchParams.set("shot", shot.id);
    else url.searchParams.delete("shot");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  function chooseBeat(beat: CockpitBeat) {
    if (!cockpit) return;
    const firstShot = cockpit.storyboard.find((shot) => beat.shotIds.includes(shot.id)) || null;
    updateSelection(beat, firstShot);
  }

  function chooseShot(shot: CockpitShot) {
    if (!cockpit) return;
    const beat = cockpit.beats.find((candidate) => candidate.shotIds.includes(shot.id)) || selectedBeat;
    if (beat) updateSelection(beat, shot);
  }

  async function sendDirection() {
    const content = message.trim();
    const canSend = session?.status === "connected" && Boolean(session.sessionId) && !session.activeTurnId;
    if (!content || sending || !canSend) return;
    setSending(true);
    setError("");
    try {
      const result = await api.sendMessage(run.id, content);
      onRunChange(result.run);
      if (!result.liveDispatch?.accepted) {
        throw new Error(result.liveDispatch?.error?.message || "Direction was saved, but the live agent did not accept it.");
      }
      setMessage("");
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Direction could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function decide(requestId: string, decision: "allow-once" | "deny") {
    setError("");
    try {
      const next = await api.liveCommand(run.id, { kind: "decide", requestId, decision });
      setSession(next.session);
      onConnectionChange?.(next.session);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The approval decision could not be delivered.");
    }
  }

  async function mutateExecution(
    operation: "schedule" | "stop-scheduler" | "reconcile" | "cancel"
  ) {
    if (executionBusy) return;
    setExecutionBusy(true);
    setExecutionError("");
    setExecutionNotice("");
    try {
      if (operation === "schedule" && !execution) {
        const materialized = await api.mutateExecution(run.id, { operation: "materialize" });
        setExecution(materialized.execution);
        setSession(materialized.session);
        onConnectionChange?.(materialized.session);
        const pendingCount = materialized.execution?.approvals.filter((approval) => approval.status === "pending").length || 0;
        const materializedControls = projectExecutionControls(materialized.execution, materialized.session?.status === "connected");
        if (!materializedControls.canSchedule) {
          setExecutionNotice(`Director DAG materialized. ${pendingCount} exact ${pendingCount === 1 ? "proposal is" : "proposals are"} required before scheduling.`);
          return;
        }
      }

      const next = await api.mutateExecution(run.id, { operation });
      setExecution(next.execution);
      setSession(next.session);
      onConnectionChange?.(next.session);
      if (operation === "schedule") {
        setExecutionNotice("Scheduler command accepted. Only the durable job states and receipts below are evidence of execution.");
      } else if (operation === "stop-scheduler") {
        setExecutionNotice("Scheduler stop command accepted. The server does not expose a durable running/stopped flag; job state remains authoritative.");
      } else if (operation === "reconcile") {
        setExecutionNotice("Receipt reconciliation completed. Only returned durable states and receipts are shown.");
      } else {
        setExecutionNotice("Cancellation request recorded. Each job remains pending until its durable state confirms an outcome.");
      }
      setCancelExecutionConfirm(false);
      await refresh();
    } catch (nextError) {
      setExecutionError(nextError instanceof Error ? nextError.message : "The execution command could not be recorded.");
    } finally {
      setExecutionBusy(false);
    }
  }

  if (!cockpit) {
    return (
      <main className="cockpit-loading" aria-live="polite">
        <LoaderCircle className="spin" size={24} />
        <span>{error || "Opening live production…"}</span>
      </main>
    );
  }

  const liveConnected = session?.status === "connected" && Boolean(session.sessionId);
  const agentWorking = liveConnected && Boolean(session?.activeTurnId);
  const runnerDisplayName = session?.runtimeName || run.runnerName;
  const selectedRunnerCanConnect = LIVE_RUNNER_IDS.has(run.runnerId);
  const plan = projectCockpitPlan(run, cockpit.activity);
  const activity = projectActivityEntries(cockpit.activity);
  const pending = session?.pendingApprovals || [];
  const toolName = cockpit.toolStage ? friendlyTool(cockpit.toolStage.adapterId) : "No tool receipt";
  const canPause = ["active", "running", "needs_approval", "reconciling"].includes(run.state);
  const canResume = run.state === "paused";

  return (
    <>
    <main className="production-cockpit">
      <section className="cockpit-stage-rail" aria-label="Production stages">
        {cockpit.stages.map((stage) => (
          <div className={`cockpit-stage cockpit-stage-${stage.status}`} key={stage.id}>
            <span className="cockpit-stage-dot">{stage.status === "complete" ? <Check size={13} /> : null}</span>
            <strong>{stage.label}</strong>
          </div>
        ))}
      </section>

      <section className="cockpit-surface glass-surface">
        <aside className="production-stream" aria-labelledby="production-stream-title">
          <div className="cockpit-section-heading">
            <h1 id="production-stream-title">Building your film</h1>
            <span className={`stream-state stream-${eventConnection}`}><span />{eventConnection === "connected" ? "Journal live" : "Reconnecting"}</span>
          </div>
          <p className="stream-connection-copy">
            <span className={liveConnected ? "is-live" : ""} />
            {connecting
              ? `Connecting ${runnerDisplayName}…`
              : liveConnected
                ? agentWorking ? `${runnerDisplayName} is working` : `${runnerDisplayName} connected`
                : selectedRunnerCanConnect ? `${runnerDisplayName} not connected` : `${runnerDisplayName} selected · no live session verified`}
          </p>

          <section className={`agent-plan-panel agent-plan-${plan.source}`} aria-labelledby="agent-plan-title">
            <header>
              <strong id="agent-plan-title">{plan.title}</strong>
              <span>{plan.steps.length} {plan.steps.length === 1 ? "step" : "steps"}</span>
            </header>
            <p>{plan.truthCopy}</p>
            {plan.steps.length ? (
              <div className="agent-plan-list">
                {plan.steps.map((step) => (
                  <div className={`agent-plan-step plan-step-${step.status}`} key={step.id}>
                    <span className="plan-step-icon">{planStatusIcon(step.status)}</span>
                    <div>
                      <strong>{step.label}</strong>
                      <small>{step.statusLabel}</small>
                      <p>{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="plan-empty-state">No steps are being inferred.</div>
            )}
          </section>

          <ExecutionPanel
            execution={execution}
            liveConnected={liveConnected}
            busy={executionBusy}
            notice={executionNotice}
            error={executionError}
            cancelConfirmation={cancelExecutionConfirm}
            onSchedule={() => void mutateExecution("schedule")}
            onStop={() => void mutateExecution("stop-scheduler")}
            onReconcile={() => void mutateExecution("reconcile")}
            onRequestCancel={() => setCancelExecutionConfirm(true)}
            onCancel={() => void mutateExecution("cancel")}
            onKeepRunning={() => setCancelExecutionConfirm(false)}
            onOpenBrowser={() => setBrowserOpen(true)}
          />

          <ProviderActionsPanel
            runId={run.id}
            execution={execution}
            onExecutionChange={(next) => {
              setExecution(next);
              setExecutionNotice("Exact provider action approved and bound to this execution scope. Submission and completion still require durable receipts.");
              void refresh().catch(() => undefined);
            }}
          />

          <section className="observed-activity" aria-labelledby="observed-activity-title">
            <header className="stream-subheading">
              <strong id="observed-activity-title">Observed activity</strong>
              <span>{activity.length ? `${activity.length} recorded` : "None recorded"}</span>
            </header>
            <div className="stream-list">
            {activity.length ? activity.map((entry) => (
              <div className="stream-entry" key={`${entry.sequence}-${entry.type}`}>
                <span className={`stream-icon stream-icon-${entry.category}`}>{activityIcon(entry.category)}</span>
                <div>
                  <strong>{entry.label}</strong>
                  <small>{entry.categoryLabel} · {timeLabel(entry.at)}</small>
                </div>
              </div>
            )) : (
              <div className="stream-empty">
                <Activity size={19} />
                <strong>No observed activity yet</strong>
                <p>A planned route is not proof that an agent or tool has started.</p>
              </div>
            )}
            </div>
          </section>

          {pending.map((approval) => {
            const needsTypedResponse = approval.type === "input.requested";
            const needsExactProposal = requiresExactProposal(approval);
            return (
              <div className="live-approval" key={approval.requestId}>
                <ShieldAlert size={18} />
                <div>
                  <strong>{approval.title}</strong>
                  <p>{approval.detail}</p>
                  {needsTypedResponse ? (
                    <small className="live-approval-exact">This runner needs a typed response; a generic allow or deny is unavailable here.</small>
                  ) : needsExactProposal ? (
                    <small className="live-approval-exact">This sensitive boundary needs a separate exact proposal. Generic approval is unavailable.</small>
                  ) : null}
                </div>
                {!needsTypedResponse ? (
                  <div className="live-approval-actions">
                    <button type="button" onClick={() => void decide(approval.requestId, "deny")}><X size={15} /> Deny</button>
                    {!needsExactProposal ? <button type="button" onClick={() => void decide(approval.requestId, "allow-once")}><Check size={15} /> Allow once</button> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </aside>

        <section className="tool-stage" aria-labelledby="tool-stage-title">
          <header className="tool-stage-header">
            <div>
              <span className="stage-context">{selectedBeat ? `${selectedBeat.label} · ${selectedBeat.shotCount} shots` : "Storyboard"}</span>
              <h2 id="tool-stage-title">{cockpit.toolStage?.detail || selectedBeat?.title || "No recorded tool work"}</h2>
            </div>
            <div className="tool-stage-meta"><span>{toolName}</span><strong>{cockpit.toolStage ? statusLabel(cockpit.toolStage.status as CockpitShot["status"]) : "Planned only"}</strong></div>
          </header>

          <div className="cockpit-preview">
            {artifact?.contentUrl ? (
              <video controls preload="metadata" src={artifact.contentUrl}>Your browser cannot play this local artifact.</video>
            ) : selectedShot?.previewUrl ? (
              <div className="shot-media-frame"><img src={selectedShot.previewUrl} alt={`Recorded media for shot ${selectedShot.number}`} /></div>
            ) : selectedShot ? (
              <div className="planned-frame">
                {selectedShot.character.inFrame ? <UserRound size={30} /> : <Film size={30} />}
                <span>No recorded media</span>
                <strong>{String(selectedShot.number).padStart(2, "0")}</strong>
                <small>Planned · not media</small>
              </div>
            ) : (
              <div className="preview-empty"><ImageIcon size={29} /><span>No storyboard media yet</span></div>
            )}

            {selectedShot ? (
              <aside className="selected-shot-detail">
                <span>Shot {String(selectedShot.number).padStart(2, "0")} · {selectedShot.durationSeconds.toFixed(2)}s</span>
                <h3>{selectedShot.action}</h3>
                <p>{selectedShot.framing}</p>
                <div className="selected-shot-tags">
                  <span>{selectedShot.source.label}</span>
                  <span className={selectedShot.character.continuityStatus === "mismatch" ? "warning" : ""}>
                    {selectedShot.character.inFrame ? "Same character" : "Product only"}
                  </span>
                </div>
                <div className="micro-shot-rail" role="list" aria-label={`${selectedBeat?.label || "Selected beat"} micro-shots`}>
                  {selectedBeatShots.map((shot) => (
                    <span className="micro-shot-item" role="listitem" key={shot.id}>
                      <button
                        className={`micro-shot-button micro-${shot.status} ${selectedShot.id === shot.id ? "selected" : ""}`}
                        type="button"
                        onClick={() => chooseShot(shot)}
                        aria-label={`Shot ${shot.number}, ${shot.durationSeconds.toFixed(2)} seconds, ${statusLabel(shot.status)}`}
                      >
                        <strong>{String(shot.number).padStart(2, "0")}</strong>
                        <small>{shot.durationSeconds.toFixed(1)}s</small>
                      </button>
                    </span>
                  ))}
                </div>
              </aside>
            ) : null}
          </div>

          <footer className="tool-stage-footer">
            <div><span>Current beat</span><strong>{selectedBeat?.title || "Storyboard pending"}</strong></div>
            <p>{selectedBeat?.description || "The Director will build five story beats."}</p>
            {canPause ? (
              <button className="icon-control" type="button" disabled={busy} onClick={() => onRunAction("pause")} aria-label="Pause production run"><Pause size={18} /></button>
            ) : canResume ? (
              <button className="icon-control" type="button" disabled={busy} onClick={() => onRunAction("resume")} aria-label="Resume production run"><Play size={18} /></button>
            ) : <span className="run-control-state">No run control available</span>}
          </footer>
        </section>

        <section className="storyboard-section" aria-labelledby="storyboard-title">
          <header className="storyboard-header">
            <div>
              <h2 id="storyboard-title">Story beats</h2>
              <p>5 beats · {cockpit.storyboard.length} adaptive shots for this film</p>
            </div>
            <div className={`continuity-chip continuity-${cockpit.continuity.status}`}>
              {cockpit.continuity.status === "warning" ? <ShieldAlert size={15} /> : <UserRound size={15} />}
              <span><strong>Character lock</strong><small>{continuityCopy(cockpit.continuity.status)}</small></span>
            </div>
          </header>

          <div className="story-beat-rail" role="list" aria-label="Five story beats">
            {cockpit.beats.map((beat) => (
              <div className="story-beat-item" role="listitem" key={beat.id}>
                <button
                  className={`story-beat-card beat-${beat.status} ${selectedBeat?.id === beat.id ? "selected" : ""}`}
                  type="button"
                  onClick={() => chooseBeat(beat)}
                  aria-pressed={selectedBeat?.id === beat.id}
                  aria-label={`${beat.label}, ${beat.shotCount} shots, ${beat.durationSeconds.toFixed(1)} seconds`}
                >
                  <span className="beat-card-top"><span>{String(beat.number).padStart(2, "0")}</span><small>{statusLabel(beat.status)}</small></span>
                  <strong>{beat.label}</strong>
                  <p>{beat.title}</p>
                  <span className="beat-card-meta">{beat.shotCount} shots · {beat.durationSeconds.toFixed(1)}s</span>
                  <span className="beat-card-character">{beat.character.label}</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="agent-chat-dock" aria-label="Agent direction">
          <div className="chat-compose">
            <span className="chat-agent-avatar">{runnerDisplayName.slice(0, 1).toUpperCase()}</span>
            <textarea
              value={message}
              rows={1}
              disabled={!liveConnected || agentWorking}
              placeholder={connecting
                ? `Connecting ${runnerDisplayName}…`
                : agentWorking ? `${runnerDisplayName} is working…`
                  : liveConnected ? `Tell ${runnerDisplayName} what to make or change…`
                    : selectedRunnerCanConnect ? `Connect ${runnerDisplayName} to direct this production` : "Choose a live agent to send directions"}
              aria-label="Tell the connected agent what to do"
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendDirection();
                }
              }}
            />
            {!liveConnected ? (
              <button className="chat-connect-button" type="button" disabled={connecting} onClick={() => selectedRunnerCanConnect ? void connectRunner() : onOpenRunner()}>
                {connecting ? <LoaderCircle className="spin" size={16} /> : <Plug size={16} />}
                {connecting
                  ? "Connecting"
                  : selectedRunnerCanConnect
                    ? session?.status === "failed" || session?.status === "disconnected" ? "Retry" : "Connect"
                    : "Choose agent"}
              </button>
            ) : <span className="chat-session-state"><span /> {agentWorking ? "Working" : `${runnerDisplayName} live`}</span>}
            <button className="chat-send-button" type="button" disabled={!message.trim() || sending || !liveConnected || agentWorking} onClick={() => void sendDirection()} aria-label={`Send direction to ${runnerDisplayName}`}>
              {sending ? <LoaderCircle className="spin" size={19} /> : <ArrowUp size={20} />}
            </button>
          </div>
          {error ? <div className="cockpit-error" role="alert"><ShieldAlert size={16} />{error}</div> : null}
        </section>
      </section>
    </main>
    <SupervisedBrowserSheet open={browserOpen} runId={run.id} onClose={() => setBrowserOpen(false)} />
    </>
  );
}
