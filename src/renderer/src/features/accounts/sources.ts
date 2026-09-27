import { type Platform, platformName } from '@shared/platform'

export const ONLINE_PLATFORMS = [
  'steam',
  'xbox',
  'playstation',
  'epic',
  'ubisoft',
  'ea',
] as const satisfies readonly Platform[]

export type OnlinePlatform = (typeof ONLINE_PLATFORMS)[number]

export interface Source {
  readonly name: string
  readonly method: string
  readonly official: boolean
}

export const SOURCES: Record<OnlinePlatform, Source> = {
  steam: { name: 'Steam', method: 'Steam sign-in, then your own Web API key', official: true },
  xbox: { name: 'Xbox', method: 'Microsoft sign-in in your browser', official: false },
  playstation: {
    name: 'PlayStation',
    method: 'Sony’s sign-in page in an app window',
    official: false,
  },
  epic: { name: 'Epic', method: 'A code from Epic’s sign-in page', official: false },
  ubisoft: { name: 'Ubisoft', method: 'Ubisoft’s sign-in page in an app window', official: false },
  ea: { name: 'EA', method: 'EA’s sign-in page in an app window', official: false },
}

export function isOnline(platform: Platform): platform is OnlinePlatform {
  return (ONLINE_PLATFORMS as readonly Platform[]).includes(platform)
}

export function sourceName(platform: Platform): string {
  return isOnline(platform) ? SOURCES[platform].name : platformName(platform)
}
