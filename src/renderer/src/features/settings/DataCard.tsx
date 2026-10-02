import { useId, useState } from 'react'
import { Button } from '@/components/Button'
import { plural } from '@/lib/format'
import type { ExportResult } from '@shared/ipc'

export function DataCard() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const id = useId()

  async function exportData() {
    setBusy(true)
    setResult(null)
    try {
      setResult(await window.api.exportData())
    } catch {
      setResult({ kind: 'failed', message: 'Something went wrong. Try again.' })
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
          Your data
        </h2>
        <p className="text-sm text-fg-muted">
          Save your games, achievements and unlock history to a JSON file. It holds no passwords,
          keys or platform account ids.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" disabled={busy} onClick={() => void exportData()}>
          {busy ? 'Saving…' : 'Export data…'}
        </Button>
      </div>

      {result?.kind === 'saved' && (
        <p role="status" className="text-sm text-fg-muted">
          Saved {plural(result.games, 'game')} and {plural(result.achievements, 'achievement')} to{' '}
          {result.path}
        </p>
      )}
      {result?.kind === 'failed' && (
        <p role="alert" className="text-sm text-danger">
          {result.message}
        </p>
      )}
    </section>
  )
}
