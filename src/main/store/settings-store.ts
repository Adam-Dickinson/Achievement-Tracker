import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  TOAST_CORNERS,
  TOAST_SIZES,
  type NotificationSettings,
  type NotificationSettingsPatch,
} from '@shared/ipc'
import { LOG_LEVELS, type LogLevel } from '@shared/logs'
import { PLATFORMS } from '@shared/platform'
import { RARITIES } from '@shared/rarity'

const PROFILE_NAME = 'profile.name'
const NOTIFICATION_SETTINGS = 'notifications.settings'
const ONBOARDING_COMPLETED = 'onboarding.completed'
const LOG_LEVEL = 'logging.level'

const notificationSettingsSchema = z.object({
  corner: z.enum(TOAST_CORNERS),
  monitor: z.union([z.literal('primary'), z.number().int().nonnegative()]),
  size: z.enum(TOAST_SIZES),
  durationSec: z.number().min(1).max(30),
  minRarity: z.enum(RARITIES),
  enabledPlatforms: z.partialRecord(z.enum(PLATFORMS), z.boolean()),
  sound: z.object({ enabled: z.boolean(), volume: z.number().min(0).max(1) }),
})

export function readProfileName(db: DatabaseSync): string | null {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(PROFILE_NAME) as
    { value: string } | undefined
  if (!row) return null
  try {
    const value: unknown = JSON.parse(row.value)
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
  } catch {
    return null
  }
}

export function saveProfileName(db: DatabaseSync, name: string | null): void {
  const trimmed = name?.trim() ?? ''
  if (trimmed === '') {
    db.prepare('DELETE FROM setting WHERE key = ?').run(PROFILE_NAME)
    return
  }
  db.prepare(
    `INSERT INTO setting (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(PROFILE_NAME, JSON.stringify(trimmed))
}

export function readNotificationSettings(db: DatabaseSync): NotificationSettings {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(NOTIFICATION_SETTINGS) as
    { value: string } | undefined
  if (!row) return DEFAULT_NOTIFICATION_SETTINGS
  try {
    const parsed = notificationSettingsSchema.safeParse(JSON.parse(row.value))
    if (!parsed.success) return DEFAULT_NOTIFICATION_SETTINGS
    return {
      ...parsed.data,
      enabledPlatforms: {
        ...DEFAULT_NOTIFICATION_SETTINGS.enabledPlatforms,
        ...parsed.data.enabledPlatforms,
      },
    }
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS
  }
}

function saveNotificationSettings(db: DatabaseSync, settings: NotificationSettings): void {
  db.prepare(
    `INSERT INTO setting (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(NOTIFICATION_SETTINGS, JSON.stringify(settings))
}

export function updateNotificationSettings(
  db: DatabaseSync,
  patch: NotificationSettingsPatch,
): NotificationSettings {
  const current = readNotificationSettings(db)
  const settings: NotificationSettings = {
    ...current,
    ...patch,
    enabledPlatforms: { ...current.enabledPlatforms, ...patch.enabledPlatforms },
    sound: { ...current.sound, ...patch.sound },
  }
  saveNotificationSettings(db, settings)
  return settings
}

export function readOnboardingCompleted(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(ONBOARDING_COMPLETED) as
    { value: string } | undefined
  if (!row) return false
  try {
    return JSON.parse(row.value) === true
  } catch {
    return false
  }
}

export function saveOnboardingCompleted(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO setting (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(ONBOARDING_COMPLETED, JSON.stringify(true))
}

export function readLogLevel(db: DatabaseSync): LogLevel {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(LOG_LEVEL) as
    { value: string } | undefined
  if (!row) return 'info'
  try {
    const parsed = z.enum(LOG_LEVELS).safeParse(JSON.parse(row.value))
    return parsed.success ? parsed.data : 'info'
  } catch {
    return 'info'
  }
}

export function saveLogLevel(db: DatabaseSync, level: LogLevel): void {
  db.prepare(
    `INSERT INTO setting (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(LOG_LEVEL, JSON.stringify(level))
}
