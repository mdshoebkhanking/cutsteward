import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readLocalAuthorityToken } from "./local-api-auth.mjs";
import { resolveBaseUrl } from "./production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_ACTION_BYTES = 32 * 1024;
const ACTION_KINDS = new Set(["navigate", "snapshot", "wait"]);
const ACTION_FIELDS = Object.freeze({
  navigate: new Set(["kind", "timeoutMs", "url"]),
  snapshot: new Set(["kind"]),
  wait: new Set(["kind", "timeoutMs"]),
});
const USAGE = "Usage: browser.mjs <probe|inspect <runId>|start <runId>|act <runId> [--file <path>]|close <runId>>";

function safeRunId(value) {
  if (typeof value !== "string" || !RUN_ID.test(value)) throw new Error("Run ID must be a safe identifier.");
  return value;
}

export function browserCliProfileIdForRun(runId) {
  safeRunId(runId);
  return `run-${createHash("sha256").update(runId).digest("hex").slice(0, 32)}`;
}

export function parseBrowserArguments(arguments_) {
  const [command, ...rest] = arguments_;
  if (command === "probe" && rest.length === 0) return { command };
  if (["inspect", "start", "close"].includes(command) && rest.length === 1) {
    return { command, runId: safeRunId(rest[0]) };
  }
  if (command === "act" && (rest.length === 1 || (rest.length === 3 && rest[1] === "--file"))) {
    const parsed = { command, runId: safeRunId(rest[0]) };
    if (rest.length === 3) {
      if (!rest[2]) throw new Error("--file requires a path.");
      parsed.file = rest[2];
    }
    return parsed;
  }
  throw new Error(USAGE);
}

async function readAction(parsed, stdin) {
  const input = parsed.file ? createReadStream(parsed.file) : stdin;
  const chunks = [];
  let size = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_ACTION_BYTES) throw new Error("Browser action exceeds the 32 KiB limit.");
    chunks.push(bytes);
  }
  let action;
  try {
    action = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch {
    throw new Error("Browser action must be valid JSON.");
  }
  if (!action || typeof action !== "object" || Array.isArray(action) || !ACTION_KINDS.has(action.kind)) {
    throw new Error(`Browser action.kind must be one of: ${[...ACTION_KINDS].join(", ")}.`);
  }
  const unexpected = Object.keys(action).filter((key) => !ACTION_FIELDS[action.kind].has(key));
  if (unexpected.length > 0) {
    throw new Error(`The agent CLI cannot carry browser approval or unsupported fields: ${unexpected.join(", ")}.`);
  }
  return action;
}

function requestUrl(baseUrl, parsed) {
  const url = new URL(baseUrl);
  url.pathname = parsed.command === "probe"
    ? "/api/browser/probe"
    : `/api/runs/${encodeURIComponent(parsed.runId)}/browser`;
  return url;
}

async function problem(response) {
  const payload = await response.json().catch(() => null);
  return payload?.detail || payload?.title || `HTTP ${response.status}`;
}

export async function runBrowserCli(arguments_, options = {}) {
  const parsed = parseBrowserArguments(arguments_);
  const environment = options.environment || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const stdout = options.stdout || process.stdout;
  const request = { method: "GET", headers: new Headers({ Accept: "application/json" }) };

  if (["start", "act", "close"].includes(parsed.command)) {
    request.method = "POST";
    request.headers.set("Content-Type", "application/json");
    request.headers.set("Authorization", `Bearer ${await readLocalAuthorityToken({
      environment,
      rootDirectory: ROOT,
      suppliedToken: options.authorityToken
    })}`);
    const operation = parsed.command === "act" ? "act" : parsed.command;
    request.body = JSON.stringify({
      operation,
      ...(parsed.command === "start" ? { profileId: browserCliProfileIdForRun(parsed.runId) } : {}),
      ...(parsed.command === "act" ? { action: await readAction(parsed, options.stdin || process.stdin) } : {})
    });
  }

  const response = await fetchImpl(requestUrl(resolveBaseUrl(environment), parsed), request);
  if (!response.ok) throw new Error(await problem(response));
  const text = await response.text();
  stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

export async function main(arguments_, options = {}) {
  try {
    await runBrowserCli(arguments_, options);
    return 0;
  } catch (error) {
    (options.stderr || process.stderr).write(`CutSteward browser: ${error instanceof Error ? error.message : "Request failed."}\n`);
    return 1;
  }
}

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = await main(process.argv.slice(2));
