import { mkdir, mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createLocalAuthority,
  isMutationMethod,
  localAuthorityTokenFilePath
} from "../server/local-authority.mjs";

const temporaryDirectories = [];

async function temporaryDataDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "framepilot-authority-"));
  temporaryDirectories.push(directory);
  return directory;
}

function fakeResponse() {
  const headers = new Map();
  return {
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    }
  };
}

function issuedCookieHeader(response) {
  const values = response.getHeader("Set-Cookie");
  return Array.isArray(values) ? values.at(-1) : values;
}

function cookieRequest(setCookie, extraHeaders = {}) {
  return {
    method: "POST",
    headers: {
      cookie: setCookie.split(";", 1)[0],
      ...extraHeaders
    }
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true
  })));
});

describe("local loopback authority", () => {
  it("creates one persistent private credential and exposes only its location", async () => {
    const dataDirectory = await temporaryDataDirectory();
    const expectedPath = path.join(dataDirectory, ".authority", "loopback-token");
    expect(localAuthorityTokenFilePath(dataDirectory)).toBe(expectedPath);

    const first = await createLocalAuthority({ dataDirectory });
    const storedBefore = await readFile(expectedPath, "utf8");
    const second = await createLocalAuthority({ dataDirectory });
    const storedAfter = await readFile(expectedPath, "utf8");

    expect(storedBefore).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storedAfter).toBe(storedBefore);
    expect(first.cliTokenFilePath()).toBe(expectedPath);
    expect(second.cliTokenFilePath()).toBe(expectedPath);
    expect(JSON.stringify(first.publicView())).not.toContain(storedBefore);
    expect(first).not.toHaveProperty("token");

    if (process.platform !== "win32") {
      expect((await stat(expectedPath)).mode & 0o777).toBe(0o600);
      expect((await stat(path.dirname(expectedPath))).mode & 0o777).toBe(0o700);
    }
  });

  it("issues an HttpOnly strict cookie and fixes browser identity regardless of spoofed headers", async () => {
    const authority = await createLocalAuthority({ dataDirectory: await temporaryDataDirectory() });
    const response = fakeResponse();
    response.setHeader("Set-Cookie", "existing=value; Path=/");
    authority.issueBrowserCookie(response);
    const cookie = issuedCookieHeader(response);

    expect(response.getHeader("Set-Cookie")).toHaveLength(2);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toMatch(/Max-Age=\d+/);
    expect(authority.authenticate(cookieRequest(cookie, {
      "x-framepilot-actor": "spoofed-adapter"
    }))).toEqual({
      channel: "browser-cookie",
      actor: { kind: "local-user", id: "desktop-user" }
    });
  });

  it("accepts a matching Bearer credential as a fixed local-agent identity", async () => {
    const dataDirectory = await temporaryDataDirectory();
    const authority = await createLocalAuthority({ dataDirectory });
    const credential = await readFile(localAuthorityTokenFilePath(dataDirectory), "utf8");
    const request = {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "x-framepilot-actor": "desktop-user"
      }
    };

    expect(authority.requireMutation(request)).toEqual({ kind: "local-agent", id: "local-cli" });
    expect(authority.authenticate(request)).toEqual({
      channel: "bearer",
      actor: { kind: "local-agent", id: "local-cli" }
    });
  });

  it("fails closed for absent, malformed, duplicate, or conflicting credentials", async () => {
    const authority = await createLocalAuthority({ dataDirectory: await temporaryDataDirectory() });
    const response = fakeResponse();
    authority.issueBrowserCookie(response);
    const cookie = issuedCookieHeader(response);
    const validCookie = cookie.split(";", 1)[0];

    for (const request of [
      { method: "POST", headers: { "x-framepilot-actor": "codex" } },
      { method: "POST", headers: { authorization: "Bearer wrong" } },
      { method: "POST", headers: { cookie: `${validCookie}; ${validCookie}` } },
      cookieRequest(cookie, { authorization: "Bearer wrong" })
    ]) {
      expect(authority.authenticate(request)).toBeNull();
      expect(() => authority.requireMutation(request)).toThrowError(
        expect.objectContaining({ code: "LOCAL_AUTHORITY_REQUIRED", statusCode: 401 })
      );
    }
  });

  it("does not demand authority for read methods but rejects unauthenticated mutations", async () => {
    const authority = await createLocalAuthority({ dataDirectory: await temporaryDataDirectory() });
    expect(isMutationMethod("GET")).toBe(false);
    expect(isMutationMethod("HEAD")).toBe(false);
    expect(isMutationMethod("OPTIONS")).toBe(false);
    expect(isMutationMethod("POST")).toBe(true);
    expect(authority.requireMutation({ method: "GET", headers: {} })).toBeNull();
    expect(() => authority.requireActor({ method: "GET", headers: {} })).toThrowError(
      expect.objectContaining({ code: "LOCAL_AUTHORITY_REQUIRED", statusCode: 401 })
    );
  });

  it("requires an absolute data directory and rejects a symlink token", async () => {
    await expect(createLocalAuthority({ dataDirectory: "relative/data" })).rejects.toMatchObject({
      code: "LOCAL_AUTHORITY_PATH_INVALID"
    });

    if (process.platform === "win32") return;
    const targetDirectory = await temporaryDataDirectory();
    await createLocalAuthority({ dataDirectory: targetDirectory });

    // Place the symlink at a fresh authority path without deleting user data.
    const symlinkDataDirectory = await temporaryDataDirectory();
    const symlinkPath = localAuthorityTokenFilePath(symlinkDataDirectory);
    await mkdir(path.dirname(symlinkPath), { recursive: true });
    await symlink(localAuthorityTokenFilePath(targetDirectory), symlinkPath);
    await expect(createLocalAuthority({ dataDirectory: symlinkDataDirectory })).rejects.toMatchObject({
      code: "LOCAL_AUTHORITY_TOKEN_INVALID"
    });
  });
});
