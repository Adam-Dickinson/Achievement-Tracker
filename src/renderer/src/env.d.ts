/// <reference types="vite/client" />

import type { AchievementTrackerApi } from '@shared/ipc'

declare global {
  interface Window {
    /** Exposed by the preload script (src/preload/index.ts). */
    api: AchievementTrackerApi
  }
}
