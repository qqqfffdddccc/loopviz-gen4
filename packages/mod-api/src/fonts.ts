export const BUNDLED_FONTS = ["JetBrains Mono", "IBM Plex Mono", "Space Mono"] as const;

export type BundledFont = (typeof BUNDLED_FONTS)[number];
