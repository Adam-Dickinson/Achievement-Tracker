import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface SettingRowProps {
  label: string
  description?: string
  children: ReactNode
}

interface SettingCardProps {
  icon: LucideIcon
  title: string
  description: string
  children: ReactNode
}

interface SwitchProps {
  label: string
  on: boolean
  onToggle: () => void
}

export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-8 border-t border-white/7 py-5 first:border-t-0">
      <div className="max-w-75">
        <div className="text-[15px] font-semibold">{label}</div>
        {description && (
          <div className="mt-0.5 text-[13px] leading-4.75 text-fg-muted">{description}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4">{children}</div>
    </div>
  )
}

export function SettingCard({ icon: Icon, title, description, children }: SettingCardProps) {
  return (
    <section className="rounded-panel border border-line bg-surface-1 p-6 shadow-float">
      <div className="mb-2 flex items-center gap-4">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Icon size={22} aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-display text-lg leading-6 font-bold">{title}</h3>
          <div className="text-[13px] text-fg-muted">{description}</div>
        </div>
      </div>
      {children}
    </section>
  )
}

export function Switch({ label, on, onToggle }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={on}
      onClick={onToggle}
      className={`relative h-7 w-11.5 shrink-0 rounded-full transition-colors ${
        on ? 'bg-primary' : 'bg-white/12'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.75 left-0.75 size-5.5 rounded-full bg-white shadow-sm transition-transform ${
          on ? 'translate-x-4.5' : ''
        }`}
      />
    </button>
  )
}
