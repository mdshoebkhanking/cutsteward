# Autonomous execution research

Research date: 2026-08-08. This note uses current first-party or protocol-owner documentation only. Product behavior, preview model names, quotas, and protocol capabilities remain version-sensitive; CutSteward should probe them at runtime and pin tested versions.

## Decision summary

CutSteward should be autonomous at the workflow level, not by giving one model unrestricted control of the machine.

The recommended design is:

1. CutSteward owns a durable production graph, approval ledger, provider receipts, artifacts, and audit events.
2. An `AgentRuntime` boundary launches one or more replaceable planning/coding agents. Use ACP v1 as the common interactive surface where it is actually supported, with native adapters for richer vendor features.
3. Agents never receive media-provider credentials. They request typed CutSteward tools; a credential-injecting service outside the agent sandbox validates policy, approval, rate limits, and cost before calling providers.
4. A separate `BrowserSupervisor` owns Playwright. It uses a dedicated visible browser profile, suspends automation for sign-in/MFA/CAPTCHA, and obtains point-of-risk approval for paid, transmitting, publishing, destructive, or access-changing actions.
5. Provider work is not represented as an agent conversation. Each ElevenLabs synthesis, Veo operation, stock search, download, render, and publish action is a durable step with provider-specific reconciliation.

This preserves agent choice without reducing every provider to a misleading lowest-common-denominator protocol.

## 1. What can genuinely be standardized across agents

### Protocol boundaries

The similarly named protocols solve different edges:

| Protocol | Useful boundary for CutSteward | What it does not provide |
| --- | --- | --- |
| Agent Client Protocol (ACP) | A client application driving a local agent subprocess: initialize, authenticate when supported, create/load a session, prompt, stream messages/plans/tool calls, request permission, and cancel. ACP v1 is the current release; v2 is draft. It is JSON-RPC and normally uses stdin/stdout. ([ACP architecture](https://agentclientprotocol.com/get-started/architecture), [ACP v1 overview](https://agentclientprotocol.com/protocol/v1/overview)) | A durable production scheduler, provider job semantics, common sandbox policy, browser authentication, billing, artifact storage, or portable internal subagent behavior. Several sessions on one ACP connection are still client-agent sessions, not a standardized agent team. |
| Model Context Protocol (MCP) | A tool/context boundary. CutSteward can expose narrow tools such as `search_stock`, `submit_veo`, `get_job`, or `request_publish`. MCP explicitly focuses on context exchange and does not dictate how the host uses an LLM. ([MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture)) | A full agent session lifecycle. In particular, an MCP server exposing CLI tools is not equivalent to an ACP agent. |
| Agent2Agent (A2A) | A future boundary for independently deployed, opaque remote agent services that advertise capabilities and exchange tasks. ([A2A overview](https://a2a-protocol.org/latest/)) | A replacement for local CLI supervision. None of the named CLI integration contracts below should be assumed to expose an A2A server. |

ACP is therefore a good **client/runtime adapter**, not CutSteward's source of truth. Capability negotiation must win over product-name assumptions: optional session loading, terminals, images, elicitation, and custom extensions differ among implementations. Namespaced `_meta` extensions are useful for richer rendering but cannot be required for portability.

### Practical runtime surfaces

| Runtime | First-party integration surface | ACP status and important caveats | CutSteward recommendation |
| --- | --- | --- | --- |
| OpenAI Codex | Codex App Server is the documented rich-client surface for authentication, history, approvals, and streamed events. Its default transport is JSONL over stdio; it provides durable thread IDs, `thread/start`, `thread/resume`, turns, authoritative completed items, and server-initiated approval requests. The SDK is recommended by OpenAI for jobs/CI. ([App Server](https://developers.openai.com/codex/app-server/), [Codex SDK](https://developers.openai.com/codex/sdk/), [non-interactive mode](https://developers.openai.com/codex/noninteractive/)) | The ACP organization maintains `codex-acp`, which starts Codex App Server and maps its operations/events to ACP. This is a bridge in the ACP project, not the first-party OpenAI wire contract. ([codex-acp](https://github.com/agentclientprotocol/codex-acp)) | Build a native App Server adapter first for exact approval, thread, and error semantics. Permit the ACP bridge as a compatibility option. Use stdio locally; OpenAI labels the App Server WebSocket transport experimental/unsupported and warns against unauthenticated remote exposure. |
| Anthropic Claude Code | The Claude Agent SDK embeds the Claude Code loop in Python or TypeScript, including streamed messages, `canUseTool` decisions, hooks, sessions, resume, and fork. The SDK docs state that third-party products may not offer `claude.ai` login/rate limits without prior approval; use supported API-key/provider authentication. ([Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), [permissions](https://code.claude.com/docs/en/agent-sdk/permissions), [sessions](https://code.claude.com/docs/en/agent-sdk/sessions)) | The ACP organization maintains `claude-agent-acp` on top of the official Agent SDK. Its nested-subagent transcript metadata is explicitly an extension because ACP does not standardize that relationship. `claude mcp serve` is not a substitute: Anthropic says it exposes Claude Code's tools and the MCP client must implement confirmations. ([Claude ACP adapter](https://github.com/agentclientprotocol/claude-agent-acp), [`claude mcp serve`](https://code.claude.com/docs/en/mcp#use-claude-code-as-an-mcp-server)) | Use the Agent SDK directly when supported by the host language, with `canUseTool` routed into CutSteward approvals. If a fixed headless tool surface is required, pair an allow list with `dontAsk`; Anthropic notes that `allowedTools` alone pre-approves rather than removes other tools. Offer the ACP bridge as an alternative adapter. |
| Google Gemini CLI | The official repository documents headless `json`/`stream-json` output and session resume. Its configuration reference documents `--acp`; another current CLI reference still labels the ACP flag experimental, showing why installed-version probing matters. Approval modes include default, auto-edit, all-action, and plan/read-only modes. ([headless mode](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md), [configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md), [CLI reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md)) | Native ACP is documented, but the flag name/maturity has changed across CLI documentation and versions. | Prefer ACP after an `initialize` capability probe. Fall back to `stream-json` for non-interactive turns. Never silently select an all-action/YOLO approval mode; CutSteward remains the approval authority. |
| Moonshot Kimi Code CLI | `kimi acp` is a first-party JSON-RPC/stdin-stdout ACP subprocess. It advertises exact capabilities, supports new/load/resume/prompt/cancel/list/modes and permission requests, and currently routes file reverse-RPC through the client. ([Kimi ACP reference](https://moonshotai.github.io/kimi-code/en/reference/kimi-acp.html)) | Kimi documents that terminal reverse-RPC is not connected, so shell commands execute locally in Kimi's environment. Its generic ACP integration reuses an already completed login; the generic client does not drive login. ([Kimi IDE guide](https://moonshotai.github.io/kimi-code/en/guides/ides.html)) | Use native ACP. Require the user to complete Kimi login outside the agent session, then store only a boolean/readiness result in CutSteward. Treat local shell execution as a separate sandboxed capability. |
| Nous Hermes Agent | Hermes ships three first-party surfaces over the same core: `hermes acp`; a richer JSON-RPC TUI gateway over stdio/WebSocket; and HTTP/SSE. ACP covers normal sessions, messages, tool events, permissions, fork, cancel, and auth. The gateway additionally exposes session steering, approvals, secrets, delegation status, subagent interrupt/steer, and spawn-tree operations. ([Hermes programmatic integration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/programmatic-integration.md), [ACP internals](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/acp-internals.md)) | ACP is the portable subset; Hermes team/delegation controls are a vendor-specific superset. | Start with ACP. Add a native Hermes gateway adapter only if CutSteward needs those richer team controls. Do not put Hermes-only delegation fields into the portable contract. |

### The normalized contract

CutSteward can safely standardize these concepts:

- runtime discovery: implementation/version, protocol version, negotiated content/session/tool capabilities;
- session mapping: create, optionally load/resume, prompt, cancel, and a CutSteward-owned external session ID;
- ordered events: assistant text, plan updates, tool proposals, tool results, usage when available, and terminal stop/error;
- permission proposals: runtime session/turn, tool/action name, structured arguments, human-readable reason, and a response of approve, deny, or approve-with-narrowed-input;
- MCP server/tool injection when the runtime explicitly supports it;
- raw, redacted vendor payload retention for troubleshooting.

CutSteward must **not** pretend to standardize:

- provider authentication or subscription entitlements;
- sandbox strength, filesystem roots, network policy, or where a shell actually runs;
- fork/history persistence semantics;
- internal subagent trees, delegation, goal loops, or agent-to-agent messages;
- usage/cost fields, error classes, context compaction, or structured-output fidelity;
- media generation jobs, retries, idempotency, cancellation, or downloads;
- website sessions, MFA, CAPTCHA, payment, upload, or publish operations.

A small runtime interface is enough:

```text
discover() -> capabilities
createSession(config) -> runtimeSessionRef
resumeSession(runtimeSessionRef) -> runtimeSessionRef
prompt(runtimeSessionRef, content) -> event stream
resolvePermission(requestRef, decision)
cancel(runtimeSessionRef)
close()
```

Every vendor event is appended to CutSteward's event log, but only CutSteward transitions workflow state. Agent completion means “the agent turn stopped,” not “the video production step succeeded.”

### Multi-agent execution model

Use a CutSteward-owned DAG and launch independent agent sessions for bounded roles such as research, script, shot plan, asset selection, and QA. Each task receives immutable input artifact references and returns a typed deliverable. Do not depend on a provider's private subagent feature for correctness. A provider may internally delegate, but CutSteward records that as observability rather than as the durable workflow graph.

Mutating tasks should have one writer per project/workspace. Parallelize read-only research and provider jobs; serialize edits that share files or production state. This avoids assuming that separate ACP sessions isolate their files—they generally do not.

## 2. Secure, supervised browser automation

### Browser boundary

Prefer direct provider APIs. Browser automation is a compatibility fallback for a documented user-facing workflow, not a way to discover or call private endpoints.

Use a dedicated visible Playwright-managed Chromium/Chrome-for-Testing instance and a separate persistent profile for each provider/account. Playwright describes browser contexts as isolated environments and warns that saved state can contain cookies and headers sufficient to impersonate the account; such state must never enter source control. ([Playwright authentication](https://playwright.dev/docs/auth)) Chrome 136 and later deliberately refuse remote-debugging flags against the default Chrome data directory unless a non-standard `--user-data-dir` is supplied, and Chrome recommends that separation from real profiles plus Chrome for Testing for automation. ([Chrome remote-debugging security change](https://developer.chrome.com/blog/remote-debugging-port))

Prefer a browser launched and owned by Playwright. Attach over CDP only when the site/tool requires an already running Chromium instance: Playwright calls CDP attachment Chromium-only and “significantly lower fidelity” than its own protocol, while tip-of-tree CDP has no guaranteed backward compatibility. ([Playwright `connectOverCDP`](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp), [CDP versioning](https://chromedevtools.github.io/devtools-protocol/))

Security controls:

- bind any debugging endpoint to loopback or use a local pipe; never expose an unauthenticated CDP port to the LAN;
- give the browser profile and downloaded-artifact staging directory user-only permissions, and encrypt/wrap persistent auth material with the OS keychain where practical;
- never attach to the user's daily browser profile;
- allow-list origins, navigation schemes, upload roots, download destinations, and action types in code outside the model;
- allow only one automation controller per profile; use a lease/fencing token so a restarted worker cannot race an old one;
- treat webpage text, downloads, emails, and tool output as untrusted input, never as user authorization;
- redact password/OTP/API-key fields from screenshots, traces, event payloads, and model-visible DOM/accessibility snapshots;
- stage downloads outside the project, validate type/size, hash them, then promote them into the artifact store.

These controls follow the same defense-in-depth model Anthropic documents for agents—sandbox/container/VM isolation, least privilege, network allow lists, and credentials injected outside the agent boundary—and OpenAI's computer-use guidance to isolate browsers, allow-list domains/actions, distrust on-screen instructions, and retain humans for authenticated or hard-to-reverse actions. ([Anthropic secure deployment](https://code.claude.com/docs/en/agent-sdk/secure-deployment), [OpenAI computer-use safety](https://developers.openai.com/api/docs/guides/tools-computer-use#keep-a-human-in-the-loop))

### Auth, MFA, and CAPTCHA state machine

Authentication is a human-control boundary, not a model tool:

```text
DETACHED
  -> NAVIGATING_PUBLIC
  -> HUMAN_AUTH_REQUIRED
  -> HUMAN_CONTROLS_BROWSER
  -> AUTHENTICATED_READY
  -> AGENT_NAVIGATION
  -> AWAITING_ACTION_APPROVAL
  -> EXECUTING_APPROVED_ACTION
  -> VERIFYING_EVIDENCE
```

When a password, passkey, OAuth consent, OTP, MFA prompt, CAPTCHA, security warning, or account recovery page appears, CutSteward must suspend all agent input and hand the visible browser to the user. The agent receives only the later result (`authenticated`, `denied`, or `expired`), not credentials or codes. CAPTCHA solving and bypassing browser/site safety barriers must never be automated. OpenAI's guidance explicitly counts typing sensitive data as transmission, requires action-time confirmation for CAPTCHA and access-changing actions, and calls for user takeover at safety barriers. ([confirmation guidance](https://developers.openai.com/api/docs/guides/tools-computer-use#confirmations-and-sensitive-data))

Never export a live browser storage state to an agent workspace. If CutSteward retains a provider profile, show the account identity, last-authenticated time, origins present, and a “forget session” control. Expired auth returns to `HUMAN_AUTH_REQUIRED`; it must not trigger scripted credential guessing or repeated login attempts.

### Approval contract

An approval is one-shot, scoped, and bound to the exact imminent action. Store:

- action type and canonical structured arguments;
- account/provider and exact origin;
- project/run/step/attempt and browser-session IDs;
- a hash of relevant page state and payload/file hashes;
- expected external effect, maximum spend/credits, and reversibility;
- creation/expiry time and the approving user.

If the page, origin, selected account, price, payload, or uploaded file changes, invalidate the approval. Do not offer broad “approve all future actions on this site” grants.

| Action | Default policy |
| --- | --- |
| Navigate/read/search on an allow-listed public or already authenticated page | Automatic, audited |
| Fill a non-sensitive draft without submitting | Automatic only inside an allow-listed form; audited |
| Sign-in, passkey, password, OTP/MFA, CAPTCHA, account recovery, browser security warning | Mandatory human takeover |
| Start any paid/credit-consuming generation | Point-of-risk approval showing provider, model, count, resolution/duration, and maximum known cost/credits |
| Upload or transmit a file, prompt containing sensitive data, face/voice asset, or private URL | Point-of-risk approval showing recipient/origin and exact artifact |
| Send, publish, post, submit on the user's behalf, or make a share link | Point-of-risk approval; publishing should require a fresh approval even if generation was approved |
| Delete/overwrite cloud data, alter sharing/access, connect an account, install an extension/software, or change settings | Point-of-risk approval; user takeover for password/security barriers |

Success requires post-action evidence: final origin/URL, provider-visible item or operation ID where available, a redacted screenshot, and downloaded artifact hash. A click or an agent's textual claim is not evidence of success.

## 3. Media-provider execution contracts

### ElevenLabs TTS with timestamps

The timestamp endpoint is synchronous, not a submit/poll job:

```text
POST /v1/text-to-speech/{voice_id}/with-timestamps
  -> HTTP 200 JSON
     audio_base64
     alignment { characters[], character_start_times_seconds[], character_end_times_seconds[] }
     normalized_alignment { ... }
```

The official reference documents the default output as `mp3_44100_128`, character-level timing, optional model/language/voice settings, pronunciation dictionaries, and continuity request IDs. A seed is only a best effort; determinism is not guaranteed. `enable_logging=false` invokes enterprise-only zero-retention mode and disables history features. ([Create speech with timing](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps))

CutSteward should wrap this synchronous request in its own durable operation:

1. Canonicalize every output-affecting field and compute `request_fingerprint = SHA-256(provider + endpoint_version + voice + model + text + settings + dictionaries + output_format + seed + continuity inputs)`.
2. Reuse a previously verified artifact for the same fingerprint unless the user explicitly requests a new take. ElevenLabs itself recommends hashing every output-affecting parameter to avoid billing the same text twice. ([ElevenLabs integration guidance](https://elevenlabs.io/blog/text-to-speech-api-integration))
3. Persist the prepared attempt and any required spend approval before sending.
4. On success, retain the raw `request-id`, `x-trace-id`, and `character-cost` response headers; the official client supports raw-response access for these fields. ([API introduction](https://elevenlabs.io/docs/api-reference/introduction#tracking-generation-costs))
5. Base64-decode to a staging file, validate the media container, and validate alignment arrays: equal lengths, finite non-negative times, `start <= end`, non-decreasing order, and a final time compatible with decoded duration.
6. Atomically persist audio, raw/normalized alignment JSON, hashes, exact request parameters, and provider headers before marking `SUCCEEDED`.

History is a recovery aid, not the primary contract. A history item can include the provider request ID and optional alignments, while `POST /v1/history/download` returns one audio file or a ZIP for multiple IDs. ([Get history item](https://elevenlabs.io/docs/api-reference/history/get), [download history items](https://elevenlabs.io/docs/api-reference/history/download)) It is unavailable in zero-retention mode, and the timestamp endpoint documents no idempotency-key parameter. Therefore:

- safe retries: history reads, metadata reads, and downloads;
- bounded provider-advised retries: explicit 429/5xx responses with exponential backoff/full jitter, while honoring concurrency limits;
- ambiguous: a timeout/disconnect after the body may have been accepted but before a usable response was stored. Mark `AMBIGUOUS`, inspect recent history when logging is enabled, and require approval before resubmitting if no unique match is recoverable;
- do not let hidden SDK retries defeat the ledger. The official Node SDK defaults to two retries for 408, 409, 429, and 5xx, so configure submit behavior deliberately. ([official JavaScript SDK retries](https://github.com/elevenlabs/elevenlabs-js#retries))

### Google Gemini API / Veo 3.1

Google now recommends Gemini Omni Flash as the default video model and Veo 3.1 for extension, last-frame control, or legacy pipeline needs. These are different API workflows; CutSteward must expose distinct provider capabilities rather than silently swap one for the other. ([Gemini video overview](https://ai.google.dev/gemini-api/docs/video))

The Veo contract is a Google long-running operation:

```text
POST .../models/{veo-model}:predictLongRunning
  -> { name: operation_name, ... }

GET .../{operation_name}
  -> { done: false, ... }
  -> { done: true, error: {...} }
     OR
     { done: true, response: { generateVideoResponse: { generatedSamples: [...] } } }

GET generatedSamples[0].video.uri with x-goog-api-key and redirects
  -> video bytes
```

The official guide's SDK examples call `generate_videos`, poll the returned operation through `operations.get`/`getVideosOperation`, then download via `files.download`. Its REST example captures `.name`, polls that resource, extracts the generated video URI, sends the API key, and follows redirects. ([Veo 3.1 guide](https://ai.google.dev/gemini-api/docs/veo)) Google's long-running-operation standard says `done=true` ends with either a response or an `Operation.error`; a terminal operation is not automatically a success. ([AIP-151](https://google.aip.dev/151))

Durable handling:

1. Persist a `SUBMISSION_INTENT` with the canonical payload fingerprint, model/version, expected count, and approval before POST.
2. As soon as POST returns, persist the complete operation name and redacted response as the provider receipt. Recovery always polls that same name.
3. Poll with bounded exponential backoff and jitter. Do not create another generation merely because polling failed.
4. On `done=true`, branch on `error` versus `response`; store the provider status/error verbatim. Safety/policy blocks are terminal for that attempt, not transport retries.
5. Download every generated sample immediately to staging. Veo documents 11-second to six-minute request latency and only two days of server retention, after which generated videos are removed. ([Veo limitations](https://ai.google.dev/gemini-api/docs/veo#limitations))
6. Verify non-empty bytes, declared/observed MIME type, playable container, dimensions, duration, and hash; then atomically promote artifacts. Only then mark the step `SUCCEEDED`.

Poll and download GETs are repeatable. The generation POST is state-changing, and the current Veo guide does not document a client idempotency key. Google's general retry design says clients should automatically retry only requests whose repetition cannot cause unintended state changes; repeated state-changing requests should not be automatic. ([AIP-194](https://google.aip.dev/194)) If the submit response is lost before the operation name is persisted, use `AMBIGUOUS`, not “retrying.” An operator may authorize a new paid attempt after reconciliation.

For transient polling/download errors, Google recommends exponential backoff with jitter and bounded retries for 429, 408, and 5xx, while not retrying client errors such as 400/403 without a state/configuration change. ([Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting#retry-strategy)) Do not advertise remote cancellation until the selected API/model documents and tests it; stopping local polling is not proof that provider computation or billing stopped.

Veo outputs use SynthID and safety filtering. The guide notes that an audio-processing/safety block is not charged. Preserve the terminal reason and let the user revise the prompt; do not silently weaken safety-related wording. ([Veo limitations](https://ai.google.dev/gemini-api/docs/veo#limitations))

### Google Flow is not the Gemini API contract

Google Flow's official help describes an interactive product with a model/feature picker, account credits, UI-managed projects/assets, GIF/video downloads, share links, and YouTube publishing. Credit costs are per **generation**, and one request can create two videos. Direct YouTube upload covers individual clips; Scenebuilder sequences must be downloaded and uploaded through YouTube Studio. ([Flow models/features](https://support.google.com/flow/answer/16352836), [Flow credits](https://support.google.com/flow/answer/16526234), [Flow project/download/publish behavior](https://support.google.com/flow/answer/16935308)) Flow is age/region/account gated, and uploaded-video editing is unavailable in the EEA, Switzerland, the UK, and some US states. ([Flow availability](https://support.google.com/flow/answer/16353544?hl=en))

Those official Flow documents do not provide a public operation-name/poll/download API contract comparable to Gemini/Veo. Consequently:

- do not call observed private Flow network endpoints or treat DOM/network details as stable APIs;
- use Gemini API or Vertex AI for dependable autonomous generation;
- if the user explicitly chooses Flow, label it a supervised browser connector with no guaranteed resume/reconciliation contract;
- require human login/MFA and an approval immediately before each credit-consuming request, showing that a request may create more than one charged generation;
- capture the visible asset/project identifier and download immediately after completion; UI presence alone is not durable provider evidence;
- require a separate publish approval. A generation approval does not authorize a public share link or YouTube upload.

## 4. Pexels and Pixabay stock-media constraints

### Pexels

The Pexels API is a synchronous REST search/read API. Current video endpoints use `/v1/videos/`; the older `/videos/` path is deprecated. Pexels requires a prominent link to Pexels whenever API results are shown and asks for photographer credit when possible. It prohibits replicating Pexels' core functionality. Default limits are 200 requests/hour and 20,000/month; successful responses include `X-Ratelimit-Limit`, `X-Ratelimit-Remaining`, and reset headers, but 429 responses do not. ([Pexels API documentation](https://www.pexels.com/api/documentation/))

The content license permits free use and modification without required attribution, but prohibits offensive presentation of identifiable people, implied endorsement, unaltered/standalone resale, redistribution as another stock/wallpaper service, and trademark use. ([Pexels license](https://www.pexels.com/license)) Pexels' current API terms guidance also prohibits bulk/systematic copying and using the API to build ML/AI datasets or train/evaluate models without permission. ([Pexels API terms guidance](https://help.pexels.com/hc/en-us/articles/900005880463-What-are-the-Terms-and-Conditions))

CutSteward should cache normalized searches, track quota headers, show source/creator links in the picker, and download only selected assets. Store Pexels media ID, source page, creator/name/profile, chosen rendition, retrieval time, byte hash, and a link/snapshot reference to the license/terms. “Free stock” does not waive privacy, publicity, trademark, or endorsement review for the final edit.

### Pixabay

Pixabay's REST API currently allows 100 requests per 60 seconds per API key and requires API responses to be cached for 24 hours. It says the API is for real human requests and forbids systematic mass downloads. Search-result displays should identify Pixabay. Permanent image hotlinking is prohibited; selected images must be downloaded to CutSteward storage. Pixabay says video embedding is allowed but recommends local storage. Rate-limit headers report limit/remaining/reset, and excess use returns 429. ([Pixabay API documentation](https://pixabay.com/api/docs/))

The Pixabay Content License allows free use, no required author attribution, and adaptation, but prohibits standalone distribution, certain commercial uses of recognizable trademarks/logos/brands, immoral/illegal or misleading use—especially involving recognizable people—and trademark use. Pixabay warns that additional copyright, trademark, design, property, privacy, moral, or similar rights may still require permission. ([Pixabay Content License](https://pixabay.com/service/license-summary/))

Use the same provenance record as Pexels, enforce the 24-hour query cache, never crawl beyond API pagination, and download only user/agent-selected assets. Keep a human review gate for recognizable people, brands, sensitive contexts, and any ambiguous commercial use.

### Shared stock connector behavior

Stock lookup is `SEARCHING -> RESULTS_CACHED -> ASSET_SELECTED -> DOWNLOADING -> VERIFYING -> READY`, not a generative async job. GET/search retries may follow rate headers and bounded backoff. A failed or expired download should first refetch the asset metadata by provider ID; it should not silently substitute a different creative asset. If the original is gone, return `SOURCE_UNAVAILABLE` and ask the planner/user to select a replacement.

## 5. Durable jobs, retries, and reconciliation

### Canonical state machine

Use explicit states rather than a generic `pending/running/done`:

```text
DRAFT
  -> AWAITING_APPROVAL
  -> READY
  -> SUBMISSION_INTENT
  -> SUBMITTING
  -> ACCEPTED              # durable provider receipt exists
  -> PROVIDER_RUNNING
  -> RESULT_AVAILABLE
  -> DOWNLOADING
  -> VERIFYING
  -> SUCCEEDED

Any nonterminal state may become:
  RETRY_WAIT               # retry is known-safe and scheduled
  AMBIGUOUS                # side effect may have happened; do not resubmit
  FAILED_TERMINAL
  CANCEL_REQUESTED
  ABANDONED                # local monitoring stopped; provider cancel unproven
  EXPIRED                  # result/receipt retention elapsed
```

ElevenLabs usually moves synchronously from `SUBMITTING` to `RESULT_AVAILABLE`; Veo supplies an `ACCEPTED` operation receipt and stays in `PROVIDER_RUNNING`; stock APIs normally move from `SUBMITTING` straight to cached results. These differences belong in provider adapters.

### Minimum durable records

| Record | Required content |
| --- | --- |
| `workflow_run` | project, immutable production-spec revision, status, owner, timestamps |
| `step` | typed operation, dependency IDs, canonical input artifact IDs, policy/cost class |
| `attempt` | provider/adapter/version, model/endpoint, request fingerprint, state, lease/fencing token, retry count/deadline |
| `provider_receipt` | operation/history/request/asset ID, accepted time, last provider status, raw redacted payload, retention deadline |
| `approval` | exact action hash, account/origin, payload/artifact hashes, maximum cost, approver, one-shot expiry, decision |
| `artifact` | role, immutable storage URI, media metadata, byte/content hashes, provenance/license, validation result |
| `event` | append-only sequence, actor, old/new state, reason/error, redacted evidence reference |

Store a submission intent before the external call and the receipt immediately after it returns. There is still an unavoidable crash window between a provider accepting an operation and local receipt persistence when the provider offers no idempotency/recovery key. The correct state after recovery is `AMBIGUOUS`, not an automatic duplicate request.

### Retry matrix

| Situation | Action |
| --- | --- |
| Poll/read/list/history GET fails transiently | Retry with exponential backoff, full jitter, maximum attempts/deadline, and provider rate/reset hints. |
| Artifact download is interrupted | Resume if the provider/range contract is tested; otherwise restart the same download URI/receipt. Never create a new generation. |
| Provider returns explicit validation/auth/permission error | Terminal or `AWAITING_USER`; retry only after input, credential, entitlement, or configuration changes. |
| Provider returns rate/quota exhaustion | Honor retry/reset information. A short concurrency limit may enter `RETRY_WAIT`; a daily/monthly quota becomes `AWAITING_USER` or a scheduled not-before time. Never spin. |
| Submit POST receives a documented, definitely pre-accept rejection | A bounded retry may be allowed by the adapter's tested contract. |
| Submit POST times out/disconnects after bytes may have been sent | `AMBIGUOUS`; reconcile by provider receipt/history/listing. Do not blind-resubmit a paid or externally mutating request. |
| Provider operation reaches terminal error/safety block | `FAILED_TERMINAL`; a changed prompt/model is a new approved attempt, not a retry. |
| Local cancellation without provider acknowledgement | `ABANDONED` or keep reconciling quietly. Do not report provider cancellation or avoided charges. |

This follows Google's general rule to auto-retry only operations whose repetition cannot create unintended state and the provider-specific behavior above. Backoff should be centrally budgeted so nested SDK retries, adapter retries, and workflow retries do not multiply each other.

### Reconciliation loop

On process start and periodically:

1. Claim attempts with an expiring lease and fencing token; only the current token may append state transitions.
2. Re-read all `SUBMITTING`, `ACCEPTED`, `PROVIDER_RUNNING`, `RESULT_AVAILABLE`, `DOWNLOADING`, `VERIFYING`, `CANCEL_REQUESTED`, and `AMBIGUOUS` attempts.
3. If a durable provider receipt exists, query that exact provider resource. Never infer completion from elapsed time or an agent message.
4. If the provider reports success but the local artifact is absent, download and verify it. Veo receipts get priority because their video retention is two days.
5. If a staged artifact exists, verify its hash/media metadata and atomically register it; do not call the provider again.
6. If no receipt exists for a `SUBMITTING` attempt, run only the adapter's documented reconciliation strategy. Otherwise leave it `AMBIGUOUS` for an operator decision.
7. Expire unused approvals and require a fresh action hash after any payload/account/page-state change.
8. Emit alerts for retention deadlines, stuck leases, repeated transient failures, quota waits, and ambiguous paid actions.

### Completion invariant

A production step is `SUCCEEDED` only when all of the following are true:

- the provider returned a terminal success or the synchronous response completed;
- every expected artifact is durably stored and byte-hashed;
- the artifact passed type/container/duration/dimension/timing checks appropriate to its role;
- provenance, exact generating inputs/model, provider receipt, and approval evidence are linked;
- the event was committed with the final artifact IDs.

“The agent said it worked,” “the UI showed a thumbnail,” “the operation is done,” or “the HTTP request returned” are insufficient individually.

## 6. Concise implementation recommendation

Implement in this order:

1. **Execution kernel:** durable `Run/Step/Attempt/Receipt/Artifact/Approval/Event` records, leases, the state machine above, and restart reconciliation.
2. **Provider tools outside agent sandboxes:** ElevenLabs timestamp synthesis, Gemini/Veo LRO, Pexels, and Pixabay. Make exact provider semantics visible in typed results; do not expose raw credentials.
3. **Agent layer:** a capability-negotiated ACP v1 adapter plus native Codex App Server and Claude Agent SDK adapters. Add Gemini/Kimi/Hermes ACP configurations; treat vendor extensions as optional observability.
4. **Approval service:** one-shot action hashes for cost, transmission/upload, publish/send, deletion/overwrite, access changes, installation, and account linking.
5. **Browser fallback:** Playwright-owned visible isolated profiles, human auth/MFA/CAPTCHA takeover, allow-listed origins/actions, redacted audit evidence, and no private endpoint scraping.
6. **Production QA:** content-addressed artifact storage and media verification before any downstream step or publish approval.

The central rule is simple: **agents may propose and reason; CutSteward authorizes, executes, records, reconciles, and verifies.**
