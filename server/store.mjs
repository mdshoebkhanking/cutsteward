import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const SCHEMA_VERSION = 1;

function createSeedState(now = new Date()) {
  const today = now.toISOString();
  const day = 24 * 60 * 60 * 1000;
  return {
    schemaVersion: SCHEMA_VERSION,
    sources: [],
    runs: [
      {
        id: "launch-film",
        title: "Launch film",
        outcome: "Create a 30-second launch film using approved product footage.",
        runnerId: "local-demo",
        runnerName: "Local demo",
        mode: "Guided",
        state: "needs_approval",
        phase: "Generate",
        progress: 2,
        total: 5,
        elapsed: "04:18",
        currentTask: "Generate missing product close-up",
        taskDetail: "Flow · Waiting for approval before upload",
        createdAt: today,
        updatedAt: today,
        demo: true,
        artifactId: "summer-campaign-final",
        notice: "Sample state only. No provider has received this file."
      },
      {
        id: "summer-campaign",
        title: "Summer campaign cutdowns",
        outcome: "Create three social cutdowns from the approved campaign master.",
        runnerId: "local-demo",
        runnerName: "Local demo",
        mode: "Guided",
        state: "review_ready",
        phase: "Verify",
        progress: 4,
        total: 5,
        elapsed: "12:41",
        createdAt: new Date(now.getTime() - day).toISOString(),
        updatedAt: new Date(now.getTime() - day).toISOString(),
        demo: true,
        artifactId: "launch-film-final",
        notice: "Sample review. No render or provider call occurred."
      },
      {
        id: "product-tutorial",
        title: "Product tutorial",
        outcome: "Build a concise 45-second product tutorial.",
        runnerId: "local-demo",
        runnerName: "Local demo",
        mode: "Guided",
        state: "completed",
        phase: "Deliver",
        progress: 5,
        total: 5,
        elapsed: "19:08",
        createdAt: new Date(now.getTime() - 2 * day).toISOString(),
        updatedAt: new Date(now.getTime() - 2 * day).toISOString(),
        demo: true,
        artifactId: "launch-film-final",
        notice: "Sample delivery record. Nothing was published."
      },
      {
        id: "concept-test",
        title: "Concept test",
        outcome: "Explore two visual directions for a concept film.",
        runnerId: "local-demo",
        runnerName: "Local demo",
        mode: "Guided",
        state: "paused",
        phase: "Brief",
        progress: 0,
        total: 5,
        elapsed: "00:42",
        createdAt: new Date(now.getTime() - 4 * day).toISOString(),
        updatedAt: new Date(now.getTime() - 4 * day).toISOString(),
        demo: true,
        artifactId: null,
        notice: "Sample stopped run. No files were uploaded."
      }
    ],
    messages: {
      "launch-film": [
        {
          id: "message-user-sample",
          role: "user",
          content: "Make the opening feel faster, then use the close-up from Flow.",
          createdAt: today,
          demo: true
        },
        {
          id: "message-runner-sample",
          role: "assistant",
          content: "I saved that direction in the local run. A connected runner would now tighten the opening and ask before sending the close-up to Flow.",
          createdAt: today,
          demo: true
        },
        {
          id: "message-event-sample",
          role: "event",
          content: "Direction saved locally · no edit or upload executed",
          createdAt: today,
          demo: true
        }
      ]
    },
    artifacts: [
      {
        id: "launch-film-final",
        runId: "launch-film",
        title: "Launch film · sample final",
        kind: "video-preview",
        version: "v3",
        duration: "00:30",
        dimensions: "1920 × 1080",
        audio: "−14 LUFS",
        rights: "8 sample sources",
        poster: "/assets/verified-film-poster.svg",
        demo: true,
        checks: ["No black frames or clipping", "Brand marks within safe area"]
      },
      {
        id: "summer-campaign-final",
        runId: "summer-campaign",
        title: "Summer campaign · sample review",
        kind: "video-preview",
        version: "v2",
        duration: "00:15",
        dimensions: "1080 × 1920",
        audio: "−14 LUFS",
        rights: "Sample sources",
        poster: "/assets/verified-film-poster.svg",
        demo: true,
        checks: ["Sample decode check", "Sample safe-area check"]
      }
    ]
  };
}

export function createStore(dataDirectory) {
  const statePath = path.join(dataDirectory, "state.json");
  let mutation = Promise.resolve();

  async function ensure() {
    await mkdir(dataDirectory, { recursive: true });
    try {
      const state = JSON.parse(await readFile(statePath, "utf8"));
      if (state.schemaVersion !== SCHEMA_VERSION) {
        throw new Error(`Unsupported data schema ${state.schemaVersion}`);
      }
      let changed = false;
      if (!state.messages) {
        state.messages = {};
        changed = true;
      }
      if (!state.sources) {
        state.sources = [];
        changed = true;
      }
      const summerRun = state.runs.find((run) => run.id === "summer-campaign");
      if (summerRun && summerRun.artifactId !== "summer-campaign-final") {
        summerRun.artifactId = "summer-campaign-final";
        changed = true;
        if (!state.artifacts.some((artifact) => artifact.id === "summer-campaign-final")) {
          state.artifacts.push({
            id: "summer-campaign-final",
            runId: "summer-campaign",
            title: "Summer campaign · sample review",
            kind: "video-preview",
            version: "v2",
            duration: "00:15",
            dimensions: "1080 × 1920",
            audio: "−14 LUFS",
            rights: "Sample sources",
            poster: "/assets/verified-film-poster.svg",
            demo: true,
            checks: ["Sample decode check", "Sample safe-area check"]
          });
        }
      }
      for (const artifact of state.artifacts) {
        if (artifact.demo === true && artifact.poster === "/assets/watch-poster.png") {
          artifact.poster = "/assets/verified-film-poster.svg";
          changed = true;
        }
      }
      if (changed) await atomicWrite(state);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await atomicWrite(createSeedState());
    }
  }

  async function read() {
    await ensure();
    return JSON.parse(await readFile(statePath, "utf8"));
  }

  async function atomicWrite(state) {
    await mkdir(dataDirectory, { recursive: true });
    const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    await rename(temporaryPath, statePath);
  }

  function change(update) {
    const operation = mutation.then(async () => {
      const state = await read();
      const result = await update(state);
      await atomicWrite(state);
      return result;
    });
    mutation = operation.catch(() => undefined);
    return operation;
  }

  return {
    ensure,
    async listRuns() {
      const state = await read();
      return [...state.runs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async getRun(id) {
      const state = await read();
      return state.runs.find((run) => run.id === id) || null;
    },
    async listArtifacts() {
      const state = await read();
      return state.artifacts;
    },
    async getArtifact(id) {
      const state = await read();
      return state.artifacts.find((artifact) => artifact.id === id) || null;
    },
    async listSources() {
      const state = await read();
      return state.sources;
    },
    async getSources(ids) {
      const state = await read();
      const requested = new Set(Array.isArray(ids) ? ids : []);
      return state.sources.filter((source) => requested.has(source.id));
    },
    registerSource(source) {
      return change(async (state) => {
        const existing = state.sources.find((candidate) => candidate.id === source.id);
        if (existing) return existing;
        state.sources.push(source);
        return source;
      });
    },
    attachSources(runId, sourceIds) {
      return change(async (state) => {
        const run = state.runs.find((candidate) => candidate.id === runId);
        if (!run) return null;
        const requested = [...new Set(Array.isArray(sourceIds) ? sourceIds : [])];
        if (requested.some((id) => !state.sources.some((source) => source.id === id))) {
          throw Object.assign(new Error("One or more local source references do not exist."), { statusCode: 422 });
        }
        run.sourceIds = [...new Set([...(run.sourceIds || []), ...requested])];
        run.notice = `${requested.length} local source${requested.length === 1 ? "" : "s"} attached · nothing uploaded`;
        run.updatedAt = new Date().toISOString();
        return run;
      });
    },
    async listMessages(runId) {
      const state = await read();
      if (!state.runs.some((run) => run.id === runId)) return null;
      return state.messages[runId] || [];
    },
    addMessage(runId, content) {
      return change(async (state) => {
        const run = state.runs.find((candidate) => candidate.id === runId);
        if (!run) return null;
        const now = new Date().toISOString();
        const userMessage = {
          id: `message-${randomUUID()}`,
          role: "user",
          content,
          createdAt: now,
          demo: true
        };
        const assistantMessage = {
          id: `message-${randomUUID()}`,
          role: "assistant",
          content: "I saved that instruction to this local run. Local demo cannot change media or contact a website; connect a capability-probed runner to execute it.",
          createdAt: now,
          demo: true
        };
        const eventMessage = {
          id: `message-${randomUUID()}`,
          role: "event",
          content: "Instruction saved locally · no external action executed",
          createdAt: now,
          demo: true
        };
        state.messages[runId] ||= [];
        state.messages[runId].push(userMessage, assistantMessage, eventMessage);
        run.notice = eventMessage.content;
        run.updatedAt = now;
        return { messages: [userMessage, assistantMessage, eventMessage], run };
      });
    },
    createRun(input) {
      return change(async (state) => {
        const now = new Date().toISOString();
        const id = `run-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
        const title = input.outcome.split(/[.!?]/)[0].trim().slice(0, 52) || "Untitled film";
        const requestedSourceIds = [...new Set(Array.isArray(input.sourceIds) ? input.sourceIds : [])];
        const sourceIds = requestedSourceIds.filter((id) => state.sources.some((source) => source.id === id));
        if (sourceIds.length !== requestedSourceIds.length) {
          throw Object.assign(new Error("One or more local source references do not exist."), { statusCode: 422 });
        }
        const run = {
          id,
          title,
          outcome: input.outcome,
          runnerId: "local-demo",
          runnerName: "Local demo",
          mode: input.mode === "Autonomous" ? "Autonomous" : "Guided",
          state: "preflight",
          phase: "Brief",
          progress: 0,
          total: 5,
          elapsed: "00:00",
          sourceIds,
          createdAt: now,
          updatedAt: now,
          demo: true,
          artifactId: null,
          notice: "Local demo plan. No model, website, upload, or paid action has run."
        };
        state.runs.push(run);
        state.messages[id] = [];
        return run;
      });
    },
    actOnRun(id, action) {
      return change(async (state) => {
        const run = state.runs.find((candidate) => candidate.id === id);
        if (!run) return null;
        const allowedStates = {
          "approve-plan": ["preflight"],
          "allow-once": ["needs_approval"],
          "not-now": ["needs_approval"],
          pause: ["running", "needs_approval"],
          resume: ["paused"],
          "approve-final": ["review_ready"]
        };
        const transitions = {
          "approve-plan": () => Object.assign(run, {
            state: "needs_approval",
            phase: "Generate",
            progress: 2,
            currentTask: "Generate missing product close-up",
            taskDetail: "Flow · Waiting for approval before upload",
            notice: "Demo advanced to the approval state. No external work ran."
          }),
          "allow-once": () => {
            const artifactId = `${run.id}-sample-review`;
            if (!state.artifacts.some((artifact) => artifact.id === artifactId)) {
              state.artifacts.push({
                id: artifactId,
                runId: run.id,
                title: `${run.title} · sample review`,
                kind: "video-preview",
                version: "v1",
                duration: "00:30",
                dimensions: "1920 × 1080",
                audio: "Sample only",
                rights: "No external sources used",
                poster: "/assets/verified-film-poster.svg",
                demo: true,
                checks: ["Sample state only", "No media QA was executed"]
              });
            }
            Object.assign(run, {
              state: "review_ready",
              phase: "Verify",
              progress: 4,
              artifactId,
              notice: "Demo advanced without uploading a file or calling Flow."
            });
          },
          "not-now": () => Object.assign(run, {
            state: "paused",
            notice: "Run paused safely. No file left this device."
          }),
          pause: () => Object.assign(run, {
            state: "paused",
            notice: "Run paused. Inputs and decisions are preserved locally."
          }),
          resume: () => Object.assign(run, {
            state: run.progress >= 4 ? "review_ready" : "needs_approval",
            notice: "Local demo resumed from its last saved state."
          }),
          "approve-final": () => Object.assign(run, {
            state: "completed",
            phase: "Deliver",
            progress: 5,
            notice: "Sample final approved locally. Nothing was published."
          })
        };
        const transition = transitions[action];
        if (!transition) throw Object.assign(new Error("Action is not supported"), { statusCode: 422 });
        if (!allowedStates[action].includes(run.state)) {
          throw Object.assign(
            new Error(`Action ${action} is not valid while the run is ${run.state}.`),
            { statusCode: 409 }
          );
        }
        if (action === "approve-final") {
          const artifact = state.artifacts.find((candidate) => candidate.id === run.artifactId && candidate.runId === run.id);
          if (!artifact) {
            throw Object.assign(new Error("Final approval requires the run's review artifact."), { statusCode: 409 });
          }
        }
        transition();
        run.updatedAt = new Date().toISOString();
        return run;
      });
    }
  };
}
