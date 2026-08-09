const SENSITIVE_NAME = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth(?:orization)?|bearer|secret|password|passwd|cookie|session[_-]?token|xi-api-key|x-api-key)/i;
const ENV_SECRET = /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|COOKIE))=([^\s"']+)/g;
const AUTHORIZATION_BEARER = /\b(Authorization\s*:\s*)Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi;
const AUTHORIZATION_OTHER = /\b(Authorization\s*:\s*)(?!Bearer\b)(?:Basic\s+)?[A-Za-z0-9._~+\/-]{4,}={0,2}/gi;
const LABELED_SECRET = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passwd|cookie|xi-api-key|x-api-key)(\s*[:=]\s*)(["']?)([^\s,"'}]+)\3/gi;
const BEARER_SECRET = /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi;
const COMMON_SECRET = /\b(?:sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{16,})\b/g;

export function redactSensitiveText(value) {
  if (typeof value !== "string" || !value) return value;
  return value
    .replace(ENV_SECRET, "$1=[REDACTED]")
    .replace(AUTHORIZATION_BEARER, "$1Bearer [REDACTED]")
    .replace(AUTHORIZATION_OTHER, "$1[REDACTED]")
    .replace(LABELED_SECRET, "$1$2[REDACTED]")
    .replace(BEARER_SECRET, "Bearer [REDACTED]")
    .replace(COMMON_SECRET, "[REDACTED]");
}

export function sanitizeExternalUrl(value) {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    if (url.username) url.username = "[REDACTED]";
    if (url.password) url.password = "[REDACTED]";
    for (const name of [...url.searchParams.keys()]) {
      if (SENSITIVE_NAME.test(name)) url.searchParams.set(name, "[REDACTED]");
    }
    return url.toString();
  } catch {
    return redactSensitiveText(value);
  }
}
