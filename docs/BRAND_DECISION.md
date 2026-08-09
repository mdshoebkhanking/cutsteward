# Public brand decision

Research date: 2026-08-09

## Decision

The public product name is **CutSteward**.

> **CutSteward**  
> **The governed AI video studio.**

The name joins the editing outcome (`cut`) with the product's actual role
(`steward`): agents can research, generate, edit, and verify, while the local
application owns approvals, provenance, receipts, and release evidence.

## Collision screen

The final screen compared CutSteward, SignedCut, and CutConsole across exact and
near search results, GitHub repositories and accounts, npm, PyPI, Apple App
Store results, `.com`/`.ai` registry RDAP responses, and the USPTO public
trademark search.

- **CutSteward** had no exact repository, account, package, app title, indexed
  product, domain registration response, or exact/spaced USPTO result in the
  checks performed that day.
- **SignedCut** was rejected despite a clean exact-name screen because it is
  nearly indistinguishable in speech from [SignCut Pro](https://signcutpro.com/?lang=en),
  an active macOS/Windows creative cutting suite.
- **CutConsole** was rejected because an exact active
  [GitHub project](https://github.com/hilmanzfr/cut-console) exists and the term
  is generic around editing/control hardware.

The screen also found adjacent `Steward`-formative agent tools, including
[`RunSteward`](https://pypi.org/project/runsteward/). That makes the second word descriptive/crowded, but none of those
results used the complete editing-specific compound `CutSteward`. The choice is
therefore a pragmatic low-collision public name, not a claim that the word
`Steward` alone is exclusive.

Reproducible public lookups:

- [GitHub repository search](https://github.com/search?q=CutSteward&type=repositories)
- [npm registry](https://registry.npmjs.org/cutsteward)
- [PyPI](https://pypi.org/project/cutsteward/)
- [`.com` RDAP](https://rdap.org/domain/cutsteward.com)
- [`.ai` RDAP](https://rdap.org/domain/cutsteward.ai)
- [USPTO Trademark Search](https://tmsearch.uspto.gov/)

## Compatibility boundary

The public UI, documentation, demos, package metadata, and generated guidance
use CutSteward. The first public release intentionally retains a small legacy
compatibility namespace for existing local data and proofs:

- `.framepilot/`
- `FRAMEPILOT_*` environment variables
- `X-FramePilot-*` local HTTP headers
- existing cookie, HMAC, actor, and journal namespace strings
- `scripts/framepilot.mjs` as the compatibility launcher
- the two pre-release editable demo directory/composition IDs, so old local
  render receipts and media-relative paths remain reproducible

Changing those identifiers would invalidate or hide existing local state. They
are implementation compatibility surfaces, not the public brand.

## Legal note

This is a preliminary public-source knockout screen, not a legal opinion or a
guarantee that a trademark, domain, or social handle is available. `Steward` is
used in other software marks, so formal clearance remains appropriate before a
commercial trademark filing or large paid launch.
