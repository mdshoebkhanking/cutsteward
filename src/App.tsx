import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RunnerSheet } from "./components/RunnerSheet";
import { api } from "./lib/api";
import { navigate, resolveAppRoute, usePathname } from "./lib/router";
import { ArtifactsPage } from "./pages/ArtifactsPage";
import { HomePage } from "./pages/HomePage";
import { RunPage } from "./pages/RunPage";
import { RunsPage } from "./pages/RunsPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { BootstrapInfo, LiveSession, RuntimeStatus } from "./types";

const localFallback: RuntimeStatus = {
  id: "local-demo",
  name: "Local demo",
  status: "ready",
  presence: "built-in",
  control: {
    mode: "demo",
    state: "ready",
    adapterId: "built-in-demo",
    protocol: "local",
    reason: null
  },
  executable: null,
  integration: "built-in-demo",
  preferredAdapter: "built-in-demo",
  stability: "local-only",
  capabilitiesToProbe: [],
  detail: "UI-only sample. It never contacts a provider or uploads a file."
};

export default function App() {
  const pathname = usePathname();
  const route = useMemo(() => resolveAppRoute(pathname), [pathname]);
  const activeRunId = route.kind === "run" ? route.runId : null;
  const activeRunIdRef = useRef(activeRunId);
  activeRunIdRef.current = activeRunId;
  const [bootstrap, setBootstrap] = useState<BootstrapInfo | null>(null);
  const [runner, setRunner] = useState<RuntimeStatus>(localFallback);
  const [runnerSheet, setRunnerSheet] = useState(false);
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
  const [sessionCheckedRunId, setSessionCheckedRunId] = useState<string | null>(null);
  const [connectingRuntimeId, setConnectingRuntimeId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState("");

  useEffect(() => {
    api.bootstrap().then((next) => {
      setBootstrap(next);
      setRunner(
        next.runtimes.find((runtime) => runtime.id === "codex" && runtime.status === "detected")
        || next.runtimes.find((runtime) => runtime.status === "detected")
        || next.runtimes.find((runtime) => runtime.id === "local-demo")
        || localFallback
      );
    }).catch(() => setBootstrap(null));
  }, []);

  const refreshLiveSession = useCallback(async (runId: string) => {
    try {
      const next = await api.getLiveSession(runId);
      if (activeRunIdRef.current !== runId) return next;
      setLiveSession(next);
      setSessionCheckedRunId(runId);
      return next;
    } catch (nextError) {
      if (activeRunIdRef.current !== runId) throw nextError;
      setSessionCheckedRunId(runId);
      throw nextError;
    }
  }, []);

  useEffect(() => {
    setConnectionError("");
    setConnectingRuntimeId(null);
    if (!activeRunId) {
      setLiveSession(null);
      setSessionCheckedRunId(null);
      return;
    }
    let active = true;
    setSessionCheckedRunId(null);
    api.getLiveSession(activeRunId).then((next) => {
      if (!active) return;
      setLiveSession(next);
      setSessionCheckedRunId(activeRunId);
    }).catch((nextError) => {
      if (!active) return;
      setLiveSession(null);
      setSessionCheckedRunId(activeRunId);
      setConnectionError(nextError instanceof Error ? nextError.message : "Could not check the run's live session.");
    });
    return () => { active = false; };
  }, [activeRunId]);

  const observeLiveSession = useCallback((session: LiveSession | null) => {
    if (session && session.runId !== activeRunIdRef.current) return;
    setLiveSession(session);
    if (activeRunIdRef.current) setSessionCheckedRunId(activeRunIdRef.current);
  }, []);

  const openRunner = useCallback(() => {
    setRunnerSheet(true);
    setConnectionError("");
    if (activeRunId) {
      void refreshLiveSession(activeRunId).catch((nextError) => {
        setConnectionError(nextError instanceof Error ? nextError.message : "Could not check the run's live session.");
      });
    }
  }, [activeRunId, refreshLiveSession]);

  const selectOrConnectRuntime = useCallback(async (next: RuntimeStatus) => {
    if (!activeRunId) {
      setRunner(next);
      setRunnerSheet(false);
      return;
    }
    if (next.control.mode !== "live" || next.control.state !== "ready") return;

    setRunner(next);
    setConnectingRuntimeId(next.id);
    setConnectionError("");
    try {
      const result = await api.liveCommand(activeRunId, { kind: "connect", runtimeId: next.id });
      if (activeRunIdRef.current !== activeRunId) return;
      if (result.receipt.accepted !== true || result.session?.status !== "connected" || !result.session.sessionId) {
        throw new Error(result.session?.lastError || `${next.name} did not return a verified live session.`);
      }
      setLiveSession(result.session);
      setSessionCheckedRunId(activeRunId);
    } catch (nextError) {
      setConnectionError(nextError instanceof Error ? nextError.message : `${next.name} could not connect.`);
      await refreshLiveSession(activeRunId).catch(() => null);
    } finally {
      setConnectingRuntimeId(null);
    }
  }, [activeRunId, refreshLiveSession]);

  const shared = useMemo(() => ({
    bootstrap,
    runner,
    openRunner,
    onLiveSessionChange: observeLiveSession
  }), [bootstrap, observeLiveSession, openRunner, runner]);

  let page;
  if (route.kind === "home") page = <HomePage {...shared} />;
  else if (route.kind === "runs") page = <RunsPage {...shared} />;
  else if (route.kind === "run") page = <RunPage {...shared} runId={route.runId} />;
  else if (route.kind === "artifacts") page = <ArtifactsPage {...shared} />;
  else if (route.kind === "settings") page = <SettingsPage {...shared} />;
  else page = (
    <main className="missing-page">
      <p>That local page does not exist.</p>
      <button className="primary-button" type="button" onClick={() => navigate("/")}>Back to CutSteward</button>
    </main>
  );

  return (
    <>
      {page}
      <RunnerSheet
        open={runnerSheet}
        runtimes={bootstrap?.runtimes || [localFallback]}
        selected={runner.id}
        activeRunId={activeRunId}
        session={liveSession}
        sessionChecking={Boolean(activeRunId && sessionCheckedRunId !== activeRunId)}
        connectingRuntimeId={connectingRuntimeId}
        connectionError={connectionError}
        onSelect={selectOrConnectRuntime}
        onClose={() => setRunnerSheet(false)}
        onDeviceSettings={() => {
          setRunnerSheet(false);
          navigate("/settings");
        }}
      />
    </>
  );
}
