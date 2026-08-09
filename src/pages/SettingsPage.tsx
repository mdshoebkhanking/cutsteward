import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Folder,
  MonitorCheck,
  RefreshCw,
  Shield,
  Sparkles,
  Terminal,
  Wrench
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { CornerNav } from "../components/CornerNav";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import type { BootstrapInfo, ToolInstallPlan, ToolStatus } from "../types";
import type { PageContext } from "./page-types";

export function SettingsPage({ bootstrap, runner, openRunner }: PageContext) {
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState("Run the device check for current tool evidence");
  const [portableMessage, setPortableMessage] = useState("");
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [adapters, setAdapters] = useState<NonNullable<BootstrapInfo["director"]>["adapters"]>([]);
  const [installPlan, setInstallPlan] = useState<ToolInstallPlan | null>(null);
  const [installBusy, setInstallBusy] = useState(false);
  const unavailableHermes = useMemo(
    () => bootstrap?.runtimes.find((runtime) => runtime.id === "hermes")?.status === "not-detected",
    [bootstrap]
  );
  const visibleTools = useMemo(
    () => (tools.length ? tools : bootstrap?.tools || []).filter((tool) => ["ffmpeg", "capcut-cli", "capcut", "blender"].includes(tool.id)),
    [bootstrap, tools]
  );
  const visibleAdapters = useMemo(
    () => adapters.filter((adapter) => [
      "elevenlabs.tts_alignment",
      "google.gemini_omni_video",
      "google.flow.browser",
      "stock.rights_gated",
      "blender.local_compositor"
    ].includes(adapter.id)),
    [adapters]
  );

  useEffect(() => {
    if (bootstrap?.tools) setTools(bootstrap.tools);
    if (bootstrap?.director?.adapters) setAdapters(bootstrap.director.adapters);
  }, [bootstrap]);

  async function runCheck() {
    setChecking(true);
    try {
      const [response, verifiedTools, refreshed] = await Promise.all([fetch("/api/health"), api.probeTools(), api.bootstrap()]);
      const health = await response.json();
      setTools(verifiedTools);
      setAdapters(refreshed.director?.adapters || []);
      const ready = verifiedTools.filter((tool) => tool.status === "ready").length;
      const missing = verifiedTools.filter((tool) => tool.status === "missing" || tool.status === "blocked").length;
      setCheckMessage(health.ready ? `Device check complete · ${ready} verified · ${missing} need setup` : "Local server needs attention");
    } catch {
      setCheckMessage("Could not reach the local health endpoint");
    } finally {
      setChecking(false);
    }
  }

  async function copyLocation() {
    const label = bootstrap?.storage.label || "CutSteward / Projects";
    await navigator.clipboard?.writeText(label);
    setPortableMessage("Project data label copied");
  }

  async function reviewInstall(toolId: string) {
    setInstallBusy(true);
    setPortableMessage("");
    try {
      const plan = await api.inspectToolInstall(toolId);
      setInstallPlan(plan);
      if (plan.disposition === "already-ready") setPortableMessage(`${plan.tool.name} is already verified and ready.`);
    } catch (error) {
      setPortableMessage(error instanceof Error ? error.message : "The reviewed install plan could not be loaded.");
    } finally {
      setInstallBusy(false);
    }
  }

  async function approveAndInstall() {
    if (!installPlan?.planHash || installPlan.disposition !== "approval-required" || !installPlan.execution) return;
    setInstallBusy(true);
    setPortableMessage(`Installing ${installPlan.tool.name} from the exact reviewed plan…`);
    try {
      const approval = await api.approveToolInstall(installPlan.tool.id, installPlan.planHash);
      const receipt = await api.executeToolInstall(installPlan.tool.id, installPlan.planHash, approval.approvalHash);
      setPortableMessage(receipt.ok
        ? `${installPlan.tool.name} installed and verified · receipt ${receipt.receiptId.slice(0, 8)}`
        : `${installPlan.tool.name} was not verified: ${receipt.outcome}`);
      const verifiedTools = await api.probeTools();
      setTools(verifiedTools);
      setInstallPlan(receipt.ready ? null : await api.inspectToolInstall(installPlan.tool.id));
    } catch (error) {
      setPortableMessage(error instanceof Error ? error.message : "The approved installer did not complete.");
    } finally {
      setInstallBusy(false);
    }
  }

  return (
    <AppShell centerLabel="Runner & device" runnerName={runner.name} runnerState="Selected" onCenterClick={() => navigate("/")} onRunnerClick={openRunner}>
      <main className="settings-main">
        <header className="settings-heading">
          <p className="eyebrow">Local setup</p>
          <h1>Local production workstation</h1>
          <p>CutSteward keeps project state local. Change only what this run needs.</p>
        </header>
        <section className="settings-surface glass-surface">
          <div className="setting-row">
            <span className="setting-icon runner-letter">{runner.name.slice(0, 1)}</span>
            <h2>Runner</h2>
            <div><strong>{runner.name}</strong><span>{runner.control.mode === "live" ? "Detected · each run still requires a verified session receipt" : runner.control.mode === "handoff" ? "Detected · project/API handoff" : "Built-in planning surface · no provider session"}</span></div>
            <button className="secondary-button" type="button" onClick={openRunner}>Change</button>
          </div>
          <div className="setting-row">
            <span className="setting-icon"><Folder size={29} /></span>
            <h2>Project data</h2>
            <div><strong>Stored on this device</strong><span>{bootstrap?.storage.label || "CutSteward / Projects"}</span></div>
            <button className="secondary-button" type="button" onClick={copyLocation}><Copy size={17} /> Copy location</button>
          </div>
          <div className="setting-row">
            <span className="setting-icon"><Shield size={29} /></span>
            <h2>Browser tasks</h2>
            <div><strong>Approval gates enforced</strong><span>Login, uploads, purchases, or publishing</span></div>
            <span className="policy-lock"><Shield size={15} /> Always on</span>
          </div>
          <div className="setting-row device-row">
            <span className="setting-icon"><MonitorCheck size={29} /></span>
            <h2>Device check</h2>
            <div className="device-facts">
              <span><Check size={16} /> Node compatible</span>
              <span><Check size={16} /> macOS / Windows supported</span>
              <span><Check size={16} /> Local server healthy</span>
              <span><Check size={16} /> Port selected automatically</span>
            </div>
            <button className="secondary-button" type="button" disabled={checking} onClick={runCheck}><RefreshCw size={17} className={checking ? "spin" : ""} /> Run check</button>
          </div>
          <div className="setting-row toolchain-row">
            <span className="setting-icon"><Terminal size={29} /></span>
            <h2>Production tools</h2>
            <div className="tool-status-list">
              {visibleTools.map((tool) => (
                <span className={`tool-status ${tool.status}`} key={tool.id}>
                  <i /> {tool.name.replace(" (community)", "")} · {tool.status === "ready" ? "Verified" : tool.status === "detected" ? "Detected" : tool.status === "missing" || tool.status === "blocked" ? "Setup needed" : "Optional"}
                  {tool.status === "missing" || tool.status === "blocked" || tool.status === "optional" ? (
                    <button className="tool-install-link" type="button" disabled={installBusy} onClick={() => void reviewInstall(tool.id)}>Review install</button>
                  ) : null}
                </span>
              ))}
            </div>
            <button className="secondary-button" type="button" disabled={installBusy} onClick={() => {
              const missing = visibleTools.find((tool) => ["missing", "blocked", "optional"].includes(tool.status));
              if (missing) void reviewInstall(missing.id);
              else setPortableMessage("All visible production tools are already detected; run the device check for version evidence.");
            }}>Review setup</button>
          </div>
          <div className="setting-row toolchain-row">
            <span className="setting-icon"><Sparkles size={29} /></span>
            <h2>Director adapters</h2>
            <div className="tool-status-list">
              {visibleAdapters.map((adapter) => {
                const label = {
                  "elevenlabs.tts_alignment": "ElevenLabs voice",
                  "google.gemini_omni_video": "Gemini video",
                  "google.flow.browser": "Flow browser",
                  "stock.rights_gated": "Licensed clips",
                  "blender.local_compositor": "Blender stage"
                }[adapter.id] || adapter.id;
                const verified = ["capability_verified", "generation_verified", "qa_verified"].includes(adapter.status);
                const configured = ["installed", "configured", "authenticated"].includes(adapter.status);
                return (
                  <span className={`tool-status ${verified ? "ready" : configured ? "detected" : "missing"}`} key={adapter.id}>
                    <i /> {label} · {verified ? "Verified" : configured ? "Configured · live proof pending" : "Needs setup or sign-in"}
                  </span>
                );
              })}
            </div>
            <button className="secondary-button" type="button" onClick={runCheck}>Refresh truth</button>
          </div>
          <footer className="portable-row">
            <span>Need to move this project?</span>
            <button className="primary-button compact" type="button" onClick={() => setPortableMessage("Run npm run stop, then copy the app folder without node_modules, dist, or the entire .framepilot directory. Setup recreates them. No private run data or local keys are included; move reviewed media exports separately.")}>Prepare clean app copy</button>
            <small>Private runtime and data are excluded</small>
          </footer>
        </section>
        {installPlan ? (
          <section className="install-review-card glass-surface" aria-labelledby="install-review-title">
            <span className="setting-icon"><Wrench size={27} /></span>
            <div>
              <p className="eyebrow">Reviewed tool plan</p>
              <h2 id="install-review-title">{installPlan.tool.name}</h2>
              <p>{installPlan.reason}</p>
              {installPlan.execution ? (
                <code>{[installPlan.execution.command, ...installPlan.execution.args].join(" ")}</code>
              ) : null}
              <small>
                {installPlan.disposition === "approval-required"
                  ? "Free catalogued tool · exact arguments · no shell · no elevation · one-time local approval"
                  : installPlan.disposition === "manual"
                    ? "This tool needs its official interactive installer; CutSteward will not automate it."
                    : "No executable automatic plan is available."}
              </small>
            </div>
            <div className="install-review-actions">
              <button className="text-button" type="button" disabled={installBusy} onClick={() => setInstallPlan(null)}>Close</button>
              {installPlan.documentationUrl ? (
                <a className="secondary-button" href={installPlan.documentationUrl} target="_blank" rel="noreferrer">Official setup</a>
              ) : null}
              {installPlan.disposition === "approval-required" ? (
                <button className="primary-button compact" type="button" disabled={installBusy} onClick={() => void approveAndInstall()}>
                  {installBusy ? "Installing…" : "Approve once & install"}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
        <div className="settings-status" role="status"><CheckCircle2 size={18} /> {portableMessage || checkMessage}</div>

        {unavailableHermes && (
          <aside className="recovery-card glass-surface">
            <div><Terminal size={20} /><h2>Hermes was not detected</h2></div>
            <p>The project is safe. Install or start Hermes, then run the device check. Other detected agents can use the same project/API handoff.</p>
            <div><button className="secondary-button" type="button" onClick={runCheck}>Try again</button><button className="primary-button small" type="button" onClick={openRunner}>Choose runner</button></div>
          </aside>
        )}
      </main>
      <CornerNav
        left={{ label: "Back to project", icon: <ArrowLeft size={18} />, onClick: () => navigate("/") }}
        right={{ label: "Local setup is private", icon: <Shield size={17} />, onClick: () => setPortableMessage("Loopback only · project state stays on this device") }}
      />
    </AppShell>
  );
}
