import type { Secret } from './secret'

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
