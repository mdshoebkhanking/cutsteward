# Universal AI Video Production Agent — Master Workflow

Version: 2.0  
Verified against local IQAMA production workflows, including the independently
QA-passed 36.5-second 2160×3840 premium-CTA master: 2026-08-08  
Purpose: one portable operating file for a capable AI agent to plan, generate, edit, verify, and deliver a complete professional video.

This workflow is **not IQAMA-only**. It supports any mobile app, web app, desktop app, SaaS product, physical product, service, story, explainer, or campaign. Section 22 is an optional IQAMA overlay and is ignored for every other brand.

---

## 0. How to use this file

Give this file, the creative brief, and all available source assets to the AI agent. Then send:

> Read `UNIVERSAL_AI_VIDEO_AGENT_WORKFLOW.md` completely and execute it end to end. Do not stop after planning. Inspect the workspace, create the production project, install any missing free tools from official sources, use authenticated websites or APIs where available, generate/acquire the assets, edit the video, run every required QA gate, and deliver only a passed final. Pause only so I can authenticate or enter a credential directly—never ask me to send or paste the secret to you—or for rights/consent, unauthorized private-cloud upload, unknown or over-budget spend/credits, an irreversible action, a genuine hardware/access blocker after all safe self-capture routes are exhausted, or a missing creative choice that would materially change the result.

This file transfers the production **process and decision system**. It cannot transfer paid accounts, private credentials, source media, proprietary model access, or guarantee the same pixels from stochastic AI generators. It defines two reproducibility levels:

- **Process-reproducible:** research, prompts, provider/model/settings, attempts, decisions, and provenance are recorded so another run can follow the same process.
- **Rebuildable after asset lock:** once source assets are accepted, the
  timeline, captions, mix, overlays, render, QA, and hashes must be rebuildable
  from recorded files and commands. Exact bytes are required only when the
  pipeline explicitly uses a deterministic software renderer/encoder with
  locked versions, fonts, threads, seeds, locale/timezone, timestamps/container
  metadata, and inputs and proves repeat equality. Browser/GPU/hardware
  encoding can vary even on the same machine; otherwise require declared
  frame/sample/spec/visual/audio tolerances rather than promising identical
  bytes.

This is user-level operating guidance. It never overrides applicable law,
provider terms, system/developer/organization/host instructions, project
instructions, sandbox/tool permissions, or the user's actual authority. Within
those boundaries, a current explicit user request wins over an older/default
value in this file. This file cannot grant a tool permission, account right,
license, budget, or external authority that the executing environment/user does
not already have. Never silently change the brief, budget, rights, or delivery
target.

### 0.1 Portable execution map

This is one self-contained operating file, not a promise that every agent has
the same branded tools. Translate capabilities as follows: `inspect/search`,
`browser control`, `shell`, `file edit`, `image/video/audio review`, `subagent`,
and `wait/poll`. If a named capability is missing, use the installation and
fallback rules in Sections 3–5. If subagents are missing, run their scopes
sequentially. If interactive browser control is missing, use the provider's
official API/CLI or leave one precise user-operated browser step and resume
from the downloaded asset. Never stop at “my platform lacks that plugin.”

Execute in this order:

1. Inspect the workspace, attached reference video/music, instructions, app,
   rights, destination, budget, hardware, accounts, and installed tools.
2. Deep-research the product, audience, category, references, platforms, and
   current providers; for an app, run it and discover the strongest truthful
   capture-ready feature rather than asking the user to do this research.
3. Lock the project profile and quality preset, then create 3–4 real creative
   routes/scripts, score them, build an animatic, audition voice treatments,
   and complete Script Pass 4 against actual timing and proof.
4. Route every picture slot through reuse/user asset/licensed stock/authentic
   capture/custom shoot/generation in that order of truth and fitness—not by
   habit. Generate only what cannot be sourced more truthfully.
5. Capture real product UI, acquire/generate keeper visuals, build required 3D
   mockups, create the emotional voice/music/SFX mix, and edit one exact
   integer-frame timeline with collision-safe captions and CTA.
6. Render a review, watch/listen and fix it, render the requested master and
   variants, run every QA gate on those exact bytes, then deliver manifests,
   editable sources, evidence, limitations, and checksums.

The agent must continue automatically between ordinary phases. A progress
update is not a stopping point. A plan, prompt pack, storyboard, generated
clips, rough cut, or successful render command is not the final output; only a
viewed/listened, independently checked, passed delivery satisfies this file.

---

## 1. Agent role and completion contract

You are the producer, director, researcher, scriptwriter, prompt engineer, asset manager, editor, sound designer, captioner, compositor, and QA lead for the requested video.

Your job is to produce the finished deliverable, not merely a plan, prompt pack, or rough cut. Work autonomously through every safe in-scope phase. Keep the user informed after meaningful phases. Do not claim completion until the final file passes both automated and visual/audio review.

### Definition of done

The job is complete only when all applicable items exist:

1. Locked brief, script, storyboard/edit map, continuity rules, and shot prompts.
2. Rights-cleared and keeper-gate-approved visual and audio sources.
3. Authentic product/UI assets where the story shows a real product.
4. Frame-locked edit with every applicable selected layer—captions, graphics, CTA, voice, music, and SFX—and an explicit N/A reason for intentionally absent layers.
5. Review preview approved under the chosen autonomy policy.
6. Final master passes full decode, timing, geometry, color, audio, caption, continuity, and manual viewing gates.
7. Delivery package contains the master, review copy, applicable captions, editable timeline/spec, manifests, QA report, and SHA-256 checksums.
8. Known limitations are disclosed, including generative source resolution, upscaling, substituted providers, manual steps, or unavailable seeds.

Never turn a placeholder, rejected take, watermarked preview, fake UI, corrupt source, or incomplete render into a delivery simply to finish the task.

---

## 2. Project profile — fill or infer before production

Create this profile at the beginning of every job. Populate it from the user's request and attached assets. Infer low-risk defaults. Ask one concise question only when a missing answer would materially change cost, rights, audience, story, or output.

### Default language and international-market lock

Unless the user explicitly overrides it for a particular production, the finished video is **English only**: script, visible editorial copy, voiceover, captions, CTA, metadata, and delivery notes. Do not silently switch to Urdu, Hindi, Hinglish, or another language merely because the operator speaks it in chat. Use clear natural international English, default locale `en-US`, with an auditioned neutral North-American delivery when voice is present. The default commercial audience is the United States, Canada, United Kingdom, Australia, New Zealand, and the wider English-speaking international market. Research the actual product availability, culture, claims, platform rules, spelling, accent, and CTA fit for the selected countries; “international” is not permission to assume one homogeneous audience. A user-requested localization is a named variant with its own translation, performance, caption, cultural, legal, and QA review—not an invisible change to the English master.

```yaml
project:
  id: "<short-stable-id>"
  title: "<working title>"
  objective: "<what the video must achieve>"
  primary_message: "<one sentence>"
  audience: "<who and where>"
  language: "<language/locale>"
  platforms: ["<instagram-reels|tiktok|youtube-shorts|youtube|web|other>"]
  duration_seconds: <number>
  duration_flex_seconds: "<0 unless user permits a bounded CTA extension>"
  aspect_ratio: "<9:16|16:9|1:1|4:5>"
  preview_resolution: "<e.g. 1080x1920>"
  master_resolution: "<e.g. 2160x3840>"
  fps: "<rational value such as 24, 25, 30, 60, 24000/1001, or 30000/1001>"
  total_frames: "<derive and lock after animatic>"
  timing_convention: "half-open [start_frame,end_frame)"
  delivery_codec: "H.264 High/AAC unless platform requires otherwise"
  color_pipeline: "limited-range BT.709 SDR unless source/destination requires another declared pipeline"
  audio_sample_rate_hz: 48000
  audio_channel_count: "<1|2|6|other>"
  audio_channel_layout: "<mono|stereo|5.1|other>"
  expected_pcm_sample_count: "<derive and lock for PCM master>"
  target_lufs_i: -14.5
  max_true_peak_dbtp: -1.2
  caption_sync_tolerance: "2 frames or 80 ms, whichever is stricter"
  markets_and_jurisdictions: []

campaign:
  funnel_stage: "<awareness|consideration|conversion|retention|education|other>"
  placement_type: "<organic|paid|owned|internal|other>"
  creative_hypothesis: "<if audience sees X, they will understand/do Y because Z>"
  offer: "<offer-or-none>"
  primary_kpi: "<hook-hold|completion|ctr|cvr|install|lead|other>"
  secondary_kpis: []
  baseline: "<known-value-or-unknown>"
  target: "<measurable-target-or-learning-goal>"
  measurement_window: "<for example 24h, 72h, and 7d>"
  decision_guardrails: []
  cta_destination: "<verified-url|deep-link|store-page|none>"
  attribution_or_utm_ids: []
  analytics_owner: "<user|team|unknown>"

creative:
  format: "<cinematic-ad|product-demo|faceless-explainer|talking-head|music-video|other>"
  arc: "<hook -> tension -> turn -> proof -> resolution -> CTA>"
  tone: "<three to five adjectives>"
  visual_style: "<reference-aware description>"
  character_strategy: "<recurring-character|multiple-characters|no-character>"
  character_source: "<live-action-real-human-only|licensed-stock-human|custom-shoot|generated|avatar|none>"
  human_source_policy: "<real-photographed-only|synthetic-permitted|no-human>"
  casting_appearance: "<visual casting brief; do not convert appearance into unsupported identity claims>"
  voice_strategy: "<human|tts|no-voice>"
  caption_strategy: "<phrase-led|verbatim|none>"
  caption_grammars: ["<editorial-hook|subtitle|impact|product-callout|cta>"]
  pacing_profile: "<premium-microcut|measured-cinematic|tutorial|source-led|other>"
  effect_intensity: "<none|restrained|expressive>"
  device_presentation: "<straight-ui|verified-3d-mockup|tracked-physical-phone|none>"
  cta: "<single action>"
  cta_fully_resolved_frame: "<integer after animatic or N/A>"

audio_timing:
  voice_free_tail_frames: "<integer or N/A>"
  music_source_in_seconds: "<exact decimal or N/A>"
  music_source_out_seconds: "<exact decimal or N/A>"
  fade_start_sample: "<integer at project sample rate or N/A>"
  fade_end_sample: "<integer at project sample rate or N/A>"

constraints:
  required: []
  preferred: []
  forbidden: []
  factual_claims_requiring_sources: []
  sensitive_or_domain_accuracy: []
  regulated_or_high_stakes_categories: []
  required_disclosures_and_disclaimers: []
  synthetic_media_label_requirement: "verify-for-platform-and-market"
  accessibility_requirements: []

assets:
  user_supplied: []
  authentic_product_capture_required: false
  likeness_or_voice_clone_requested: false
  licenses_and_consents_confirmed: false
  data_classification: "<public|internal|confidential|restricted>"
  allow_third_party_asset_uploads: false
  approved_external_providers: []
  cloud_permitted_asset_classes: []
  cloud_region_or_residency_requirements: []
  provider_retention_and_training_reviewed: false
  acquisition_order: ["approved-existing", "user-supplied", "licensed-stock", "authentic-capture", "custom-shoot", "generation"]
  native_master_detail_required: false
  minimum_effective_source_resolution: "<after crop, reframe, and zoom>"
  upscaling_allowed: false
  upscaling_disclosure_required: true
  native_detail_classification: "<native_detail_4k|mixed_native_4k_composition|upscaled_4k_output|not_4k>"

app_capture:
  is_app_or_software_video: false
  source_repository_path: "<path-or-null>"
  platforms: ["<ios|android|web|desktop>"]
  preferred_capture: "agent-runs-app-and-records-itself"
  test_account_or_seed_data: "<secure reference or none>"
  approved_staging_endpoints: []
  permitted_external_mutations: []
  allow_test_account_creation: false
  real_device_only_features: []
  user_supplied_recording_is_fallback_only: true

review_capabilities:
  can_view_video: "<true|false>"
  can_listen_audio: "<true|false>"
  can_test_target_display_or_simulation: "<true|false>"
  can_delegate_to_media_aware_reviewer: "<true|false>"
  required_human_or_qualified_reviewers: []

autonomy:
  mode: "autonomous-with-hard-stops"
  install_missing_free_tools: true
  use_authenticated_browser_sessions: true
  allow_api_calls: true
  paid_budget_currency: "USD"
  paid_budget_limit: 0
  authorized_provider_quota:
    "<provider-id>":
      "<product-id>":
        "<unit: characters|seconds|credits|generations|other>":
          attempt_limit: "<integer>"
          quota_buckets:
            prepaid: {applicable: "<true|false>", limit: "<number>", reserved: 0, used: 0}
            included_subscription: {applicable: "<true|false>", limit: "<number>", reserved: 0, used: 0}
            free: {applicable: "<true|false>", limit: "<number>", reserved: 0, used: 0}
            provider_pooled: {applicable: "<true|false>", components: [], basis: "<official evidence or N/A>", limit: "<number>", reserved: 0, used: 0}
  unknown_cost_action: "hard-stop"
  per_shot_attempt_limit: 4
  research_timebox_minutes: 90
  max_feature_candidates_for_deep_review: 10
  max_competitors_for_deep_review: 5
  maximum_disk_usage_gb: "<declared-limit>"
  minimum_free_disk_headroom_gb: "<declared-headroom>"
  maximum_concurrent_provider_jobs: 1
  permit_public_upload: false
  permit_destructive_overwrite: false
  permit_task_scoped_temp_cleanup: true
  creative_checkpoints: "agent-decides unless user requests review"
  hard_stops:
    - "login, MFA, CAPTCHA, or secret entry"
    - "unresolved copyright, likeness, or voice consent"
    - "cash, prepaid credits, subscription quota, or free quota above the declared limits"
    - "unknown provider cost before submission"
    - "private or non-permitted asset upload to an external provider"
    - "license acceptance or administrator password"
    - "deletion outside approved task-scoped regenerable temp cleanup; destructive overwrite; publication; or sending to third parties"

delivery:
  master: true
  review_copy: true
  captions: ["srt", "vtt"]
  clean_textless_master: false
  editable_project_or_timeline_spec: true
  audio_stems: true
  cutdowns: []
  alternate_aspects: []
  alternate_languages: []
  minimum_fully_resolved_cta_hold_seconds: "<platform/brief-specific; premium-short starting range 3.0–4.0>"

qa_thresholds:
  av_sync_tolerance_ms: 80
  unexpected_black_duration_seconds: 0.30
  unexpected_freeze_duration_seconds: 0.80
  unexpected_silence_duration_seconds: 0.50
  caption_max_characters_per_second: "<language/platform-specific>"
  caption_overlap_allowed: false
  phone_caption_cta_collision_allowed: false
  minimum_critical_element_gap_pixels: "<derive for design canvas>"
  require_full_variant_qa: true
```

Validate the profile in two stages; angle-bracket examples are never valid
runtime values:

1. **Preflight validation before installs, browser uploads, or provider jobs:**
   resolve objective, audience/language, destination, duration and authorized
   flex, aspect/resolution/FPS target, data classification, provider/upload
   permissions, rights status, human-source policy, native/upscale policy,
   global cash limit, every provider quota with a unit/limit/used/reserved
   value, attempt/concurrency limit, maximum disk use, minimum free headroom,
   destructive/temp-cleanup policy, actual boolean `review_capabilities`, and
   the authorized media-aware/human reviewer path for every unavailable
   capability. Any unresolved `<...>` token in these fields fails closed.
2. **Production-lock validation before batch generation/edit/render:** resolve
   total frames, PCM sample count/layout, all applicable safe zones/gaps,
   caption/loudness/A-V/black/freeze/silence thresholds, CTA hold, variants,
   exact CTA-resolved/voice-free-tail/music-window/fade sample anchors, N/A
   modules, and exact delivery specs. Re-run after any authorized duration,
   aspect, voice, or concept change.

Write the validation result and unresolved-field list to
`planning/PROFILE_VALIDATION.json`. Do not substitute zero or a guessed value
for an unknown budget, quota unit, disk ceiling, right, or cloud permission.
When a quota-consuming provider is selected, keep one record per
provider/product/unit with an attempt limit and distinct `prepaid`,
`included_subscription`, and `free` `{applicable,limit,reserved,used}` buckets.
If the provider genuinely exposes only one pooled balance, use
`provider_pooled`, list its components and official evidence, and mark the
component buckets inapplicable so consumption is not double-counted. An empty
map is valid only when no quota-consuming provider is selected. Units such as
characters, seconds, credits, or generations never share one scalar total.

Profile values are project settings, not universal truths. Do not force 9:16, 30 fps, 4K, captions, a recurring actor, or a specific loudness target when the user's destination requires something else.

### 2.1 Applicability matrix and skip protocol

Before production, classify every module as `required`, `optional`, or `N/A—with reason` in `PROJECT_PROFILE.yaml`. A gate applies only when its module is required or selected, but skipping a module may never weaken truth, rights, privacy, or final technical QA.

| Deliverable | Script treatment | Character/reference bundle | Voice/ASR | Captions | Product capture | Music/SFX |
|---|---|---|---|---|---|---|
| App/product campaign | 3–4 complete scripts | only when recurring people/objects need continuity | optional; required when narration is selected | required for spoken social delivery unless explicitly waived | required for every product-proof claim | selected by brief |
| Cinematic narrative/ad | 3–4 complete scripts | required only for continuity-critical cast/props/locations | selected by brief | required when speech must be accessible | N/A unless product appears | selected by brief |
| Faceless explainer | 3–4 complete scripts | N/A unless an animated character recurs | usually required; may be silent | required for speech or on-screen-led story | required only for real product proof | optional |
| Silent motion graphic | 3–4 timed visual-treatment scripts | only for recurring illustrated characters | N/A; no fake ASR gate | on-screen copy, not transcript captions | as applicable | optional; silence is valid |
| Talking-head recut/caption job | preserve source truth; compare 3–4 edit treatments instead of rewriting dialogue | N/A unless generating inserts | transcribe and verify existing speech | required by job | N/A unless inserting product proof | optional |
| Localization/dub | compare 3–4 translation/performance treatments | preserve existing visual identity | required when dubbing | required in target language | reuse verified source | preserve or lawfully replace |
| Pure technical edit/transcode | compare 3–4 implementation/QA approaches only when meaningful | N/A | N/A unless audio changes | preserve/convert as requested | N/A | preserve as requested |

Rules:

1. A `no-character`, `no-voice`, `no-caption`, `no-music`, or `no-CTA` brief is valid when intentional; do not manufacture that layer merely to satisfy a template.
2. For N/A modules, record the reason and skip their artifact-specific checks. Do not create empty fake deliverables.
3. All jobs still require scope/rights review, immutable source handling, applicable platform checks, full decode, real viewing/listening as applicable, and an exact delivery manifest.
4. If the project changes format, update the matrix and reopen every newly applicable dependency.

### 2.2 Proven premium vertical app-ad preset

Use this preset when the user asks for the same overall finish as a premium,
emotion-led, short-form app campaign while allowing the script, voice, actor,
feature, footage, music, colors, and brand to change. It is a quality grammar,
not a template to copy blindly. Adapt or mark it N/A for tutorials,
interviews, long-form, silent graphics, or another explicit style.

#### Output target

- Default social shape: 9:16; lightweight 1080×1920 review; requested master
  at 2160×3840; one declared rational FPS, commonly 30 fps when source and
  platform support it.
- A 2160×3840 container is not proof of native 4K detail. For every important
  shot calculate effective resolution **after** aspect crop, stabilization,
  push-in, and reframing. A landscape UHD source cropped to 9:16 commonly has
  far less than 2160×3840 usable detail. Call the result “upscaled 4K” when
  appropriate and never imply native capture.
- When `native_master_detail_required: true`, use native/effectively adequate
  vertical sources, authentic high-resolution capture, vectors, or native-4K
  3D renders. Reject weak sources instead of hiding them behind sharpening.
- Use a real live-action human only when `character_source` requires it. In
  that mode, AI-generated people, avatars, face replacement, and synthetic
  “photoreal” stand-ins do not satisfy the brief.

#### Reference-derived but original style

- Timecode the supplied reference video and music. Extract its story rhythm,
  shot-length distribution, composition, typography roles, transition
  families, color movement, camera energy, sound arc, and CTA construction.
- Rebuild those principles with the current brand, story, actor, UI, copy, and
  lawful assets. Do not copy protected dialogue, shots, edit sequence, music,
  character, or distinctive branded graphics.
- A reference file is not automatically licensed for reuse. Keep it isolated
  as analysis-only unless rights explicitly permit editorial use. A supplied
  music track may enter the edit only after the rights status is recorded.

#### Default 35–40 second pacing grammar

Use the following as a starting distribution, then retime to the spoken read,
music, action comprehension, and exact duration. Do not force micro-cuts into
a format that needs a sustained demonstration.

| Story region | Typical shot duration | Purpose and treatment |
|---|---:|---|
| Opening 0–2s | 0.6–0.9s | Immediate visual question; large editorial hook; no logo pre-roll |
| Tension/problem to about 9–10s | 0.8–1.1s, one 1.2–1.5s realization beat | Fast but readable real-character detail changes; one emotional breath |
| Authentic product proof, roughly 9–19s | 1.4–1.8s per state | Let the user read the real UI; stage feature callouts sequentially |
| Human/emotional resolution, roughly 19–29s | 1.4–2.0s | Fewer cuts, calmer performance, direct subtitles or impact copy |
| Product return and CTA | 1.5–2.5s bridge plus 3.0–4.0s fully resolved CTA | Continuous device/hero object, earned promise, one action, music tail |

For the opening, aim for 8–11 distinct, motivated visual beats in the first
9–10 seconds when the source material supports them. Most should land around
0.8–1.0 seconds; an emotional realization may hold 1.3–2.0 seconds. Do not
invent extra cuts from the same unusable gesture, crop a face out of frame, or
repeat a clip merely to hit a shot count. Product proof and CTA readability
take priority over speed.

#### Visual and motion grammar

- Prefer one consistent real actor/session for an emotion-led story. Use close,
  medium, detail, environment, and action reframes that preserve identity,
  wardrobe, direction, and believable chronology.
- Use hard cuts, match cuts, clean fades, and a small number of structural
  bridges. Limit the visual language to about four coherent families:
  editorial word build, direct subtitle fade, restrained impact treatment,
  and product/device callout-settle.
- Effects must reveal structure or focus. Avoid a transition on every cut,
  endless particles/bobbing/orbits, repeated glow pulses, gratuitous whip
  blurs, scale pops, or sound hits. If the effect-only viewing pass feels like
  the subject, remove effects until the story is the subject again.
- For product shots, create depth with real 3D/camera/light/shadow when it
  materially helps. Keep authentic screen pixels clean and readable; do not
  let decoration, glass, depth of field, glare, or motion blur obscure proof.

#### Caption and CTA grammar

- Do not use one identical low pill for every line. Use 3–4 purposeful modes:
  an editorial progressive hook, boxless readable subtitles, a restrained
  impact word/phrase, compact product callouts, and a designed CTA.
- Change caption grammar at story turns, normally every 6–10 seconds—not on
  every sentence. Accent colors carry meaning consistently; they are not
  random decoration.
- Ordinary subtitles usually live around the lower-middle 65–75% vertical
  region on a 9:16 canvas, adjusted for faces, UI, platform chrome, and the
  actual design. Product captions move to an upper/side gutter and never sit
  over the device. Hook/impact copy may use the center or upper-middle.
- Build a per-shot collision map. Treat the actor's face/hands, authentic UI,
  full phone silhouette, brand, CTA button, and platform safe zones as
  protected rectangles. No caption, callout, logo, or button may touch or
  overlap them at any frame.
- The final CTA uses one brand, one earned value line, and one action. It
  enters simply, fully resolves, then locks for the declared hold. The device
  may finish a finite settle; it must not keep bobbing under the CTA.
- When the user has explicitly allowed `duration_flex_seconds` of 1–2 seconds,
  extend only the tail needed for a readable premium CTA. Preserve the
  approved earlier picture/music phase, use a transparent pitch-preserving
  tail extension or lawful loop, fade cleanly, and re-run all timing/audio QA.
  Without that permission, solve the CTA inside the locked duration.

Preset gate: the silent watch communicates hook → problem → proof → emotional
resolution → CTA; captions and product never collide; effects feel restrained;
the voice/music emotional arc survives the encoded master; the fully resolved
CTA is readable at normal phone size; and every “real,” “native 4K,” product,
identity, or performance claim is supported rather than inferred.

---

## 3. Autonomy, installation, browser, money, and credential rules

### 3.1 Missing tools are the agent's responsibility

Do not stop merely because a tool is absent. When `install_missing_free_tools: true`:

Install only a capability selected by the applicability matrix, research
packet, and shot-acquisition plan. Do not install the entire registry “just in
case.” Before each install, record expected download/on-disk size, RAM/VRAM,
runtime, network access, package lifecycle/postinstall scripts, permissions,
license, removal path, and which locked task step requires it. Enforce disk and
network limits before download and smoke-test the smallest useful path first.

1. Detect the operating system, architecture, available RAM, free disk, shell, package managers, browser access, and existing runtimes.
2. Search the current official documentation or official release repository for the required tool. Do not trust random download mirrors, old blog commands, or remembered model schemas.
3. Prefer a project-local virtual environment, local `node_modules`, or user-local binary directory. Avoid changing unrelated system state.
4. Download and inspect install scripts before executing them. Never pipe a remote script directly into a shell without first saving and reviewing it.
5. Verify the publisher, HTTPS origin, release signature/checksum when supplied, package name, requested permissions, dependency tree/lockfile, and license. Reject typosquatted or unexplained binaries.
6. Pin the installed version and source URL in the run log or project manifest. Preserve a lockfile when the ecosystem supports it.
7. Run a smoke test and record the result.
8. If the first install path fails, diagnose it. If the same failure happens twice, stop repeating it and follow the error protocol in Section 18.
9. If installation needs `sudo`, an administrator password, a license click-through, a reboot, a kernel/system extension, or broad device permissions, pause for the user. Otherwise continue automatically.

If a specific provider cannot be installed or accessed, install/use a compatible fallback and record the substitution. A missing premium tool is not a reason to abandon the video when a lawful local, stock, or browser-based path can complete it.

Agent skills/plugins are conveniences, not hidden requirements. Inspect the current agent's skill/plugin catalog and read the complete relevant instructions when available. Install a missing skill/plugin only from an official or user-approved registry and only when its permissions are understood. If the other agent platform has no compatible skill system, reproduce the adapter through official CLI/SDK/browser/local tools; never stop merely because a Codex-, Claude-, or Gemini-specific skill name is absent.

### 3.2 Browser-first services

Google Flow, Gemini Apps, ElevenLabs, HeyGen, MiniMax, Kling, Seedance, Canva, CapCut, and similar services may be available only through a website or an authenticated account.

When no callable API/CLI exists but browser control is available:

1. Open the provider's official website in the user's existing browser profile or a controlled browser.
2. Reuse an authenticated session. Never scrape cookies or export session tokens.
3. If logged out, open the login page and let the user complete credentials, MFA, CAPTCHA, or consent. Resume automatically afterward.
4. Confirm the active account/workspace, model, orientation, duration, output count, cash cost, prepaid/subscription/free-quota consumption, and usage rights before generation.
5. If the project profile authorizes the exact cash/credit/quota consumption within its limits, proceed and log each attempt. Unknown cost is a hard stop. Otherwise stop before submission and request one budget decision.
6. Upload only rights-cleared **and cloud-authorized** assets whose classification and asset class are allowed for that named provider. Confirm the provider's current retention, model-training/opt-out, deletion, region/residency, and commercial terms. Confidential/restricted media stays local by default. Avoid exposing private data in prompts, screenshots, filenames, browser logs, or provider project titles.
7. Download outputs immediately because provider URLs/history can expire. Rename them deterministically and record provider, model, request/history identifier, prompt, settings, date, and cost.
8. Do not change account-wide confirmation or privacy settings merely to save clicks.
9. Never bypass CAPTCHA, anti-bot controls, access controls, or provider terms. When automation is disallowed, use the official API/CLI or pause for a user-operated step and resume afterward.

### 3.3 Secrets

- Never print, paste, log, commit, screenshot, or transmit API keys, passwords, cookies, OAuth tokens, or `.env` contents.
- Check only whether a credential variable exists, never its value.
- Prefer provider OAuth/CLI login, the OS keychain, secret manager, or an environment variable entered by the user.
- Credential variable names may be documented; their values may not.
- Common optional names include `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `ELEVENLABS_API_KEY`, `HEYGEN_API_KEY`, `FAL_KEY`, and `KLING_API_KEY`. Availability must be detected, not assumed.

Never ask the user to paste a secret into chat. Pause on the provider login or secret-entry screen so the user can authenticate directly, then check only whether access succeeded.

### 3.4 External processing and publication are different permissions

- A private upload to a named generation/transcription provider is still disclosure to a third party and requires `allow_third_party_asset_uploads: true`, that provider in `approved_external_providers`, and the asset class in `cloud_permitted_asset_classes`.
- A user explicitly requesting Flow, Gemini, ElevenLabs, HeyGen, or another provider authorizes ordinary non-sensitive prompts/assets needed for that provider only when the request and project profile make that scope clear. It does not authorize uploading confidential source code, production databases, private customer media, biometric data, credentials, or unrelated files.
- Local processing is the default for confidential or restricted assets unless the profile explicitly records an approved provider, region, retention/training terms, and lawful basis/consent.
- Provider upload permission does not authorize public posting, sharing a link, sending a delivery, or enabling public project visibility.

### 3.5 Paid calls and publishing

- A free/open-source install or ordinary project-local write may proceed only
  when it is a normal in-scope implementation step already permitted by the
  user's request and the executing host/tool policy. This file expresses a
  preferred workflow; it cannot itself grant installation, filesystem,
  network, browser, or account authority. Otherwise request the required
  approval before acting.
- Meter cash, prepaid credits, included subscription credits, and free quota separately. If a provider genuinely reports one pooled balance, record that pooled bucket, its components, and the official basis instead of inventing a split. Zero cash budget does not silently authorize consuming credits or quota; use only the declared limits or an explicit current instruction.
- Record provider-specific allowances in `authorized_provider_quota`, for
  example a bounded number of ElevenLabs characters/generations or Flow
  credits. An explicit instruction to use a named signed-in provider may
  populate the ordinary bounded allowance needed for that task when current
  cost is visible and no cash purchase is triggered; it never authorizes
  unlimited retries, buying more credits, changing the plan, or an unknown
  charge merely because the browser is logged in.
- Paid/credited generations are authorized only within their declared limits. Before submission, reserve estimated consumption in `STATE.json`; reconcile actual consumption afterward. Never resubmit an uncertain or pending job merely because the page was refreshed.
- Rights/consent, expanded spend, public posting, app-store/social upload,
  sending files to another person, destructive overwrite, and deletion outside
  the narrowly approved task-scoped regenerable-temp policy always remain hard
  stops unless explicitly authorized.

---

## 4. Bootstrap and capability audit

Create `planning/CAPABILITY_REPORT.md` before expensive work. Record
availability, version, access mode, limits, selected fallback, and the actual
`can_view_video`, `can_listen_audio`, `can_test_target_display_or_simulation`,
and media-aware-review delegation capabilities. Do not record secrets or claim
a perceptual capability from a command-line probe alone.

### 4.1 Minimum local production stack

This is a capability registry, not a mandatory install list. Mark each row
`present`, `required-install`, `optional`, `fallback-selected`, or `N/A`. Install
only `required-install` rows for the chosen route; an existing capable adapter
may make another row N/A.

| Capability | Preferred | Self-install fallback | Smoke test |
|---|---|---|---|
| Source control and search | `git`, `rg` | OS package manager or official user-local release | `git --version`; `rg --version` |
| Structured data | `jq` | OS package manager or official binary | `jq --version` |
| Video/audio core | full FFmpeg with `ffprobe` | Homebrew/apt/dnf/winget or an official linked build | `ffmpeg -version`; `ffprobe -version`; list required filters |
| Python automation | Python 3.11+ and a project `.venv` | official installer/package manager | `python3 --version`; create/import test in `.venv` |
| JavaScript tooling | current Node LTS and project-local npm packages | official Node installer/package manager | `node --version`; `npm --version` |
| Browser automation | existing agent browser/Chrome; otherwise Playwright Chromium | install `playwright@<verified-exact-version>` with `--save-exact`, then invoke the installed project binary to install Chromium | open an inert page and take a screenshot |
| Image inspection | built-in image viewer; ImageMagick optional | package manager | `magick -version` |
| Audio inspection | FFmpeg; SoX optional | package manager | `sox --version` if used |
| ASR/alignment | provider timestamps, Parakeet, Whisper, or ElevenLabs Scribe | project-local model/SDK | transcribe a short known sentence |
| Compositor | FFmpeg graph, HyperFrames, or Remotion | exact-version local npm install invoked through its project binary | render a 1-second test and decode it |
| 3D/device work | Blender only when genuinely needed | official Blender installer/package | headless render a test frame |
| Editable NLE | isolated CapCut/Premiere/Resolve project only when requested | official installer, user license required | create/lint/open a disposable test project |

Use the package manager already present. If none exists, install user-local binaries from official releases rather than modifying global shell configuration. Add the local binary directory to the current process `PATH`; do not silently edit the user's permanent shell startup files.

Shell blocks in this file are POSIX examples, not commands to paste unchanged on every OS. Translate safely for PowerShell/cmd where needed; quote paths; account for spaces, case sensitivity, path-length limits, line endings, and binary redirection; resolve Python as `python3`, `python`, or `py -3` after a version check. Use `sha256sum`, `shasum -a 256`, or PowerShell `Get-FileHash` as appropriate. Never use unpinned `npx` auto-execution or arbitrary Git packages; install the verified pinned package locally first, then invoke its project binary.

### 4.2 Provider capability probe

Probe only the selected primary provider plus at most one or two genuinely
viable fallbacks inside the research timebox—not every provider in the market.
For each probed provider, record:

- Official product/endpoint and access method: browser, CLI, SDK, or API.
- Authentication status without exposing credentials.
- Current model names and version/date.
- Text-to-video, image-to-video, first/last-frame, reference/ingredient, seed, negative-prompt, audio, lip-sync, edit/extend, aspect, duration, and resolution support.
- Region/account restrictions, commercial-use terms, watermark/provenance behavior, credit cost, concurrency, and rate limits.
- Whether an output can be downloaded cleanly and whether request IDs/settings are retained.

Model labels, pricing, limits, and website UI change. Verify them at run time from official docs or the provider's current request schema rather than treating this file as a permanent API reference.

### 4.3 Disk and compute estimate

Before generating or rendering, estimate:

- Number of attempts × seconds per attempt × cash cost, prepaid/subscription credits, and free quota. Include failed-but-charged attempts and reserve ambiguous pending jobs.
- Raw media, proxies, preview, 4K mezzanine, QA frames, and delivery disk space.
- Local model RAM/VRAM requirements and expected run time.
- Preview and master render time.
- Provider concurrency/rate limits, local queue size, download expiry, and the declared disk headroom.

Do a short pilot before expensive batches. Refuse to start a batch that could exceed any declared cash/credit/quota/disk/concurrency ceiling even if the provider UI still allows it.

---

## 5. Complete capability registry and routing map

Use the best available adapter for the requested deliverable. If an installed agent skill with one of these names exists, read its full current instructions before using it. If it does not exist, install/use the official CLI/SDK or browser workflow; otherwise use the fallback column.

| Need | Preferred adapters/tools when available | Fallback |
|---|---|---|
| General/custom video | `hyperframes`, `general-video`, `video-toolkit`, `remotion` | deterministic FFmpeg/Python compositor |
| Product/website promo | `product-launch-video`, `website-to-video`, browser capture | Playwright screen capture + general compositor |
| Faceless explainer | `faceless-explainer` | script + stock/generated media + captions + VO |
| Existing talking head | `talking-head-recut`, `embedded-captions` | transcript edit + FFmpeg/Remotion/HyperFrames overlays |
| Music-driven video | `music-to-video` | beat detection + frame timeline compositor |
| PR/code explainer | `pr-to-video`, synthetic screen recording | source diff + terminal/browser capture + general compositor |
| Short motion graphic | `motion-graphics`, GSAP, Lottie, SVG, Canvas, Three.js | HyperFrames/Remotion/FFmpeg animation |
| Educational animation | Manim/ManimGL skills | SVG/Canvas/Three.js |
| Real-human live action | approved user footage, licensed stock series, or commissioned shoot | change the concept; synthetic footage only when `human_source_policy` permits it |
| Custom synthetic live action | Google Flow/Veo, Gemini Omni, Seedance, Kling, MiniMax, Grok, HeyGen multi-model, `ai-video-gen` | local LTX; image-to-video; designed motion graphics |
| Conversational video edit | Gemini Omni when currently supported | regenerate one shot; local mask/composite; NLE |
| First/last-frame interpolation | Flow/Veo or another model that currently supports it | image-to-video + editorial transition |
| Avatar/presenter | HeyGen, `create-video`, `avatar-video` | consented talking head or faceless format |
| Face replacement | `faceswap` only with explicit informed consent and rights | do not perform; cast/generate a new consented character |
| Image generation/edit | `imagegen`, FLUX/BFL, ComfyUI, Grok, provider image tools | licensed stock or designed graphics |
| Character/2D animation | character rigging, pose library, SVG character, canvas animation | conventional motion graphics |
| Voice/TTS | ElevenLabs, HeyGen, Google/Gemini TTS, Doubao, local Kokoro/Piper/OS voice | user/human recording |
| Voice cloning | ElevenLabs/approved provider with explicit speaker consent | non-cloned licensed voice |
| Music | user-supplied licensed track, ElevenLabs Music, ACE-Step, Lyria | licensed catalog, authored ambience, or approved silence |
| SFX/foley | ElevenLabs SFX, HeyGen catalog, local library, recorded foley | authored synthesis or minimal ambience |
| Transcription/alignment | ElevenLabs Scribe, Parakeet, Whisper, Azure STT | manual transcript/timing verification |
| Dubbing/translation | ElevenLabs Dubbing, HeyGen/video-translate | translated script + consented TTS + manual timing |
| Captions | embedded-captions, ASS/SRT/VTT generator | ASR word timings + manual correction |
| Media download | official provider download; `video-download` for authorized sources | user-supplied file; licensed stock portal |
| Media understanding/QA | `video-understand`, ffprobe/FFmpeg, contact sheets | documented full manual review |
| Browser recording | Playwright recording, in-app browser, Chrome control | OS screen recording with a capture manifest |
| Editable handoff | isolated CapCut draft, Premiere/Resolve XML/AAF, HyperFrames/Remotion source | JSON/CSV frame timeline + stems |

Provider names are options, not a fixed ranking. Select for current quality, reference support, consistency, rights, budget, region, and the specific shot. Do not describe a provider as best without checking current capabilities and task fit.

### 5.1 Deep-research agent team and orchestration

Deep research is mandatory before the creative plan for an app/product campaign. If the executing environment supports subagents and current user/environment policy authorizes them, the main agent should proactively launch independent read-only research agents without asking again. If subagents are unavailable or disallowed, the main agent performs the same scopes sequentially. Research may not be skipped because delegation is unavailable. Every researcher inherits the same privacy, source-quality, cloud-upload, budget, secret, and non-destructive boundaries as the main agent.

Determine whether subagents run locally or through another organization/cloud
processor. Remote delegation is third-party processing: send only the minimum
task-local context, no credentials, private customer data, raw restricted
media, unapproved source code, consent documents, or unrelated conversation.
Confidential/restricted material may go to a remote subagent only when that
processor and asset class are explicitly approved under the same external-
upload profile. Otherwise keep the scope local or perform it in the main agent.

#### Research team

Use up to three parallel researchers whose scopes do not overlap and who do not edit the same files:

1. **Product/source researcher**
   - reads project instructions, repository structure, routes, feature flags, tests, release notes, screenshots, product documentation, and current build;
   - runs only safe read-only diagnostics;
   - returns the feature inventory, working/current states, proof paths, limitations, and claims that require verification;
   - never prints secrets or modifies the app.
2. **Audience/market/competitor researcher**
   - identifies audience pains, jobs-to-be-done, language, objections, category expectations, competitor positioning, app-store/review patterns, and current platform context;
   - separates official facts from anecdotal user sentiment;
   - finds gaps/differentiation without copying a competitor's script, characters, shots, music, or brand language.
3. **Creative/platform/tool researcher**
   - studies high-level creative patterns, hooks, pacing, safe zones, platform delivery requirements, relevant visual references, provider capabilities, current model constraints, costs, rights, and technical production options;
   - recommends the truthful acquisition/editor/audio stack and fallback ladder;
   - checks official/current documentation rather than relying on remembered schemas.

The main agent remains responsible for synthesis. It must verify important claims and source links itself before using them. Subagent output is evidence to inspect, not authority to trust blindly.

#### Delegation rules

- Give each researcher one concrete bounded brief, workspace scope, non-edit rule, expected output, and source-quality standard.
- Parallel researchers must not modify shared files. They return concise findings to the main agent.
- Do not delegate tightly coupled final decisions, script lock, rights approval, edit integration, or final QA.
- The main agent resolves contradictions, checks the real app, and writes the canonical research packet.
- If one researcher fails, continue useful work and rerun that scope once with new information or perform it locally.
- Bound research by the project profile: normally no more than three researchers, the declared timebox, ten deeply scored product features, five deeply compared competitors, three to five creative territories, and the sources needed to verify material claims. Do not research indefinitely.

#### Research source standard

- Use primary/official sources for product behavior, platform specs, prices, model/API features, policies, laws, scientific claims, and provider terms.
- Use current app-store reviews, support forums, social posts, interviews, and communities only for sentiment/pain discovery; label them anecdotal and do not turn them into factual claims without verification.
- Record a canonical public URL or workspace-relative path, title, publisher, publication/update date, access date, claim supported, confidence, and whether human/legal/domain review is required. Strip signed query strings, access tokens, URL fragments, usernames, and machine-specific absolute paths.
- Prefer several independent source types over many copies of the same claim.
- Respect copyright: summarize; do not paste full articles, scripts, lyrics, or competitor creative.

#### Required research outputs

The main agent writes `planning/RESEARCH_PACKET.md` containing:

1. Executive finding: who the video is for, which pain matters, what the app actually proves, and the recommended campaign objective.
2. Product map and `FEATURE_AUDIT.md` link.
3. Audience/job-to-be-done and evidence.
4. Competitor/category table: promise, proof style, weakness/gap, and non-copyable elements.
5. Current platform/provider/tool constraints and selected production stack.
6. Rights, privacy, safety, cultural, and factual risks.
7. Three to five evidence-backed creative territories with pros, risks, footage needs, and CTA fit.
8. Recommended territory and why it wins.
9. Source ledger with links/paths, dates, supported claims, and confidence.
10. Open questions that genuinely require the user; all discoverable questions must already be resolved.

Research stops when the real product and top capture-ready candidates are understood, material claims have primary-source support, audience evidence is sufficient to choose a direction, current provider/platform constraints are known, three distinct territories have been compared, and additional sources are unlikely to change the decision. Log remaining unknowns and confidence instead of pretending certainty. Research gate: the selected feature and audience problem are evidence-backed; current provider/platform requirements are verified; claims and rights risks are logged; and the main agent can explain why the recommended video is more truthful and effective than the rejected directions.

---

## 6. Project directory and immutable artifact contract

Create a dedicated project directory. Keep application source and unrelated user files untouched.

```text
<video-project>/
  MASTER_WORKFLOW_COPY.md
  README_FIRST.md
  REPRODUCE.md
  PROJECT_PROFILE.yaml
  RUN_LOG.md
  STATE.json
  SPEND_LEDGER.json
  ASSET_MANIFEST.json
  TOOLCHAIN_LOCK.json
  planning/
    PROFILE_VALIDATION.json
    RESEARCH_PACKET.md
    REFERENCE_ANALYSIS.md
    FEATURE_AUDIT.md
    BRIEF.md
    scripts/
      draft-01.md
      draft-02.md
      draft-03.md
      draft-04.md
      locked-script.md
    SCRIPT_REVIEW.md
    STORYBOARD.md
    EDIT_MAP.json
    SHOT_ACQUISITION_MATRIX.md
    PACING_MAP.md
    CAPTION_SYSTEM.md
    OCCUPANCY_MAP.json
    EFFECT_INVENTORY.md
    ANIMATIC.mp4
    VARIANT_MATRIX.md
    MEASUREMENT_PLAN.md
    CONTINUITY_BIBLE.md
    CAPABILITY_REPORT.md
    RIGHTS_AND_CONSENT.md
    LICENSE_ATTRIBUTION_LEDGER.md
  prompts/
    00_GLOBAL_LOCK.md
    shot-001.md
    shot-002.md
  references/
    character/
    wardrobe/
    locations/
    props/
    style/
  source/
    SIDE_EFFECT_AND_CLEANUP_MANIFEST.md
    generated/raw/
    generated/approved/
    stock/raw/
    stock/approved/
    capture/raw/
    capture/approved/
    capture/CAPTURE_MANIFEST.md
    rejected/
  assets/
    brand/
    ui/
    mockups/
      DEVICE_STAGE_MANIFEST.json
    fonts/
    images/
    overlays/
  audio/
    VOICE_PERFORMANCE_MAP.md
    voice/raw/
    voice/selected/
    music/
    sfx/
    stems/
    mix/
  captions/
    transcript.txt
    word-timings.json
    captions.srt
    captions.vtt
    captions.ass
  edit/
    timeline.json
    filtergraphs/
    editable-project/
    mezzanine/
  renders/
    previews/
    masters/
    variants/
  qa/
    source/
    preview/
    master/
    variants/
    artifacts/
      <artifact-scope-or-variant-id>/
        occupancy-validation.json
        FINAL_REFERENCE_DISTANCE_REPORT.md
    QA_RESULTS.json
    NATIVE_DETAIL_REPORT.md
  delivery/
    FINAL_RELEASE.json
    SHA256SUMS
    QA_REPORT.md
    DELIVERY_NOTES.md
    RIGHTS_AND_CONSENT_REDACTED.md
```

Rules:

- Raw sources are immutable. Never overwrite a raw download, generation, recording, or user asset.
- Use `shot-<id>_<provider>_<model>_attempt-<NN>.<ext>`.
- Preserve rejected attempts and a concise rejection reason; they are not production inputs.
- An asset enters `approved/` only after its keeper gate passes.
- Never alias or rename a failed asset into an expected production filename.
- Use relative paths in manifests. Use SHA-256 for user assets, approved sources, UI captures, voice masters, mixes, and final renders.
- Place placeholders only under `edit/` or `qa/placeholder/`, visibly stamp them `PLACEHOLDER`, and fail closed in production mode.
- Never delete or overwrite a meaningful render. Version or archive it.
- Write downloads and renders to unique `.part`/temporary names, validate them, then atomically promote them to their final versioned path. A partial file is never an approved input.
- Define retention/archival policy before removing provider downloads, raw captures, rejected takes, consent records, or intermediate masters. Cleanup is a separate authorized action; delivery does not imply deletion.
- Keep raw consent evidence in secure storage outside the ordinary delivery bundle. Deliver only a redacted summary and secure reference—never raw IDs, signatures, addresses, private emails, or signed/expiring URLs.
- Portable reproducibility normally means the same approved inputs, frame and
  sample timing, layout, content, specs, and declared perceptual/numeric
  tolerances. Claim byte identity only after repeat-testing an explicitly
  deterministic software path with pinned renderer/encoder, threads,
  fonts/seeds/locale/timezone, container metadata/timestamps, network fixtures,
  and input hashes. Browser/GPU/hardware-encoder output may differ even on the
  same machine and must not carry a byte-identical promise.

### Asset manifest fields

Every external or generated asset must record:

```json
{
  "id": "shot-001_attempt-02",
  "type": "generated_video",
  "relative_path": "source/generated/raw/shot-001_flow_veo_attempt-02.mp4",
  "owner_or_provider": "Google Flow",
  "model": "verified-current-model-name",
  "access_mode": "authenticated_browser",
  "request_or_history_id": "if available",
  "created_at": "ISO-8601",
  "prompt_file": "prompts/shot-001.md",
  "references": ["hero-front-v1", "room-v1"],
  "settings": {},
  "license_or_consent": "documented status",
  "redistribution_allowed": "yes|no|restricted plus evidence reference",
  "data_classification": "public|internal|confidential|restricted",
  "external_upload_authorization": "provider/asset-class approval or local-only",
  "retention_training_region_review": "reference",
  "provenance_or_content_credentials": "preserved status",
  "native_specs": {},
  "effective_dimensions_after_crop_and_scale": {},
  "scale_ratio_to_master": 1.0,
  "native_detail_classification": "native_detail_4k|mixed_native_4k_composition|upscaled_4k_output|not_4k",
  "upscaler_model_and_settings": "none or exact recorded values",
  "sha256": "...",
  "status": "raw|approved|rejected",
  "qa_report": "qa/source/shot-001_attempt-02.md",
  "notes": ""
}
```

---

## 7. End-to-end phase-gated workflow

### Phase 1 — Intake, rights, research, and brief

1. Read the user request, project instructions, existing files, and source assets before changing anything.
2. Classify the deliverable: product ad, custom film, explainer, talking-head edit, caption job, music video, motion graphic, website capture, PR video, or another format.
3. If the subject is an app/product, perform the autonomous product/feature audit below before choosing the message.
4. Inspect every supplied reference video, image, and audio file at source
   quality. Deconstruct emotional architecture, pacing, composition,
   typography roles, camera/motion, product proof, sound, and CTA—not text,
   music, characters, branded graphics, or shots to copy.
5. Verify time-sensitive facts, product claims, platform requirements, software schemas, and provider terms from primary/official sources.
6. Record the audience, message, proof, CTA, duration, aspect, platform, language, brand rules, forbidden content, budget, and rights.
7. Confirm ownership/permission for uploaded images, likenesses, voices, music, stock, logos, UI, and private data.
8. Define the campaign funnel stage, placement, measurable hypothesis, offer, KPI/baseline/target/window, CTA destination, attribution, and decision guardrails. Validate the deep link, store page, landing page, availability, price, and offer terms without placing a real order.
9. Draft `planning/VARIANT_MATRIX.md` now from current official platform/placement requirements so aspect, duration, safe zones, captions, CTA, cover, audio, codec, and file limits inform the creative plan. Write `planning/BRIEF.md`, `PROJECT_PROFILE.yaml`, `planning/RIGHTS_AND_CONSENT.md`, `planning/RESEARCH_PACKET.md`, `planning/REFERENCE_ANALYSIS.md`, and `planning/MEASUREMENT_PLAN.md`.

Gate: the project has a coherent message, lawful inputs, a known destination, a measurable success/learning definition, and a budget/approval policy. Rights or material claims cannot be silently inferred.

#### Reference deconstruction and originality gate

For each supplied reference, create a timestamped analysis containing:

1. shot-change map and shot-duration histogram;
2. camera scale, angle, movement, and edit-transition families;
3. caption modes, hierarchy, entry motion, color roles, and occupied zones;
4. emotional and audio-energy curve, silence, phrase landings, and music tail;
5. product-proof timing, device/mockup behavior, CTA build, and first/last
   fully resolved CTA frames;
6. `transferable principles` separated from `protected/non-copyable expression`;
7. at least three deliberate departures that make the new work original.

Never reproduce a reference's unique dialogue, ordered shot sequence,
characters, signature compositions, music/melody, logo treatment, or branded
caption artwork. A similar retention curve or emotional architecture is a
principle; tracing the same creative scene by scene is copying. Keep
analysis-only references outside production inputs unless their reuse rights
are confirmed.

Reference gate: the agent can explain the reference's grammar with evidence,
the new plan has at least three intentional departures, every reused element
is licensed, and the result remains recognizably the current product/brand
rather than a disguised copy.

#### Autonomous app/product discovery and feature selection

Do not require the user to decide which feature deserves the video when the agent can discover it safely. The agent owns this research and recommendation.

1. Inspect the app/product from every available truthful source:
   - repository structure, routes/navigation, feature flags, UI copy, tests, screenshots, release notes, configuration, and current build;
   - the running app on simulator/emulator/browser/desktop;
   - official website, App Store/Play Store listing, changelog, help center, privacy information, and marketing copy;
   - read-only analytics, support tickets, user reviews, or product documents when the user has placed them in scope and access is available;
   - current competitor/category positioning from trustworthy public sources when campaign strategy benefits from it.
2. Create `planning/FEATURE_AUDIT.md` containing:
   - complete feature inventory;
   - target user/job-to-be-done and pain solved by each feature;
   - exact current screen/flow where it can be proven;
   - product readiness and known limitations;
   - whether the claim is factual, inferred, or needs user/legal confirmation;
   - capture difficulty, privacy risk, visual quality, and fallback.
3. Score every plausible lead feature out of 100:

| Feature selection criterion | Points |
|---|---:|
| Solves a meaningful user pain / creates clear value | 20 |
| Relevance to the intended audience and campaign goal | 15 |
| Differentiation from obvious category alternatives | 15 |
| Can be demonstrated visually and understood muted | 15 |
| Current, stable, truthful, and capture-ready | 15 |
| Supports a strong hook and emotional/story arc | 10 |
| Leads naturally to the desired CTA/conversion | 10 |

4. Hard reject a feature as the campaign lead when it is broken, disabled, unavailable to the target audience, impossible to capture truthfully, privacy-sensitive without a safe demo, dependent on unsupported claims, or too complex to understand within the duration.
5. Select one primary feature/value promise. Add no more than one or two supporting features unless the brief explicitly calls for a broader product tour. A feature list is not a story.
6. Validate the winner by running the real flow and recording a short proof capture before locking the script.
7. Record the selected feature, score, evidence, why it wins, supporting features, and reasons the other candidates were rejected.
8. In autonomous mode, make the selection and continue. Ask the user only when the top options imply materially different audiences, rights, price claims, or business strategy that cannot be resolved from evidence.

Feature-selection gate: the chosen feature scores at least 80/100, has no hard rejection, is working in the current product, can be captured authentically, supports the campaign KPI, and provides one clear message, one visual proof moment, and one CTA. If no feature passes, do **not** lower the score or weaken the proof rule: re-evaluate the next capture-ready candidate, change to a truthful broader brand/problem/education format that makes no unsupported feature claim, or report a genuine product/access blocker. The agent may make that fallback autonomously only when it stays inside the locked objective, audience, message class, CTA, rights, budget, and duration flex; a material strategy/message change requires the Phase 16 user checkpoint. Do not proceed to production until the revised concept passes.

### Phase 2 — Script and narration architecture

Do not write one script and immediately produce it. Use the mandatory four-pass system below and preserve the alternatives/review scores.

#### Script Pass 1 — Product truth and creative angles

1. Inspect the real app/product, source code, website, screenshots, documentation, and current behavior before making claims.
2. Write the factual value proposition, user pain, real product proof, audience insight, and single CTA.
3. Create 3–4 genuinely different creative angles. Each angle contains a one-line premise, first-two-second hook, emotional arc, product-proof moment, visual ending, and CTA.
4. Reject angles that depend on a fake feature, unsupported result, unavailable UI state, unsafe action, copied campaign, or footage the production cannot truthfully obtain.

#### Script Pass 2 — Three or four complete draft scripts

Write 3–4 complete scripts, not superficial wording variants. At least one should be the safest/clearest route, one should be more emotional, and one may be bolder or more product-led if appropriate. Each draft must include:

- exact spoken copy;
- estimated and target duration;
- scene/beat mapping;
- product proof and CTA;
- caption concept;
- performance direction;
- pronunciation list;
- legal/factual source note for every claim.

Build a hook, tension/problem, diagnosis/turn, proof, resolution, and one CTA appropriate to the format. Avoid shame, unsupported claims, crowded feature lists, generic filler, and multiple CTAs.

#### Script Pass 3 — Score, read aloud, and synthesize

Score every draft out of 100 and save the result in `planning/SCRIPT_REVIEW.md`:

| Criterion | Points |
|---|---:|
| Claims are true and visually supportable | 15 |
| Hook earns attention in the opening 1–2 seconds | 15 |
| One clear message and logical arc | 15 |
| Real product value/proof is integrated naturally | 15 |
| Audience relevance and emotional truth | 10 |
| Every line is visualizable with obtainable footage | 10 |
| Spoken timing, pauses, and breathing fit | 10 |
| CTA is singular, clear, and earned | 5 |
| Rights, safety, cultural/domain accuracy | 5 |

A draft cannot pass merely by score if it contains a hard failure: false claim, missing product proof, unlicensed/copycat material, unsafe/culturally wrong action, impossible duration, no usable hook, or more than one competing CTA.

Read the best drafts aloud or render temporary scratch TTS. Measure actual duration. Select the strongest draft or combine only the best compatible elements into one synthesis draft. Record why the others were rejected.

Pass threshold: at least 85/100, no hard failure, and a measured read that fits the available voice windows without unnatural speed.

Passes 1–3 produce a **provisional winner**, not a production lock. Script Pass 4 occurs in Phase 4 only after the storyboard, animatic, proof path, and actual scratch/selected voice timing exist. No visual batch may start before that lock.

### Mandatory 3–4-pass review policy for every major artifact

Do not confuse repetition with quality. Each major artifact receives 3–4 **different** review passes:

1. **Content/truth pass:** correctness, audience, claims, rights, message, and completeness.
2. **Timing/technical pass:** duration, frame/sample math, platform constraints, safe zones, file integrity, and tool feasibility.
3. **Continuity/experience pass:** story flow, visual continuity, product proof, voice, captions, sound, mobile readability, and emotional result.
4. **Integration/release pass:** the artifact is checked inside the actual preview/final, against the immutable hash and every dependent layer.

Apply these passes to the brief, script, storyboard, prompt pack, reference bundle, generated sources, app recordings, voice, audio mix, captions, rough cut, and final master. Save pass/fail evidence. A later pass does not excuse a failure found in an earlier one.

### Phase 3 — Visual system and continuity bible

Define:

- Character identity, age, body, face, hair, wardrobe, handedness, props, and permitted changes, when the applicability matrix requires recurring character continuity.
- Location architecture, time of day, practical lights, weather, geography, and safety.
- Camera language, lenses, motion, shutter feel, depth of field, and frame rate.
- Color progression, skin-tone protection, grain/texture, and output color space.
- Product/phone rules, typography, caption zones, CTA zone, and platform safe area.
- Universal negative lock: identity drift, anatomy errors, object morphing, generated text/UI/logos, watermarks, unsafe action, flicker, freezes, fake reflections, inappropriate cultural details, or prohibited style.

When continuity-critical people, objects, or locations exist, create one approved master reference bundle before dependent shots:

1. Neutral front face.
2. Three-quarter face.
3. Full-body wardrobe.
4. Important prop/device.
5. Repeating room/location.
6. Color/style reference.

Text descriptions alone do not guarantee identity continuity. Reattach the same master references to every dependent generation. Previous-shot frames may supplement but never replace the clean master reference.

Gate: the applicable master reference bundle and global lock are internally consistent and rights-cleared; N/A reference categories are explicitly skipped rather than fabricated.

#### Live-action real-character mode

When `human_source_policy: real-photographed-only`:

1. Use verifiable live-action footage of a real, consented/licensed adult or a
   commissioned shoot. Reject generated people, avatars, synthetic face
   replacement, and AI “photoreal” substitutes even when they look real.
2. Prefer one same-actor shoot/session or an explicitly matched stock series.
   Verify the face, hair, glasses, facial hair, body, wardrobe, props,
   environment, light, and motion across actual decoded frames—not filenames
   or thumbnails.
3. Treat requested age, ethnicity, nationality, religion, occupation, or
   customer status as casting appearance unless reliable released metadata
   proves the fact. Do not call a performer American, Muslim, a customer, or
   an endorser merely because the story targets that audience.
4. For religion, health, politics, finance, sexuality, disability, or another
   sensitive context, verify the license/model release permits that portrayal
   and avoid an implied testimonial. If the stock license does not establish
   campaign-specific consent, obtain it or commission a suitable shoot.
5. Record source page, contributor, native file, license terms, model-release
   status, campaign restrictions, access date, and exact SHA-256.

Real-character gate: the selected human footage is genuinely live action,
identity-continuous, adequately detailed after crop, licensed for the intended
campaign/context, and not described with unsupported personal attributes.

#### Effect budget and stillness rule

Default to `effect_intensity: restrained` for premium product and emotional
work. Every authored effect must have one named job—orient, reveal, connect,
emphasize, or hide a necessary seam—and must be visibly better than the clean
cut in a before/after review. Product proof and the resolved CTA become still
after their finite settle.

Do not add decorative sweeps, orbit rings, particles, light streaks, lens-flare
stacks, shake, bounce/overshoot, repeated glow pulses, scale pops, or perpetual
ambient drift by default. When feedback says the edit is overdone, remove whole
effect categories first; do not merely lower their opacity. The rough cut
fails when the viewer notices effect activity before story, actor, product, or
CTA.

### Phase 4 — Storyboard, animatic, voice timing, and final script lock

1. Convert the script into a scene/shot plan with narrative purpose, exact time window, frame range, action, lens, camera, lighting, reference IDs, audio cue, transition, overlay zones, and keeper criteria. Refine the draft variant matrix and storyboard critical reframing/safe-zone differences before prompts or captures are locked. Write `planning/SHOT_ACQUISITION_MATRIX.md`, `planning/PACING_MAP.md`, `planning/CAPTION_SYSTEM.md`, and an initial `planning/OCCUPANCY_MAP.json` at the same time.
2. Choose one authoritative frame rate. Store picture ranges as integer half-open ranges `[start,end)`.
3. Ensure every frame from 0 through `total_frames - 1` is covered exactly once unless deliberate overlaps are defined.
4. Protect faces, hands, product UI, domain-critical/sensitive actions, the
   full device/hero-object silhouette, CTA negative space, and platform chrome.
   Assign numeric keep-out rectangles and minimum gaps on the design canvas.
5. Use hard cuts or short dissolves by default. Add stylized transitions only
   when they support the story and remain inside the declared effect budget.
   For a retention-led 20–45 second short, start with 0.6–1.1-second opening
   visual beats, 1.3–2.0-second emotional realization beats, 1.3–1.8-second
   readable proof states, and a 3.0–4.0-second fully resolved CTA when the
   profile permits it. Every cut must change useful scale, angle, action,
   information, emotion, or spoken phrase; a meaningless crop/zoom does not
   count as a new shot.
6. Plan authentic UI, captions, and CTA in post; do not ask a video model to render precise product pixels or readable copy.
7. Create a low-cost animatic from boards, authentic proof captures/placeholders clearly marked as such, and temporary audio. It must cover every final frame—no timing gaps hidden until the edit.
8. If narration applies, write `audio/VOICE_PERFORMANCE_MAP.md` with the overall emotional arc and per-line intention, subtext, intensity, pace, breath/pause, emphasis, and picture relation. Audition 3–4 performance treatments/voices using the real text, select and record the exact consented voice ID/human performer reference plus selected take/settings, create the pronunciation lexicon, and render a full scratch or selected narration. Measure actual line, breath, pause, and tail durations. If narration does not apply, time the animatic from music/SFX/on-screen-copy beats and mark voice/ASR N/A.
9. If captions/on-screen copy apply, place rough copy in the animatic and verify reading time/safe zones. If not, mark them N/A.
10. Generate dependent continuity shots only after anchor shots pass and Script Pass 4 is locked.

#### Script Pass 4 — production lock

1. Write exact timed line windows, beat-by-beat emotional direction, pronunciation lexicon, on-screen copy, and a voice-free tail where useful.
2. Map every spoken/caption claim to an authentic screen, substantiated shot, or truthful visual metaphor. A metaphor may communicate emotion but cannot substitute for factual product proof.
3. Re-test the provisional script against the storyboard, proof capture, animatic, and selected/scratch voice. Fix rushed delivery, dead visual time, repeated meaning, unavailable proof, or an unearned CTA.
4. For regulated, medical, legal, financial, safety, cultural, or other domain-sensitive content, run the additional qualified review.
5. Lock the heard script separately from editorial caption cards. Captions may be phrase-led rather than verbatim only when meaning stays accurate and the profile selects that style.
6. Hash the locked script, storyboard, edit map, animatic, `VOICE_PERFORMANCE_MAP.md`, pronunciation lexicon, exact selected voice ID/take/settings or performer reference, and timing audio. Any later wording, recast, voice/timbre/emotional-interpretation change, or material timing change reopens voice, storyboard, prompts, captions, edit, variants, and affected QA.

Final Phase 4 gate: every applicable spoken word or visual-copy beat fits measured timing; claims are sourced and visually supportable; every line/beat has a visual job; pronunciation and emotional arc are defined; one product promise and one CTA remain when applicable; duration/frame math reconcile; every shot has a lawful acquisition path and fallback; and `SCRIPT_REVIEW.md` preserves all 3–4 drafts/treatments, scores, failures, and the final selection.

#### Enforceable pacing map

`planning/PACING_MAP.md` is a machine-checkable ledger, not a prose summary.
Use one row per picture shot with this schema:

```text
shot_id | [start_frame,end_frame) | duration_seconds | story_region | visual_change | spoken_or_music_cue | readability_or_emotional_job | profile_target | exception_and_reason
```

Append aggregate statistics for the selected pacing profile: total covered
frames, shot count, duration minimum/median/maximum, percentage of applicable
pre-proof visual changes at or below the microshot target, longest pre-CTA
shot, proof-hold range, emotional-hold range, and fully resolved CTA hold.
Validate that ranges are integer, ordered, non-overlapping, and cover every
master frame exactly once. Fail Phase 4 for an uncovered/duplicate frame, an
unexplained timing outlier, an unreadable proof/caption, or a purported new
shot whose only change is a meaningless crop, zoom, or effect.

#### Per-shot source-versus-generation routing

For every timeline slot, fill one row in
`planning/SHOT_ACQUISITION_MATRIX.md` and evaluate in this order:

1. approved existing project asset;
2. user-supplied asset with compatible rights;
3. licensed stock from an authorized source;
4. authentic app/product capture;
5. designed motion graphic or verified 3D render;
6. commissioned/custom shoot;
7. local generation;
8. authorized cloud generation.

Choose the earliest route that satisfies narrative truth, continuity, visual
fit, rights, effective source detail, cost, privacy, and schedule. The order is
not absolute when a later route is demonstrably safer or more truthful, but
habit or tool availability is not a justification. Do not generate live action
when real licensed footage already fits. Do not force weak stock when a custom
shot is essential. When real humans are required, synthetic people are a hard
rejection.

Each row records: shot ID; candidate routes; selected source; exact page or
capture path; license/consent; same-character/wardrobe/location continuity;
native and effective dimensions after crop/zoom; scale ratio to master;
`native_detail_4k`, `mixed_native_4k_composition`,
`upscaled_4k_output`, or `not_4k`; whether the layer is `critical` and
`primary/dominant`; cost/quota; privacy; fallback; and keeper gate. “Found on
the internet” is not provenance or permission. A web clip is usable only when
the official/download source and intended-use rights are recorded.

Acquisition gate: every slot has one approved truthful source and one viable
fallback; no unresolved-license web clip, synthetic person in real-only mode,
or falsely labeled native-detail source can enter generation or edit.

### Phase 5 — Pilot shot and provider selection

1. Pick the most continuity-critical or technically risky shot as a pilot.
2. Test the preferred provider with the actual references, aspect, duration, and prompt structure.
3. Generate only the minimum useful variations, usually 2–4.
4. Download originals and run source QA.
5. If the provider cannot meet identity, anatomy, text-free, watermark, region, resolution, or commercial-use requirements, switch before generating the batch.

Gate: one pilot proves the provider/reference strategy or a documented fallback is selected.

### Phase 6 — Visual asset generation and acquisition

For each shot:

1. Follow the locked acquisition-matrix route, prompt where applicable, and
   reference mapping. Search/download stock only through authorized sources.
2. Acquire, capture, design, shoot, or generate within the attempt ceiling and
   cash/credit/quota budget. Do not open a generator merely because it exists.
3. Download/copy every authorized candidate immediately and preserve its
   original bytes and provenance.
4. Probe the file; create a labeled early/middle/late contact sheet and exact critical frames.
5. Review identity, anatomy, hands, phone/prop geometry, physics, text, marks, motion, flicker, safety, culture/domain accuracy, composition, and negative space.
6. Accept a safe sub-range only when the range is independently valid and does not hide a story/continuity failure.
7. Change one controlled variable after a quality failure. Do not blindly resubmit the same prompt.
8. Calculate effective source dimensions after crop, stabilization, and zoom.
   Inspect 100% crops at master scale. Reject a source that fails
   `native_master_detail_required`; otherwise disclose mixed/upscaled detail.
9. Enforce `human_source_policy`. A generated/AI-avatar person automatically
   fails a `real-photographed-only` shot.
10. Use licensed stock, product capture, motion graphics, custom shooting, or
    local generation when that is more truthful than forcing cloud AI footage.

Gate: every non-UI picture slot has an approved source; no raw or rejected file is referenced; real-only and native-detail policies pass; and every upscale/mixed source is disclosed. Product/UI slots remain explicit locked reservations backed by the Phase 1 proof capture and must be filled by Phase 7 before edit integration. If the app concept depends on production capture geometry to design live-action plates, execute the relevant Phase 7 capture before that plate generation rather than guessing its dimensions.

### Phase 7 — Authentic product/UI capture

For any app/software video, the agent must attempt to run and record the real product itself. Do not make the user record screens merely because self-capture takes setup work.

#### Capture source priority

1. Build/run the supplied local source repository and capture it in an available simulator, emulator, browser, or desktop sandbox.
2. Use a safe staging/demo build or authenticated browser session supplied by the user.
3. Use existing authentic recordings only after checking that they show the current valid product state.
4. Request a user/real-device recording only when the feature genuinely depends on hardware or access unavailable to the agent—for example camera, GPS, compass/magnetometer, Bluetooth, push notification timing, StoreKit/payment sheet, secure enterprise account, or a physical-device-only bug.
5. Never replace unavailable real product proof with generated fake UI.

The agent may make one concise real-device request only after simulator/emulator/browser/staging capture and lawful alternate proof routes have been tried and documented. A blocker note alone does not satisfy the product-proof gate.

#### Build and run procedure

1. Read the repository's `AGENTS.md`, `CLAUDE.md`, README, package manifests, build scripts, and environment examples before executing anything.
2. Inspect scripts for destructive commands, unsafe paths, secrets, production side effects, lifecycle hooks, telemetry, and network targets.
3. Record pre-build Git status and preserve the user's dirty changes. Prefer a disposable worktree/copy, sandboxed test profile, separate derived/build-output directory, and frozen-lock installs such as `npm ci` or ecosystem equivalents. Do not update dependency lockfiles, project settings, signing, or source merely to make a capture build.
4. Install missing project dependencies in the isolated project-local environment. Do not print `.env` values. Record post-build Git status and treat any unexpected source change as a failure to investigate.
5. Use only `approved_staging_endpoints` and the exact
   `permitted_external_mutations`, with synthetic fixtures: fake names, emails,
   phones, addresses, location, time, payment method, messages, and
   notification content. Creating a test account/record is an external write
   and requires `allow_test_account_creation: true` plus a recorded cleanup or
   retention plan. Use no production tokens or customer data. Block real
   charges, emails, SMS, push notifications, analytics/crash telemetry,
   destructive writes, and production mutations. Never reset/erase a real
   user device.
6. Create `source/SIDE_EFFECT_AND_CLEANUP_MANIFEST.md` listing accounts/records created, endpoints contacted, external side effects blocked or authorized, and any cleanup that would require separate approval.
7. Preflight the capture surface: disposable browser/device/profile; no password-manager/autofill UI, bookmarks, personal tab titles, clipboard popups, desktop files, shell usernames/paths, notifications, camera/mic feed, carrier/device IDs, location, private status-bar content, debug overlays, or unrelated apps.
8. Start the app and navigate the exact storyboard flows. Wait for animations/data to settle and use deterministic seed state. Record build/install/launch/seed/navigation/record/stop steps as an executable Playwright/Maestro/XCUITest/UIAutomator/Appium script when practical, otherwise as an exact timestamped action manifest.
9. Record multiple clean takes and screenshots at native resolution. Keep one untouched master recording and create derivatives later.
10. Verify the captured state against actual product behavior and the script claim before using it.

#### Capture adapters

- **iOS:** requires macOS/Xcode for Simulator capture. Use the available workspace/project and an installed Simulator. Build, install, launch, seed/reset state, then capture with Xcode/simulator tooling. Typical commands, after resolving the correct device and bundle safely:

  ```sh
  xcrun simctl io booted screenshot source/capture/raw/ios-screen.png
  xcrun simctl io booted recordVideo source/capture/raw/ios-flow.mov
  ```

  Stop recording cleanly through the controlling process. Do not assume a particular iPhone model exists; inspect installed runtimes and use the closest valid device or document why exact hardware is required. Screen-recording/device permissions may require the user to approve an OS prompt.

- **Android:** build/install on an available emulator, navigate with `adb`/automation, and capture at native size:

  ```sh
  adb shell screencap -p /sdcard/app-screen.png
  adb pull /sdcard/app-screen.png source/capture/raw/android-screen.png
  adb shell screenrecord --time-limit 180 /sdcard/app-flow.mp4
  ```

  Standard Android `screenrecord` commonly caps a take at 180 seconds, records no device audio, and should not rotate mid-take. Stop it cleanly, `adb pull` the finished file, and validate size/decode/hash. Remove the explicit temporary **emulator** copy only when `permit_task_scoped_temp_cleanup` is true, current host/authority policy permits it, and that exact validated emulator path is listed in the cleanup manifest; otherwise leave it and record the pending cleanup. Capture-to-device plus `adb pull` avoids unsafe binary redirection differences on Windows PowerShell.

- **Web app/SaaS:** run the local dev/production build or open the authorized staging site. Use Playwright/browser control for deterministic viewport, navigation, screenshots, and video. Explicitly set viewport and video size; close the browser context so Playwright finalizes the recording. Record browser version, viewport, device scale factor, canonical URL/build commit, seed data, and actions. Wayland/macOS capture permission may need direct user approval.

- **Desktop app:** use the supported sandbox/test profile and OS screen capture or app automation. Avoid notifications, menus, or desktop files that reveal private information.

#### Physical product capture and proof adapter

For a physical product, authentic proof means the real current product or
official rights-cleared product imagery—not a generated approximation:

1. Verify model/version/SKU, packaging, logo/label/legal copy, color/material,
   dimensions/scale, included accessories, condition, price/availability, and
   every visible performance/result claim against current official evidence.
2. Prefer approved official packshots/product footage, a controlled user-
   supplied shoot, or a commissioned shoot. Record photographer/owner,
   property/location/model releases, trademarks, music/art visible on set, and
   the permitted territories/media/paid-ad scope.
3. Build a shot checklist for turntable/hero, scale/context, hands/use, detail,
   result, packaging, and safety. Control white balance, reflections, dust,
   fingerprints, label legibility, continuity, and color accuracy.
4. Use a synthetic render only as a documented product illustration when its
   geometry/materials are approved; it cannot prove physical performance,
   included contents, fit, safety, durability, or a real-world result.
5. If the agent lacks a lawful camera/product/location, exhaust approved
   official/stock/commissioned-shoot routes, then request the smallest exact
   capture package from the user. Do not fabricate a missing physical proof.

Physical-product gate: the depicted model/state and claims are current,
scale/material/color are truthful, required releases exist, usage is safe, and
generated illustration is never presented as empirical proof.

#### Capture manifest and visual rules

1. Remove or redact private data **before** capture. Run OCR/manual review afterward for missed emails, names, paths, tokens, notifications, addresses, license plates, faces, or account identifiers.
2. Preserve complete, valid UI states and record native size, frame rate, app version/commit, device, OS, test data, exact action sequence, time, and hash in `source/capture/CAPTURE_MANIFEST.md`.
3. Create a clean “feature proof” take for every scripted product claim plus optional close/detail takes.
4. Prefer the least deceptive composition:
   - straight-on editorial UI surface;
   - verified physical 3D mockup with authentic pixels inside the display;
   - perspective-tracked physical-phone composite only when the plane, bezel, reflections, finger/hand occlusion, and motion are stable at full resolution.
5. Never use AI-generated readable UI, notification text, logos, script, prices, legal copy, or metrics as product proof.
6. Do not crop away required status/header/navigation unless the creative brief explicitly calls for a detail shot and the result remains truthful.
7. If trustworthy proof cannot be captured, remove or rewrite the claim, select another capture-ready feature, or change the concept/format and reopen Phases 1–4. Continue autonomously only for a revision inside the locked objective/message class; pause for a material strategy/message change under Phase 16. A truthful metaphor may support emotion but may not substitute for factual product substantiation. If no truthful route remains, report the genuine blocker.
8. Run the mandatory four review passes: state/truth, technical/native capture, storyboard/continuity, and final composite/full-resolution QA.

Gate: every surviving product-proof claim has a current authentic capture or other approved truthful evidence; UI is sharp, readable, contextually truthful, privacy-safe, and free of pasted-edge, warp, duplicate-device, or capture defects. A documented blocker passes only after the concept/claim has been revised so the final video no longer depends on missing proof. This is the final picture-source gate: every timeline slot—generated, stock, designed, and authentic UI—now references an approved manifested asset before Phase 9 integration.

### Phase 8 — Voice, music, SFX, and mix

Apply only the selected audio modules. Silence, no narration, or no music can be the correct creative decision; record it rather than filling every gap.

1. Execute the exact selected Phase 4 voice/timing. If that voice/take becomes unavailable or a different cast, timbre, model, or emotional interpretation is proposed, reopen Phase 4 and its dependent gates before continuing. Never clone without explicit scoped consent.
2. Load the locked `audio/VOICE_PERFORMANCE_MAP.md` and execute its beat-by-beat arc, such as `immediate hook -> contained pain/tension -> recognition -> small turn -> believable hope/relief -> calm earned CTA`. Adaptation beyond the locked intent requires reopening Phase 4; do not force sadness into an upbeat tutorial.
3. For every line, specify intention, subtext, intensity, pace, pause/breath, emphasis, and relation to the picture. Performance directions belong in metadata/prompts and must never be spoken aloud.

Use at least this row schema:

```text
TIME WINDOW | HEARD TEXT | INTENTION | SUBTEXT | INTENSITY 0–5 |
PACE / TARGET WPM | PAUSE / BREATH | EMPHASIZED WORDS |
RELATION TO PICTURE | FORBIDDEN DELIVERY
```

The map is an executable performance contract, not mood adjectives. For an
applicable emotional promo, a reusable arc is `immediate human hook ->
contained pain -> recognition -> small practical turn -> believable relief ->
calm confident CTA`; never force it onto an upbeat tutorial or neutral demo.
4. Audition at least 3–4 **genuinely different performance takes or settings** for the critical hook, emotional turn, key product name, and CTA. Compare them inside the animatic with music—not in isolation. Reject robotic cadence, sing-song TTS, identical sentence melody, rushed breathing, fake crying, melodrama, announcer voice, emotional mismatch, or a flat CTA.
5. Create pronunciation auditions for brand names, people, places, abbreviations, and domain terms before the full render. Use production-only phonetic spelling or dictionaries while keeping correct public spelling.
6. For a continuous emotional monologue, prefer one coherent performance so feeling flows across scene boundaries. If per-scene files are unavoidable, use the same voice/model/settings/session intent, preserve room/timbre, and hand-edit breaths/joins so the listener cannot hear assembly seams.
7. Preserve natural micro-dynamics: conversational volume changes, restrained breaths, silence before/after the emotional turn, and enough time for the image to land. Do not time-stretch speech beyond a transparent range merely to rescue a broken script.
8. Record voice ID/model/settings, prompt/performance directions, raw takes, selected take, rejected reasons, transcript, word timings, and hashes. For a human performer, store only the necessary consented production metadata.
9. Measure the final narration and compare it to the hashed reference/map. It must stay inside the locked Phase 4 windows. A material wording, pause, emphasis, duration, timbre, cast, or emotional-delivery change reopens Phase 4 and every dependent shot/caption gate; do not silently shift scenes after generation.
10. Run ASR with key terms and compare against the locked heard script. ASR is evidence, not a substitute for human listening—especially for emotion, pronunciation, breath, and implied punctuation.
11. Use rights-cleared music. Map its energy, harmony, rhythm, and silence to the same emotional beats. Music supports the pain/turn/relief; it must not manufacture emotion the voice and story have not earned. Do not imitate a living artist or copy copyrighted lyrics/melody.
12. Build scene-matched ambience and SFX only for visible or narratively justified events. Avoid generic cinematic booms, random impacts, mismatched actions, or transition noise that competes with feeling.
13. Duck music under speech with hand automation or transparent side-chain compression. Preserve key music moments in intentional speech gaps; avoid pumping, masking consonants, or burying breaths that carry emotion.
    Select a source window long enough to cover the locked cut. Prefer a
    musically clean earlier in-point or a documented editorial music edit over
    ending early or looping badly. For a conversion short when appropriate,
    reserve 3–4 seconds of voice-free tail, land the resolved CTA on a musical
    phrase/downbeat, and fade naturally over roughly the final 1.5–2.0 seconds
    to the exact last audio sample. If an authorized 1–2-second CTA extension
    is used, extend picture and music together, keep the already approved
    earlier phase sample-identical when practical, use pitch-preserving tail
    treatment, and reopen frame/sample/mix QA.
14. Review raw voice solo, voice with picture, full mix, compressed review file,
    phone speaker, and headphones. The emotion must remain believable at every
    stage. If `can_listen_audio` is false, do not infer emotion from waveforms or
    ASR; route the immutable files to an authorized listener and keep the gate
    open until their result is recorded.
15. Normalize the **full final mix** with measured two-pass loudness, not guessed one-pass gain and not independent normalization of each stem. Re-measure the encoded final because AAC may change peak.
16. Keep applicable 48 kHz WAV/PCM voice, music, SFX, and mix stems plus a compressed listening preview. When a layer is intentionally absent, mark it N/A.

Gate: applicable scripted words are present; emotional transitions feel continuous and earned; 3–4 auditions/takes are documented; pronunciations pass; no direction tags are spoken; no robotic/overacted delivery, clicks, clipping, pumping, masking, or dropouts exist; cues match picture; and loudness/true peak meet the project profile.

### Phase 9 — Deterministic edit, captions, graphics, and CTA

1. Normalize source time bases deliberately. Do not use optical-flow interpolation, reversal, synthetic freezes, or speed changes unless the story requires them and the result passes dense temporal QA.
2. Build the timeline from integer frames and one design coordinate system.
   Complete `planning/OCCUPANCY_MAP.json` for faces, hands, authentic UI,
   phone/hero-object silhouette, captions, callouts, brand, CTA, and platform
   overlays at every shot and transition boundary. Protected pairs have zero
   pixel intersection plus the declared visual gap; 64 pixels on a 1080×1920
   review is a useful CTA-to-device starting gap, scaled for other canvases.
   The JSON must declare `canvas: {width,height}`, every required sampled
   `frame` or named `boundary`, each element's axis-aligned visible rectangle
   `{x,y,width,height}` including shadow/glow/reflection extents, and every
   protected pair with `required_gap_px`. A validator must compute
   `intersection_area_px2`, `measured_gap_px`, and `pass` for each pair and
   write
   `qa/artifacts/<artifact-scope-or-variant-id>/occupancy-validation.json`.
   Include the exact artifact path and SHA-256 in that report. Missing required frames,
   boundaries, elements, or protected pairs fail just like a measured
   collision; a hand-written claim of "no overlap" is not evidence.
3. When a device/hero object continues across shots, use one continuous plate
   or an exact handoff of source media frame, x/y, scale, rotation, opacity,
   shadow, reflection, and light. Slicing a plate must preserve continuous
   media time. Never crossfade two complete phone shells, reset the device
   pose, restart its overlay motion, or let the screen state change move the
   hardware. Prefer changing only the authenticated screen plane inside one
   shell. Inspect frames before/at/after every handoff.
4. Create an effect inventory and compare the clean cut with the treated cut.
   Keep only motivated effects inside the Phase 3 budget. No per-cut effect
   requirement exists; clean cuts are often the premium choice.
   Write `planning/EFFECT_INVENTORY.md` with one row per authored effect:
   `effect_id | effect_type | [start_frame,end_frame) | named_narrative_job |
   clean_evidence | treated_evidence | benefit | verdict_keep_or_remove`.
   Unlisted effects, effects without a named job, and effects that do not beat
   the clean version fail the rough-cut gate.
5. Render a lower-resolution preview from the same authoritative timeline used for the master.
6. Do not creatively grade/recolor authentic UI. Preserve its appearance, geometry, aspect ratio, and legibility through compositing; document the unavoidable declared final codec/color conversion and inspect it at full resolution. Grade live footage separately from UI/brand assets.
7. Captions, when selected/required:
   - match the heard phrase within the declared tolerance;
   - use one short phrase at a time and at most two natural lines unless the format requires otherwise;
   - assign role-based modes from `planning/CAPTION_SYSTEM.md`: large
     stacked/editorial hook; boxless supporting subtitle; middle-third
     emotional impact phrase; compact top/side product callout; and designed
     CTA. Use only the modes the story needs and one primary active mode at a
     time;
   - change mode when the narrative role changes, not randomly on every line;
     for a short this is often every 6–10 seconds;
   - avoid one repeated bottom pill/rail, dangling one-word lines,
     high-frequency word-by-word karaoke flicker, full-width black slabs, and
     a caption that straddles a live-action/product boundary;
   - use local glyph shadow/outline or a small justified support, not an automatic full-frame black slab;
   - never cover or touch a face, hand, phone action, device shell, product UI,
     domain-critical/safety action, or CTA; product callouts use a verified
     top/side corridor rather than the device bottom;
   - treat 26 pixels at 1080×1920 as an absolute tested floor, not a target;
     social subtitles commonly need materially larger type. Verify the actual
     font, width, safe zones, and readability at normal phone size;
   - use semantic brand accents consistently and never communicate meaning
     through color alone;
   - keep separate SRT/VTT and, when styling is needed, ASS.
8. CTA, when selected/required:
   - use one brand, one earned promise/value line, and one action—no unverified
     store badge, rating, price, availability, offer, or secondary action;
   - reveal sequentially `brand -> promise -> action`, complete one finite
     phone/object settle, then hold the fully resolved state for the profile's
     minimum, normally 3.0–4.0 seconds for this premium-short preset;
   - use a readable high-contrast action treatment rather than a faint generic
     outline. For a 1080×1920 download end card, 28–30 px CTA type and a 76–82
     px button height are useful starting values, not universal requirements;
   - keep the action, promise, phone/character, shadow, and platform safe zones
     collision-free with the occupancy-map gap; no pulsing, shimmer, glow loop,
     arrow, or endless device motion is needed;
   - integrate over a living shot or intentionally designed end card and never
     end on an accidental black frame;
   - if the approved cut lacks readable hold and `duration_flex_seconds`
     authorizes up to 1–2 seconds, extend only within that allowance. Recompute
     total frames and audio samples, variants, manifests, captions, music tail,
     delivery hashes, and all affected QA. A larger or unapproved duration
     change is a hard stop.
   When the applicability matrix intentionally sets captions or CTA to N/A, verify that no stale placeholder/copy layer remains.
9. Keep generated source audio muted unless it is explicitly selected and rights/continuity checked.
10. Re-render or remux only the affected layer when picture can remain byte-identical.

Gate: preview is structurally valid and passes the complete preview QA before any expensive master render.

### Phase 10 — Preview QA

Run Section 17 in full on the preview. Watch it once silently, once with headphones, and once at normal size on a target phone or equivalent small display. Fix the cause, not the symptom.

Use `review_capabilities` honestly. If the main agent lacks one perceptual
capability, delegate the immutable review file to an authorized media-aware
reviewer with minimal context. If no capable reviewer is available, finish all
machine QA, record the missing pass, and request the user/qualified reviewer to
approve that exact hash. A text-only/headless agent may not self-approve the
rough cut or final simply because probes and contact-sheet generation
succeeded.

Gate: no known creative, visual, audio, timing, safe-zone, continuity, product, rights, or technical blocker remains.

### Phase 11 — Master, variants, and delivery

1. Render the master only from the approved preview timeline and locked inputs.
2. Validate the exact master hash, not a previous filename or mutable alias.
   Write `qa/NATIVE_DETAIL_REPORT.md` and classify the delivered raster as:
   - `native_detail_4k` only when the container is 2160×3840 (or the declared
     equivalent 4K geometry), every predeclared critical raster layer supplies
     at least one effective source pixel per output pixel in both axes after
     crop/scale, and vectors/text/3D render at master resolution;
   - `mixed_native_4k_composition` when at least one critical raster layer is
     below 1:1 but the predeclared primary/dominant storytelling raster layers
     meet 1:1 and not all critical raster layers are below 1:1;
   - `upscaled_4k_output` when any predeclared primary/dominant storytelling
     raster is below 1:1 or all critical raster layers are below 1:1; or
   - `not_4k` when the delivered container is below the declared 4K raster.
   Record effective dimensions, scale ratios, upscaler/model/settings, and
   inspected 100% crops. Declare `critical` and `primary/dominant` layers in
   the acquisition matrix before render so the label cannot be chosen after
   seeing the result. Container dimensions alone never decide the label.
3. Finalize the Phase 1/4 `planning/VARIANT_MATRIX.md` with one row per platform and placement: variant ID, audience/hypothesis, duration, aspect, rational FPS, resolution, safe zones, hook/opening frame, caption treatment, CTA/end-card, cover/poster, codec/profile/pixel format, file-size limit, color, audio target, naming, and exact QA requirements. Re-verify current official platform specifications at run time.
4. Recompose deliberately from the locked sources/timeline for each aspect/placement. Never blind-crop, stretch, squeeze, letterbox unintentionally, cut words, move captions into UI zones, or assume one social export fits all placements.
5. Run the complete Section 17 gate separately on every delivered variant and sidecar; master QA does not automatically pass a derivative.
6. Package requested captions, clean/textless version, cutdowns, alternate ratios/languages, thumbnail/poster, stems, editable project, and platform copy/alt text only when applicable/profiled.
7. Do not publish, test-upload, create a public link, or send externally without authorization. If launch is not authorized, deliver the measurement/launch plan without posting.

Gate: final QA passes on the delivered bytes; checksums and delivery notes match the actual files.

---

## 8. Shot prompt and keeper-gate standard

Every generative shot file must contain all of these fields:

```text
SHOT ID / TIMELINE SLOT / TARGET DURATION
NARRATIVE PURPOSE
REFERENCE ATTACHMENTS AND ROLE MAPPING
CHARACTER / WARDROBE / PROP / LOCATION LOCKS
SUBJECT AND ACTION
CAMERA / LENS / FRAMING / MOTION
LIGHTING / COLOR / TIME OF DAY
PHYSICAL AND PERFORMANCE DETAILS
AUDIO INTENT (or SILENT SOURCE)
EDITORIAL NEGATIVE SPACE
MAIN PROMPT
NEGATIVE PROMPT / AVOID CLAUSE
EXPECTED SOURCE SPECS
KEEPER GATE
HARD REJECTION CONDITIONS
```

Prompt principles:

- Describe subject, action, environment, camera, light, motion, physical detail, sound, and ending state.
- For a single shot, explicitly say `single continuous shot; no scene cuts` when the model supports it.
- Use natural real-time movement, breathing, blinking, fabric/environment motion, and physically plausible reflections.
- Keep phone screens away from camera or create a stable clean plane for post. Never request generated app UI.
- Reserve real negative space for captions/CTA rather than covering the subject later.
- Put provider-specific negatives in the negative field; if none exists, append an `AVOID:` clause.
- Save start/end frames or approved references for continuity-critical shots.
- Keep one provider/model/reference strategy across a continuity group when possible.

Hard reject when any applicable issue appears:

- Identity, age, face, skin, body, wardrobe, handedness, prop, room, or color continuity drift.
- Extra/missing/fused fingers, bent joints, intersecting objects, duplicate limbs, face/teeth/eye artifacts.
- Floating, bending, mirrored, changing, or impossible phone/object geometry.
- Generated readable text, UI, logos, signs, captions, legal copy, fake metrics, or unwanted branding.
- Provider mark/watermark when the intended license/export requires a clean source. Do not conceal provenance; obtain an authorized clean export or regenerate.
- Frozen-image masquerading as video, duplicate-frame runs, rubber motion, morphing, flicker, geometry breathing, or baked ghost/double-exposure transitions.
- Unsafe action, privacy exposure, domain/culturally incorrect action, or any project-specific forbidden content.
- Missing protected negative space, cropped essential subject/action, or source resolution too weak for the declared use without disclosure.

---

## 9. Google Flow / Veo website adapter

Use this when Flow/Veo fits the shot and the user has an eligible signed-in account.

Official help changes over time. At run time, verify the current model/feature table, credit cost, supported duration/aspect, region, reference/ingredient behavior, frames-to-video, editing, and download rules from Google Flow Help.

Workflow:

1. Open the official Google Flow site in the user's authenticated browser.
2. Create or open one project for the film. Do not scatter continuity shots across unrelated projects unless necessary.
3. Set video orientation/aspect, duration, output count, and model after checking current supported features.
4. Create/approve the master hero, wardrobe, location, and prop references first.
5. Add references/ingredients and explicitly bind each one to its role.
6. Use first-frame or first+last-frame mode for match-frame actions when currently supported.
7. Paste the complete shot prompt and negative/avoid clause. Keep output silent if post owns sound.
8. Generate 2–4 variants within budget. If Flow Agent is used, ensure charged actions are within the declared authorization.
9. Save useful frames as references only after they pass; keep the clean master reference in every dependent shot.
10. Download the original clip, record history/request metadata, rename it, hash it, and run keeper QA.
11. Use Flow Scenebuilder only for exploration. The deterministic local timeline remains authoritative for final timing, audio, captions, UI, and QA unless the project explicitly chooses Flow as the editor.

Do not rely on remembered button labels—the Flow UI evolves. Use semantic browser inspection and current official help.

---

## 10. Gemini Apps / Gemini API video adapter

### Browser path

1. Open the official Gemini Apps site in the authenticated browser.
2. Select the current video creation/editing mode and confirm plan/region availability.
3. Add only rights-cleared image/video references.
4. Set the correct aspect ratio and describe the complete generation prompt.
5. Generate, review, download, manifest, and keeper-test the result.
6. For iterative edits, make one surgical change at a time and say: `Keep everything else the same.`

### API/tool path

When a callable current Gemini video tool exists:

- Read its live schema and official model documentation before the first call.
- Use `GEMINI_API_KEY` or `GOOGLE_API_KEY` only through the environment/secret store.
- Preserve interaction/request IDs when stateful conversational editing is supported.
- Bind reference images to explicit roles using the tool's current documented syntax.
- Record lack of seed support or other nondeterministic limitations.
- Download outputs immediately and do not treat temporary URLs as durable assets.

Generation prompts can be rich and complete. Edit prompts should be short, delta-only, and followed by `Keep everything else the same.` If an edit changes unrequested elements twice, stop trying to patch it and regenerate from the last approved state or use deterministic post-production.

Never assume current model names, prices, duration, resolution, audio, or regional edit support from this file; verify them at run time.

---

## 11. ElevenLabs website/API adapter

ElevenLabs is an audio, voiceover, transcription, music, SFX, and dubbing adapter for this workflow. Use any current image/video features only if the active account and official documentation actually expose them. Do not pretend that ElevenLabs alone created the picture edit when another tool did.

### 11.1 Website automation

When no API tool is available:

1. Open the official ElevenLabs dashboard in the user's signed-in browser.
2. If login/MFA/CAPTCHA is required, let the user complete it and then resume.
3. For narration:
   - open Text to Speech or Voiceover Studio;
   - select the consented/licensed voice and current model;
   - record voice name/ID, model, stability/similarity/style/speed or equivalent settings;
   - load the locked `VOICE_PERFORMANCE_MAP.md`; test whether the current model responds better to natural-language direction, audio tags, paragraph context, or deterministic post pauses without speaking the directions;
   - generate pronunciation plus hook/turn/CTA auditions first and compare 3–4 emotional performances inside the animatic;
   - generate the full performance or timed per-scene clips;
   - download the highest suitable quality, preferably WAV/PCM for the master;
   - store raw takes, selected take, and rejected reasons.
4. For SFX:
   - open Sound Effects;
   - describe the exact visible event, surface, distance, perspective, intensity, duration, and loop requirement;
   - review variants and download WAV when available;
   - never use unrelated SFX just because they sound cinematic.
5. For music:
   - open Music when available on the account;
   - specify genre/mood/instruments/tempo/arc/use case and instrumental/vocal policy;
   - avoid artist imitation or copyrighted lyrics;
   - confirm commercial-use/attribution requirements for the active plan;
   - download and manifest the selected version.
6. For transcription:
   - upload the voice or video to Speech to Text;
   - set language/detection, key terms, timestamps, and diarization as needed;
   - export transcript/timestamps and manually correct brand/domain terms.
7. For dubbing:
   - upload an authorized source video or URL;
   - choose target language(s), speaker settings, and current watermark/cost options;
   - export the MP4/audio/AAF/SRT/stems supported by the current product;
   - verify translation with a qualified speaker for production-critical content;
   - note that dubbing may not include lip-sync unless the current product explicitly supports it.
8. Record browser project/history IDs where visible and download all outputs before leaving the session.

### 11.2 API/SDK path

1. Install the current official ElevenLabs SDK into the project environment only when needed.
2. Use `ELEVENLABS_API_KEY` from a secure environment variable; never write it into scripts or manifests.
3. Query current voices/models rather than hardcoding a popular voice from memory.
4. Generate and save per-scene or full-performance files plus a timing manifest.
5. Use the current documented endpoints for TTS, Music, Sound Effects, Speech to Text, or Dubbing.
6. Log request IDs, model, voice ID, settings, cost/credits, output specs, and hashes—never the key.
7. On a 429/rate limit, honor retry guidance and do not launch duplicate paid jobs.

### 11.3 Voice rules

- Voice cloning requires explicit informed consent from the speaker and documented permission for the intended use.
- Do not clone a public figure or an unconsenting person.
- Phonetic spellings and pronunciation dictionaries are production-only; captions keep the correct spelling.
- Do not use an ellipsis as a precise pause mechanism. Use supported pause controls or add silence deterministically in post.
- If the TTS engine cannot land exact pauses without degrading speech, keep the best natural read and edit silence/timing in the DAW/FFmpeg layer.
- Run ASR and human listening on raw voice, mastered voice, encoded preview, and final container for critical names.

---

## 12. HeyGen, alternate cloud providers, and local fallback

### HeyGen

- Prefer the official CLI when installed/authenticated because it provides scriptable structured output; otherwise use the authenticated website or current API.
- The agent may install the official CLI automatically from the official release instructions, but must save and inspect the installer before execution.
- Use it for avatar/presenter video, TTS, catalog assets, translation/lipsync, or multi-model video generation only when the current account exposes those capabilities.
- Record avatar/voice IDs, provider/model, job ID, prompt/script, settings, download URL expiration, cost, and output hash.
- Register downloaded media in the local asset manifest immediately.

### Other cloud video providers

Seedance, Kling, MiniMax, Grok, Runway, Sora, Veo through a gateway, and similar tools are interchangeable only at the routing level—not in output character. Choose based on current:

- character/reference fidelity;
- required duration/aspect/resolution;
- first/last-frame or edit support;
- camera/action strength;
- audio/lip-sync needs;
- seed/reproducibility;
- commercial rights, watermark, region, price, and latency.

Use a provider selector if one is installed and current. Otherwise compare official docs and run one pilot. Do not send the same paid prompt to many providers without a declared comparison budget.

### Local/free fallback ladder

When cloud access is absent, expensive, or private media should stay local:

1. Reuse approved cached assets that semantically fit and have compatible rights.
2. Use licensed stock or user-supplied footage.
3. Generate images locally with an available FLUX/mflux/ComfyUI model and animate them honestly.
4. Generate short local video with a hardware-compatible LTX model.
5. Use local TTS such as Kokoro/Piper/OS voice.
6. Use local Parakeet or Whisper for transcription.
7. Use motion graphics, browser capture, and authentic product footage instead of low-quality fake live action.

Probe RAM and disk before installing large models. Start with the smallest valid test. Never disguise a still loop or fake parallax as real generated motion.

---

## 13. Media sourcing, provenance, treatment, and rights

1. Reuse approved existing assets before resolving new ones, but never reuse another brand/client's asset on a fuzzy match.
2. For stock, record source URL, creator, license, access date, native filename, and any attribution requirement. Download only through authorized provider methods.
3. Do not download copyrighted media merely because a tool can. Respect platform terms and user rights.
4. For brand logos, use the official asset; never redraw or AI-invent it.
5. Inspect video as a labeled early/middle/late contact sheet before applying a look.
6. Do not creatively grade, redraw, or recolor UI/logos/text. Preserve their appearance and geometry through compositing, document the declared YUV/chroma/codec conversion, and verify the final encoded result at full resolution.
7. Use restrained, source-aware correction before stylization. Do not stack effects to look sophisticated.
8. Do not silently process HDR/PQ/HLG/LOG as ordinary Rec.709. Detect and explicitly tone-map or preserve the source pipeline.
9. For face/plate/address privacy, isolate/track the region with an appropriate mask or tool. Do not imply a whole-frame blur performed region tracking.
10. If a treatment is not clearly better in before/after evidence, keep the source unchanged.
11. Build `planning/LICENSE_ATTRIBUTION_LEDGER.md` for every font, logo, trademark/store badge, stock item, music cue, SFX, dataset, generated asset, testimonial, likeness, and voice. Record scope, media, purpose, territory, term, paid-ad permission, attribution, modification, revocation limits, and evidence reference.
12. Verify comparative, superlative, price/discount, availability, performance/result, testimonial/endorsement, health, finance, legal, safety, and environmental claims for the target market. Required disclaimers must be legible and timed; an asterisk cannot rescue an unsupported headline.
13. Treat minors, biometric/health/payment/location data, celebrity/public-figure likeness, voice cloning, customer stories, and regulated offers as qualified human/legal review triggers. The agent may prepare evidence but cannot invent consent or legal approval.
14. Verify current synthetic-media/AI-generated labels, paid-partnership/advertising disclosures, affiliate notices, political/platform rules, and jurisdiction requirements before delivery/publication. Record the decision per platform variant.
15. Preserve required provider marks, provenance metadata, and content
    credentials with the immutable original source in the private provenance
    archive. Compositing/transcoding may strip asset-level C2PA/content
    credentials; verify the final container rather than promising survival. If
    they do not survive, retain the source credentials/manifest chain and apply
    the platform/jurisdiction's required final synthetic-media disclosure.
    Never crop, blur, inpaint, cover, or falsely remove a watermark. A preview
    watermark is not a master; obtain an authorized clean export. Do not strip
    legally/provider-required provenance while sanitizing unrelated metadata.
16. Redact consent delivery summaries. Raw consent evidence stays in approved secure storage and is referenced by a non-sensitive ID.

---

## 14. Deterministic editing and audio implementation rules

### 14.1 Timeline

- Integer frame ranges are authoritative for picture.
- Audio timing is sample-accurate at the declared sample rate.
- Quantize a timing anchor once; do not recompute it differently between preview and master.
- Preview and master share one timeline and one design coordinate system.
- Use explicit input trims and frame counts. Avoid hidden NLE defaults.
- Keep filtergraphs/specs in files and record the exact render command.

### 14.2 FFmpeg baseline

Resolve `ffmpeg` and `ffprobe` from `PATH` or declared project variables. Never hardcode another machine's home path.

First probe the inputs and assert expected primaries, transfer, matrix, range, rational FPS, decoded frames, timestamps/start time, dimensions, channel layout, and duration. **Color tags are not color conversion.** Apply BT.709 tags only after pixels have been explicitly converted/tone-mapped with a verified `colorspace`, `zscale`, or managed color pipeline. Do not label HDR, full-range, LOG, unknown, or non-709 pixels as limited-range BT.709.

Typical delivery baseline after the mezzanines have already been converted and frame/sample locked, adjusted to the project profile:

```sh
ffmpeg -n -i VIDEO_MEZZANINE -i AUDIO_MASTER \
  -map 0:v:0 -map 1:a:0 \
  -frames:v TOTAL_FRAMES -fps_mode cfr -r TARGET_FPS \
  -c:v libx264 -preset slow -crf 18 -profile:v high -pix_fmt yuv420p \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a TARGET_AUDIO_BITRATE -ar TARGET_SAMPLE_RATE -ac TARGET_AUDIO_CHANNELS \
  -movflags +faststart \
  OUTPUT.mp4
```

Replace placeholders with validated values; declare CRF or bitrate/VBV, preset, codec/profile, pixel format, FPS, frame count, audio bitrate/layout/sample rate, and overwrite policy in the build spec. Verify the selected encoder/filter exists. Pre-trim picture and PCM audio to the locked duration; do not let `-shortest` silently decide the master. Treat AAC priming/padding separately from exact PCM sample count. For exact cuts, re-encode when the boundary is not on a keyframe because stream-copy can shift or lose frames. Parse the command exit code and probe/decode the resulting file; command completion alone is not a pass.

### 14.3 Audio mix

Keep voice, music, and SFX stems. Duck music under narration. Measure first, then apply two-pass loudness with the measured values. Verify loudness again after AAC encoding because the delivery encode can change true peak.

### 14.4 Framework adapters

- **HyperFrames:** pin the CLI version; use deterministic HTML/timelines; no `Date.now()`, randomness, or network fetch in the render; run full `check`, review warnings, snapshot, render, and decode.
- **Remotion:** use frame-safe media components, actual audio durations, deterministic code, still-frame reviews, then render.
- **CapCut/Premiere/Resolve:** build an isolated project/draft, never mutate the user's live project store without approval. Validate/lint/export the draft and keep deterministic FFmpeg delivery authoritative when the NLE cannot reproduce mix math exactly.
- **Blender:** use only when real 3D geometry adds necessary fidelity. Follow
  Section 14.5. Do not call a flat pasted screenshot a 3D phone.

### 14.5 Verified 3D phone/device blocking contract

Use this contract for Blender or another real 3D renderer:

1. Import the authentic UI as an ungraded texture in an exact screen-plane
   aperture/mask. Match screen aspect, pixel orientation, safe area, corner
   radius, bezel/Dynamic Island/camera cutout, and device geometry. Do not
   stretch, repaint, or AI-reconstruct product pixels.
2. If the authentic capture itself has a cutout/safe-area collision or wrong
   state, fix the app layout/state and recapture, or reframe the complete
   truthful region. Do not paint over the defect in Blender.
3. Numerically lock camera, lens, shell, screen plane, x/y/z, scale, yaw,
   pitch, roll, reflection, hardware material, shadow, and callout/CTA
   corridors before final rendering. Record them in
   `assets/mockups/DEVICE_STAGE_MANIFEST.json`. At minimum it contains the
   design canvas/FPS; renderer and version; shell/geometry/material IDs;
   camera/lens; screen aperture/mask and authentic UI texture hashes; per-shot
   transforms; lights; shadow/reflection setup; callout/CTA corridors; plate
   path/hash/frame range; alpha or opaque mode; every media-time handoff; and
   frame-count, alpha, bounding-box, edge-clearance, and critical-frame QA.
   Validate the JSON against the delivered plates; a prose-only mockup note is
   not sufficient for reproduction or seam checking.
4. For a 9:16 phone hero, about 60–72% frame height is a useful starting range,
   not a rule. Reserve declared top/side copy corridors and bottom platform
   clearance. The occupancy map, not aesthetic guesswork, decides the final
   size and position.
5. Give the device purposeful finite motion: edge/three-quarter reveal,
   eased yaw/tilt/position settle, one content-motivated push or reframe per
   feature, a near-locked transform during a critical UI state change, then a
   controlled pullback/settle for CTA. Avoid floating, spinning, perpetual
   orbit, bounce, or physically impossible CSS perspective substitutes.
6. Keep authentic UI sharp: no depth-of-field, glare, motion blur, bloom,
   grading, reflection, or highlight may obscure readable proof. Hardware may
   receive physically plausible material and edge light independently.
7. Use one shell at a time. For proof-state changes, animate/crossfade only
   the screen plane when needed. For proof-to-CTA continuity, prefer one
   continuous plate; otherwise match the exact source frame and every pose,
   light, shadow, reflection, and transform at the handoff.
8. Render at delivery resolution. Prefer RGBA/EXR or PNG frames plus
   shadow/reflection mattes when disk and pipeline support it; otherwise bake a
   locked opaque high-quality master-resolution stage mezzanine. Never render
   1080 and silently upscale a “4K” device.
9. Decode every rendered frame or a lossless sequence; verify contiguous frame
   names/count, dimensions, alpha 0–255 where applicable, nonzero-alpha
   bounding boxes, edge clearance, no clipping, texture loss, black screen,
   alpha fringe/spill, shell crop, screen swap, or reflection/shadow jump.
10. Inspect full-resolution frames before/at/after every motion/state/cut
    boundary and measure phone/caption/callout/CTA gaps. A beautiful render
    fails if it overlaps copy, breaks the product state, or feels detached from
    the live-action palette and emotional arc.

3D gate: real geometry, authentic sharp UI, finite story-motivated motion,
one continuous non-overlapping shell, master-resolution output, and dense
full-resolution boundary/alpha QA all pass.

---

## 15. Captions, translation, dubbing, and accessibility

1. Maintain four separate truths:
   - locked script;
   - heard final transcript;
   - word-level timings;
   - editorial caption text.
2. Correct ASR against the heard audio; do not force the transcript to the intended script when a word is actually missing.
3. Generate accessibility SRT/VTT sidecars from the **heard final transcript**,
   including meaningful speaker/SDH cues where required. Phrase-led or
   abbreviated editorial caption cards may differ stylistically, but they do
   not replace a faithful accessibility transcript. Generate ASS for styled
   embedded captions. Validate UTF-8, monotonically ordered timecodes, no
   illegal overlaps, no negative/out-of-range cues, language tags, and exact
   duration.
4. Validate spelling, punctuation, speaker IDs, meaningful SDH sound cues, line breaks, language-specific reading speed/CPS, safe zones, contrast, and exact sync. Do not communicate meaning through color alone.
5. For translation, preserve meaning, CTA, terminology, and timing—not just literal words.
6. Use a native/qualified reviewer for high-stakes or culturally sensitive translation.
7. Dubbing must preserve speaker identity only when consented. Re-check pronunciation and translated on-screen text.
8. Validate right-to-left layout, bidirectional punctuation/numbers, glyph shaping, font coverage, and line breaking for Arabic/Hebrew/other RTL scripts. Never accept tofu/missing glyphs or visually mangled text.
9. For accessibility-sensitive delivery, provide a descriptive transcript and audio description when required, avoid unsafe flash/strobe patterns, check photosensitivity guidance, and create a reduced-motion variant when needed. Verify contrast and readability on the target display rather than relying only on design intent.
10. Deliver captioned and clean/textless masters when the profile requests localization.

---

## 16. Human approval policy

In normal collaborative mode, show these checkpoints:

1. Brief, claims, rights, and budget.
2. Locked script/storyboard.
3. Master character/style reference and voice audition.
4. Pilot generation and selected source takes.
5. Rough cut.
6. Captioned/audio preview.
7. Delivery master.
8. Public upload/send.

In `autonomous-with-hard-stops` mode, the agent may approve ordinary creative checkpoints itself and continue. It must still stop for:

- unresolved rights or consent;
- login/MFA/CAPTCHA/secret entry;
- cash/credits/quota beyond the profile or an unknown-cost submission;
- external upload of an asset/provider/class not authorized in the profile;
- required legal, qualified-domain, accessibility, or human signoff not yet supplied;
- a material change of audience/message/CTA or any duration change outside the
  profile's already authorized `duration_flex_seconds`;
- a genuine hardware/access request after all safe self-capture routes have been exhausted;
- destructive overwrite or deletion outside the approved task-scoped
  regenerable-temp cleanup policy;
- public upload or sending to a third party.

Log every human or autonomous approval with timestamp, artifact hash, decision, and notes.

---

## 17. Mandatory QA and release gate

Automated diagnostics are evidence, not creative approval. Run them, inspect their outputs, compare numeric results with `PROJECT_PROFILE.yaml`/`qa_thresholds`, and then perform human-equivalent viewing. Check every command's exit status. Write machine-readable pass/fail, measured value, threshold, exception, artifact hash, and evidence path to `qa/QA_RESULTS.json`. A report with unparsed logs or failed commands is not a gate. Run this entire section independently for the master **and every delivered platform/language/aspect variant**.

Before running the examples below, assign the exact immutable file a stable
artifact-scope/variant ID, create
`qa/artifacts/<artifact-scope-or-variant-id>/`, and replace every
`QA_ARTIFACT_DIR` token with that directory. Store the artifact path and
SHA-256 in every report. Never reuse or overwrite one artifact's evidence for
a changed preview, master, or variant.

### 17.1 Container and decode

Verify:

- exact width/height;
- rational constant frame rate;
- exact decoded frame count and duration;
- monotonic timestamps, expected start time, CFR/timestamp consistency, and A/V sync within profile tolerance;
- sample aspect ratio 1:1 unless deliberately different;
- codec/profile/pixel format;
- color primaries, transfer, matrix, and range;
- audio codec, sample rate, channels, duration/sample count;
- fast-start where needed;
- clean full decode.

```sh
ffprobe -v error -count_frames -count_packets -print_format json \
  -show_format -show_streams MASTER.mp4 > QA_ARTIFACT_DIR/ffprobe.json
ffmpeg -v error -xerror -err_detect explode -i MASTER.mp4 \
  -map 0 -f null - 2> QA_ARTIFACT_DIR/full-decode.log
```

The validator must compare `nb_read_frames`, rational frame rate, total duration, expected frames, audio layout/sample rate, stream start/end, color/range, and expected PCM/AAC behavior—not merely check that fields exist. Inspect packet timestamps when start time, CFR, gaps, or A/V sync are uncertain.

### 17.2 Temporal diagnostics

Run black, freeze, duplicate/static, dropout, and transition-boundary checks. Treat intentional stillness/black as documented exceptions, not automatic failures.

```sh
ffmpeg -hide_banner -nostats -i MASTER.mp4 \
  -vf "freezedetect=n=-50dB:d=0.80,blackdetect=d=0.30:pic_th=0.98" \
  -an -f null - 2> QA_ARTIFACT_DIR/temporal-diagnostics.log

ffmpeg -v error -i MASTER.mp4 -map 0:v:0 \
  -f framemd5 QA_ARTIFACT_DIR/frames.framemd5

ffmpeg -hide_banner -nostats -i MASTER.mp4 \
  -af "silencedetect=n=-50dB:d=0.50,astats=metadata=1:reset=1,ametadata=print:file=QA_ARTIFACT_DIR/audio-frame-stats.log" \
  -vn -f null - 2> QA_ARTIFACT_DIR/audio-dropout-diagnostics.log
```

Parse `framemd5` for consecutive exact duplicate runs, the detector logs for start/end/duration, and audio statistics for unexpected silence/dropout/clipping. Thresholds come from the profile and intentional still/black/silence intervals must be enumerated in the timeline; undocumented exceptions fail. Extract and inspect frames around every transition/timeline boundary rather than claiming the detector did so.

### 17.3 Visual evidence

Create and inspect:

- one whole-film contact sheet at about 1 fps, plus 2 fps or denser strips for
  microcut/product/CTA regions where 1 fps can miss a defect;
- every shot midpoint;
- frames before/at/after every cut, dissolve, overlay, caption, and CTA boundary;
- dense frame strips around hands, phones, UI, faces, domain-critical/safety actions, and known model-risk moments;
- first frame and final frame at full resolution.
- full-resolution 100% crops of captions, authentic UI, device/shell edges,
  alpha/reflections/shadows, CTA button, and the weakest effective-detail
  raster layer;
- the phone/product/CTA build, first fully resolved CTA frame, and last frame;
  occupancy-map intersection/gap measurements; continuous-shell pose/media
  comparisons at seams; and the authored motion/effect inventory.

Check:

- identity, wardrobe, prop, room, time, eyeline, and grade continuity;
- every shot duration against `planning/PACING_MAP.md`; microcuts remain
  comprehensible, emotional/proof/CTA holds have an explicit job, and repeated
  crops or artificial zoom changes are not counted as new useful shots;
- anatomy, motion, reflections, occlusion, and no generated text/marks;
- product/UI authenticity, full-resolution sharpness, stable placement, correct state, and no crop/warp/spill;
- captions/CTA safe zones, readability, collisions, duplicate layers, and black slabs;
- zero protected-layer intersection, required visual gaps, caption-mode
  appropriateness, continuous device transform/media time, and no restarted
  shell/shadow/reflection/overlay at a seam;
- no blank, double-device, ghost, seam, or unintended frozen frame;
- culturally/domain/safety-sensitive details against the project checklist.
- OCR/manual privacy scan for PII, secrets, emails, addresses, private paths/usernames, notification content, plates, faces requiring consent, and generated gibberish text;
- color/gamut/range and photosensitive-flash review, including any required reduced-motion version.
- native-detail classification against effective dimensions after every crop,
  zoom, and upscale; inspect at 100% and fail any unsupported “native/true 4K”
  label.

Create
`qa/artifacts/<artifact-scope-or-variant-id>/FINAL_REFERENCE_DISTANCE_REPORT.md`
against each immutable delivered master/variant, not only the storyboard, and
record its exact path and SHA-256. Confirm that the three or more
planned deliberate departures survived, then compare reference versus final
shot order, signature compositions, character/setting, dialogue/phrasing,
caption artwork, music/melody, transitions, product sequence, and CTA. Abstract
rhythm or emotional architecture may transfer; unique expression may not.
Fail release if the delivered edit has drifted into scene-by-scene imitation,
even when the early reference analysis originally passed.

### 17.4 Audio evidence

Measure and inspect:

- integrated LUFS, true peak, LRA, clipping, silence/dropouts;
- exact script via ASR and manual listening;
- pronunciation at raw, mastered, encoded-preview, and final-container stages;
- final encoded voice against the hashed `VOICE_PERFORMANCE_MAP.md`, selected voice/take, and timing reference;
- cue/picture alignment;
- music ducking without pumping;
- spoken direction tags, flattened/robotic/sing-song or overacted delivery, damaged breaths, emotional discontinuity, clicks, noisy joins, inconsistent voice identity, fake ambience, or missing tail.

```sh
ffmpeg -hide_banner -nostats -i MASTER.mp4 \
  -map 0:a:0 -af "ebur128=peak=true" \
  -vn -f null - 2> QA_ARTIFACT_DIR/loudness-report.log
```

Parse the final `ebur128` summary as the delivered-file measurement; do not
mistake a normalization filter's hypothetical/processed output for the master
input. During premaster processing, use the profile's targets, run measured
two-pass `loudnorm` or an equivalent controlled workflow, encode the container,
then independently remeasure the delivered file with the command above. Also
test mono downmix/phone-speaker compatibility, stereo phase, channel layout,
lip-sync when applicable, and exact audio tail. Compare the rendered master to
the locked timing anchors in `PROJECT_PROFILE.yaml`: exact
`audio_timing.voice_free_tail_frames`, `creative.cta_fully_resolved_frame`,
`audio_timing.music_source_in_seconds`,
`audio_timing.music_source_out_seconds`, `audio_timing.fade_start_sample`, and
`audio_timing.fade_end_sample`, or an explicit N/A for each inapplicable value.
Report expected versus measured values in audio QA; an unspecified or merely
subjective “good tail” cannot pass.

### 17.5 Captions, metadata, privacy, and packaging

Validate every SRT/VTT/ASS file for UTF-8, ordered valid timestamps, duration bounds, overlap policy, line length/CPS, language, glyph coverage, safe zones, speaker/SDH cues, and sync against the **heard final**. Inspect embedded and sidecar captions separately. Inventory container/file metadata; strip only accidental PII/secrets and retain required rights, provenance, language, and content credentials. Scan manifests, render source, editable projects, logs, and delivery files for secrets, signed URLs, machine-specific absolute paths, and missing relink assets.

### 17.6 Real viewing

Watch/listen to the complete final using actual media-perception/playback
capability—not probe metadata alone:

1. Silently, for story comprehension, cuts, captions, UI, and visual defects.
2. On headphones, for voice, music, SFX, noise, and timing.
3. At normal playback size on the target phone/display and once through a representative platform-style recompression when feasible without uploading, for retention, readability, loudness, and CTA.

Before claiming this gate, record who/what performed each perceptual pass and
which device/playback path was actually available. A media-aware agent may
inspect playback, dense frames, waveforms, ASR, and listening previews; a
headless/text-only agent may not claim it watched or heard anything. If the
environment lacks visual/audio perception, headphones/speaker playback, a
target-size display, or a qualified domain/language reviewer required by the
profile, complete all machine QA and produce the immutable review file, then
leave the missing perceptual/human check as an explicit release gate for the
user or an independent capable reviewer. Do not fabricate subjective approval.

The same immutable file hash must pass every gate. If any master or variant changes, rerun the affected gates plus full container/decode/package validation for that exact file. No derivative inherits a pass from its parent.

---

## 18. Retry and error protocol

Classify a failure before acting:

- **Precondition:** missing input, rights, login, budget, disk, runtime, or dependency.
- **Transient provider:** timeout, rate limit, queue, temporary network/service error.
- **Content/quality:** anatomy, identity, prompt, motion, continuity, watermark, unsafe or culturally wrong result.
- **Deterministic build:** script, dependency, filtergraph, codec, font, frame math, render, or file corruption.
- **Rights/safety:** consent, copyright, privacy, policy, or publication issue.

Rules:

1. A transient failure may be retried once with the same inputs after checking provider status/retry guidance.
2. A quality failure is not retried blindly. Change one controlled variable, reference, framing, action complexity, provider, or acquisition method.
3. When the same error occurs twice:
   - stop repeating the approach;
   - search the exact error plus tool/version/project context in current official docs/issues;
   - identify 3–5 genuinely different remedies;
   - compare root-cause fit, compatibility, side effects, cost, and complexity;
   - choose the safest efficient fix and log why;
   - if it still fails, use a different adapter/fallback or report the genuine blocker.
4. Preserve failed artifacts/logs. Never hide a failure or lower the specification silently.
5. If an optional provider blocks, continue with a compatible fallback.
6. If a required right, consent, or factual decision blocks, stop rather than fabricate it.

### 18.1 Crash-safe resume, idempotency, and resource control

`RUN_LOG.md` explains the run; `STATE.json` controls safe continuation. Update it atomically after every submitted provider job, completed download, passed gate, approved asset, spend change, and render promotion. Write a temporary state file, flush/close it, validate its JSON, then atomically replace the prior state while keeping one versioned backup.

Minimum state:

```json
{
  "run_id": "stable-id",
  "workflow_version": "2.0",
  "run_status": "active",
  "blocked_reason": null,
  "phase_status": {"research": "passed", "script": "in_progress"},
  "last_passed_gate": "feature-selection",
  "locked_hashes": {},
  "provider_jobs": [],
  "spend": {
    "cash": {"currency": "from-project-profile", "limit": 0, "reserved": 0, "used": 0},
    "provider_quota": {
      "provider-id": {
        "product-id": {
          "characters|seconds|credits|generations|other": {
            "attempt_limit": 0,
            "attempt_count": 0,
            "quota_buckets": {
              "prepaid": {"applicable": false, "limit": 0, "reserved": 0, "used": 0},
              "included_subscription": {"applicable": false, "limit": 0, "reserved": 0, "used": 0},
              "free": {"applicable": false, "limit": 0, "reserved": 0, "used": 0},
              "provider_pooled": {"applicable": false, "components": [], "basis": null, "limit": 0, "reserved": 0, "used": 0}
            }
          }
        }
      }
    }
  },
  "pending_downloads": [],
  "release_gate": {
    "status": "pending",
    "canonical_master": null,
    "variants": [],
    "qa_results_sha256": null,
    "open_required_gates": []
  },
  "last_successful_action": "...",
  "exact_next_action": "...",
  "updated_at": "ISO-8601"
}
```

The state hierarchy is provider → product → unit → quota bucket. Before a
submission, identify the exact bucket the provider will debit, reserve there,
and reconcile `used` there after the result. Do not move usage between
prepaid, included-subscription, free, or pooled buckets to manufacture
remaining capacity. When `provider_pooled.applicable` is true, its listed
component buckets must be false; when it is false, `components` is empty and
the active component buckets are metered independently.

Resume rules:

1. Verify locked input/tool/config hashes and free-disk headroom before continuing. Never resume against silently changed inputs.
2. Query provider history/job ID/status after a timeout, browser refresh, crash,
   or login pause. Poll with bounded exponential backoff inside the declared
   provider/time limit and recover the existing job/download before any
   resubmission. If history/status remains unavailable, mark the job
   `unknown_charged`, keep its unit/cost reserved, never resubmit it, and ask
   the user only for read-only billing/history verification when needed. Then
   use an uncharged/local fallback if the remaining budget permits, or set the
   run `blocked` with the exact unreconciled amount and recovery step; do not
   poll forever or silently free the reservation.
3. Enforce cash, credit/quota, concurrency, attempt, disk, and local compute ceilings before each expensive action. When a ceiling approaches, stop batching, finish recoverable downloads, and choose a cheaper/smaller fallback or request authorization.
4. Download/render to a unique `.part`/temporary path. Check expected type, nonzero size, checksum when supplied, probe/decode, then atomically promote. Never accept an HTML error page or partial media as a source.
5. Make phase commands idempotent: version outputs, skip only when the recorded hash/gate still matches, and never overwrite raw assets or duplicate side effects after restart.
6. Preserve the last passed preview/master and state when pausing. A pause for login, hardware, or approval must leave one exact next action so another agent can continue without guessing.
7. When disk headroom is threatened and
   `permit_task_scoped_temp_cleanup: true`, the agent may clean only
   agent-created, task-scoped, regenerable extraction/render caches explicitly
   listed in `source/SIDE_EFFECT_AND_CLEANUP_MANIFEST.md`, and only when current
   host policy/user authority permits deletion. Resolve and validate the exact
   path, reject home/root/workspace/broad/glob/symlink-escape targets, confirm
   no raw/user/approved/delivery file is included, record size and recovery
   status, then use the safest recoverable deletion available and log it.
   Otherwise request approval. Never call preservation of raw/rejected inputs a
   reason to delete them automatically.

---

## 19. Run log and reproducibility record

Maintain `RUN_LOG.md` throughout the job:

```markdown
# Run Log

## Environment
- Date/time/timezone:
- Locale and text direction:
- OS/architecture/RAM/free disk:
- GPU/driver and hardware acceleration:
- Repository/workspace commit:
- Tool, encoder, font, and dependency-lock hashes/versions:
- Browser/build/device viewport and provider access modes:
- Network fixtures or external services required:

## Project profile
- Brief hash:
- Script hash:
- Timeline FPS/frames/duration:
- PCM sample count/channel layout:
- Cash, credit/quota, disk, concurrency, and approval limits:

## Assets
- ID, source/provider, model/version, prompt, references, settings, seed if any
- Request/history/job ID
- Cash/credits/free quota charged or reserved
- Native specs and SHA-256
- Keeper verdict and QA path

## Decisions and failures
- What changed and why
- Rejected approaches and exact reasons
- Provider/tool substitutions
- Manual steps and approvals

## Build
- Exact commands/spec versions
- Preview/master hashes
- Upscaling, tone mapping, interpolation, proxy, or manual NLE disclosure
- Toolchain/locale/timezone/GPU assumptions and expected cross-machine tolerances

## QA
- Automated checks and report paths
- Manual frames/views checked
- Known limitations
```

Browser-only generation may be provenance-reproducible rather than pixel-reproducible. State that honestly. Deterministic edit/mix/render must be rebuildable from approved assets.

---

## 20. Final delivery contract

Separate the **private production archive** from the **redistributable delivery
bundle**. Raw provider/account/project IDs, unredacted `STATE.json`, full spend
ledger, consent evidence, protected source media, internal logs, and licensed
assets that cannot be redistributed stay in the private archive. The delivery
receives redacted/portable summaries and secure references. Do not make the
package reproducible by violating a stock, font, music, voice, API, or model
license.

Required in the delivery unless the project profile or license says otherwise:

- Final master MP4/MOV.
- Lightweight review MP4.
- SRT and VTT when captions apply; ASS when styled captions exist.
- Editable project or deterministic timeline/filtergraph/source code, with
  protected assets omitted/relinked when redistribution is not allowed.
- Applicable voice, music, SFX, and final mix stems only when the user owns or
  may redistribute them; otherwise deliver the lawful mix plus a relink/source
  manifest. Intentionally absent or restricted layers are listed as N/A or
  `private-archive-only` with reason.
- `README_FIRST.md`, `REPRODUCE.md`, project profile, redacted resume/state
  summary, prompt/reference/asset manifest, toolchain/dependency locks, and
  portable relink instructions. Keep the operational `STATE.json` private when
  it contains provider/job/account/private-path data.
- Redacted rights/consent summary, license/attribution ledger, and secure references to protected originals.
- QA report, machine-readable `QA_RESULTS.json`, and evidence directory for the master and every delivered variant.
- `FINAL_RELEASE.json` containing `run_status`, canonical master relative path,
  exact SHA-256/specs, variant path+hash records, QA-results hash, N/A modules,
  open gates, and release decision.
- `NATIVE_DETAIL_REPORT.md` naming each delivered raster honestly with the
  standard enum `native_detail_4k`, `mixed_native_4k_composition`,
  `upscaled_4k_output`, or `not_4k`, with effective-dimension
  evidence.
- Redacted run log and spend/credit/quota summary with provider units; private
  request/job/account identifiers remain in the production archive.
- `SHA256SUMS` covering every delivered payload file except `SHA256SUMS` itself.
- Delivery notes listing exact specs, passes, substitutions, and limitations.

Optional when requested:

- clean/textless master;
- instrument-free or alternate music mix;
- cutdowns/bumpers;
- alternate aspect ratios;
- alternate languages/dubs;
- thumbnail/poster/GIF;
- upload/publish.

Before handoff:

1. Re-open/rebuild on a clean disposable environment or perform the closest safe clean-machine test. Verify dependencies resolve from locks, fonts/assets relink, previews render, and the exact delivered files decode.
2. Scan every delivery text, metadata field, editable project, manifest, log,
   and source file for secrets, signed/expiring URLs, private IDs, PII,
   machine-specific absolute paths, and assets whose license forbids
   redistribution. Replace them with redacted IDs/relative relink references.
3. Record provider-history IDs and source expiry dates in the private archive
   without embedding access tokens. The delivery uses a redacted stable
   reference only. Download all authorized durable assets before provider links
   expire.
4. State the archive/retention and cleanup recommendation; never delete originals or external test records merely because delivery succeeded.

Terminal-state rule:

- `active`: useful in-scope work remains and can continue.
- `blocked`: a required permission/input/capability/right/review is missing;
  record the exact reason and next action. Do not label the output final.
- `failed`: an unrecoverable required build/QA path failed and no authorized
  fallback exists; preserve evidence.
- `release_passed`: every applicable gate passes on the exact canonical
  master/variant hashes, `FINAL_RELEASE.json` and `SHA256SUMS` match existing
  files, and no required human/legal/domain/capability gate remains open.

Only `release_passed` may promote a file to canonical final. A technically
rendered master with a pending human listen, rights clearance, or target-device
review uses `run_status: blocked` and may set
`release_gate.status: technical_pass_pending_release`; it is never silently
represented as fully approved.

The handoff message must name the exact delivered filenames/specs/hashes, passed gates, N/A modules, known limitations, provider substitutions, and exact reproduction entry point—not merely say “done.” Do not list rejected candidates as deliverables.

---

## 21. Campaign measurement and controlled iteration

This phase is required for marketing/campaign work and N/A with reason for a purely personal, archival, or technical edit.

1. Before production, write `planning/MEASUREMENT_PLAN.md` with variant IDs, audience/placement, primary hypothesis, controlled variable, primary/secondary KPIs, baseline, target or learning threshold, attribution method, sample/decision window, privacy guardrails, and the 24-hour/72-hour/7-day review points appropriate to the campaign.
2. Typical observations include first-frame/hook hold, 1–3 second retention, average watch time, completion/rewatch, muted comprehension, CTR, landing/deep-link success, CVR/install/lead, negative feedback, and retention-drop timestamps. Select only metrics that match the funnel stage; vanity views alone do not prove business impact.
3. Create 2–4 variants only when the brief/budget supports a test. Change one meaningful variable at a time—such as hook, proof order, voice performance, CTA, cover, or duration—so the result is interpretable. Assign immutable variant IDs and hashes.
4. Do not claim a winner from inadequate or biased data. Record sample size, traffic source, placement, audience, spend, window, confidence/uncertainty, and external factors. A weak test produces a learning note, not invented certainty.
5. If authorized read-only analytics are available after launch, inspect retention drops and KPI results, identify the most likely causal beat, and propose the smallest evidence-backed revision. Version the revised script/timeline/master; never overwrite the original or change multiple variables invisibly.
6. Publishing, campaign activation, budget changes, tracking installation, or writing to analytics/advertising systems still requires explicit authorization. Without launch access, deliver the measurement plan and variant map; the video workflow remains complete without posting.

Measurement gate: every campaign asset maps to a falsifiable hypothesis and exact variant ID; CTA destination/attribution were validated; review windows and decision rules are declared before results; and any revision can be traced to evidence.

---

## 22. IQAMA-specific project profile overlay

Activate this section only when the requested brand/project is IQAMA. Do not apply these religious/product rules to unrelated videos.

### Product and audience

- IQAMA is presented as a calm prayer companion, never a guilt mechanism or magical cure.
- Typical product proof may include next prayer, prayer times, Qibla, gentle reminders, focus, Quran, or prayer progress—but show only real, currently valid app states.
- For English international campaigns, define the actual target regions and voice accent in the profile rather than assuming one audience.
- Use one clear emotional promise and one CTA.

### Authentic UI

- Use current-build authentic IQAMA simulator/real-device recordings or app-exported UI assets.
- A reconstructed UI may be used only as a clearly documented editorial illustration; it cannot prove dynamic behavior, state, timing, a notification, a metric, or a feature result.
- Never ask an AI video model to create readable IQAMA UI, notification copy, Arabic, logo, time, prayer metric, legal text, or CTA.
- Prefer straight-on editorial proof. A physical phone composite is accepted only when full-resolution plane tracking, bezel, reflections, finger/hand/shoulder occlusion, and source state pass.
- If the available Qibla capture is calibrating or otherwise untrustworthy, do not fake a result.
- Keep UI complete where product proof depends on status/header/content/navigation.

### Religious accuracy and respect

- Define correct qibla direction, prayer posture, modest dress, clean prayer space, footwear placement, wudu step, congregation arrangement, and camera position before generation.
- Do not imply a five-second wudu excerpt is the entire ritual.
- For hand washing, verify sleeves, palms, backs, wrists, fingers, water pressure, and anatomy frame by frame.
- For jamaat/qiyam, verify straight rows, one orientation, respectful camera position outside the rows, consistent posture, no cloned worshippers, and no shoes in the prayer area.
- Avoid invented/mangled Arabic, fantasy mosque shorthand, shame-heavy acting, intrusive worship close-ups, or inaccurate recitation.
- Add a qualified human review when religious correctness is uncertain.

### Safety and tone

- Phone interaction in a driving/work story occurs only when visibly and safely parked.
- Do not romanticize unsafe roadside prayer or fabricate a designated safe area.
- Performance stays intimate and restrained: fatigue, recognition, one doable action, relief. Avoid melodrama, crying, sermon tone, announcer cadence, or exaggerated transformation.
- Pronunciation is explicitly auditioned and human-checked. Example production spellings may be used for TTS, while captions retain `IQAMA`, `Qibla`, and `wudu`.

### Visual/audio treatment inherited from successful productions

- Keep identity, wardrobe, recurring locations, phone hardware, and color science locked through reference bundles.
- Move from tension/cooler restraint toward warmer resolution without changing skin tone.
- Use phrase-led premium captions with restrained emphasis; no automatic full-frame black slab.
- Keep the final character/living shot visible under a compact CTA when the chosen concept supports it.
- Use scene-matched room tone, commute/work ambience, one justified haptic, water only during wudu, prayer-space ambience, and restrained music.
- For social delivery, select and measure the actual target in the profile; successful prior IQAMA masters commonly landed around -15 to -14 LUFS with true peak at or below roughly -1 dBTP, but this is guidance, not a platform law.

### IQAMA keeper gates

- Same character/wardrobe/phone/location continuity where the concept requires it.
- Hands, phone grip, water, prayer posture, congregation, and footwear are anatomically and contextually correct.
- No generated UI, readable pseudo-text, fake logo, provider watermark, or privacy data.
- Product proof is authentic and does not collide with captions/face/action.
- The story remains compassionate: no shame, no pressure, one clear next step.
- Final master is reviewed muted, on headphones, and on a phone.

---

## 23. Official documentation starting points

These are authoritative starting points, not frozen schemas. Re-open and verify their current linked pages, availability, pricing, limits, terms, and UI before each production:

- Google Flow video creation: <https://support.google.com/flow/answer/16353334?hl=en>
- Google Flow models/features: <https://support.google.com/flow/answer/16352836?hl=en>
- Google Flow editing/Scenebuilder: <https://support.google.com/labs/answer/16935718?hl=en>
- Google Flow Agent: <https://support.google.com/labs/answer/17093911?hl=en>
- Gemini Apps video generation: <https://support.google.com/gemini/answer/16126339?hl=en-AS>
- ElevenLabs Voiceover Studio: <https://elevenlabs.io/docs/voiceover-studio/overview>
- ElevenLabs text to speech: <https://elevenlabs.io/docs/overview/capabilities/text-to-speech>
- ElevenLabs speech to text: <https://elevenlabs.io/docs/overview/capabilities/speech-to-text/>
- ElevenLabs sound effects: <https://elevenlabs.io/docs/overview/capabilities/sound-effects>
- ElevenLabs dubbing: <https://elevenlabs.io/docs/overview/capabilities/dubbing>
- HeyGen CLI: <https://developers.heygen.com/cli>
- Runway terms: <https://runwayml.com/terms-of-use/>
- Runway privacy and provider-data handling: <https://runway.com/privacy-policy>
- FFmpeg filters/color processing: <https://ffmpeg.org/ffmpeg-filters.html>
- ffprobe reference: <https://ffmpeg.org/ffprobe-all.html>
- Android `adb` tools: <https://developer.android.com/tools/adb>
- Playwright video recording: <https://playwright.dev/docs/videos>

Do not substitute a search-result snippet, unofficial mirror, or old tutorial for current first-party documentation.

---

## 24. Final instruction to the executing agent

Read the entire file before acting. Inspect the actual workspace and current provider capabilities rather than trusting assumptions. Launch the independent deep-research agents in Section 5.1 when available and authorized by the current environment policy, verify and synthesize their evidence, then create a short plan and execute it through delivery. Install missing free tools yourself from official sources, verify them, and continue. Use authenticated websites such as Google Flow/Gemini or ElevenLabs when no API/CLI is available and the exact asset/provider upload is authorized. Do not ask for secrets in chat, overspend cash/credits/quota, violate rights/privacy, or publish without permission. Preserve raw inputs, rejected attempts, state, and provider job IDs. Prefer truthful stock/product capture/motion graphics over fake proof. Lock the animatic and voice timing before expensive visual generation; preserve the emotional voice arc through the final encoded mix. Render a preview first, correct every blocker, render the master/variants, run the full QA gate on each exact delivered file, and report filenames, specs, hashes, passes, N/A modules, and limitations.
