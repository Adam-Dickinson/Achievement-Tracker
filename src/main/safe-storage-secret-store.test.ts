import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Secret } from '@shared/secret'
import { SafeStorageSecretStore } from './safe-storage-secret-store'

const KEY = '0123456789ABCDEF0123456789ABCDEF'

function fakeEncryptor(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain: string) => Buffer.from(`sealed:${[...plain].reverse().join('')}`),
    decryptString: (encrypted: Buffer) => {
      const text = encrypted.toString()
      if (!text.startsWith('sealed:')) throw new Error('Error while decrypting the ciphertext')
      return [...text.slice('sealed:'.length)].reverse().join('')
    },
  }
}

let dir: string
let path: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'secret-store-'))
  path = join(dir, 'secrets.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function store(encryptor = fakeEncryptor()): SafeStorageSecretStore {
  return new SafeStorageSecretStore(path, encryptor)
}

describe('SafeStorageSecretStore', () => {
  it('finds a secret it saved', () => {
    const secrets = store()

    secrets.save('1', new Secret(KEY))

    expect(secrets.find('1')?.expose()).toBe(KEY)
  })

  it('keeps secrets across a restart (a new instance on the same file)', () => {
    store().save('1', new Secret(KEY))

    expect(store().find('1')?.expose()).toBe(KEY)
  })

  it('keeps each key separate, and replaces a key saved twice', () => {
    const secrets = store()

    secrets.save('1', new Secret('first'))
    secrets.save('2', new Secret('second'))
    secrets.save('1', new Secret('replaced'))

    expect(secrets.find('1')?.expose()).toBe('replaced')
    expect(secrets.find('2')?.expose()).toBe('second')
  })

  it('writes only encrypted text to disk, never the plain secret', () => {
    store().save('1', new Secret(KEY))

    const file = readFileSync(path, 'utf8')
    expect(file).not.toContain(KEY)
    const saved = JSON.parse(file) as Record<string, string>
    expect(Buffer.from(saved['1'] ?? '', 'base64').toString()).toMatch(/^sealed:/)
  })

  it('leaves no temporary file behind', () => {
    store().save('1', new Secret(KEY))

    expect(existsSync(`${path}.tmp`)).toBe(false)
  })

  it('returns undefined for a key it doesn’t have, without creating the file', () => {
    expect(store().find('1')).toBeUndefined()
    expect(existsSync(path)).toBe(false)
  })

  it('returns undefined for names that exist on every object, like "constructor"', () => {
    store().save('1', new Secret(KEY))

    expect(store().find('constructor')).toBeUndefined()
  })

  it('deletes one secret and keeps the others', () => {
    const secrets = store()
    secrets.save('1', new Secret('one'))
    secrets.save('2', new Secret('two'))

    secrets.delete('1')

    expect(store().find('1')).toBeUndefined()
    expect(store().find('2')?.expose()).toBe('two')
  })

  it('does nothing when deleting a key it doesn’t have', () => {
    store().delete('1')

    expect(existsSync(path)).toBe(false)
  })

  it('refuses to save, and writes nothing, when OS encryption is unavailable', () => {
    expect(() => store(fakeEncryptor(false)).save('1', new Secret(KEY))).toThrow(/encryption/)
    expect(existsSync(path)).toBe(false)
  })

  it('returns undefined for a secret it can’t decrypt (from another user or PC)', () => {
    writeFileSync(path, JSON.stringify({ '1': Buffer.from('not ours').toString('base64') }))

    expect(store().find('1')).toBeUndefined()
  })

  it.each([
    ['not JSON', '{"1": '],
    ['not an object of strings', '{"1": 42}'],
    ['a list', '["sealed"]'],
  ])('throws a clear error for a file that is %s, and leaves it untouched', (_label, content) => {
    writeFileSync(path, content)
    const secrets = store()

    expect(() => secrets.find('1')).toThrow(/secret store .* is unreadable/)
    expect(() => secrets.save('1', new Secret(KEY))).toThrow(/unreadable/)
    expect(readFileSync(path, 'utf8')).toBe(content)
  })
})
