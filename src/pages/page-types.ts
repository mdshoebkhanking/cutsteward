import type { BootstrapInfo, LiveSession, RuntimeStatus } from "../types";

export interface PageContext {
  bootstrap: BootstrapInfo | null;
  runner: RuntimeStatus;
  openRunner: () => void;
  onLiveSessionChange: (session: LiveSession | null) => void;
}
