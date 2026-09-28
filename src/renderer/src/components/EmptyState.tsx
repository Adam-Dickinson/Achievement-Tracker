import type { ReactNode } from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon: ReactNode
  heading: string
  body: string
  cta: string
  onAction: () => void
}

export function EmptyState({ icon, heading, body, cta, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-panel border-[1.5px] border-dashed border-white/16 bg-white/2 p-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        {icon}
      </span>
      <div role="status" className="flex flex-col gap-1">
        <p className="font-display text-xl font-bold">{heading}</p>
        <p className="text-fg-muted">{body}</p>
      </div>
      <Button onClick={onAction}>{cta}</Button>
    </div>
  )
}
