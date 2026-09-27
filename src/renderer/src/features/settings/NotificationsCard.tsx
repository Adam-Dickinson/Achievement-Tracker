import { useId } from 'react'
import { Button } from '@/components/Button'

export function NotificationsCard() {
  const id = useId()

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-5 shadow-float"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
          Notifications
        </h2>
        <p className="text-sm text-fg-muted">
          See how an unlock toast looks over whatever is on your screen. The bell in the top bar
          pauses notifications, like Pause notifications in the tray.
        </p>
      </div>
      <div>
        <Button onClick={() => void window.api.sendTestNotification()}>Send test toast</Button>
      </div>
    </section>
  )
}
