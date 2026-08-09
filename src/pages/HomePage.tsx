import {
  ArrowRight,
  CheckCircle2,
  Paperclip,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X
} from "lucide-react";
import { FormEvent, useState } from "react";
import { AppShell } from "../components/AppShell";
import { CornerNav } from "../components/CornerNav";
import { ModeSheet } from "../components/ModeSheet";
import { SourceSheet } from "../components/SourceSheet";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import type { PageContext } from "./page-types";
import type { SourceReference } from "../types";

const samplePrompt = "Create a 30-second premium 9:16 launch film in English for international English-speaking markets. Use my approved sources and only tools that are actually configured. Preserve authentic product media, build a truthful story, and return a verified review master with one clear CTA.";

export function HomePage({ runner, openRunner }: PageContext) {
  const [outcome, setOutcome] = useState(samplePrompt);
  const [mode, setMode] = useState<"Guided" | "Autonomous">("Guided");
  const [sources, setSources] = useState<SourceReference[]>([]);
  const [sourceSheet, setSourceSheet] = useState(false);
  const [modeSheet, setModeSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting || outcome.trim().length < 3) return;
    setSubmitting(true);
    setError("");
    try {
      const run = await api.createRun(outcome.trim(), mode, sources.map((source) => source.id), runner.id);
      navigate(`/runs/${encodeURIComponent(run.id)}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create the local run.");
      setSubmitting(false);
    }
  }

  return (
    <AppShell
      centerLabel="Launch film"
      runnerName={runner.name}
      runnerState="Selected"
      onCenterClick={() => navigate("/runs")}
      onRunnerClick={openRunner}
      className="home-shell"
    >
      <main className="home-main">
        <section className="home-intro" aria-labelledby="home-title">
          <p className="eyebrow">Local production runner</p>
          <h1 id="home-title">What should we make?</h1>
          <p>Describe the finished film. The Director builds the story, routes approved tools, and returns only evidence-backed output.</p>
          <div className="home-route-preview" aria-label="Director production lanes">
            <span>Character</span><i />
            <span>Voice</span><i />
            <span>Licensed clips</span><i />
            <span>AI shots</span><i />
            <span>Blender</span>
          </div>
        </section>

        <form className="composer glass-surface" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="outcome">Desired video outcome</label>
          <textarea
            id="outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            placeholder="Describe the film, sources, website tools, and result you want…"
            rows={4}
          />
          {sources.length > 0 && (
            <div className="source-chips" aria-label="Local sources">
              {sources.slice(0, 3).map((source) => (
                <button
                  type="button"
                  key={source.id}
                  onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))}
                  aria-label={`Remove ${source.name}`}
                >
                  <span>{source.name}</span><X size={13} aria-hidden="true" />
                </button>
              ))}
              {sources.length > 3 && <span>+{sources.length - 3}</span>}
            </div>
          )}
          <div className="composer-controls">
            <button type="button" className="composer-action" onClick={() => setSourceSheet(true)}>
              <Paperclip size={21} strokeWidth={1.7} />
              <span>Add source</span>
            </button>
            <span className="composer-divider" />
            <button type="button" className="composer-action" onClick={openRunner}>
              <UserRound size={21} strokeWidth={1.7} />
              <span>{runner.name}</span>
            </button>
            <span className="composer-divider" />
            <button type="button" className="composer-action" onClick={() => setModeSheet(true)}>
              <SlidersHorizontal size={21} strokeWidth={1.7} />
              <span>{mode}</span>
            </button>
            <button className="submit-orb" type="submit" disabled={submitting || outcome.trim().length < 3} aria-label="Build project plan">
              <ArrowRight size={29} strokeWidth={1.7} />
            </button>
          </div>
        </form>

        <div className="local-ready" aria-live="polite">
          <p><CheckCircle2 size={22} strokeWidth={1.55} /> Production kernel ready · Local UI healthy</p>
          <span className="mode-summary"><ShieldCheck size={16} aria-hidden="true" /><strong>{mode}</strong> · {mode === "Guided"
            ? "review the Director plan before production continues"
            : "continue through low-risk local steps after brief approval"}</span>
          <span>Both modes stop for login, consent, upload, spend, publishing, and destructive actions.</span>
          <span>{window.location.host} · {runner.control.mode === "live" ? `${runner.name} live adapter selected` : runner.control.mode === "handoff" ? `${runner.name} folder handoff selected` : "Built-in planning runner selected"} · secrets stay outside project files</span>
          {error && <strong className="inline-error">{error}</strong>}
        </div>
      </main>

      <CornerNav
        left={{ label: "Recent runs", onClick: () => navigate("/runs") }}
        right={{ label: "Artifacts", onClick: () => navigate("/artifacts") }}
      />

      <SourceSheet open={sourceSheet} onClose={() => setSourceSheet(false)} onAdded={(added) => setSources((current) => {
        const combined = new Map(current.map((source) => [source.id, source]));
        for (const source of added) combined.set(source.id, source);
        return [...combined.values()];
      })} />
      <ModeSheet open={modeSheet} mode={mode} onClose={() => setModeSheet(false)} onChange={(next) => {
        setMode(next);
        setModeSheet(false);
      }} />
    </AppShell>
  );
}
