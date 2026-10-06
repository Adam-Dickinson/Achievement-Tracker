import { Clock } from 'lucide-react'
import { describePlaytime, formatPlaytime } from '@/lib/format'

interface PlaytimeLabelProps {
  seconds: number | null | undefined
  partial?: boolean
  className?: string
}

export function PlaytimeLabel({ seconds, partial = false, className }: PlaytimeLabelProps) {
  if (seconds === null || seconds === undefined) return null

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      <Clock aria-hidden="true" className="size-3.5" />
      <span aria-hidden="true">{formatPlaytime(seconds, partial)}</span>
      <span className="sr-only">{describePlaytime(seconds, partial)}</span>
    </span>
  )
}
