import { type CSSProperties, useState } from 'react'

const PALETTES = [
  'from-rarity-rare-dark to-rarity-rare-light',
  'from-rarity-uncommon-dark to-rarity-uncommon-light',
  'from-rarity-ultra-dark to-rarity-ultra-light',
  'from-rarity-rare-dark to-rarity-uncommon-light',
  'from-rarity-common-dark to-rarity-rare-dark',
  'from-rarity-uncommon-dark to-rarity-rare-light',
] as const

interface CoverArtProps {
  url: string | null
  title: string
  percent: number
}

export function paletteFor(title: string): string {
  let hash = 0
  for (const char of title) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return PALETTES[hash % PALETTES.length] ?? PALETTES[0]
}

export function CoverArt({ url, title, percent }: CoverArtProps) {
  const [failed, setFailed] = useState(false)
  const image = url && !failed ? url : null

  const face = (className: string, style?: CSSProperties) =>
    image ? (
      <img
        src={image}
        alt=""
        className={`absolute inset-0 size-full object-cover ${className}`}
        style={style}
        onError={() => setFailed(true)}
      />
    ) : (
      <div
        aria-hidden="true"
        className={`absolute inset-0 flex items-center justify-center bg-linear-140 p-4 text-center font-display text-xl font-bold text-fg text-shadow-lg ${paletteFor(title)} ${className}`}
        style={style}
      >
        {title}
      </div>
    )

  return (
    <>
      {face('opacity-50 grayscale')}
      {face('', { clipPath: `inset(0 ${100 - percent}% 0 0)` })}
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
