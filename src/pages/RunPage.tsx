import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileVideo2,
  Layers3,
  Pause,
  Play,
  ShieldCheck
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { CornerNav } from "../components/CornerNav";
import { DirectorRoute } from "../components/DirectorRoute";
import { ProductionCockpit } from "../components/ProductionCockpit";
import { Sheet } from "../components/Sheet";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import type { Artifact, LiveSession, PendingAttention, Run } from "../types";
import type { PageContext } from "./page-types";

type Action = (action: string, input?: Record<string, unknown>) => void;

function runnerState(run: Run): "Selected" | "Working" | "Needs you" | "Paused" | "Complete" {
  if (run.state === "needs_approval") return "Needs you";
  if (["paused", "blocked", "failed", "cancelled"].includes(run.state)) return "Paused";
  if (run.state === "completed") return "Complete";
  if (run.runnerStatus !== "connected") return "Selected";
  if (["active", "running", "reconciling"].includes(run.state)) return "Working";
  return "Selected";
}

function runnerSummary(run: Run) {
  if (run.runnerStatus === "connected" && run.runnerSessionId) {
    return `${run.runnerName} · live session connected`;
  }
  if (run.runnerId === "local-demo") {
    return `${run.runnerName} · built-in planning only; no provider session`;
  }
  return `${run.runnerName} · selected; no live session verified`;
}

function downloadManifest(artifact: Artifact) {
  const manifest = {
    schemaVersion: artifact.demo ? 1 : 2,
    assurance: artifact.demo ? "demonstration-only" : "content-addressed-local-artifact",
    artifact
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.demo ? "cutsteward-sample-manifest.json" : `${artifact.id}-manifest.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadMedia(artifact: Artifact) {
  if (!artifact.contentUrl) return;
  const anchor = document.createElement("a");
  anchor.href = artifact.contentUrl;
  anchor.download = artifact.relativePath?.split("/").at(-1) || artifact.title;
  anchor.click();
}

function Preflight({ run, busy, onAction }: { run: Run; busy: boolean; onAction: Action }) {
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const sourceCount = run.sourceIds?.length || 0;
  const rows = run.demo ? [
    ["Outcome", run.outcome],
    ["Assurance", "Demonstration only · no media execution"],
    ["Guardrails", "No upload, spend, purchase, or publish"]
  ] : [
    ["Outcome", run.outcome],
    ["Workflow", run.directorPlan ? `Autopilot Director ${run.directorPlan.directorVersion} · ${run.directorPlan.shots.length} planned shots` : "Universal production workflow 2.0 · 11 evidence gates"],
    ["Workspace", run.projectRelativePath || "Local production folder"],
    ["Sources", sourceCount ? `${sourceCount} content-addressed local source${sourceCount === 1 ? "" : "s"}` : "No source bytes attached"],
    ["Runner", runnerSummary(run)],
    ["Mode", run.mode === "Guided"
      ? "Guided · review the Director plan before production continues"
      : "Autonomous · continue through low-risk local steps after brief approval"],
    ["Boundaries", "Zero cash budget · no external upload · no publishing"],
    ["Release", "Approved master + hash-bound QA + checksum + completion certificate"]
  ];

  return (
    <main className="run-main preflight-main">
      <header className="run-heading">
        <p className="eyebrow">{run.demo ? "Sample plan" : "Preflight · No external action started"}</p>
        <h1>Confirm the Director route</h1>
        <p>The shot route already exists locally. This decision is bound to the exact outcome and attached source hashes.</p>
      </header>
      <section className="preflight-surface glass-surface">
        {rows.map(([label, value]) => (
          <div className="plan-row" key={label}><span>{label}</span><strong>{value}</strong></div>
        ))}
        {run.directorPlan ? <DirectorRoute plan={run.directorPlan} /> : null}
        <div className="plan-readiness">
          <span><CheckCircle2 size={18} /> Rights recorded per source</span>
          <span><CheckCircle2 size={18} /> Side effects need fresh approval</span>
          <span><CheckCircle2 size={18} /> Agent text cannot complete a run</span>
        </div>
        <label className="rights-confirmation">
          <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />
          <span><strong>I may use the requested and attached material</strong><small>Uploads, paid actions, and publishing remain disabled.</small></span>
        </label>
        <div className="surface-actions">
          <button className="text-button" type="button" onClick={() => navigate("/runs")}>Back to runs</button>
          <button
            className="primary-button"
            type="button"
            disabled={busy || !rightsConfirmed}
            onClick={() => onAction("approve-plan", { rightsConfirmed: true })}
          >
            Confirm &amp; open workspace <ArrowRight size={20} />
          </button>
        </div>
      </section>
      <p className="demo-disclosure">{run.demo ? "Sample record only." : run.notice}</p>
    </main>
  );
}

function ApprovalCard({ attention, busy, onAction }: { attention: PendingAttention; busy: boolean; onAction: Action }) {
  const requiresRights = attention.category === "brief-rights-budget";
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const proposal = attention.proposal;
  return (
    <aside className="approval-card glass-surface" aria-labelledby="approval-title">
      <h2 id="approval-title">{attention.title}</h2>
      <p>{attention.detail}</p>
      <div className="approval-file"><ShieldCheck size={21} /><span>{attention.category.replaceAll("-", " ")}</span></div>
      <ul>
        <li><CheckCircle2 size={18} /> Proposal hash · {attention.requestHash.slice(0, 12)}…</li>
        <li><ShieldCheck size={18} /> Cash budget · {String(proposal.cashBudget ?? "unchanged")}</li>
        <li><ShieldCheck size={18} /> External upload · {proposal.externalUploads === true ? "requested" : "disabled"}</li>
      </ul>
      {requiresRights ? (
        <label className="approval-confirmation">
          <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />
          <span>I may use this exact source set</span>
        </label>
      ) : null}
      <div className="approval-actions">
        <button className="secondary-button" type="button" disabled={busy} onClick={() => onAction("not-now")}>Not now</button>
        <button
          className="primary-button small"
          type="button"
          disabled={busy || (requiresRights && !rightsConfirmed)}
          onClick={() => onAction("allow-once", requiresRights ? { rightsConfirmed: true } : {})}
        >
          Approve once
        </button>
      </div>
      <small>An approval applies only to this displayed request hash. Any changed inputs require a new decision.</small>
    </aside>
  );
}

function ReviewSurface({ run, artifact, busy, onAction }: { run: Run; artifact: Artifact; busy: boolean; onAction: Action }) {
  const [playing, setPlaying] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const complete = run.state === "completed";
  const canPassDelivery = !run.demo && run.phaseId === "delivery";
  const candidate = !artifact.demo && artifact.status === "candidate";
  const passed = artifact.verification?.result === "pass";
  return (
    <main className="review-main">
      <header className="review-heading">
        <p className="eyebrow">{complete ? "Delivery · Certified" : `${run.phase} · Master review`}</p>
        <h1>{complete ? "Your verified package is ready" : "Review the real master"}</h1>
        <p>{complete
          ? "CutSteward issued a completion certificate from immutable artifacts, hash-bound QA, and the delivery checksum."
          : "This is the actual local artifact. A passing decode is necessary, but the run remains open until every applicable gate closes."}</p>
      </header>
      <section className="review-surface glass-surface">
        <div className={`video-stage ${playing ? "playing" : ""}`}>
          {artifact.demo || !artifact.contentUrl ? (
            <>
              {artifact.poster ? <img src={artifact.poster} alt="CutSteward demonstration preview" /> : <div className="media-placeholder"><FileVideo2 size={42} /></div>}
              <button className="play-button" type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause sample preview" : "Play sample preview"}>
                {playing ? <Pause size={30} fill="currentColor" /> : <Play size={31} fill="currentColor" />}
              </button>
            </>
          ) : (
            <video controls preload="metadata" src={artifact.contentUrl}>Your browser cannot play this local artifact.</video>
          )}
          <span className="timecode">{artifact.duration}</span>
          <span className="playhead" />
          <span className="sample-badge">{artifact.demo ? "Sample preview" : artifact.status === "approved" ? "Approved bytes" : "Candidate bytes"}</span>
        </div>
        <aside className="verification-pane">
          <h2>{passed ? "Decode evidence passed" : "Evidence pending"}</h2>
          <dl>
            <div><dt>Duration</dt><dd>{artifact.duration}{passed ? <Check size={16} /> : null}</dd></div>
            <div><dt>Frame</dt><dd>{artifact.dimensions}{passed ? <Check size={16} /> : null}</dd></div>
            <div><dt>Audio</dt><dd>{artifact.audio}{passed ? <Check size={16} /> : null}</dd></div>
            <div><dt>Status</dt><dd>{artifact.status || (artifact.demo ? "sample" : "candidate")}</dd></div>
          </dl>
          <h3>Recorded checks</h3>
          <ul>{artifact.checks.map((check) => <li key={check}><CheckCircle2 size={17} />{check}</li>)}</ul>
          {artifact.sha256 ? <p className="artifact-hash">SHA-256 · {artifact.sha256.slice(0, 20)}…</p> : null}
        </aside>
        <div className="review-rail">
          <div className="artifact-title"><FileVideo2 size={24} /><strong>{artifact.title}</strong><span>{artifact.version}</span></div>
          <button type="button" className="rail-button" onClick={() => setEvidenceOpen(true)}><Layers3 size={21} /> Evidence</button>
          <button type="button" className="rail-button" onClick={() => downloadManifest(artifact)}><ArrowDownToLine size={21} /> Manifest</button>
          {complete ? (
            <button className="primary-button review-primary" type="button" onClick={() => artifact.demo ? downloadManifest(artifact) : downloadMedia(artifact)}>
              {artifact.demo ? "Download record" : "Download master"} <ArrowDownToLine size={20} />
            </button>
          ) : candidate ? (
            <button
              className="primary-button review-primary"
              type="button"
              disabled={busy || !passed}
              onClick={() => onAction("approve-artifact", { artifactId: artifact.id, reason: "Viewed and listened to the exact local media artifact." })}
            >
              Approve exact bytes <ArrowRight size={21} />
            </button>
          ) : (
            <button className="primary-button review-primary" type="button" disabled={busy || (!run.demo && !canPassDelivery)} onClick={() => onAction("approve-final")}>
              {canPassDelivery || run.demo ? "Pass delivery gate" : "Await delivery evidence"} <ArrowRight size={21} />
            </button>
          )}
        </div>
      </section>
      <p className="demo-disclosure">{run.notice}</p>
      <Sheet
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        title="Artifact evidence"
        description="Recorded facts for these exact local bytes. A provider or agent message cannot substitute for this evidence."
      >
        <div className="activity-list">
          <div><span>Artifact</span><strong>{artifact.title} · {artifact.version}</strong></div>
          <div><span>Status</span><strong>{artifact.status || (artifact.demo ? "demonstration" : "candidate")}</strong></div>
          <div><span>Verification</span><strong>{artifact.verification?.result || "not recorded"} · {artifact.verification?.method || "no method recorded"}</strong></div>
          <div><span>Detail</span><strong>{artifact.verification?.detail || "No verification evidence has been recorded."}</strong></div>
          <div><span>SHA-256</span><strong>{artifact.sha256 || "Not recorded for this demonstration"}</strong></div>
        </div>
      </Sheet>
    </main>
  );
}

function PausedRun({ run, busy, onAction }: { run: Run; busy: boolean; onAction: Action }) {
  const cancelled = run.state === "cancelled";
  return (
    <main className="run-main paused-main">
      <header className="run-heading">
        <p className="eyebrow">Run · {cancelled ? "Cancelled" : "Paused"}</p>
        <h1>{cancelled ? "This run is closed" : "Your work is safe"}</h1>
        <p>Inputs, decisions, evidence, and the last durable state remain stored locally.</p>
      </header>
      <section className="paused-surface glass-surface">
        <CheckCircle2 size={42} />
        <h2>No external action is claimed active</h2>
        <p>{run.notice}</p>
        {!cancelled ? <button className="primary-button" type="button" disabled={busy} onClick={() => onAction("resume")}>Resume run <ArrowRight size={20} /></button> : null}
      </section>
    </main>
  );
}

export function RunPage({ runId, runner, openRunner, onLiveSessionChange }: PageContext & { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activityOpen, setActivityOpen] = useState(false);
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);

  const handleConnectionChange = useCallback((session: LiveSession | null) => {
    setLiveSession(session);
    onLiveSessionChange(session);
  }, [onLiveSessionChange]);

  useEffect(() => {
    let active = true;
    api.getRun(runId).then((next) => { if (active) setRun(next); }).catch((next) => { if (active) setError(next.message); });
    return () => { active = false; };
  }, [runId]);

  useEffect(() => {
    if (!run || run.demo || ["completed", "cancelled"].includes(run.state)) return;
    const timer = window.setInterval(() => {
      api.getRun(runId).then(setRun).catch(() => undefined);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [runId, run?.demo, run?.state]);

  useEffect(() => {
    if (!run?.artifactId) {
      setArtifact(null);
      return;
    }
    api.getArtifact(run.artifactId).then(setArtifact).catch(() => setArtifact(null));
  }, [run?.artifactId, run?.revision]);

  async function action(name: string, input: Record<string, unknown> = {}) {
    if (!run || busy) return;
    setBusy(true);
    setError("");
    try {
      setRun(await api.actOnRun(run.id, name, input));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The local action failed.");
    } finally {
      setBusy(false);
    }
  }

  let content;
  if (error && !run) {
    content = <main className="missing-page"><p>{error}</p><button className="primary-button" onClick={() => navigate("/runs")}>Back to runs</button></main>;
  } else if (!run) {
    content = <main className="loading-page"><span /><p>Opening local run…</p></main>;
  } else if (run.state === "preflight") {
    content = <Preflight run={run} busy={busy} onAction={action} />;
  } else if ((run.state === "completed" || run.demo && run.state === "review_ready" || !run.demo && ["master", "delivery"].includes(run.phaseId || "")) && artifact) {
    content = <ReviewSurface run={run} artifact={artifact} busy={busy} onAction={action} />;
  } else if (run.state === "cancelled") {
    content = <PausedRun run={run} busy={busy} onAction={action} />;
  } else {
    content = (
      <>
        <ProductionCockpit
          run={run}
          artifact={artifact}
          busy={busy}
          onRunAction={action}
          onRunChange={setRun}
          onOpenRunner={openRunner}
          onConnectionChange={handleConnectionChange}
        />
        {run.state === "needs_approval" && run.pendingAttention
          ? <ApprovalCard attention={run.pendingAttention} busy={busy} onAction={action} />
          : null}
      </>
    );
  }

  const centerLabel = run?.title || "Local run";
  const state = liveSession?.status === "connected" ? "Connected" : run ? runnerState(run) : "Selected";
  const runnerLabel = liveSession?.runtimeName || run?.runnerName || runner.name;
  const showsCockpit = Boolean(run
    && run.state !== "preflight"
    && run.state !== "cancelled"
    && !((run.state === "completed" || run.demo && run.state === "review_ready" || !run.demo && ["master", "delivery"].includes(run.phaseId || "")) && artifact));

  return (
    <AppShell className={showsCockpit ? "cockpit-app-shell" : ""} centerLabel={centerLabel} runnerName={runnerLabel} runnerState={state} onCenterClick={() => setActivityOpen(true)} onRunnerClick={openRunner}>
      {content}
      {error && run ? <div className="error-toast" role="alert">{error}</div> : null}
      {!showsCockpit ? (
        <CornerNav
          left={{ label: "Recent runs", icon: <ArrowLeft size={18} />, onClick: () => navigate("/runs") }}
          right={{ label: "Run activity", onClick: () => setActivityOpen(true) }}
        />
      ) : null}
      <Sheet open={activityOpen} onClose={() => setActivityOpen(false)} title="Run activity" description="A chronological local record. Provider events appear only after an adapter emits an observed receipt.">
        <div className="activity-list">
          <div><span>Now</span><strong>{run?.notice || "Opening run"}</strong></div>
          <div><span>Revision</span><strong>{run?.revision ?? "Sample"} · durable local state</strong></div>
          <div><span>Runner</span><strong>{runnerLabel} · {run?.demo ? "demonstration" : liveSession?.status === "connected" && liveSession.sessionId ? "connected" : "not connected"}</strong></div>
          {!run?.demo && run?.projectRelativePath ? <div><span>Workspace</span><strong>{run.projectRelativePath}</strong></div> : null}
        </div>
      </Sheet>
    </AppShell>
  );
}
