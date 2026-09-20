const REDACTED = 'Secret(<redacted>)'

/**
 * A token or API key. Every way of turning it into text (string interpolation, JSON,
 * console.log) yields a redacted placeholder, so a secret can't leak into logs by accident.
 * The only way to read it is the explicit `expose()`.
 */
export class Secret {
  readonly #value: string

  constructor(value: string) {
    this.#value = value
  }

  expose(): string {
    return this.#value
  }

  toString(): string {
    return REDACTED
  }

  toJSON(): string {
    return REDACTED
  }

  // Controls how console.log / util.inspect display the object in Node.
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED
  }
}
