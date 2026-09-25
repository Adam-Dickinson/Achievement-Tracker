import { useId, useState } from 'react'
import { Button } from '@/components/Button'
import { SteamConnectForm } from './SteamConnectForm'

interface SteamConnectCardProps {
  onConnected: () => void
}

export function SteamConnectCard({ onConnected }: SteamConnectCardProps) {
  const [includeFamily, setIncludeFamily] = useState(true)
  const [accepted, setAccepted] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  async function handleSignIn() {
    setWaiting(true)
    setError(null)

    try {
      const result = await window.api.signInToSteam({ includeFamily, acceptedUnofficial: true })
      if (result.ok) {
        setAccepted(false)
        onConnected()
      } else {
        setError(result.message)
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setWaiting(false)
    }
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-5 shadow-float"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
          Connect Steam
        </h2>
        <p className="text-sm text-fg-muted">
          A window opens with Steam’s own sign-in page. Sign in there (and approve it in Steam
          Guard); this app never sees your password. It then reads your Steam Web API key from your
          account, which it uses for all your achievements.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          className="mt-0.5 accent-primary"
          checked={includeFamily}
          onChange={(event) => setIncludeFamily(event.target.checked)}
          disabled={waiting}
        />
        <span>
          Also add my Steam family library: every game shared with me, played or not. This keeps
          Steam’s sign-in, which can act as your account on Steam’s website, and uses it only to
          read the family library.
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          className="accent-primary"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          disabled={waiting}
        />
        I understand signing in here is unofficial and may stop working if Steam changes it.
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!accepted || waiting} onClick={() => void handleSignIn()}>
          {waiting ? 'Signing in…' : 'Sign in with Steam'}
        </Button>
        {waiting && (
          <>
            <p role="status" className="text-sm text-fg-muted">
              Waiting for you to sign in in the Steam window…
            </p>
            <Button variant="secondary" onClick={() => void window.api.cancelSteamSignIn()}>
              Cancel
            </Button>
          </>
        )}
      </div>

      <details className="rounded-control border border-line bg-surface-2/40 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-fg-muted">
          Use an API key instead
        </summary>
        <div className="mt-3">
          <SteamConnectForm onConnected={onConnected} />
        </div>
      </details>
    </section>
  )
}
