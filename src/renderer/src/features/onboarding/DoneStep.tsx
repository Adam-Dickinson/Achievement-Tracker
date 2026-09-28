import { CircleCheck } from 'lucide-react'
import { Button } from '@/components/Button'
import { plural } from '@/lib/format'

interface DoneStepProps {
  connectedCount: number
  onDone: () => void
}

export function DoneStep({ connectedCount, onDone }: DoneStepProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-success/15 text-success">
        <CircleCheck aria-hidden="true" className="size-8" />
      </span>
      <h1 className="font-display text-4xl font-extrabold">You're set up</h1>
      <p className="max-w-120 text-fg-muted">
        {plural(connectedCount, 'platform')} connected and syncing in the background. Your games
        will appear as they sync.
      </p>
      <Button onClick={onDone}>Go to Dashboard</Button>
    </div>
  )
}
