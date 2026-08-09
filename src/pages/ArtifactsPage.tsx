import { ArrowRight, CheckCircle2, FileCheck2, FileVideo2, FolderOpen, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { CornerNav } from "../components/CornerNav";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import type { Artifact } from "../types";
import type { PageContext } from "./page-types";

export function ArtifactsPage({ runner, openRunner }: PageContext) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  useEffect(() => { api.listArtifacts().then(setArtifacts).catch(() => setArtifacts([])); }, []);

  return (
    <AppShell centerLabel="Artifacts" runnerName={runner.name} runnerState="Selected" onCenterClick={() => navigate("/")} onRunnerClick={openRunner}>
      <main className="collection-main artifact-main">
        <header className="collection-heading">
          <h1>Everything your runs created</h1>
          <p>Content-addressed candidates, approved media, and verification evidence—kept local and never promoted by an agent message alone.</p>
        </header>
        <section className="artifact-list glass-surface">
          {artifacts.map((artifact) => (
            <article className="artifact-row" key={artifact.id}>
              <div className="artifact-thumb">
                {artifact.demo && artifact.poster ? <img src={artifact.poster} alt="CutSteward sample artifact" /> : artifact.contentUrl ? <video src={artifact.contentUrl} preload="metadata" muted /> : <div className="artifact-media-placeholder"><FileCheck2 size={36} /></div>}
                <span>{artifact.demo ? "Sample" : artifact.status || "Candidate"}</span>
              </div>
              <div className="artifact-copy">
                <p className="eyebrow">{artifact.demo ? "Demonstration record" : artifact.role?.replaceAll("_", " ") || artifact.kind}</p>
                <h2>{artifact.title}</h2>
                <span>{artifact.duration} · {artifact.dimensions} · {artifact.version}</span>
              </div>
              <div className="artifact-evidence">
                <span><CheckCircle2 size={17} /> {artifact.verification?.result === "pass" ? artifact.verification.detail : artifact.demo ? "Sample checks only" : "Verification not passed"}</span>
                <span><ShieldCheck size={17} /> {artifact.sha256 ? `SHA-256 ${artifact.sha256.slice(0, 12)}…` : "Local demonstration record"}</span>
              </div>
              <button className="primary-button compact" type="button" onClick={() => navigate(`/runs/${artifact.runId}`)}>Review <ArrowRight size={18} /></button>
            </article>
          ))}
          <div className="artifact-footer">
            <FileVideo2 size={19} />
            <span>Provider downloads enter as candidates. Hashing, full decode, independent QA, and an explicit review are required before release.</span>
          </div>
        </section>
      </main>
      <CornerNav
        left={{ label: "Recent runs", onClick: () => navigate("/runs") }}
        right={{ label: "Current production", icon: <FolderOpen size={18} />, onClick: () => navigate("/") }}
      />
    </AppShell>
  );
}
