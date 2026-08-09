import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStore } from "../server/store.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryStore() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "framepilot-store-"));
  temporaryDirectories.push(directory);
  const store = createStore(directory);
  await store.ensure();
  return store;
}

describe("local run store", () => {
  it("seeds truthful local demonstration states", async () => {
    const store = await temporaryStore();
    const runs = await store.listRuns();
    expect(runs.length).toBeGreaterThanOrEqual(4);
    expect(runs.every((run) => run.demo === true)).toBe(true);
    expect((await store.getArtifact("launch-film-final"))?.demo).toBe(true);
  });

  it("migrates the retired sample poster without changing non-demo artifacts", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "framepilot-store-migration-"));
    temporaryDirectories.push(directory);
    const store = createStore(directory);
    await store.ensure();
    const statePath = path.join(directory, "state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    state.artifacts[0].poster = "/assets/watch-poster.png";
    state.artifacts.push({
      id: "private-reference",
      demo: false,
      poster: "/assets/watch-poster.png"
    });
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);

    await store.ensure();

    const migrated = JSON.parse(await readFile(statePath, "utf8"));
    expect(migrated.artifacts[0].poster).toBe("/assets/verified-film-poster.svg");
    expect(migrated.artifacts.at(-1).poster).toBe("/assets/watch-poster.png");
  });

  it("persists a supervised run state machine", async () => {
    const store = await temporaryStore();
    const created = await store.createRun({ outcome: "Make a careful product film", mode: "Guided" });
    expect(created.state).toBe("preflight");

    const awaiting = await store.actOnRun(created.id, "approve-plan");
    expect(awaiting.state).toBe("needs_approval");
    expect(awaiting.notice).toContain("No external work ran");

    const review = await store.actOnRun(created.id, "allow-once");
    expect(review.state).toBe("review_ready");
    expect(review.notice).toContain("without uploading");

    const completed = await store.actOnRun(created.id, "approve-final");
    expect(completed.state).toBe("completed");
    expect(completed.notice).toContain("Nothing was published");
  });

  it("stores chat instructions without pretending to execute them", async () => {
    const store = await temporaryStore();
    const created = await store.createRun({ outcome: "Make a short tutorial", mode: "Guided" });
    const result = await store.addMessage(created.id, "Make the opening faster");
    expect(result.messages.map((message) => message.role)).toEqual(["user", "assistant", "event"]);
    expect(result.messages[1].content).toContain("cannot change media");
    expect((await store.listMessages(created.id))).toHaveLength(3);
  });

  it("rejects actions that bypass supervised state gates", async () => {
    const store = await temporaryStore();
    const created = await store.createRun({ outcome: "Do not skip review", mode: "Guided" });
    await expect(store.actOnRun(created.id, "approve-final")).rejects.toMatchObject({ statusCode: 409 });
    expect((await store.getRun(created.id)).state).toBe("preflight");
    await store.actOnRun(created.id, "approve-plan");
    await expect(store.actOnRun(created.id, "approve-final")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("binds only registered content-addressed sources to a run", async () => {
    const store = await temporaryStore();
    const source = await store.registerSource({
      id: "source-abc",
      kind: "file",
      name: "clip.mp4",
      sha256: "abc",
      localOnly: true
    });
    const run = await store.createRun({ outcome: "Use my approved clip", mode: "Guided", sourceIds: [source.id] });
    expect(run.sourceIds).toEqual([source.id]);
    const attached = await store.attachSources(run.id, [source.id]);
    expect(attached.sourceIds).toEqual([source.id]);
    await expect(store.attachSources(run.id, ["source-missing"])).rejects.toMatchObject({ statusCode: 422 });
  });
});
