import { describe, expect, it } from "vitest";
import { projectActivityEntries, projectCockpitPlan } from "../src/lib/cockpit-view";
import type { DirectorPlan, ProductionCockpit, Run } from "../src/types";

function run(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-one",
    title: "Launch film",
    outcome: "Create a truthful launch film",
    runnerId: "codex",
    runnerName: "Codex",
    mode: "Guided",
    state: "active",
    phase: "Storyboard",
    progress: 1,
    total: 11,
    elapsed: "00:01",
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:00:01.000Z",
    demo: false,
    artifactId: null,
    notice: "Waiting for evidence",
    ...overrides
  };
}

function activity(entries: Array<Partial<ProductionCockpit["activity"][number]>>) {
  return entries.map((entry, index) => ({
    sequence: index + 1,
    type: "turn.started" as const,
    at: "2026-08-08T10:00:00.000Z",
    label: "Observed event",
    truthful: true as const,
    ...entry
  }));
}

describe("cockpit frontend projection", () => {
  it("keeps all visible activity categories distinct", () => {
    const projected = projectActivityEntries(activity([
      { type: "session.connected" },
      { type: "plan.updated" },
      { type: "turn.started" },
      { type: "tool.started" },
      { type: "approval.requested" },
      { type: "input.requested" },
      { type: "message.completed" },
      { type: "terminal.output" },
      { type: "file.diff" },
      { type: "artifact.staged" },
      { type: "usage.updated" }
    ]));

    expect(projected.map(({ category }) => category)).toEqual([
      "session", "plan", "turn", "tool", "approval", "input", "message", "terminal", "file", "artifact", "usage"
    ]);
  });

  it("labels a live agent plan as reported rather than verified", () => {
    const plan = projectCockpitPlan(run(), activity([{
      type: "plan.updated",
      plan: [
        { step: "Lock the storyboard", status: "in_progress" },
        { step: "Review the master", status: "completed" }
      ]
    }]));

    expect(plan.source).toBe("agent-report");
    expect(plan.steps.map(({ statusLabel }) => statusLabel)).toEqual([
      "Agent reports working", "Agent reports complete"
    ]);
    expect(plan.truthCopy).toContain("not provider, media, or QA evidence");
  });

  it("shows the complete Director route as planned when no agent plan was observed", () => {
    const directorPlan = {
      execution: {
        jobs: [
          { id: "research-rights", selected: true, approvalIds: ["brief-rights"] },
          { id: "ai-video-pilot", selected: false, approvalIds: ["provider-upload", "generation-spend"] },
          { id: "release-qa", selected: true, approvalIds: [] }
        ]
      }
    } as DirectorPlan;
    const plan = projectCockpitPlan(run({
      directorPlan,
      jobs: [{
        id: "release-qa",
        shotId: null,
        adapterId: "ffmpeg.local",
        capability: "qa",
        state: "verified_output",
        externalReceipt: null,
        observations: [{ state: "verified_output", at: "2026-08-08T10:01:00.000Z", detail: "Hash-bound QA observed" }]
      }]
    }), []);

    expect(plan.source).toBe("director-plan");
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps.map(({ status }) => status)).toEqual(["planned", "not-selected", "observed-complete"]);
    expect(plan.truthCopy).toContain("planned does not mean started or available");
  });
});
