import { useId, useState } from 'react'
import { Button } from '@/components/Button'
import { useUpdateState } from '@/features/updates/useUpdateState'
import type { UpdateState } from '@shared/updates'

function statusText(state: UpdateState): string {
  switch (state.status) {
    case 'disabled':
      return 'Updates are available in the installed app.'
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Version ${state.version} is available.`
    case 'downloading':
      return `Downloading version ${state.version}…`
    case 'ready':
      return `Version ${state.version} is ready to install.`
    case 'error':
      return ''
    case 'idle':
      return state.lastCheckedAt === null ? 'No update check has run yet.' : 'You are up to date.'
  }
}

export function UpdatesCard() {
  const { state, apply } = useUpdateState()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const id = useId()

  async function run(action: () => Promise<UpdateState | void>) {
    setBusy(true)
    setFailed(false)
    try {
      const next = await action()
      if (next) apply(next)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-5 shadow-float"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
          Updates
        </h2>
        {state && <p className="text-sm text-fg-muted">Trophy Locker {state.currentVersion}</p>}
      </div>

      {state && (
        <>
          {statusText(state) !== '' && <p className="text-sm">{statusText(state)}</p>}
          {state.status === 'error' && (
            <p role="alert" className="text-sm text-danger">
              {state.message ?? 'Could not check for updates.'}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={
                busy ||
                state.status === 'disabled' ||
                state.status === 'checking' ||
                state.status === 'downloading'
              }
              onClick={() => void run(() => window.api.checkForUpdates())}
            >
              Check now
            </Button>
            {state.status === 'available' && (
              <Button disabled={busy} onClick={() => void run(() => window.api.downloadUpdate())}>
                Download
              </Button>
            )}
            {state.status === 'ready' && (
              <Button disabled={busy} onClick={() => void run(() => window.api.installUpdate())}>
                Restart and update
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <label className="flex items-center gap-2 text-fg">
              <input
                type="checkbox"
                className="accent-primary"
                checked={state.autoCheck}
                disabled={busy}
                aria-describedby={`${id}-auto-note`}
                onChange={(event) => void run(() => window.api.setAutoCheck(event.target.checked))}
              />
              Automatically check for updates
            </label>
            <p id={`${id}-auto-note`} className="text-fg-muted">
              Checking contacts github.com to read the list of releases and sends nothing else about
              you or your library. Turn it off to stop all update traffic; you can still check by
              hand.
            </p>
          </div>
        </>
      )}

      {failed && (
        <p role="alert" className="text-sm text-danger">
          Something went wrong. Try again.
        </p>
      )}
    </section>
  )
}
