/** Every source achievements can come from. Keep in sync with docs/SPEC.md §3. */
export const PLATFORMS = [
  'steam',
  'xbox',
  'playstation',
  'epic',
  'ubisoft',
  'ea',
  'retroachievements',
  'rpcs3',
  'xenia',
  'local_file',
] as const

/** A platform id. These strings are stored in the database, so never rename one. */
export type Platform = (typeof PLATFORMS)[number]

interface PlatformInfo {
  readonly displayName: string
  /** Unofficial integrations are opt-in and labelled in the UI (docs/PROVIDERS.md). */
  readonly unofficial: boolean
}

// Typed as Record<Platform, ...>, so adding a platform above is a compile error until it is
// described here.
export const PLATFORM_INFO: Record<Platform, PlatformInfo> = {
  steam: { displayName: 'Steam', unofficial: false },
  xbox: { displayName: 'Xbox', unofficial: true },
  playstation: { displayName: 'PlayStation', unofficial: true },
  epic: { displayName: 'Epic Games', unofficial: true },
  ubisoft: { displayName: 'Ubisoft Connect', unofficial: true },
  ea: { displayName: 'EA app', unofficial: true },
  retroachievements: { displayName: 'RetroAchievements', unofficial: false },
  rpcs3: { displayName: 'RPCS3', unofficial: false },
  xenia: { displayName: 'Xenia', unofficial: false },
  local_file: { displayName: 'Local file', unofficial: false },
}

export function platformName(platform: Platform): string {
  return PLATFORM_INFO[platform].displayName
}

export function isUnofficial(platform: Platform): boolean {
  return PLATFORM_INFO[platform].unofficial
}
