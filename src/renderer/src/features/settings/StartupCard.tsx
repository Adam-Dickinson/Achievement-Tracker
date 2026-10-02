import { useEffect, useId, useState } from 'react'
import type { StartupSettings } from '@shared/logs'

export function StartupCard() {
  const [settings, setSettings] = useState<StartupSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const id = useId()

  useEffect(() => {
    let cancelled = false
    void window.api.getStartupSettings().then((data) => {
      if (!cancelled) setSettings(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function change(on: boolean) {
    setBusy(true)
    setFailed(false)
    try {
      setSettings(await window.api.setStartWithWindows(on))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
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
      {failed && (
        <p role="alert" className="text-sm text-danger">
          Could not change this setting.
        </p>
      )}
    </section>
  )
}
