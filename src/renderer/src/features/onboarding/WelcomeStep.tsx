import { Button } from '@/components/Button'

interface WelcomeStepProps {
  onNext: () => void
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <h1 className="font-display text-5xl font-extrabold">Welcome to Trophy Locker</h1>
      <p className="max-w-140 text-lg text-fg-muted">
        Track every achievement and trophy across Steam, Xbox, PlayStation, Epic, Ubisoft, EA and
        your emulators, in one place, with a toast the moment you unlock one.
      </p>
      <Button onClick={onNext}>Get started</Button>
    </div>
  )
}
