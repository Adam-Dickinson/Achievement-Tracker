type Variant = 'chips' | 'segmented'

export interface ToggleOption<T extends string> {
  readonly id: T
  readonly label: string
  readonly count?: number
}

interface ToggleGroupProps<T extends string> {
  label: string
  options: readonly ToggleOption<T>[]
  selected: T
  onSelect: (id: T) => void
  variant?: Variant
}

const GROUP: Record<Variant, string> = {
  chips: 'flex flex-wrap gap-2',
  segmented: 'flex gap-1 rounded-control bg-surface-1 p-1',
}

const OPTION: Record<Variant, { base: string; on: string; off: string }> = {
  chips: {
    base: 'rounded-full px-3 py-1 text-sm font-semibold',
    on: 'bg-primary text-on-primary',
    off: 'bg-surface-1 text-fg-muted hover:text-fg',
  },
  segmented: {
    base: 'rounded-control px-3 py-1.5 text-sm font-medium',
    on: 'bg-fg text-canvas',
    off: 'text-fg-muted hover:text-fg',
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
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={selected === option.id}
          onClick={() => onSelect(option.id)}
          className={`${style.base} transition-colors ${selected === option.id ? style.on : style.off}`}
        >
          {option.label}
          {option.count !== undefined && (
            <>
              {' '}
              <span className="tabular-nums opacity-70">{option.count.toLocaleString()}</span>
            </>
          )}
        </button>
      ))}
    </div>
  )
}
