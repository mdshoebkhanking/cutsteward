import { describe, expect, it, vi } from "vitest";
import { parseStockArguments, runStockCli } from "../scripts/stock.mjs";

const token = "a".repeat(43);
const cacheKey = "b".repeat(64);

describe("stock CLI", () => {
  it("parses bounded searches and exact selections", () => {
    expect(parseStockArguments(["search", "pexels", "real", "human", "commute"])).toEqual({
      command: "search",
      provider: "pexels",
      query: "real human commute"
    });
    expect(parseStockArguments(["select", "pixabay", cacheKey, "42", "large"])).toEqual({
      command: "select",
      provider: "pixabay",
      cacheKey,
      assetId: "42",
      renditionId: "large"
    });
  });

  it("rejects unsupported providers and non-exact cache keys", () => {
    expect(() => parseStockArguments(["search", "unknown", "query"])).toThrow(/pexels or pixabay/);
    expect(() => parseStockArguments(["select", "pexels", "short", "42", "uhd"])).toThrow(/exact SHA-256/);
  });

  it("uses the private local-agent credential and forwards only the bounded request", async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(new URL(url).pathname).toBe("/api/stock/search");
      expect(init.headers.Authorization).toBe(`Bearer ${token}`);
      expect(JSON.parse(init.body)).toEqual({ provider: "pexels", query: "cafe phone" });
      return new Response(JSON.stringify({ result: { cacheKey } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    let output = "";
    await runStockCli(["search", "pexels", "cafe", "phone"], {
      authorityToken: token,
      environment: { FRAMEPILOT_URL: "http://127.0.0.1:4173" },
      fetchImpl,
      stdout: { write(value) { output += value; } }
    });
    expect(JSON.parse(output)).toEqual({ result: { cacheKey } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
