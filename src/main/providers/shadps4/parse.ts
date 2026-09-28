import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import type { RemoteAchievement, RemoteUnlock } from '@shared/models'
import { childrenNamed, childText, parseXml, type XmlElement } from '../xml'

export const MAX_TROPHY_FILE_BYTES = 1024 * 1024
export const MAX_SETTINGS_FILE_BYTES = 256 * 1024

const NP_COMM_ID = /^NPWR\d{5}_\d{2}$/

const TIERS = { P: 'platinum', G: 'gold', S: 'silver', B: 'bronze' } as const

const trophySchema = z.looseObject({
  id: z.string().regex(/^\d{1,4}$/),
  hidden: z.enum(['yes', 'no']),
  ttype: z.enum(['P', 'G', 'S', 'B']),
  unlockstate: z.enum(['true', 'false']).optional(),
  timestamp: z
    .string()
    .regex(/^\d{1,12}$/)
    .optional(),
})

const usersSchema = z.object({
  Users: z.object({
    user: z.array(
      z.looseObject({ user_id: z.number().int().nonnegative(), user_name: z.string() }),
    ),
  }),
})

const configSchema = z.looseObject({
  General: z.looseObject({ home_dir: z.string().optional() }).optional(),
})

export interface TrophyList {
  readonly npCommId: string
  readonly title: string | null
  readonly achievements: readonly RemoteAchievement[]
}

export interface UserTrophies {
  readonly npCommId: string
  readonly unlocks: readonly RemoteUnlock[]
}

export interface ShadPs4User {
  readonly id: string
  readonly name: string
}

export function parseTrophyList(source: string): TrophyList {
  const root = readTrophyConf(source)
  return {
    npCommId: npCommIdOf(root),
    title: childText(root, 'title-name') || null,
    achievements: trophiesOf(root).map(({ element, attributes }) => ({
      externalId: attributes.id,
      name: childText(element, 'name') || `Trophy ${attributes.id}`,
      description: childText(element, 'detail') || null,
      iconUrl: null,
      iconLockedUrl: null,
      hidden: attributes.hidden === 'yes',
      points: null,
      tier: TIERS[attributes.ttype],
      globalPercent: null,
    })),
  }
}

export function parseUserTrophies(source: string): UserTrophies {
  const root = readTrophyConf(source)
  return {
    npCommId: npCommIdOf(root),
    unlocks: trophiesOf(root)
      .filter(({ attributes }) => attributes.unlockstate === 'true')
      .map(({ attributes }) => ({
        achievementExternalId: attributes.id,
        unlockedAt: unlockTime(attributes.timestamp),
        progress: null,
      })),
  }
}

export function parseUsers(source: string): ShadPs4User[] {
  const parsed = usersSchema.safeParse(parseJson(source, 'users.json'))
  if (!parsed.success) throw new ProviderError('parse', 'shadPS4: users.json has no user list')
  return parsed.data.Users.user.map((user) => ({
    id: String(user.user_id),
    name: user.user_name.trim() || `User ${user.user_id}`,
  }))
}

export function parseHomeDir(source: string): string | null {
  const parsed = configSchema.safeParse(parseJson(source, 'config.json'))
  const homeDir = parsed.success ? parsed.data.General?.home_dir?.trim() : undefined
  return homeDir || null
}

function readTrophyConf(source: string): XmlElement {
  if (source.length > MAX_TROPHY_FILE_BYTES) {
    throw new ProviderError('parse', 'shadPS4: the trophy file is too large')
  }
  const root = parseXml(source, 'shadPS4 trophy file')
  if (root.name !== 'trophyconf') {
    throw new ProviderError('parse', `shadPS4: expected <trophyconf>, found <${root.name}>`)
  }
  return root
}

function npCommIdOf(root: XmlElement): string {
  const id = childText(root, 'npcommid')
  if (id === null || !NP_COMM_ID.test(id)) {
    throw new ProviderError('parse', 'shadPS4: the trophy file has no valid <npcommid>')
  }
  return id
}

function trophiesOf(root: XmlElement) {
  const seen = new Set<string>()
  return childrenNamed(root, 'trophy').map((element) => {
    const parsed = trophySchema.safeParse(element.attributes)
    if (!parsed.success) {
      throw new ProviderError('parse', 'shadPS4: a <trophy> has missing or unexpected attributes')
    }
    if (seen.has(parsed.data.id)) {
      throw new ProviderError('parse', `shadPS4: trophy ${parsed.data.id} appears twice`)
    }
    seen.add(parsed.data.id)
    return { element, attributes: parsed.data }
  })
}

function unlockTime(timestamp: string | undefined): Date | null {
  const seconds = timestamp === undefined ? 0 : Number(timestamp)
  return seconds > 0 ? new Date(seconds * 1000) : null
}

function parseJson(source: string, file: string): unknown {
  if (source.length > MAX_SETTINGS_FILE_BYTES) {
    throw new ProviderError('parse', `shadPS4: ${file} is too large`)
  }
  try {
    return JSON.parse(source)
  } catch (cause) {
    throw new ProviderError('parse', `shadPS4: ${file} is not valid JSON`, { cause })
  }
}
