interface TrophyIconProps {
  className?: string
}

/** The app's trophy mark. `fill="currentColor"` lets the caller colour it with a text-* class. */
export function TrophyIcon({ className }: TrophyIconProps) {
  return (
    <svg viewBox="296 224 432 608" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M296 224h432v208c0 120-96 216-216 216s-216-96-216-216z" />
      <path d="M472 640h80v120h-80z" />
      <path d="M356 760h312v72H356z" />
    </svg>
  )
}
