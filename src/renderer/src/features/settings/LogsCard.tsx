import { ListFilter, ScrollText } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/Button'
import { Select, type SelectOption } from '@/components/Select'
import type { LogEntry, LogLevel } from '@shared/logs'

const LEVEL_OPTIONS: readonly SelectOption<LogLevel>[] = [
  { id: 'debug', label: 'Debug' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warnings' },
  { id: 'error', label: 'Errors' },
]

const LEVEL_TEXT: Record<LogLevel, string> = {
  debug: 'Debug',
  info: 'Info',
  warn: 'Warning',
  error: 'Error',
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: 'text-fg-subtle',
  info: 'text-fg-muted',
  warn: 'text-warning',
  error: 'text-danger',
}

export function LogsCard() {
  const [level, setLevel] = useState<LogLevel>('info')
  const [shown, setShown] = useState<LogLevel>('info')
  const [entries, setEntries] = useState<readonly LogEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [version, setVersion] = useState(0)
  const id = useId()

  useEffect(() => {
    let cancelled = false
    void window.api.getLogSettings().then((settings) => {
      if (!cancelled) setLevel(settings.level)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void window.api.readLogs(shown).then(
      (data) => {
        if (cancelled) return
        setEntries(data)
        setFailed(false)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [shown, version])

  async function changeLevel(next: LogLevel) {
    const saved = await window.api.setLogLevel(next)
    setLevel(saved.level)
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-5 shadow-float"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
          Logs
        </h2>
        <p className="text-sm text-fg-muted">
          The app keeps a rolling log of what it does, with passwords, keys and tokens removed. It
          stays on this PC; attach it to a bug report if you want help.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          label="Logging level"
          icon={ScrollText}
          options={LEVEL_OPTIONS}
          value={level}
          onChange={(next) => void changeLevel(next)}
        />
        <Select
          label="Show entries from"
          icon={ListFilter}
          options={LEVEL_OPTIONS}
          value={shown}
          onChange={setShown}
        />
        <Button variant="secondary" onClick={() => setVersion((v) => v + 1)}>
          Refresh
        </Button>
        <Button variant="secondary" onClick={() => void window.api.openLogsFolder()}>
          Open logs folder
        </Button>
      </div>

      {failed && (
        <p role="alert" className="text-sm text-danger">
          Could not read the log.
        </p>
      )}

      {!failed && entries !== null && entries.length === 0 && (
        <p className="text-sm text-fg-muted">Nothing logged at this level yet.</p>
      )}

      {entries !== null && entries.length > 0 && (
        <ol
          aria-label="Log entries"
          className="flex max-h-96 flex-col gap-2 overflow-auto rounded-control bg-canvas p-3 text-[13px]"
        >
          {entries.map((entry, index) => (
            <li key={`${entry.time}-${index}`} className="flex flex-col gap-1">
              <div className="flex flex-wrap gap-x-3">
                <time dateTime={entry.time} className="text-fg-subtle">
                  {new Date(entry.time).toLocaleTimeString()}
                </time>
                <span className={`font-semibold ${LEVEL_COLOR[entry.level]}`}>
                  {LEVEL_TEXT[entry.level]}
                </span>
                <span className="min-w-0 break-words text-fg">{entry.message}</span>
              </div>
              {entry.data !== undefined && (
                <details className="text-fg-muted">
                  <summary className="cursor-pointer">Details</summary>
                  <pre className="mt-1 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(entry.data, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
