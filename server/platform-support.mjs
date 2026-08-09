export const SUPPORTED_PLATFORMS = Object.freeze(["darwin", "win32"]);

export function isSupportedPlatform(platform = process.platform) {
  return SUPPORTED_PLATFORMS.includes(platform);
}

export function assertSupportedPlatform(platform = process.platform) {
  if (!isSupportedPlatform(platform)) {
    throw new Error(`CutSteward supports macOS and Windows only (detected ${platform}).`);
  }
}
