export type SignInFailure = 'cancelled' | 'timed_out' | 'denied'

export class SignInError extends Error {
  readonly reason: SignInFailure

  constructor(reason: SignInFailure, message: string) {
    super(message)
    this.name = 'SignInError'
    this.reason = reason
  }
}
