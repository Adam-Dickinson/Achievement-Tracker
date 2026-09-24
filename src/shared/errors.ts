export type ProviderErrorKind =
  | 'auth_expired'
  /** The platform asked us to slow down: back off. */
  | 'rate_limited'
  /** Transient network failure: retry with backoff. */
  | 'network'
  /** The response or file wasn't in the expected shape. */
  | 'parse'
  /** This provider can't do that (e.g. no public API). */
  | 'unsupported'
  | 'other'

interface ProviderErrorOptions {
  readonly retryAfterMs?: number
  readonly cause?: unknown
}

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind
  readonly retryAfterMs: number | null

  constructor(kind: ProviderErrorKind, message: string, options: ProviderErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'ProviderError'
    this.kind = kind
    this.retryAfterMs = options.retryAfterMs ?? null
  }

  get isRetryable(): boolean {
    return this.kind === 'network' || this.kind === 'rate_limited'
  }
}
