import { useEffect, useState } from 'react'

export function useOnboarding() {
  const [completed, setCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.getOnboardingCompleted().then((value) => {
      if (!cancelled) setCompleted(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const complete = async () => {
    await window.api.completeOnboarding()
    setCompleted(true)
  }

  return { completed, complete }
}
