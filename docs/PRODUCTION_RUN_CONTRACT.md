# CutSteward production-run contract

This is the control contract for Codex, Claude Code, Hermes, Kimi Code,
Antigravity, and any other local agent. It is intentionally independent of the
agent vendor. Supported hosts are macOS and Windows only.

A detected executable is not a connected runtime. The agent may still control
a run through the loopback API/CLI after setup. Codex uses its native app-server
transport; Gemini CLI, Hermes, and Kimi use ACP when installed and conformant.
The UI says `connected` only after the current run has a native session ID and
durable session event. Other agents remain truthful handoffs until a direct
adapter is implemented.

## Execution ownership

CutSteward—not the conversational model—owns the dependency DAG, approval
ledger, idempotency keys, attempts, provider receipts, artifact hashes,
cancellation intent, and restart reconciliation. A connected agent executes
bounded research, directing, capture, Blender, edit, and QA jobs and must write
the exact role manifests requested under `execution-output/`. The engine
verifies every referenced file, hash, byte count, and decodable media role
before accepting the job.

Typed external adapters currently exist for:

- `elevenlabs.tts_alignment`: synchronous TTS with audio, character/word timing,
  request metadata, and a voice-performance manifest;
- `google.veo_3_1`: one long-running submission, persisted operation name,
  reconciliation polling, immediate download, and generation manifest;
- `stock.rights_gated`: download of an explicitly selected Pexels/Pixabay
  rendition with source, creator, retrieval, license, and attribution ledger.

They receive credentials only from the server's injected resolver. They do not
read secrets from a project file or agent message. Registration/configuration,
submission, provider completion, downloaded bytes, decode, and final approval
are separate observable states. Missing credentials or an absent exact request
fails closed before network submission.

## Setup and discovery

From the repository root:

```sh
npm run setup
npm run production:url
npm run production:list
```

For the complete declared workstation:

```sh
npm run setup:full
npm run tools:doctor
npm run agents:doctor
```

The launcher prints the exact loopback URL. Never assume port 4173 if setup
selected another port; set `FRAMEPILOT_URL` to the printed URL for CLI calls.

## Start a run

Create `start.json`:

```json
{
  "commandId": "start-my-launch-film-001",
  "outcome": "Create a 30-second launch film from the approved local footage.",
  "mode": "Guided",
  "sourceIds": [],
  "runnerId": "codex"
}
```

Then:

```sh
npm run production:start -- --file start.json
```

The response contains the run ID. Starting creates a real project workspace
under `.framepilot/data/projects/<run-id>/`, copies the canonical workflow,
and raises a hash-bound rights/budget decision. It does not call a provider or
render media.

New profiles default to an English (`en-US`) master for the US, Canada, UK,
Australia, New Zealand, and the wider English-speaking international market.
The four script passes, character strategy, source routing, image-to-video
continuity, emotional voice map, Blender device contract, caption modes,
short-form pacing, effect budget, CTA hold, 4K classification, and QA rules are
copied into the run as `MASTER_WORKFLOW_COPY.md` from
`UNIVERSAL_AI_VIDEO_AGENT_WORKFLOW.md`.

## Durable execution and supervised browser endpoints

`GET /api/runs/<run-id>/execution` returns the materialized execution snapshot,
session, and registered adapter capabilities. `POST` to the same route accepts
the bounded operations `materialize`, `connect`, `advance`, `reconcile`,
`schedule`, `stop-scheduler`, and `cancel`. Generic execution approval is
deliberately rejected. Only an authenticated local user may connect a runner or
irreversibly cancel durable jobs; an agent may stop local scheduling or request
attention but cannot terminalize the execution.

This endpoint is a read projection, not a workspace-backed authority file.
Authoritative execution snapshots, append-only journals, approval decisions,
and completion receipts are stored by the server under
`.framepilot/data/.execution-state/<opaque-run-plan-hash>`, outside
`projects/<run-id>`. The state key is derived inside the controller from the
verified run ID and Director plan hash; callers never submit a filesystem path.
On POSIX hosts the private directories are mode `0700` and files are mode
`0600`. Legacy or forged `execution.snapshot.json` and
`execution.journal.ndjson` files placed in a run workspace are ignored; they
cannot grant an approval, mark a job successful, or create a receipt. A fresh
private materialization resets approvals rather than trusting legacy workspace
state. Provider and agent adapters continue to resolve artifacts against the
verified project workspace, never against this private state directory.

The connected agent writes strict non-secret parameters to
`planning/PROVIDER_REQUESTS.json`. `GET
/api/runs/<run-id>/provider-actions/<job-id>` validates the current file and
returns its exact public request, action hash, scope hash, and required gates.
`POST` to that same route accepts only the current action hash plus explicit
local-user confirmation, persists a private signed receipt, and grants only
that proposal's execution approvals. Provider upload, spend/quota,
voice/likeness, and stock-license permissions therefore cannot be smuggled
through a generic button. Any scope or request change makes the receipt stale.

`POST /api/stock/search` and `/api/stock/select` back the safe CLI commands:

```sh
npm run stock:search -- pexels real human commute
npm run stock:select -- pexels <cache-key> <asset-id> <rendition-id>
```

They use the server's injected Pexels/Pixabay credential, never return it,
never download media, and never assert that model/property releases or campaign
rights exist. The selected object is copied into the exact provider request and
still requires local-user review.

`GET /api/runs/<run-id>/browser` reports only the supervised session and probe.
`POST` accepts `start`, `act`, or `close`. The browser is headed, uses a
physically run-isolated profile, intercepts every document, redirect, popup,
iframe, fetch, WebSocket, and subresource before egress, blocks service-worker
bypass, and re-resolves DNS per request. Loopback, private, link-local,
credentialed, file, and other non-HTTP(S) targets fail closed. Evidence is an
append-only hash chain that resumes across browser sessions. Passwords,
passkeys, OTP/MFA, CAPTCHA, account recovery, and security warnings require
user takeover. Agent actions are limited to `navigate`, `snapshot`, and
bounded `wait`. Click, fill, download, upload, auth, spend, publish,
destructive, and local-network operations remain unavailable until an exact
hash/scope-bound local-user browser proposal service is connected. A page
label or same-request boolean is never authority; cookies, storage, and
credentials are not exportable tools.

For a missing free tool, `GET /api/tools/install/<tool-id>` returns the exact
reviewed plan. `POST` first creates a one-shot local-user approval and then may
execute only that same catalog-bound `shell:false` command. The service refuses
unreviewed repositories/URLs/scripts, paid tools, elevation, and manual desktop
installers, and reports post-install readiness with a receipt.

A user normally confirms the first decision in the UI. An agent must not
self-approve the user's rights, uploads, spending, or publishing.

## Inspect and follow

```sh
npm run production:inspect -- <run-id>
npm run production:events -- <run-id> <after-sequence>
```

`events` is a long-lived SSE stream. A reconnect may pass the last received
sequence. The durable snapshot contains `revision`, `currentPhaseId`,
`pendingAttention`, artifact hashes, open gates, and the project-relative
path.

## Send a versioned command

Every mutation after start requires the current `expectedRevision` and a
unique `commandId`. Replaying the exact same command ID and payload returns
the original receipt. Reusing it with different input fails.

Create `command.json`:

```json
{
  "commandId": "codex-direction-001",
  "expectedRevision": 3,
  "command": {
    "kind": "direct",
    "text": "Use the approved restrained opening; do not upload any source."
  }
}
```

Then:

```sh
FRAMEPILOT_ACTOR=codex npm run production:command -- <run-id> --file command.json
```

The loopback API endpoint is
`POST /api/runs/<run-id>/commands`. The accepted response means the command
was durably recorded—not that the requested external effect succeeded.

## Commands

- `direct`: record a production direction.
- `attach-source`: attach registered content-addressed source IDs. Any new
  source bytes invalidate the prior rights proposal and raise a new decision.
- `control`: `pause` or `resume`; `cancel` is accepted only from the
  authenticated local user and is rejected for the local-agent bearer identity.
- `bind-runner`: record a runner observation. A local-agent claim remains
  `handoff_only`; only the trusted adapter/system path can prove
  `connected`.
- `raise-attention`: request a hash-bound human decision before a side effect.
- `observe-job`: record `planned`, `waiting_approval`, `submitting`,
  `accepted`, `running`, `reconciling`, `outputs_staged`,
  `verified_output`, `failed`, `unknown`, or `cancelled`. No job state
  can complete the production.
- `record-artifact`: register a non-empty project-relative file and its role.
  Media receives FFprobe metadata plus a complete FFmpeg decode.
- `review-artifact`: approve or reject exact registered SHA-256 bytes.
  Media approval is rejected for a `local-agent`; the user reviews the real
  player and approves those bytes in the local UI.
- `pass-phase`: close only the current phase when every required approved
  evidence role exists and its bytes are unchanged.
- `waive-phase`: mark only the current optional phase N/A with a concrete
  reason.

The initial UI uses `respond` for human approvals. Agents should raise an
attention and wait instead of manufacturing a decision.

## Artifact roles and phase gates

1. Intake: `project_profile`, `profile_validation`,
   `rights_and_consent`
2. Research: `research_packet`
3. Script: `locked_script`, `script_review`
4. Storyboard: `storyboard`, `edit_map`
5. Acquisition: `asset_manifest`
6. Capture (optional): `capture_manifest`
7. Audio (optional): `audio_mix`
8. Edit: `preview_media`
9. Preview QA: `preview_qa`, bound to the preview SHA-256
10. Master: `master_media`, `master_qa`, bound to the master SHA-256
11. Delivery: `final_release`, `sha256sums`

`profile_validation` must be passed with no unresolved fields.
`final_release` must say `release_passed` and name the approved master hash.
`SHA256SUMS` must include that exact master path/hash.

## Example artifact registration

First write the file inside the run workspace, then inspect the latest revision
and send:

```json
{
  "commandId": "codex-master-register-001",
  "expectedRevision": 42,
  "command": {
    "kind": "record-artifact",
    "role": "master_media",
    "title": "Launch film master",
    "relativePath": "renders/masters/launch-film-master.mp4"
  }
}
```

After the verifier passes, the user opens the run, plays the actual local
artifact, and chooses **Approve exact bytes**. A local-agent command cannot
self-approve media. Approval is rejected if the file changed or media decode
failed. QA JSON must bind `artifactSha256` to the exact parent media hash.

## Completion truth

Only the production kernel can issue
`delivery/COMPLETION_CERTIFICATE.json`. It rechecks all evidence bytes before
closing delivery. Provider “done” text, an agent answer, a successful process
exit, a CapCut proxy, or `verified_output` is never enough.

Secrets, cookies, MFA/CAPTCHA responses, and raw provider credentials do not
belong in commands, events, project files, or logs.
