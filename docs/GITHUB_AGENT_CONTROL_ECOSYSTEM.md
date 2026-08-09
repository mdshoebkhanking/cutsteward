# Agent control ecosystem for CutSteward

CutSteward product scope: macOS and Windows only. Linux references below
describe upstream products or remote sandboxes, not supported hosts.

Research snapshot: 2026-08-08  
Scope: official specifications, vendor documentation, vendor repositories, and the repositories of the evaluated open-source bridges. No third-party tutorials, catalog pages, or inferred private APIs are used.

### Exact release snapshot

These were the latest non-prerelease releases visible in the official channels on the snapshot date; they are research anchors, not a request to auto-upgrade:

| Surface | Observed release |
| --- | --- |
| OpenAI Codex | [`0.147.0`](https://github.com/openai/codex/releases/tag/rust-v0.147.0); `0.148.0-alpha.*` was prerelease. |
| Claude Agent SDK Python | [`v0.2.134`](https://github.com/anthropics/claude-agent-sdk-python/releases/tag/v0.2.134) |
| Claude Agent SDK TypeScript | [`v0.3.226`](https://github.com/anthropics/claude-agent-sdk-typescript/releases/tag/v0.3.226) |
| Hermes Agent | [`v0.20.0`, release tag `v2026.8.3`](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.3) |
| Kimi Code CLI | [`1.49.0`](https://github.com/MoonshotAI/kimi-cli/releases/tag/1.49.0) |
| Antigravity CLI | [`1.1.10`](https://github.com/google-antigravity/antigravity-cli/releases/tag/1.1.10); the live docs navigation displayed `1.1.11`, so runtime probing remains authoritative. |
| Antigravity Python SDK | [`0.1.10`](https://pypi.org/project/google-antigravity/0.1.10/) (Alpha classifier) |
| ACP reference implementation/schema repository | [`v0.13.3`](https://github.com/agentclientprotocol/agent-client-protocol/releases/tag/v0.13.3); the stable wire protocol is v1 and v2 is draft. |
| A2A specification | [`v1.0.1`](https://github.com/a2aproject/A2A/releases/tag/v1.0.1) |
| MCP specification | [`2026-07-28`](https://blog.modelcontextprotocol.io/posts/2026-07-28/) |
| Coder AgentAPI / agentgateway | [`v0.12.2`](https://github.com/coder/agentapi/releases/tag/v0.12.2) / [`v1.4.1`](https://github.com/agentgateway/agentgateway/releases/tag/v1.4.1) |

## Decision

CutSteward should implement a small **agent-runtime control plane**, not advertise generic “MCP compatibility” as if that made every agent controllable.

Build the adapters in this order:

1. **OpenAI Codex app-server over stdio** as the first, reference adapter. It is the richest documented local control surface in this set: threads, turns, live item events, steering, interruption, authentication, command/file/MCP approvals, diffs, and generated schema. Use the app-server directly for the production UI. The official TypeScript/Python SDKs and `codex exec --json` are simpler automation fallbacks, but do not expose the same interactive approval surface.
2. **Claude Agent SDK** as the second direct adapter. Use streaming input and `canUseTool`/hooks, not only `claude -p`. The SDK provides live messages, resume/fork, interrupt, and mediated permissions. Keep the Python and TypeScript feature/licensing differences visible.
3. **One ACP v1 client adapter** for Hermes, Kimi, and future ACP agents. ACP is the best shared local coding-agent protocol here: JSON-RPC over stdio, capability negotiation, sessions, live updates, cancellation, typed permission requests, client-mediated filesystem/terminals, and elicitation. Do not assume optional methods merely because an executable says “ACP.”
4. **Google Antigravity SDK** as a separate, feature-gated adapter after it passes the same conformance suite. Its Python SDK is official but still Alpha (`0.1.x`). Antigravity CLI headless `stream-json` is a useful restricted fallback, not an interactive control protocol: approval-required tools are soft-denied rather than sent to the caller for a decision.
5. Add **Hermes run-control HTTP/SSE** only as a Hermes-specific extension when CutSteward needs detach/reattach, REST session management, or Hermes-only clarify/sudo/secret events that ACP does not normalize.
6. Add **A2A at a later network boundary** only if CutSteward must delegate durable jobs to remote, independently hosted agents. It is not a substitute for local workspace/terminal/approval control.

Keep a separate **CutSteward action plane**. An MCP server can expose project, timeline, render, and artifact-review tools *to* any agent. That is useful, but it does not let CutSteward start, observe, steer, approve, resume, or cancel the agent. The control plane drives the agent; the action plane lets the agent drive CutSteward.

Do not put a generic “MCP server” entry in an “agent runtime” selector. Accept an MCP endpoint as an agent runtime only when its declared tools explicitly implement a provider-specific thread/run protocol and CutSteward has an adapter for that schema. OpenAI's experimental Codex MCP agent interface is such a provider-specific exception; an ordinary tool/resource MCP server is not.

## Two different problems: repository handoff versus live control

These mechanisms must not be conflated:

| Problem | Correct mechanism | What it proves |
| --- | --- | --- |
| Teach an agent how to start or repair this repository | `AGENTS.md`, `docs/BOOTSTRAP.md`, provider skills/instructions, setup/doctor commands | A newly launched agent can operate the repository correctly. |
| Give an agent project/video operations | CutSteward API and optionally an MCP server exposing those operations | The agent can call application tools. |
| Drive an already selected agent from CutSteward chat | Codex app-server, Claude Agent SDK, ACP, Antigravity SDK, or an explicit vendor run API | CutSteward receives live lifecycle/control events. |
| Delegate to a remote opaque agent service | A2A | A network peer can own a task and return messages/artifacts. |

The repository handoff is portable and should remain the fallback. It is not an in-app connection protocol, cannot prove that an agent launched, and supplies no live approvals or terminal state.

## What a production adapter must expose

Every adapter should map its native protocol into this narrow contract while retaining the untouched provider payload for diagnostics:

```ts
interface AgentRuntimeAdapter {
  probe(): Promise<RuntimeFingerprint>;
  start(input: StartSession): Promise<AcceptedReceipt>;
  prompt(input: PromptTurn): Promise<AcceptedReceipt>;
  events(input: { sessionId: string; after?: string }): AsyncIterable<AgentEvent>;
  decide(input: ApprovalDecision): Promise<void>;
  answer(input: ElicitationAnswer): Promise<void>;
  steer?(input: SteeringMessage): Promise<void>;
  interrupt(input: { sessionId: string; turnId?: string }): Promise<void>;
  load?(input: LoadSession): Promise<void>;
  resume?(input: ResumeSession): Promise<void>;
  list?(): Promise<SessionSummary[]>;
  close(input: { sessionId: string }): Promise<void>;
}
```

Normalize only these event families:

- `session.accepted`, with a durable local receipt before CutSteward reports a send as successful
- `message.delta` and `message.completed`
- `thought.delta` only when a provider is allowed to expose it
- `plan.updated`
- `tool.proposed`, `tool.started`, `tool.progress`, `tool.completed`
- `approval.requested` and `input.requested`
- `file.diff`, `terminal.output`, and `artifact.staged`
- `usage.updated`
- exactly one terminal event: `turn.completed`, `turn.failed`, `turn.cancelled`, or `turn.interrupted`

Capabilities must be negotiated and stored as `supported`, `unsupported`, or `unknown`; never inferred from brand name. At minimum record new/load/resume/list/close, history replay, steering, cancel, permission scopes, elicitation, plan, diff, terminal, multimodal input, artifacts, event replay/cursor, and provider extension support.

Critical invariants:

- `load` with history replay and `resume` without replay are different operations.
- Conversation resume does not restore files. Forking a conversation does not fork a Git checkout or media workspace.
- A session ID is not an event cursor. Unless a provider documents replay, CutSteward must persist its own normalized event journal.
- A process exit, broken pipe, SSE disconnect, or user cancellation is not success.
- Never auto-retry an accepted but terminally ambiguous turn that could run commands, upload media, spend money, or publish.
- Approval requests are deny-by-default, expire, and bind to the exact session, tool call, arguments, workspace, and displayed risk.
- Paths produced by an agent are not automatically safe artifacts. Resolve under approved roots, reject traversal/symlink escapes, hash files, inspect MIME/size, and stage before import.

## Protocol findings

### ACP: the shared local agent protocol

[Agent Client Protocol](https://agentclientprotocol.com/get-started/introduction) is explicitly for connecting clients/editors to coding agents. The current documentation labels **v1 latest** and **v2 draft**. For local agents, the client launches a subprocess and exchanges JSON-RPC over stdin/stdout; remote HTTP/WebSocket support remains work in progress. One connection may carry several sessions, notifications stream updates, and bidirectional requests carry permission decisions. The project and specification are [Apache-2.0](https://github.com/agentclientprotocol/agent-client-protocol).

ACP v1 supplies the correct primitives for a CutSteward agent adapter:

- `initialize` negotiates integer major version, client capabilities, agent capabilities, identity, and authentication methods. Omitted capabilities are unsupported; this makes capability probing mandatory. See [initialization](https://agentclientprotocol.com/protocol/v1/initialization).
- `session/new` binds an absolute working directory and optional MCP servers. `session/load` replays conversation history; optional `session/resume` reconnects without replay. Optional list, delete, close, additional-directory, mode, model, and config surfaces must be checked rather than assumed. See [session setup](https://agentclientprotocol.com/protocol/v1/session-setup).
- `session/prompt` streams `session/update` notifications and returns a stop reason; `session/cancel` cancels the active turn. See [prompt turns](https://agentclientprotocol.com/protocol/v1/prompt-turn) and [cancellation](https://agentclientprotocol.com/protocol/v1/cancellation).
- Tool calls carry status, locations, raw input/output, content, diffs, and terminal references. `session/request_permission` presents caller-defined options whose standard kinds include allow/reject once/always. See [tool calls](https://agentclientprotocol.com/protocol/v1/tool-calls) and [terminals](https://agentclientprotocol.com/protocol/v1/terminals).
- A capable client can provide read/write access to unsaved editor buffers and managed terminals; elicitation has form and URL modes. Form elicitation must not request secrets. See [filesystem](https://agentclientprotocol.com/protocol/v1/file-system) and [elicitation](https://agentclientprotocol.com/protocol/v1/elicitation).

Limits: ACP is a trusted editor/agent design, not a sandbox. Giving an ACP agent filesystem, terminal, or MCP capabilities grants real authority unless CutSteward or the provider constrains it. ACP v1 does not guarantee provider persistence, event cursor replay, workspace rollback, artifacts as durable application objects, or every optional lifecycle method. Pin an ACP SDK and wire version; do not adopt the draft v2 wire format in the first implementation.

### MCP: application tools and context, not generic agent control

MCP's own [architecture](https://modelcontextprotocol.io/docs/learn/architecture) says it standardizes context exchange and does not prescribe the host's LLM or agent loop. Servers normally expose tools, resources, and prompts to a host. That is the right fit for a CutSteward tool server, not for the chat control plane.

The final [MCP 2026-07-28 release](https://blog.modelcontextprotocol.io/posts/2026-07-28/) makes the core stateless: it retires the initialization handshake and transport session ID, makes requests self-describing, and moves long-running Tasks to an extension. Stateful tools mint explicit handles. Multi Round-Trip Requests can request confirmation or missing input during one tool invocation. None of this standardizes an agent's conversation history, model turns, tool timeline, file diffs, interruption semantics, or workspace recovery.

Therefore:

- A CutSteward MCP server should expose bounded application actions and resources, with its own authorization and idempotency.
- MCP Tasks can represent a long render or import operation, not an entire provider-neutral coding conversation.
- An “agent MCP server” is acceptable only through an explicit schema adapter. OpenAI's [experimental Codex MCP interface](https://github.com/openai/codex/blob/main/codex-rs/docs/codex_mcp_interface.md) exposes Codex app-server thread/turn RPCs over standard MCP stdio; that is a Codex protocol surface, not evidence that arbitrary MCP servers are agents.
- Provider MCP *client* support only means the provider can call CutSteward tools. It says nothing about CutSteward controlling that provider.

The specification repository's [license](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/LICENSE) applies Apache-2.0 to newly licensed specification/code contributions, with documented legacy licensing exceptions. Pin the exact supported MCP revision because the 2026 stateless release is deliberately breaking relative to 2025 implementations.

### A2A: later remote task federation

The Linux Foundation [A2A project](https://github.com/a2aproject/A2A) is Apache-2.0 and reached 1.0 in 2026; the [current specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md) supports JSON-RPC over HTTP with SSE, gRPC, and HTTP+JSON bindings. Agent Cards advertise discovery, skills, transports, and security. Messages can create or continue Tasks; Task status and Artifact updates can stream; clients can get/list/cancel/resubscribe, and context IDs group related work. OAuth/OIDC/API-key/mTLS schemes are representable.

This is strong for remote, opaque agents that own durable work and return artifacts. It is a poor first local-control abstraction because it does not standardize editor buffers, terminal ownership, file diffs, per-tool approval choices, local process lifecycle, or OS workspace boundaries. `input-required` and `auth-required` states are not typed authorization for a local command. None of the reviewed named runtimes documents a native A2A local-control endpoint. Add an A2A facade only after the normalized local control plane exists.

### JSONL/NDJSON subprocess patterns

Newline-delimited JSON is framing, not interoperability. Codex, Claude, Kimi, and Antigravity use different event schemas and different permission behavior. A JSONL adapter is safe only when the vendor documents the exact input/output contract.

CutSteward's subprocess supervisor should:

- launch a pinned absolute executable with argument arrays, never a shell-built command string
- set an explicit working directory and small allowlisted environment; keep stdout protocol-only and stderr diagnostic-only
- bound line size, aggregate output, queue depth, and runtime; apply backpressure
- record executable path, file hash, package version, protocol version, platform, and negotiated capabilities
- write the accepted receipt/event before updating UI state
- cancel gracefully, wait a short deadline, then terminate the complete child process tree
- treat malformed JSON, unexpected stdout text, duplicate terminal events, or post-terminal events as protocol failures

Terminal/TUI screen scraping does not satisfy this contract.

## Runtime findings and verdicts

| Runtime surface | Maturity and license | Transport and live control | Sessions and approvals | Platform/install risk | CutSteward verdict |
| --- | --- | --- | --- | --- | --- |
| Codex app-server | Official OpenAI source; Codex repo is Apache-2.0. Stable methods coexist with explicitly gated experimental methods; WebSocket transport is experimental. | Default stdio, one JSON object per line, JSON-RPC-like messages. Rich notifications, steering, interruption, command/file/MCP approvals, auth, diffs, token usage. | Start/read/list/resume/fork threads; start/steer/interrupt turns. Client subscribes when starting/resuming. | Current Codex releases provide macOS, Linux, and native Windows artifacts, but older docs still mention WSL; pin and probe the actual binary. Medium risk because it is a powerful local binary with stored auth. | **First adapter.** Generate version-matched TypeScript/JSON schema from the installed binary. |
| Codex TypeScript/Python SDK or `exec --json` | Official, Apache-2.0; SDKs wrap/bundle the CLI. | SDK spawns the CLI and exchanges JSONL; streamed tool/file/usage events and abort are available. | Start/resume threads, but the simple execution SDK is not the app-server's interactive approval broker. | Node 18+ for TS; Python 3.10+ for Python; bundled binaries make installs large. Pin package and binary provenance. | Automation fallback only; do not downgrade the UI to it. |
| Claude Agent SDK | Official Anthropic SDKs, both still `0.x`. Python repo code is MIT but use is subject to Anthropic terms; TypeScript repository license is all-rights-reserved/commercial terms. | In-process async API backed by bundled Claude Code binary. Streaming input/output, hooks, tool callbacks, user questions, interrupt. `claude -p` offers JSON/stream-json headless fallback. | Local JSONL sessions, continue/resume/fork; filesystem checkpoints are limited to SDK edit tools. Tool policy plus `canUseTool`; TS can defer a decision for later, Python currently cannot. | Python 3.10+/Node 18+; official packages bundle macOS/Linux/Windows binaries. Container/process isolation recommended. Medium risk. | **Second direct adapter.** Prefer streaming SDK client; use headless only for noninteractive jobs. |
| Hermes ACP | Hermes is MIT and active but pre-1.0. | ACP JSON-RPC stdio with messages, plans, tool calls, diffs, cancellation, auth, and permissions. | Capability-dependent; Hermes approval supports once/session/always/deny and fails closed on timeout. Verify whether persistence survives the active ACP process for the installed version. | Tier-1 macOS Apple Silicon, Windows, Linux/WSL2, Docker; macOS Intel unsupported. Official remote installer may install Python/uv/Node/ripgrep/ffmpeg/Git Bash: high unattended-install risk. | Use through shared ACP adapter; pin a release and do not run the remote installer automatically. |
| Hermes run-control API / TUI gateway | Official Hermes-specific interfaces, pre-1.0. | HTTP/REST + SSE Runs API, or custom JSON-RPC over stdio/WebSocket. Runs expose status/events/stop/approval; gateway adds steer/follow-up/clarify/sudo/secret and rich tool events. | Hermes persists sessions in SQLite; REST exposes session/history/fork/chat. Run events support attach/detach. | Bind default loopback only; current API requires a bearer key even on loopback. Same binary/install risk as Hermes. | Add only for durable HTTP attach or Hermes-only controls that ACP lacks. |
| Kimi Code ACP | Official MoonshotAI repository, Apache-2.0, active 1.x releases. | `kimi acp` is multi-session JSON-RPC stdio; streams message/thought, plan, tool, diff/result and cancellation. | Current implementation advertises load/list/resume. Current source leaves ACP fork unimplemented and does not support `AskUserQuestion` over ACP. Permission choices include once/session/reject. | Official assets for macOS/Linux/Windows x64/arm64; Windows requires Git Bash. Remote installer validates checksums, but prefer pinned asset/checksum. Medium risk. | Use through ACP, with explicit no-fork/no-general-elicitation capabilities. |
| Kimi print `stream-json` | Official fallback. | One-shot input/output JSONL. | Print/AFK behavior auto-approves tool calls and dismisses questions. | Same CLI. | **Reject for mediated production chat.** Allow only inside an isolated, pre-authorized automation profile. |
| Antigravity Python SDK | Official Google repository, Apache-2.0, `0.1.x` and classified Alpha. PyPI wheels include a compiled local harness. | Async Agent/Conversation API, streaming text/thought/tool calls, lifecycle hooks, custom tools, MCP, policies, structured human input. | Stateful in-process conversation; reviewed docs do not establish durable cross-process resume/event replay equivalent to Codex app-server. Default is read-only; policies can deny/allow/ask. | Python 3.10+. Current wheels cover Windows x64/arm64, Linux x64/arm64, and macOS Apple Silicon—not macOS Intel. Trusted Publishing/provenance is present. Medium risk. | Official programmable Antigravity path, but feature-gate until Alpha conformance passes. |
| Antigravity CLI headless | Official Google commercial service surface; the CLI repository displays no OSS license grant and use is governed by Antigravity terms. Current docs show 1.x. | `agy -p --output-format stream-json` emits init, step updates, and exactly one result; tool calls/subagents/usage are visible. | Conversation ID plus continue/specific resume. No bidirectional mid-turn approval: Ask operations are soft-denied and can still yield exit 0; skip-permissions is dangerous. | Native macOS/Linux/Windows. Official installation commands pipe remote scripts into shells and may modify PATH/aliases: high unattended-install risk. | Restricted fallback. Parse terminal status, not exit code alone. No unofficial OAuth/protocol bridge. |
| Antigravity 2.0 / IDE | Official desktop/IDE products. | Rich native artifacts and review UX, but no supported programmatic runtime-control API was found in the reviewed official docs. | Native product manages conversations/artifacts internally. | Desktop install, user sign-in, commercial terms. | Do not automate UI or private endpoints. Use SDK or documented CLI only. |

### Codex details

The [app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) says it powers rich clients such as the Codex VS Code extension. Its default transport is newline-delimited JSON over stdio; WebSocket and Unix-socket/WebSocket transports are experimental. A client must initialize, then can operate Thread, Turn, and Item primitives. The API includes thread start/resume/fork/read/list, turn start/steer/interrupt, authentication flows, and bidirectional approval requests. It can generate version-matched stable TypeScript or JSON Schema; experimental fields are opt-in. Queue overload is explicit and retryable rather than silent.

The official [TypeScript SDK](https://github.com/openai/codex/blob/main/sdk/typescript/README.md) spawns the CLI and persists sessions under the Codex home directory; its streamed run surface includes tool calls, file changes, and usage. The [Python SDK](https://github.com/openai/codex/blob/main/sdk/python/README.md) similarly bundles a platform binary. These are excellent for backend automation, but CutSteward needs app-server requests for interactive approvals and steering. Prefer stdio; do not expose the experimental WebSocket directly to a browser renderer.

### Claude details

The [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) distinguishes the local agent loop from a raw Messages API. The preferred [streaming input mode](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) keeps a long-lived client for interrupts, permission requests, and multi-turn input; the async output stream yields typed messages. [Sessions](https://code.claude.com/docs/en/agent-sdk/sessions) persist locally as JSONL and support continue/resume/fork, but preserve conversation context rather than filesystem state. An optional [external session store](https://code.claude.com/docs/en/agent-sdk/session-storage) mirrors local writes best-effort; failed mirror batches are not automatically retried.

Permissions have an important semantic trap: `allowedTools` pre-approves matching tools; it does not by itself remove all other tools. Combine modes, denies, hooks, and [`canUseTool`](https://code.claude.com/docs/en/agent-sdk/permissions) to implement the intended boundary. The [user-input API](https://code.claude.com/docs/en/agent-sdk/user-input) carries both tool approvals and structured questions. TypeScript supports deferred hook decisions; Python does not. [`claude -p`](https://code.claude.com/docs/en/headless) supports JSON and streaming JSON with session IDs and is a valid batch fallback, not the richest interactive path.

License due diligence must distinguish SDK repositories: [Python SDK license](https://github.com/anthropics/claude-agent-sdk-python/blob/main/LICENSE) is MIT while its README states service use is governed by commercial terms; the [TypeScript SDK license](https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/LICENSE.md) itself points to Anthropic commercial terms. Do not describe both packages simply as MIT.

### Hermes details

Hermes documents three programmatic surfaces over the same core in its [integration guide](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/programmatic-integration.md): ACP, a custom TUI gateway, and an HTTP API server. The [ACP guide](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/acp.md) documents sessions, live messages/tool calls, permission decisions, cancellation, auth, and diffs. The [API server guide](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md) documents loopback default, bearer authentication, OpenAI-shaped chat/responses, session REST, and a Runs API with SSE events, approval, status, and stop.

Use ACP for the minimal common adapter. Use the run API only when detach/reattach and durable HTTP orchestration materially help the product. Do not make a stateless `/v1/chat/completions` call and label it session control. Hermes' [platform support](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/platform-support.md) and installer footprint justify a user-approved, pinned install rather than executing its bootstrap script from CutSteward. Its [security guide](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/security.md) also distinguishes approval modes from real isolation; a local terminal without Docker/OS containment is not sandboxed.

### Kimi details

Kimi's official [`kimi acp` reference](https://moonshotai.github.io/kimi-cli/en/reference/kimi-acp.html) describes the stdio child process and authentication preflight. Current [server source](https://github.com/MoonshotAI/kimi-cli/blob/main/src/kimi_cli/acp/server.py) is the authoritative capability check: it advertises load/list/resume and multimodal prompt support, while fork is not implemented. Current [ACP session source](https://github.com/MoonshotAI/kimi-cli/blob/main/src/kimi_cli/acp/session.py) streams plans/messages/tools and permission requests but explicitly lacks `AskUserQuestion` support. Reflect both gaps in `probe()`.

Kimi's persisted [sessions](https://moonshotai.github.io/kimi-code/en/guides/sessions.html) store state and wire history locally. Exported session archives may contain sensitive logs. Its [print mode](https://moonshotai.github.io/kimi-cli/en/customization/print-mode.html) uses streaming JSON but implicitly enters AFK behavior, auto-approving tools and dismissing questions; that disqualifies it from a user-mediated production UI.

### Antigravity details

Google's [SDK overview](https://antigravity.google/docs/sdk/overview) and [Apache-2.0 repository](https://github.com/google-antigravity/antigravity-sdk-python) expose the intended programmable surface: local Agent/Conversation, streaming tool and thought channels, deny/allow/ask policies, lifecycle hooks, custom tools, and structured human-in-the-loop behavior. The package is explicitly [Alpha in `pyproject.toml`](https://github.com/google-antigravity/antigravity-sdk-python/blob/main/pyproject.toml), and its platform wheels contain a compiled harness. Use a project-local virtual environment, a pinned hash, and the documented API-key or enterprise credential flow.

The official [headless CLI contract](https://antigravity.google/docs/cli/headless) is much better than screen scraping: diagnostics go to stderr; stdout can be NDJSON; an init record precedes step updates and one result; conversation IDs can resume later. But headless permissions are policy-only: actions needing an interactive Ask are soft-denied, and the process may exit zero. Consequently it cannot surface a live approval request to CutSteward. The interactive TUI has robust [permissions](https://antigravity.google/docs/cli/permissions), [OS sandboxing](https://antigravity.google/docs/cli/sandbox), and [artifact review](https://antigravity.google/docs/cli/artifacts), but those UI interactions are not documented as a programmatic protocol.

The [Antigravity terms](https://antigravity.google/terms) explicitly prohibit third-party tools using Antigravity OAuth or otherwise accessing the service outside allowed product mechanisms. Do not adopt community ACP bridges that retarget private Google backends or reuse Antigravity OAuth. The official SDK and documented CLI are the only recommended local paths. Google's [Managed Agents](https://ai.google.dev/gemini-api/docs/agents) are a separate public-preview, pay-as-you-go remote Linux sandbox with its own interaction API, retention, network, and upload implications; it is not a local CutSteward adapter.

## Bridges and gateways

| Candidate | Verified role | Recommendation |
| --- | --- | --- |
| [`agentclientprotocol/codex-acp`](https://github.com/agentclientprotocol/codex-acp) | Apache-2.0 ACP-organization bridge. Starts Codex app-server, maps requests/events, bundles a compatible Codex dependency, and exposes auth, approval/sandbox config, diffs, terminals, usage, subagents, and provider metadata. | Strong compatibility path after direct Codex app-server. Pin package and bundled Codex together; do not use `npx -y` in production. |
| [`agentclientprotocol/claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp) | Apache-2.0 ACP-organization bridge over the official Claude Agent SDK, with permission requests, edits, terminals, MCP, and nested-subagent extension metadata. It is not an Anthropic protocol endpoint. | Strong compatibility path for one ACP frontend, but direct SDK remains preferable for complete provider controls and clearer support boundaries. |
| [`coder/agentapi`](https://github.com/coder/agentapi) | MIT HTTP wrapper for many TUIs. Runs an in-memory terminal emulator, translates API calls into keystrokes, and parses screen output; exposes only messages, status, and SSE. Current release line is `0.12.x`. | **Reject for production control.** Useful for demos or an unsupported last-resort viewer. Screen parsing cannot prove typed approvals, tool identity, acceptance, cancellation, or durable sessions. |
| [`agentgateway/agentgateway`](https://github.com/agentgateway/agentgateway) | Apache-2.0 Linux Foundation proxy for LLM, MCP, and A2A traffic with auth, RBAC, rate limits, guardrails, and telemetry. Current release line is `1.4.x`. | Useful later as a remote MCP/A2A policy edge. It does not launch or normalize local coding-agent CLIs and is not a replacement for CutSteward adapters. |
| ACP Registry | Apache-2.0 curated metadata/distribution repository; individual agents retain their own licenses. | Useful for discovery only after allowlisting publishers, versions, hashes, targets, and expected capabilities. Registry presence is not trust or conformance. |

No bridge should be allowed to turn a provider's browser/OAuth session into an unofficial backend API. A bridge adds another release, parser, package manager, and security principal; prefer vendor-native surfaces when they exist.

## Installation, platform, and security policy

CutSteward should discover runtimes but never silently install them. Installation may require sign-in, provider terms, large native binaries, package-manager mutation, or remote scripts. The UI should display an exact, user-run command or verified asset choice and then re-probe.

Required policy:

1. Maintain a provider manifest with package/repository, exact version, artifact URL, checksum/signature/provenance, supported OS/architecture, license/terms URL, expected executable, and protocol feature set.
2. Prefer project-local packages or a CutSteward-owned runtime directory. Never install global packages. Never execute `curl | sh`, `irm | iex`, or a mutable `npx -y` package from the application.
3. Resolve the executable path once, verify it is a regular file outside the workspace's untrusted writable content, hash it, then launch without a shell. Re-probe after any change.
4. Keep provider credentials in the provider's supported keychain/runtime or inherited secret store. Do not copy tokens into CutSteward data, logs, session exports, CLI arguments, or MCP config. Pause for login, MFA, CAPTCHA, or enterprise policy.
5. Bind any local HTTP surface to `127.0.0.1`/`::1`, authenticate it, validate Host/Origin, use a random per-launch secret, and never expose it to the renderer or LAN directly. CutSteward's backend should broker it.
6. Treat provider text, Markdown, paths, terminal output, diffs, URLs, images, and artifact metadata as untrusted. Escape rendering, disable arbitrary HTML, redact credentials, and cap storage.
7. Approval display must show provider, session, workspace, normalized tool class, exact command/path/domain, sandbox state, persistence scope, and any provider warning. “Always” must never silently broaden beyond the provider's represented scope.
8. Run risky agents in OS/container/worktree isolation where supported. Permission prompts are policy, not containment.
9. Record an append-only audit trail of prompts, accepted receipts, approvals, interrupts, native IDs, normalized events, executable hash/version, and terminal outcome. Encrypt or redact sensitive fields and define retention.

Platform notes are release-specific. Upstream vendors publish broader desktop artifacts, but CutSteward admits and tests only macOS and Windows. Hermes excludes Intel macOS, Kimi Windows relies on Git Bash, and the current Antigravity SDK wheel set excludes Intel macOS. The application must test the exact supported OS/architecture asset instead of displaying a brand-wide “supported” badge.

## Conformance gate before an adapter is labeled supported

Run the same black-box suite against every pinned runtime version:

1. Probe version/capabilities with clean stdout and no authentication leak.
2. Create a session in a temporary workspace and prove the working-directory boundary.
3. Stream a multi-delta response and a plan without duplicate text.
4. Request a harmless tool approval, deny it, and prove the tool did not run.
5. Approve once, then prove a second call asks again; test persistent scope separately.
6. Run a command that emits stdout/stderr and exits nonzero; preserve output and failure.
7. Produce a file diff and staged media artifact; reject traversal, symlink escape, oversize, and MIME mismatch.
8. Interrupt during model output and during a tool call; obtain one terminal event and no post-terminal updates.
9. Crash the child/stream after acceptance; reconnect only using documented load/resume semantics and do not duplicate the turn.
10. Restart CutSteward and the runtime; verify what persists, whether history replays, and whether event cursors exist.
11. Fork where advertised and prove the original conversation remains unchanged while the filesystem is explicitly *not* assumed isolated.
12. Test malformed/oversize protocol records, backpressure, approval timeout, auth expiry, and provider upgrade mismatch.

An adapter is `experimental` until this suite passes on each supported macOS/Windows OS/architecture pair. Unsupported optional capability rows should degrade visibly, not be emulated with terminal keystrokes.

## Claims CutSteward should not make

- “Any MCP server is an agent we can chat with.” False: ordinary MCP exposes tools/context, not an agent loop.
- “Any MCP-capable agent can be controlled over MCP.” False: MCP client support points in the opposite direction.
- “ACP means every lifecycle feature is present.” False: capabilities are optional; Kimi currently demonstrates real fork/elicitation gaps.
- “Resume restores the project.” False: providers restore conversation context; file/worktree state is separate.
- “A streamed final text means the job succeeded.” False: terminal status, tool failures, cancellation, artifacts, and provider errors decide the outcome.
- “Headless JSON is interactive.” False: Kimi auto-approves in print mode, while Antigravity soft-denies Ask actions.
- “Agentgateway controls local coding agents.” False: it is an MCP/A2A/LLM proxy.
- “Antigravity IDE has an integration API.” Not established by reviewed official documentation; use its SDK or documented CLI.
- “A community OAuth bridge is acceptable.” False for Antigravity under the reviewed terms, and unsafe generally without vendor authorization.

## Primary source index

### Protocols

- ACP: [spec/repository](https://github.com/agentclientprotocol/agent-client-protocol), [architecture](https://agentclientprotocol.com/get-started/architecture), [v1 transport](https://agentclientprotocol.com/protocol/v1/transports), [session lifecycle](https://agentclientprotocol.com/protocol/v1/session-setup), [permissions/tools](https://agentclientprotocol.com/protocol/v1/tool-calls), [registry](https://github.com/agentclientprotocol/registry)
- MCP: [2026-07-28 release](https://blog.modelcontextprotocol.io/posts/2026-07-28/), [specification](https://modelcontextprotocol.io/specification/2026-07-28), [sessionless design](https://modelcontextprotocol.io/seps/2567-sessionless-mcp), [repository/license](https://github.com/modelcontextprotocol/modelcontextprotocol)
- A2A: [repository/releases](https://github.com/a2aproject/A2A), [v1 specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)

### Runtimes

- Codex: [repository/releases/license](https://github.com/openai/codex), [app-server](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md), [TypeScript SDK](https://github.com/openai/codex/tree/main/sdk/typescript), [Python SDK](https://github.com/openai/codex/tree/main/sdk/python), [experimental agent MCP](https://github.com/openai/codex/blob/main/codex-rs/docs/codex_mcp_interface.md)
- Claude: [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), [hosting/platforms](https://code.claude.com/docs/en/agent-sdk/hosting), [sessions](https://code.claude.com/docs/en/agent-sdk/sessions), [permissions](https://code.claude.com/docs/en/agent-sdk/permissions), [headless CLI](https://code.claude.com/docs/en/headless), [Python repository](https://github.com/anthropics/claude-agent-sdk-python), [TypeScript repository](https://github.com/anthropics/claude-agent-sdk-typescript)
- Hermes: [repository/releases/license](https://github.com/NousResearch/hermes-agent), [programmatic integration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/programmatic-integration.md), [ACP](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/acp.md), [API server/run control](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md), [sessions](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/sessions.md), [security](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/security.md)
- Kimi: [repository/releases/license](https://github.com/MoonshotAI/kimi-cli), [ACP reference](https://moonshotai.github.io/kimi-cli/en/reference/kimi-acp.html), [ACP server source](https://github.com/MoonshotAI/kimi-cli/blob/main/src/kimi_cli/acp/server.py), [ACP session source](https://github.com/MoonshotAI/kimi-cli/blob/main/src/kimi_cli/acp/session.py), [print mode](https://moonshotai.github.io/kimi-cli/en/customization/print-mode.html), [installation/platforms](https://moonshotai.github.io/kimi-code/en/guides/getting-started.html)
- Antigravity: [CLI repository/releases](https://github.com/google-antigravity/antigravity-cli), [CLI install/platforms](https://antigravity.google/docs/cli/install), [headless contract](https://antigravity.google/docs/cli/headless), [SDK repository/license](https://github.com/google-antigravity/antigravity-sdk-python), [SDK package/provenance/platform wheels](https://pypi.org/project/google-antigravity/), [terms](https://antigravity.google/terms), [Managed Agents](https://ai.google.dev/gemini-api/docs/agents)
