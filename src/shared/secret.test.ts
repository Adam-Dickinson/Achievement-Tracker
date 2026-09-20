import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { Secret } from './secret'
import { InMemorySecretStore } from './secret-store'

const TOKEN = 'super-secret-token'

describe('Secret', () => {
  it('only reveals its value through expose()', () => {
    expect(new Secret(TOKEN).expose()).toBe(TOKEN)
  })

  it('is redacted in strings, JSON and console output', () => {
    const secret = new Secret(TOKEN)
    const credentials = { platform: 'steam', secret }

    expect(`${secret}`).not.toContain(TOKEN)
    expect(JSON.stringify(credentials)).not.toContain(TOKEN)
    expect(inspect(credentials)).not.toContain(TOKEN)
  })
})

describe('InMemorySecretStore', () => {
  it('round-trips a secret', () => {
    const store = new InMemorySecretStore()
    expect(store.find('a')).toBeUndefined()

    store.save('a', new Secret('v'))
    expect(store.find('a')?.expose()).toBe('v')

    store.delete('a')
    expect(store.find('a')).toBeUndefined()
  })
})
