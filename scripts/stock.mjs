import { fileURLToPath } from "node:url";
import path from "node:path";
import { readLocalAuthorityToken } from "./local-api-auth.mjs";
import { resolveBaseUrl } from "./production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROVIDERS = new Set(["pexels", "pixabay"]);
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const USAGE = "Usage: stock.mjs <search <pexels|pixabay> <query...>|select <pexels|pixabay> <cacheKey> <assetId> <renditionId>>";

function provider(value) {
  if (!PROVIDERS.has(value)) throw new Error("Provider must be pexels or pixabay.");
  return value;
}

function identifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

export function parseStockArguments(arguments_) {
  const [command, rawProvider, ...rest] = arguments_;
  if (command === "search" && rest.length > 0) {
    const query = rest.join(" ").trim();
    if (query.length < 1 || query.length > 300) throw new Error("Search query must be 1 to 300 characters.");
    return { command, provider: provider(rawProvider), query };
  }
  if (command === "select" && rest.length === 3) {
    if (!SHA256.test(rest[0])) throw new Error("cacheKey must be the exact SHA-256 returned by search.");
    return {
      command,
      provider: provider(rawProvider),
      cacheKey: rest[0],
      assetId: identifier(rest[1], "Asset ID"),
      renditionId: identifier(rest[2], "Rendition ID")
    };
  }
  throw new Error(USAGE);
}

async function problem(response) {
  const payload = await response.json().catch(() => null);
  return payload?.detail || payload?.title || `HTTP ${response.status}`;
}

export async function runStockCli(arguments_, options = {}) {
  const parsed = parseStockArguments(arguments_);
  const environment = options.environment || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const token = await readLocalAuthorityToken({
    environment,
    rootDirectory: ROOT,
    suppliedToken: options.authorityToken
  });
  const url = new URL(resolveBaseUrl(environment));
  url.pathname = parsed.command === "search" ? "/api/stock/search" : "/api/stock/select";
  const body = parsed.command === "search"
    ? { provider: parsed.provider, query: parsed.query }
    : {
        provider: parsed.provider,
        cacheKey: parsed.cacheKey,
        assetId: parsed.assetId,
        renditionId: parsed.renditionId
      };
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await problem(response));
  const text = await response.text();
  (options.stdout || process.stdout).write(text.endsWith("\n") ? text : `${text}\n`);
}

export async function main(arguments_, options = {}) {
  try {
    await runStockCli(arguments_, options);
    return 0;
  } catch (error) {
    (options.stderr || process.stderr).write(`CutSteward stock: ${error instanceof Error ? error.message : "Request failed."}\n`);
    return 1;
  }
}

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = await main(process.argv.slice(2));
