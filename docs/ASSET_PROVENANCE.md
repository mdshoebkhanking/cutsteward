# Public asset provenance

This ledger covers media intended for the public repository or release. The
repository MIT License applies to project-authored assets only; provider terms
continue to govern third-party material.

## Project-authored assets

| Asset | Origin and rights | SHA-256 |
| --- | --- | --- |
| `public/assets/verified-film-poster.svg` | Hand-authored vector artwork created for this repository on 2026-08-09. No external image, logo, character, or product source. Released with the project under MIT. | `850129074bee9c86fa48ef89a556f1e24bb9dd485171b9797c1abb988c85bc06` |
| `videos/framepilot-launch-demo/assets/audio/framepilot-original-bed-12s.wav` | Original non-melodic support bed synthesized locally for this project with FFmpeg/Lavfi; no third-party recording or composition. PCM source retained. | `044450e7909e6168ed9c52ba2aa254e095ca807699146989417ead3d573134bc` |
| `videos/framepilot-trust-demo/assets/audio/framepilot-trust-bed-15s.wav` | Original non-melodic support bed synthesized locally for this project with FFmpeg/Lavfi; no third-party recording or composition. PCM source retained. | `8b712198aa0faa79fe23a40c907a075453d511d15ed87374668f40cd7dbd2b13` |
| `demos/posters/cutsteward-launch-demo.jpg` | Branded poster extracted from the immutable final 12-second music-led master. | `9610870a09774bff3ad2fc15716623f83d380139becc7cf4c12b697c27bacbef` |
| `demos/posters/cutsteward-trust-demo.jpg` | Branded poster extracted from the immutable final 15-second music-led master. | `a8f87fcb6559c83958aa438ad9caf1af6db673f8777ea60d8b8261ca1e4b0a97` |

The interface screenshots under `design/` and each demo's `assets/`/`capture/`
folders are local captures of this repository's interface. Any capture that
contains the retired, provenance-incomplete watch poster is a release blocker
and must be recaptured with `verified-film-poster.svg` before the first public
commit.

## Licensed internet footage

The demos use short transformed excerpts from these Pexels videos. Raw source
files stay Git-ignored and are never published as standalone media.

| Demo | Source | Creator | Evidence |
| --- | --- | --- | --- |
| 12-second landscape | [Pexels 30185573](https://www.pexels.com/video/hands-typing-on-laptop-in-modern-office-environment-30185573/) | Jakub Zerdzicki | `videos/framepilot-launch-demo/assets/stock/SOURCE_MANIFEST.json` |
| 15-second vertical | [Pexels 12893579](https://www.pexels.com/video/hands-typing-on-laptop-keyboard-12893579/) | Mizuno K | `videos/framepilot-trust-demo/assets/stock/SOURCE_MANIFEST.json` |

Current license reference: [Pexels License](https://www.pexels.com/legal-pages/license/).
The footage is not a testimonial and does not imply creator or subject
endorsement.

## Released demo masters

| Master | Verified encoding and audio | SHA-256 |
| --- | --- | --- |
| `demos/cutsteward-launch-demo-12s.mp4` | 1920×1080, H.264 High/yuv420p limited BT.709, 30 fps CFR, 360 decoded frames, exact 12.000s; AAC-LC 48 kHz stereo original support bed; no narration. | `395617227b492d0e465fab58acafbf37b06c3d48837e9561399d585ff09a6a1f` |
| `demos/cutsteward-trust-demo-15s.mp4` | 1080×1920, H.264 High/yuv420p limited BT.709, 30 fps CFR, 450 decoded frames, exact 15.000s; AAC-LC 48 kHz stereo original support bed; no narration. | `b41a07aedfb78de6e2b12899fe49470220c6e2ac0412f9aa6817d75f53d1646a` |

Both masters passed full A/V decode. They are transformed mixed-media works;
the MIT grant covers project-authored code, interface artwork, motion design,
copy, and music, while the Pexels source footage remains governed by the source
license recorded above.

## Fonts

The staged Inter font files are covered by the SIL Open Font License 1.1. Each
demo retains the complete `INTER-OFL.txt` notice beside its font files.

## Audio treatment

Both public demos use their original project-authored support beds listed above.
They are intentionally music-led and contain no narration, by user direction.
Their communication is carried by concise English on-screen copy designed for
international English-speaking audiences. No synthetic voice asset is generated,
embedded, or redistributed in either public demo. CutSteward retains optional TTS
provider tooling for other projects, but that capability is not used by these demos.

## Excluded legacy assets

`public/assets/character-storyboard-reference.png` and
`public/assets/watch-poster.png` have incomplete source records. They are
explicitly Git-ignored, are not covered by the MIT grant, and must not appear in
public screenshots, demos, archives, or releases.
