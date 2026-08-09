import { ArrowRight, Check, Clock3, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { CornerNav } from "../components/CornerNav";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import type { Run } from "../types";
import type { PageContext } from "./page-types";

const statusCopy: Record<Run["state"], string> = {
  preflight: "Plan ready",
  active: "Waiting for recorded evidence",
  running: "Working",
  needs_approval: "Decision required",
  reconciling: "Reconciling an observed job",
  review_ready: "Ready to review",
  completed: "Certified delivery",
  paused: "Paused",
  blocked: "Blocked",
  failed: "Needs attention",
  cancelled: "Cancelled"
};

function RunGlyph({ state }: { state: Run["state"] }) {
  if (state === "completed") return <Check size={20} />;
  if (["paused", "blocked", "failed", "cancelled"].includes(state)) return <X size={20} />;
  if (state === "needs_approval") return <Clock3 size={20} />;
  return <span className="open-circle" />;
}

function runnerCopy(run: Run) {
  if (run.demo) return "Sample";
  if (run.runnerStatus === "connected" && run.runnerSessionId) return "Connected";
  if (run.runnerId === "local-demo") return "Built-in plan";
  return "Runner selected";
}

export function RunsPage({ runner, openRunner }: PageContext) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  useEffect(() => {
    api.listRuns().then(setRuns).catch(() => setRuns([])).finally(() => setLoading(false));
  }, []);
  const visible = useMemo(() => runs.filter((run) => run.title.toLowerCase().includes(query.toLowerCase())), [runs, query]);

  return (
    <AppShell centerLabel="Recent runs" runnerName={runner.name} runnerState="Selected" onCenterClick={() => navigate("/")} onRunnerClick={openRunner}>
      <main className="collection-main">
        <header className="collection-heading">
          <h1>Pick up where you left off</h1>
          <p>Every run is stored locally with its decisions, evidence, artifacts, and truthful completion state.</p>
        </header>
        <section className="run-list glass-surface" aria-label="Local runs">
          {visible.map((run, index) => (
            <article key={run.id} className={`run-row ${index === 0 ? "featured" : ""}`}>
              <span className="run-glyph"><RunGlyph state={run.state} /></span>
              <div className="run-title">
                <h2>{run.title}</h2>
                <p>{statusCopy[run.state]}</p>
              </div>
              {index === 0 && (
                <div className="mini-progress">
                  <span>{run.progress} of {run.total} evidence gates</span>
                  <div>{Array.from({ length: run.total }, (_, step) => <i key={step} className={step < run.progress ? "done" : ""} />)}</div>
                </div>
              )}
              <span className="run-time">{runnerCopy(run)} · {run.phase}</span>
              {index === 0 ? (
                <button className="primary-button compact" type="button" onClick={() => navigate(`/runs/${encodeURIComponent(run.id)}`)}>Resume</button>
              ) : (
                <button className="row-arrow" type="button" onClick={() => navigate(`/runs/${encodeURIComponent(run.id)}`)} aria-label={`Open ${run.title}`}><ArrowRight size={21} /></button>
              )}
            </article>
          ))}
          {!loading && visible.length === 0 ? (
            <div className="run-empty-state">
              <h2>{query ? "No matching production" : "No production yet"}</h2>
              <p>{query
                ? "Try a different run name."
                : "Start with a brief, choose the runner and autonomy mode, and attach any local sources."}</p>
              {!query ? <button className="primary-button compact" type="button" onClick={() => navigate("/")}>Start a project</button> : null}
            </div>
          ) : null}
          <div className="list-tools">
            <label><Search size={21} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search runs" /></label>
          </div>
        </section>
      </main>
      <CornerNav
        left={{ label: "New project", onClick: () => navigate("/") }}
        right={{ label: "Artifacts", onClick: () => navigate("/artifacts") }}
      />
    </AppShell>
  );
}
