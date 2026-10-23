export type NotificationState =
  | 'normal'
  | 'exclusive-fullscreen'
  | 'busy'
  | 'presentation'
  | 'quiet-time'
  | 'not-present'
  | 'app'
  | 'unknown'

export type Delivery = 'overlay' | 'native'

export type QueryNotificationState = () => number | null

const WINDOWS_STATES: Readonly<Record<number, NotificationState>> = {
  1: 'not-present',
  2: 'busy',
  3: 'exclusive-fullscreen',
  4: 'presentation',
  5: 'normal',
  6: 'quiet-time',
  7: 'app',
}

const S_OK = 0

export function stateFromWindows(value: number | null): NotificationState {
  return value === null ? 'unknown' : (WINDOWS_STATES[value] ?? 'unknown')
}

export function chooseDelivery(state: NotificationState, fallback: boolean): Delivery {
  return fallback && state === 'exclusive-fullscreen' ? 'native' : 'overlay'
}

export class NotificationStateReader {
  readonly #load: () => Promise<QueryNotificationState>
  #query: QueryNotificationState | null = null

  constructor(load: () => Promise<QueryNotificationState> = loadShell32Query) {
    this.#load = load
  }

  async start(): Promise<void> {
    try {
      this.#query = await this.#load()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(`Full-screen check: unavailable, toasts always use the overlay (${reason})`)
    }
  }

  read(): NotificationState {
    if (this.#query === null) return 'unknown'
    try {
      return stateFromWindows(this.#query())
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(`Full-screen check: the Windows call failed (${reason})`)
      return 'unknown'
    }
  }
}

export async function loadShell32Query(): Promise<QueryNotificationState> {
  const { load } = await import('koffi')
  const query = load('shell32.dll').func(
    'long __stdcall SHQueryUserNotificationState(_Out_ int *pquns)',
  ) as (state: number[]) => number
  return () => {
    const state = [0]
    return query(state) === S_OK ? (state[0] ?? null) : null
  }
}
