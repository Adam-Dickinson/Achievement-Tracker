import { type FormEvent, useId, useState } from 'react'
import { Button } from '@/components/Button'

const INPUT =
  'rounded-control border border-line bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-primary'

interface EpicConnectCardProps {
  onConnected: () => void
}

export function EpicConnectCard({ onConnected }: EpicConnectCardProps) {
  const [accepted, setAccepted] = useState(false)
  const [code, setCode] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWaiting(true)
    setError(null)

    try {
      const result = await window.api.connectEpic({ code, acceptedUnofficial: true })
      setCode('')
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
    <form
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-5 shadow-float"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
          Connect Epic Games
        </h2>
        <p className="text-sm text-fg-muted">
          Sign in on Epic’s website in your browser, so this app never sees your password. Epic then
          shows a page with a code: copy it (or the whole page) and paste it below within a few
          minutes. The Epic connection uses the Epic launcher’s own services, which Epic doesn’t
          offer to other apps, so it could stop working if Epic changes them.
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
        I understand this connection is unofficial and may stop working if Epic changes it.
      </label>

      <Button
        type="button"
        variant="secondary"
        className="self-start"
        disabled={!accepted}
        onClick={() => void window.api.openEpicSignIn()}
      >
        Open Epic sign-in
      </Button>

      <label className="flex flex-col gap-1 text-sm text-fg-muted">
        Code from Epic
        <input
          className={INPUT}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="authorizationCode, or the whole page"
          autoComplete="off"
          spellCheck={false}
          disabled={waiting}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="self-start"
        disabled={!accepted || code.trim() === '' || waiting}
      >
        {waiting ? 'Connecting…' : 'Connect'}
      </Button>
    </form>
  )
}
