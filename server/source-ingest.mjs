import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { sanitizeExternalUrl } from "./redaction.mjs";

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;

function safeFilename(value) {
  let decoded = "source.bin";
  try {
    decoded = decodeURIComponent(String(value || decoded));
  } catch {
    throw Object.assign(new Error("Source filename is not valid UTF-8 encoding."), { statusCode: 400 });
  }
  const cleaned = decoded.replace(/[\\/\0\r\n]/g, "_").trim().slice(0, 180);
  return cleaned || "source.bin";
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function ingestFileSource(request, dataDirectory, options = {}) {
  const configuredLimit = options.maximumBytes ?? Number.parseInt(process.env.FRAMEPILOT_MAX_SOURCE_BYTES || "", 10);
  const maximumBytes = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : DEFAULT_MAX_BYTES;
  const declaredLength = Number.parseInt(String(request.headers["content-length"] || "0"), 10);
  if (declaredLength > maximumBytes) {
    throw Object.assign(new Error(`Source exceeds the ${maximumBytes}-byte local limit.`), { statusCode: 413 });
  }

  const name = safeFilename(request.headers["x-framepilot-filename"]);
  const mediaType = String(request.headers["content-type"] || "application/octet-stream").split(";")[0].trim().toLowerCase();
  const stagingDirectory = path.join(dataDirectory, "sources", "staging");
  await mkdir(stagingDirectory, { recursive: true });
  const temporaryPath = path.join(stagingDirectory, `${process.pid}-${randomUUID()}.part`);
  const handle = await open(temporaryPath, "wx", 0o600);
  const hash = createHash("sha256");
  let size = 0;

  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maximumBytes) {
        throw Object.assign(new Error(`Source exceeds the ${maximumBytes}-byte local limit.`), { statusCode: 413 });
      }
      hash.update(buffer);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset);
        if (bytesWritten < 1) throw new Error("Could not finish writing the local source.");
        offset += bytesWritten;
      }
    }
    if (size === 0) throw Object.assign(new Error("Source file is empty."), { statusCode: 422 });
    await handle.sync();
  } catch (error) {
    await handle.close();
    await rm(temporaryPath, { force: true });
    throw error;
  }
  await handle.close();

  const sha256 = hash.digest("hex");
  const relativePath = path.join("sources", "sha256", sha256.slice(0, 2), sha256.slice(2));
  const finalPath = path.join(dataDirectory, relativePath);
  await mkdir(path.dirname(finalPath), { recursive: true });
  if (await fileExists(finalPath)) await rm(temporaryPath, { force: true });
  else {
    try {
      await rename(temporaryPath, finalPath);
    } catch (error) {
      if (await fileExists(finalPath)) await rm(temporaryPath, { force: true });
      else throw error;
    }
  }

  return {
    id: `source-${sha256.slice(0, 24)}`,
    kind: "file",
    name,
    mediaType,
    size,
    sha256,
    relativePath,
    localOnly: true,
    createdAt: new Date().toISOString()
  };
}

export function createUrlSource(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw Object.assign(new Error("Source URL is invalid."), { statusCode: 422 });
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw Object.assign(new Error("Source URL must be HTTP(S) and must not contain credentials."), { statusCode: 422 });
  }
  url.hash = "";
  const normalized = url.toString();
  if (sanitizeExternalUrl(normalized) !== normalized) {
    throw Object.assign(new Error("Source URL must not contain credential or secret query parameters."), { statusCode: 422 });
  }
  const sha256 = createHash("sha256").update(normalized).digest("hex");
  return {
    id: `url-${sha256.slice(0, 24)}`,
    kind: "url",
    name: url.hostname,
    url: normalized,
    sha256,
    localOnly: true,
    createdAt: new Date().toISOString()
  };
}
