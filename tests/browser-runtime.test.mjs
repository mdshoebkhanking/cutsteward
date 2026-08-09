import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  browserProfileIdForRun,
  classifyBrowserAction,
  createBrowserRequestInterceptor,
  createBrowserRuntime,
  createBrowserWebSocketInterceptor,
  validateBrowserUrl,
} from "../server/browser-runtime.mjs";

function routeFor(url) {
  const state = { aborted: false, continued: false, reason: null };
  return {
    state,
    route: {
      request: () => ({ url: () => url }),
      continue: async () => { state.continued = true; },
      abort: async (reason) => { state.aborted = true; state.reason = reason; },
    },
  };
}

function webSocketFor(url) {
  const state = { closed: false, connected: false };
  return {
    state,
    route: {
      url: () => url,
      connectToServer: () => { state.connected = true; },
      close: async () => { state.closed = true; },
    },
  };
}

function fakePage({ authenticationBarrier = false } = {}) {
  let currentUrl = "about:blank";
  const listeners = new Map();
  return {
    close: async () => undefined,
    goto: async (url) => { currentUrl = url; },
    isClosed: () => false,
    locator: () => ({ count: async () => authenticationBarrier ? 1 : 0 }),
    on: (name, handler) => listeners.set(name, handler),
    title: async () => "Test page",
    url: () => currentUrl,
    waitForTimeout: async () => undefined,
    _listeners: listeners,
  };
}

function fakeBrowserType(profilePaths = [], order = [], pageFactory = () => fakePage()) {
  return {
    async launchPersistentContext(profileDirectory, options) {
      profilePaths.push(profileDirectory);
      order.push("launch");
      const page = pageFactory();
      const listeners = new Map();
      return {
        close: async () => undefined,
        newPage: async () => page,
        on: (name, handler) => { order.push(`on:${name}`); listeners.set(name, handler); },
        pages: () => { order.push("pages"); return [page]; },
        route: async (_pattern, handler) => { order.push("route"); listeners.set("route", handler); },
        routeWebSocket: async (_pattern, handler) => { order.push("websocket-route"); listeners.set("websocket", handler); },
        _listeners: listeners,
        _options: options,
      };
    },
  };
}

const browserUse = { actorId: "desktop-user", grants: ["browser:use"] };

describe("supervised browser policy", () => {
  it("does not treat untrusted labels as approval and marks all interactive actions proposal-bound", () => {
    expect(classifyBrowserAction({ text: "Generate video" })).toMatchObject({ grant: null, requiresExactProposal: false });
    expect(classifyBrowserAction({ kind: "click", text: "Open settings" })).toMatchObject({ grant: null, requiresExactProposal: true });
    expect(classifyBrowserAction({ kind: "upload" })).toMatchObject({ grant: null, requiresExactProposal: true });
  });

  it("blocks credentialed, non-http, loopback, link-local and private destinations with no boolean escape hatch", async () => {
    const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
    await expect(validateBrowserUrl("https://user:secret@example.com", { lookup: publicLookup })).rejects.toMatchObject({ code: "BROWSER_URL_BLOCKED" });
    await expect(validateBrowserUrl("file:///etc/passwd", { lookup: publicLookup })).rejects.toMatchObject({ code: "BROWSER_URL_BLOCKED" });
    await expect(validateBrowserUrl("http://127.0.0.1:4173", { lookup: publicLookup })).rejects.toMatchObject({ code: "BROWSER_LOCAL_NETWORK_BLOCKED" });
    await expect(validateBrowserUrl("http://169.254.169.254/latest/meta-data", { lookup: publicLookup })).rejects.toMatchObject({ code: "BROWSER_LOCAL_NETWORK_BLOCKED" });
    await expect(validateBrowserUrl("http://[::ffff:127.0.0.1]/", { lookup: publicLookup })).rejects.toMatchObject({ code: "BROWSER_LOCAL_NETWORK_BLOCKED" });
    await expect(validateBrowserUrl("http://127.0.0.1:4173", { lookup: publicLookup, allowLocalNetwork: true })).rejects.toMatchObject({ code: "BROWSER_LOCAL_NETWORK_BLOCKED" });
    await expect(validateBrowserUrl("https://example.com/path#secret", { lookup: publicLookup })).resolves.toBe("https://example.com/path");
  });

  it("intercepts redirect hops, popup documents, subresources and DNS rebinding before egress", async () => {
    const resolutions = new Map([
      ["public.example", ["93.184.216.34", "127.0.0.1"]],
      ["cdn.example", ["10.1.2.3"]],
      ["popup.example", ["169.254.169.254"]],
    ]);
    const lookup = async (hostname) => {
      const sequence = resolutions.get(hostname) || ["93.184.216.34"];
      const address = sequence.length > 1 ? sequence.shift() : sequence[0];
      return [{ address, family: address.includes(":") ? 6 : 4 }];
    };
    const blocked = [];
    const intercept = createBrowserRequestInterceptor({ lookup, onBlocked: async (violation) => blocked.push(violation) });

    const initialDocument = routeFor("https://public.example/start");
    await expect(intercept(initialDocument.route)).resolves.toMatchObject({ allowed: true });
    expect(initialDocument.state).toMatchObject({ continued: true, aborted: false });

    const reboundRedirect = routeFor("https://public.example/redirected");
    await expect(intercept(reboundRedirect.route)).resolves.toMatchObject({ allowed: false });
    expect(reboundRedirect.state).toMatchObject({ continued: false, aborted: true, reason: "blockedbyclient" });

    const privateSubresource = routeFor("https://cdn.example/script.js");
    await expect(intercept(privateSubresource.route)).resolves.toMatchObject({ allowed: false });
    expect(privateSubresource.state.aborted).toBe(true);

    const privatePopup = routeFor("https://popup.example/window");
    await expect(intercept(privatePopup.route)).resolves.toMatchObject({ allowed: false });
    expect(privatePopup.state.aborted).toBe(true);

    const fileRequest = routeFor("file:///etc/passwd");
    await expect(intercept(fileRequest.route)).resolves.toMatchObject({ allowed: false });
    expect(fileRequest.state.aborted).toBe(true);
    expect(blocked.map((entry) => entry.code)).toEqual([
      "BROWSER_LOCAL_NETWORK_BLOCKED",
      "BROWSER_LOCAL_NETWORK_BLOCKED",
      "BROWSER_LOCAL_NETWORK_BLOCKED",
      "BROWSER_URL_BLOCKED",
    ]);
  });

  it("applies the same DNS/private-origin policy to WebSockets", async () => {
    const lookup = async (hostname) => [{ address: hostname === "internal.example" ? "192.168.1.5" : "93.184.216.34", family: 4 }];
    const intercept = createBrowserWebSocketInterceptor({ lookup });
    const publicSocket = webSocketFor("wss://public.example/events");
    const privateSocket = webSocketFor("ws://internal.example/events");
    await expect(intercept(publicSocket.route)).resolves.toMatchObject({ allowed: true });
    await expect(intercept(privateSocket.route)).resolves.toMatchObject({ allowed: false });
    expect(publicSocket.state).toEqual({ closed: false, connected: true });
    expect(privateSocket.state).toEqual({ closed: true, connected: false });
  });

  it("installs context-wide request guards before accessing a page and blocks service workers", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "framepilot-browser-order-"));
    const runDirectory = path.join(root, "run");
    await mkdir(runDirectory);
    const order = [];
    let launchOptions;
    const browserType = fakeBrowserType([], order);
    const originalLaunch = browserType.launchPersistentContext;
    browserType.launchPersistentContext = async (...args) => {
      const context = await originalLaunch(...args);
      launchOptions = context._options;
      return context;
    };
    const runtime = createBrowserRuntime({
      dataDirectory: root,
      findExecutable: async () => "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      browserType,
    });
    await runtime.start({
      runId: "run-order",
      runDirectory,
      profileId: browserProfileIdForRun("run-order"),
      authority: browserUse,
    });
    expect(order.indexOf("route")).toBeGreaterThan(order.indexOf("launch"));
    expect(order.indexOf("route")).toBeLessThan(order.indexOf("pages"));
    expect(order.indexOf("websocket-route")).toBeLessThan(order.indexOf("pages"));
    expect(launchOptions.serviceWorkers).toBe("block");
    await runtime.shutdown();
  });

  it("fails closed on legacy same-request grants and all agent-driven interactive actions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "framepilot-browser-authority-"));
    const runDirectory = path.join(root, "run");
    await mkdir(runDirectory);
    let launched = false;
    const runtime = createBrowserRuntime({
      dataDirectory: root,
      findExecutable: async () => "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      browserType: {
        async launchPersistentContext(...args) {
          launched = true;
          return fakeBrowserType().launchPersistentContext(...args);
        },
      },
    });
    await expect(runtime.start({
      runId: "run-grant",
      runDirectory,
      authority: { actorId: "desktop-user", grants: ["browser:use", "browser:spend"] },
    })).rejects.toMatchObject({ code: "BROWSER_EXACT_APPROVAL_REQUIRED" });
    expect(launched).toBe(false);

    await runtime.start({
      runId: "run-grant",
      runDirectory,
      profileId: browserProfileIdForRun("run-grant"),
      authority: browserUse,
    });
    await expect(runtime.act({
      runId: "run-grant",
      action: { kind: "click", role: "button", name: "Looks harmless" },
      authority: browserUse,
    })).rejects.toMatchObject({ code: "BROWSER_EXACT_APPROVAL_REQUIRED" });
    await runtime.shutdown();

    const authRunDirectory = path.join(root, "auth-run");
    await mkdir(authRunDirectory);
    const authRuntime = createBrowserRuntime({
      dataDirectory: root,
      findExecutable: async () => "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      browserType: fakeBrowserType([], [], () => fakePage({ authenticationBarrier: true })),
    });
    await authRuntime.start({
      runId: "run-auth",
      runDirectory: authRunDirectory,
      profileId: browserProfileIdForRun("run-auth"),
      authority: browserUse,
    });
    await expect(authRuntime.act({
      runId: "run-auth",
      action: { kind: "click", role: "button", name: "Continue" },
      authority: browserUse,
    })).rejects.toMatchObject({ code: "BROWSER_USER_TAKEOVER_REQUIRED" });
    await authRuntime.shutdown();
  });

  it("continues an append-only event hash chain across browser restarts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "framepilot-browser-events-"));
    const runDirectory = path.join(root, "run");
    await mkdir(runDirectory);
    const makeRuntime = () => createBrowserRuntime({
      dataDirectory: root,
      findExecutable: async () => "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      browserType: fakeBrowserType(),
    });
    const first = makeRuntime();
    await first.start({
      runId: "run-events",
      runDirectory,
      profileId: browserProfileIdForRun("run-events"),
      authority: browserUse,
    });
    await first.close({ runId: "run-events", authority: browserUse });
    const second = makeRuntime();
    await second.start({
      runId: "run-events",
      runDirectory,
      profileId: browserProfileIdForRun("run-events"),
      authority: browserUse,
    });
    await second.close({ runId: "run-events", authority: browserUse });

    const eventsDirectory = path.join(runDirectory, "browser", "events");
    const filenames = (await readdir(eventsDirectory)).sort();
    expect(filenames).toEqual(["00000001.json", "00000002.json", "00000003.json", "00000004.json"]);
    const events = await Promise.all(filenames.map(async (filename) => JSON.parse(await readFile(path.join(eventsDirectory, filename), "utf8"))));
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(events[2].previousHash).toBe(events[1].eventHash);
    expect(events[0].sessionId).not.toBe(events[2].sessionId);
    for (const event of events) {
      const { eventHash, ...withoutHash } = event;
      expect(eventHash).toBe(createHash("sha256").update(JSON.stringify(withoutHash)).digest("hex"));
    }
  });

  it("physically isolates persistent profiles by run even when callers reuse default", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "framepilot-browser-profiles-"));
    const profilePaths = [];
    const runtime = createBrowserRuntime({
      dataDirectory: root,
      findExecutable: async () => "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      browserType: fakeBrowserType(profilePaths),
    });
    const runOne = path.join(root, "one");
    const runTwo = path.join(root, "two");
    await Promise.all([mkdir(runOne), mkdir(runTwo)]);
    await runtime.start({ runId: "run-one", runDirectory: runOne, profileId: "default", authority: browserUse });
    await runtime.start({ runId: "run-two", runDirectory: runTwo, profileId: "default", authority: browserUse });
    expect(profilePaths).toHaveLength(2);
    expect(profilePaths[0]).not.toBe(profilePaths[1]);
    expect(profilePaths[0]).toContain(browserProfileIdForRun("run-one"));
    expect(profilePaths[1]).toContain(browserProfileIdForRun("run-two"));
    await runtime.shutdown();
  });

  it("requires explicit authority before launching a persistent browser", async () => {
    let launched = false;
    const runtime = createBrowserRuntime({
      dataDirectory: "/tmp/framepilot-browser-test",
      findExecutable: async () => "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      browserType: {
        async launchPersistentContext() {
          launched = true;
          throw new Error("should not launch");
        },
      },
    });
    await expect(runtime.start({
      runId: "run-1",
      runDirectory: "/tmp/framepilot-browser-test/run-1",
      authority: { actorId: "desktop-user", grants: [] },
    })).rejects.toMatchObject({ code: "BROWSER_APPROVAL_REQUIRED" });
    expect(launched).toBe(false);
  });
});
