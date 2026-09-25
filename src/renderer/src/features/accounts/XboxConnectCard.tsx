import { useId, useState } from 'react'
import { Button } from '@/components/Button'

interface XboxConnectCardProps {
  onConnected: () => void
}

export function XboxConnectCard({ onConnected }: XboxConnectCardProps) {
  const [accepted, setAccepted] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  async function handleConnect() {
    setWaiting(true)
    setError(null)

    try {
      const result = await window.api.connectXbox({ acceptedUnofficial: true })
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
          Connect Xbox
        </h2>
        <p className="text-sm text-fg-muted">
          You sign in with Microsoft in your browser, so this app never sees your password. The Xbox
          connection uses services Microsoft doesn’t officially offer to other apps, so it could
          stop working if Microsoft changes them.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          disabled={waiting}
        />
        I understand this connection is unofficial and may stop working if Microsoft changes it.
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!accepted || waiting} onClick={() => void handleConnect()}>
          {waiting ? 'Signing in…' : 'Sign in with Microsoft'}
        </Button>
        {waiting && (
          <>
            <p role="status" className="text-sm text-fg-muted">
              Waiting for you to sign in in your browser…
            </p>
            <Button variant="secondary" onClick={() => void window.api.cancelXboxSignIn()}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
