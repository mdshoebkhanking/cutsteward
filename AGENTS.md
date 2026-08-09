# CutSteward repository handoff

Your goal is to leave the local CutSteward UI healthy and give the user its
exact loopback URL.

Supported hosts are macOS and Windows only. Do not improvise Linux or other-OS
installation paths; report the platform boundary instead.

1. Read `docs/BOOTSTRAP.md` before changing setup or runtime files.
   For production work, also read `UNIVERSAL_AI_VIDEO_AGENT_WORKFLOW.md`,
   `docs/MEDIA_TOOLCHAIN.md`, and `docs/CAPCUT_AGENT_CONTRACT.md` completely.
2. For standard local setup, run `npm run setup`. When the user asks for the complete
   video workstation, run `npm run setup:full`; it also reads the declared
   media toolchain, installs supported tools, and verifies them.
3. If setup fails, run `npm run doctor`, `npm run tools:doctor`, read
   `.framepilot/runtime/server.log`,
   fix only the concrete project-local problem, then run setup again.
4. Success means `/api/health` reports `ok`. Opening a graphical browser is
   best effort; always show the printed URL to the user.
5. For a real production run, read `docs/PRODUCTION_RUN_CONTRACT.md`. Use
   `npm run production:list`, inspect the current revision, and submit
   versioned commands through the loopback CLI. Write evidence only inside the
   run workspace. Never edit `STATE.json` or journal events directly.

Safety rules:

- Preserve user edits and `.framepilot/data`; never delete local data to repair
  startup.
- Never invent, print, or commit secrets. Provider credentials stay in their
  owning runtime or environment, not this repository.
- Never bind the server to `0.0.0.0`; CutSteward is loopback-only by default.
- Do not install global packages or run remote installer scripts without the
  user's explicit approval. `setup:full` is explicit approval for catalogued
  package-manager commands, not for arbitrary repositories or unsigned files.
- Pause for sign-in, MFA/CAPTCHA, paid actions, external uploads, publishing,
  destructive actions, admin rights, or a materially ambiguous user choice.
- Do not claim an external agent, website task, upload, render, or QA result
  succeeded unless a real event proves it.

Useful commands: `npm run setup`, `npm run setup:full`, `npm run doctor`,
`npm run tools:doctor`, `npm run tools:plan`, `npm run tools:catalog`, `npm run status`, `npm run stop`,
`npm run capcut:doctor`, `npm run agents:doctor`, `npm run agents:plan`,
`npm run production:list`, `npm run production:inspect -- <run-id>`,
`npm run production:events -- <run-id>`,
`npm run production:command -- <run-id> --file <command.json>`,
`npm run browser:probe`, `npm run browser:start -- <run-id>`,
`npm run browser:inspect -- <run-id>`, `npm run browser:act -- <run-id> --file <action.json>`,
`npm run browser:close -- <run-id>`,
`npm run stock:search -- <pexels|pixabay> <query...>`,
`npm run stock:select -- <pexels|pixabay> <cache-key> <asset-id> <rendition-id>`,
`npm run production:smoke`, `npm run capcut:smoke`, `npm run video-use:install`, `npm run video-use:doctor`, `npm test`, and
`npm run build`.

The supervised-browser agent action file is read-only: it may contain only
`navigate`, `snapshot`, or bounded `wait`. Click, fill, download, upload,
authentication, spend, publish, destructive, and local-network actions require
manual user takeover until an exact hash/scope-bound browser proposal service
is implemented. Never treat a page label or same-request boolean as approval.
