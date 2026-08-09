# CutSteward autonomous-production implementation

## Objective

Build CutSteward into a local, AI-agnostic video-production cockpit. A connected
agent can research, plan, source or generate approved media, capture authentic
product proof, create timed voice/audio, edit, render, verify, and prepare a
delivery while the user sees durable jobs, evidence, failures, and exact approval
requests.

The default production profile is English (`en-US`) for international
English-speaking markets, with premium vertical short-form output and a
2160x3840 delivery target when the source-detail classification supports it.

## Authority and truth boundaries

- CutSteward is loopback-only and authenticates mutations with an HttpOnly local
  user cookie or a private mode-0600 local-agent bearer token.
- A prompt or workflow file cannot grant host authority. Login, MFA/CAPTCHA,
  secrets, uploads, spending/credits, likeness or voice consent, publishing,
  destructive actions, and system installs remain exact user gates.
- Detected is not connected; submitted is not complete; an agent message is not
  artifact evidence; a provider result is not delivery until bytes are fetched,
  hashed, decoded, reviewed, and recorded.
- Credentials remain in environment variables or their owning authenticated
  website session. They are not copied into run projects, logs, or provider
  request documents.
- Compatibility is provided through native/App-Server/ACP adapters and a
  supervised headed-browser fallback. No truthful system can guarantee silent
  automation of every AI, website, authentication challenge, or paid action.

## Implemented

- The public product name is now **CutSteward**, with the tagline **“The
  governed AI video studio.”** The naming decision and preliminary collision
  checks are recorded in `docs/BRAND_DECISION.md`. Public UI, package metadata,
  documentation, demo copy, and intended repository links use CutSteward;
  narrowly scoped `.framepilot` storage, environment/header namespaces, the
  compatibility launcher, and legacy editable-demo IDs remain intentionally
  unchanged for backward compatibility. This is a practical knock-out search,
  not formal legal clearance.
- Durable Director DAG with dependencies, bounded retries, fallback routes,
  idempotency keys, reconciliation, cancellation, restart recovery, receipts,
  and approval-scoped execution.
- Real Codex app-server support plus ACP runtime seams for Gemini CLI, Hermes,
  and Kimi Code. Claude Code and other catalogued runtimes remain truthful
  handoff-only until a live adapter passes conformance.
- Agent execution jobs that require exact output manifests, SHA-256 hashes,
  byte counts, project containment, and media decode verification.
- Supervised headed browser with a dedicated persistent profile, bounded
  navigation/snapshot actions, secret redaction, takeover for authentication,
  and explicit upload/spend/publish/destructive/local-network gates.
- Provider adapters for ElevenLabs timed speech, Google Veo 3.1 long-running
  operations, and rights-gated Pexels/Pixabay acquisition. Network behavior is
  covered by deterministic mocked-fetch tests; real provider use still requires
  the user's credentials, exact request, quota/budget approval, and provider
  availability.
- Reviewed missing-tool installation plans for catalogued free tools. The local
  user sees the exact package manager command and grants a one-shot, expiring,
  command-bound approval before execution; a post-install probe is mandatory.
- Local FFmpeg/Blender/CapCut integration contracts, authentic-screen capture
  routes, captions, motion, audio, render, artifact, and final-release evidence
  contracts.
- Complete single-file production playbook:
  `UNIVERSAL_AI_VIDEO_AGENT_WORKFLOW.md`.
- Production run scaffolds with the workflow copy, English/international
  profile, four-pass script process, Director plan, character/voice/mockup
  plans, source/rights ledgers, output directories, and immutable run journal.
- Production cockpit routes for run creation, source attachment, exact runtime
  connection, activity/events, artifact review, and tool-install review.

## Validation completed

- `npm test -- --maxWorkers=1 --no-file-parallelism`: **37 files / 219 tests**
  passed after the CutSteward branding, release checks, provider-action,
  stock-search, installer, browser, execution, authority, and cockpit
  integrations.
- `npm run build`: passed; Vite transformed 1,809 modules.
- `npm run setup -- --no-open`: passed, and the local CutSteward application is
  healthy.
- `npm run production:smoke`: passed all 11 production gates, media decode,
  HTTP byte-range serving, completion-certificate creation, and scoped temporary
  cleanup.
- `npm run status`: healthy at `http://127.0.0.1:4173`.
- `npm run doctor`, `npm run tools:doctor`, and `npm run agents:doctor` completed.
  FFmpeg/ffprobe, CapCut CLI, Blender, CapCut Desktop, and Git are detected;
  Remotion remains an optional, uninstalled extension. Codex app-server is live
  and conformant; Claude is detected but deliberately handoff-only; Gemini CLI,
  Hermes, Kimi, and Antigravity are not currently installed/detected.
- The staged-index release checker rejects fake MP4 headers, performs bounded
  project-local FFprobe inspection plus full FFmpeg decode, and scans binary
  ASCII/UTF-16 metadata for redacted secret, private-path, and provider-record
  leaks. It enforces the current public walkthrough's exact duration,
  dimensions, 30 fps rate, and audio stream, and deny-lists the retired public
  demo hashes. The release-check output is the authoritative total-byte record
  for the exact staged index.
- Provider health: ElevenLabs, Google Veo, and Pexels/Pixabay adapters are
  registered but configuration-required because no provider credentials are
  stored in the project or current server environment.
- In-app browser QA passed for the home screen, production cockpit, Settings,
  responsive geometry, and the supervised-browser takeover drawer. The final
  CutSteward home tab was left open for the user.
- The single-file workflow and the completed project integration each received
  independent read-only P1/P2 audits. The workflow audit passed; final project
  audit findings, if any, must be appended rather than hidden.

## Public demo release checkpoint

- The retired 12-second launch and 15-second trust MP4s, GIF previews, and
  posters were removed from the public release. Their exact hashes are blocked
  by the staged-index release checker so they cannot be reintroduced silently.
- Current narrated product walkthrough:
  `demos/cutsteward-product-walkthrough-30s.mp4`
  (SHA-256
  `09822c55be4fe00e576f76cbf249daca89b1a6e436458908e826e447df7c1989`,
  15,719,941 bytes). It is 1920x1080, H.264 High/yuv420p limited BT.709,
  exact 30 fps CFR with 900 decoded frames and exact 30.000-second AAC-LC
  48 kHz stereo audio. Full A/V decode, black/blank scan, all 13 caption
  moments, every major seam, separate-run truth boundary, and final CTA passed
  independent QA. Loudness is -16.2 LUFS with -1.0 dBTP.
- The walkthrough uses four authentic local CutSteward screen recordings,
  including a dedicated project-authored public-safe conformance delivery, one
  ElevenLabs Ben/Eleven v3 English narration generation, and Mixkit's `Close
  Up` by Michael Ramir C. Exactly one Image & Video evaluation and one TTS
  submit were made; the observed balance change was 9,067 credits, with no
  retry, upscale, extension, lip sync, music generation, purchase, or top-up.
  The provider documents Image & Video as Beta, so that evaluation is local,
  Git-ignored, and absent from the released master.
- The public master is byte-identical to its QA-passed source render. Its
  CutSteward poster and animated preview were extracted from the immutable
  master, visually reviewed, hashed, placed at the top of the README, and
  recorded in `docs/ASSET_PROVENANCE.md`.

## Completed integration checkpoint

- Exact signed provider-action proposals now sit between Director jobs and raw
  provider adapters. A local user must approve the immutable scope/action hash;
  a generic execution approval cannot authorize a sensitive provider call.
- Rights-gated Pexels/Pixabay search and explicit rendition selection use an
  encrypted, HMAC-protected, bounded local cache. Search/select never downloads
  or claims a license by itself.
- The cockpit displays durable jobs, attempts, receipts, external IDs, and
  truthful planned/running/completed states. It exposes only safe schedule,
  stop, reconcile, cancel, exact provider approval, and supervised-browser
  controls. Irreversible cancellation is enforced again at both API and domain
  boundaries as an authenticated local-user-only action.
- Missing catalogued free tools can be inspected and installed only through an
  exact, one-shot, expiring, command-bound local-user approval followed by a
  post-install probe. Arbitrary scripts, URLs, repositories, elevation, and
  shell interpolation are not accepted.
- The application remains AI-agnostic through native app-server, conformant ACP,
  local CLI handoff, and supervised visible-browser routes. Adapter status is
  capability evidence, not a promise that every website or model is automatable.

## Open operational constraints

- Provider credentials and authenticated website sessions are not present in
  the repository. Real generations cannot be claimed until the user configures
  or signs in and approves an exact action.
- The current filesystem has about 0.2 GiB free. No user data was deleted. Free
  substantially more space (preferably 5–10 GiB or more) before real 4K source
  acquisition, generation, Blender renders, or multi-pass masters.
- This directory was not a Git worktree when implementation began. It is now a
  clean local `main` worktree tracking the public repository at
  `https://github.com/mdshoebkhanking/cutsteward`. The complete source, both
  verified demo masters, MIT license, and macOS/Windows GitHub Actions workflows
  have been published. Release/tag state is external to this file and must be
  verified from the repository's Releases page before it is reported.

## Next operational steps

1. Free additional disk space before a real 4K production run.
2. Create a new run, review the Director plan, and approve only the exact stock,
   voice, or generation proposal shown for that run.
3. Treat the first real provider job as a pilot. Verify downloaded bytes,
   rights/provenance, character continuity, native-detail classification, and
   cost before batch generation.
