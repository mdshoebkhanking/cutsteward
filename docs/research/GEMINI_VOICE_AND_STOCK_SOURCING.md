# Gemini Voice and Rights-Cleared Stock Sourcing

Research date: 2026-08-09  
Scope: 10–15 second English product-demo videos intended for public, international distribution.  
Source standard: official vendor documentation and license pages only.

## Decision

- Use `gemini-3.1-flash-tts-preview` for the demo voice when a user-provided Gemini key is available and the user has approved any billable call. It is the current low-latency, controllable TTS model and is the only listed Gemini TTS model that supports streaming.
- Use Pexels first and Pixabay second for programmatically searched stock video. Use Mixkit only as a manually reviewed fallback and only when the individual item is explicitly marked **Video Free License**, not Restricted License.
- Never treat a generic web-search, YouTube, TikTok, Instagram, news, or creator-page result as reusable stock. A clip must pass the proof gate below before download or edit.
- No Gemini, Pexels, Pixabay, or other paid/external call was made during this research.

## Gemini TTS: current official API

Google lists three Gemini TTS preview models that support single-speaker and two-speaker output:

| Model | Recommended use | Streaming | Current standard paid price |
| --- | --- | --- | --- |
| `gemini-3.1-flash-tts-preview` | Primary choice for short, expressive product narration | Yes | $1.00/M text input tokens; $20.00/M audio output tokens |
| `gemini-2.5-flash-preview-tts` | Lower-cost fallback | No | $0.50/M text input tokens; $10.00/M audio output tokens |
| `gemini-2.5-pro-preview-tts` | Quality-oriented 2.5 fallback | No | $1.00/M text input tokens; $20.00/M audio output tokens |

All three are Preview models, so model behavior, limits, and availability can change. The 3.1 price page defines audio output as 25 tokens per second. At the standard paid rate, its audio portion is approximately $0.005 for 10 seconds or $0.0075 for 15 seconds, before the very small text-input charge. Standard free-tier 3.1 TTS is currently free; batch is paid-only and half the listed standard token prices. Always re-check pricing immediately before a billable run. Sources: [Gemini speech-generation guide](https://ai.google.dev/gemini-api/docs/speech-generation), [Gemini model catalog](https://ai.google.dev/gemini-api/docs/models), and [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing).

### Authentication and secret handling

- The official SDKs auto-detect `GEMINI_API_KEY` or `GOOGLE_API_KEY`; when both exist, `GOOGLE_API_KEY` takes precedence.
- New AI Studio keys are authorization keys. Google says standard Gemini API keys will stop working in September 2026, so a new integration should use an authorization key now.
- Keep the key server-side, in an environment variable or secret manager. Never put it in browser code, source control, logs, evidence receipts, or rendered media.
- The project should call the API only after its existing provider proposal/approval gate has recorded model, estimated maximum cost, script hash, voice choice, and output destination.

Source: [Using Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key).

### Output contract

The official examples return base64 audio bytes and wrap them as a mono WAV at 24,000 Hz with a 2-byte sample width (16-bit PCM). The production adapter should therefore:

1. decode the returned base64 bytes;
2. write a mono 24 kHz, 16-bit WAV container;
3. verify duration, non-silence, peak level, and full decode;
4. normalize/mix only after preserving an immutable source WAV and SHA-256 receipt.

Gemini TTS accepts text only and outputs audio only. The context window is 32k tokens. The current guide warns that 3.1 can occasionally return text instead of audio (causing a 500), reject vague prompts, or drift on outputs longer than a few minutes. For this short workflow, allow at most three bounded attempts, require a clear `Synthesize speech` preamble, and reject any response that is not valid audio. Source: [Gemini TTS limitations and examples](https://ai.google.dev/gemini-api/docs/speech-generation).

### Voice direction for this project

Google exposes 30 named voices and descriptive qualities, but the official list does not guarantee a voice's gender, age, or nationality. For the requested premium American-male feel, audition `Iapetus` (Clear), `Gacrux` (Mature), and `Sulafat` (Warm), then select by listening evidence; do not claim demographic fidelity from the name alone.

Use a stable transcript and change only one voice-direction variable per audition:

```text
Synthesize speech. Speak only the TRANSCRIPT; do not read headings or directions.

# AUDIO PROFILE
A calm American product narrator in his early thirties. Human, intimate, and credible;
never a movie-trailer announcer and never an imitation of a real person.

# DIRECTOR'S NOTES
Accent: Natural General American English.
Pacing: Brisk but unhurried, with clean micro-pauses at sentence turns.
Emotion arc: quiet concern -> curiosity -> assured relief -> restrained confidence.
Dynamics: close-mic warmth, precise consonants, no shouting, no exaggerated smile.
CTA: land the final phrase cleanly and hold confidence rather than hype.

# TRANSCRIPT
<approved English transcript here>
```

Google supports natural-language direction for style, accent, pace, tone, persona, scene, and audio tags such as `[whispers]` or `[serious]`. Keep the direction coherent and avoid over-specification. Generate three auditions, human-review them blind, and retain only the chosen take plus its prompt/model/voice receipt. Source: [Gemini TTS prompting guide and voice options](https://ai.google.dev/gemini-api/docs/speech-generation).

### Commercial-use, attribution, and privacy implications

- Google states that it does not claim ownership of original generated content, while warning that similar content can be generated for others. The user remains responsible for the output, applicable law, third-party rights, and any attribution legally required when content is returned through an API call.
- Do not imitate or imply endorsement by a real person. Label the provenance as AI-generated voice in the project evidence/report, and disclose it publicly when context or applicable law requires.
- On unpaid Gemini services, Google may use prompts and responses to improve products and human reviewers may process them. Do not submit sensitive, confidential, or personal data.
- On paid services, Google says prompts and responses are not used to improve its products, though they are logged for a limited time for abuse prevention and required legal/regulatory disclosures.
- Google says API clients made available to users in the EEA, Switzerland, or UK must use Paid Services. For a public production integration, prefer a billing-enabled project even when a free quota happens to exist.

Source: [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms).

## Rights-cleared internet stock sources

### 1. Pexels — preferred

**Why it fits:** Pexels grants a worldwide, non-exclusive, royalty-free right to download, use, copy, modify, or adapt its licensed content for commercial or non-commercial purposes. Final-use attribution is not required, although it is appreciated. Product promotion and social publishing are listed as allowed examples.

**API:** `https://api.pexels.com/v1/videos/`; send `PEXELS_API_KEY` in the `Authorization` header. Default limits are 200 requests/hour and 20,000/month. If the app displays API search results, Pexels requires a prominent link to Pexels and asks that creators be credited when possible.

**Restrictions/risk:** no standalone redistribution, no implied endorsement, no offensive depiction of identifiable people, no stock-platform redistribution, and no trademark use. Pexels explicitly says it does not warrant that every third-party/model/property consent needed for a particular commercial use exists. Prefer clips without recognizable people, brands, artwork, private property, or distinctive products unless the required releases are independently verified.

Sources: [Pexels License](https://www.pexels.com/license/), [Pexels Terms](https://www.pexels.com/terms-of-service/), and [Pexels API documentation](https://www.pexels.com/api/documentation/).

### 2. Pixabay — programmatic fallback

**Why it fits:** the Pixabay Content License allows free use, no required author attribution, and modification into new works. Pixabay's official FAQ describes its content as usable without attribution, including commercially.

**API:** `https://pixabay.com/api/videos/?key=...`; use `PIXABAY_API_KEY`. The default limit is 100 requests per 60 seconds. API requests must be cached for 24 hours; systematic mass download is prohibited. The API can return a `large` rendition that is usually 3840x2160 when available, and `medium` is generally 1920x1080. Display the Pixabay source when showing search results and download selected assets into the project instead of permanent hotlinking.

**Restrictions/risk:** no standalone sale/distribution, misleading or deceptive use, immoral/illegal use, trademark use, or commercial use of recognizable brands in relation to goods/services. Pixabay also makes the user responsible for third-party IP, publicity, privacy, model, and property permissions. Prefer abstract/technology/environment shots without recognizable people or brands.

Sources: [Pixabay Content License summary](https://pixabay.com/service/license-summary/), [Pixabay FAQ](https://pixabay.com/service/faq/), and [Pixabay API documentation](https://pixabay.com/api/docs/).

### 3. Mixkit — manual fallback only

Mixkit has both a **Video Free License** and a **Video Restricted License**. Only items explicitly marked Free License are suitable for a public commercial demo; Restricted items are personal/non-commercial only. Mixkit says Free License video can be used in YouTube, social marketing, online ads, and music videos without required attribution. Its terms prohibit scripts/bots used for mass download and place responsibility for uncleared third-party components on the user, so this workflow must not scrape Mixkit. Use a supervised, per-item browser download and record the exact item/license page.

Sources: [Mixkit video-license FAQ](https://mixkit.co/free-stock-video/), [Mixkit license selector](https://mixkit.co/license/), and [Mixkit User Terms](https://mixkit.co/terms/).

## Mandatory stock proof gate

Before a clip can be downloaded into a production run, create a durable record with:

```json
{
  "provider": "pexels|pixabay|mixkit",
  "asset_id": "provider-stable-id",
  "source_page_url": "https://...",
  "direct_download_url": "https://...",
  "creator_name": "as-listed",
  "creator_profile_url": "https://...",
  "license_name": "exact item/provider license",
  "license_url": "https://...",
  "license_checked_at_utc": "RFC3339 timestamp",
  "commercial_use_allowed": true,
  "attribution_required": false,
  "required_credit": "or null",
  "visible_people": false,
  "visible_brands_or_logos": false,
  "model_or_property_release_evidence": "URL, document, or null",
  "intended_edit": "exact 0.8–2.0 s segment and composite role",
  "original_sha256": "computed after download"
}
```

The trusted verifier must reject missing, expired, tampered, or mismatched proof before provider submission or download. It must also reject clips that would imply an identifiable person's endorsement of CutSteward, expose visible third-party brands, or be redistributed substantially unchanged. Keep the original clip, proof JSON, attribution text (even when optional), and license URL in the run evidence. Re-check the license page immediately before public release because provider terms can change.

## Project credential audit (names only)

Checked without printing or reading secret values:

- Current process environment: none of `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `PEXELS_API_KEY`, or `PIXABAY_API_KEY` is set.
- Project environment files: no configured project `.env`/`.env.*` file containing those credentials was found.
- Source/config references exist for `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `PEXELS_API_KEY`, and `PIXABAY_API_KEY`; references are not credentials.
- Existing Google provider code targets video generation (Veo); no installed `@google/genai` package or dedicated Gemini TTS adapter was found.

Result: **Gemini voice and stock APIs are not currently credentialed in this project.** A user-supplied, restricted server-side key is required before use. Never auto-create a cloud key, enable billing, or incur a charge without the user's explicit approval.
