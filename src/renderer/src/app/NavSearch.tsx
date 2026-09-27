import { Search } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface NavSearchProps {
  value: string
  onChange: (value: string) => void
}

export function NavSearch({ value, onChange }: NavSearchProps) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const focusOnCtrlK = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', focusOnCtrlK)
    return () => window.removeEventListener('keydown', focusOnCtrlK)
  }, [])

  return (
    <label className="flex h-10 w-50 shrink-0 items-center gap-2 rounded-full bg-white/6 px-4 text-fg-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
      <Search size={16} aria-hidden="true" className="shrink-0" />
      <input
        ref={input}
        type="search"
        aria-label="Search library"
        placeholder="Search library"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-w-0 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="rounded-md bg-white/8 px-1.5 font-sans text-[11px] font-semibold whitespace-nowrap text-fg-muted">
        Ctrl K
      </kbd>
    </label>
  )
}
