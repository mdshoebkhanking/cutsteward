import { describe, expect, it } from "vitest";
import { resolveAppRoute } from "../src/lib/router";

describe("CutSteward app routing", () => {
  it("keeps the new-project composer at the canonical root and history at /runs", () => {
    expect(resolveAppRoute("/")).toEqual({ kind: "home" });
    expect(resolveAppRoute("/runs")).toEqual({ kind: "runs" });
    expect(resolveAppRoute("/runs/")).toEqual({ kind: "runs" });
  });

  it("opens a run only through the canonical /runs/:id route", () => {
    expect(resolveAppRoute("/runs/run%20one")).toEqual({ kind: "run", runId: "run one" });
    expect(resolveAppRoute("/studio/run-one")).toEqual({ kind: "missing" });
    expect(resolveAppRoute("/runs-extra")).toEqual({ kind: "missing" });
  });

  it("fails closed for malformed or path-like run IDs", () => {
    expect(resolveAppRoute("/runs/%")).toEqual({ kind: "missing" });
    expect(resolveAppRoute("/runs/run%2Fchild")).toEqual({ kind: "missing" });
  });
});
