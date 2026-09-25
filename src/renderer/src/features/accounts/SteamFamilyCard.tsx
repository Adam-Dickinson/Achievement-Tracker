import { useId, useState } from 'react'
import { Button } from '@/components/Button'

interface SteamFamilyCardProps {
  steamConnected: boolean
  onConnected: () => void
}

export function SteamFamilyCard({ steamConnected, onConnected }: SteamFamilyCardProps) {
  const [accepted, setAccepted] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)
  const id = useId()

  async function handleConnect() {
    setWaiting(true)
    setError(null)
    setAdded(false)

    try {
      const result = await window.api.connectSteamFamily({ acceptedUnofficial: true })
      if (result.ok) {
        setAccepted(false)
        setAdded(true)
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
          Add your Steam family library
        </h2>
        <p className="text-sm text-fg-muted">
          Adds every game shared with you through Steam Families, including ones you haven’t played
          yet. A window opens with Steam’s own sign-in page; sign in with the account connected
          above. This app never stores your password, but it does keep Steam’s sign-in, which can
          act as your account on Steam’s website, so it only ever uses it to read your family
          library. The family library uses Steam services Valve doesn’t offer to other apps, so it
          could stop working if Steam changes them.
        </p>
      </div>

      {!steamConnected && (
        <p className="text-sm text-fg-muted">Connect your Steam account first.</p>
      )}

      <label className="flex items-center gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          className="accent-primary"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          disabled={waiting || !steamConnected}
        />
        I understand this connection is unofficial and that Steam’s sign-in is kept.
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {added && (
        <p role="status" className="text-sm text-success">
          Family library added. Its games appear once Steam has been checked, in a minute or so.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!accepted || waiting || !steamConnected}
          onClick={() => void handleConnect()}
        >
          {waiting ? 'Signing in…' : 'Sign in with Steam'}
        </Button>
        {waiting && (
          <>
            <p role="status" className="text-sm text-fg-muted">
              Waiting for you to sign in in the Steam window…
            </p>
            <Button variant="secondary" onClick={() => void window.api.cancelSteamFamilySignIn()}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
