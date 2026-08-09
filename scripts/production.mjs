import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readLocalAuthorityToken } from "./local-api-auth.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_COMMAND_BYTES = 32 * 1024;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const USAGE = "Usage: production.mjs <url|list|start [--file <path>]|inspect <runId>|events <runId> [after]|command <runId> [--file <path>]>";

function assertRunId(runId) {
  if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) {
    throw new Error("Run ID must be 1 to 128 safe identifier characters.");
  }
  return runId;
}

export function parseArguments(arguments_) {
  const [command, ...rest] = arguments_;
  if ((command === "url" || command === "list") && rest.length === 0) return { command };
  if (command === "start" && (rest.length === 0 || (rest.length === 2 && rest[0] === "--file"))) {
    const result = { command };
    if (rest.length === 2) {
      if (!rest[1]) throw new Error("--file requires a path.");
      result.file = rest[1];
    }
    return result;
  }
  if (command === "inspect" && rest.length === 1) {
    return { command, runId: assertRunId(rest[0]) };
  }
  if (command === "events" && (rest.length === 1 || rest.length === 2)) {
    const result = { command, runId: assertRunId(rest[0]) };
    if (rest.length === 2) {
      if (!/^\d+$/.test(rest[1])) throw new Error("Event cursor must be a non-negative integer.");
      const after = Number(rest[1]);
      if (!Number.isSafeInteger(after)) throw new Error("Event cursor must be a safe non-negative integer.");
      result.after = after;
    }
    return result;
  }
  if (command === "command" && (rest.length === 1 || (rest.length === 3 && rest[1] === "--file"))) {
    const result = { command, runId: assertRunId(rest[0]) };
    if (rest.length === 3) {
      if (!rest[2]) throw new Error("--file requires a path.");
      result.file = rest[2];
    }
    return result;
  }
  throw new Error(USAGE);
}

function parsePort(value) {
  if (!/^\d+$/.test(value)) throw new Error("FRAMEPILOT_PORT must be an integer from 1 to 65535.");
  const port = Number(value);
  if (port < 1 || port > 65_535) throw new Error("FRAMEPILOT_PORT must be an integer from 1 to 65535.");
  return port;
}

export function resolveBaseUrl(environment = process.env) {
  const configured = environment.FRAMEPILOT_URL;
  const url = configured
    ? new URL(configured)
    : new URL(`http://127.0.0.1:${parsePort(environment.FRAMEPILOT_PORT || "4173")}`);

  if (!LOOPBACK_HOSTS.has(url.hostname)) throw new Error("CutSteward base URL must use a loopback host.");
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("CutSteward base URL must use HTTP or HTTPS.");
  if (url.username || url.password) throw new Error("CutSteward base URL must not contain credentials.");
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    throw new Error("CutSteward base URL must not contain a path, query, or fragment.");
  }
  url.pathname = "/";
  return url;
}

function actorHeader(environment) {
  const actor = environment.FRAMEPILOT_ACTOR || "agent-cli";
  if (actor.length > 128 || /[\u0000-\u001f\u007f]/.test(actor)) {
    throw new Error("FRAMEPILOT_ACTOR must be a safe header value of at most 128 characters.");
  }
  return actor;
}

function requestUrl(baseUrl, parsed) {
  const url = new URL(baseUrl);
  if (parsed.command === "list" || parsed.command === "start") url.pathname = "/api/runs";
  else {
    url.pathname = `/api/runs/${encodeURIComponent(parsed.runId)}`;
    if (parsed.command === "events") {
      url.pathname += "/events";
      if (parsed.after !== undefined) url.searchParams.set("after", String(parsed.after));
    }
    if (parsed.command === "command") url.pathname += "/commands";
  }
  return url;
}

async function readJsonBody(parsed, stdin) {
  const input = parsed.file ? createReadStream(parsed.file) : stdin;
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += bytes.byteLength;
    if (byteLength > MAX_COMMAND_BYTES) throw new Error("Command input exceeds the 32 KiB limit.");
    chunks.push(bytes);
  }
  const text = Buffer.concat(chunks, byteLength).toString("utf8");
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error("Command input must be valid JSON.");
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new Error("Command envelope must be a JSON object.");
  }
  return text;
}

async function writeResponseBody(response, stdout) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lastCharacter = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) {
      stdout.write(text);
      lastCharacter = text.at(-1) || lastCharacter;
    }
  }
  const tail = decoder.decode();
  if (tail) {
    stdout.write(tail);
    lastCharacter = tail.at(-1) || lastCharacter;
  }
  if (lastCharacter !== "\n") stdout.write("\n");
}

async function responseProblemDetail(response) {
  const reader = response.body?.getReader();
  let text = "";
  if (reader) {
    const decoder = new TextDecoder();
    let byteLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_COMMAND_BYTES) {
        await reader.cancel();
        text = "";
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }

  try {
    const problem = JSON.parse(text);
    const detail = typeof problem?.detail === "string" && problem.detail.trim()
      ? problem.detail
      : typeof problem?.title === "string" && problem.title.trim()
        ? problem.title
        : null;
    if (detail) return detail.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  } catch {
    // Fall through to a bounded status-only failure.
  }
  return `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
}

export async function runCli(arguments_, options = {}) {
  const environment = options.environment || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const stdout = options.stdout || process.stdout;
  const parsed = parseArguments(arguments_);
  const baseUrl = resolveBaseUrl(environment);

  if (parsed.command === "url") {
    stdout.write(`${baseUrl.origin}\n`);
    return;
  }

  const headers = new Headers({
    Accept: parsed.command === "events" ? "text/event-stream, application/json" : "application/json",
    "X-FramePilot-Actor": actorHeader(environment)
  });
  const request = { method: "GET", headers };
  if (parsed.command === "command" || parsed.command === "start") {
    request.method = "POST";
    headers.set("Content-Type", "application/json");
    headers.set("Authorization", `Bearer ${await readLocalAuthorityToken({
      environment,
      rootDirectory: ROOT,
      suppliedToken: options.authorityToken
    })}`);
    request.body = await readJsonBody(parsed, options.stdin || process.stdin);
  }
  const response = await fetchImpl(requestUrl(baseUrl, parsed), request);
  if (!response.ok) throw new Error(await responseProblemDetail(response));
  await writeResponseBody(response, stdout);
}

export async function main(arguments_, options = {}) {
  try {
    await runCli(arguments_, options);
    return 0;
  } catch (error) {
    const stderr = options.stderr || process.stderr;
    stderr.write(`CutSteward production: ${error instanceof Error ? error.message : "Request failed."}\n`);
    return 1;
  }
}

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await main(process.argv.slice(2));
}
