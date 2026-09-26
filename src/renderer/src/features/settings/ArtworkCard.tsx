import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/Button'
import type { ArtworkProblem, ArtworkRun, ArtworkSettings } from '@shared/ipc'

type Busy = 'saving' | 'finding' | null

interface Message {
  readonly tone: 'info' | 'error'
  readonly text: string
}

const PROBLEMS: Record<Exclude<ArtworkProblem, null>, string> = {
  key_refused: 'SteamGridDB refused the saved key. Paste a new one to keep finding artwork.',
  unreachable: "SteamGridDB couldn't be reached last time. The app will try again later.",
}

export function runSummary(run: ArtworkRun): string {
  if (run.checked === 0) return 'No games need looking up right now.'
  return `Found artwork for ${run.found} of ${run.checked} ${run.checked === 1 ? 'game' : 'games'}.`
}

export function ArtworkCard() {
  const [settings, setSettings] = useState<ArtworkSettings | null>(null)
  const [version, setVersion] = useState(0)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const id = useId()

  useEffect(() => {
    let cancelled = false
    void window.api.getArtworkSettings().then((data) => {
      if (!cancelled) setSettings(data)
    })
    return () => {
      cancelled = true
    }
  }, [version])

  useEffect(() => window.api.onDataChanged(() => setVersion((v) => v + 1)), [])

  async function act(kind: Exclude<Busy, null>, run: () => Promise<Message>) {
    setBusy(kind)
    setMessage(null)
    try {
      setMessage(await run())
    } catch {
      setMessage({ tone: 'error', text: 'Something went wrong. Try again.' })
    } finally {
      setBusy(null)
      setVersion((v) => v + 1)
    }
  }

  const save = () =>
    act('saving', async () => {
      const result = await window.api.saveSteamGridDbKey({ key })
      if (!result.ok) return { tone: 'error', text: result.message }
      setKey('')
      return { tone: 'info', text: 'Key saved. Looking for missing artwork…' }
    })

  const remove = () =>
    act('saving', async () => {
      await window.api.removeSteamGridDbKey()
      return { tone: 'info', text: 'Key removed. Games without artwork keep a generated cover.' }
    })

  const find = () =>
    act('finding', async () => ({
      tone: 'info',
      text: runSummary(await window.api.findMissingArtwork()),
    }))

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-5 shadow-float"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
          Artwork
        </h2>
        <p className="text-sm text-fg-muted">
          Games with no cover from their platform can get one from SteamGridDB, a community artwork
          site, when you add your free SteamGridDB API key (on steamgriddb.com: Profile →
          Preferences → API). The key is stored encrypted on this PC. Without a key, those games
          keep a generated cover.
        </p>
      </div>

      {settings && (
        <p className="text-sm">
          {settings.hasKey ? 'A SteamGridDB key is saved.' : 'No SteamGridDB key saved.'}{' '}
          {settings.missing === 0
            ? 'Every game has artwork.'
            : `${settings.missing} ${settings.missing === 1 ? 'game has' : 'games have'} no artwork yet.`}
        </p>
      )}
      {settings?.problem && (
        <p role="alert" className="text-sm text-warning">
          {PROBLEMS[settings.problem]}
        </p>
      )}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <label className="flex min-w-72 flex-1 flex-col gap-2 text-sm text-fg-muted">
          SteamGridDB API key
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            disabled={busy !== null}
            className="rounded-control border border-line bg-canvas px-3 py-2 text-fg"
          />
        </label>
        <Button type="submit" disabled={key.trim() === '' || busy !== null}>
          {busy === 'saving' ? 'Saving…' : 'Save key'}
        </Button>
      </form>

      {settings?.hasKey && (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={busy !== null} onClick={() => void find()}>
            {busy === 'finding' ? 'Looking…' : 'Find missing artwork now'}
          </Button>
          <Button variant="secondary" disabled={busy !== null} onClick={() => void remove()}>
            Remove key
          </Button>
        </div>
      )}

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`text-sm ${message.tone === 'error' ? 'text-danger' : 'text-fg-muted'}`}
        >
          {message.text}
        </p>
      )}
    </section>
  )
}
