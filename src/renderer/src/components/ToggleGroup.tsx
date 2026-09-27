import type { ReactNode } from 'react'

type Variant = 'chips' | 'segmented'

export interface ToggleOption<T extends string> {
  readonly id: T
  readonly label: string
  readonly count?: number
  readonly icon?: ReactNode
}

interface ToggleGroupProps<T extends string> {
  label: string
  options: readonly ToggleOption<T>[]
  selected: T
  onSelect: (id: T) => void
  variant?: Variant
}

const GROUP: Record<Variant, string> = {
  chips: 'flex flex-wrap gap-1.5',
  segmented: 'flex gap-0.5 rounded-2xl border border-white/7 bg-white/6 p-1',
}

const OPTION: Record<Variant, { base: string; on: string; off: string; count: string }> = {
  chips: {
    base: 'h-7.5 rounded-full border px-3.25 text-[13px] font-semibold',
    on: 'border-primary bg-primary text-on-primary',
    off: 'border-white/8 bg-white/6 hover:bg-white/10',
    count: 'text-fg-muted',
  },
  segmented: {
    base: 'h-8.5 rounded-xl px-3.5 text-[13px] font-semibold',
    on: 'bg-fg text-canvas shadow-[0_6px_16px_-6px_rgb(0_0_0/0.6)]',
    off: 'text-fg-muted hover:text-fg',
    count: 'opacity-70',
  },
}

export function ToggleGroup<T extends string>({
  label,
  options,
  selected,
  onSelect,
  variant = 'chips',
}: ToggleGroupProps<T>) {
  const style = OPTION[variant]

  return (
    <div role="group" aria-label={label} className={GROUP[variant]}>
      {options.map((option) => {
        const on = selected === option.id
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(option.id)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${style.base} ${on ? style.on : style.off}`}
          >
            {option.icon && (
              <span aria-hidden="true" className="flex">
                {option.icon}
              </span>
            )}
            {option.label}
            {option.count !== undefined && (
              <>
                {' '}
                <span className={`tabular-nums ${on ? 'opacity-60' : style.count}`}>
                  {option.count.toLocaleString()}
                </span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
