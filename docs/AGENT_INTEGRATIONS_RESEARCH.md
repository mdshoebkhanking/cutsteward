# Agent runtime integrations and portable repository bootstrap

Research date: 2026-08-08. Scope: official product documentation, official vendor blogs, and official GitHub repositories only.

## Executive conclusion

There is no truthful universal protocol shared by Hermes Agent, Claude Code, Codex, Kimi Code CLI, and Google Antigravity. They can all work on a repository, but their supported embedding surfaces differ. The product should therefore:

1. make the repository self-bootstrapping through checked-in instructions and one idempotent bootstrap command;
2. implement versioned, capability-probed adapters for in-app orchestration; and
3. offer a documented bridge contract for future runtimes instead of labeling arbitrary CLIs or “OpenAI-compatible” endpoints compatible.

Two names are ambiguous:

- **Hermes** is assumed here to mean [Nous Research Hermes Agent](https://github.com/NousResearch/hermes-agent), not the Hermes model family. Confirm this with the user before implementing its adapter.
- **Google Antigravity** now names a family of distinct surfaces: the Antigravity IDE/agentic development platform, the `agy` Antigravity CLI, a Python SDK, and a hosted Antigravity Managed Agent in the Gemini API. These are not interchangeable. Google introduced the IDE as an editor/manager/browser agent platform, then announced the CLI, SDK, and Managed Agents with Antigravity 2.0. ([launch post](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/), [Google I/O 2026 announcement](https://developers.googleblog.com/all-the-news-from-the-google-io-2026-developer-keynote/), [Gemini CLI transition](https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/))

## Capability matrix

Legend: “agent MCP” means an MCP server that starts/continues agent conversations. “MCP client” only means the runtime can call external tools.

| Runtime | Supported programmable surfaces | Auth | Events and continuation | Permissions, files, browser | Important limits |
|---|---|---|---|---|---|
| **Nous Hermes Agent** | Documented embedded/one-shot Python use; CLI; OpenAI-shaped HTTP endpoints; run-control REST/SSE; a WebSocket JSON-RPC gateway; agent MCP server; and ACP over stdio. ([programmatic integration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/programmatic-integration.md), [API server](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md), [MCP](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md), [ACP](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/acp.md)) | The agent authenticates to its configured model provider; server/gateway authentication is deployment/configuration-specific. Do not assume that a locally exposed endpoint is safe to bind publicly. | Run-control and gateway surfaces stream message, tool, approval, clarification, secret/sudo, and lifecycle events. Hermes persists conversations and can resume them. ([programmatic integration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/programmatic-integration.md), [sessions](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/sessions.md)) | Approval modes and terminal isolation are configurable. Workspace files are native agent inputs/outputs. A real browser tool is available only when a supported CDP/cloud-browser backend is configured and reachable. ([security](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/security.md), [toolsets](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/toolsets-reference.md)) | “OpenAI-compatible” describes request shape, not full behavioral equivalence. MCP is currently stdio-oriented and some sends are text-only; probe the installed version and exact transport. Hermes project context has its own precedence rules. |
| **Claude Code / Claude Agent SDK** | First-class Python and TypeScript Agent SDKs; noninteractive `claude -p` CLI with JSON or JSONL streaming. The direct Anthropic Messages API is a model API, not a resumable Claude Code runtime. Anthropic also has a separate hosted **Managed Agents** beta REST API. ([SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), [SDK quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart), [headless CLI](https://code.claude.com/docs/en/headless), [Managed Agents sessions](https://platform.claude.com/docs/en/managed-agents/sessions)) | SDK embedding normally uses `ANTHROPIC_API_KEY` or an officially supported cloud provider. Anthropic says third parties may not offer Claude.ai subscription login/rate limits unless approved. The local CLI additionally supports Claude.ai login, API credentials, Bedrock, Vertex, Foundry, and gateways. ([SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), [authentication](https://code.claude.com/docs/en/authentication)) | SDK async iterators and CLI `stream-json` provide messages, partial API events, tool activity, result, and session IDs. Sessions can continue, resume by ID, or fork, but persisted conversation state does not itself restore arbitrary filesystem state. ([streaming](https://code.claude.com/docs/en/agent-sdk/streaming-output), [sessions](https://code.claude.com/docs/en/agent-sdk/sessions), [CLI reference](https://code.claude.com/docs/en/cli-reference)) | SDK exposes allow/deny/ask modes, callbacks, and hooks. `allowedTools` preapproves tools; it is not by itself a lockdown, so combine it with `dontAsk`/deny rules or a `PreToolUse` hook. Files and shell are built in. Claude in Chrome can visibly navigate, click, type, upload, and use logged-in sessions, but requires an eligible direct Anthropic login, extension/site permissions, and manual handling of login/CAPTCHA. ([permissions](https://code.claude.com/docs/en/agent-sdk/permissions), [Chrome](https://code.claude.com/docs/en/chrome)) | `claude mcp serve` exposes Claude Code's **tools**, not a Claude agent/session invocation API; do not register it as an agent MCP adapter. No supported Claude Code app-server/JSON-RPC, ACP, or A2A surface is documented. `--bare` intentionally omits hooks, skills, plugins, MCP, memory, and project instructions. Hosted Managed Agents is a separate beta product and does not imply Claude Code session interoperability. ([MCP](https://code.claude.com/docs/en/mcp), [headless CLI](https://code.claude.com/docs/en/headless)) |
| **OpenAI Codex** | TypeScript `@openai/codex-sdk`; beta Python `openai-codex`; `codex exec`; local `codex app-server`; and an agent MCP server with `codex` and `codex-reply` tools. ([SDK](https://developers.openai.com/codex/sdk/), [noninteractive mode](https://developers.openai.com/codex/noninteractive/), [app server](https://developers.openai.com/codex/app-server/), [MCP server](https://developers.openai.com/codex/mcp-server/)) | Local surfaces can reuse Codex/ChatGPT login. `CODEX_API_KEY` is supported for `codex exec`; API-key auth is the recommended automation path. App-server also exposes explicit ChatGPT browser/device login flows. ([noninteractive mode](https://developers.openai.com/codex/noninteractive/), [app server](https://developers.openai.com/codex/app-server/)) | `codex exec --json` emits JSONL thread/turn/item/error events and can resume a session ID. SDKs start/resume threads. App-server provides `thread/start`, resume and fork; turn start/steer/interrupt; item deltas; tool output; diffs; usage; and terminal status. ([noninteractive mode](https://developers.openai.com/codex/noninteractive/), [SDK](https://developers.openai.com/codex/sdk/), [app server](https://developers.openai.com/codex/app-server/)) | Sandboxes include read-only, workspace-write, and full access. App-server mediates command, file-change, network, MCP-elicitation, and newer permission requests. Inputs include text, remote image URLs, and local image paths; workspace edits are outputs. Codex can use browser tools through configured Playwright/Chrome DevTools MCP servers, but browser control is not guaranteed by core Codex. ([app server](https://developers.openai.com/codex/app-server/), [MCP client](https://developers.openai.com/codex/mcp/)) | App-server uses a JSON-RPC-like protocol without the `jsonrpc` header. Its WebSocket transport and some APIs are experimental; generate schemas for the installed version. No first-party ACP/A2A surface is documented. Do not equate the OpenAI Responses API with a resumable Codex CLI/app-server thread. |
| **Kimi Code CLI** | Local interactive CLI; noninteractive print mode with JSON/`stream-json`; and an official ACP stdio server. It is an MCP **client**. No official versioned Kimi Code Agent SDK, agent HTTP service, or app-server should be inferred from Moonshot's model API. ([getting started](https://moonshotai.github.io/kimi-cli/en/guides/getting-started.html), [print mode](https://moonshotai.github.io/kimi-cli/en/customization/print-mode.html), [ACP](https://moonshotai.github.io/kimi-code/en/reference/kimi-acp.html), [official repository](https://github.com/MoonshotAI/kimi-cli)) | Kimi Code login opens browser OAuth; alternate providers use their API keys/configuration. Credentials remain user-managed by the CLI. ([getting started](https://moonshotai.github.io/kimi-cli/en/guides/getting-started.html), [CLI reference](https://moonshotai.github.io/kimi-cli/en/reference/kimi-command.html)) | `stream-json` supplies JSONL input/output. ACP is the better interactive embedding surface because it supports multi-session agent operation and protocol capabilities. Current releases persist sessions and print resume hints/IDs; capability-probe the installed version before promising crash recovery. ([print mode](https://moonshotai.github.io/kimi-cli/en/customization/print-mode.html), [ACP](https://moonshotai.github.io/kimi-code/en/reference/kimi-acp.html), [changelog](https://moonshotai.github.io/kimi-cli/en/release-notes/changelog.html)) | The CLI works on local files and terminal commands and supports permission configuration. Browser automation is possible through a configured browser MCP server, not a universal native guarantee. | Print mode automatically enters unattended/AFK behavior and auto-approves tools; it cannot back an interactive approval UX. Use ACP for mediated runs, or run print mode only inside an explicit sandbox. Branding/docs are transitioning from “Kimi CLI” to “Kimi Code”; pin and probe the binary version. ([print mode](https://moonshotai.github.io/kimi-cli/en/customization/print-mode.html)) |
| **Google Antigravity** | **IDE:** interactive agent platform, no documented supported remote-control API. **CLI:** `agy` TUI plus noninteractive `-p` JSON/`stream-json`. **SDK:** official Python SDK with Agent/Conversation/Connection layers. **Hosted:** Gemini API Managed Agent through the beta Interactions API using the predefined Antigravity agent. ([IDE launch](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/), [CLI repository](https://github.com/google-antigravity/antigravity-cli), [SDK repository](https://github.com/google-antigravity/antigravity-sdk-python), [Managed Agents](https://ai.google.dev/gemini-api/docs/agents), [quickstart](https://ai.google.dev/gemini-api/docs/managed-agents-quickstart)) | CLI/IDE use Google account eligibility/login. Gemini API Managed Agents use a Gemini API key in `x-goog-api-key`; SDK connection auth depends on the selected local/hosted connection. | CLI current releases stream JSON events and persist conversations, with continue/resume/fork support. Python SDK exposes stateful conversations and streaming steps/tokens/tool calls. Managed Agents stores an interaction/environment ID for continuation and supports streamed interaction events and sandbox file retrieval. ([CLI conversations](https://antigravity.google/docs/cli-conversations), [SDK repository](https://github.com/google-antigravity/antigravity-sdk-python), [Managed Agents quickstart](https://ai.google.dev/gemini-api/docs/managed-agents-quickstart), [API reference](https://ai.google.dev/api/agents)) | IDE/CLI have project-scoped permissions; CLI supports allow/ask/deny for files, shell, URL reads/actions, and MCP, plus sandbox modes and artifact review. The IDE was designed to operate editor, terminal, and browser. Hosted Managed Agents run in a remote Linux sandbox and can return downloadable files; do not assume the local interactive approval UX is reproduced by the hosted API. ([permissions](https://www.antigravity.google/docs/cli-permissions), [projects](https://antigravity.google/docs/projects?app=cli), [IDE launch](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/)) | Antigravity 2.0 surfaces are preview/beta and evolving. The CLI changelog is part of the compatibility contract; pin/probe versions. No official ACP endpoint is documented for `agy` as of this research date. Do not automate the IDE through UI scraping when CLI/SDK/API is intended. ([CLI changelog](https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md)) |

## Recommended normalized adapter contract

Normalize only semantics that a provider explicitly supports. Record all other properties as unsupported or unknown.

```ts
type Support<T> =
  | { state: "supported"; stability: "stable" | "beta" | "experimental"; value: T }
  | { state: "unsupported" }
  | { state: "unknown"; reason: string };

interface AgentRuntimeAdapter {
  probe(connection: Connection, signal: AbortSignal): Promise<Capabilities>;
  start(request: StartRequest, signal: AbortSignal): Promise<AgentRun>;
  recover(receipt: DurableReceipt, signal: AbortSignal):
    Promise<AgentRun | "unsupported" | "ambiguous">;
}

interface AgentRun {
  events(after?: EventCursor): AsyncIterable<AgentEvent>;
  control(command: ApprovalDecision | UserReply | Steer | Interrupt): Promise<void>;
}

type AgentEvent =
  | { type: "accepted"; receipt: DurableReceipt }
  | { type: "message.delta"; text: string }
  | { type: "message.final"; text: string }
  | { type: "tool.started" | "tool.progress" | "tool.completed"; data: unknown }
  | { type: "file.changed"; path: string; patch?: string }
  | { type: "approval.requested"; id: string; scope: unknown }
  | { type: "user-input.requested"; id: string; prompt: string }
  | { type: "artifact"; artifact: StagedArtifact }
  | { type: "usage"; usage: unknown }
  | { type: "completed" | "failed" | "interrupted"; data?: unknown };
```

Required invariants:

- The capability record is tied to runtime name, exact version, transport, and connection fingerprint. Probe again after upgrades.
- `start` selects new/resume/fork/continue-latest explicitly; never silently substitute one for another.
- Emit `accepted` as soon as the provider returns a durable session/turn/job identifier. Exactly one terminal event follows, with no later events.
- `recover` means recover the same paid operation. If submission succeeded but no durable receipt/status API exists, return `ambiguous`; never auto-resubmit.
- Approvals are typed, scoped decisions. “Auto-approve all” is a distinct unsafe capability, not an implementation of interactive approval.
- Attachments are copied or uploaded as immutable, hashed objects. A local path is not a portable attachment. Downloaded provider files are quarantined, size/MIME checked, hashed, and promoted to local artifact storage.
- Browser support is an explicit enum: `none`, `search-fetch`, `attached-visible-browser`, `remote-browser-tool`. A provider being an MCP client does not prove that a browser MCP is installed.
- Keep provider-native diagnostic payloads for logs, but orchestration logic must not branch on undocumented fields.

The probe should report transport (`sdk`, `subprocess-jsonl`, `jsonrpc`, `acp`, `agent-mcp`, `http`, `attached-browser`), session creation/resume/fork/durability, event replay/cursors, interrupt/steer/approval/user-input controls, sandbox and deny capabilities, input/output artifact modes, browser mode, and recovery/idempotency semantics.

## Connection UX categories

1. **Local SDK runtime** — select installed/bundled library and binary, workspace, provider credential, sandbox, and runtime version.
2. **Local CLI subprocess** — select executable, working directory, JSONL mode, login source, and unattended policy. Warn when the mode auto-approves tools.
3. **Local protocol service** — choose app-server JSON-RPC, ACP, or an agent-capable MCP server. Do not present a tool-only MCP server as an agent.
4. **Hosted agent API** — configure API key/workload identity, region/endpoint, retention, remote sandbox, and upload policy; show beta/preview status.
5. **Attached browser session** — show the browser/profile and allowed sites; require the human to handle login, MFA, CAPTCHA, or consent.
6. **Custom bridge** — a future runtime implements this product's versioned HTTP/streaming adapter contract. Configuration alone cannot make an arbitrary proprietary agent compatible.

After probing, display capability chips such as **resume**, **fork**, **live events**, **replay**, **approvals**, **artifacts**, **browser**, **interrupt**, and **experimental**. Disable unsupported controls and show the provider-specific reason.

## Portable self-bootstrap handoff contract

The primary user flow is: hand the repository folder to any supported coding agent and say “setup and run.” This should not depend on an in-app adapter.

### Instruction discovery and thin shims

Use a short root `AGENTS.md` as the canonical, vendor-neutral handoff:

- Codex loads `AGENTS.md` from project root toward the working directory. ([Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md))
- Kimi Code loads hierarchical `AGENTS.md` and `.kimi/AGENTS.md`; its `/init` creates an `AGENTS.md`. ([getting started](https://moonshotai.github.io/kimi-cli/en/guides/getting-started.html), [agent context](https://moonshotai.github.io/kimi-cli/en/customization/agents.html))
- Hermes recognizes `.hermes.md`, `AGENTS.md`, `CLAUDE.md`, and `.cursorrules`; because `.hermes.md` has higher priority, omit it unless it intentionally replaces the shared instructions. ([Hermes context files](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/context-files.md))
- Antigravity CLI preserves workspace rules in `AGENTS.md` and `GEMINI.md`. The IDE's workspace rules live under `.agents/rules` and can reference another file with `@`; add a thin `.agents/rules/00-repository.md` that points to `@AGENTS.md` if IDE discovery must be guaranteed. ([CLI migration](https://antigravity.google/docs/gcli-migration), [IDE rules](https://antigravity.google/docs/ide-rules))
- Claude Code reads `CLAUDE.md`, not `AGENTS.md`. Add a root `CLAUDE.md` containing `@AGENTS.md` plus only Claude-specific notes; Anthropic explicitly recommends this shim. ([Claude memory/instructions](https://code.claude.com/docs/en/memory))

Do not duplicate the full instructions across five files: they will drift. Keep the canonical file concise and put detailed operator documentation in a referenced `docs/BOOTSTRAP.md` if needed.

### What `AGENTS.md` should require

The repository should expose one documented, idempotent command, for example `./scripts/bootstrap` (plus `scripts/bootstrap.ps1` on Windows), that performs the same steps a careful human would:

1. inspect the platform and report missing prerequisites without modifying global state;
2. install locked project dependencies locally using the committed lockfile;
3. create only non-secret local config/data from committed examples;
4. run migrations/initialization idempotently;
5. start the server on loopback, recording a PID/log file in an ignored runtime directory;
6. poll a bounded `/api/health` check and fail with useful log paths;
7. optionally open the returned URL with the OS browser, and always print it as a fallback; and
8. offer separate `status`, `stop`, and `doctor` commands.

The instructions must also say: preserve user changes; never delete data to fix startup; never invent secrets; never bind to `0.0.0.0` by default; never run a remote `curl | sh` installer without explicit approval; and stop after a bounded timeout rather than leaving an unknown background process.

The app itself should boot into a useful setup screen without provider keys. Missing model credentials should make provider health `degraded`, not prevent the local UI from starting.

### Honest per-tool expectations

| Tool | What the repository can promise |
|---|---|
| Hermes Agent | Root `AGENTS.md` is discoverable if a higher-priority `.hermes.md` is absent. Terminal/browser actions still follow the user's Hermes toolset, approvals, and backend configuration. |
| Claude Code | `CLAUDE.md` can import the shared instructions. Install/network/shell and Chrome actions may prompt; Chrome automation is unavailable for some auth/provider modes. |
| Codex | Root `AGENTS.md` is native. Dependency installation and browser opening remain constrained by selected sandbox, approval, and network settings; a printed loopback URL is the reliable fallback. |
| Kimi Code | Root `AGENTS.md` is native. Interactive mode can mediate permissions; print mode auto-approves tools, so do not recommend it for first-time bootstrap outside a sandbox. |
| Antigravity | CLI can read `AGENTS.md`; the IDE gets a thin workspace-rule shim. Project permissions may ask for shell and URL/browser operations. Hosted Managed Agents are remote sandboxes and are not a substitute for starting a local desktop UI. |

No instruction file is a security boundary, and no repository can guarantee that every runtime will silently install packages, persist a background service, or open a graphical browser. The robust success criterion is: **server healthy, exact local URL printed, clear next action if opening the browser is unavailable**.

## Implementation order

1. Ship and test the desktop bootstrap contract on macOS and Windows.
2. Add Codex app-server/SDK and Claude Agent SDK adapters first; both have structured supported embedding APIs and mediated permissions.
3. Add Hermes ACP or run-control adapter and Kimi ACP adapter, pinned to tested versions.
4. Treat Antigravity CLI, Python SDK, and Gemini Managed Agent as three separate adapters; do not attempt to remote-control the IDE.
5. Add contract tests and fake transports before enabling custom bridges.
