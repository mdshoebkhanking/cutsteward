# macOS and Windows local bootstrap

## Supported baseline

- Windows 10/11 or a current macOS release
- Node.js `>=22.12.0`
- npm included with Node.js
- A writable project folder

CutSteward intentionally supports only macOS and Windows. Automatic
machine-level media installs use Homebrew on macOS and WinGet on Windows.
Linux and other operating systems are outside this release contract; setup
stops with a clear platform message instead of guessing an installer path.

CutSteward has no container requirement, global package, or remote database.
The project lockfile includes optional per-platform FFmpeg/FFprobe binaries for
macOS Intel/Apple Silicon and Windows x64; CutSteward verifies their admitted
SHA-256 before use. Other Windows architectures require a catalogued system
FFmpeg. That substantially reduces machine-to-machine failures, but no
repository can guarantee unattended installation or graphical browser launch on
every machine. The reliable success signal is a healthy server and printed URL.

The loopback API is not unauthenticated merely because it is local. The UI
receives an HttpOnly, SameSite=Strict bootstrap cookie; project-local CLI tools
read a separate mode-0600 Bearer token. Caller-supplied actor headers are
ignored. Read-only discovery remains available, while every mutation must
prove one of those local channels.

The repository's `macOS + Windows local smoke` workflow exercises the minimum and
current Node lines on macOS and Windows: locked install, contract tests,
production build, doctor, start, live status, and verified stop. Machine-level
media packages remain outside this baseline matrix because OS installers and
GPU/desktop applications are intentionally capability-probed on the target PC.

## Canonical flow

Run `npm run setup` from the repository root. The project-local launcher:

1. validates Node and required files without changing global state;
2. runs locked `npm ci` only when dependency state changed;
3. builds only when source or lockfile content changed;
4. initializes ignored `.framepilot/data` and `.framepilot/runtime` folders;
5. reuses a healthy matching server or selects an available loopback port;
6. starts `server/index.mjs` as a bounded local background process;
7. polls `/api/health` for up to 15 seconds;
8. attempts the platform browser opener and always prints the URL.

Setup may require network access the first time npm dependencies are missing.
It never installs packages globally. Use `npm run setup -- --no-open` on a
headless machine.

`npm run setup:full` performs the same idempotent application setup and then
applies the declared media-tool plan. It may invoke a detected OS package
manager for supported tools. It stops before administrator elevation rather
than launching `sudo` or asking for a password inside an unattended agent run.
It never treats an arbitrary Git repository or
unsigned download as trusted, and it reports manual-only desktop integrations.
The one user-approved repository extension, `browser-use/video-use`, is staged
without hooks or submodules at its exact admitted commit, verified, promoted
into `.framepilot/tools`, and exercised only by a disposable offline smoke.
Failure leaves the core UI usable and the extension visibly deferred.

The Settings screen offers a narrower path for a missing catalogued free tool.
It displays the exact package manager, command, argument array, working
directory, and plan hash first. A local user then grants one short-lived,
one-shot approval before the server runs that exact `shell:false` command and
performs the post-install probe. Paid tools, arbitrary URLs/repositories,
remote scripts, elevation, and interactive/manual installers are never run by
this path. Any changed plan needs fresh review.

## Runtime commands

- `npm run status` — report the recorded server and live health.
- `npm run doctor` — inspect Node, writable paths, ports, build state, and known
  local agent executables without executing those agents.
- `npm run stop` — stop only the PID recorded for this project.
- `npm run setup -- --port 4180` — request a preferred loopback port; a nearby
  free port is selected when it is occupied.
- `npm run production:smoke` — run the real evidence-gated workflow against a
  separate loopback server and temporary data directory, verify generated media,
  range playback, and its completion certificate, then clean up the temporary run.
- `npm run capcut:smoke` — build, lint, proxy-render, fully decode, and remove a
  disposable CapCut draft without touching the user's draft store.
- `npm run video-use:install` — idempotently stage and admit only the pinned
  `video-use` commit; existing paths are inspected and never overwritten.
- `npm run browser:probe` — detect the supported headed browser without
  launching it. `browser:start`, `browser:inspect`, `browser:act`, and
  `browser:close` operate only on a named real run. `browser:act` admits only
  `navigate`, `snapshot`, and bounded `wait`. The agent CLI cannot click, fill,
  download, upload, authenticate, spend, publish, delete, access a local
  network, or grant itself any of those capabilities.
- `npm run stock:search -- <pexels|pixabay> <query...>` — search through the
  credential-isolated local bridge and receive a private-cache key plus
  normalized candidates. It does not download or license anything.
- `npm run stock:select -- <provider> <cache-key> <asset-id> <rendition-id>` —
  bind one exact cached rendition for the provider-request file. The later
  network download remains a separate exact local-user approval.

Runtime state and logs live under `.framepilot/runtime`. User-created run data
lives under `.framepilot/data`. The execution kernel's authoritative snapshot,
journal, approval decisions, and adapter receipts live outside agent-writable
project workspaces under `.framepilot/data/.execution-state/<opaque-run-plan-hash>`.
That private store is constrained to server-derived direct children and uses
owner-only directory/file modes where the host supports POSIX permissions.
Files named `execution.snapshot.json` or `execution.journal.ndjson` inside a
run workspace are untrusted legacy/input material and are never recovered as
authority. On upgrade, CutSteward materializes fresh private state and resets
all execution approvals instead of importing a possibly forged workspace copy.
Agents and the UI receive a read projection through the loopback execution
endpoint; media, manifests, and planning evidence remain in the run workspace.
Added files are streamed into
`sources/sha256/` and identified by SHA-256; URL references are stored as local
context and are never fetched merely because they were added. Both directories
are ignored by Git. Set
`FRAMEPILOT_DATA_DIR` to an absolute writable path before setup to store data
elsewhere. Provider adapters still resolve artifact targets from the verified
`projects/<run-id>` workspace; the private execution path is never supplied as
an artifact or provider-download directory. Provider API keys are injected from
the server environment only;
they are never returned by bootstrap, copied into a run, or given to the
planning agent. Headed website work uses a dedicated CutSteward browser profile
instead of copying the user's normal browser profile.

For a clean portable application copy, stop CutSteward and omit `node_modules`,
`dist`, and the **entire `.framepilot` directory**; setup recreates them for the
destination OS/architecture. Do not copy `.framepilot/data` wholesale: in
addition to projects and hashed sources it contains private local-authority,
provider-approval, and encrypted-cache key material. Move only separately
reviewed media/delivery exports. CutSteward does not currently claim to create a
sanitized run-data export automatically.

## Giving the folder to an agent

Tell Codex, Gemini CLI, Hermes, Kimi Code, Claude Code, or Antigravity:

> Read the repository instructions, set up CutSteward, verify its health, and
> open or give me the local UI URL.

After setup, the agent can use the vendor-neutral run contract:

```sh
npm run production:list
npm run production:inspect -- <run-id>
npm run production:events -- <run-id>
FRAMEPILOT_ACTOR=codex npm run production:command -- <run-id> --file command.json
```

The full schemas and evidence gates are in
`docs/PRODUCTION_RUN_CONTRACT.md`. A detected executable is not a connected
runtime. Codex can connect through its native app-server transport; installed
Gemini CLI, Hermes, and Kimi can connect through ACP after a real per-run
handshake. Other agents remain folder/API handoffs until a direct adapter
exists. The local CLI records actions and observations; it cannot turn agent
text or an exit code into a completion certificate.

`AGENTS.md` is canonical. `CLAUDE.md` and `.agents/rules/00-repository.md` are
thin discovery shims. Agents must stop for login, external upload, spending,
publishing, destructive repair, admin rights, or an unclear choice.

For signed-in websites, start the supervised browser from a real run. Complete
password/passkey/MFA/CAPTCHA steps directly in the visible window. Never paste
a secret into chat or a run instruction. Navigation/read-only work may resume
after takeover. Use the visible browser manually for clicks, form entry,
downloads, generation credits, file uploads, share links, publishing, and
deletion. Those actions remain unavailable to agent automation until a
dedicated exact hash/scope-bound local-user browser proposal service exists;
same-request confirmations are rejected.

## Troubleshooting

Run `npm run doctor`, then inspect `.framepilot/runtime/server.log`. Setup has a
bounded timeout; it does not leave success ambiguous. Never fix startup by
deleting `.framepilot/data`. If browser opening fails, paste the printed
`http://127.0.0.1:<port>` URL into a browser.
