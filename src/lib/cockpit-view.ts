import type { LiveEventType, ObservedJob, ProductionCockpit, Run } from "../types";

export type ActivityCategory =
  | "session"
  | "plan"
  | "turn"
  | "tool"
  | "approval"
  | "input"
  | "message"
  | "terminal"
  | "file"
  | "artifact"
  | "usage"
  | "production";

export interface ActivityView {
  sequence: number;
  type: LiveEventType;
  label: string;
  at: string;
  category: ActivityCategory;
  categoryLabel: string;
}

export type PlanStepStatus =
  | "planned"
  | "working"
  | "waiting"
  | "review"
  | "reported-complete"
  | "observed-complete"
  | "failed"
  | "cancelled"
  | "not-selected";

export interface PlanStepView {
  id: string;
  label: string;
  status: PlanStepStatus;
  statusLabel: string;
  detail: string;
}

export interface CockpitPlanView {
  source: "agent-report" | "director-plan" | "empty";
  title: string;
  truthCopy: string;
  steps: PlanStepView[];
}

type CockpitActivity = ProductionCockpit["activity"][number];

const activityLabels: Record<ActivityCategory, string> = {
  session: "Agent session",
  plan: "Plan",
  turn: "Agent turn",
  tool: "Tool",
  approval: "Approval",
  input: "Input needed",
  message: "Agent message",
  terminal: "Terminal output",
  file: "File change",
  artifact: "Artifact",
  usage: "Usage update",
  production: "Production update"
};

const directorStepLabels: Record<string, string> = {
  "research-rights": "Research and rights",
  "script-animatic": "Script and animatic",
  "voice-timing": "Voice audition and timing",
  "licensed-acquisition": "Licensed source acquisition",
  "ai-video-pilot": "AI video pilot",
  "authentic-ui-capture": "Authentic product capture",
  "blender-device-stage": "Product device stage",
  "edit-mix": "Frame-locked edit and mix",
  "release-qa": "Master and release QA"
};

function categoryFor(type: LiveEventType): ActivityCategory {
  if (type.startsWith("session.")) return "session";
  if (type.startsWith("plan.")) return "plan";
  if (type.startsWith("turn.")) return "turn";
  if (type.startsWith("tool.")) return "tool";
  if (type.startsWith("approval.")) return "approval";
  if (type.startsWith("input.")) return "input";
  if (type.startsWith("message.")) return "message";
  if (type === "terminal.output") return "terminal";
  if (type === "file.diff") return "file";
  if (type === "artifact.staged") return "artifact";
  if (type === "usage.updated") return "usage";
  return "production";
}

export function projectActivityEntries(activity: ProductionCockpit["activity"]): ActivityView[] {
  return activity.map((entry) => {
    const category = categoryFor(entry.type);
    return {
      sequence: entry.sequence,
      type: entry.type,
      label: entry.label,
      at: entry.at,
      category,
      categoryLabel: activityLabels[category]
    };
  });
}

function agentStatus(status: unknown): Pick<PlanStepView, "status" | "statusLabel"> {
  const normalized = String(status || "pending").toLowerCase().replaceAll("_", "-");
  if (["in-progress", "working", "active", "running"].includes(normalized)) {
    return { status: "working", statusLabel: "Agent reports working" };
  }
  if (["complete", "completed", "done"].includes(normalized)) {
    return { status: "reported-complete", statusLabel: "Agent reports complete" };
  }
  if (["failed", "error"].includes(normalized)) return { status: "failed", statusLabel: "Agent reports failed" };
  if (["waiting", "blocked"].includes(normalized)) return { status: "waiting", statusLabel: "Agent reports waiting" };
  return { status: "planned", statusLabel: "Agent reports planned" };
}

function reportedPlan(activity: CockpitActivity[]) {
  for (const entry of activity) {
    if (entry.type !== "plan.updated" || !Array.isArray(entry.plan)) continue;
    const steps = entry.plan.flatMap((candidate, index): PlanStepView[] => {
      if (!candidate || typeof candidate !== "object") return [];
      const raw = candidate as { step?: unknown; status?: unknown };
      const label = typeof raw.step === "string" ? raw.step.trim() : "";
      if (!label) return [];
      const status = agentStatus(raw.status);
      return [{
        id: `agent-step-${index + 1}`,
        label,
        ...status,
        detail: "Status is reported by the agent plan event, not provider or artifact verification."
      }];
    });
    return { observed: true as const, steps };
  }
  return { observed: false as const, steps: [] };
}

function observedDirectorStatus(job: ObservedJob | undefined): Pick<PlanStepView, "status" | "statusLabel"> {
  if (!job || job.state === "planned") return { status: "planned", statusLabel: "Planned only" };
  if (job.state === "waiting_approval") return { status: "waiting", statusLabel: "Waiting for approval" };
  if (["submitting", "accepted", "running", "reconciling"].includes(job.state)) {
    return { status: "working", statusLabel: "Observed in progress" };
  }
  if (job.state === "outputs_staged") return { status: "review", statusLabel: "Observed output needs review" };
  if (job.state === "verified_output") return { status: "observed-complete", statusLabel: "Verified output observed" };
  if (job.state === "failed") return { status: "failed", statusLabel: "Observed failure" };
  if (job.state === "unknown") return { status: "waiting", statusLabel: "Outcome unknown" };
  return { status: "cancelled", statusLabel: "Cancelled" };
}

function humanizeStepId(id: string) {
  return directorStepLabels[id] || id.replaceAll("-", " ").replace(/^./, (value) => value.toUpperCase());
}

export function projectCockpitPlan(run: Run, activity: ProductionCockpit["activity"]): CockpitPlanView {
  const agentPlan = reportedPlan(activity);
  if (agentPlan.observed) {
    return {
      source: "agent-report",
      title: "Agent plan",
      truthCopy: agentPlan.steps.length
        ? "Latest plan reported by the live agent. Reported status is not provider, media, or QA evidence."
        : "The live agent reported an empty plan. No execution step is inferred.",
      steps: agentPlan.steps
    };
  }

  const directorJobs = run.directorPlan?.execution.jobs;
  if (!directorJobs) {
    return {
      source: "empty",
      title: "No plan observed",
      truthCopy: "A Director route or live agent plan will appear here when one is recorded.",
      steps: []
    };
  }

  const observedById = new Map((run.jobs || []).map((job) => [job.id, job]));
  return {
    source: "director-plan",
    title: "Director plan",
    truthCopy: "No agent-authored plan has been observed. These are brief-driven planned steps; planned does not mean started or available.",
    steps: directorJobs.map((job) => {
      if (!job.selected) {
        return {
          id: job.id,
          label: humanizeStepId(job.id),
          status: "not-selected",
          statusLabel: "Not selected",
          detail: "This optional route is outside the current brief."
        };
      }
      const observed = observedById.get(job.id);
      const status = observedDirectorStatus(observed);
      const lastObservation = observed?.observations.at(-1)?.detail;
      return {
        id: job.id,
        label: humanizeStepId(job.id),
        ...status,
        detail: lastObservation || (job.approvalIds.length
          ? `${job.approvalIds.length} approval ${job.approvalIds.length === 1 ? "boundary" : "boundaries"} remain attached to this step.`
          : "Local planned step; no execution evidence has been recorded.")
      };
    })
  };
}
