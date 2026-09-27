import { User } from 'lucide-react'

interface AvatarProps {
  name: string
  className?: string
}

export function Avatar({ name, className = 'size-10 text-[15px]' }: AvatarProps) {
  const initial = Array.from(name)[0]?.toUpperCase()

  return (
    <span
      role={initial ? 'img' : undefined}
      aria-label={initial ? name : undefined}
      aria-hidden={initial ? undefined : true}
      title={name || undefined}
      className={`flex shrink-0 items-center justify-center rounded-full bg-linear-135 from-primary to-aurora-teal font-display font-extrabold text-on-primary ${className}`}
    >
      {initial ?? <User strokeWidth={2} aria-hidden="true" className="size-[42%]" />}
    </span>
  )
}
