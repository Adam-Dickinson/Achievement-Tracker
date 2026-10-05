import { platformName, type Platform } from '@shared/platform'

export function playLabel(platform: Platform, installCount: number): string {
  return installCount > 1 ? `Play on ${platformName(platform)}` : 'Play'
}
