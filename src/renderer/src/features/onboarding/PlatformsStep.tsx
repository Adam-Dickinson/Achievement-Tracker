import { CircleCheck } from 'lucide-react'
import { Button } from '@/components/Button'
import { PlatformTile } from '@/components/PlatformTile'
import { ConnectPrompt } from '@/features/accounts/ConnectPrompt'
import { Rpcs3Card } from '@/features/accounts/Rpcs3Card'
import { ShadPs4Card } from '@/features/accounts/ShadPs4Card'
import { ONLINE_PLATFORMS } from '@/features/accounts/sources'
import { plural } from '@/lib/format'
import type { Platform } from '@shared/platform'
import { platformName } from '@shared/platform'

interface PlatformsStepProps {
  connectedPlatforms: ReadonlySet<Platform>
  onPlatformConnected: (platform: Platform) => void
  onBack: () => void
  onContinue: () => void
}

export function PlatformsStep({
  connectedPlatforms,
  onPlatformConnected,
  onBack,
  onContinue,
}: PlatformsStepProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold">Connect your platforms</h1>
        <p className="mt-2 text-fg-muted">Pick where you play. Everything stays on this machine.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {ONLINE_PLATFORMS.map((platform) =>
          connectedPlatforms.has(platform) ? (
            <ConnectedTile key={platform} platform={platform} />
          ) : (
            <ConnectPrompt
              key={platform}
              platform={platform}
              onConnected={() => onPlatformConnected(platform)}
            />
          ),
        )}
        {connectedPlatforms.has('shadps4') ? (
          <ConnectedTile platform="shadps4" />
        ) : (
          <ShadPs4Card connectedNames={[]} onConnected={() => onPlatformConnected('shadps4')} />
        )}
        {connectedPlatforms.has('rpcs3') ? (
          <ConnectedTile platform="rpcs3" />
        ) : (
          <Rpcs3Card connectedNames={[]} onConnected={() => onPlatformConnected('rpcs3')} />
        )}
      </div>

      <div className="flex items-center justify-between rounded-island border border-white/9 bg-surface-1/72 px-6 py-4">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <p className="text-sm text-fg-muted">
          {connectedPlatforms.size === 0
            ? 'No platforms connected yet'
            : `${plural(connectedPlatforms.size, 'platform')} connected`}
        </p>
        <Button disabled={connectedPlatforms.size === 0} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}

function ConnectedTile({ platform }: { platform: Platform }) {
  return (
    <section
      aria-label={`${platformName(platform)}, connected`}
      className="flex flex-col items-center justify-center gap-3 rounded-panel border border-success/40 bg-success/6 p-6 text-center"
    >
      <PlatformTile platform={platform} />
      <p className="font-display text-lg font-bold">{platformName(platform)}</p>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-success">
        <CircleCheck aria-hidden="true" className="size-4" />
        Connected
      </span>
    </section>
  )
}
