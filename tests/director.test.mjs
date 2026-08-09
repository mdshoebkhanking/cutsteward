import { describe, expect, it } from "vitest";
import { createDirectorPlan, inspectDirectorCapabilities } from "../server/director.mjs";

describe("Autopilot Director compiler", () => {
  it("builds a duration-adaptive five-beat shot plan without a frame gap or overlap", () => {
    const plan = createDirectorPlan({
      outcome: "Create a 30-second premium vertical app film with a real character, licensed clips, AI shots and a Blender phone mockup.",
      mode: "Autonomous"
    });

    expect(plan.shots).toHaveLength(22);
    expect(plan.shots[0].frameRange.start).toBe(0);
    expect(plan.shots.at(-1).frameRange.end).toBe(plan.target.totalFrames);
    for (let index = 0; index < plan.shots.length; index += 1) {
      const current = plan.shots[index];
      expect(current.frameRange.end).toBeGreaterThan(current.frameRange.start);
      expect(current.primarySourceLaneId).toMatch(/^(licensed-clips|ai-video|blender-mockup)$/);
      expect(current.storyBeatId).toMatch(/^(hook|setup|product|result|cta)$/);
      if (index > 0) expect(current.frameRange.start).toBe(plan.shots[index - 1].frameRange.end);
    }
    expect(new Set(plan.shots.map((shot) => shot.storyBeatId))).toEqual(new Set(["hook", "setup", "product", "result", "cta"]));
    expect(plan.shots.at(-1).durationSeconds).toBeGreaterThanOrEqual(3);
    expect(plan.execution.jobs.map((job) => job.id)).toEqual([
      "research-rights",
      "script-animatic",
      "provider-requests",
      "voice-timing",
      "licensed-acquisition",
      "ai-video-pilot",
      "authentic-ui-capture",
      "blender-device-stage",
      "edit-mix",
      "release-qa"
    ]);
    expect(plan.execution.jobs.find((job) => job.id === "blender-device-stage")).toMatchObject({
      adapterCandidates: ["blender.local_compositor", "local.2_5d_device_compositor"],
      dependsOn: ["authentic-ui-capture"]
    });
  });

  it("uses more micro-shots for longer films while keeping the five story beats", () => {
    const plans = [15, 30, 36.5, 60].map((duration) => createDirectorPlan({
      outcome: `Create a ${duration}-second vertical app film with a real character and Blender product proof.`
    }));

    expect(plans.map((plan) => plan.shots.length)).toEqual([12, 22, 26, 38]);
    for (const plan of plans) {
      expect(new Set(plan.shots.map((shot) => shot.storyBeatId))).toEqual(new Set(["hook", "setup", "product", "result", "cta"]));
      expect(plan.shots[0].frameRange.start).toBe(0);
      expect(plan.shots.at(-1).frameRange.end).toBe(plan.target.totalFrames);
    }
  });

  it("keeps AI picture generation conditional and never treats an avatar as a real photographed character", () => {
    const realOnly = createDirectorPlan({
      outcome: "Create a 30-second vertical film with a real photographed character, licensed footage, authentic app capture and Blender phone shots."
    });
    const withAi = createDirectorPlan({
      outcome: "Create a 30-second vertical film with a licensed real character plus Gemini and Flow AI environment shots."
    });

    expect(realOnly.shots.some((shot) => shot.primarySourceLaneId === "ai-video")).toBe(false);
    expect(withAi.shots.some((shot) => shot.primarySourceLaneId === "ai-video")).toBe(true);
    expect(realOnly.lanes.find((lane) => lane.id === "character").preferredAdapters)
      .not.toEqual(expect.arrayContaining(["heygen.avatar_v3", "tavus.replica_v2"]));
  });

  it("routes an explicit real-voice brief to a consented human performance", () => {
    const plan = createDirectorPlan({
      outcome: "Make a 20-second product film with a real voice, authentic screen recording and Blender mockup."
    });

    expect(plan.voiceDirection).toMatchObject({
      voiceClass: "consented-human-performance",
      primaryAdapterId: "consented-human-recording"
    });
    expect(plan.voiceDirection.fallbackAdapterIds).not.toEqual(expect.arrayContaining([
      "elevenlabs.tts_alignment",
      "azure.dragon_hd_omni"
    ]));
  });

  it("never reports an optional missing local tool as installed", () => {
    const capabilities = inspectDirectorCapabilities({
      tools: [
        { id: "blender", status: "optional", location: null, probe: { checked: false, ok: false } },
        { id: "ffmpeg", status: "detected", location: "/local/ffmpeg", probe: { checked: false, ok: false } }
      ],
      environment: {}
    });

    expect(capabilities.find((adapter) => adapter.id === "blender.local_compositor")?.status)
      .toBe("unavailable");
    expect(capabilities.find((adapter) => adapter.id === "ffmpeg.local_edit_qa")?.status)
      .toBe("installed");
  });
});
