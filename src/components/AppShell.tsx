import { ChevronDown, MoreHorizontal } from "lucide-react";
import type { PropsWithChildren } from "react";
import { Brand } from "./Brand";

interface AppShellProps extends PropsWithChildren {
  centerLabel: string;
  runnerName?: string;
  runnerState?: "Selected" | "Connected" | "Working" | "Needs you" | "Paused" | "Complete" | "Detected";
  onCenterClick?: () => void;
  onRunnerClick?: () => void;
  className?: string;
}

export function AppShell({
  centerLabel,
  runnerName = "Local demo",
  runnerState = "Selected",
  onCenterClick,
  onRunnerClick,
  className = "",
  children
}: AppShellProps) {
  return (
    <div className={`app-shell ${className}`}>
      <header className="topbar">
        <Brand />
        <button className="glass-pill project-pill" type="button" onClick={onCenterClick}>
          <span>{centerLabel}</span>
          <ChevronDown size={18} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <button className="glass-pill runner-pill" type="button" onClick={onRunnerClick} aria-label={`${runnerName}, ${runnerState}. Open agent connections.`}>
          <span className="runner-avatar" aria-hidden="true">{runnerName.slice(0, 1)}</span>
          <span className="runner-label">{runnerName} · {runnerState}</span>
          <span className={`status-dot status-${runnerState.toLowerCase().replace(" ", "-")}`} aria-hidden="true" />
          <MoreHorizontal size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </header>
      {children}
    </div>
  );
}
