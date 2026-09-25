/// <reference types="vite/client" />

import type { TrophyLockerApi } from '@shared/ipc'

declare global {
  interface Window {
    api: TrophyLockerApi
  }
}
