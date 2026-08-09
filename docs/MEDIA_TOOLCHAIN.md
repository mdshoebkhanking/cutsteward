# Media toolchain contract

CutSteward separates a portable local app from machine-level production tools.
`toolchain/media-tools.json` is the machine-readable source of truth. Agents
must probe first, install only declared targets, and probe again.

This repository has the `capcut-draft-bridge` pack explicitly selected by the
product owner, so the small zero-runtime-dependency `capcut-cli` package is part
of the ordinary project lockfile. Other media tools remain machine-level or
workflow opt-ins. This is a deliberate exception to the lean-default
recommendation in the research memo, not a claim that CapCut is universally
required.

FFmpeg/FFprobe are also available as exact project-local optional packages on
admitted macOS and Windows x64 targets. Their executable SHA-256 values are
checked before readiness, so ordinary setup and verification do not require
Homebrew. A compatible system installation remains the fallback for other
supported Windows architectures.

## Commands

- `npm run tools:doctor` detects declared CLIs and desktop apps without running
  render jobs.
- `npm run tools:plan` prints the exact platform plan and manual boundaries.
- `npm run tools:catalog` prints researched opt-in packs and every gate without
  installing them.
- `npm run tools:install -- --approve` installs missing required tools through a
  detected OS package manager.
- `npm run tools:install -- --approve --all` also attempts catalogued large
  optional tools such as Blender.
- `npm run setup:full` runs full tool installation, app setup, health checks,
  and browser launch.
- `npm run video-use:doctor` checks the quarantined, exact-commit
  `browser-use/video-use` source without installing its Python environment or
  reading credentials.
- `npm run video-use:smoke` is a disposable, offline render test. It remains
  blocked unless the admitted commit, clean tree, Python >=3.10, and verified
  FFmpeg/FFprobe are present.

Package managers may need network access, administrator rights, or an
interactive prompt. A headless agent must surface that boundary instead of
claiming completion. CutSteward supports Homebrew on macOS and WinGet on
Windows. Linux and other operating systems are intentionally outside the
product support contract.

## Capability truth

- FFmpeg is the baseline macOS/Windows CLI for inspection, transcode,
  composition, audio, caption, and exact-file QC. The official project documents
  the `ffmpeg`, `ffprobe`, and related command-line tools:
  https://ffmpeg.org/documentation.html
- `capcut-cli` is an independent MIT-licensed community project, not an official
  ByteDance/CapCut product. CutSteward installs it locally from the npm lockfile
  at exactly `0.17.2`; global and floating installs are not used. Versions up to
  `0.17.0` are forbidden because the maintainer documents command-injection and
  path-handling fixes in `0.17.1`. The adapter may inspect/edit local drafts,
  add subtitles/templates, and use the JSONL runner. A person still reviews the
  draft in CapCut Desktop and performs the final export/publish:
  https://github.com/renezander030/capcut-cli
- Blender documents background rendering and Python-capable command-line
  operation. Untrusted `.blend` auto-execution remains disabled unless the user
  explicitly trusts it:
  https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html
- CapCut's official desktop material documents Windows/macOS GUI installation.
  CutSteward therefore keeps the official app as a detected desktop handoff and
  never presents the community CLI as an official command adapter:
  https://www.capcut.com/resource/capcut-desktop-download
- Remotion is a project extension, not a global prerequisite. Add it at a pinned
  version only when a selected workflow needs React-based rendering:
  https://www.remotion.dev/docs/

## Repositories

There is no safe finite set of “all video repositories.” A workflow may declare
a repository with an exact URL, commit, license, expected commands, disk budget,
and sandbox. The user must approve the first download. The agent then clones it
under `.framepilot/tools`, verifies the commit, runs its documented local setup,
and records the probe. Floating branches, unsigned binaries, `curl | sh`, and
arbitrary install instructions are rejected by default. The curated research
ledger is kept in `docs/GITHUB_MEDIA_ECOSYSTEM.md`; admission to the executable
toolchain still requires a pinned release or commit, a compatible license, a
documented non-interactive interface, and a successful local probe.

`browser-use/video-use` is the first quarantined repository admission. It is
pinned at commit `92c2b34e44c205cbc2acae7f6ca7c1c219d5dd66` and is not
symlinked into any ambient agent skill directory. Its transcript-first EDL and
render helper are useful, but direct production activation is withheld because
the upstream dependency set is not locked, cloud transcription needs a
separate upload/spend decision, and macOS/Windows conformance is not yet
proven. The wrapper never reads an upstream `.env` or runs mutable installers.
