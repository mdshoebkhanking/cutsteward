# CapCut agent contract

CutSteward uses the independent community package
[`capcut-cli`](https://github.com/renezander030/capcut-cli) at the exact locked
version in `package.json`. It is not affiliated with ByteDance. Agents must use
the project-local binary through npm or `node_modules/.bin`; do not install a
second global copy.

## Safe operating sequence

1. Run `npm run capcut:doctor` and disclose every warning that affects the
   requested operation.
   `npm run capcut:smoke` is the repeatable disposable draft/proxy-render
   conformance check; it never edits the user's CapCut draft store.
2. Run `capcut version <draft>`, `capcut diagnose <draft>`, and
   `capcut lint <draft>` before editing an existing draft.
3. Close CapCut/JianYing before a write. Respect the CLI's editor-running,
   changed-on-disk, and version-boundary checks.
4. Run every mutating command with `--dry-run` first and inspect its JSON.
5. Perform the approved write, then run `capcut lint` and `capcut diff` against
   the preserved source or snapshot.
6. Open the draft in CapCut Desktop for human visual review. `capcut render`
   produces an FFmpeg proxy and must never be labelled the final CapCut render.
7. Publishing, upload, paid translation, or experimental UI-driven batch export
   requires a fresh explicit approval.

## Hard prohibitions

- Never pass `--force-write` merely to bypass an editor/version safety refusal.
- Never pass `--force-license` without documented rights approval.
- Never place a secret in `--api-key`, a prompt, a queue row, a log, or project
  data. Translation credentials stay in the owning environment.
- Never edit an untrusted draft with a `capcut-cli` version below `0.17.1`.
- Never treat an exit code, generated JSON, or proxy as proof that a person
  watched the result.

## Agent discovery

`capcut describe` emits the installed command surface as JSON. `capcut serve`
accepts stateless JSONL jobs over stdin for a future CutSteward adapter; it is
not a network daemon. An adapter must use argument arrays with `shell: false`,
keep jobs inside approved project/draft roots, bound output and runtime, redact
environment values, and return the CLI's real exit code and JSON unchanged.

Useful non-destructive commands:

```sh
npm run capcut -- describe
npm run capcut -- projects --names
npm run capcut -- info <draft>
npm run capcut -- timeline <draft>
npm run capcut -- export-timeline <draft> --out <file.otio>
```

The authoritative installed documentation is under
`node_modules/capcut-cli/docs`. The repository's public README, changelog, and
release notes remain the source for upgrade/security review.
