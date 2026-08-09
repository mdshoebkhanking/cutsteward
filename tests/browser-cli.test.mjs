import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { browserCliProfileIdForRun, parseBrowserArguments, runBrowserCli } from "../scripts/browser.mjs";
import { browserProfileIdForRun } from "../server/browser-runtime.mjs";

function sink() {
  let value = "";
  return { stream: { write(chunk) { value += chunk; } }, read: () => value };
}

describe("supervised browser CLI", () => {
  it("parses bounded run commands and rejects unsafe identifiers", () => {
    expect(parseBrowserArguments(["probe"])).toEqual({ command: "probe" });
    expect(parseBrowserArguments(["start", "run-1"])).toEqual({ command: "start", runId: "run-1" });
    expect(parseBrowserArguments(["act", "run-1", "--file", "action.json"])).toEqual({ command: "act", runId: "run-1", file: "action.json" });
    expect(() => parseBrowserArguments(["close", "../run"])).toThrow(/Run ID/);
  });

  it("routes ordinary agent actions with local Bearer authority", async () => {
    const calls = [];
    const output = sink();
    await runBrowserCli(["act", "run-1"], {
      environment: { FRAMEPILOT_PORT: "4182" },
      authorityToken: "a".repeat(43),
      stdin: Readable.from([JSON.stringify({ kind: "navigate", url: "https://example.com" })]),
      stdout: output.stream,
      fetchImpl: async (url, init) => {
        calls.push({ url: url.href, method: init.method, authorization: init.headers.get("Authorization"), body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ result: { kind: "navigate" } }));
      }
    });
    expect(calls).toEqual([{
      url: "http://127.0.0.1:4182/api/runs/run-1/browser",
      method: "POST",
      authorization: `Bearer ${"a".repeat(43)}`,
      body: { operation: "act", action: { kind: "navigate", url: "https://example.com" } }
    }]);
    expect(output.read()).toContain("navigate");
  });

  it("passes a deterministic run-scoped profile when starting and never shares it across runs", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: url.href, body: JSON.parse(init.body) });
      return new Response("{}");
    };
    for (const runId of ["run-one", "run-two"]) {
      await runBrowserCli(["start", runId], {
        environment: {},
        authorityToken: "a".repeat(43),
        stdout: sink().stream,
        fetchImpl,
      });
    }
    expect(calls[0].body).toEqual({ operation: "start", profileId: browserCliProfileIdForRun("run-one") });
    expect(calls[1].body).toEqual({ operation: "start", profileId: browserCliProfileIdForRun("run-two") });
    expect(calls[0].body.profileId).not.toBe(calls[1].body.profileId);
    expect(browserCliProfileIdForRun("run-one")).toBe(browserProfileIdForRun("run-one"));
  });

  it("does not let an agent smuggle approval grants through an action", async () => {
    await expect(runBrowserCli(["act", "run-1"], {
      environment: {},
      authorityToken: "a".repeat(43),
      stdin: Readable.from([JSON.stringify({ kind: "navigate", url: "https://example.com", confirmations: { spend: true } })]),
      stdout: sink().stream,
      fetchImpl: async () => { throw new Error("fetch must not run"); }
    })).rejects.toThrow(/cannot carry/i);
  });

  it("exposes only read-only agent action kinds", async () => {
    await expect(runBrowserCli(["act", "run-1"], {
      environment: {},
      authorityToken: "a".repeat(43),
      stdin: Readable.from([JSON.stringify({ kind: "click", role: "button", name: "Generate" })]),
      stdout: sink().stream,
      fetchImpl: async () => { throw new Error("fetch must not run"); }
    })).rejects.toThrow(/navigate, snapshot, wait/);
  });

  it("keeps read-only inspection unauthenticated and bounded to loopback", async () => {
    const calls = [];
    await runBrowserCli(["inspect", "run-2"], {
      environment: {},
      stdout: sink().stream,
      fetchImpl: async (url, init) => {
        calls.push({ url: url.href, method: init.method, authorization: init.headers.get("Authorization") });
        return new Response("{}");
      }
    });
    expect(calls).toEqual([{ url: "http://127.0.0.1:4173/api/runs/run-2/browser", method: "GET", authorization: null }]);
  });
});
