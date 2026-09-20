import type { Secret } from './secret'

/**
 * Where tokens and API keys live. Production will encrypt them with Electron's `safeStorage`
 * (Windows DPAPI) in M1; tests use {@link InMemorySecretStore}. Secrets must never be written
 * to SQLite, config files or logs.
 */
export interface SecretStore {
  find(key: string): Secret | undefined
  save(key: string, value: Secret): void
  delete(key: string): void
}

export class InMemorySecretStore implements SecretStore {
  readonly #items = new Map<string, Secret>()

  find(key: string): Secret | undefined {
    return this.#items.get(key)
  }

  save(key: string, value: Secret): void {
    this.#items.set(key, value)
  }

  delete(key: string): void {
    this.#items.delete(key)
  }
}
