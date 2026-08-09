import { describe, expect, it } from "vitest";
import { createDirectorPlan } from "../server/director.mjs";
import { projectProductionCockpit } from "../server/cockpit-projection.mjs";

function fixture() {
  const directorPlan = createDirectorPlan({
    outcome: "Create a 30-second premium vertical app film with one real character, licensed clips, Gemini shots, authentic app capture and a Blender phone mockup.",
    mode: "Autonomous"
  });
  return {
    id: "run-live",
    title: "Aura launch film",
    outcome: "Create the launch film",
    condition: "active",
    currentPhaseId: "storyboard",
    currentTask: "Locking character continuity",
    taskDetail: "Storyboard is being inspected.",
    eventSequence: 8,
    runner: {
      runtimeId: "codex",
      name: "Codex",
      status: "connected",
      adapterId: "codex-app-server",
      sessionId: "thread-1"
    },
    runnerEvents: [
      { sequence: 1, type: "session.accepted", at: "2026-08-08T10:00:00.000Z", detail: "Codex connected" },
      { sequence: 2, type: "plan.updated", at: "2026-08-08T10:00:01.000Z", detail: "Lock the same character" },
      { sequence: 2.1, type: "message.delta", at: "2026-08-08T10:00:01.250Z", detail: "Lock" },
      { sequence: 2.2, type: "terminal.output", at: "2026-08-08T10:00:01.500Z", detail: "noisy protocol output" },
      { sequence: 2.3, type: "usage.updated", at: "2026-08-08T10:00:01.750Z", detail: "tokens" },
      { sequence: 3, type: "tool.started", at: "2026-08-08T10:00:02.000Z", itemId: "tool-1", toolName: "Gemini", shotId: "shot-001", detail: "Preparing reference frame" }
    ],
    jobs: [{
      id: "tool-1",
      shotId: "shot-001",
      adapterId: "google.gemini_omni_video",
      capability: "reference-frame",
      state: "running",
      observations: [{ state: "running", at: "2026-08-08T10:00:02.000Z", detail: "Preparing reference frame" }]
    }],
    artifacts: [],
    phaseStatus: Object.fromEntries([
      "intake", "research", "script", "storyboard", "acquisition", "capture", "audio", "edit", "preview_qa", "master", "delivery"
    ].map((id) => [id, { status: id === "intake" || id === "research" || id === "script" ? "passed" : id === "storyboard" ? "waiting" : "pending" }])),
    directorPlan
  };
}

describe("production cockpit projection", () => {
  it("projects the durable run into stages, live activity, tool truth and a same-character storyboard", () => {
    const cockpit = projectProductionCockpit(fixture());

    expect(cockpit.connection).toMatchObject({ status: "connected", label: "Codex · Connected" });
    expect(cockpit.stages.map(({ id }) => id)).toEqual([
      "plan", "script", "storyboard", "generate", "voice", "edit", "review"
    ]);
    expect(cockpit.stages.find(({ id }) => id === "storyboard")?.status).toBe("active");
    expect(cockpit.activity[0]).toMatchObject({ type: "tool.started", truthful: true });
    expect(cockpit.activity.map(({ type }) => type)).not.toEqual(expect.arrayContaining([
      "message.delta", "terminal.output", "usage.updated"
    ]));
    expect(cockpit.toolStage).toMatchObject({ status: "running", shotId: "shot-001" });

    const characterShots = cockpit.storyboard.filter(({ character }) => character.inFrame);
    expect(characterShots.length).toBeGreaterThan(1);
    expect(new Set(characterShots.map(({ character }) => character.continuityId))).toEqual(
      new Set([fixture().directorPlan.characterBible.continuityId])
    );
    expect(cockpit.storyboard.find(({ id }) => id === "shot-001")?.status).toBe("working");
    expect(cockpit.storyboard.find(({ id }) => id === "shot-001")?.source).toMatchObject({
      assigned: false,
      label: "Licensed character clip planned"
    });
    expect(cockpit.beats).toHaveLength(5);
    expect(cockpit.beats.map(({ id }) => id)).toEqual(["hook", "setup", "product", "result", "cta"]);
    expect(cockpit.beats.reduce((sum, beat) => sum + beat.shotCount, 0)).toBe(cockpit.storyboard.length);
    expect(cockpit.beats.flatMap((beat) => beat.shotIds)).toEqual(cockpit.storyboard.map((shot) => shot.id));
    expect(new Set(cockpit.beats.flatMap((beat) => beat.shotIds)).size).toBe(cockpit.storyboard.length);
    expect(cockpit.storyboard.every((shot) => shot.previewUrl === null)).toBe(true);
    expect(cockpit.continuity.status).toBe("planned-unverified");
    expect(characterShots.every(({ character }) => character.continuityStatus === "planned-unverified")).toBe(true);
  });

  it("projects a persisted four-region 26-shot plan into five compact beats", () => {
    const run = fixture();
    run.directorPlan = createDirectorPlan({
      outcome: "Create a 36.5-second vertical app film with a real character and Blender product proof."
    });
    for (const shot of run.directorPlan.shots) {
      delete shot.storyBeatId;
      if (shot.storyRegion === "human-setup") shot.storyRegion = "human-hook";
    }

    const cockpit = projectProductionCockpit(run);

    expect(cockpit.storyboard).toHaveLength(26);
    expect(cockpit.beats.map((beat) => beat.shotCount)).toEqual([4, 7, 6, 6, 3]);
    expect(cockpit.beats.flatMap((beat) => beat.shotIds)).toEqual(cockpit.storyboard.map((shot) => shot.id));
  });

  it("warns about a character mismatch instead of claiming continuity", () => {
    const run = fixture();
    run.directorPlan.shots[0].characterRefId = "different-character";
    const cockpit = projectProductionCockpit(run);

    expect(cockpit.storyboard[0].character.continuityStatus).toBe("mismatch");
    expect(cockpit.continuity.status).toBe("warning");
    expect(cockpit.continuity.mismatchedShotIds).toEqual(["shot-001"]);
  });
});
