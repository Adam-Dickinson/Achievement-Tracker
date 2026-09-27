import { ChevronDown, type LucideIcon } from 'lucide-react'

export interface SelectOption<T extends string> {
  readonly id: T
  readonly label: string
}

interface SelectProps<T extends string> {
  label: string
  icon: LucideIcon
  options: readonly SelectOption<T>[]
  value: T
  onChange: (id: T) => void
}

export function Select<T extends string>({
  label,
  icon: Icon,
  options,
  value,
  onChange,
}: SelectProps<T>) {
  return (
    <span className="relative flex shrink-0 items-center">
      <Icon
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 text-fg-muted"
      />
      <select
        aria-label={label}
        value={value}
        onChange={(event) => {
          const next = options.find((option) => option.id === event.target.value)
          if (next) onChange(next.id)
        }}
        className="h-10.5 min-w-44 cursor-pointer appearance-none rounded-control border border-white/9 bg-white/6 pr-10 pl-9.5 text-sm font-semibold text-fg scheme-dark hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id} className="bg-surface-2 text-fg">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 text-fg-muted"
      />
    </span>
  )
}
