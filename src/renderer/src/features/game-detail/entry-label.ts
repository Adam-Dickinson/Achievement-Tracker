import type { GameEntry } from '@shared/library'
import { platformName } from '@shared/platform'

export function entryLabel(entry: Pick<GameEntry, 'platform' | 'tag'>): string {
  const name = platformName(entry.platform)
  return entry.tag ? `${name} · ${entry.tag}` : name
}
