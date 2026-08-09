# Premium vertical story reference profile

Status: verified, analysis-only quality profile  
Profile ID: `premium-vertical-reference-36p5-v1`  
Verification date: 2026-08-08

This document records the transferable production grammar of one verified
premium vertical app film. It is a quality benchmark, not a template whose
creative expression or media may be copied.

## Evidence basis

The facts below were verified against the encoded master and the following
paths inside the benchmark evidence package:

- `DELIVERY_MANIFEST.md`
- `STORYBOARD.md`
- `frame.md`
- `assets/video/SOURCE_LEDGER.md`
- `assets/ui/CAPTURE_MANIFEST.md`
- `assets/mockups/blender-phone/BLENDER_MANIFEST.md`
- `audio/VOICE_MANIFEST.md`
- `audio/VOICE_PERFORMANCE_MAP.md`
- `qa/final-master-36p5-v4/FINAL_MASTER_QA.md`

Automated scene detection found only 22 strong visual changes. The authored
storyboard and delivery manifest prove 26 shots and 25 visible changes, so the
authored shot manifest is authoritative.

## Encoded master lock

| Property | Verified value |
| --- | --- |
| SHA-256 | `972ab824c0358d557f13e03bfd5077e693273e00a2fc25af7285fa8e2bd563b8` |
| File size | 182,595,336 bytes |
| Duration | 36.500000 seconds |
| Raster / aspect | 2160×3840 / 9:16 |
| Cadence | 30 fps CFR, exactly 1,095 frames |
| Video | H.264 High, yuv420p, progressive, SAR 1:1 |
| Color | BT.709 primaries, transfer and matrix; limited range |
| Video bitrate | 39,821,478 b/s |
| Audio | AAC-LC, 48 kHz stereo, approximately 192 kb/s |
| Integrated loudness | -16.0 LUFS |
| Loudness range | 4.1 LU |
| True peak | -1.8 dBFS |

The full file decoded without an error. No black-frame event was detected, and
no interval of at least 250 ms fell below -50 dB. Authored product and CTA
holds must not be misclassified as dropped or frozen output.

## Shot and story grammar

Frame ranges use half-open intervals. The exact shot boundaries are:

```text
0, 24, 48, 72, 96, 126, 153, 180, 207, 246, 270, 294,
344, 397, 439, 482, 530, 578, 621, 663, 705, 761, 818,
864, 909, 981, 1095
```

| Story beat | Frames | Time | Shots | Transferable pacing job |
| --- | ---: | ---: | ---: | --- |
| Hook | 0–126 | 0.00–4.20s | 5 | Fast real-character detail: four 0.80s cuts, then a 1.00s hold |
| Friction and turn | 126–294 | 4.20–9.80s | 6 | Three 0.90s cuts, one 1.30s emotional hold, then two 0.80s bridge cuts |
| Product proof | 294–578 | 9.80–19.267s | 6 | Authentic product states held for 1.40–1.77s each |
| Human resolution | 578–864 | 19.267–28.80s | 6 | Calmer 1.40–1.90s performance beats |
| Product CTA | 864–1095 | 28.80–36.50s | 3 | 1.50s return, 2.40s settle, 3.80s final action hold |

This pacing envelope is reusable. The benchmark's actor, setting, ordered shot
ideas, dialogue, music, branding, typography composition and CTA wording are
not reusable expression.

## Real performer and licensed-web truth

Seventeen of the 26 shots use one genuinely photographed performer from three
silent Pexels clips contributed by MART PRODUCTION. All three clips are H.264
High, yuv420p, BT.709, 2160×3840 and 25 fps.

| Source ledger entry | Duration | SHA-256 |
| --- | ---: | --- |
| Pexels asset 7252605 | 18.60s | `4531e217666284c2720150e047bd4aad30311b5562bc57e2ede610b47bf7c6a8` |
| Pexels asset 7252618 | 18.96s | `d1b63de675ae8f738b9b1a28b02483424a22cff62c070803c6646f8c0fda8c44` |
| Pexels asset 7253194 | 17.32s | `6611af6979c3d2dd82401f5b6ad3f7270b10791a4d9603b6012958214c60c617` |

Continuity is supported by the same face, hair, glasses, wardrobe, body,
handedness, device class, location and lighting across one source session.
These visual observations do not verify the performer's identity, exact age,
ethnicity, nationality, religion, customer status or endorsement.

The Pexels license record supports stock usage but does not by itself close a
campaign-specific model or sensitive-context clearance. Paid or public release
must retain a visible clearance gate. The product UI is never placed on the
stock performer's handset.

The benchmark uses no identifiable AI-generated shot. AI footage is therefore
an optional gap-filling route, not part of the reference's minimum source mix.
A real-photographed-only brief must reject generated or avatar humans.

## Voice and audio truth

The narration is synthetic, not a real human recording. It was generated in
the ElevenLabs web application using the displayed `Ben - Deep, Warm,
Conversational` voice and Eleven v3 model. The selected source take has SHA-256
`71ca50aef4c5a8ba9814a47a346c79c344838de11eb1a80505b3d0acadb3e220`.

Verified timing and performance structure:

- 61 scripted words split into 12 phrase-safe clips;
- first speech at 0.50s and final speech boundary at 32.70s;
- approximately 27.83s of active articulation, or 131.5 WPM;
- contained tension moves through recognition and factual relief into a calm
  invitation;
- a 3.80s music-only tail protects the fully resolved CTA;
- narration sidechain-ducks the music with a 15 ms attack and 360 ms release;
- the music receives a 35 Hz high-pass and a restrained narration-space cut.

Technical timing and mix QA passed, but these gates remain open:

- end-to-end human listening;
- human confirmation of the brand-name pronunciation;
- confirmation of the ElevenLabs plan and voice's commercial terms;
- complete provider provenance, because voice ID, seed and request ID were not
  preserved.

CutSteward must label this source as `synthetic voice`. Human-like performance
does not make it a human recording. When a brief requires a real voice, only a
consented human recording may satisfy the voice-origin requirement.

## Blender shell, authentic screen and local composite

The product shots have three distinct provenance layers:

1. Blender renders the physical phone shell, perspective, tilt, highlights and
   finite settle.
2. A real app screen capture supplies the readable product pixels.
3. A local compositor builds the warm proof and CTA stages from those layers.

The truthful evidence label is:

```text
Shell: Blender · Screen: authentic capture · Composite: local
```

The authentic capture has SHA-256
`e8685bafa88d80c7a6e0b105376fd37b1060ae2459fdaa927c7642b9cc75fb86`.
It is H.264 at 1206×2622, 43.858333s, 371 decoded frames and a variable
average rate of approximately 8.46 fps. It was normalized into deterministic
30 fps PNG sequences before device rendering.

The UI remains ungraded and unredrawn. It proves one coherent pre-action,
completion and progress sequence without a fabricated finger, cursor, touch
dot or press highlight. Screen pixels may not be replaced on the real
performer's phone.

The Blender source renders use EEVEE Next, 8 samples, transparent 2160×3840
RGBA frames, Standard view transform, a 70 mm perspective camera, disabled
motion blur and disabled depth of field. Those choices protect screen
legibility.

The release contains nine device editorial shots backed by seven opaque stage
assets:

| Stage | Frames / duration | SHA-256 |
| --- | ---: | --- |
| Proof 01 | 50 / 1.666667s | `142cd12a8c192dc611d2e6e03cf5768eefbdae8341f645c0bfda6d7ee11643d7` |
| Proof 02 | 53 / 1.766667s | `e3d77e1de22011fcb7ef4e38b9fe8a234387d9d851952f225a80ef904d538a25` |
| Proof 03 | 42 / 1.400000s | `d746acf7e5ffeda4d3e435d631add6eae7ffd9584e0852ab13b4700539b3c03a` |
| Proof 04 | 43 / 1.433333s | `d9e873902704006c178037448c08517de7dd63cc7a9aa41a8a42ebf40d3330a9` |
| Proof 05 | 48 / 1.600000s | `443d18ff033b8516a285ab48f7f0fdd4da918e9bfdfb7a3db3cbf76f78fa9959` |
| Proof 06 | 48 / 1.600000s | `25ba4356a94c2a7635aa7eae042485b835aa6c156ec95f5861c0bff64dc0dc3a` |
| Continuous CTA | 231 / 7.700000s | `f8958804210a98e9c0d14f5a3226074de4bbd84b5a0a59264f21a116bfc94a78` |

The CTA stage contains 186 continuous device frames followed by 45 clones of
the resolved pose. This creates a long readable hold without a second phone,
looping float, pulse or scale jump.

### Reuse boundary

CutSteward may safely reuse the method and acceptance rules, but not the
benchmark assets as a generic template:

- Safe: pacing ratios, source-order policy, manifest schemas, authentic-screen
  texture method, finite-motion doctrine, evidence fields and QA thresholds.
- Safe: user-supplied screenshots or screen recordings ingested read-only,
  hashed and mapped to a trusted generic device shell. This does not require
  editing the user's app source.
- Not safe by default: the benchmark `.blend` scenes, framebuffer mask, UI
  frames, branded stages or Python builder. They are project-specific, contain
  fixed project assumptions, and the internal phone shell's creator/license
  record is incomplete.
- Required for CutSteward: a clean-room generic builder, a versioned shell with
  redistribution rights, project-relative inputs, disabled auto-execution and
  a generated device-stage manifest.

For Aura or any other app, ingest fresh approved screenshots/screen video and
leave the app repository unchanged. Source code must never be passed to
Blender, a stock provider or a video-generation provider merely to create the
device proof.

## Caption, lighting and motion grammar

Use four intentional caption roles rather than one repeated bottom pill:

1. a large sequential hook;
2. a boxless documentary subtitle;
3. one restrained editorial impact phrase;
4. a compact product callout kept clear of the device.

Text follows the spoken phrase rather than flashing every word. Product copy
uses the top or side corridor; documentary captions protect the face, hands,
phone silhouette and critical UI. The final CTA resolves before its hold.

Real footage uses restrained portrait treatment with plausible skin, fabric
and practical highlights. Product proof uses a localized warm stage and soft
grounding shadow. The resolution moves to a lighter, high-key field.

Hard cuts and velocity-matched cuts carry the rhythm. Motion is finite and
deterministic: enter, reframe, prove, settle, then stop. Reject perpetual
orbits, bounce, breathing scale, particles, decorative flashes, glow sweeps,
screen-obscuring blur and back-half camera drift.

## Originality constraints

Every CutSteward production using this profile must make at least three
deliberate departures from the benchmark:

- create a product-specific character, setting and truthful action;
- design a different proof progression and camera path around the current
  authentic UI;
- create original script, typography, palette, music, captions and CTA.

Never copy the benchmark dialogue, performer media, ordered shot ideas, music,
brand artwork, UI, caption artwork, CTA wording or product claims. A reference
profile transfers structure and measurable quality, not protected expression.

## Minimal Director fields

The premium UI should derive from one compact `DirectorBoard`:

| Field | Purpose |
| --- | --- |
| `storyBeats` | Five proportional beats with frame range, shot count and status |
| `shots` | Exact half-open frame ranges and one `primarySourceLaneId` per shot |
| `productionMix.character` | Realness policy, continuity reference, shots and clearance |
| `productionMix.webClips` | Local/hash count, license evidence and fallback |
| `productionMix.aiShots` | Applicability, disclosure, provider evidence or `off` |
| `productionMix.blenderMockups` | Shell, screen, composite, stage count and fallback truth |
| `productionMix.voiceSound` | Human/synthetic origin, timing, mix evidence and open listens |
| `now` | One observed job, receipt, progress and last observation time |
| `openDecision` | Exact provider/tool, uploaded classes, cost, hash and fallback |
| `releaseEvidence` | Collapsed technical passes and external gates |

Recommended row states are `off`, `planned`, `needs_setup`, `needs_approval`,
`working`, `review`, `ready` and `blocked`. A static plan must never display a
live `working` or `ready` state without observed receipts and approved evidence.

## CutSteward acceptance checklist

- [ ] Master profile, duration, cadence, frame count, color and audio targets
  are explicit before acquisition.
- [ ] The shot rail covers every frame exactly once with no gap or overlap.
- [ ] Opening cuts are materially faster than product-proof and resolution
  holds; the final CTA has at least 3.0s fully resolved.
- [ ] Every shot has one primary source, an approved keeper or a truthful
  fallback, and immutable provenance.
- [ ] A real-character requirement is satisfied only by consented or
  appropriately licensed photographed footage.
- [ ] Every web clip records provider asset ID, creator, canonical source,
  license record, access time, native specs, SHA-256 and clearance status.
- [ ] AI footage is disclosed and cannot provide authentic product proof or
  silently replace a real-only character.
- [ ] Voice origin is explicit; a real-voice requirement rejects synthetic
  narration, and synthetic voice retains commercial-rights and human-listen
  gates.
- [ ] Device evidence separately identifies Blender shell, authentic screen
  capture and local composite; the app source remains untouched.
- [ ] Captions protect faces, hands, device edges, UI and platform safe zones;
  resolved shots stop moving.
- [ ] Encoded media passes full decode, black/freeze interpretation, A/V
  duration, loudness, true-peak, caption and critical-frame QA.
- [ ] Release cannot be inferred from an agent message, process exit, provider
  job state or technical master alone; open rights, consent, listen, upload,
  spend and publish decisions remain visible.
