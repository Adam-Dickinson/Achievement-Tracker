import type { UnlockEvent } from '@shared/models'
import { platformName } from '@shared/platform'

export function describeUnlockTiming(event: UnlockEvent): string {
  const found = `${platformName(event.platform)} unlock found at ${event.detectedAt.toISOString()}: ${event.gameTitle}, "${event.achievement.name}"`
  if (!event.unlockedAt) return `${found} (no unlock time from the platform)`
  const lagSeconds = Math.round((event.detectedAt.getTime() - event.unlockedAt.getTime()) / 1000)
  return `${found}, unlocked at ${event.unlockedAt.toISOString()} (${lagSeconds} s earlier)`
}
