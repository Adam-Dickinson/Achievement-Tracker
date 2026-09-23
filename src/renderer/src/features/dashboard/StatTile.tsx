interface StatTileProps {
  label: string
  value: number
  hint?: string
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-panel border border-line bg-surface-1 p-4 text-center shadow-float">
      <span className="text-sm text-fg-muted">{label}</span>
      <span className="font-display text-2xl font-bold tabular-nums">{value.toLocaleString()}</span>
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </div>
  )
}
