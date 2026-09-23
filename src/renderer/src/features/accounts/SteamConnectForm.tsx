import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'

interface SteamConnectFormProps {
  onConnected: () => void
}

const INPUT =
  'rounded-control border border-line bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-primary'

export function SteamConnectForm({ onConnected }: SteamConnectFormProps) {
  const [steamId, setSteamId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const result = await window.api.connectSteam({ steamId, apiKey })
      if (result.ok) {
        setSteamId('')
        setApiKey('')
        onConnected()
      } else {
        setError(result.message)
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
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
          Connect Steam
        </h2>
        <p className="text-sm text-fg-muted">
          Your SteamID64 is the 17-digit number starting 7656119, shown under Account details in
          Steam. Get a Steam API key at steamcommunity.com/dev/apikey. The key is encrypted on this
          PC and never shown again.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm text-fg-muted">
          SteamID64
          <input
            className={INPUT}
            value={steamId}
            onChange={(event) => setSteamId(event.target.value)}
            placeholder="7656119…"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-fg-muted">
          Steam API key
          <input
            className={INPUT}
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="32 letters and digits"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" className="self-start" disabled={submitting}>
        {submitting ? 'Connecting…' : 'Connect'}
      </Button>
    </form>
  )
}
