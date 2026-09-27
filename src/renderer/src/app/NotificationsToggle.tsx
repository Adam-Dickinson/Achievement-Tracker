import { Bell, BellOff } from 'lucide-react'
import { useNotificationsPaused } from './useNotificationsPaused'

export function NotificationsToggle() {
  const paused = useNotificationsPaused()
  const Icon = paused ? BellOff : Bell

  return (
    <button
      type="button"
      aria-label="Pause notifications"
      aria-pressed={paused ?? false}
      title={
        paused ? 'Notifications are paused. Click to turn them back on.' : 'Pause notifications'
      }
      disabled={paused === null}
      onClick={() => void window.api.setNotificationsPaused(!paused)}
      className={`flex size-10 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        paused
          ? 'bg-warning/15 text-warning hover:bg-warning/25'
          : 'bg-white/6 text-fg-muted hover:bg-white/10 hover:text-fg'
      }`}
    >
      <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}
