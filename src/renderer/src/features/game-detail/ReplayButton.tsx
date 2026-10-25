import { RotateCcw } from 'lucide-react'

interface ReplayButtonProps {
  name: string
  onClick: () => void
}

export function ReplayButton({ name, onClick }: ReplayButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Replay the pop-up for ${name}`}
      title="Replay pop-up"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/6 text-fg-muted transition-colors hover:bg-white/10 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <RotateCcw aria-hidden="true" className="size-4" />
    </button>
  )
}
