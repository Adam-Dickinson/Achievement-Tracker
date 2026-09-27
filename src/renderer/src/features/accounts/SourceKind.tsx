import { ShieldAlert, ShieldCheck } from 'lucide-react'

export function SourceKind({ official }: { official: boolean }) {
  return official ? (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
      <ShieldCheck aria-hidden="true" className="size-3.5" />
      Official API
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
      <ShieldAlert aria-hidden="true" className="size-3.5" />
      Unofficial · opt-in
    </span>
  )
}
