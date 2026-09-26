import { Search } from 'lucide-react'

interface SearchBoxProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchBox({ label, value, onChange, placeholder }: SearchBoxProps) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
      />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-control border border-line bg-surface-1 py-2 pr-3 pl-9 text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
    </div>
  )
}
