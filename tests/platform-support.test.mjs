import { describe, expect, it } from "vitest";
import {
  assertSupportedPlatform,
  isSupportedPlatform,
  SUPPORTED_PLATFORMS
} from "../server/platform-support.mjs";

describe("desktop platform policy", () => {
  it("admits only macOS and Windows", () => {
    expect(SUPPORTED_PLATFORMS).toEqual(["darwin", "win32"]);
    expect(isSupportedPlatform("darwin")).toBe(true);
    expect(isSupportedPlatform("win32")).toBe(true);
  });

  it.each(["linux", "freebsd", "aix"])("rejects unsupported host %s", (platform) => {
    expect(() => assertSupportedPlatform(platform)).toThrow("macOS and Windows only");
  });
});
