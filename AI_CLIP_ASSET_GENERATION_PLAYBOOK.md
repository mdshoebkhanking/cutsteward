# AI Clip and Asset Generation Agent — Detailed Production Playbook

Version: 1.0  
Official-provider capability snapshot verified: 2026-08-08  
Purpose: one portable file explaining exactly how an AI agent should find,
create, generate, repair, approve, and hand off every visual and audio asset
needed for a professional video.

This is the detailed acquisition companion to
`UNIVERSAL_AI_VIDEO_AGENT_WORKFLOW.md`. The universal workflow controls the
whole film. This file goes deeper on clips, stock, character sheets, reference
photos, image-to-video, text-to-video, Google Flow/Gemini, ElevenLabs, local
fallbacks, provider failures, asset QA, and continuity.

It is not tied to IQAMA or any single app. Use it for any app, SaaS product,
physical product, service, campaign, explainer, story, or short film.

---

## 0. How to use this file

Give this file, the locked script/animatic, project profile, reference media,
brand files, and available source assets to the executing AI agent. Then send:

> Read `AI_CLIP_ASSET_GENERATION_PLAYBOOK.md` completely. Build every required
> asset from the locked shot plan. Reuse or capture truthful material before
> generating. Create and lock character/reference packages before continuity
> shots. Install only the missing selected tools from official sources. Run a
> pilot before a paid batch. Save every acquisition attempt/provider job,
> prompt, reference, cost,
> download, hash, rejection, and fallback. If the first attempt fails, diagnose
> one dominant defect and change one variable. If the same route fails twice,
> stop retrying it and advance to the next predeclared fallback. Do not stop at
> prompts or submitted jobs; continue until every timeline slot points to an
> approved immutable asset that passes source and in-edit QA.

This file never grants account access, installation rights, cloud-upload
permission, budget, licenses, likeness rights, or authority that the user and
host do not already have. Applicable law, provider terms, system/developer/
organization/host instructions, project instructions, and current user
authority outrank this file.

### 0.1 What counts as complete

A shot is complete only when all applicable items exist:

1. one immutable approved source file or deterministic designed asset;
2. source page/job/history reference and acquisition date;
3. exact prompt, references, settings, model/surface, and attempt history when
   generated;
4. rights, consent, privacy, upload, cost, and provenance record;
5. clean full decode/probe and SHA-256;
6. visual/temporal keeper-gate pass;
7. continuity and effective-detail pass in the actual delivery crop;
8. placement in the real animatic/edit with captions, transitions, and sound;
9. rejection reason for every non-keeper; and
10. a next fallback or a genuine hard blocker for every unresolved slot.

A prompt, screenshot of a provider page, submitted job, temporary URL,
watermarked preview, unreviewed download, contact sheet, or pretty still is not
a completed video asset.

### 0.2 Exact attempt, strategy, and variant semantics

Use these terms consistently in the profile, state, job record, metrics, and
handoff:

- `strategy_id` identifies one route strategy for one shot: acquisition route,
  provider, product, model, generation mode, reference method, aspect, and
  strategy-core controls. Shot-specific action wording and one declared
  controlled repair do not create a new strategy. Changing provider, model
  family, T2V/I2V/reference mode, reference architecture, stock/custom/capture
  route, or deterministic design method does.
- `route_attempt_index` starts at 1 for each `shot_id + strategy_id` and counts
  an executed acquisition/generation attempt after preflight.
- `shot_attempt_index` starts at 1 for the shot and increases across every
  strategy and fallback route. It provides one global audit trail.
- A cloud/website `submission_attempt` is a request that was accepted, charged,
  or may have been charged. A local generation/render after successful
  preflight also consumes one route/shot attempt, but it has no provider charge.
- One submission may return several variants. It is one attempt for retry and
  billing purposes. Evaluate every returned variant separately; the attempt
  passes only when at least one variant passes both the source and integration
  keeper gates. It fails only when no returned variant passes both gates.
- Replacing one or more exact reference files while preserving the same
  reference method, role map, role count, and canonical identity/look package
  is one controlled R02 repair inside the same strategy. Changing the reference
  method, number/meaning of roles, role map, or mode—for example Ingredients to
  first-frame I2V—creates a new registered strategy and resets only its
  `route_attempt_index`.
- A local validation/preflight error before execution consumes no attempt. A
  timeout after ambiguous submission consumes one; it becomes
  `unknown_charged` until reconciled and must not be resubmitted.

“First failure” and “second failure on the same route” therefore mean
`route_attempt_index` 1 and 2 for the same `shot_id + strategy_id`, not two
arbitrary prompt files or two rejected variants from one submission.

For non-provider routes, one attempt is one bounded execution against one
locked shot requirement and strategy:

| Route | One attempt | Variants returned by that attempt |
|---|---|---|
| Existing/user/official/archive | One complete indexed candidate-set evaluation from the declared sources | All distinct candidate files/subranges evaluated in that set |
| Licensed stock | One bounded search/acquisition session using one declared library/source/query strategy and rights filter | All candidates downloaded/shortlisted in that session |
| Authentic capture | One scripted capture run from a locked start state through the declared action | Its clean recordings/takes/exports |
| Commissioned/custom shoot | One authorized shoot/retake session for the locked setup and shot requirement | All takes from that session |
| Designed/3D production | One build/render execution of the locked scene/design strategy | Its passes, angles, or declared output variants |
| Local generation | One launched batch/workflow execution with fixed strategy-core settings | All returned seeds/variants from that execution |
| Cloud generation | One accepted or possibly accepted external submission | All outputs returned by that request |

An unlimited web scroll is not an attempt; bound the source/query/time/candidate
ceiling first. A cosmetic trim is not a new attempt. A materially different
library, capture setup, shoot setup, design method, generation mode, or
reference architecture is a new strategy. The two-failure rule applies to two
executed attempts under the same `shot_id + strategy_id`, not to two individual
takes/variants inside one session.

### 0.3 Portable capability translation

Named tools are adapters, not requirements. Translate them into capabilities:

- workspace/file inspection;
- official web research;
- authenticated browser control;
- API/CLI calls;
- local shell and file editing;
- image/video/audio viewing and listening;
- media probe/decode/transcode;
- optional subagents; and
- bounded wait/poll.

If one branded provider is missing, use its official website/API/CLI, a current
compatible provider, licensed stock, custom capture, designed motion, or a
local model. Never stop merely because a plugin name is absent.

---

## 1. Truth origin and acquisition route — keep them separate

Every shot and source receives two orthogonal labels. `truth_origin` describes
what the pixels/samples actually are. `acquisition_route` describes how the
project obtained them. Never infer truth from the route: licensed stock may be
real photographed footage, designed motion, or synthetic media.

| `truth_origin` | Meaning | May be called “real”? | Example |
|---|---|---:|---|
| `real_photographed` | A real camera recorded the real person/place/object | Yes, with rights | User footage, photographed stock, custom shoot |
| `authentic_product_capture` | The current real app/site/device/product state was captured | Yes | Simulator, emulator, browser, device, controlled shoot |
| `synthetic_photoreal` | AI-generated imagery designed to look photographic | No | T2I, T2V, I2V, V2V |
| `designed_motion` | Vector, type, UI, 2D/3D, procedural, or composited motion | No claim of live capture | Blender, HTML, motion graphics, compositor |
| `documentary_archive` | Historical/editorial recording with its own restrictions | Only as documented | News/historical archive |
| `real_recorded_audio` | A real microphone recorded a performance/environment | Yes, within consent/rights | Human VO, location sound, recorded foley |
| `synthetic_audio` | Model-generated voice, music, ambience, or SFX | No claim of human/location recording | TTS, generated music/SFX |
| `designed_audio` | Deterministically edited/composed audio without a live-recording claim | Only as an authored mix/design | Sound design, edit, composite, mix |

Use one `acquisition_route` from:

```text
existing_project | user_supplied | official_product_asset | licensed_stock |
authentic_capture | commissioned_shoot | designed_production |
local_generation | cloud_generation | archive_source
```

An official product asset also records its underlying `truth_origin`; an
official logo may be `designed_motion`, while official live product footage may
be `real_photographed`. A stock asset also records whether it is photographed,
synthetic, designed, or archival. Real-human-only eligibility is evaluated
from `truth_origin`, never from `licensed_stock` or another acquisition label.

### 1.1 Hard truth gates

These gates run before provider scoring:

- If the brief requires **100% real human footage**, synthetic people are
  ineligible even if photorealistic. Use approved user footage, a licensed
  matched stock series, or a commissioned shoot.
- Exact app UI, product behavior, notifications, metrics, prices, ratings,
  legal copy, labels, logos, store badges, or physical results require an
  authentic capture or current official asset. Never ask a video model to
  invent them.
- A generated phone can be hardware decoration, but its screen must use
  authentic pixels when it proves a product claim.
- Exact readable text and brand marks are composed deterministically in post.
- A stock actor is not automatically a customer, employee, Muslim, patient,
  believer, owner, user, or endorser. Do not imply those identities without
  suitable permission and evidence.
- Visual casting appearance is not proof of nationality, religion, exact age,
  medical status, or personal biography.
- A 2160×3840 container is not automatically native-detail 4K. Record the
  effective source pixels after crop and scale.
- A still with a 2.5D push is designed motion, not generated/live action.

### 1.2 What must never be faked

Never fabricate or falsely claim:

- a real person, model release, likeness/voice consent, or testimonial;
- authentic UI/product capture;
- a current product state, price, offer, metric, or performance result;
- source license, paid-ad scope, territory, term, or attribution permission;
- provider/job/charge status;
- native resolution, provenance mark, content credential, or clean-master
  entitlement;
- “real 3D” when the object is only a flat screenshot;
- manual watching/listening or qualified cultural/domain approval that did not
  occur; or
- a removed watermark. Obtain the authorized clean export or change source.

---

## 2. Clip-production profile

Create this profile before searching, uploading, or generating. Resolve every
angle-bracket value before the first paid/quota-consuming submission.

```yaml
clip_project:
  id: "<stable project id>"
  locked_script_sha256: "<hash>"
  locked_animatic_sha256: "<hash>"
  target_duration_seconds: "<exact decimal>"
  target_aspect_ratio: "<9:16|16:9|1:1|other>"
  target_resolution: "<width>x<height>"
  target_fps: "<rational fps>"
  target_color_pipeline: "<declared managed pipeline>"

audience_policy:
  master_language: "English"
  script_voice_caption_callout_cta_language: "English"
  default_voice_accent: "neutral American English"
  market_scope: "international_english"
  primary_target_countries: ["United States"]
  conditional_secondary_countries: ["Canada", "United Kingdom", "Australia", "New Zealand"]
  country_market_gates:
    United States:
      product_and_feature_availability: "<pass|fail|unverified>"
      legal_and_platform_rules: "<pass|fail|unverified>"
      cultural_and_localization_fit: "<pass|fail|unverified>"
      cta_destination_and_offer: "<pass|fail|unverified>"
      evidence_references: []
      reviewer: "<authorized reviewer>"
      status: "<eligible|blocked|pending>"
  localized_market_variants: []

truth_policy:
  human_source_policy: "<real_photographed_only|synthetic_permitted|no_human>"
  product_proof_policy: "authentic_capture_or_official_asset_only"
  generated_text_policy: "deterministic_post_only"
  synthetic_disclosure_policy: "<platform/jurisdiction rule>"

character_policy:
  recurring_characters: []
  real_likeness_allowed: false
  real_likeness_consent_reference: null
  voice_clone_allowed: false
  voice_clone_consent_reference: null

source_policy:
  route_order:
    - "approved existing asset"
    - "user-supplied asset"
    - "licensed stock"
    - "authentic self-capture"
    - "designed motion or verified 3D"
    - "custom shoot"
    - "local generation"
    - "authorized cloud generation"
  permitted_stock_libraries: []
  approved_external_providers: []
  cloud_permitted_asset_classes: []
  confidential_media_stays_local: true

generation_policy:
  default_attempts_per_route: 2
  maximum_executed_attempts_per_shot: "<bounded integer across all fallbacks>"
  variants_per_attempt: "<bounded integer>"
  pilot_before_batch: true
  max_concurrent_provider_jobs: 1
  minimum_keeper_pass_rate: "<declared percentage>"
  maximum_cost_per_shot: "<amount and currency or 0>"
  maximum_total_cash: "<amount and currency>"
  authorized_quota_buckets: {}

quality_policy:
  minimum_effective_dimensions: "<after crop/scale>"
  identity_drift_allowed: false
  anatomy_defect_allowed: false
  unreadable_generated_text_allowed: false
  watermark_allowed: false
  unknown_license_allowed: false
  perceptual_reviewer: "<agent capability or authorized human>"
```

### 2.1 Preflight gate

Before acquisition begins, verify:

1. script and animatic hashes are locked;
2. every shot has a narrative job and frame range;
3. every source/shot declares both `truth_origin` and `acquisition_route`;
4. cloud uploads are authorized per provider and asset class;
5. all recognizable-person and voice uses have appropriate consent/licensing;
6. stock/commercial/paid-ad requirements are known;
7. cash, prepaid, included-subscription, free, and genuinely pooled quota are
   separately bounded;
8. attempt, concurrency, disk, and time ceilings are known;
9. output aspect/resolution/FPS and effective-detail floor are known; and
10. the agent can actually view/listen or has an authorized reviewer path.

Do not replace an unknown value with zero, “unlimited,” or a guess.

### 2.2 Owner default — English international-market mode

Unless the project brief explicitly overrides this owner preference, the
master video is English-only:

- script, narration, dialogue intended for the audience, captions, kinetic
  type, product callouts, disclaimer copy, end card, and CTA are English;
- do not silently write or deliver the master in Urdu, Hindi, Hinglish, or a
  mixed language;
- calibrate the primary creative for the United States with clear natural
  English and a neutral American-English voice, not a forced announcer accent;
  and
- treat Canada, the United Kingdom, Australia, New Zealand, and other external
  English-speaking markets as separate eligible targets only after verification,
  not as one vague “foreign countries” audience.

Before producing or distributing for each country, the research/intake agent
must add that country as its own `country_market_gates` record and verify:

1. the product/app, landing page, deep link, store listing, price/offer, and
   required feature are actually available there;
2. current advertising/platform rules, required disclosure, age/audience
   limits, privacy expectations, and any regulated/sensitive-category rule;
3. spelling, idiom, pronunciation, cultural/religious context, units, currency,
   date/time format, store badge, legal copy, and CTA destination;
4. whether the same master is genuinely suitable or a market-specific script,
   VO, caption, UI, proof, offer, or CTA variant is required; and
5. that every localized variant receives its own immutable asset mapping,
   native-language review where applicable, and full master QA.

One global boolean can never clear several countries. A country becomes
eligible only when all four gate statuses pass, evidence and reviewer are
recorded, and its aggregate `status` is `eligible`; otherwise it remains
pending or blocked and receives no targeted export/ad launch.

Market targeting never proves that a visible actor is American, British,
Canadian, Australian, or from any other country. Cast by authorized visual and
performance requirements, and describe nationality only when documented and
necessary. Do not label European/other footage as U.S.-filmed, invent local
landmarks, or imply local availability from appearance alone. If availability
or legal/cultural fit cannot be verified, exclude that country rather than
making a generic international claim.

---

## 3. Project files, IDs, and immutable lineage

Use a self-contained structure or map these records into the host project's
existing convention:

```text
clip-production/
  PROFILE.yaml
  SHOT_REQUIREMENTS.md
  SHOT_ACQUISITION_MATRIX.md
  CHARACTER_BIBLE.yaml
  CONTINUITY_LEDGER.json
  STRATEGY_REGISTRY.json
  PRECONDITION_EVENTS.jsonl
  ACQUISITION_ATTEMPTS.jsonl
  PROVIDER_REGISTRY.md
  STATE.json
  RUN_LOG.md
  ASSET_MANIFEST.json
  prompts/
    images/
    videos/
    audio/
  references/
    characters/
    wardrobe/
    props/
    locations/
    style/
  raw/
    user/
    capture/
    stock/
    generated/
  rejected/
  approved/
    images/
    video/
    audio/
  qa/
    source/
    integration/
  licenses/
  redacted-delivery/
```

### 3.1 Stable identifiers

- Shot: `S<scene>_SH<shot>`, for example `S02_SH040`.
- Continuity group: `CG_<name>_v<version>`.
- Character: `CHAR_<name>_v<canon>`.
- Wardrobe: `WARD_<character>_<look>`.
- Prop: `PROP_<name>_v<version>`.
- Location: `LOC_<name>_<time-weather>`.
- Strategy: `STRAT_SG<zero-padded-project-sequence>_v<version>`, for example
  `STRAT_SG0001_v01`.
- Strategy slug: the exact registered code plus version without punctuation,
  for example `SG0001v01`.
- Acquisition attempt:
  `ATT_<shot>_<strategy-slug>_R<route-attempt>_S<shot-attempt>`.
- Asset:
  `AST_<shot>_<strategy-slug>_R<route-attempt>_S<shot-attempt>_V<variant>`.

Register strategies atomically in `STRATEGY_REGISTRY.json`: allocate the next
unused project sequence, never recycle a code, and map it to the complete
canonical strategy-core object (route, provider/product/model, mode, reference
method, aspect, duration class, and core controls). A material strategy change
creates the next registered code; a revision of the same registered strategy
increments its version. The registry rejects duplicate IDs/slugs and different
core objects mapped to one ID. Never derive or truncate an informal provider
name into a slug. Both attempt indices and the exact registered strategy slug
are mandatory, so two providers/models/modes cannot collide after
`route_attempt_index` resets. External provider request/history IDs remain
separate fields and are never used as portable filenames.

Never overwrite an approved asset or canonical reference. A redesign creates a
new version and reopens dependent continuity checks.

### 3.2 File naming

Use deterministic names:

```text
S02_SH040_SG0001v01_R01_S02_V02.mp4
CHAR_A_v01_face-3q-left.png
LOC_train-interior_evening_v02.png
VOICE_hook_elevenlabs_A03.wav
```

The name is for humans; the SHA-256 is the actual identity.

### 3.3 Minimal resume-record schemas

The following envelope shows the required core of four separate records. Store
each named value in its matching file; do not literally combine private state
into one delivery document.

```json
{
  "STATE.json": {
    "schema_version": "1.0",
    "project_id": "PROJECT_ID",
    "profile_sha256": "...",
    "script_sha256": "...",
    "animatic_sha256": "...",
    "status": "intake|preflight|acquiring|source_qa|integration_qa|complete|blocked",
    "updated_at": "ISO-8601",
    "counters": {
      "next_strategy_sequence": 2,
      "next_shot_attempt_by_shot": {"S02_SH040": 3},
      "next_route_attempt_by_shot_strategy": {"S02_SH040|STRAT_SG0001_v01": 2}
    },
    "active_intent_ids": [],
    "active_attempt_ids": [],
    "attempt_ledger_path": "ACQUISITION_ATTEMPTS.jsonl",
    "attempt_ledger_sha256": "...",
    "unresolved_shots": [
      {
        "shot_id": "S02_SH040",
        "fallback_cursor": 0,
        "status": "unresolved|in_progress|approved|blocked",
        "exact_next_action": "..."
      }
    ],
    "billing_exposure_ids": [],
    "exact_next_action": "..."
  },
  "STRATEGY_REGISTRY.json": {
    "schema_version": "1.0",
    "next_sequence": 2,
    "strategies": [
      {
        "strategy_id": "STRAT_SG0001_v01",
        "strategy_slug": "SG0001v01",
        "status": "active|retired|superseded",
        "core": {
          "acquisition_route": "cloud_generation",
          "generation_mode": "image_to_video",
          "provider": "provider-or-null",
          "product": "surface-or-null",
          "model": "model-or-null",
          "reference_architecture": {
            "method": "exact_start_still_plus_identity",
            "roles_in_order": ["start_frame", "identity"],
            "role_count": 2
          },
          "aspect": "9:16",
          "duration_class": "short_clip",
          "core_controls_sha256": "..."
        },
        "created_at": "ISO-8601"
      }
    ]
  },
  "PRECONDITION_EVENTS.jsonl record": {
    "schema_version": "1.0",
    "event_id": "PCE_S02_SH040_SG0001v01_P003_R001",
    "intent_id": "INT_S02_SH040_SG0001v01_P003",
    "revision": 1,
    "previous_event_id": null,
    "shot_id": "S02_SH040",
    "strategy_id": "STRAT_SG0001_v01",
    "attempt_id": null,
    "route_attempt_index": null,
    "shot_attempt_index": null,
    "status": "open|failed_no_attempt|passed_promoted|superseded",
    "checks": {
      "truth": "pass|fail|pending",
      "rights_consent": "pass|fail|pending",
      "privacy_upload": "pass|fail|pending",
      "capability_inputs": "pass|fail|pending",
      "visible_cost_budget": "pass|fail|pending"
    },
    "failure_code": null,
    "created_at": "ISO-8601",
    "updated_at": "ISO-8601",
    "exact_next_action": "..."
  },
  "CONTINUITY_LEDGER.json": {
    "schema_version": "1.0",
    "groups": [
      {
        "continuity_group_id": "CG_CHAR_A_W01_v01",
        "status": "draft|locked|reopened|passed|failed",
        "canonical_asset_ids": [],
        "canonical_hashes": [],
        "identity_look_location_anchors": {},
        "shot_boundaries": [
          {
            "shot_id": "S02_SH040",
            "in_state": {},
            "out_state": {},
            "appearance_in_out": {},
            "prop_in_out": {},
            "review_status": "pending|passed|failed",
            "evidence_path": "...",
            "evidence_sha256": "..."
          }
        ],
        "updated_at": "ISO-8601"
      }
    ]
  }
}
```

All shown fields are required; use explicit JSON `null` only where the schema
permits it. Update `STATE.json` and counters atomically. Append precondition and
attempt events without rewriting history. Validate unique strategy IDs/slugs,
monotonic counters, referenced IDs, exact file hashes, allowed status enums,
and `exact_next_action` before resume. `blocked` is reserved for a genuine
authority/input/external-state blocker, not ordinary incomplete work.

---

## 4. Per-shot requirement card

Write one row/card before choosing a provider:

| Field | Required content |
|---|---|
| `shot_id` | Stable shot ID and `[start_frame,end_frame)` |
| `narrative_job` | What the viewer must understand or feel |
| `claim_or_proof` | Exact factual/product claim, or `none` |
| `subject` | Character/object/product plus `truth_origin` |
| `in_state` | Pose, gaze, prop hand, UI state, screen direction |
| `action` | One primary visible action |
| `out_state` | State required for the next edit |
| `appearance_in_out` | Hair arrangement, makeup, wetness/sweat/dirt/injury, garment fasteners/damage at both boundaries |
| `prop_in_out` | Fill/consumption, open/closed, on/off, damage, hand, and exact state at both boundaries |
| `continuity_group` | Character/wardrobe/location/provider strategy |
| `composition` | Shot size, angle, lens intent, protected zones |
| `motion` | Subject, camera, environmental, and secondary motion |
| `duration` | Source request and final edit use |
| `effective_detail_floor` | Minimum usable pixels after crop/zoom |
| `rights_privacy_class` | Public/internal/confidential/restricted |
| `route_candidates` | Ordered acquisition methods |
| `strategy_id` | Stable route/provider/model/mode/reference strategy ID |
| `route_attempt_ceiling` | Normally two controlled attempts per route |
| `shot_attempt_ceiling` | Total bounded executions across the full fallback ladder |
| `shot_cost_ceiling` | Cash and every quota unit |
| `keeper_conditions` | Observable pass criteria |
| `hard_rejects` | Defects that cannot enter the edit |
| `fallback_cursor` | Next predeclared route if current route fails |

Keep the story requirement independent of production method. “A tired commuter
realizes something” is a job; “generate a Veo clip” is only one possible route.
That separation lets the agent change tools without changing meaning.

---

## 5. Per-shot route decision engine

Evaluate routes in this canonical default order, skipping any ineligible
route:

1. approved existing project asset;
2. user-supplied footage with compatible rights;
3. licensed stock that genuinely matches story, continuity, detail, and rights;
4. authentic app/site/device/product capture;
5. deterministic design, motion graphic, 2.5D treatment, or verified 3D;
6. commissioned/custom shoot;
7. local image/video generation;
8. authorized cloud image/video generation; and
9. a truthful shot rewrite preserving the locked narrative job.

Exact reusable brand/project assets are part of route 1.

When this companion is used with `UNIVERSAL_AI_VIDEO_AGENT_WORKFLOW.md`, this
per-shot matrix is the authoritative route list; do not maintain two different
orders. Eligibility and truth gates override the default order for a specific
shot: product proof moves authentic capture ahead of stock, and an essential
real-human performance may move a custom shoot ahead of designed motion. Record
that exception and reason in the shot matrix rather than silently changing the
global list.

Do not generate merely because generation is available. Prefer the earliest
route that satisfies truth, continuity, rights, visual fit, detail, budget, and
schedule.

### 5.1 Eligibility hard stops

| Requirement | Eligible routes | Ineligible routes |
|---|---|---|
| Real photographed human | User footage, released stock, custom shoot | Synthetic T2I/T2V/I2V person |
| Exact current app UI | Simulator/emulator/browser/device capture | Generated UI |
| Exact physical product result | Official footage or controlled shoot | Invented generative proof |
| Exact logo/legal copy | Official vector/raster + deterministic composition | Generated text/logo |
| Confidential input with no cloud permission | Existing/local/capture | External provider upload |
| Continuity-critical synthetic character | Canonical still/reference → I2V/reference mode | Unanchored T2V |
| Abstract explainer | Designed vector/3D first | Photoreal T2V by habit |

### 5.2 Scoring eligible routes

Score each eligible route out of 100:

| Criterion | Weight |
|---|---:|
| Truth and claim support | 25 |
| Identity/product/location continuity | 15 |
| Rights, consent, and paid-ad suitability | 15 |
| Visual/story fit | 15 |
| Effective native detail after crop | 10 |
| Privacy/cloud suitability | 5 |
| Cost/quota efficiency | 5 |
| Schedule/latency/recoverability | 5 |
| Deterministic editability | 5 |

Any hard-truth, rights, consent, privacy, watermark, or required-detail failure
rejects the route regardless of score.

### 5.3 Default fallback ladders

**Generation-eligible cinematic shot**

```text
T2V A1
→ one diagnosed controlled correction
→ T2V A2
→ approved shot still/reference
→ I2V A1
→ one diagnosed controlled correction
→ I2V A2
→ licensed stock/custom capture
→ designed motion or verified composite
→ truthful shot rewrite preserving the narrative job
```

**Continuity-critical character/object**

```text
canonical reference package
→ exact composed start still
→ I2V/reference-to-video
→ matched stock session or custom shoot
→ nonliteral designed treatment
```

**Product/UI proof**

```text
agent-run authentic capture
→ alternate simulator/emulator/browser/staging/real-device capture
→ current official product asset
→ controlled custom capture
→ remove or rewrite unsupported claim
```

Never route product proof to generative video.

**Real-human-only shot**

```text
approved user footage
→ released matched stock series
→ commissioned shoot
→ concept revision
```

Never insert a synthetic human into this ladder.

**Abstract/explainer shot**

```text
designed vector/type/3D
→ generated still plus deterministic animation
→ I2V
→ licensed stock
→ T2V only when novel natural motion materially improves the explanation
```

---

## 6. Find and reuse existing assets before generating

### 6.1 Inventory pass

Search the project and approved brand library for:

- prior campaign footage;
- authentic UI recordings;
- raw camera takes;
- stock series already licensed;
- character/location/wardrobe references;
- music/SFX/voice stems;
- logos/icons/product renders;
- approved 3D models; and
- provider downloads whose temporary URLs were already frozen locally.

Probe each candidate for real dimensions, duration, FPS, codec, audio, color,
and corruption. Never rely on a filename like `4k-final.mp4`.

### 6.2 Reuse rules

- Exact SHA match may be reused automatically inside the same authorized
  project/brand scope.
- Semantic reuse is a human/agent judgment, never fuzzy auto-selection.
- Cross-client brand assets, voices, actors, models, confidential prompts, and
  license seats are not reusable merely because they are cached.
- A reusable asset must still fit the new crop, meaning, rights, territory,
  term, platform, and paid-ad context.
- Record parent/derived lineage for trims, crops, grades, upscales, and
  composites.

When unsure, reacquire or regenerate. Wrong reuse is more expensive than a
redundant download.

---

## 7. Licensed stock — where and how to source it

Stock is often the most truthful and efficient source for real people,
locations, gestures, transport, work, lifestyle, and atmosphere. Search for a
**series/session**, not one isolated pretty clip.

### 7.1 Practical source order

1. The user's already licensed library/account.
2. Paid libraries that expose the required commercial/model-release status.
3. Free libraries only when the exact current license and depicted-rights risk
   fit the campaign.
4. Archive/editorial libraries only for an eligible editorial use.

Useful starting points, always rechecked at acquisition time:

- [Adobe Stock usage and licensing FAQ](https://helpx.adobe.com/stock/web/common-questions/usage-licensing.html)
  plus the [complete Adobe Stock terms](https://www.adobe.com/go/stockterms):
  paid commercial stock; Adobe states commercially intended
  recognizable-person assets are uploaded with model releases, subject to the
  actual item, license, terms, and editorial restrictions.
- [Pexels license](https://www.pexels.com/legal-pages/license/) and
  [full terms](https://www.pexels.com/terms-of-service/): free use is broad,
  but no implied endorsement, misleading use, standalone redistribution, or
  assumption that every third-party consent needed for a campaign is covered.
- [Pixabay license summary](https://pixabay.com/service/license-summary/) plus
  the binding [Pixabay Terms](https://pixabay.com/service/terms/): the summary
  is convenient but non-binding; the current terms govern. Use/modification is
  subject to prohibited uses, and trademarks, privacy, publicity, and other
  third-party rights may still apply.
- Storyblocks, Shutterstock, Artgrid, Pond5, Getty, and other paid libraries may
  be considered only after the agent opens the current item/license terms for
  the intended media, territory, paid-ad use, client, and distribution.

“Found on the internet” is not a license.

### 7.2 Search strategy

Search with continuity attributes rather than vague emotion:

```text
[subject/action] + [location] + [wardrobe] + [camera orientation]
+ [vertical/horizontal] + [4K/native resolution] + [same series/contributor]
```

Examples:

- `young adult man glasses camel coat train phone vertical 4K`;
- `same actor office laptop coffee contributor series`;
- `hands holding phone close-up neutral screen released commercial`; and
- `city commute night window reflection vertical native 4K`.

Once a good clip is found:

1. open the contributor/session page;
2. find sibling clips with the same actor, outfit, prop, and location;
3. download the highest genuinely useful native resolution;
4. preserve the original filename and item page;
5. record creator, license version/date, restrictions, and release evidence;
6. hash and probe the download; and
7. test the actual intended crop before approval.

### 7.3 Stock hard rejects

Reject:

- mismatched actor/wardrobe/location within one continuity group;
- insufficient detail after vertical crop;
- visible unwanted brands, screens, private data, or text that cannot be
  lawfully/cleanly avoided;
- editorial-only content in a commercial ad;
- a recognizable person used as an implied customer/endorser without suitable
  permission;
- source page or license evidence that cannot be preserved;
- watermarked preview as a final; or
- an action that contradicts safety, product truth, or cultural accuracy.

### 7.4 Commissioned/custom capture

Choose a custom shoot when exact real-human identity, action, product use,
wardrobe, sensitive context, endorsement, or model/property releases matter
more than the apparent convenience of generation.

The shot packet contains:

- casting appearance and adult-status requirements;
- factual attributes that may **not** be inferred;
- release language and campaign/sensitive-context scope;
- wardrobe/prop/location continuity photographs;
- exact action and safety instructions;
- vertical and alternate-aspect framing guides;
- slate, FPS, resolution, color, shutter, exposure, and audio requirements;
- clean plates, room tone, inserts, handles, and alternate takes; and
- file handoff/hash/backup rules.

---

## 8. Character continuity system

The most reliable portable method is **still-first, shot-by-shot**:

1. freeze one canonical identity package;
2. build angle, full-body, wardrobe, prop, expression, and location plates;
3. compose and approve the exact starting still for each important shot;
4. animate that still with a motion-focused prompt;
5. inspect the first/middle/last frames and the complete motion;
6. save the last clean frame and exact `out_state`; and
7. generate the next dependent shot only from approved anchors.

Names, repeated prose, and seeds can help, but the real continuity anchors are
approved visual references, angle-matched plates, exact start frames, and a
continuity ledger.

### 8.1 Real person versus fictional synthetic character

**Real actor/stock person**

- Use only footage/images covered for the intended use.
- Do not generate new angles of a real person's likeness without the required
  consent and provider permission.
- Do not clone a voice without explicit speaker consent.
- Do not convert visual appearance into unsupported nationality, religion,
  age, health, customer, or endorsement claims.
- When the brief says real footage only, do not replace the actor with a
  photoreal synthetic double.

**Fictional synthetic character**

- State that the person is fictional/synthetic in internal records and any
  required public disclosure.
- Do not prompt for a living celebrity, public figure, private person, or
  confusing near-copy.
- Specify an adult age band when adult status matters.
- Treat nationality, accent, religion, and biography as story facts only when
  deliberately defined; they are not inferred from appearance.

### 8.2 Character bible schema

```yaml
character:
  id: "CHAR_A"
  canon_version: 1
  source_truth: "<real_photographed|fictional_synthetic>"
  rights_and_consent_reference: "<secure reference or N/A>"
  adult_status: "<verified adult|fictional adult>"

  story_role:
    function: "<what this character does in the story>"
    allowed_claims: []
    forbidden_inferences: []

  invariants:
    face:
      shape: ""
      eye_spacing_shape_color: ""
      brows: ""
      nose: ""
      lips: ""
      jaw_chin: ""
      ears: ""
    hair:
      hairline: ""
      color: ""
      length_texture_part: ""
      facial_hair: ""
    skin:
      tone_undertone: ""
      freckles_scars_moles: ""
      texture: "natural, non-plastic"
    body:
      height_band: ""
      build_proportions: ""
      handedness: ""
    hard_fail_drift:
      - "changed face geometry"
      - "changed hairline or grooming"
      - "changed body build"
      - "changed distinctive mark"

  voice:
    voice_id_or_performer_reference: ""
    consent_reference: "<required for clone or N/A>"
    accent_region: ""
    pitch_timbre: ""
    pace_rhythm: ""
    emotional_range: ""

  canon_assets:
    hero_three_quarter: ""
    front_headshot: ""
    angle_plates: []
    full_body_plates: []
    expression_plates: []
    hand_prop_plates: []

  looks:
    W01:
      silhouette: ""
      garment_construction: ""
      exact_colors_materials: ""
      shoes: ""
      accessories: ""
      forbidden_changes: []
      reference_assets: []

  props:
    PROP01:
      geometry_scale_material: ""
      markings_and_text: ""
      normal_hand_and_orientation: ""
      reference_assets: []

  mannerisms:
    neutral_posture: ""
    gaze_behavior: ""
    gesture_scale: ""
    emotional_restraint: ""
```

Never silently replace `canon_version`. A deliberate redesign creates version
2 and rebaselines every dependent still, clip, voice, and continuity state.

### 8.3 Build the canonical identity

#### Stage A — candidate portraits

Generate or source 6–12 candidates from one locked identity description. Keep
background, lens intent, lighting, expression, and crop consistent so the
comparison measures identity rather than scene styling.

Canonical candidate criteria:

- sharp unobstructed face;
- visible hairline, jaw, and ears;
- neutral or very restrained expression;
- natural even light;
- eye-level normal portrait perspective, not an extreme wide lens;
- realistic skin texture, asymmetry, and pores;
- plain neutral background;
- no eyewear/phone/hand occlusion unless permanently required;
- no existing anatomy, grooming, or clothing defect; and
- enough resolution for the intended close-up.

Do not select only the prettiest portrait. Test the top candidates in profile,
full body, a new light direction, and a new location. Select the candidate with
the best median identity stability.

#### Stage B — freeze one master

Once selected:

1. save the untouched original;
2. assign `CHAR_A_v01`;
3. compute SHA-256;
4. record provider/model/prompt/seed/settings or source rights;
5. remove rejected candidates from active reference lists without deleting
   their audit records; and
6. use this exact master as the root of every derivative plate.

Do not average identities across several attractive candidates.

#### Stage C — generate angle plates separately

Create individual files—not one labeled collage—for:

- face front;
- face three-quarter left and right;
- face profile left and right;
- full body front, side, and back in a neutral A-pose;
- default outfit including shoes;
- expressions required by the script;
- hands empty and holding every continuity-critical prop; and
- back-of-head/hair plate if rear views appear.

Assemble a contact sheet **afterward** for review. Feed individual clean plates
to a model unless its current official documentation explicitly supports and
correctly interprets a collage. A collage can be mistaken for multiple people.

#### Stage D — wardrobe, prop, and location anchors

For every wardrobe:

- make one clean full-body front/three-quarter anchor;
- specify garment construction, material, exact semantic colors, fit,
  fasteners, shoes, and accessories;
- record permitted changes such as coat open/closed; and
- reject unexplained color, hem, collar, sleeve, or accessory changes.

For every prop:

- create an isolated product-style reference;
- record size relative to the hand/body;
- record materials, orientation, screen/label side, and grip;
- use official logos/text in post rather than asking the model to render them;
  and
- create a hand-contact plate when interaction matters.

For every recurring location:

- create clean reference views without stray subjects;
- record layout/topology, camera axes, time, weather, practical lights, key
  light direction/color, and palette;
- keep windows, doors, furniture, rails, signs, and horizon consistent; and
- treat a major layout change as a new location ID.

### 8.4 Canonical reference prompt

```text
Create a photorealistic casting-reference photograph of a fictional adult
character, CHAR_A.

IDENTITY INVARIANTS:
[face geometry, eyes, brows, nose, lips, jaw, ears]
[hairline, hair, grooming]
[skin tone/undertone, natural texture, distinctive marks]
[adult age presentation and body build]

Neutral restrained expression, eye-level three-quarter portrait, normal
portrait perspective, natural even soft daylight, plain mid-gray background,
sharp unobstructed facial detail, realistic skin pores and fabric texture.
This is an identity reference, not a stylized scene. No text, logo, watermark,
extra person, hand near face, beauty-filter skin, or resemblance to a known
person.
```

### 8.5 Angle-plate prompt

```text
Use CHAR_A_CANON as the sole identity source. Create the same exact fictional
adult in a full-body production character plate at [VIEW]. Neutral A-pose.
WARD_W01 remains unchanged including garment construction, colors, shoes, and
accessories. Identical face, hairline, grooming, skin marks, body build, and
proportions. Even studio light, plain neutral background, normal anatomy, no
action, no prop unless specified, no text or labels.
```

### 8.6 Character package QA

Review the contact sheet at normal size and 100% crops. Fail if:

- face geometry or eye spacing changes materially;
- age presentation or body build drifts;
- hairline, beard, glasses, scars, freckles, or moles move/change;
- left/right features flip unintentionally;
- hands/prop scale are broken;
- wardrobe construction changes between angles;
- skin becomes plastic or excessively retouched;
- angle plate contains a different person; or
- any active reference already contains a defect likely to amplify in video.

Only approved individual plates enter the provider reference set.

### 8.7 Google Flow reusable Characters

As verified on 2026-08-08, Google Flow's current official help says a reusable
Character is created from one or two images, a selected or created voice, and
optional character information, and can be invoked with `@CharacterName`.
Do not assume the voice step can be skipped; verify the live UI. Use the current
[Flow character-management guide](https://support.google.com/flow/answer/16935308?hl=en)
at run time because plan, country, UI, and model support can change.

Operational website steps:

1. Open an authorized Flow project in the user's signed-in browser.
2. Open `Characters` and create a new character.
3. Upload/generate the one or two **best compatible approved** character
   images; do not upload conflicting looks just because more slots exist.
4. Add the stable name, select/add only a consented voice as the current UI
   requires, and add only supported story facts; character information is
   optional.
5. Save and run a neutral test: front/three-quarter medium shot, small head
   turn, default wardrobe, plain location.
6. Invoke the character with `@CharacterName` and assign all other ingredients
   explicit roles.

Treat a saved Flow Character as a locked character-plus-look bundle: face,
body, clothing, and voice can all be carried by the saved Character. Version it
per wardrobe/look, for example `CHAR_A_W01_v01` and `CHAR_A_W02_v01`. Never add
a separate ingredient that conflicts with its saved clothing. When wardrobe
must change and the current surface cannot preserve it cleanly, use ordinary
identity/look Ingredients or an exact approved-still I2V route instead. If no
consented/suitable voice can satisfy a required Character-creation step, do not
create that saved Character; use the ordinary reference route and produce final
voice separately.
7. Download the test and compare it to the character bible before batch use.

Flow's current character feature is a convenience layer; the local character
bible, raw references, hashes, rights, and QA remain authoritative.

---

## 9. Still-image generation and editing

Use still generation to create synthetic character canon, shot-start frames,
location plates, wardrobe/prop plates, backgrounds, matte paintings,
illustrations, thumbnails, or design elements. Do not use it to invent exact
product proof.

### 9.1 Route selection

1. approved official/user image;
2. licensed stock photo;
3. local/private image model when suitable;
4. authorized Google/Gemini image generation/Flow image surface;
5. another authorized provider with reference/edit support; or
6. custom photography/design.

Current Gemini image-generation capabilities and model names change; verify
the current [official Gemini image-generation guide](https://ai.google.dev/gemini-api/docs/image-generation)
instead of relying on remembered “Nano Banana” labels, reference counts,
resolution, or pricing.

### 9.2 Text-to-image versus image edit

Use **text-to-image** for the first fictional identity candidate, new abstract
concept, clean location, or non-continuity art.

Use **image editing/reference generation** for:

- new angle of a locked character;
- wardrobe variation;
- exact shot composition;
- prop integration;
- changing only background/light;
- repairing a non-product defect before I2V; or
- preserving brand/style across a family.

Once a character or product look is approved, do not return to unanchored
text-to-image for dependent shots.

### 9.3 Reference-role discipline

Assign one job per input:

```text
Reference 1 = identity and body proportions only.
Reference 2 = wardrobe and prop only.
Reference 3 = location layout and lighting only.
Reference 4 = visual style/grade only.
```

Remove references that disagree on hair, makeup, wardrobe, age, light, or
style. More references are not automatically better.

### 9.4 Composed-shot still prompt

```text
Use CHAR_A only for identity and body proportions.
Use WARD_W01 only for clothing, shoes, and accessories.
Use PROP_PHONE01 only for phone geometry, scale, and grip.
Use LOC_TRAIN01 only for environment layout and practical lighting.

Create one photorealistic [SHOT SIZE] from [ANGLE], eye-level [LENS INTENT].
CHAR_A is [BLOCKING/POSE], holding PROP_PHONE01 in the [HAND] with [ORIENTATION].
Leave clean negative space at [ZONE] for editorial copy.

Maintain exact face, hairline, body build, garment construction, prop scale,
location topology, screen direction, and light direction from the references.
Natural skin/fabric texture. No readable phone screen, brand, extra person,
extra finger, warped rail, beauty filter, watermark, or text.
```

### 9.5 Still-first shot construction

For each identity/product-composition-critical shot:

1. select the correct angle plate;
2. select wardrobe/prop/location anchors;
3. generate 2–4 composed still candidates inside budget;
4. inspect face, hands, object contact, layout, light, crop, and negative space;
5. fix the still before animation—video usually amplifies still defects;
6. approve one exact start image and hash it;
7. record planned motion separately; and
8. send only approved references and the approved start still to I2V.

### 9.6 Still defects and repair order

| Defect | First repair | If it persists |
|---|---|---|
| Face drift | Use canon + closest angle plate; remove conflicting refs | Rebuild exact shot still from canon; reduce angle extremity |
| Hands/prop | Isolate one grip and show contact clearly | Use hand/prop plate; split action or custom capture |
| Wardrobe | Use clean full-body wardrobe anchor | Composite approved wardrobe deterministically |
| Location topology | Use clean empty location plate | Use a real/3D background plate |
| Wrong crop | Recompose still at target aspect | Generate native aspect instead of extreme crop |
| Fake text/logo | Remove it from generation | Add official asset in post |
| Low detail | Regenerate at useful native dimensions | Approved upscale with disclosure; change crop/source |

### 9.7 Image keeper gate

An image passes only when:

- the file decodes and dimensions/color mode are known;
- it matches truth/rights/privacy policy;
- all identity and continuity invariants pass;
- anatomy/object/location geometry pass at 100%;
- target crop and protected zones work;
- there is sufficient effective detail after edit scaling;
- no unwanted text, logo, private data, watermark, or provider mark exists;
- required provenance/disclosure is preserved; and
- its SHA-256, prompt, references, settings, and parent lineage are recorded.

---

## 10. Choose the correct video-generation mode

| Mode | Use when | Avoid when |
|---|---|---|
| `text_to_video` | Non-continuity B-roll, atmosphere, expendable establishing shot | Exact recurring face, product/UI proof, exact start composition |
| `image_to_video` | Exact approved start still, recurring character, product/hardware composition | Start still is defective or action requires a different pose |
| `reference_to_video` | Provider supports subject/style/object references without forcing them as frame 1 | References conflict or roles are ambiguous |
| `first_last_frame` | Exact start/end pose, transition, object movement, match cut | Provider/model does not currently support it |
| `video_extension` | Same continuous environment/action should continue | Identity has already drifted or a new shot is actually needed |
| `video_to_video_edit` | Localized repair/restyle/delta on an existing clip | Provider cannot preserve unmentioned content or upload is unauthorized |
| `performance/avatar` | Controlled speaking presenter/character with consent | Natural cinematic action, real-human-only footage without capture |
| `deterministic_motion` | UI, type, diagrams, exact product, gentle still animation | When claiming genuine live/generated motion |

### 10.1 Mode decision rules

- Use T2V for shots where losing the exact subject would not break continuity.
- Use I2V/reference mode for any recurring synthetic character.
- Use first+last frame when the end pose/state is editorially mandatory.
- Use extension only while the last clean frame still matches canon.
- Use V2V editing for one small delta, not a complete hidden regeneration.
- Use deterministic post for readable text, UI, logos, graphs, labels, and CTA.
- Use stock/custom shoot for real-human-only requirements.

### 10.2 Source duration versus edit duration

Generate enough motion and handles, but do not make every source long. A
0.8-second edit beat may use a clean 4–6-second source window. Longer
generations increase the chance of drift. For continuity-critical shots, a
shorter coherent clip is usually better than a long clip with a broken second
half.

---

## 11. Provider-neutral video prompt compiler

Compile each prompt from locked fields. Keep invariant blocks stable within a
continuity group and change only shot-specific blocks.

### 11.1 Prompt fields

1. **Mode and shot structure:** single continuous shot, montage, first/last,
   extension, or edit.
2. **Reference roles:** identity, wardrobe/prop, location, style, first frame.
3. **Subject invariant:** only the continuity traits the model must preserve.
4. **One primary action:** observable start → movement → end.
5. **Camera:** shot size, height, lens intent, one movement, stabilization.
6. **Environment:** topology, time, weather, key practicals.
7. **Lighting/palette:** one coherent setup.
8. **Temporal beats:** time ranges only when needed.
9. **Secondary motion:** cloth, hair, reflections, traffic, dust—restrained.
10. **Audio:** dialogue/SFX/ambience only when the selected model generates it.
11. **Protected composition:** copy/CTA/product zones.
12. **Exclusions:** use a native negative field when supported; otherwise clear
    prose such as `Do not introduce...`.

### 11.2 General T2V template

```text
One continuous [DURATION]-second [SHOT SIZE], [ASPECT].

SUBJECT:
[One concise subject description. No unsupported identity claims.]

ACTION:
[One primary action with clear start and end state.]

CAMERA:
[Camera height, lens intent, one movement, stabilization behavior.]

ENVIRONMENT AND LIGHT:
[Location topology, time/weather, motivated key/practicals, palette.]

TIMING:
[0-Xs action beat; X-Ys reaction/end hold, only if useful.]

SECONDARY MOTION:
[One or two natural environmental motions.]

COMPOSITION:
Keep [protected zone] clear for captions/CTA. Keep hands/face/product visible.

Do not introduce extra people, unreadable text, logos, warped anatomy,
unmotivated camera cuts, lighting changes, scene mutations, or a watermark.
```

### 11.3 Approved still → I2V template

```text
Use the supplied image as the exact opening composition and identity source.
The camera [ONE CAMERA MOTION] as the character [ONE PRIMARY ACTION].
Secondary motion: [hair/cloth/environment]. Natural weight and timing;
physically believable hand-to-object contact.

Keep the first image's face, hairline, body build, wardrobe, prop geometry,
composition, screen direction, lighting, and environment unchanged. One
continuous shot. No new subject, cut, transition, zoom unless specified,
identity morph, wardrobe mutation, fake screen text, or logo.
```

For I2V, describe motion and camera behavior more than the visible appearance.
Redescribing the image with conflicting adjectives can cause drift.

### 11.4 Reference-to-video template

```text
Reference 1 controls CHAR_A identity and body proportions.
Reference 2 controls WARD_W01 and PROP01.
Reference 3 controls LOC01 layout and light direction.

One continuous [SHOT SIZE] at [CAMERA HEIGHT]. CHAR_A performs one action:
[ACTION]. The camera [ONE MOVE]. Preserve facial geometry, hairline, body
proportions, wardrobe construction/colors, prop scale/orientation, handedness,
screen direction, location topology, and light direction throughout.
[Short quoted dialogue only if the selected model supports native dialogue.]
Ambience: [specific restrained ambience].
```

### 11.5 First + last frame template

```text
Create one continuous shot beginning exactly at the supplied first frame and
ending exactly at the supplied last frame. Between them, [ONE TRANSITION OR
ACTION]. Maintain the same character identity, wardrobe, handedness, prop,
location geometry, camera axis, screen direction, and lighting. Smooth
physical motion; no cut, teleport, dissolve, duplicate subject, or identity
morph.
```

### 11.6 Extension template

```text
Continue the same uninterrupted shot from its current final movement.
CHAR_A continues [NEXT PHASE OF ACTION]. Preserve camera path and speed,
identity, wardrobe, prop state, screen direction, location, lighting,
ambience, and voice performance. Do not restart or repeat the prior action.
```

### 11.7 Localized edit template

```text
Change only [DEFECT, REGION, OR TIME RANGE] so that [DESIRED CORRECTION].
Keep everything else the same: identity, wardrobe, props, background, camera,
timing, lighting, dialogue, audio, and all unaffected pixels/objects.
```

Short surgical edit prompts are safer than redescribing the whole video.

### 11.8 Prompt anti-patterns

Do not:

- ask for several simultaneous actions in one short shot;
- combine conflicting times, weather, lens, camera, or light;
- say only “make it cinematic” or “make it move”;
- repeat the identity description differently in every shot;
- mix identity, wardrobe, location, and style roles across references;
- request generated product/UI/text proof;
- use a long negative list that contradicts the positive action;
- conceal a provider policy violation with coded wording; or
- keep adding synonyms after two failed attempts.

---

## 12. Google Flow, Gemini Omni, and Veo adapter

Google's surfaces change quickly. Before every project, open the current
[Flow model/feature matrix](https://support.google.com/flow/answer/16352836?hl=en),
[Flow creation guide](https://support.google.com/flow/answer/16353334?hl=en),
and [Gemini API video guide](https://ai.google.dev/gemini-api/docs/video).
Verify active model, mode, region, plan, aspect, duration, audio, reference,
editing, watermark/provenance, credit cost, and download behavior in the actual
account. Do not trust an old button name or model table embedded in a workflow.

### 12.1 Current capability orientation — verified 2026-08-08

At the verification date, official Flow help describes:

- reusable Characters created from visual references plus a selected/created
  voice, with optional character information; live-UI voice optionality must be
  verified rather than assumed;
- text-to-video;
- Ingredients/References for characters, objects, and locations;
- first-frame and model-dependent first+last-frame generation;
- model-dependent extension;
- Gemini Omni Flash generation/editing capabilities; and
- image-generation surfaces used to create frames and ingredients.

Which model supports each feature, duration, or ratio is not uniform. The
executing agent must read the live matrix and the active model selector before
submitting.

### 12.2 Flow website preflight

1. Confirm the user is signed in and the feature is available in their region
   and plan.
2. Open/create one project for the film; use stable non-private project names.
3. Check current credits and per-action cost. Reserve the correct quota bucket.
4. Confirm the exact asset class is authorized for Google cloud upload.
5. Upload only approved, rights-cleared references without secrets/PII.
6. Create collections for characters, wardrobe/props, locations, style, frames,
   raw outputs, and keepers.
7. Record the active model and feature mode before every job.

Before any upload, distinguish the product surface and record its actual data
controls. For Flow website use, verify region, account/product data settings,
history/retention/deletion controls, and any human-review or model-improvement
exposure under the current
[Flow data controls](https://support.google.com/flow/answer/17025472?hl=en).
For Gemini API use, separately record billing/paid status, region, logging and
data-sharing settings, retention, and reviewer/training exposure under the
current [Gemini API terms](https://ai.google.dev/gemini-api/terms) and
[logging/data-sharing policy](https://ai.google.dev/gemini-api/docs/logs-policy).
Do not infer API handling from Flow settings or Flow handling from API billing.
If the approved asset class does not fit the verified handling, keep it local
or use an authorized alternative.

Login, MFA, CAPTCHA, plan purchase, and unknown-cost actions are hard stops.
The agent may use an existing authenticated session but never ask the user to
paste a password/API key into chat.

### 12.3 Flow Character route

1. Build and approve the local character bible first.
2. In Flow, create the reusable Character from the best compatible one or two
   approved images representing one locked wardrobe/look.
3. Select or create a voice only with appropriate consent/rights and as the
   current Character workflow requires; do not assume the voice field is
   optional.
4. Name the character-plus-look bundle deterministically, for example
   `CHAR_A_W01_v01`.
5. Run a neutral pilot before a story shot.
6. Invoke it with `@CHAR_A_W01_v01` and describe only shot-specific
   action/camera; never attach a conflicting wardrobe ingredient.
7. Compare every output back to local canon; Flow's saved Character does not
   replace QA.

For a wardrobe change, create and approve a distinct Character version when
the current UI supports the needed consistency, or leave the saved-Character
route and use ordinary identity/look Ingredients or exact-still I2V.

### 12.4 Flow Ingredients/References route

Google's official guidance recommends clean subject/product references on a
plain or segmented background, location/style references without stray
subjects, compatible looks, and text that does not conflict with the inputs.

Operational steps:

1. choose the model/mode that currently supports Ingredients;
2. add only approved individual references;
3. assign each ingredient one explicit role in the prompt;
4. use `@` references where the current UI supports them;
5. set aspect, duration, output count, and model;
6. submit one pilot;
7. download every output immediately;
8. record Flow project/history/asset identifiers privately; and
9. approve/reject locally, not from the thumbnail.

Example:

```text
@CHAR_A_W01_v01 controls the character's identity, body, hair, glasses,
clothing, and saved character look.
@LOC_TRAIN_EVENING controls carriage layout, red seats, yellow rails, and
warm-cool practical lighting.

One continuous medium close-up. CHAR_A_W01 glances down at a phone, pauses, then
slowly looks toward the window. Camera remains locked with only natural train
vibration. Preserve the saved character look, prop hand, carriage layout, and light.
No readable phone screen, extra passenger entering frame, cut, or camera zoom.
```

### 12.5 Flow first/last frames

Use Frames mode when exact editorial endpoints matter:

1. create/approve the first frame;
2. create/approve the last frame with compatible lens, lighting, identity,
   topology, and screen direction;
3. select the active model that currently supports the required frame mode;
4. describe only the physical transition between endpoints;
5. reject any hidden cut, morph, teleport, or new object; and
6. test the exact last frame against the next shot.

Do not assume every Flow model supports first+last frames. Check the live
feature matrix.

### 12.6 Flow extension

Use extension only for a genuine continuation:

- the source must meet the active model's current extension requirements;
- the final source movement/voice/state must give the extension enough context;
- prompt the next phase, not a recap;
- inspect the seam and accumulated drift; and
- stop extending once identity/location quality degrades. Extract a clean frame
  and restart from canon instead of treating the latest derivative as canon.

### 12.7 Gemini Omni generation and editing

The current official
[Gemini Omni guide](https://ai.google.dev/gemini-api/docs/omni) describes text,
image/reference-to-video, and stateful conversational editing through the
Interactions API. It is a preview surface, so capabilities and restrictions
must be rechecked.

For generation:

```text
Scene + one action + camera + lighting + timing + audio intent + exclusions.
```

For reference roles, use only the tag syntax documented by the current API,
such as `<FIRST_FRAME>` and `<IMAGE_REF_N>`, with images passed in the same
recorded order.

Example:

```text
[# Sources <FIRST_FRAME>@Image1]
[# References <IMAGE_REF_0>@Image2 <IMAGE_REF_1>@Image3]

Use Image1 as the exact start frame. Image2 controls CHAR_A identity. Image3
controls the train environment. One continuous shot: CHAR_A slowly raises his
gaze while the camera stays locked. Keep everything else unchanged.
```

For editing:

1. create the originating interaction with storage enabled (`store=true` or the
   current documented equivalent) and preserve its interaction/job ID; an
   interaction created with `store=false` cannot later be edited through
   `previous_interaction_id`;
2. request one surgical delta;
3. finish with `Keep everything else the same`;
4. inspect the entire video, not just the repaired region; and
5. branch from the last clean state if an edit damages another area.

Good edit:

```text
Remove the unreadable poster from the rear wall. Keep everything else the same.
```

Bad edit:

```text
Re-describe the whole actor, train, wardrobe, camera, light, and action while
asking for one poster change.
```

The official guide currently lists region/input/edit limitations, including
restrictions affecting uploaded-video editing in some European regions. Check
them at run time; never bypass them or move restricted private media to another
region/provider without authorization.

### 12.8 Veo through Gemini API

Use the current official
[detailed Veo video-generation guide](https://ai.google.dev/gemini-api/docs/veo)
for request schemas, reference inputs, first/last-frame control, extension,
native audio, polling, and downloads. Flow and API feature support can differ;
do not assume a workflow working in one surface works in the other.

Veo is generally useful when the selected current model specifically fits:

- controlled cinematic T2V/I2V;
- first/last frame behavior;
- reference images;
- extension; or
- native generated ambience/dialogue.

Keep authoritative narration, product UI, captions, brand copy, and final mix
under deterministic post control unless the brief explicitly locks generated
audio and it passes the same QA.

### 12.9 Flow/Gemini output record

For every job store:

- surface (`Flow website`, `Gemini API`, or another official route);
- project/interaction/request/history ID;
- active model/version label;
- operation/mode;
- prompt path/hash;
- ordered reference IDs/hashes and role map;
- aspect, requested duration, outputs, seed when truly supported;
- audio setting;
- visible estimated and reconciled credits/cost;
- submit/poll/complete timestamps;
- temporary download URL expiry when known;
- local file SHA-256 and probe; and
- synthetic provenance/watermark/disclosure status.

---

## 13. Other cloud providers and local routes

Provider names are candidates, not a permanent ranking. Probe only the selected
primary plus one or two viable fallbacks. Choose for the actual shot's mode,
reference support, identity consistency, motion, rights, region, privacy,
resolution, price, latency, and recoverability.

### 13.1 Runway

Runway's current official resources include an
[API reference](https://docs.dev.runwayml.com/api/) and creator guidance for
[Gen-4 Image References](https://help.runwayml.com/hc/en-us/articles/40042718905875-Creating-with-Gen-4-Image-References)
and [image-to-video prompting](https://help.runwayml.com/hc/en-us/articles/48324313115155-Image-to-Video-Prompting-Guide).

Use it when the active account/model supports the required still/reference/
video mode. Read the current request schema rather than copying stale model IDs
or fields. Runway's own longer-film guidance reinforces character plates,
approved stills, and shot-by-shot construction.

Before uploading or submitting, also open the current
[Runway Terms of Use](https://runway.com/terms-of-use) and
[Usage Policy](https://runway.com/safety/usage-policy), plus the separate
[Runway Privacy Policy](https://runway.com/privacy-policy). Record the
account/plan, input rights, likeness permission, provider license for
inputs/outputs, commercial-use eligibility, content review/moderation,
retention, training/data use, deletion/opt-out controls, region,
watermark/provenance, and any project-specific restriction. Capability
documentation alone is not a rights/privacy preflight. If these conditions do
not fit the asset class or campaign, use an authorized local, stock, capture,
custom-shoot, or other provider route.

### 13.2 Seedance, Kling, MiniMax, HeyGen multi-model, and similar providers

These may offer T2V, I2V, reference conditioning, first/last frames, native
audio, lip sync, editing, or model gateways depending on current surface and
region. Before use:

1. open first-party docs/request schema;
2. verify the exact provider behind any gateway;
3. verify model version and supported operation;
4. verify reference count/type, aspect, duration, resolution, audio, seed,
   watermark, commercial rights, retention/training, region, price, and retry
   behavior;
5. run one pilot; and
6. record the gateway and underlying model separately.

Do not reuse one gateway's API key, queue URL, upload behavior, or pricing
assumptions with another gateway bearing a similar model name.

Useful first-party starting points include:

- [ByteDance Seedance](https://seed.bytedance.com/en/seedance2_0);
- the currently selected official Kling developer/account documentation;
- the currently selected official MiniMax/Hailuo documentation;
- [HeyGen developer documentation](https://developers.heygen.com/); and
- each provider's current terms/pricing/region pages.

If first-party documentation for a claimed capability cannot be found, mark it
unverified and do not make it the only production route.

### 13.3 Avatar/performance routes

Use HeyGen or another performance/avatar system when the story needs a
controlled speaking presenter or consented photo avatar. It is not a generic
substitute for real documentary footage or cinematic action.

Before creating an avatar:

- verify likeness and voice consent;
- distinguish public licensed avatar, photo avatar, custom avatar, and real
  filmed actor;
- verify allowed commercial/context use;
- lock script, pronunciation, voice, gestures, background, and aspect;
- run a short lip-sync/expression pilot; and
- disclose synthetic presenter use where required.

### 13.4 Local/private image route

Use a local image model such as a supported FLUX/MLX/ComfyUI workflow when:

- confidential media cannot leave the machine;
- the machine has enough verified RAM/VRAM/disk;
- the model/license supports the project;
- local quality is sufficient; and
- the environment can be installed without altering unrelated global state.

Run a low-resolution smoke test, then a pilot. Record model/checkpoint hash,
VAE/LoRA/control inputs, sampler, steps, guidance, seed, dimensions, software
versions, and license.

### 13.5 Local/private video route

Use a supported local video model such as a current LTX/ComfyUI pipeline for
privacy, free fallback, previews, or suitable designed shots. Before large
downloads/renders:

- estimate weights/cache/output disk;
- inspect available RAM/VRAM and swap risk;
- verify model and weights license;
- install in an isolated environment;
- run the smallest representative test;
- record checkpoint/workflow/node versions and seeds; and
- never label a low-resolution local output native 4K.

If local quality fails the keeper gate twice, use stock, custom capture,
deterministic motion, or an authorized cloud provider rather than brute-force
retries.

### 13.6 Designed motion fallback

Designed motion is often the premium answer for:

- product/UI proof;
- exact typography/icons/logos;
- diagrams and abstract concepts;
- still-photo parallax;
- controlled device mockups;
- map/data visualization;
- privacy-sensitive footage; and
- a shot whose generative motion keeps breaking.

Be honest in the manifest: a Ken Burns move, 2.5D parallax, loop, or animated
mask is `designed_motion`, not live footage.

---

## 14. Provider registry and pilot selection

Create `PROVIDER_REGISTRY.md` with one row per **selected/probed** provider,
not every provider on the market:

| Field | Record |
|---|---|
| Provider/surface | Official name and website/API/CLI/browser |
| Underlying model | Exact active label/version |
| Operations | T2V/I2V/reference/frames/extend/edit/avatar/audio |
| Inputs | Formats, counts, sizes, duration limits |
| Outputs | Ratio, dimensions, FPS, duration, audio, format |
| Control | Seed, negative field, camera, timing, edit state |
| Region/plan | Current availability |
| Cost | Cash/credit/quota unit per action |
| Rights | Commercial/output/likeness/disclosure terms |
| Privacy | Retention, training/opt-out, region, deletion |
| Watermark/provenance | Visible/invisible/metadata requirements |
| Retry/idempotency | Official semantics |
| Download | URL expiry/history/recovery |
| Selected use | Which shot group and why |
| Fallback | Next provider/route |
| Verified at | Timestamp and official source links |

### 14.1 Pilot-before-batch protocol

1. Group shots by continuity group, provider/model, mode, reference strategy,
   aspect, and quality requirement.
2. Select the riskiest representative shot for each materially different
   strategy.
3. Set concurrency to one.
4. Predeclare pilot quota and worst-case batch cost, including failed and
   charge-ambiguous jobs.
5. Submit one pilot with the real references and real target crop.
6. Download, hash, probe, decode, and run the source keeper gate.
7. Place it in the actual animatic with real captions/transition/sound.
8. If it passes, freeze model/reference/settings for that group.
9. Run a two-shot mini-batch.
10. Continue only if continuity and pass rate remain above the declared floor.

Stop new submissions if continuity drifts, worst-case remaining cost exceeds
authorization, the provider changes model behavior, or pass rate falls below
the profile threshold.

Define pilot math before submitting:

- `submission_keeper_rate = completed route attempts with at least one variant
  passing both source and integration gates / completed route attempts`;
- `variant_keeper_rate = variants passing both gates / decoded returned
  variants`;
- local/provider preflight failures are reported separately and excluded;
- unresolved ambiguous jobs are reported as `ambiguous_count` and freeze new
  paid submissions; they are never quietly counted as keepers or ordinary
  failures; and
- a source-only keeper is not a pilot success until it also passes in the real
  edit.

The declared threshold must name which rate it uses; default to
`submission_keeper_rate` because one multi-variant submission is one billed
attempt. Freeze only strategy-core controls—provider, model, mode, reference
architecture, aspect, duration class, and core quality/camera settings. Do not
freeze shot-specific subject, action, composition, or timing fields.

---

## 15. Atomic acquisition-attempt protocol

Create one acquisition-attempt record for every executed route: existing/user
asset evaluation, stock acquisition, authentic capture, custom shoot ingest,
designed/3D production, local generation, or cloud generation. Provider,
submission, and billing fields are nullable/not-applicable for a route that has
none, but the attempt indices, strategy, outcome, assets, QA, and next action
are never omitted.

For an external/cloud submission, use this atomic branch:

```text
write preflight intent with no attempt indices
→ validate truth/rights/privacy/inputs/capability/visible cost
→ if preflight passes, atomically reserve route index + shot index + quota
→ persist the indexed acquisition-attempt record as preflight_passed
→ submit exactly once
→ immediately persist request/history/interaction ID
→ poll with official guidance and bounded deadline
→ recover existing success before any regeneration
→ download to unique .part path
→ verify type/size/probe/decode
→ hash and atomically promote to raw/
→ run keeper QA
→ approve, repair once, or advance fallback_cursor
```

Use a provider idempotency key only when current official documentation
guarantees its semantics. Disable or document hidden SDK retries. A failed
download is not a failed generation; recover/redownload the successful job
instead of paying to regenerate it.

Preflight and attempts use different records. Before validation, write an
unindexed `intent_id` such as `INT_S02_SH040_SG0001v01_P003` to
`PRECONDITION_EVENTS.jsonl`. It contains the shot/strategy, check results,
error, timestamps, and exact next action, but `attempt_id`,
`route_attempt_index`, and `shot_attempt_index` are `null`. A preflight failure
stays in that log and consumes no attempt. A corrected preflight must append a
new JSONL event: either the next monotonic `revision` of the same open
`intent_id`, with a new `event_id` and `previous_event_id`, or a new intent
sequence. Never rewrite a prior event, and never reserve an attempt ID for an
open/failed intent. Reconstruct current intent state by replaying valid events
in revision order; reject duplicate revisions, broken predecessor links, and
any event appended after terminal `passed_promoted` or `superseded`.

Only after every preflight gate passes does one atomic state transaction
reserve the next route and shot attempt indices, reserve applicable billing,
create the collision-free `attempt_id`, and persist the acquisition-attempt
record with `execution_state: preflight_passed`. Then execution/submission may
start. A local/capture/stock/design attempt moves to `started` and then
`materialized` (or a recorded post-start failure) and still receives source and
integration results. A precondition discovered after `started` is
`failed_precondition_after_start` and does consume the already reserved
attempt. This rule prevents both inflated counters and reusing/colliding A01
after a failed preflight.

Before submit, compute a `submission_fingerprint` from provider/product/model,
operation, ordered input hashes, prompt hash, normalized settings, account
scope, and a bounded creation window. After a crash with no request ID, search
authorized history/billing for that fingerprint and window; do not resubmit
until an existing or possibly charged request is ruled out. `updated_at`,
provider status, polling, and billing-check fields below are mandatory recovery
state, not optional notes.

### 15.1 Acquisition-attempt record

```json
{
  "attempt_id": "ATT_S02_SH040_SG0001v01_R01_S02",
  "shot_id": "S02_SH040",
  "acquisition_route": "cloud_generation",
  "generation_mode": "image_to_video",
  "fallback_step": 0,
  "strategy_id": "STRAT_SG0001_v01",
  "route_attempt_index": 1,
  "shot_attempt_index": 2,
  "variant_count_requested": 2,
  "attempt_pass_rule": "at_least_one_variant_passes_source_and_integration",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "provider": {
    "name": "provider",
    "product": "surface",
    "model": "active-model-label",
    "version": "recorded-if-exposed",
    "access_mode": "api|browser|cli"
  },
  "inputs": {
    "prompt_path": "prompts/videos/S02_SH040_A01.txt",
    "prompt_sha256": "...",
    "reference_asset_ids": [],
    "reference_hashes_in_order": [],
    "reference_roles": {},
    "settings": {}
  },
  "billing": {
    "billing_lines": [
      {
        "line_id": "cash_usd",
        "kind": "cash",
        "unit": "USD",
        "bucket": "cash",
        "rate_basis": "per_generation|per_second|overage|other",
        "estimated": 0,
        "reserved": 0,
        "actual": null,
        "charge_state": "not_applicable|reserved|uncharged|charged|unknown_charged",
        "pooled_components": null,
        "pool_basis_reference": null
      },
      {
        "line_id": "provider_pooled_media_credits",
        "kind": "quota",
        "unit": "credits|seconds|generations|characters|other",
        "bucket": "provider_pooled",
        "rate_basis": "per_generation|per_second|other",
        "estimated": 0,
        "reserved": 0,
        "actual": null,
        "charge_state": "not_applicable|reserved|uncharged|charged|unknown_charged",
        "pooled_components": ["video_credits", "image_credits"],
        "pool_basis_reference": "required only when bucket=provider_pooled"
      }
    ],
    "worst_case_authorized": true,
    "reconciled_at": null
  },
  "privacy": {
    "data_classification": "public|internal|confidential|restricted",
    "provider_authorized": true,
    "asset_class_authorized": true,
    "retention_training_region_reference": "..."
  },
  "execution_state": "preflight_passed|started|submitted|polling|submit_ambiguous|succeeded_pending_materialization|materialized|failed_precondition_after_start|failed_transient|failed_policy|abandoned",
  "attempt_outcome": "pending|keeper|no_keeper|quarantined|policy_blocked",
  "billing_state": "not_applicable|reserved|reconciled|unknown_charged",
  "submission": {
    "idempotency_key": null,
    "submission_fingerprint": "sha256:...",
    "request_or_history_id": null,
    "submitted_at": null,
    "poll_deadline": null,
    "last_known_provider_status": null,
    "last_poll_at": null,
    "poll_count": 0,
    "billing_checked_at": null
  },
  "failure": {
    "class": null,
    "provider_code": null,
    "dominant_defect": null,
    "controlled_change": null
  },
  "output_asset_ids": ["AST_S02_SH040_SG0001v01_R01_S02_V01"],
  "variant_results": [
    {
      "variant_index": 1,
      "asset_id": "AST_S02_SH040_SG0001v01_R01_S02_V01",
      "source_gate": "pending|approved|repair_candidate|rejected|quarantined",
      "integration_gate": "not_run|pending|approved|rejected|quarantined",
      "verdict": "pending|keeper|nonkeeper|repair_candidate|quarantined",
      "rejection_codes": []
    }
  ],
  "exact_next_action": "..."
}
```

For non-provider routes, set `provider` and `submission` to `null` unless there
is a real vendor/request record; use an empty `billing_lines` list and
`billing_state: not_applicable` when nothing is metered or charged. A paid stock
license or custom shoot uses its actual cash billing line even though it is not
a generation request. `execution_state`, `attempt_outcome`, and `billing_state`
are independent: a clip may be `materialized` and a `keeper` while billing is
still `unknown_charged`, or be `materialized` and `no_keeper` with reconciled
billing.

Calculate `attempt_outcome: keeper` only when at least one variant has both
`source_gate: approved` and `integration_gate: approved`. Set `no_keeper` when
all materialized variants are terminal nonkeepers; use `quarantined` when
rights, provenance, download, or another unresolved gate prevents approval.
Never infer an attempt outcome merely from successful execution/download.

Create one billing line per independently metered unit/bucket. Cash always has
an ISO-4217 currency unit and includes possible overage; credits, seconds,
generations, characters, prepaid, included-subscription, and free quota are not
cash and are not merged. Quota `bucket` values are `prepaid`,
`included_subscription`, `free`, or `provider_pooled`. Use `provider_pooled`
only when current provider
evidence shows a genuinely indivisible pool. Then `pooled_components` and
`pool_basis_reference` are required; all component billing lines must be absent
or explicitly `not_applicable`, never simultaneously reserved. For every other
bucket, both pooled fields are `null`. Reserve and reconcile each line
independently; never transfer usage between lines or count one charge twice. If
any line is ambiguous, mark that line `unknown_charged` and set aggregate
`billing_state: unknown_charged` without changing execution/outcome state.

Provider/account/private history IDs stay in the private production archive;
delivery receives redacted references.

### 15.2 Polling and download rules

- Honor provider `Retry-After`/status guidance.
- Otherwise use a bounded provider-specific backoff/deadline, not infinite
  polling.
- Never launch duplicate unawaited jobs.
- Download temporary outputs immediately.
- Save to a unique partial path first.
- Reject HTML/JSON error pages disguised as media.
- Verify nonzero bytes, MIME/signature, expected dimensions/duration, and full
  decode before promotion.
- Preserve the original provider output; derived edits receive new asset IDs.

---

## 16. Exact first-failure / second-failure policy

Never “try again” without classifying the failure.

### 16.1 Failure classes

- `precondition`: missing file, invalid input, dependency, disk, auth, region,
  unsupported mode, rights, permission, or budget.
- `transient_definite_uncharged`: documented service/network/rate failure known
  not to have accepted/charged the job.
- `submit_ambiguous`: timeout/disconnect after submission may have been
  accepted.
- `quality`: output exists but fails identity, anatomy, motion, style,
  continuity, crop, detail, or truth.
- `policy_or_safety`: provider refusal, consent/privacy/safety/rights conflict.
- `download_or_decode`: successful job exists but local retrieval/file is bad.
- `integration`: source is individually plausible but fails in the edit.

### 16.2 First quality failure

1. Preserve the failed output and log.
2. Assign **one dominant defect code**.
3. Compare prompt, references, settings, and output.
4. Choose one controlled variable most likely to fix the root cause.
5. Keep all other variables stable.
6. Submit one final attempt on that route within budget.
7. Compare A1 versus A2, not merely A2 versus imagination.

Examples of one controlled variable:

- replace conflicting face references with canon + closest angle plate;
- change start still from mid-action to a stable anticipatory pose;
- reduce two actions to one;
- change camera orbit to locked camera;
- shorten duration;
- increase a documented quality/compute setting only when it does not change
  provider, model family, mode, reference architecture, or another
  `strategy_id` boundary; or
- change crop/shot size while preserving story action.

Switching from a preview model/tier to a different quality model is a new
strategy unless the provider explicitly exposes both as settings inside the
same predeclared model strategy. Otherwise create a new `strategy_id`, reset
`route_attempt_index` to 1, continue `shot_attempt_index`, reserve its cost, and
run the applicable pilot.

Changing provider, prompt, references, seed, duration, camera, and action all at
once does not diagnose anything.

### 16.3 Second quality failure on the same route

After the second failure:

1. freeze that route for the shot;
2. do not submit a third synonym-tweaked prompt;
3. advance `fallback_cursor`;
4. preserve the best useful fragment only if it independently passes;
5. use visual constraints or redesign the shot—not a longer prompt; and
6. reopen script/user approval only if the fallback materially changes
   message, CTA, rights, cost, or promised truth.

### 16.4 Transient failures

For a definite uncharged transient failure:

1. read the provider status/error and official retry guidance;
2. honor `Retry-After`;
3. retry identical inputs once; and
4. on the second transient failure, change access path/provider/route.

Do not treat a safety, region, invalid parameter, or exhausted quota error as
transient.

### 16.5 Ambiguous submission and `unknown_charged`

A timeout after submission is not a normal failure:

1. mark `submit_ambiguous`;
2. never resubmit that request;
3. query by request/interaction/history/idempotency ID;
4. check authorized account generation and billing history;
5. poll with bounded backoff and a declared deadline;
6. if unresolved, mark `unknown_charged` and retain the full reservation;
7. continue only through an uncharged/local/stock/designed fallback if the
   remaining budget still permits it; and
8. otherwise pause with the exact read-only billing/history check required.

A late output is quarantined and passes normal QA. It never silently replaces
an already approved fallback.

### 16.6 Download/corruption failures

If the provider says the job succeeded but the file is partial/corrupt:

1. recover/redownload the **same output**;
2. try an official alternate download/export format once;
3. inspect URL expiry, signed-link truncation, content type, and available disk;
4. preserve error bodies/logs; and
5. after two recovery failures, change provider/access route without
   regenerating unless the original output is genuinely unrecoverable and a
   new paid attempt is separately authorized.

### 16.7 Rights, consent, privacy, watermark, and safety failures

These receive zero prompt retries:

- unresolved license or model/property release;
- real-likeness/voice consent missing;
- unapproved confidential cloud upload;
- real-human-only requirement violated by synthetic output;
- required clean export unavailable;
- misleading endorsement/testimonial;
- unsafe/culturally wrong essential action; or
- product/UI proof invented.

Change source/route or revise the concept truthfully.

---

## 17. Defect diagnosis and ranked fallback matrix

| Dominant defect | First controlled correction | After second failure |
|---|---|---|
| Identity/face drift | Use canon plus closest angle plate; remove conflicting references | Exact composed still → I2V; matched released stock/custom shoot |
| Age/body build drift | Strengthen one approved full-body anchor; shorten shot | New angle-matched start still; custom/stock route |
| Hair/beard/glasses mutation | Use one clean grooming/accessory plate | Compose exact still; avoid angle/orbit that breaks it |
| Wrong angle changes person | Add matching profile/three-quarter plate | Cut between approved angles instead of orbiting |
| Hands/extra fingers | Reduce to one action and clearer framing | Hand/prop plate; split setup/contact/result; real capture |
| Hand-object contact floats | Start with correct contact/anticipation pose | First+last endpoints; insert/cutaway/custom capture |
| Prop changes size/shape | Add isolated prop reference and role | Deterministic composite/3D or authentic capture |
| Phone/device geometry bends | Use clean hardware start plate | Verified 3D shell with authentic screen; capture |
| Fake UI/text/logo | Hard reject; remove from generative prompt | Authentic capture/official asset + deterministic post; no retry |
| Wardrobe color/construction drift | Use locked full-body wardrobe plate | Composite wardrobe/shorten/cut; stock/custom shoot |
| Location topology mutates | Use clean empty location plate; lock camera | Extend from clean source or real/3D location plate |
| Lighting changes mid-shot | Remove conflicting light adjectives; one motivated key | Deterministic grade/relight within truth or alternate source |
| Camera ignores direction | State one move and what remains locked | First/last frames, locked start still, alternate provider |
| Unwanted cuts | Explicit one continuous shot; simplify beats | Generate shots separately and edit deterministically |
| Motion is frozen/zoom-only | Use an anticipatory pose and concrete action verb | First+last frames, shorter action, deterministic parallax |
| Rubber/floaty physics | Shorten duration; reduce action/camera complexity | I2V, stock, real capture, or designed motion |
| Flicker/texture crawl | Shorter clip; stable reference/light | Alternate provider/source; do not hide proof under blur |
| Subject leaves protected zone | Fix start composition/camera framing | New still/native aspect/alternate crop/source |
| No caption/CTA negative space | Recompose start still with declared corridor | Different shot/stock/design; never cover face/product |
| Multi-character identity mixing | Precompose approved group still; fixed blocking | Singles/OTS/cut-reverse-cut; performance capture/composite |
| Character changes after extensions | Stop extension and return to original canon | Fresh shot from clean extracted frame + canon |
| Voice/lip-sync drift | Shorter quoted line; consistent voice/performance | Stable ADR/ElevenLabs dub; avatar/performance route |
| Generated audio unwanted | Disable when current model allows; strip in post | Use a silent visual route and deterministic mix |
| Style/color mismatch | Change one observable style reference | Deterministic finishing or alternate provider/source |
| Cultural/domain error | Hard reject and revise with checklist/reviewer | Truthful stock/custom capture or concept revision |
| Privacy/PII appears | Hard reject; use clean test data/profile | Recapture/local route; never blur essential proof selectively |
| Visible/provider watermark | Obtain authorized clean export | Different licensed provider/source; never crop/inpaint it |
| Low output resolution | Use a higher supported tier/source if authorized | Disclosed upscale or change crop/source; never call native 4K |
| Decode/color-range error | Recover/export again with correct format | Controlled transcode preserving source truth; alternate route |
| Provider refusal | One neutral lawful clarification only if genuinely misclassified | Alternate lawful route; never evade safeguards |
| Rate limit/service outage | One documented retry | Alternate provider/local/stock route |
| Credits depleted | Stop submissions | Free/local/stock/design route or request budget decision |
| Integration feels repetitive | Choose a genuinely different composition/action | New stock/capture/design route; a tiny zoom is not a new shot |

### 17.1 Shot redesign ladder

When the literal action keeps failing, preserve meaning with this order:

1. simplify one action;
2. change to an easier angle/shot size;
3. split setup → contact → result across cuts;
4. show reaction rather than broken interaction;
5. use a cutaway/insert that still truthfully supports the line;
6. use a designed metaphor for emotion—but never for factual product proof;
7. use authentic stock/capture; and
8. rewrite/remove the unsupported line only if the locked narrative gate is
   reopened.

Do not hide an essential product or safety action behind a cutaway just to pass
visual QA.

---

## 18. Source keeper gate

Run this gate on the original downloaded/captured/generated file before editing.

### 18.1 Technical integrity

- correct file signature/MIME;
- nonzero bytes;
- expected streams;
- clean full decode;
- exact dimensions, rational FPS, frame count, duration, audio layout;
- timestamps and start time;
- color primaries/transfer/matrix/range or declared unknown;
- no unexpected corruption, black frames, freeze, or dropout; and
- source is not a web page/error message saved with a media extension.

### 18.2 Truth, rights, privacy, provenance

- `truth_origin` and `acquisition_route` are both correct;
- narrative claim is honestly supported;
- source/license/creator/access date are recorded;
- required model/property/voice/likeness consent is recorded securely;
- commercial/paid-ad/territory/term/modification/attribution rights fit;
- cloud upload permission and provider terms fit;
- PII/OCR/privacy scan passes;
- watermark/provenance/content credentials are preserved as required; and
- synthetic disclosure requirement is recorded.

### 18.3 Visual and temporal review

Inspect:

- first, middle, and last frames;
- a 1–2 fps strip for ordinary motion;
- a denser strip and full playback for hands, faces, interactions, text, and
  fast action;
- full-resolution crops of the weakest face/hand/object/edge/detail region;
- frame-to-frame identity, anatomy, geometry, reflections, shadows, physics,
  background topology, and unwanted text; and
- native audio sync when generated.

### 18.4 Continuity review

Compare against:

- canonical character and matching angle plate;
- wardrobe/prop/location anchors;
- prior shot `out_state` and next shot `in_state`;
- appearance boundary state: hair arrangement, makeup, wetness, sweat, dirt,
  injury, garment fasteners, tears, stains, and damage;
- prop boundary state: hand, orientation, fill/consumption, open/closed, on/off,
  wear, breakage, and any story-driven change;
- handedness, gaze, screen direction, camera axis;
- time/weather/light direction;
- grade and texture; and
- voice/performance identity.

### 18.5 Effective detail

Compute usable detail after the planned crop/scale:

```text
effective_width  = source_width  × retained_horizontal_fraction
effective_height = source_height × retained_vertical_fraction
```

Then compare effective pixels to the delivery placement. A native 2160×3840
source zoomed into one quarter of its area does not provide full native-detail
4K at that crop.

### 18.6 Keeper verdict

Use only:

- `approved` — all applicable source gates pass;
- `repair_candidate` — one bounded truthful deterministic fix may pass;
- `rejected` — cannot enter the edit; or
- `quarantined` — rights/charge/download/provenance state unresolved.

Never let “best of a bad batch” mean approved.

---

## 19. Integration keeper gate

A good source can still fail in context. Place the candidate in the locked
animatic/edit at the exact intended frames, crop, speed, captions, callouts,
transition, voice, music, and CTA.

Check:

1. the shot fulfills its narrative job immediately;
2. action lands on the spoken/music cue;
3. source handles support the cut;
4. first/last poses connect to adjacent shots;
5. actor/location/grade/energy continuity holds;
6. protected face/hand/product/UI/caption/CTA regions do not collide;
7. a crop/zoom does not expose insufficient detail;
8. generated audio does not conflict with the final mix;
9. a microshot remains readable at normal phone size;
10. the shot adds a useful change rather than repetitive footage; and
11. the transition does not hide a continuity error that remains visible at
    full playback.

Record the integration-preview SHA in the asset manifest. If the timeline,
crop, speed, or major overlay changes, rerun integration QA.

---

## 20. Immutable asset manifest

Acquisition-attempt records describe executions/transactions. Assets describe
bytes and lineage. Do not mix them.

```json
{
  "asset_id": "AST_S02_SH040_SG0001v01_R01_S02_V01",
  "kind": "generated_video|stock_video|capture|image|designed_motion|audio",
  "truth_origin": "synthetic_photoreal",
  "acquisition_route": "cloud_generation",
  "origin_attempt_id": "ATT_S02_SH040_SG0001v01_R01_S02",
  "origin_provider_job_id": null,
  "parent_asset_ids": [],
  "source": {
    "provider_or_owner": "...",
    "creator": "...",
    "canonical_source_reference": "...",
    "acquired_at": "ISO-8601"
  },
  "file": {
    "relative_path": "raw/generated/file.mp4",
    "sha256": "...",
    "bytes": 0,
    "mime": "video/mp4"
  },
  "native_specs": {
    "media_type": "audiovisual|video|image|audio",
    "duration_seconds": 0,
    "codec": "",
    "visual": {
      "width": 0,
      "height": 0,
      "fps": "0/1",
      "frames": 0,
      "pixel_format": "",
      "color": {}
    },
    "audio": {
      "sample_rate": 48000,
      "channels": 2,
      "channel_layout": "stereo",
      "duration_samples": 0,
      "sample_format": ""
    }
  },
  "uses": [
    {
      "use_id": "USE_S02_SH040_MAIN",
      "shot_id": "S02_SH040",
      "timeline_start_frame": 0,
      "timeline_end_frame_exclusive": 0,
      "timeline_start_sample": null,
      "timeline_end_sample_exclusive": null,
      "source_in_frame": 0,
      "source_out_frame_exclusive": 0,
      "source_in_sample": null,
      "source_out_sample_exclusive": null,
      "playback_rate": 1.0,
      "visual_use": {
        "crop": {},
        "transform": {},
        "effective_width": 0,
        "effective_height": 0,
        "scale_ratio_to_master": 1.0,
        "native_detail_classification": "native_detail_4k|mixed_native_4k_composition|upscaled_4k_output|not_4k"
      },
      "audio_use": null,
      "integration_preview_path": "...",
      "integration_preview_sha256": "...",
      "integration_report_path": "...",
      "integration_report_sha256": "...",
      "integration_status": "pending|approved|rejected|quarantined",
      "integration_rejection_reason": null
    }
  ],
  "rights": {
    "license_evidence": "...",
    "consent_evidence_reference": "...",
    "paid_ads_allowed": true,
    "territory": [],
    "term": "...",
    "modification_allowed": true,
    "attribution": "...",
    "redistribution": "yes|no|restricted"
  },
  "privacy": {
    "classification": "public|internal|confidential|restricted",
    "cloud_upload_authorization": "...",
    "pii_scan": "passed|failed"
  },
  "provenance": {
    "content_credentials": "...",
    "watermark_status": "none|visible|invisible|unknown",
    "synthetic_disclosure_required": true
  },
  "qa": {
    "source_report_path": "...",
    "source_report_sha256": "...",
    "keeper_gate_version": "1.0",
    "defect_codes": []
  },
  "source_status": "raw|approved|repair_candidate|rejected|quarantined",
  "source_rejection_reason": null,
  "known_limitations": []
}
```

An asset used in multiple shots has one `uses[]` entry per shot/timeline slot;
never reuse one crop, source range, effective-detail result, preview hash, or
integration report/status for every placement. The source can remain globally
approved while one use is rejected in context; only a use with
`integration_status: approved` may populate that timeline slot.

Every asset has an `origin_attempt_id`, including existing, user-supplied,
stock, official, captured, custom-shot, designed, local, and cloud assets.
`origin_provider_job_id` is nullable and is populated only when a real external
job exists; it is not fabricated for non-provider assets.

Media-specific fields are strict:

- video/image/audiovisual assets set `native_specs.visual` and each visual
  placement sets `visual_use`; the four-value
  `native_detail_classification` enum is identical to the master workflow and
  is calculated after the actual crop/scale;
- audio-only assets set `native_specs.visual: null`, populate
  `native_specs.audio`, use exact source/timeline sample ranges, set
  `visual_use: null`, and populate `audio_use` with channel map, gain, fades,
  stretch/resample, and final sample rate;
- silent visual assets set `native_specs.audio: null` and `audio_use: null`;
  audiovisual assets may populate both; and
- use JSON `null` for a genuinely inapplicable field—never fake width, height,
  FPS, samples, crop, or 4K classification with zero or an invented enum.

Derived stills, trims, crops, stabilizations, upscales, grades, composites, and
selected subranges receive new asset IDs and point one-way to their parents.

---

## 21. ElevenLabs voice, music, SFX, and audio-asset workflow

ElevenLabs is an audio source, not the picture editor. Use its current website
or official API for voice design/library/TTS, consented cloning, music, SFX,
transcription, or dubbing when selected. Keep the deterministic local edit and
mix authoritative.

At run time open the current official documentation:

- [Text to Speech](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)
- [Voice Design](https://elevenlabs.io/docs/eleven-creative/voices/voice-design/)
- [Sound Effects](https://elevenlabs.io/docs/overview/capabilities/sound-effects)
- [Eleven Music](https://elevenlabs.io/docs/overview/capabilities/music)
- [Eleven Music Service Terms](https://elevenlabs.io/music-terms)
- [Eleven Music model-specific terms](https://elevenlabs.io/eleven-music-model-specific-terms)
- [ElevenLabs API reference](https://elevenlabs.io/docs/api-reference/introduction)

Model names, tags, languages, output formats, plan entitlements, character
costs, concurrency, and commercial-use terms change. Verify the current account
and request schema rather than treating examples as permanent.

### 21.1 Decide the voice source

Use this order:

1. approved human performance supplied/commissioned for the project;
2. an appropriate licensed Voice Library/PVC voice whose use fits;
3. Voice Design for a fictional custom voice;
4. Instant/Professional Voice Clone only with explicit scoped speaker consent;
5. another consented TTS provider; or
6. local TTS when privacy/budget requires and quality passes.

Voice selection matters more than endlessly tuning settings. Cast for target
language/region, age presentation, tone, intimacy, energy, and brand fit.

### 21.2 Voice rights and consent

- Never clone a voice from a reference video, voicemail, interview, celebrity,
  employee, friend, or stock clip without explicit appropriate consent.
- Confirm the voice/license supports the intended commercial, paid-ad,
  territory, and duration use.
- Keep raw consent in secure approved storage; manifests use a redacted ID.
- Do not claim a synthetic/clone performance was recorded by the person.
- If consent is missing, use a licensed non-cloned voice.

### 21.3 Build the Voice Performance Map

Do this before full generation:

```text
time window | heard text | intention | subtext | intensity 0–5 | pace/WPM |
pause/breath | emphasized words | picture relation | forbidden delivery
```

Also define:

- overall emotional arc;
- pronunciation lexicon;
- target first-word and final-word windows;
- deliberate silences;
- voice-free CTA tail;
- one coherent accent/identity;
- maximum acceptable time manipulation; and
- reference take/hash once selected.

For an applicable emotional promo, a useful arc is:

```text
immediate human hook
→ contained tension/pain
→ recognition
→ one practical turn
→ believable relief
→ calm earned CTA
```

Do not force sadness onto a tutorial or high energy onto an intimate story.

### 21.4 ElevenLabs website workflow

When the user is already signed in:

1. Open the official ElevenLabs dashboard in the authenticated browser.
2. Confirm the active workspace, plan/quota, commercial terms, and intended
   feature before generating.
3. Do not expose private text/project names beyond the authorized asset class.
4. Choose a suitable existing voice or use Voice Design.
5. Generate only a short hook/turn/brand/CTA audition first.
6. Create 3–4 genuinely different performance candidates within budget.
7. Download every audition with deterministic names.
8. Listen inside the animatic with the intended music bed.
9. Select one voice/take/settings and hash the choice.
10. Generate the full coherent narration or carefully planned segments.
11. Download the highest useful authorized format.
12. Record voice ID, model, settings, text, pronunciation method, history ID,
    date, quota cost, output file, and SHA-256.

If login/MFA/CAPTCHA appears, pause for the user to authenticate directly. Do
not request the password or session token in chat.

### 21.5 Voice Design

The current official Voice Design guide says the tool creates voice options
from a description and preview text. Describe:

- adult age presentation;
- gender presentation only when relevant;
- language/accent/region;
- pitch/timbre/texture;
- pace and rhythm;
- warmth/authority/intimacy;
- energy and emotional restraint; and
- recording quality.

Example:

```text
Adult male narrator, visually irrelevant and not based on a real person;
neutral American English, early-thirties vocal presentation, warm mid-low
timbre, intimate conversational delivery, restrained emotion, natural breaths,
measured pace, gentle confidence, clean close-mic studio recording, never an
announcer or sermon tone.
```

Use script-relevant preview text. A generic sentence can hide pronunciation,
pace, or emotional problems.

### 21.6 Performance auditions

Generate 3–4 variants that differ in a meaningful dimension:

- contained versus warmer emotion;
- measured versus slightly urgent pace;
- lower versus medium intensity;
- more conversational versus more polished; or
- an alternate suitable voice.

Keep the script identical for fair comparison. Score:

| Criterion | Weight |
|---|---:|
| Natural believable delivery | 25 |
| Emotional arc and subtext | 20 |
| Pronunciation/name accuracy | 15 |
| Pace and breath fit | 15 |
| Voice/brand/audience fit | 10 |
| Consistency across lines | 10 |
| Clean technical audio | 5 |

Hard reject robotic cadence, sing-song sentence melody, fake crying,
melodrama, announcer voice, rushed consonants, incorrect brand name, spoken
direction tags, unstable identity, or clipped/noisy audio.

### 21.7 Full-take versus per-line generation

Prefer one coherent monologue when emotional flow matters. A full take keeps
timbre, room, energy, and sentence-to-sentence intention connected.

Use per-line/scene generation only when:

- the product supports stable context/continuity;
- exact timing requires it;
- multilingual/dubbing segmentation requires it; or
- one line needs a pickup.

For segments, lock the same voice/model/settings/session intent and hand-edit
breaths/joins. Do not assemble visibly different voice identities.

### 21.8 Pronunciation

1. List every brand, person, place, acronym, technical, cultural, and
   non-English term.
2. Audition the isolated word and a natural full sentence.
3. Use the current model's supported pronunciation dictionary/phoneme/tag
   feature when available.
4. Otherwise use production-only phonetic spelling.
5. Keep the correct spelling in captions and on-screen text.
6. Listen at raw, edited, mastered, and encoded-final stages.

Do not use ellipses as a reliable pause instruction. If timing must be exact,
edit pauses in PCM rather than fighting the model.

### 21.9 Timing and picture lock

- Measure the selected voice file, words, breaths, and pauses.
- Align scenes to real audio timing—not estimated word count.
- Do not stretch speech aggressively to rescue a broken script.
- A material pause/emphasis/timbre/duration change reopens dependent shots and
  captions.
- Keep a planned voice-free music tail when the CTA needs one.

### 21.10 Sound effects

Use ElevenLabs SFX or a licensed/local library only for visible or narratively
justified events. Prompt with:

```text
[source/action] + [material/surface] + [distance/room] + [energy] +
[duration/one-shot/loop] + [what must not be present]
```

Examples:

- `One soft smartphone haptic tap on a wooden café table, close perspective,
  dry room, short one-shot, no musical impact.`
- `Interior commuter train ambience, low rolling wheel noise, soft carriage
  rattle, distant indistinct passengers, seamless loop, no announcements.`

Match SFX to picture timing and perspective. Do not add generic booms,
whooshes, chimes, or risers to every cut.

### 21.11 Music

Before selecting Eleven Music, hard-gate the intended use against the current
[Music Service Terms](https://elevenlabs.io/music-terms) and
[model-specific terms](https://elevenlabs.io/eleven-music-model-specific-terms),
not only the general account plan. Record the active model, entity/user
eligibility, prohibited industries/inputs, attribution, download, streaming,
sync/media, territory, and commercial restrictions. Some self-serve uses may
exclude or separately condition film, television, radio, or studio-game use;
never infer that a downloadable file is cleared for the campaign. If the exact
distribution is ineligible or unclear, use a properly licensed library,
commissioned score, another authorized generator, or silence/ambience.

Choose in this order:

1. user-supplied track with verified sync/commercial rights;
2. licensed music library with saved evidence;
3. Eleven Music or another authorized generator;
4. local generation when suitable; or
5. intentional ambience/silence.

Music prompt fields:

```text
genre/style + emotional arc + instruments + tempo/energy + structure/time
markers + video context + instrumental/vocal instruction + forbidden traits
```

Example:

```text
Instrumental modern cinematic ambient score for a 36-second product short.
0–8s restrained felt piano and low warm texture; 8–20s subtle pulse enters;
20–29s believable hopeful lift without triumph; 29–36s simple resolved chord
and clean voice-free CTA tail. No vocals, no trailer braams, no imitation of a
named artist, no dramatic drop.
```

Select a source window long enough for the edit. Avoid a bad loop or music that
ends before the CTA. If the video is extended 1–2 seconds for CTA readability,
extend picture and music together and recheck exact frame/sample anchors.

### 21.12 Audio mix handoff

Deliver applicable:

- raw selected voice;
- edited voice;
- music source and edit;
- SFX/ambience stems;
- full PCM/WAV premaster;
- final mix;
- word timings/transcript;
- voice/music/SFX manifest; and
- licenses/consent references.

Duck music transparently under voice. Preserve emotional breaths. Measure and
apply controlled two-pass loudness to the full mix, then remeasure the encoded
delivery because lossy encoding can change true peak.

### 21.13 ElevenLabs/audio failure ladder

| Failure | First correction | After second failure |
|---|---|---|
| Voice does not fit | Recast before tuning settings | Voice Library/PVC/human/local alternate |
| Emotion flat | One controlled performance/style change | Different voice or human performance |
| Emotion overdone | Raise restraint/stability or simplify punctuation/tags | Recast; do not fade melodrama in post |
| Brand pronunciation wrong | Supported lexicon/phoneme or production spelling | Isolated pickup/full retake; alternate voice |
| Tags spoken aloud | Remove unsupported tags and regenerate | Use plain text + post timing |
| Pace too fast | Script/punctuation/speed correction within natural range | Rewrite timing or recast; no heavy stretch |
| Segment timbre drift | Regenerate coherent full take/context-linked segment | Use one full performance or another provider |
| Clone unavailable/consent missing | Stop clone route | Licensed non-cloned voice |
| Rate limit | One official retry after guidance | Website/API alternate or local/other provider |
| Quota depleted | Stop | Authorized free/local/human route or budget decision |
| SFX mismatch | Rewrite source/material/perspective prompt | Licensed/recorded foley or omit |
| Music feels generic | Change structure/emotional instrumentation once | Licensed authored track/other generator |
| Music too short | Choose earlier/longer clean window | Documented musical edit or new track |
| File clipped/corrupt | Recover/export same generation | Alternate output format/provider; do not hide |

A machine that cannot listen cannot approve emotional performance. It may run
technical QA and route immutable files to an authorized listener.

---

## 22. Authentic app, website, and product clips

Generated footage establishes emotion or context; authentic capture proves the
product.

### 22.1 Capture route order

1. build/run the supplied app/site and capture it in an available simulator,
   emulator, browser, or desktop sandbox;
2. use authorized staging/demo with seeded test data;
3. use a real device controlled by the agent/user when necessary;
4. use current official product footage/assets; and
5. request a short user recording only after self-capture routes are exhausted.

### 22.2 Capture state plan

For every proof shot record:

- build/commit/version;
- platform, device/viewport, OS/browser;
- account/test-data seed;
- starting state;
- exact taps/scrolls/inputs;
- expected final state;
- network/loading behavior;
- permissions/notifications/status bar;
- private-data redactions by using clean test data, not after-the-fact fakery;
- capture resolution/FPS/color/audio; and
- claim that the state proves.

### 22.3 Clean capture surface

Use a disposable/test profile. Remove or prevent:

- personal notifications/messages;
- autofill/password-manager UI;
- bookmarks/tab titles/history;
- personal email, name, address, location, photos, calendar;
- device identifiers/carrier/status details;
- developer overlays/debug menus;
- desktop files/shell paths/usernames; and
- unrelated apps/camera/microphone feed.

Do not blur essential product proof later when clean seeded data can be used.

### 22.4 Screen capture truth

- Record the full state transition and a clean hold.
- Capture several takes rather than speeding a broken take.
- Preserve native aspect and pixels.
- Do not repaint, AI-reconstruct, or invent a success state.
- If a notch/Dynamic Island/safe-area collision exists in the app, fix the app
  and recapture or reframe the complete truthful region.
- If the feature cannot be captured truthfully, remove/rewrite the claim.

### 22.5 UI inside a phone/device mockup

1. Capture the authentic UI first.
2. Build/use a verified 3D or tracked physical device only when it improves
   presentation.
3. Place the UI in the exact screen aperture with correct aspect/corners/cutout.
4. Keep screen pixels ungraded and sharp.
5. Hardware may receive physically plausible material, reflection, edge light,
   and shadow that do not obscure proof.
6. Use one shell at a time and change only the screen plane for state changes.
7. Match pose/light/shadow/reflection at proof-to-CTA handoffs.
8. Render at delivery resolution and measure device/caption/CTA gaps.

A perspective-pasted screenshot without real geometry/track/occlusion is not a
premium 3D phone render.

### 22.6 Product-capture fallback

```text
primary simulator/emulator/browser capture fails
→ diagnose build/state/permission
→ alternate supported platform or staging seed
→ real device capture
→ official current asset
→ controlled shoot
→ remove/rewrite claim
```

Never replace a failed proof capture with generative UI.

---

## 23. Missing-tool bootstrap and fallback rules

Install only the capabilities selected by the shot matrix. A large tool list is
not an instruction to install everything.

### 23.1 Capability audit

Record each as `present`, `required_install`, `authorized_browser`,
`fallback_selected`, or `N/A`:

| Capability | Typical tool/surface | Smoke test |
|---|---|---|
| Probe/transcode | FFmpeg/ffprobe | Probe and decode a tiny known file |
| Hashing | OS SHA-256 utility | Hash same file twice |
| Browser capture | Playwright/agent browser/OS capture | Inert local page screenshot/video |
| Image review | Native viewer/contact sheet | Inspect full-res crop |
| Image generation | Selected local/cloud provider | One low-cost neutral image |
| Video generation | Selected official provider/local model | One short pilot |
| Audio | ElevenLabs/other/local + FFmpeg | Short TTS/SFX + probe/listen |
| 3D | Blender/current renderer | One headless test frame |
| App capture | Xcode/ADB/browser/desktop | Test screenshot/short recording |
| ASR | Selected local/cloud tool | Known sentence transcript |

### 23.2 Safe installation

Before installing:

1. confirm host instructions permit installation;
2. resolve OS, architecture, available RAM/VRAM, free disk, package manager,
   shell, and runtime;
3. read the current official install instructions and release notes;
4. inspect install scripts/packages before running;
5. prefer project-local virtual environments and exact versions;
6. do not alter unrelated global configuration;
7. never print `.env`/keychain/secret values;
8. record source, version, command, date, and license; and
9. run a smoke test.

If official install or hardware requirements do not fit, choose a compatible
browser/API/provider or simpler local route. Do not repeat a failing install
without new information.

Use this exact installation-failure ladder:

1. On the first failure, preserve the full error/log, verify version/OS/arch/
   runtime/disk/permissions, inspect what changed, and diagnose the dominant
   cause before one controlled retry.
2. If the same error occurs a second time, stop that install path. Open current
   official installation/troubleshooting docs and current first-party issue/
   release notes, compare 3–5 genuinely different remedies for root-cause fit,
   compatibility, side effects, and effort, then choose one safe alternative.
3. Prefer a compatible project-local version, official browser/API surface,
   already installed tool, or alternate provider/capability. Do not run a third
   equivalent command with reordered flags.
4. For software selected as local/private, inspect telemetry, crash reporting,
   analytics, update agents, cloud sync, and background uploads. Disable them
   where supported and required. If the required local-only handling cannot be
   verified, do not feed the restricted asset to that tool.

### 23.3 Credentials and authenticated websites

- Prefer OAuth/provider login, OS keychain, secret manager, or environment
  variable entered directly by the user.
- Never request a password/API key/token in chat.
- Pause so the user can authenticate or approve an OS permission prompt.
- Never bypass CAPTCHA, anti-bot, access-control, region, or provider policy.
- A signed-in browser does not authorize buying credits or unlimited quota.

### 23.4 Local-only mode

Use a local-only route when:

- media is confidential/restricted;
- external upload is not approved;
- provider region/terms do not fit;
- budget is exhausted; or
- an adequate local/stock/capture/design route exists.

Local-only still requires model/software license review, disk/resource
planning, and full QA.

---

## 24. Prepare approved clips for the edit

Never overwrite raw sources. Derived media receives a new path, hash, and
manifest entry.

### 24.1 Probe first

For each source record:

- container and stream count;
- codec/profile/pixel format;
- width/height/SAR;
- rational average and real frame rate;
- decoded frame count and duration;
- timestamps/start time;
- color primaries/transfer/matrix/range;
- audio codec/sample rate/channels/layout; and
- full-decode result.

### 24.2 Trim

Keep useful source handles. Use frame-accurate re-encoding when cuts do not
land on keyframes. Prefer nondestructive timeline trims when the editor supports
them.

### 24.3 Reframe

- Design for the delivery aspect, not a blind center crop.
- Track/protect face, hands, product, and copy zones.
- Calculate effective detail after crop.
- Generate/capture native vertical when a horizontal crop would destroy detail.
- Never stretch/squeeze aspect.

### 24.4 Frame-rate conversion

- Preserve native cadence when possible.
- For a fixed master FPS, choose explicit frame duplication/drop/interpolation
  policy.
- Optical flow can deform faces/hands/props and is never automatic.
- Inspect dense frames after any interpolation.

### 24.5 Speed changes and freezes

- Do not speed/slow/reverse/freeze generated or human motion merely to force a
  broken script timing.
- Small transparent changes may be used when declared and inspected.
- Do not call a frozen/parallax still live/generated footage.

### 24.6 Stabilization

Stabilization changes crop and detail. Record settings, inspect edge warping,
and recompute effective dimensions. Do not stabilize intentional handheld
emotion into lifeless motion.

### 24.7 Color management

Color tags are not conversion. Identify source transfer/primaries/range and
explicitly convert/tone-map through a verified pipeline. Never relabel HDR,
LOG, full-range, or unknown pixels as limited BT.709.

Grade live footage/generated art for continuity, but preserve authentic UI and
official brand colors. Avoid plastic skin, crushed shadows, clipped highlights,
or mismatched white balance between continuity shots.

### 24.8 Upscaling

Upscaling changes delivery size, not original truth. Record:

- source/effective dimensions;
- crop/scale ratio;
- tool/model/settings;
- output dimensions;
- 100% before/after crops; and
- disclosure/classification.

Reject ringing, face hallucination, texture crawl, sharpened compression, or
invented product text. A 720p/1080p generated clip inside a 4K master is mixed
or upscaled detail, not native 4K.

### 24.9 Proxies and mezzanines

- Preserve raw originals.
- Use lightweight proxies for editorial responsiveness.
- Relink to full-quality approved sources for master render.
- Use high-quality master-resolution mezzanines for alpha/3D/composites.
- Verify proxy and source timecode/frame mapping.

### 24.10 Prepared-asset gate

After every trim/reframe/convert/upscale/stabilize operation:

1. probe and full-decode;
2. compare duration/frame count to the planned use;
3. inspect first/middle/last and affected critical frames;
4. verify audio sync/channel layout;
5. verify color/range;
6. compute new SHA-256;
7. link parent lineage; and
8. rerun integration QA.

---

## 25. Four review passes for every major asset group

Run different passes; do not call four identical generations “four reviews.”

1. **Truth/rights pass:** claim support, human/product class, consent, license,
   privacy, provider terms, watermark, disclosure.
2. **Technical pass:** files, decode, dimensions, detail, color, audio,
   timestamps, corruption.
3. **Continuity/story pass:** identity, wardrobe, prop, location, action,
   in/out state, emotion, edit role.
4. **Experience pass:** normal-speed viewing/listening in the edit, mobile crop,
   captions/CTA, pacing, repetition, premium feel.

Apply these to character package, stock batch, image batch, video batch,
product captures, voice auditions, music/SFX, and final approved source rail.

---

## 26. Non-stopping autonomous execution loop

Always store `exact_next_action`.

```text
load locked shot plan
→ choose highest-risk unresolved shot
→ apply truth/rights/privacy hard gates
→ select route at fallback_cursor
→ reuse/capture/source or preflight provider
→ pilot if strategy unproven
→ submit once or acquire
→ recover/download
→ source keeper QA
→ place in animatic/edit
→ integration QA
→ approve OR diagnose first failure OR advance fallback after second failure
→ update state/manifests/hashes/cost
→ continue to next unresolved shot
```

Prompt creation sets `ready_to_submit`; it is never a terminal state.

While one provider job is polling, continue unaffected local research, stock,
capture, reference, audio, design, manifest, or QA work within concurrency and
budget limits. Do not start duplicate generations.

Ask the user only for a genuine hard stop:

- login/MFA/CAPTCHA/secret entry;
- unknown pre-submission price, new spend, or over-budget cash/quota;
- unresolved rights/consent;
- unauthorized confidential upload;
- irreversible/destructive action;
- required human/qualified review; or
- a material change to message, CTA, audience, duration, or truth.

Post-submission charge ambiguity is different from unknown pre-submission
price. An already reserved `unknown_charged` attempt/job keeps its worst-case
reservation and follows §16.5; the agent may continue only through eligible
uncharged/local/stock/design fallbacks within the remaining authorization. It
pauses only when that reserved exposure or the next action exceeds authority.

If all authorized routes fail, redesign the shot inside its locked narrative
job. Reopen the script only when meaning must change.

---

## 27. Production metrics and route learning

Track per acquisition route/strategy and, when applicable, provider/model/mode:

- preflight intents passed/failed without attempts;
- route attempts executed and external submissions accepted/ambiguous;
- variants/takes/candidates materialized and integration-tested;
- ambiguous charges;
- keepers;
- first-pass keeper rate;
- cost per keeper by quota bucket;
- median completion/download time;
- identity/anatomy/motion/detail defect rates;
- late/corrupt downloads;
- repair success rate;
- actual effective dimensions; and
- best/worst shot categories.

Use these records to choose future routes, but reverify current providers and
do not expose one client's prompts/assets/usage to another.

---

## 28. Final clip-rail completion gate

The acquisition phase passes only when:

1. every master frame/shot slot points to an approved immutable asset;
2. no placeholder, watermarked preview, quarantined file, or rejected take is
   active;
3. every factual/product proof shot is authentic/official;
4. real-human-only slots contain real rights-compatible footage;
5. recurring character/wardrobe/prop/location continuity passes;
6. every source and derived file has SHA-256 and one-way lineage;
7. every provider job/charge/attempt is reconciled or explicitly retained as
   `unknown_charged` without duplicate submission;
8. stock licenses/consent/privacy/provenance are recorded;
9. effective detail and synthetic/upscale classification are honest;
10. visual and audio assets pass perceptual review;
11. all clips pass in-edit timing/crop/caption/transition QA; and
12. `STATE.json` names the exact next film-production action.

If any job remains `unknown_charged`, the content rail may be marked
`content_passed_financial_reconciliation_pending`, never simply “fully
complete.” Create `UNKNOWN_CHARGE_EXPOSURE.md` (or the private state equivalent)
with provider/product/job, each affected billing line, worst-case reserved
amount and currency/quota unit, last check timestamp, evidence/history path,
named reconciliation owner, exact next read-only check, and follow-up deadline.
No new paid submission may consume that reservation.

### 28.1 Handoff package

Hand off:

- approved visual/audio files;
- character/reference/continuity package;
- prompt files and hashes;
- shot acquisition matrix and fallback history;
- redacted asset manifest;
- private provider-job/spend state in approved storage;
- the private unknown-charge exposure record, reconciliation owner, worst-case
  reservation by currency/quota unit, and exact follow-up action when applicable;
- stock/license/consent redacted report;
- source and integration QA reports;
- known limitations and detail classifications; and
- exact approved asset hashes mapped to shot/frame ranges.

Do not redistribute protected stock/source files, voice stems, model weights,
or account/job identifiers when their license/privacy terms do not permit it.

---

## 29. Official documentation starting points

These are starting points, not frozen schemas. Re-open current pricing, terms,
limits, model cards, and UI/help pages before production.

### Google

- [Create videos in Google Flow](https://support.google.com/flow/answer/16353334?hl=en)
- [Flow models and supported features](https://support.google.com/flow/answer/16352836?hl=en)
- [Manage Flow projects/assets/Characters](https://support.google.com/flow/answer/16935308?hl=en)
- [Flow data controls](https://support.google.com/flow/answer/17025472?hl=en)
- [Gemini API video overview](https://ai.google.dev/gemini-api/docs/video)
- [Detailed Veo generation guide](https://ai.google.dev/gemini-api/docs/veo)
- [Gemini Omni generation/editing](https://ai.google.dev/gemini-api/docs/omni)
- [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API terms](https://ai.google.dev/gemini-api/terms)
- [Gemini API logging/data-sharing policy](https://ai.google.dev/gemini-api/docs/logs-policy)

### ElevenLabs

- [Text to Speech](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)
- [Voice Design](https://elevenlabs.io/docs/eleven-creative/voices/voice-design/)
- [Sound Effects](https://elevenlabs.io/docs/overview/capabilities/sound-effects)
- [Music](https://elevenlabs.io/docs/overview/capabilities/music)
- [Music Service Terms](https://elevenlabs.io/music-terms)
- [Music model-specific terms](https://elevenlabs.io/eleven-music-model-specific-terms)
- [API reference](https://elevenlabs.io/docs/api-reference/introduction)

### Other creation providers

- [Runway API](https://docs.dev.runwayml.com/api/)
- [Runway image references](https://help.runwayml.com/hc/en-us/articles/40042718905875-Creating-with-Gen-4-Image-References)
- [Runway I2V prompting](https://help.runwayml.com/hc/en-us/articles/48324313115155-Image-to-Video-Prompting-Guide)
- [Runway Terms of Use](https://runway.com/terms-of-use)
- [Runway Usage Policy](https://runway.com/safety/usage-policy)
- [Runway Privacy Policy](https://runway.com/privacy-policy)
- [ByteDance Seedance](https://seed.bytedance.com/en/seedance2_0)
- [HeyGen developer docs](https://developers.heygen.com/)
- [FFmpeg filters/color processing](https://ffmpeg.org/ffmpeg-filters.html)
- [ffprobe](https://ffmpeg.org/ffprobe-all.html)
- [Playwright video recording](https://playwright.dev/docs/videos)
- [Android ADB](https://developer.android.com/tools/adb)

### Stock and licensing

- [Adobe Stock usage/licensing FAQ](https://helpx.adobe.com/stock/web/common-questions/usage-licensing.html)
- [Adobe Stock complete terms](https://www.adobe.com/go/stockterms)
- [Pexels license](https://www.pexels.com/legal-pages/license/)
- [Pexels terms](https://www.pexels.com/terms-of-service/)
- [Pixabay license summary](https://pixabay.com/service/license-summary/)
- [Pixabay binding terms](https://pixabay.com/service/terms/)

Use primary first-party sources. Search-result snippets, old tutorials, social
posts, remembered API fields, and third-party model rankings are not production
authority.

---

## 30. Final instruction to the executing agent

Read this file completely before acting. Inspect the real workspace, locked
shot plan, source rights, accounts, region, hardware, disk, budget, and current
provider capabilities. Build the shot requirement cards and predeclare route
fallbacks. Reuse or capture truthful assets before generating. When a recurring
synthetic character is required, create and approve one canonical identity
package, angle/wardrobe/prop/location plates, and exact shot-start stills before
I2V. Use T2V only where continuity/truth permits it. Use authentic capture for
all product proof. Generate one pilot before any paid batch. Download every
provider output immediately, hash/probe/decode it, preserve failed attempts,
and approve only through source plus in-edit keeper gates.

For a first quality failure, diagnose one dominant defect and change one
controlled variable. For a second failure on the same route, stop retrying and
advance the fallback cursor. Never resubmit an ambiguous charged job, evade a
provider safeguard, invent rights/identity/UI, hide a watermark, or claim
upscaled detail as native. Continue autonomously until every timeline slot has
an approved immutable asset, or report one genuine hard stop with the exact
evidence and next required action.
