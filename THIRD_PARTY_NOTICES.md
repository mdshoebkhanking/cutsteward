# Third-party notices

CutSteward's source code is released under the repository's [MIT License](LICENSE).
That license does **not** replace the licenses or terms attached to third-party
fonts, stock media, models, APIs, websites, or generated outputs.

## Demo stock footage

The 12-second and 15-second published demo videos contain transformed excerpts
from Pexels footage. The raw stock files are intentionally excluded from the
repository.

- Pexels video 30185573, “Hands Typing on Laptop in Modern Office Environment,”
  by Jakub Zerdzicki: https://www.pexels.com/video/hands-typing-on-laptop-in-modern-office-environment-30185573/
- Pexels video 12893579, “Hands Typing on Laptop Keyboard”: https://www.pexels.com/video/hands-typing-on-laptop-keyboard-12893579/
- Pexels license: https://www.pexels.com/legal-pages/license/

Each demo's `assets/stock/SOURCE_MANIFEST.json` records the exact source URL,
download URL when known, source hash, rendition metadata, and transformation
policy. Pexels footage does not imply that any depicted person endorses
CutSteward.

## Narrated walkthrough media

The 30-second governed product walkthrough uses authentic CutSteward interface
recordings plus the following third-party media:

- English narration generated once on the ElevenLabs Text to Speech website
  with `Ben - Deep, Warm, Conversational` and the Eleven v3 model.
- One silent, four-second Google Veo 3.1 Fast evaluation was generated through
  ElevenLabs Image & Video but is excluded from the public repository and
  released master because ElevenLabs documents Image & Video as a Beta service.
- `Close Up` by Michael Ramir C. from
  [Mixkit's corporate music collection](https://mixkit.co/free-stock-music/tag/corporate/),
  used under the applicable [Mixkit license](https://mixkit.co/license/). The
  raw track is excluded and must not be redistributed as a standalone stock
  download.

The narration was generated with Eleven v3 while the authenticated workspace
showed an active ElevenLabs Grant plan. ElevenLabs documents the Grant as Scale
access for building, testing, and launching a product, and documents Eleven v3
as generally available. Use remains subject to the account agreement, voice
rights, and current provider policies. The raw narration output is excluded;
only the transformed mixed soundtrack is distributed. The walkthrough also
states its evidence boundary truthfully: the planning demonstration and the
certified public-safe conformance delivery shown later are separate stored runs.

The full public-media ledger, including project-authored SVG/audio assets,
provider-output facts, derived posters and previews, excluded legacy files, and
generation/credit receipts, is in
[docs/ASSET_PROVENANCE.md](docs/ASSET_PROVENANCE.md).

## Fonts

The Inter font files used in the demo compositions are distributed under the
SIL Open Font License 1.1. The complete notice is retained beside each staged
font bundle as `INTER-OFL.txt`.

## Runtime libraries and services

- GSAP is referenced by some demo compositions. Its use remains subject to
  GreenSock's current license and terms: https://gsap.com/licensing/
- Google Gemini, ElevenLabs, Google Veo/Flow, Pexels, Pixabay, CapCut, Blender,
  FFmpeg, Playwright, and other named tools remain subject to their own terms,
  acceptable-use policies, licenses, quotas, and privacy rules.
- A provider adapter or catalog entry is not a grant of credentials, content
  rights, commercial rights, likeness consent, or authority to spend or upload.

Before redistributing a rendered demo or replacing its assets, verify the
rights for the intended territory, audience, platform, and commercial use.
