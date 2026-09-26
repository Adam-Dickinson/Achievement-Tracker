import { foldAccents } from '@shared/text'

const PLATFORM_TAG = /\s*\((?:PS3|PS4|PS5|PS Vita|PC)(?:\s*\/\s*(?:PS3|PS4|PS5|PS Vita|PC))*\)\s*$/
const YEAR_EDITION = /\b(?:game of the year|goty)(?: edition)?\b/g
const NAMED_EDITION =
  /\b(?:digital deluxe|deluxe|standard|complete|definitive|ultimate|gold|anniversary) edition\b/g

export function matchKey(title: string): string {
  return foldAccents(title.replace(PLATFORM_TAG, '').replace(/[®™©'’]/g, ''))
    .toLowerCase()
    .replace(YEAR_EDITION, ' ')
    .replace(NAMED_EDITION, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
