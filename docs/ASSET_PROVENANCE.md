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
| `demos/posters/cutsteward-product-walkthrough.jpg` | 62,642-byte branded poster extracted from the immutable final 30-second narrated walkthrough master. | `4a7885177eef7e8fb0854de6da36fcb890dee921367b1bd659767ade85809bac` |

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

## Narrated walkthrough sources

The 30-second walkthrough's product evidence comes from four local recordings
of the running CutSteward interface. The capture journey is read-only: it shows
the home prompt and guidance choice, the rights gate, a stored planning run,
and a separate certified local conformance delivery with project-authored test
media, full-decode evidence, SHA-256, and approval state. The planning run and
the certified delivery are unrelated stored runs; the edit retains an explicit
`SEPARATE VERIFIED DELIVERY` bridge and does not claim that the demonstrated
plan produced the certified master. No private run or user-supplied likeness is
included in the release capture.

The remaining media has these distinct roles and rights boundaries:

| Asset | Role and source | Evidence |
| --- | --- | --- |
| ElevenLabs `Ben - Deep, Warm, Conversational`, Eleven v3 | One English narration generation from a logged-in active Grant workspace. ElevenLabs documents Grants as Scale access for product launch and Eleven v3 as generally available. The raw provider file is excluded; the transformed final mix is published subject to the account agreement and current policies. | `videos/cutsteward-30s-promo/ASSET_PROVENANCE.md` |
| Google Veo 3.1 Fast via ElevenLabs Image & Video | One silent four-second 16:9 evaluation was generated once, full-decode checked, and then excluded from the repository and public master because ElevenLabs documents Image & Video as Beta. | `videos/cutsteward-30s-promo/ASSET_PROVENANCE.md` |
| `Close Up` by Michael Ramir C. | Internet-sourced background music from [Mixkit](https://mixkit.co/free-stock-music/tag/corporate/), used under the applicable [Mixkit license](https://mixkit.co/license/). The raw track is excluded and must not be redistributed as a standalone stock download. | `videos/cutsteward-30s-promo/ASSET_PROVENANCE.md` |

Exactly one video-generation submit and one TTS submit were made. The observed
ElevenLabs balance change was `9,067` credits. There was no retry, enhancement,
alternate submit, upscale, extension, lip sync, music generation, purchase, or
top-up; the exact checkpoints and the provider UI discrepancy are retained in
`videos/cutsteward-30s-promo/qa/GENERATION_AND_CREDIT_RECEIPT.md`.

## Released demo masters

| Master | Verified encoding and audio | SHA-256 |
| --- | --- | --- |
| `demos/cutsteward-launch-demo-12s.mp4` | 1920×1080, H.264 High/yuv420p limited BT.709, 30 fps CFR, 360 decoded frames, exact 12.000s; AAC-LC 48 kHz stereo original support bed; no narration. | `395617227b492d0e465fab58acafbf37b06c3d48837e9561399d585ff09a6a1f` |
| `demos/cutsteward-trust-demo-15s.mp4` | 1080×1920, H.264 High/yuv420p limited BT.709, 30 fps CFR, 450 decoded frames, exact 15.000s; AAC-LC 48 kHz stereo original support bed; no narration. | `b41a07aedfb78de6e2b12899fe49470220c6e2ac0412f9aa6817d75f53d1646a` |
| `demos/cutsteward-product-walkthrough-30s.mp4` | 15,719,941 bytes; 1920×1080 progressive, H.264 High/yuv420p limited BT.709, 30 fps CFR, 900 decoded frames, exact 30.000s; AAC-LC 48 kHz stereo exact 30.000s; English narration; -16.2 LUFS / -1.0 dBTP. Full A/V decode passed. | `09822c55be4fe00e576f76cbf249daca89b1a6e436458908e826e447df7c1989` |

All three masters passed full A/V decode. They are transformed mixed-media
works. The MIT grant covers project-authored code, interface artwork, motion
design, and copy. Pexels footage, Mixkit music, and ElevenLabs/provider outputs
retain the separate rights boundaries recorded above.

## README animated previews

These silent GIFs are compact, time-compressed derivatives of the verified
masters above. They exist only so motion is visible directly on the GitHub
repository homepage; each preview links to its full-quality MP4.

| Preview | Transformation | SHA-256 |
| --- | --- | --- |
| `demos/previews/cutsteward-launch-demo.gif` | Complete 12-second master compressed to 6.01s, 640×360, 8 fps, 48 frames, 96-color palette, audio removed. | `0aa1e070f3826b10728da5f5a6ac9bc33cbd3e3507c30c5c49d5a07de48facfb` |
| `demos/previews/cutsteward-trust-demo.gif` | Complete 15-second master compressed to 6.01s, 360×640, 8 fps, 48 frames, 96-color palette, audio removed. | `7ffcc236c235fbf87b687f7aa90ee27eb1abdb1fabba52297c2ee6044a1b65fd` |
| `demos/previews/cutsteward-product-walkthrough.gif` | 1,613,582-byte silent derivative of the verified 30-second master; 640×360, 6 fps, 72 frames, 11.99s. Full decode passed. | `e36e83a0d9ba1dc21f803810b2812d1debcc824fbe3c6d96be15900b1c083647` |

The preview derivatives retain the same mixed-media rights boundary as their
source masters; they are not standalone redistributions of stock footage,
music, narration, or generated video.

## Fonts

The staged Inter font files are covered by the SIL Open Font License 1.1. Each
demo retains the complete `INTER-OFL.txt` notice beside its font files.

## Audio treatment

The 12-second and 15-second public demos use their original project-authored
support beds listed above. They are intentionally music-led and contain no
narration; concise English on-screen copy carries their communication for
international English-speaking audiences.

The 30-second walkthrough uses English ElevenLabs narration over a transformed
excerpt of `Close Up` by Michael Ramir C. Its final AAC-LC mix is exact 30.000s,
48 kHz stereo, measured at -16.2 LUFS / -1.0 dBTP, and passed full decode. The
voice and music remain governed by the service/license boundaries recorded in
the narrated walkthrough section above.

## Excluded legacy assets

`public/assets/character-storyboard-reference.png` and
`public/assets/watch-poster.png` have incomplete source records. They are
explicitly Git-ignored, are not covered by the MIT grant, and must not appear in
public screenshots, demos, archives, or releases.
