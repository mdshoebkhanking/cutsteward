#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, "..");
const MAX_REDIRECTS = 4;
const MAX_ASSET_BYTES = 512 * 1024 * 1024;
const ALLOWED_DOWNLOAD_HOSTS = new Set(["videos.pexels.com"]);
const DEMO_DIRECTORIES = [
  "videos/framepilot-launch-demo",
  "videos/framepilot-trust-demo"
];

function fail(message) {
  throw new Error(`Demo asset fetch: ${message}`);
}

export function validateDownloadUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") fail(`only HTTPS downloads are allowed: ${url}`);
  if (url.username || url.password) fail(`credentialed URLs are forbidden: ${url.hostname}`);
  if (!ALLOWED_DOWNLOAD_HOSTS.has(url.hostname)) {
    fail(`download host is not allowlisted: ${url.hostname}`);
  }
  return url;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function fetchWithBoundedRedirects(initialUrl, fetchImpl = fetch) {
  let current = validateDownloadUrl(initialUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetchImpl(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(120_000)
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) fail(`redirect from ${current.hostname} omitted Location`);
      await response.body?.cancel().catch(() => {});
      current = validateDownloadUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) fail(`HTTP ${response.status} for ${current.hostname}`);
    return response;
  }
  fail(`more than ${MAX_REDIRECTS} redirects`);
}

async function existingRegularFile(filePath) {
  try {
    const metadata = await lstat(filePath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      fail(`existing destination must be a regular, non-symlink file: ${filePath}`);
    }
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function prepareDestination(
  demoDirectory,
  localSourcePath,
  projectDirectory = PROJECT_DIRECTORY
) {
  const [canonicalProject, demoMetadata] = await Promise.all([
    realpath(projectDirectory),
    lstat(demoDirectory)
  ]);
  if (demoMetadata.isSymbolicLink() || !demoMetadata.isDirectory()) {
    fail("demo directory must be an existing, non-symlink directory");
  }
  const canonicalDemo = await realpath(demoDirectory);
  if (!canonicalDemo.startsWith(`${canonicalProject}${path.sep}`)) {
    fail("demo directory resolves outside the project root");
  }
  const stockRoot = path.resolve(demoDirectory, "assets/stock");
  const stockMetadata = await lstat(stockRoot);
  if (stockMetadata.isSymbolicLink() || !stockMetadata.isDirectory()) {
    fail("assets/stock must be an existing, non-symlink directory");
  }
  const canonicalStockRoot = await realpath(stockRoot);
  if (!canonicalStockRoot.startsWith(`${canonicalDemo}${path.sep}`)) {
    fail("assets/stock resolves outside its demo directory");
  }

  const expectedSourceRoot = path.join(stockRoot, "source");
  try {
    await mkdir(expectedSourceRoot);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const sourceMetadata = await lstat(expectedSourceRoot);
  if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isDirectory()) {
    fail("assets/stock/source must be a real directory, not a symlink or junction");
  }
  const canonicalSourceRoot = await realpath(expectedSourceRoot);
  if (!canonicalSourceRoot.startsWith(`${canonicalStockRoot}${path.sep}`)) {
    fail("assets/stock/source resolves outside assets/stock");
  }

  const lexicalDestination = path.resolve(demoDirectory, localSourcePath);
  if (path.dirname(lexicalDestination) !== expectedSourceRoot) {
    fail(`manifest destination escapes the ignored stock-source directory: ${lexicalDestination}`);
  }
  return path.join(canonicalSourceRoot, path.basename(lexicalDestination));
}

export async function downloadAsset({
  url,
  destinationPath,
  expectedSha256,
  fetchImpl = fetch
}) {
  const parentMetadata = await lstat(path.dirname(destinationPath));
  if (parentMetadata.isSymbolicLink() || !parentMetadata.isDirectory()) {
    fail("download destination parent must be an existing, non-symlink directory");
  }
  if (await existingRegularFile(destinationPath)) {
    const existingHash = await sha256File(destinationPath);
    if (existingHash === expectedSha256) {
      console.log(`ready  ${path.relative(PROJECT_DIRECTORY, destinationPath)}  ${existingHash}`);
      return;
    }
    fail(`existing file has a different SHA-256; move it aside manually: ${destinationPath}`);
  }

  const temporaryPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}.partial-${process.pid}-${randomUUID()}`
  );
  let temporaryHandle = await open(temporaryPath, "wx+", 0o600);
  const hash = createHash("sha256");
  let receivedBytes = 0;
  const verifier = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_ASSET_BYTES) {
        callback(new Error(`asset exceeded ${MAX_ASSET_BYTES} bytes while streaming`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    }
  });

  try {
    const response = await fetchWithBoundedRedirects(url, fetchImpl);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_ASSET_BYTES) fail(`asset exceeds ${MAX_ASSET_BYTES} bytes`);
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !contentType.startsWith("video/") && contentType !== "application/octet-stream") {
      fail(`provider returned unexpected content type: ${contentType}`);
    }
    if (!response.body) fail("provider returned an empty response body");

    await pipeline(
      Readable.fromWeb(response.body),
      verifier,
      createWriteStream("", { fd: temporaryHandle.fd, autoClose: false })
    );
    await temporaryHandle.sync();
    const downloadedHash = hash.digest("hex");
    if (downloadedHash !== expectedSha256) {
      fail(`SHA-256 mismatch for ${path.basename(destinationPath)}`);
    }
    await temporaryHandle.close();
    temporaryHandle = undefined;
    await link(temporaryPath, destinationPath);
    console.log(`fetched ${path.relative(PROJECT_DIRECTORY, destinationPath)}  ${downloadedHash}`);
  } finally {
    await temporaryHandle?.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
  }
}

export async function main() {
  for (const relativeDemoDirectory of DEMO_DIRECTORIES) {
    const demoDirectory = path.resolve(PROJECT_DIRECTORY, relativeDemoDirectory);
    const manifestPath = path.join(demoDirectory, "assets/stock/SOURCE_MANIFEST.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!Array.isArray(manifest.assets) || manifest.assets.length !== 1) {
      fail(`${manifestPath} must contain exactly one demo asset`);
    }
    const asset = manifest.assets[0];
    if (asset.provider !== "pexels") fail(`unsupported provider in ${manifestPath}`);
    if (!/^[a-f0-9]{64}$/.test(asset.originalSha256)) {
      fail(`invalid SHA-256 in ${manifestPath}`);
    }
    const destinationPath = await prepareDestination(demoDirectory, asset.localSourcePath);
    await downloadAsset({
      url: asset.directDownloadUrl,
      destinationPath,
      expectedSha256: asset.originalSha256
    });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
