import { constants } from "node:fs";
import { chmod, lstat, mkdir, open } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const AUTHORITY_DIRECTORY = ".authority";
const TOKEN_FILE = "loopback-token";
const TOKEN_BYTES = 32;
const MAX_TOKEN_FILE_BYTES = 512;
const COOKIE_NAME = "framepilot_local_authority";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const BROWSER_ACTOR = Object.freeze({ kind: "local-user", id: "desktop-user" });
const AGENT_ACTOR = Object.freeze({ kind: "local-agent", id: "local-cli" });

function authorityError(message, code, statusCode = 500) {
  return Object.assign(new Error(message), { code, statusCode });
}

function assertAbsoluteDataDirectory(dataDirectory) {
  if (typeof dataDirectory !== "string" || !path.isAbsolute(dataDirectory)) {
    throw authorityError(
      "Local authority dataDirectory must be an absolute path.",
      "LOCAL_AUTHORITY_PATH_INVALID"
    );
  }
  return path.normalize(dataDirectory);
}

/**
 * Returns the location a local CLI/agent may read for its Bearer credential.
 * The helper never opens or returns the file contents.
 */
export function localAuthorityTokenFilePath(dataDirectory) {
  return path.join(assertAbsoluteDataDirectory(dataDirectory), AUTHORITY_DIRECTORY, TOKEN_FILE);
}

function authorityDirectoryPath(dataDirectory) {
  return path.dirname(localAuthorityTokenFilePath(dataDirectory));
}

function validStoredToken(value) {
  return typeof value === "string"
    && value.length === 43
    && /^[A-Za-z0-9_-]+$/.test(value);
}

async function tightenPermissions(targetPath, mode) {
  try {
    await chmod(targetPath, mode);
  } catch (error) {
    throw authorityError(
      `Could not secure the local authority ${mode === 0o600 ? "token file" : "directory"}.`,
      "LOCAL_AUTHORITY_PERMISSIONS_FAILED"
    );
  }
}

async function readTokenFile(tokenPath) {
  const linkStat = await lstat(tokenPath);
  if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
    throw authorityError(
      "Local authority token path must be a regular file.",
      "LOCAL_AUTHORITY_TOKEN_INVALID"
    );
  }

  // O_NOFOLLOW closes the lstat/open symlink race on macOS. Windows does not
  // implement POSIX no-follow semantics, so its regular-file check remains.
  const noFollow = process.platform === "win32" ? 0 : (constants.O_NOFOLLOW || 0);
  let handle;
  try {
    handle = await open(tokenPath, constants.O_RDONLY | noFollow);
    const openedStat = await handle.stat();
    if (!openedStat.isFile() || openedStat.size < 1 || openedStat.size > MAX_TOKEN_FILE_BYTES) {
      throw authorityError(
        "Local authority token file is not valid.",
        "LOCAL_AUTHORITY_TOKEN_INVALID"
      );
    }
    if (process.platform !== "win32"
      && (openedStat.dev !== linkStat.dev || openedStat.ino !== linkStat.ino)) {
      throw authorityError(
        "Local authority token file changed while it was being opened.",
        "LOCAL_AUTHORITY_TOKEN_INVALID"
      );
    }
    await handle.chmod(0o600);
    const value = (await handle.readFile({ encoding: "utf8" })).trim();
    if (!validStoredToken(value)) {
      throw authorityError(
        "Local authority token file is not valid.",
        "LOCAL_AUTHORITY_TOKEN_INVALID"
      );
    }
    return value;
  } finally {
    await handle?.close();
  }
}

async function createOrLoadToken(dataDirectory) {
  const directory = authorityDirectoryPath(dataDirectory);
  const tokenPath = localAuthorityTokenFilePath(dataDirectory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await tightenPermissions(directory, 0o700);

  const freshToken = randomBytes(TOKEN_BYTES).toString("base64url");
  let handle;
  try {
    handle = await open(tokenPath, "wx", 0o600);
    await handle.writeFile(freshToken, { encoding: "utf8" });
    await handle.sync();
    await handle.chmod(0o600);
    return freshToken;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  } finally {
    await handle?.close();
  }

  return readTokenFile(tokenPath);
}

function headerValue(request, name) {
  const headers = request?.headers;
  if (!headers) return null;
  if (typeof headers.get === "function") {
    const value = headers.get(name);
    return typeof value === "string" ? value : null;
  }
  const value = headers[name.toLowerCase()] ?? headers[name];
  if (typeof value === "string") return value;
  const matchedName = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return matchedName && typeof headers[matchedName] === "string" ? headers[matchedName] : null;
}

function bearerCandidate(authorization) {
  if (typeof authorization !== "string") return null;
  const match = /^Bearer[\t ]+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] || null;
}

function cookieCandidate(cookieHeader) {
  if (typeof cookieHeader !== "string") return null;
  const candidates = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE_NAME}=`))
    .map((part) => part.slice(COOKIE_NAME.length + 1));
  return candidates.length === 1 ? candidates[0] : null;
}

function secureMatch(candidate, expected) {
  // Comparing fixed-size digests lets timingSafeEqual run even when an
  // attacker supplies a credential of a different length.
  const candidateDigest = createHash("sha256").update(String(candidate || "")).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function appendSetCookie(response, value) {
  if (!response || typeof response.setHeader !== "function") {
    throw authorityError(
      "A Node HTTP response is required to issue the browser authority cookie.",
      "LOCAL_AUTHORITY_RESPONSE_INVALID"
    );
  }
  const existing = typeof response.getHeader === "function" ? response.getHeader("Set-Cookie") : undefined;
  const values = existing === undefined
    ? [value]
    : [...(Array.isArray(existing) ? existing : [String(existing)]), value];
  response.setHeader("Set-Cookie", values);
}

function unauthenticatedError() {
  return authorityError(
    "Local authority authentication is required for this mutation.",
    "LOCAL_AUTHORITY_REQUIRED",
    401
  );
}

export function isMutationMethod(method) {
  return !SAFE_METHODS.has(String(method || "GET").toUpperCase());
}

/**
 * Creates the one-machine authority boundary used by the loopback server.
 * The credential remains closure-private: callers may issue it as an HttpOnly
 * cookie or validate a request, but cannot retrieve it through this object.
 */
export async function createLocalAuthority({ dataDirectory } = {}) {
  const normalizedDataDirectory = assertAbsoluteDataDirectory(dataDirectory);
  const tokenPath = localAuthorityTokenFilePath(normalizedDataDirectory);
  const token = await createOrLoadToken(normalizedDataDirectory);

  function authenticate(request) {
    const authorization = headerValue(request, "authorization");
    if (authorization !== null) {
      const candidate = bearerCandidate(authorization);
      if (!secureMatch(candidate, token)) return null;
      return Object.freeze({ channel: "bearer", actor: AGENT_ACTOR });
    }

    const candidate = cookieCandidate(headerValue(request, "cookie"));
    if (!secureMatch(candidate, token)) return null;
    return Object.freeze({ channel: "browser-cookie", actor: BROWSER_ACTOR });
  }

  function requireActor(request) {
    const authentication = authenticate(request);
    if (!authentication) throw unauthenticatedError();
    return authentication.actor;
  }

  return Object.freeze({
    authenticate,
    requireActor,
    requireMutation(request) {
      if (!isMutationMethod(request?.method)) return null;
      return requireActor(request);
    },
    issueBrowserCookie(response) {
      appendSetCookie(
        response,
        `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_SECONDS}`
      );
    },
    cliTokenFilePath() {
      return tokenPath;
    },
    publicView() {
      return Object.freeze({
        schemaVersion: 1,
        ready: true,
        browserCookie: { name: COOKIE_NAME, httpOnly: true, sameSite: "Strict" },
        cli: { tokenFilePath: tokenPath, authorizationScheme: "Bearer" }
      });
    }
  });
}
