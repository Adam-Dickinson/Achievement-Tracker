import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import type { EmulatorProgram } from '@shared/launch'

const SOURCE_LABEL: Record<NonNullable<EmulatorProgram['source']>, string> = {
  found: 'Found next to the data folder',
  chosen: 'Chosen by you',
}

export function EmulatorProgramRow() {
  const [program, setProgram] = useState<EmulatorProgram | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    function load() {
      window.api.getEmulatorPrograms().then(
        (programs) => {
          if (!cancelled) setProgram(programs.find((p) => p.emulator === 'rpcs3') ?? null)
        },
        () => {
          if (!cancelled) setError('Could not read the emulator program.')
        },
      )
    }
    load()
    const stopListening = window.api.onInstalledChanged(load)
    return () => {
      cancelled = true
      stopListening()
    }
  }, [])

  async function choose() {
    setBusy(true)
    setError(null)
    try {
      setProgram(await window.api.chooseEmulatorProgram('rpcs3'))
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface-1 p-4">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-fg-muted">Emulator program</p>
        {program?.path ? (
          <>
            <p className="truncate text-sm" title={program.path}>
              {program.path}
            </p>
            {program.source && (
              <p className="text-[13px] text-fg-muted">{SOURCE_LABEL[program.source]}</p>
            )}
          </>
        ) : (
          program && (
            <>
              <p className="text-sm">Not found</p>
              <p className="text-[13px] text-fg-muted">
                Choose rpcs3.exe so games can be started from here.
              </p>
            </>
          )
        )}
      </div>
      <div>
        <Button
          variant="secondary"
          aria-label="Choose the RPCS3 program"
          disabled={busy}
          onClick={() => void choose()}
        >
          Choose…
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
