import path from "node:path";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function authorityHostname(authority) {
  try {
    return new URL(`http://${authority}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return "";
  }
}

export function allowedHost(request) {
  return LOOPBACK_HOSTS.has(authorityHostname(String(request.headers.host || "")));
}

export function allowedMutationOrigin(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method || "GET")) return true;
  const fetchSite = String(request.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(String(origin));
    if (originUrl.protocol !== "http:") return false;
    if (!LOOPBACK_HOSTS.has(originUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase())) return false;
    const requestUrl = new URL(`http://${String(request.headers.host || "")}`);
    return originUrl.port === requestUrl.port;
  } catch {
    return false;
  }
}

export function containedStaticPath(rootDirectory, requestedPath) {
  const segments = requestedPath.replace(/\\/g, "/").split("/").filter((segment) => segment && segment !== ".");
  if (segments.includes("..")) return null;
  const candidate = path.resolve(rootDirectory, ...segments);
  const relative = path.relative(rootDirectory, candidate);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    return null;
  }
  return candidate;
}
