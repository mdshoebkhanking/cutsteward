import type { LiveSession, RuntimeStatus } from "../types";

export type RuntimeConnectionTone =
  | "connected"
  | "connecting"
  | "available"
  | "detected"
  | "pending"
  | "missing"
  | "demo"
  | "failed";

export interface RuntimeConnectionView {
  label: string;
  detail: string;
  tone: RuntimeConnectionTone;
  action: "connect" | "select" | null;
}

export function projectRuntimeConnection({
  runtime,
  session,
  activeRunId,
  connectingRuntimeId,
  sessionChecking,
  selected
}: {
  runtime: RuntimeStatus;
  session: LiveSession | null;
  activeRunId: string | null;
  connectingRuntimeId: string | null;
  sessionChecking?: boolean;
  selected: boolean;
}): RuntimeConnectionView {
  const activeRun = Boolean(activeRunId);
  const liveAdapter = runtime.control.mode === "live" && runtime.control.state === "ready";
  const sessionMatches = Boolean(
    activeRunId
    && session?.runId === activeRunId
    && session.runtimeId === runtime.id
  );

  if (runtime.status === "not-detected") {
    return {
      label: "Not found",
      detail: "Not found on this computer.",
      tone: "missing",
      action: null
    };
  }

  if (runtime.id === "local-demo") {
    return {
      label: activeRun ? "Demo only" : selected ? "Selected" : "Demo",
      detail: runtime.detail,
      tone: "demo",
      action: activeRun || selected ? null : "select"
    };
  }

  if (sessionMatches && session?.status === "connected" && session.sessionId) {
    const runtimeDetail = [session.protocol, session.model].filter(Boolean).join(" · ");
    return {
      label: "Connected",
      detail: runtimeDetail ? `Live session · ${runtimeDetail}` : "Live per-run session verified.",
      tone: "connected",
      action: null
    };
  }

  if (connectingRuntimeId === runtime.id || sessionMatches && session?.status === "connecting" || activeRun && liveAdapter && sessionChecking) {
    return {
      label: sessionChecking && connectingRuntimeId !== runtime.id ? "Checking" : "Connecting",
      detail: sessionChecking && connectingRuntimeId !== runtime.id
        ? "Checking this run's verified session record…"
        : "Starting the local adapter and waiting for a real session receipt…",
      tone: "connecting",
      action: null
    };
  }

  if (sessionMatches && ["failed", "disconnected", "closed"].includes(session?.status || "") && liveAdapter) {
    return {
      label: "Retry",
      detail: session?.lastError || "The previous live session ended. Start a new verified session.",
      tone: "failed",
      action: "connect"
    };
  }

  if (activeRun) {
    if (liveAdapter) {
      return {
        label: "Connect",
        detail: "Live adapter detected for this run. A real session receipt is required before CutSteward calls it connected.",
        tone: "available",
        action: "connect"
      };
    }
    return {
      label: "Adapter pending",
      detail: "Detected locally, but direct control is not implemented in this build yet.",
      tone: "pending",
      action: null
    };
  }

  return {
    label: selected ? "Selected" : "Detected",
    detail: runtime.detail,
    tone: liveAdapter ? "available" : "detected",
    action: selected ? null : "select"
  };
}
