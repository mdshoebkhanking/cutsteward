import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createUrlSource, ingestFileSource } from "../server/source-ingest.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("local source ingestion", () => {
  it("streams a file into content-addressed storage", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "framepilot-source-"));
    temporaryDirectories.push(directory);
    const content = Buffer.from("framepilot local source");
    const request = Readable.from([content]);
    request.headers = {
      "content-length": String(content.length),
      "content-type": "text/plain",
      "x-framepilot-filename": encodeURIComponent("brief.txt")
    };
    const source = await ingestFileSource(request, directory, { maximumBytes: 1024 });
    expect(source.sha256).toBe(createHash("sha256").update(content).digest("hex"));
    expect(source.name).toBe("brief.txt");
    expect(await readFile(path.join(directory, source.relativePath), "utf8")).toBe(content.toString());
  });

  it("rejects credential-bearing URLs and normalizes fragments", () => {
    expect(() => createUrlSource("https://user:secret@example.com/video")).toThrow(/credentials/);
    expect(() => createUrlSource("https://example.com/video?api_key=secret")).toThrow(/secret query parameters/);
    const source = createUrlSource("https://example.com/video#scene");
    expect(source.url).toBe("https://example.com/video");
    expect(source.kind).toBe("url");
  });
});
