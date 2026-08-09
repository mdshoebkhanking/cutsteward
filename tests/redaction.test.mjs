import { describe, expect, it } from "vitest";
import { redactSensitiveText, sanitizeExternalUrl } from "../server/redaction.mjs";

describe("secret redaction", () => {
  it("redacts environment, header, bearer and common key formats", () => {
    const input = "ELEVENLABS_API_KEY=example-voice-placeholder Authorization: Bearer example-bearer-placeholder sk-example-placeholder AIzaexampleplaceholder";
    const output = redactSensitiveText(input);
    expect(output).not.toContain("example-voice-placeholder");
    expect(output).not.toContain("example-bearer-placeholder");
    expect(output).toContain("ELEVENLABS_API_KEY=[REDACTED]");
    expect(output).toContain("Bearer [REDACTED]");
  });

  it("keeps benign URL context while redacting credentials and sensitive query values", () => {
    const output = sanitizeExternalUrl("https://user:pass@example.com/video?id=42&api_key=secret&name=clip");
    expect(output).toContain("example.com/video");
    expect(output).toContain("id=42");
    expect(output).toContain("name=clip");
    expect(output).not.toContain("pass");
    expect(output).not.toContain("secret");
  });
});
