import { describe, expect, it } from 'vitest'
import { RARITY_LABEL, type Rarity } from '@shared/rarity'
import css from './index.css?raw'

const RARITIES = Object.keys(RARITY_LABEL) as Rarity[]
const VARIABLES = ['--rarity', '--rarity-light', '--rarity-dark', '--rarity-on']

function scopeRule(rarity: Rarity): string | undefined {
  return new RegExp(`\\[data-rarity='${rarity}'\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1]
}

describe('the rarity scope in index.css', () => {
  it.each(RARITIES)('defines every rarity variable for %s', (rarity) => {
    const rule = scopeRule(rarity)

    expect(rule, `index.css has no [data-rarity='${rarity}'] rule`).toBeDefined()
    for (const variable of VARIABLES) expect(rule).toContain(`${variable}:`)
  })
})
