import { DEFAULT_NOTIFICATION_SETTINGS, type ToastPayload, type VisibleToast } from '@shared/ipc'
import type { UnlockEvent } from '@shared/models'
import type { Platform } from '@shared/platform'
import { rarityAtLeast, rarityFromPercent, type Rarity } from '@shared/rarity'
import { APP_PLATINUM_ID, isPlatinumAchievement } from './store/platinum'

export const TOAST_DURATION_MS = 5000
export const MAX_VISIBLE = 3
export const BURST_SIZE = 5

export interface NotificationServiceDeps {
  readonly display: (toasts: readonly VisibleToast[]) => void
  readonly durationMs?: number
}

interface Pending {
  readonly key: string | null
  readonly toast: ToastPayload
}

interface Shown extends Pending {
  readonly id: number
  readonly timer: ReturnType<typeof setTimeout>
}

export class NotificationService {
  readonly #display: (toasts: readonly VisibleToast[]) => void
  #durationMs: number
  #minRarity: Rarity = DEFAULT_NOTIFICATION_SETTINGS.minRarity
  #enabledPlatforms: Readonly<Record<Platform, boolean>> =
    DEFAULT_NOTIFICATION_SETTINGS.enabledPlatforms
  readonly #queue: Pending[] = []
  #shown: Shown[] = []
  #nextId = 1
  #paused = false

  constructor(deps: NotificationServiceDeps) {
    this.#display = deps.display
    this.#durationMs = deps.durationMs ?? TOAST_DURATION_MS
  }

  get paused(): boolean {
    return this.#paused
  }

  set paused(paused: boolean) {
    this.#paused = paused
  }

  set durationMs(durationMs: number) {
    this.#durationMs = durationMs
  }

  set minRarity(minRarity: Rarity) {
    this.#minRarity = minRarity
  }

  set enabledPlatforms(enabledPlatforms: Readonly<Record<Platform, boolean>>) {
    this.#enabledPlatforms = enabledPlatforms
  }

  notify(events: readonly UnlockEvent[]): void {
    if (this.#paused) return
    const allowed = events.filter((event) => this.#allows(event))
    const fresh = allowed.filter((event) => !this.#has(unlockKey(event)))
    if (fresh.length === 0) return

    const platinums = fresh.filter(isPlatinum)
    const others = fresh.filter((event) => !isPlatinum(event))
    if (others.length > BURST_SIZE) {
      this.#queue.push({ key: null, toast: burstToast(others) })
    } else {
      for (const event of others) this.#enqueue(event)
    }
    for (const event of platinums) this.#enqueue(event)
    this.#fill()
  }

  show(toast: ToastPayload): void {
    this.#queue.push({ key: null, toast })
    this.#fill()
  }

  stop(): void {
    for (const shown of this.#shown) clearTimeout(shown.timer)
    this.#shown = []
    this.#queue.length = 0
  }

  #enqueue(event: UnlockEvent): void {
    this.#queue.push({ key: unlockKey(event), toast: unlockToast(event) })
  }

  #has(key: string): boolean {
    return [...this.#shown, ...this.#queue].some((item) => item.key === key)
  }

  #allows(event: UnlockEvent): boolean {
    if (!this.#enabledPlatforms[event.platform]) return false
    return isPlatinum(event) || rarityAtLeast(eventRarity(event), this.#minRarity)
  }

  #fill(): void {
    let changed = false
    while (this.#shown.length < MAX_VISIBLE) {
      const next = this.#queue.shift()
      if (!next) break
      const id = this.#nextId++
      const timer = setTimeout(() => this.#dismiss(id), this.#durationMs)
      this.#shown.push({ ...next, id, timer })
      changed = true
    }
    if (changed) this.#publish()
  }

  #dismiss(id: number): void {
    this.#shown = this.#shown.filter((shown) => shown.id !== id)
    this.#publish()
    this.#fill()
  }

  #publish(): void {
    this.#display(this.#shown.map(({ id, toast }) => ({ ...toast, id })))
  }
}

function isPlatinum(event: UnlockEvent): boolean {
  return isPlatinumAchievement(event.achievement, event.gameTitle)
}

function eventRarity(event: UnlockEvent): Rarity {
  const percent = event.achievement.globalPercent
  return percent === null ? 'common' : rarityFromPercent(percent)
}

function unlockKey(event: UnlockEvent): string {
  return `${event.platform}:${event.gameTitle}:${event.achievement.externalId}`
}

export function unlockToast(event: UnlockEvent): ToastPayload {
  const percent = event.achievement.globalPercent
  const platinum = isPlatinum(event)
  return {
    heading: !platinum
      ? 'Achievement unlocked'
      : event.achievement.externalId === APP_PLATINUM_ID
        ? 'Platinum earned'
        : 'Platinum unlocked',
    rarity: eventRarity(event),
    title: event.achievement.name,
    description: event.achievement.description,
    game: event.gameTitle,
    platform: event.platform,
    percent: percent === null ? null : roundPercent(percent),
    platinum,
  }
}

export function burstToast(events: readonly UnlockEvent[]): ToastPayload {
  const [rarest, ...rest] = [...events].sort(
    (a, b) => (a.achievement.globalPercent ?? 101) - (b.achievement.globalPercent ?? 101),
  )
  if (!rarest) throw new Error('burstToast needs at least one event')

  const games = new Set(events.map((event) => event.gameTitle))
  const platforms = new Set(events.map((event) => event.platform))
  return {
    ...unlockToast(rarest),
    heading: `${events.length} achievements unlocked`,
    description: `and ${rest.length} more`,
    game: games.size === 1 ? rarest.gameTitle : `${games.size} games`,
    platform: platforms.size === 1 ? rarest.platform : null,
    platinum: false,
  }
}

function roundPercent(percent: number): number {
  const scale = percent < 1 ? 100 : 10
  return Math.round(percent * scale) / scale
}
