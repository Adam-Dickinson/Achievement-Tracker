/// <reference types="vite/client" />

import type { AchievementTrackerApi } from '@shared/ipc'

declare global {
  interface Window {
    api: AchievementTrackerApi
  }
}
