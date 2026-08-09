import { RunPage } from "./RunPage";
import type { PageContext } from "./page-types";

/**
 * Deprecated compatibility entry point for local extensions.
 * Canonical run workspaces are routed through `/runs/:id`.
 */
export function StudioPage({ runId, ...context }: PageContext & { runId: string }) {
  return <RunPage {...context} runId={runId} />;
}
