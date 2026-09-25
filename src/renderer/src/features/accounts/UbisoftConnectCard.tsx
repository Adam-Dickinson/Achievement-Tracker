import { useId, useState } from 'react'
import { Button } from '@/components/Button'

interface UbisoftConnectCardProps {
  onConnected: () => void
}

export function UbisoftConnectCard({ onConnected }: UbisoftConnectCardProps) {
  const [accepted, setAccepted] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  async function handleConnect() {
    setWaiting(true)
    setError(null)

    try {
      const result = await window.api.connectUbisoft({ acceptedUnofficial: true })
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
          Connect Ubisoft
        </h2>
        <p className="text-sm text-fg-muted">
          A window opens with Ubisoft’s own sign-in page. Sign in there with your email and password
          (and your 2-step code, if you use one). This app never stores your password: it keeps only
          the “remember me” sign-in Ubisoft hands back. The Ubisoft connection uses the Ubisoft
          Connect launcher’s own services, which Ubisoft doesn’t offer to other apps, so it could
          stop working if Ubisoft changes them.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          className="accent-primary"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          disabled={waiting}
        />
        I understand this connection is unofficial and may stop working if Ubisoft changes it.
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!accepted || waiting} onClick={() => void handleConnect()}>
          {waiting ? 'Signing in…' : 'Sign in with Ubisoft'}
        </Button>
        {waiting && (
          <>
            <p role="status" className="text-sm text-fg-muted">
              Waiting for you to sign in in the Ubisoft window…
            </p>
            <Button variant="secondary" onClick={() => void window.api.cancelUbisoftSignIn()}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
