import path from "node:path";
import { describe, expect, it } from "vitest";
import { allowedHost, allowedMutationOrigin, authorityHostname, containedStaticPath } from "../server/request-security.mjs";

function request(method, host, headers = {}) {
  return { method, headers: { host, ...headers } };
}

describe("loopback request security", () => {
  it("parses IPv4, localhost, and bracketed IPv6 authorities", () => {
    expect(authorityHostname("127.0.0.1:4173")).toBe("127.0.0.1");
    expect(authorityHostname("localhost:4173")).toBe("localhost");
    expect(authorityHostname("[::1]:4173")).toBe("::1");
    expect(allowedHost(request("GET", "evil.test:4173"))).toBe(false);
  });

  it("rejects cross-site mutations while allowing local clients and same-origin UI", () => {
    expect(allowedMutationOrigin(request("POST", "127.0.0.1:4173"))).toBe(true);
    expect(allowedMutationOrigin(request("POST", "127.0.0.1:4173", {
      origin: "http://127.0.0.1:4173",
      "sec-fetch-site": "same-origin"
    }))).toBe(true);
    expect(allowedMutationOrigin(request("POST", "127.0.0.1:4173", {
      origin: "https://evil.test",
      "sec-fetch-site": "cross-site"
    }))).toBe(false);
  });

  it("keeps static files inside the built UI directory", () => {
    const root = path.resolve("dist");
    expect(containedStaticPath(root, "/assets/app.js")).toBe(path.join(root, "assets", "app.js"));
    expect(containedStaticPath(root, "/../package.json")).toBeNull();
    expect(containedStaticPath(root, "\\..\\package.json")).toBeNull();
  });
});
