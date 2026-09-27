import { Cpu } from 'lucide-react'
import type { Platform } from '@shared/platform'
import { PLATFORM_LOGOS } from './platform-logos'

interface PlatformTileProps {
  platform: Platform
  muted?: boolean
}

export function PlatformTile({ platform, muted = false }: PlatformTileProps) {
  const logo = PLATFORM_LOGOS[platform]

  return (
    <span
      aria-hidden="true"
      data-platform={platform}
      className={`flex size-14 shrink-0 items-center justify-center rounded-[18px] ${
        muted
          ? 'bg-white/5 text-fg-muted'
          : 'bg-[color-mix(in_srgb,var(--platform)_15%,var(--color-canvas))] text-(--platform) shadow-[0_12px_26px_-10px_color-mix(in_srgb,var(--platform)_55%,transparent)] ring-1 ring-(--platform)/32'
      }`}
    >
      {logo ? (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-7">
          <path d={logo} />
        </svg>
      ) : (
        <Cpu className="size-7" />
      )}
    </span>
  )
}
