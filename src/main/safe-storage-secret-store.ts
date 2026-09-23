import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { SafeStorage } from 'electron'
import { z } from 'zod'
import { Secret } from '@shared/secret'
import type { SecretStore } from '@shared/secret-store'

type Encryptor = Pick<SafeStorage, 'isEncryptionAvailable' | 'encryptString' | 'decryptString'>

const fileSchema = z.record(z.string(), z.string())

export class SafeStorageSecretStore implements SecretStore {
  readonly #path: string
  readonly #encryptor: Encryptor

  constructor(path: string, encryptor: Encryptor) {
    this.#path = path
    this.#encryptor = encryptor
  }

  find(key: string): Secret | undefined {
    const encrypted = this.#read().get(key)
    if (encrypted === undefined) return undefined
    try {
      return new Secret(this.#encryptor.decryptString(Buffer.from(encrypted, 'base64')))
    } catch {
      // Encrypted by another Windows user or PC: the user has to enter it again.
      return undefined
    }
  }

  save(key: string, value: Secret): void {
    if (!this.#encryptor.isEncryptionAvailable()) {
      throw new Error('Cannot save a secret: OS encryption is not available')
    }
    const items = this.#read()
    items.set(key, this.#encryptor.encryptString(value.expose()).toString('base64'))
    this.#write(items)
  }

  delete(key: string): void {
    const items = this.#read()
    if (items.delete(key)) this.#write(items)
  }

  #read(): Map<string, string> {
    if (!existsSync(this.#path)) return new Map()
    try {
      return new Map(Object.entries(fileSchema.parse(JSON.parse(readFileSync(this.#path, 'utf8')))))
    } catch (error) {
      throw new Error(`The secret store at ${this.#path} is unreadable`, { cause: error })
    }
  }

  #write(items: ReadonlyMap<string, string>): void {
    const temp = `${this.#path}.tmp`
    writeFileSync(temp, JSON.stringify(Object.fromEntries(items), null, 2), { mode: 0o600 })
    renameSync(temp, this.#path)
  }
}
