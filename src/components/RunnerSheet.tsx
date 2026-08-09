import { Check, CircleDotDashed, LoaderCircle, Plug, RotateCw, Terminal } from "lucide-react";
import { projectRuntimeConnection } from "../lib/runtime-connection";
import type { LiveSession, RuntimeStatus } from "../types";
import { Sheet } from "./Sheet";

export function RunnerSheet({
  open,
  runtimes,
  selected,
  activeRunId,
  session,
  sessionChecking,
  connectingRuntimeId,
  connectionError,
  onSelect,
  onClose,
  onDeviceSettings
}: {
  open: boolean;
  runtimes: RuntimeStatus[];
  selected: string;
  activeRunId: string | null;
  session: LiveSession | null;
  sessionChecking: boolean;
  connectingRuntimeId: string | null;
  connectionError: string;
  onSelect: (runtime: RuntimeStatus) => void | Promise<void>;
  onClose: () => void;
  onDeviceSettings: () => void;
}) {
  const visibleRuntimes = activeRunId
    ? runtimes.filter((runtime) => runtime.id !== "local-demo")
    : runtimes;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={activeRunId ? "Agent for this run" : "Default agent"}
      description={activeRunId
        ? "Connected is verified for this run. Found on this computer does not mean connected."
        : "Choose the agent for new runs. A live connection is created and verified inside each run."}
      className="runner-sheet"
      footer={<button className="text-button" type="button" onClick={onDeviceSettings}>Agent & device settings</button>}
    >
      <div className="runner-list">
        {visibleRuntimes.map((runtime) => {
          const view = projectRuntimeConnection({
            runtime,
            session,
            activeRunId,
            connectingRuntimeId,
            sessionChecking,
            selected: selected === runtime.id
          });
          const actionLabel = view.action === "connect"
            ? view.tone === "failed" ? `Reconnect ${runtime.name}` : `Connect ${runtime.name}`
            : `Use ${runtime.name}`;
          const stateLabel = view.action === "connect"
            ? view.tone === "failed" ? "Disconnected" : "Detected"
            : view.label;

          return (
            <div
              key={runtime.id}
              className={`runner-row runner-${view.tone}`}
              role="group"
              aria-label={`${runtime.name} connection`}
            >
              <span className="runner-icon" aria-hidden="true">
                {view.tone === "connected" ? <Check size={18} />
                  : view.tone === "connecting" ? <LoaderCircle className="spin" size={19} />
                    : view.tone === "missing" ? <Terminal size={18} />
                      : <CircleDotDashed size={19} />}
              </span>
              <span className="runner-copy">
                <strong>{runtime.name}</strong>
                <span>{view.detail}</span>
              </span>
              <span className="runner-state">{stateLabel}</span>
              {view.action ? (
                <button
                  className="runner-action"
                  type="button"
                  disabled={Boolean(connectingRuntimeId)}
                  onClick={() => void onSelect(runtime)}
                  aria-label={actionLabel}
                >
                  {view.action === "connect"
                    ? view.tone === "failed" ? <RotateCw size={15} /> : <Plug size={15} />
                    : null}
                  {view.action === "connect" ? view.label : "Use"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {connectionError ? <p className="runner-error" role="alert">{connectionError}</p> : null}
      <p className="sheet-note">Only a native session ID from the current run earns “Connected.” Installed agents without a direct adapter remain clearly marked as pending.</p>
    </Sheet>
  );
}
