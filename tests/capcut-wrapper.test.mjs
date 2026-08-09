import path from "node:path";
import { describe, expect, it } from "vitest";
import { mediaPath } from "../scripts/capcut.mjs";

describe("CapCut CLI media environment", () => {
  it("prepends both admitted binary directories without duplicating one directory", () => {
    const joined = mediaPath({
      ffmpeg: path.join("portable", "ffmpeg", "ffmpeg"),
      ffprobe: path.join("portable", "ffprobe", "ffprobe")
    }, path.join("system", "bin"));

    expect(joined.split(path.delimiter)).toEqual([
      path.join("portable", "ffmpeg"),
      path.join("portable", "ffprobe"),
      path.join("system", "bin")
    ]);
  });
});
