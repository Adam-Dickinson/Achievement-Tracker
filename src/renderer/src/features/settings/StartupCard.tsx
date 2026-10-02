import { useEffect, useId, useRef, useState } from 'react'
import type { StartupSettings } from '@shared/logs'

export function StartupCard() {
  const [settings, setSettings] = useState<StartupSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [unreadable, setUnreadable] = useState(false)
  const mounted = useRef(true)
  const id = useId()

  useEffect(() => {
    mounted.current = true
    window.api.getStartupSettings().then(
      (data) => {
        if (mounted.current) setSettings(data)
      },
      () => {
        if (mounted.current) setUnreadable(true)
      },
    )
    return () => {
      mounted.current = false
    }
  }, [])

  async function change(on: boolean) {
    setBusy(true)
    setFailed(false)
    try {
      const next = await window.api.setStartWithWindows(on)
      if (mounted.current) setSettings(next)
    } catch {
      if (mounted.current) setFailed(true)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const available = settings?.available ?? false

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-5 shadow-float"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
          Startup
        </h2>
        <p className="text-sm text-fg-muted">
          Opens Trophy Locker in the tray when you sign in, so unlocks are caught from the start.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-primary"
          checked={settings?.enabled ?? false}
          disabled={!available || busy}
          onChange={(event) => void change(event.target.checked)}
        />
        Start with Windows
      </label>

      {settings !== null && !available && (
        <p className="text-sm text-fg-muted">Available in the installed app.</p>
      )}
      {unreadable && (
        <p role="alert" className="text-sm text-danger">
          Could not read this setting.
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-danger">
          Could not change this setting.
        </p>
      )}
    </section>
  )
}
