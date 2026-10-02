import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/updates'

export function useUpdateState(): {
  state: UpdateState | null
  apply: (state: UpdateState) => void
} {
  const [state, setState] = useState<UpdateState | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.getUpdateState().then(
      (current) => {
        if (!cancelled) setState((existing) => existing ?? current)
      },
      () => undefined,
    )
    const unsubscribe = window.api.onUpdateStateChanged(setState)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return { state, apply: setState }
}
