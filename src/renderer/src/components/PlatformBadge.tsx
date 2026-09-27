import { Cpu } from 'lucide-react'
import { type Platform, platformName } from '@shared/platform'
import { PLATFORM_LOGOS } from './platform-logos'

interface PlatformBadgeProps {
  platform: Platform
  size?: number
  className?: string
}

export function PlatformBadge({ platform, size = 22, className = '' }: PlatformBadgeProps) {
  const logo = PLATFORM_LOGOS[platform]

  return (
    <span
      role="img"
      aria-label={platformName(platform)}
      data-platform={platform}
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-surface-1 bg-[color-mix(in_srgb,var(--platform)_14%,var(--color-canvas))] text-(--platform) ring-1 ring-(--platform)/35 ${className}`}
    >
      {logo ? (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-[52%]">
          <path d={logo} />
        </svg>
      ) : (
        <Cpu aria-hidden="true" className="size-[52%]" />
      )}
    </span>
  )
}
