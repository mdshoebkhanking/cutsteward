import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { main, parseArguments, resolveBaseUrl, runCli } from "../scripts/production.mjs";

function outputSink() {
  let value = "";
  return {
    stream: { write(chunk) { value += chunk; } },
    read() { return value; }
  };
}

describe("production CLI", () => {
  it("uses the configured loopback port and rejects a non-loopback URL", () => {
    expect(resolveBaseUrl({ FRAMEPILOT_PORT: "4182" }).href).toBe("http://127.0.0.1:4182/");
    expect(() => resolveBaseUrl({ FRAMEPILOT_URL: "https://example.com" })).toThrow(/loopback/i);
  });

  it("parses the supported commands and rejects unsafe run identifiers", () => {
    expect(parseArguments(["start", "--file", "start.json"])).toEqual({ command: "start", file: "start.json" });
    expect(parseArguments(["events", "run-42", "17"])).toEqual({ command: "events", runId: "run-42", after: 17 });
    expect(parseArguments(["command", "run_42", "--file", "request.json"])).toEqual({
      command: "command",
      runId: "run_42",
      file: "request.json"
    });
    expect(() => parseArguments(["inspect", "../state.json"])).toThrow(/run id/i);
    expect(() => parseArguments(["events", "run-42", "-1"])).toThrow(/cursor/i);
  });

  it("routes read commands to loopback and attributes them to the configured actor", async () => {
    const calls = [];
    const output = outputSink();
    const fetchImpl = async (url, init) => {
      calls.push({ url: url.href, method: init.method, actor: init.headers.get("X-FramePilot-Actor") });
      return new Response('{"events":[]}');
    };

    await runCli(["events", "run-42", "9"], {
      environment: { FRAMEPILOT_PORT: "4182", FRAMEPILOT_ACTOR: "test-agent" },
      fetchImpl,
      stdout: output.stream
    });

    expect(calls).toEqual([{
      url: "http://127.0.0.1:4182/api/runs/run-42/events?after=9",
      method: "GET",
      actor: "test-agent"
    }]);
    expect(output.read()).toBe('{"events":[]}\n');
  });

  it("posts a validated command envelope from bounded stdin", async () => {
    const calls = [];
    const output = outputSink();
    const body = '{"commandId":"cmd-1","body":{"type":"run.pause"}}';
    const fetchImpl = async (url, init) => {
      calls.push({ url: url.href, method: init.method, contentType: init.headers.get("Content-Type"), body: init.body });
      return new Response('{"accepted":true}', { status: 202 });
    };

    await runCli(["command", "run-42"], {
      environment: {},
      authorityToken: "a".repeat(43),
      fetchImpl,
      stdin: Readable.from([body]),
      stdout: output.stream
    });

    expect(calls).toEqual([{
      url: "http://127.0.0.1:4173/api/runs/run-42/commands",
      method: "POST",
      contentType: "application/json",
      body
    }]);
    expect(output.read()).toBe('{"accepted":true}\n');

    await expect(runCli(["command", "run-42"], {
      environment: {},
      authorityToken: "a".repeat(43),
      fetchImpl,
      stdin: Readable.from(["x".repeat(32 * 1024 + 1)]),
      stdout: output.stream
    })).rejects.toThrow(/32 KiB/);
    expect(calls).toHaveLength(1);
  });

  it("creates a production run from bounded JSON on stdin", async () => {
    const output = outputSink();
    const calls = [];
    const body = JSON.stringify({ outcome: "Create a real local film", mode: "Guided", sourceIds: [], runnerId: "codex" });
    await runCli(["start"], {
      environment: { FRAMEPILOT_ACTOR: "codex" },
      authorityToken: "a".repeat(43),
      fetchImpl: async (url, init) => {
        calls.push({ url: url.href, method: init.method, actor: init.headers.get("X-FramePilot-Actor"), body: init.body });
        return new Response('{"run":{"id":"run-created"}}', { status: 201 });
      },
      stdin: Readable.from([body]),
      stdout: output.stream
    });
    expect(calls).toEqual([{
      url: "http://127.0.0.1:4173/api/runs",
      method: "POST",
      actor: "codex",
      body
    }]);
    expect(output.read()).toContain("run-created");
  });

  it("returns a nonzero code and reports only the server problem detail", async () => {
    const stdout = outputSink();
    const stderr = outputSink();
    const exitCode = await main(["inspect", "missing-run"], {
      environment: {},
      fetchImpl: async () => new Response(JSON.stringify({
        title: "Run not found",
        detail: "That production run does not exist."
      }), {
        status: 404,
        headers: { "Content-Type": "application/problem+json" }
      }),
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(exitCode).toBe(1);
    expect(stdout.read()).toBe("");
    expect(stderr.read()).toBe("CutSteward production: That production run does not exist.\n");
  });

  it("prints the local URL and routes list and inspect without a live server", async () => {
    const output = outputSink();
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url.href);
      return new Response("{}");
    };

    await runCli(["url"], { environment: {}, fetchImpl, stdout: output.stream });
    await runCli(["list"], { environment: {}, fetchImpl, stdout: output.stream });
    await runCli(["inspect", "run-42"], { environment: {}, fetchImpl, stdout: output.stream });

    expect(calls).toEqual([
      "http://127.0.0.1:4173/api/runs",
      "http://127.0.0.1:4173/api/runs/run-42"
    ]);
    expect(output.read()).toBe("http://127.0.0.1:4173\n{}\n{}\n");
  });

  it("reads a command envelope from an explicit file and rejects invalid JSON", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "framepilot-production-cli-"));
    const commandPath = path.join(directory, "command.json");
    const output = outputSink();
    const bodies = [];
    try {
      await writeFile(commandPath, '{"commandId":"cmd-file","body":{"type":"run.resume"}}');
      await runCli(["command", "run-42", "--file", commandPath], {
        environment: {},
        authorityToken: "a".repeat(43),
        fetchImpl: async (_url, init) => {
          bodies.push(init.body);
          return new Response("{}", { status: 202 });
        },
        stdout: output.stream
      });
      expect(JSON.parse(bodies[0])).toEqual({ commandId: "cmd-file", body: { type: "run.resume" } });

      await expect(runCli(["command", "run-42"], {
        environment: {},
        authorityToken: "a".repeat(43),
        fetchImpl: async () => { throw new Error("fetch must not run"); },
        stdin: Readable.from(["not-json"]),
        stdout: output.stream
      })).rejects.toThrow(/valid JSON/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
