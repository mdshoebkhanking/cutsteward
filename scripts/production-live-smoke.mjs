import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMediaBinaries } from "../server/media-verifier.mjs";
import { assertSupportedPlatform } from "../server/platform-support.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHASES = [
  { id: "intake", roles: ["project_profile", "profile_validation", "rights_and_consent"] },
  { id: "research", roles: ["research_packet"] },
  { id: "script", roles: ["locked_script", "script_review"] },
  { id: "storyboard", roles: ["storyboard", "edit_map"] },
  { id: "acquisition", roles: ["asset_manifest"] },
  { id: "capture", optional: true },
  { id: "audio", optional: true },
  { id: "edit", roles: ["preview_media"] },
  { id: "preview_qa", roles: ["preview_qa"] },
  { id: "master", roles: ["master_media", "master_qa"] },
  { id: "delivery", roles: ["final_release", "sha256sums"] }
];

function boundedProcess(command, args, { cwd = ROOT, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let timedOut = false;
    const collect = (target, chunk) => {
      bytes += chunk.length;
      if (bytes <= 256 * 1024) target.push(chunk);
      if (bytes > 256 * 1024) child.kill();
    };
    child.stdout.on("data", (chunk) => collect(stdout, chunk));
    child.stderr.on("data", (chunk) => collect(stderr, chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut && bytes <= 256 * 1024,
        code,
        timedOut,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = probe.address();
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForHealth(baseUrl, instanceId) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(700) });
      if (response.ok) {
        const health = await response.json();
        if (health.status === "ok" && health.instanceId === instanceId) return health;
      }
    } catch {
      // The isolated server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("The isolated CutSteward server did not become healthy.");
}

async function api(baseUrl, pathname, { method = "GET", body, actor, authorization, cookie } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(actor ? { "X-FramePilot-Actor": actor } : {}),
      ...(authorization ? { Authorization: authorization } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || payload.title || `HTTP ${response.status}`);
  return payload;
}

async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function runLiveProductionSmoke({ keep = false } = {}) {
  assertSupportedPlatform();
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "framepilot-live-production-"));
  const dataDirectory = path.join(temporaryDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const instanceId = `production-smoke-${randomUUID()}`;
  const serverOutput = [];
  let server;

  try {
    server = spawn(process.execPath, [path.join(ROOT, "server", "index.mjs")], {
      cwd: ROOT,
      env: {
        ...process.env,
        FRAMEPILOT_DATA_DIR: dataDirectory,
        FRAMEPILOT_PORT: String(port),
        FRAMEPILOT_INSTANCE_ID: instanceId,
        FRAMEPILOT_BUILD_HASH: "live-production-smoke"
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    server.stdout.on("data", (chunk) => {
      if (Buffer.concat(serverOutput).length < 64 * 1024) serverOutput.push(chunk);
    });
    server.stderr.on("data", (chunk) => {
      if (Buffer.concat(serverOutput).length < 64 * 1024) serverOutput.push(chunk);
    });

    const health = await waitForHealth(baseUrl, instanceId);
    if (!health.production?.evidenceGated) throw new Error("Health did not advertise the evidence-gated production kernel.");
    const authorityToken = (await readFile(path.join(dataDirectory, ".authority", "loopback-token"), "utf8")).trim();
    const agentAuthorization = `Bearer ${authorityToken}`;
    const bootstrapResponse = await fetch(`${baseUrl}/api/bootstrap`);
    if (!bootstrapResponse.ok) throw new Error("Could not initialize the local browser authority session.");
    const browserCookie = String(bootstrapResponse.headers.get("set-cookie") || "").split(";", 1)[0];
    if (!browserCookie) throw new Error("Bootstrap did not issue the local authority cookie.");

    const started = await api(baseUrl, "/api/runs", {
      method: "POST",
      authorization: agentAuthorization,
      body: {
        commandId: "live-smoke-start",
        outcome: "Create a two-second local conformance film and prove every applicable release gate.",
        mode: "Guided",
        sourceIds: [],
        runnerId: "codex"
      }
    });
    let run = started.run;
    const runId = run.id;
    const projectDirectory = path.join(dataDirectory, run.projectRelativePath);

    const currentRun = async () => (await api(baseUrl, `/api/runs/${encodeURIComponent(runId)}`)).run;
    const agentCommand = async (command, label = command.kind) => {
      run = await currentRun();
      const result = await api(baseUrl, `/api/runs/${encodeURIComponent(runId)}/commands`, {
        method: "POST",
        actor: "live-smoke-agent",
        authorization: agentAuthorization,
        body: {
          commandId: `smoke-${label}-${randomUUID()}`,
          expectedRevision: run.revision,
          command
        }
      });
      run = result.run;
      return result;
    };
    const userAction = async (action, input = {}) => {
      run = await currentRun();
      const result = await api(baseUrl, `/api/runs/${encodeURIComponent(runId)}/actions`, {
        method: "POST",
        cookie: browserCookie,
        body: { action, expectedRevision: run.revision, ...input }
      });
      run = result.run;
      return result;
    };
    const artifacts = async () => (await api(baseUrl, "/api/artifacts")).artifacts.filter((artifact) => artifact.runId === runId);

    await userAction("approve-plan", { rightsConfirmed: true });

    const writeEvidence = async (relativePath, contents) => {
      const absolutePath = path.join(projectDirectory, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
      return absolutePath;
    };

    const register = async ({ role, relativePath, contents, title, parentArtifactId = null }) => {
      if (contents !== undefined) await writeEvidence(relativePath, contents);
      await agentCommand({
        kind: "record-artifact",
        role,
        relativePath,
        title,
        parentArtifactId
      }, `record-${role}`);
      const matches = (await artifacts()).filter((artifact) => artifact.role === role && artifact.title === title);
      const artifact = matches.at(-1);
      if (!artifact) throw new Error(`Registered artifact was not projected: ${role}`);
      return artifact;
    };

    const review = async (artifact, { user = false } = {}) => {
      if (user) {
        await userAction("approve-artifact", {
          artifactId: artifact.id,
          reason: "Live smoke reviewed the exact generated local bytes."
        });
      } else {
        await agentCommand({
          kind: "review-artifact",
          artifactId: artifact.id,
          verdict: "approve",
          reason: "Deterministic conformance evidence inspected by the smoke adapter."
        }, `review-${artifact.role}`);
      }
      return (await artifacts()).find((entry) => entry.id === artifact.id);
    };

    const recordAndReview = async (input, options) => review(await register(input), options);

    const media = await resolveMediaBinaries({ rootDirectory: ROOT });
    if (!media.ffmpeg || !media.ffprobe || !media.integrity.ok) throw new Error("Hash-admitted FFmpeg/FFprobe are unavailable.");
    const previewRelative = "renders/previews/live-smoke-preview.mp4";
    const previewPath = path.join(projectDirectory, previewRelative);
    await mkdir(path.dirname(previewPath), { recursive: true });
    const generated = await boundedProcess(media.ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=2",
      "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=48000:duration=2",
      "-map", "0:v:0", "-map", "1:a:0", "-shortest",
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      previewPath
    ], { cwd: projectDirectory });
    if (!generated.ok) throw new Error("Could not generate the real smoke media.");

    let previewArtifact;
    let masterArtifact;
    for (const phase of PHASES) {
      run = await currentRun();
      if (run.phaseId !== phase.id) throw new Error(`Expected phase ${phase.id}, received ${run.phaseId}.`);

      if (phase.optional) {
        await agentCommand({
          kind: "waive-phase",
          reason: phase.id === "capture"
            ? "Synthetic local conformance media does not require an authentic product capture module."
            : "The synthetic conformance tone is already embedded; no separate production audio module applies."
        }, `waive-${phase.id}`);
        continue;
      }

      for (const role of phase.roles) {
        if (role === "profile_validation") {
          await recordAndReview({
            role,
            relativePath: "planning/LIVE_SMOKE_PROFILE_VALIDATION.json",
            title: "Live smoke profile validation",
            contents: JSON.stringify({ status: "passed", unresolved: [] }, null, 2)
          });
        } else if (role === "preview_media") {
          previewArtifact = await register({
            role,
            relativePath: previewRelative,
            title: "Live smoke preview"
          });
          if (previewArtifact.verification?.result !== "pass") throw new Error("Preview media verification did not pass.");
          previewArtifact = await review(previewArtifact, { user: true });
        } else if (role === "preview_qa") {
          await recordAndReview({
            role,
            relativePath: "qa/preview/LIVE_SMOKE_QA.json",
            title: "Live smoke preview QA",
            parentArtifactId: previewArtifact.id,
            contents: JSON.stringify({ status: "passed", artifactSha256: previewArtifact.sha256 }, null, 2)
          });
        } else if (role === "master_media") {
          const masterRelative = "renders/masters/live-smoke-master.mp4";
          await copyFile(previewPath, path.join(projectDirectory, masterRelative));
          masterArtifact = await register({
            role,
            relativePath: masterRelative,
            title: "Live smoke master"
          });
          if (masterArtifact.verification?.result !== "pass") throw new Error("Master media verification did not pass.");
          masterArtifact = await review(masterArtifact, { user: true });
        } else if (role === "master_qa") {
          await recordAndReview({
            role,
            relativePath: "qa/master/LIVE_SMOKE_QA.json",
            title: "Live smoke master QA",
            parentArtifactId: masterArtifact.id,
            contents: JSON.stringify({ status: "passed", artifactSha256: masterArtifact.sha256 }, null, 2)
          });
        } else if (role === "final_release") {
          await recordAndReview({
            role,
            relativePath: "delivery/FINAL_RELEASE.json",
            title: "Live smoke final release",
            contents: JSON.stringify({
              run_status: "release_passed",
              canonical_master: { relativePath: masterArtifact.relativePath, sha256: masterArtifact.sha256 }
            }, null, 2)
          });
        } else if (role === "sha256sums") {
          await recordAndReview({
            role,
            relativePath: "delivery/SHA256SUMS",
            title: "Live smoke checksums",
            contents: `${masterArtifact.sha256}  ${masterArtifact.relativePath}\n`
          });
        } else {
          const extension = ["project_profile", "asset_manifest"].includes(role) ? "json" : "md";
          const contents = extension === "json"
            ? JSON.stringify({ schemaVersion: 2, status: "passed", role }, null, 2)
            : `# ${role}\n\nLive isolated conformance evidence for ${role}.\n`;
          await recordAndReview({
            role,
            relativePath: `qa/artifacts/${role}.${extension}`,
            title: `Live smoke ${role}`,
            contents
          });
        }
      }
      await agentCommand({ kind: "pass-phase" }, `pass-${phase.id}`);
    }

    run = await currentRun();
    if (run.state !== "completed" || run.releaseGate?.status !== "release_passed") {
      throw new Error("The evidence-gated run did not reach certified completion.");
    }

    const rangeResponse = await fetch(`${baseUrl}${masterArtifact.contentUrl}`, {
      headers: { Range: "bytes=0-63" }
    });
    const rangeBytes = Buffer.from(await rangeResponse.arrayBuffer());
    if (rangeResponse.status !== 206 || rangeBytes.length !== 64
        || rangeResponse.headers.get("accept-ranges") !== "bytes") {
      throw new Error("Real artifact HTTP range playback check failed.");
    }

    const certificatePath = path.join(projectDirectory, "delivery", "COMPLETION_CERTIFICATE.json");
    const certificate = JSON.parse(await readFile(certificatePath, "utf8"));
    const certificateFileSha256 = await sha256File(certificatePath);
    if (certificate.runStatus !== "release_passed"
        || certificate.canonicalMaster.sha256 !== masterArtifact.sha256
        || certificateFileSha256 !== run.releaseGate.certificateFileSha256) {
      throw new Error("Completion certificate bytes do not match the projected evidence.");
    }

    return {
      ok: true,
      platform: `${process.platform}/${process.arch}`,
      health: health.status,
      runId,
      gatesPassed: run.progress,
      totalGates: run.total,
      masterSha256: masterArtifact.sha256,
      masterBytes: masterArtifact.size,
      mediaVerification: masterArtifact.verification?.detail,
      rangePlayback: "206 bytes 0-63",
      certificateHash: certificate.certificateHash,
      certificateFileSha256,
      temporaryDataPreserved: keep
    };
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => server.once("close", resolve)),
        new Promise((resolve) => setTimeout(resolve, 5_000))
      ]);
    }
    if (!keep) await rm(temporaryDirectory, { recursive: true, force: true });
    else console.error(`Live smoke data kept at ${temporaryDirectory}`);
  }
}

async function main() {
  try {
    const result = await runLiveProductionSmoke({ keep: process.argv.includes("--keep") });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`CutSteward live production smoke: ${error.message}`);
    process.exitCode = 1;
  }
}

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
