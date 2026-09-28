import { useState } from 'react'
import logo from '@/assets/logo.svg'
import type { Platform } from '@shared/platform'
import { DoneStep } from './DoneStep'
import { PlatformsStep } from './PlatformsStep'
import { WelcomeStep } from './WelcomeStep'

type Step = 'welcome' | 'platforms' | 'done'

const STEPS: { id: Step; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'done', label: 'Done' },
]

interface OnboardingProps {
  onDone: () => void
}

export function Onboarding({ onDone }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<Platform>>(new Set())
  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="flex min-h-screen flex-col bg-aurora">
      <header className="mx-auto flex h-21 w-[calc(100%-48px)] max-w-348 items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" className="size-9" />
          <span className="font-display text-lg font-bold">Trophy Locker</span>
        </div>
        <button
          type="button"
          onClick={() => onDone()}
          className="rounded-full bg-white/6 px-4 py-2 text-sm font-semibold text-fg-muted hover:bg-white/10 hover:text-fg"
        >
          Skip setup
        </button>
      </header>

      <ol className="mx-auto mt-4 flex items-center gap-3" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3">
            <span
              aria-current={s.id === step ? 'step' : undefined}
              className={`flex size-8 items-center justify-center rounded-full text-sm font-bold ${
                i <= stepIndex ? 'bg-primary text-on-primary' : 'bg-white/8 text-fg-subtle'
              }`}
            >
              {i < stepIndex ? '✓' : i + 1}
            </span>
            <span className={i <= stepIndex ? 'text-fg' : 'text-fg-subtle'}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="h-0.5 w-10 rounded-full bg-white/10" />}
          </li>
        ))}
      </ol>

      <main className="mx-auto mt-10 w-[calc(100%-48px)] max-w-348 flex-1 pb-20">
        {step === 'welcome' && <WelcomeStep onNext={() => setStep('platforms')} />}
        {step === 'platforms' && (
          <PlatformsStep
            connectedPlatforms={connectedPlatforms}
            onPlatformConnected={(platform) =>
              setConnectedPlatforms((current) => new Set(current).add(platform))
            }
            onBack={() => setStep('welcome')}
            onContinue={() => setStep('done')}
          />
        )}
        {step === 'done' && <DoneStep connectedCount={connectedPlatforms.size} onDone={onDone} />}
      </main>
    </div>
  )
}
