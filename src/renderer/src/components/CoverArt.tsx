import { useState } from 'react'

interface CoverArtProps {
  url: string | null
  title: string
  percent: number
}

export function CoverArt({ url, title, percent }: CoverArtProps) {
  const [failed, setFailed] = useState(false)

  if (!url || failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-linear-140 from-surface-3 to-surface-2 p-4 text-center font-display text-lg font-bold text-fg-muted">
        {title}
      </div>
    )
  }

  return (
    <>
      <img
        src={url}
        alt=""
        className="absolute inset-0 size-full object-cover opacity-50 grayscale"
        onError={() => setFailed(true)}
      />
      <img
        src={url}
        alt=""
        className="absolute inset-0 size-full object-cover"
        style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}
      />
      {percent > 0 && percent < 100 && (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-primary shadow-glow-primary"
          style={{ left: `${percent}%` }}
        />
      )}
    </>
  )
}
