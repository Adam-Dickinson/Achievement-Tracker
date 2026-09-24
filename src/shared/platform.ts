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

export type Platform = (typeof PLATFORMS)[number]

interface PlatformInfo {
  readonly displayName: string
  readonly unofficial: boolean
}

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
