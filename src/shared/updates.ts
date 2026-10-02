export const UPDATE_STATUSES = [
  'disabled',
  'idle',
  'checking',
  'available',
  'downloading',
  'ready',
  'error',
] as const

export type UpdateStatus = (typeof UPDATE_STATUSES)[number]

export const FIRST_CHECK_DELAY_MS = 10_000
export const CHECK_INTERVAL_MS = 6 * 60 * 60_000

export interface UpdateState {
  readonly status: UpdateStatus
  readonly currentVersion: string
  readonly version: string | null
  readonly percent: number | null
  readonly message: string | null
  readonly lastCheckedAt: string | null
  readonly autoCheck: boolean
  readonly dismissed: boolean
}

export interface UpdateSettings {
  readonly autoCheck: boolean
  readonly dismissedVersion: string | null
  readonly notifiedVersion: string | null
}
