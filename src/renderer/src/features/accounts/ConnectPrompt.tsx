import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/Button'
import { PlatformTile } from '@/components/PlatformTile'
import { ConnectFlow } from './ConnectFlow'
import { SourceKind } from './SourceKind'
import { SOURCES, type OnlinePlatform } from './sources'

interface ConnectPromptProps {
  platform: OnlinePlatform
  onConnected: () => void
}

export function ConnectPrompt({ platform, onConnected }: ConnectPromptProps) {
  const [open, setOpen] = useState(false)
  const name = SOURCES[platform].name

  if (open) {
    return (
      <ConnectFlow
        platform={platform}
        onConnected={() => {
          setOpen(false)
          onConnected()
        }}
        onClose={() => setOpen(false)}
      />
    )
  }

  return (
    <section
      aria-label={`${name}, not connected`}
      className="flex flex-col rounded-panel border-[1.5px] border-dashed border-white/16 bg-white/2 p-6"
    >
      <div className="flex items-center gap-4">
        <PlatformTile platform={platform} muted />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[22px] leading-6 font-bold">{name}</h3>
          <p className="mt-0.5 text-[13px] text-fg-muted">{SOURCES[platform].method}</p>
        </div>
      </div>
      <div className="mt-5">
        <SourceKind official={SOURCES[platform].official} />
      </div>
      <Button variant="secondary" className="mt-5 w-full" onClick={() => setOpen(true)}>
        <span className="flex items-center justify-center gap-2">
          <Plus aria-hidden="true" className="size-4" />
          Connect {name}
        </span>
      </Button>
    </section>
  )
}
