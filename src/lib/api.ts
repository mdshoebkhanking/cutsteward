import type {
  Artifact,
  BootstrapInfo,
  ChatMessage,
  CockpitResponse,
  ExecutionResponse,
  LiveEvent,
  LiveEventType,
  LiveSession,
  ProviderActionResponse,
  Run,
  SourceReference,
  SupervisedBrowserMutationResponse,
  SupervisedBrowserStatusResponse,
  ToolInstallPlan,
  ToolInstallReceipt,
  ToolStatus
} from "../types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function localFetch(url: string, options?: RequestInit): Promise<Response> {
  const requestOptions: RequestInit = {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers
    }
  };
  let response = await fetch(url, requestOptions);
  const method = String(options?.method || "GET").toUpperCase();
  if (response.status === 401 && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const bootstrap = await fetch("/api/bootstrap", { credentials: "same-origin" });
    if (bootstrap.ok) response = await fetch(url, requestOptions);
  }
  return response;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await localFetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload.detail || payload.title || "Local request failed", response.status);
  }
  return payload;
}

const liveEventTypes: LiveEventType[] = [
  "session.accepted", "session.connected", "session.disconnected", "session.failed", "session.closed",
  "turn.accepted", "turn.started", "turn.completed", "turn.failed", "turn.interrupted",
  "message.delta", "message.completed", "plan.updated", "tool.started", "tool.completed",
  "terminal.output", "file.diff", "approval.requested", "approval.resolved", "input.requested",
  "usage.updated", "artifact.staged"
];

export const api = {
  bootstrap: () => request<BootstrapInfo>("/api/bootstrap"),
  probeTools: async () => (
    await request<{ tools: ToolStatus[] }>("/api/tools/probe", { method: "POST" })
  ).tools,
  inspectToolInstall: async (toolId: string) => (
    await request<{ plan: ToolInstallPlan }>(`/api/tools/install/${encodeURIComponent(toolId)}`)
  ).plan,
  approveToolInstall: async (toolId: string, planHash: string) => (
    await request<{ approval: { approvalHash: string; planHash: string; expiresAt: number } }>(`/api/tools/install/${encodeURIComponent(toolId)}`, {
      method: "POST",
      body: JSON.stringify({ action: "approve", planHash, confirmed: true })
    })
  ).approval,
  executeToolInstall: async (toolId: string, planHash: string, approvalHash: string) => (
    await request<{ receipt: ToolInstallReceipt }>(`/api/tools/install/${encodeURIComponent(toolId)}`, {
      method: "POST",
      body: JSON.stringify({ action: "execute", planHash, approvalHash })
    })
  ).receipt,
  listRuns: async () => (await request<{ runs: Run[] }>("/api/runs")).runs,
  getRun: async (id: string) => (await request<{ run: Run }>(`/api/runs/${encodeURIComponent(id)}`)).run,
  getCockpit: async (id: string) => request<CockpitResponse>(`/api/runs/${encodeURIComponent(id)}/cockpit`),
  getExecution: async (id: string) => request<ExecutionResponse>(`/api/runs/${encodeURIComponent(id)}/execution`),
  mutateExecution: async (
    id: string,
    command:
      | { operation: "materialize" }
      | { operation: "schedule" }
      | { operation: "stop-scheduler" }
      | { operation: "reconcile"; maxJobs?: number }
      | { operation: "cancel"; jobIds?: string[] }
  ) => request<ExecutionResponse>(`/api/runs/${encodeURIComponent(id)}/execution`, {
    method: "POST",
    body: JSON.stringify(command)
  }),
  inspectProviderAction: async (id: string, jobId: string) => request<ProviderActionResponse>(
    `/api/runs/${encodeURIComponent(id)}/provider-actions/${encodeURIComponent(jobId)}`
  ),
  approveProviderAction: async (id: string, jobId: string, actionHash: string) => request<ProviderActionResponse>(
    `/api/runs/${encodeURIComponent(id)}/provider-actions/${encodeURIComponent(jobId)}`,
    {
      method: "POST",
      body: JSON.stringify({ actionHash, confirmed: true })
    }
  ),
  getSupervisedBrowser: async (id: string) => request<SupervisedBrowserStatusResponse>(`/api/runs/${encodeURIComponent(id)}/browser`),
  startSupervisedBrowser: async (id: string, profileId: string) => request<SupervisedBrowserMutationResponse>(`/api/runs/${encodeURIComponent(id)}/browser`, {
    method: "POST",
    body: JSON.stringify({ operation: "start", profileId })
  }),
  navigateSupervisedBrowser: async (id: string, url: string) => request<SupervisedBrowserMutationResponse>(`/api/runs/${encodeURIComponent(id)}/browser`, {
    method: "POST",
    body: JSON.stringify({ operation: "act", action: { kind: "navigate", url } })
  }),
  snapshotSupervisedBrowser: async (id: string) => request<SupervisedBrowserMutationResponse>(`/api/runs/${encodeURIComponent(id)}/browser`, {
    method: "POST",
    body: JSON.stringify({ operation: "act", action: { kind: "snapshot" } })
  }),
  closeSupervisedBrowser: async (id: string) => request<SupervisedBrowserMutationResponse>(`/api/runs/${encodeURIComponent(id)}/browser`, {
    method: "POST",
    body: JSON.stringify({ operation: "close" })
  }),
  getLiveSession: async (id: string) => (
    await request<{ session: LiveSession | null }>(`/api/runs/${encodeURIComponent(id)}/session`)
  ).session,
  liveCommand: async (id: string, command: Record<string, unknown>) => request<{
    receipt: Record<string, unknown>;
    session: LiveSession | null;
  }>(`/api/runs/${encodeURIComponent(id)}/session/commands`, {
    method: "POST",
    body: JSON.stringify({ command })
  }),
  subscribeLiveEvents: (
    id: string,
    afterSequence: number,
    onEvent: (event: LiveEvent) => void,
    onConnection: (state: "connected" | "reconnecting") => void
  ) => {
    const source = new EventSource(`/api/runs/${encodeURIComponent(id)}/session/events?after=${Math.max(0, afterSequence)}`);
    let cursor = Math.max(0, afterSequence);
    const listener = (raw: Event) => {
      const message = raw as MessageEvent<string>;
      try {
        const event = JSON.parse(message.data) as LiveEvent;
        if (event.sequence <= cursor) return;
        cursor = event.sequence;
        onEvent(event);
      } catch {
        // Ignore malformed browser events; the durable server journal remains authoritative.
      }
    };
    for (const type of liveEventTypes) source.addEventListener(type, listener);
    source.onopen = () => onConnection("connected");
    source.onerror = () => onConnection("reconnecting");
    return () => {
      for (const type of liveEventTypes) source.removeEventListener(type, listener);
      source.close();
    };
  },
  addSourceFile: async (file: File) => {
    const response = await localFetch("/api/sources", {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-FramePilot-Filename": encodeURIComponent(file.name)
      },
      body: file
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(payload.detail || "Could not store the local source.", response.status);
    return (payload as { source: SourceReference }).source;
  },
  addSourceUrl: async (url: string) => (
    await request<{ source: SourceReference }>("/api/sources/url", {
      method: "POST",
      body: JSON.stringify({ url })
    })
  ).source,
  listSources: async () => (
    await request<{ sources: SourceReference[] }>("/api/sources")
  ).sources,
  createRun: async (outcome: string, mode: string, sourceIds: string[] = [], runnerId?: string) => (
    await request<{ run: Run }>("/api/runs", {
      method: "POST",
      body: JSON.stringify({ outcome, mode, sourceIds, runnerId })
    })
  ).run,
  actOnRun: async (id: string, action: string, input: Record<string, unknown> = {}) => (
    await request<{ run: Run }>(`/api/runs/${encodeURIComponent(id)}/actions`, {
      method: "POST",
      body: JSON.stringify({ action, ...input })
    })
  ).run,
  attachSources: async (id: string, sourceIds: string[]) => (
    await request<{ run: Run }>(`/api/runs/${encodeURIComponent(id)}/sources`, {
      method: "POST",
      body: JSON.stringify({ sourceIds })
    })
  ).run,
  listArtifacts: async () => (
    await request<{ artifacts: Artifact[] }>("/api/artifacts")
  ).artifacts,
  getArtifact: async (id: string) => (
    await request<{ artifact: Artifact }>(`/api/artifacts/${encodeURIComponent(id)}`)
  ).artifact,
  listMessages: async (runId: string) => (
    await request<{ messages: ChatMessage[] }>(`/api/runs/${encodeURIComponent(runId)}/messages`)
  ).messages,
  sendMessage: async (runId: string, content: string) => (
    await request<{
      messages: ChatMessage[];
      run: Run;
      liveDispatch?: {
        accepted: boolean;
        status: string;
        receipt?: Record<string, unknown>;
        error?: { code: string; message: string };
      };
    }>(`/api/runs/${encodeURIComponent(runId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ content })
    })
  )
};
