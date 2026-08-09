import { describe, expect, it } from "vitest";
import { resolveAppRoute } from "../src/lib/router";

describe("startup route compatibility", () => {
  it("keeps the approved new-project composer canonical at the root", () => {
    expect(resolveAppRoute("/")).toEqual({ kind: "home" });
  });

  it("does not revive the deprecated studio URL alias", () => {
    expect(resolveAppRoute("/studio/run-one")).toEqual({ kind: "missing" });
  });
});
