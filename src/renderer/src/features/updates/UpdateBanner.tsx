import { Button } from '@/components/Button'
import type { UpdateState } from '@shared/updates'
import { useUpdateState } from './useUpdateState'

export function UpdateBanner() {
  const { state, apply } = useUpdateState()
  if (state === null) return null

  const { status, version, percent, dismissed } = state

  async function run(action: () => Promise<UpdateState | void>) {
    try {
      const next = await action()
      if (next) apply(next)
    } catch {
      return
    }
  }

  const shell =
    'mx-auto mt-4 flex w-[calc(100%-48px)] max-w-348 flex-wrap items-center gap-3 rounded-panel border border-line bg-surface-1 px-5 py-3 text-sm'

  if (status === 'available' && !dismissed) {
    return (
      <div role="status" className={shell}>
        <span className="flex-1 text-fg">Version {version} is available.</span>
        <Button onClick={() => void run(() => window.api.downloadUpdate())}>Download</Button>
        <Button variant="secondary" onClick={() => void run(() => window.api.dismissUpdate())}>
          Later
        </Button>
      </div>
    )
  }

  if (status === 'downloading') {
    return (
      <div role="status" className={shell}>
        <span className="flex-1 text-fg">Downloading version {version}…</span>
        <progress max={100} value={percent ?? 0} className="w-48 accent-primary" />
      </div>
    )
  }

  if (status === 'ready') {
    return (
      <div role="status" className={shell}>
        <span className="flex-1 text-fg">Version {version} is ready to install.</span>
        <Button onClick={() => void run(() => window.api.installUpdate())}>
          Restart and update
        </Button>
      </div>
    )
  }

  return null
}
