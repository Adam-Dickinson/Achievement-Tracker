import { z } from 'zod'
import { ProviderError } from '@shared/errors'
import type { RemoteAchievement } from '@shared/models'
import { childrenNamed, childText, parseXml, type XmlElement } from '../xml'

export const MAX_TROPCONF_BYTES = 1024 * 1024
export const MAX_USERNAME_BYTES = 256

const NP_COMM_ID = /^NPWR\d{5}_\d{2}$/

const TIERS = { P: 'platinum', G: 'gold', S: 'silver', B: 'bronze' } as const

const trophySchema = z.looseObject({
  id: z.string().regex(/^\d{1,4}$/),
  hidden: z.enum(['yes', 'no']),
  ttype: z.enum(['P', 'G', 'S', 'B']),
})

export interface TrophyList {
  readonly npCommId: string
  readonly title: string | null
  readonly achievements: readonly RemoteAchievement[]
}

export function achievementId(trophyId: number): string {
  return String(trophyId).padStart(3, '0')
}

export function parseTrophyList(source: string): TrophyList {
  if (source.length > MAX_TROPCONF_BYTES) {
    throw new ProviderError('parse', 'RPCS3: the trophy list is too large')
  }
  const root = parseXml(source, 'RPCS3 trophy list')
  if (root.name !== 'trophyconf') {
    throw new ProviderError('parse', `RPCS3: expected <trophyconf>, found <${root.name}>`)
  }
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

export function parseUserName(source: string): string | null {
  return source.slice(0, MAX_USERNAME_BYTES).trim() || null
}

function npCommIdOf(root: XmlElement): string {
  const id = childText(root, 'npcommid')
  if (id === null || !NP_COMM_ID.test(id)) {
    throw new ProviderError('parse', 'RPCS3: the trophy list has no valid <npcommid>')
  }
  return id
}

function trophiesOf(root: XmlElement) {
  const seen = new Set<string>()
  return childrenNamed(root, 'trophy').map((element) => {
    const parsed = trophySchema.safeParse(element.attributes)
    if (!parsed.success) {
      throw new ProviderError('parse', 'RPCS3: a <trophy> has missing or unexpected attributes')
    }
    const attributes = { ...parsed.data, id: achievementId(Number(parsed.data.id)) }
    if (seen.has(attributes.id)) {
      throw new ProviderError('parse', `RPCS3: trophy ${attributes.id} appears twice`)
    }
    seen.add(attributes.id)
    return { element, attributes }
  })
}
