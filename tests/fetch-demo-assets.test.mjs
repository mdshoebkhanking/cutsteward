import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  downloadAsset,
  fetchWithBoundedRedirects,
  prepareDestination,
  validateDownloadUrl
} from "../scripts/fetch-demo-assets.mjs";

const temporaryDirectories = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "framepilot-demo-fetch-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("demo asset fetcher", () => {
  it("admits only the exact HTTPS Pexels media host", () => {
    expect(validateDownloadUrl("https://videos.pexels.com/video.mp4").hostname).toBe(
      "videos.pexels.com"
    );
    expect(() => validateDownloadUrl("http://videos.pexels.com/video.mp4")).toThrow(
      "only HTTPS"
    );
    expect(() => validateDownloadUrl("https://example.com/video.mp4")).toThrow(
      "not allowlisted"
    );
  });

  it("rejects a redirect that leaves the allowlisted host", async () => {
    const fetchImpl = async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://example.com/stolen.mp4" }
      });

    await expect(
      fetchWithBoundedRedirects("https://videos.pexels.com/start.mp4", fetchImpl)
    ).rejects.toThrow("not allowlisted");
  });

  it("rejects a symlinked stock source directory", async () => {
    const projectDirectory = await temporaryDirectory();
    const demoDirectory = path.join(projectDirectory, "demo");
    const stockDirectory = path.join(demoDirectory, "assets/stock");
    const outsideDirectory = await temporaryDirectory();
    await mkdir(stockDirectory, { recursive: true });
    try {
      await symlink(
        outsideDirectory,
        path.join(stockDirectory, "source"),
        process.platform === "win32" ? "junction" : "dir"
      );
    } catch (error) {
      if (error?.code === "EPERM") return;
      throw error;
    }

    await expect(
      prepareDestination(
        demoDirectory,
        "assets/stock/source/demo.mp4",
        projectDirectory
      )
    ).rejects.toThrow("not a symlink or junction");
  });

  it("rejects a demo directory that resolves outside the project root", async () => {
    const projectDirectory = await temporaryDirectory();
    const outsideDirectory = await temporaryDirectory();
    const demoDirectory = path.join(projectDirectory, "demo");
    await mkdir(path.join(outsideDirectory, "assets/stock"), { recursive: true });
    try {
      await symlink(
        outsideDirectory,
        demoDirectory,
        process.platform === "win32" ? "junction" : "dir"
      );
    } catch (error) {
      if (error?.code === "EPERM") return;
      throw error;
    }

    await expect(
      prepareDestination(
        demoDirectory,
        "assets/stock/source/demo.mp4",
        projectDirectory
      )
    ).rejects.toThrow("non-symlink directory");
  });

  it("downloads, hashes, and publishes a verified asset once", async () => {
    const directory = await temporaryDirectory();
    const destinationPath = path.join(directory, "demo.mp4");
    const payload = Buffer.from("verified demo video bytes");
    const expectedSha256 = createHash("sha256").update(payload).digest("hex");
    const fetchImpl = async () =>
      new Response(payload, {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": String(payload.length)
        }
      });

    await downloadAsset({
      url: "https://videos.pexels.com/demo.mp4",
      destinationPath,
      expectedSha256,
      fetchImpl
    });

    expect(await readFile(destinationPath)).toEqual(payload);
  });

  it("does not replace a destination created during the download", async () => {
    const directory = await temporaryDirectory();
    const destinationPath = path.join(directory, "demo.mp4");
    const payload = Buffer.from("provider bytes");
    const expectedSha256 = createHash("sha256").update(payload).digest("hex");
    const racer = Buffer.from("concurrent owner bytes");
    const fetchImpl = async () => {
      await writeFile(destinationPath, racer, { flag: "wx" });
      return new Response(payload, {
        status: 200,
        headers: { "content-type": "video/mp4" }
      });
    };

    await expect(
      downloadAsset({
        url: "https://videos.pexels.com/demo.mp4",
        destinationPath,
        expectedSha256,
        fetchImpl
      })
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(destinationPath)).toEqual(racer);
  });

  it("does not publish bytes whose SHA-256 is wrong", async () => {
    const directory = await temporaryDirectory();
    const destinationPath = path.join(directory, "demo.mp4");
    const fetchImpl = async () =>
      new Response(Buffer.from("wrong bytes"), {
        status: 200,
        headers: { "content-type": "video/mp4" }
      });

    await expect(
      downloadAsset({
        url: "https://videos.pexels.com/demo.mp4",
        destinationPath,
        expectedSha256: "0".repeat(64),
        fetchImpl
      })
    ).rejects.toThrow("SHA-256 mismatch");
    await expect(readFile(destinationPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
