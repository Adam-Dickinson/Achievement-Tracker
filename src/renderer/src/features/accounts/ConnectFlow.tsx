import type { ComponentType } from 'react'
import { EaConnectCard } from './EaConnectCard'
import { EpicConnectCard } from './EpicConnectCard'
import { PlayStationConnectCard } from './PlayStationConnectCard'
import type { OnlinePlatform } from './sources'
import { SteamConnectCard } from './SteamConnectCard'
import { UbisoftConnectCard } from './UbisoftConnectCard'
import { XboxConnectCard } from './XboxConnectCard'

const FLOWS: Record<OnlinePlatform, ComponentType<{ onConnected: () => void }>> = {
  steam: SteamConnectCard,
  xbox: XboxConnectCard,
  playstation: PlayStationConnectCard,
  epic: EpicConnectCard,
  ubisoft: UbisoftConnectCard,
  ea: EaConnectCard,
}

interface ConnectFlowProps {
  platform: OnlinePlatform
  onConnected: () => void
  onClose: () => void
}

export function ConnectFlow({ platform, onConnected, onClose }: ConnectFlowProps) {
  const Flow = FLOWS[platform]

  return (
    <div className="flex flex-col gap-2">
      <Flow onConnected={onConnected} />
      <button
        type="button"
        onClick={onClose}
        className="self-end rounded-control px-3 py-1.5 text-sm font-semibold text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-primary"
      >
        Close
      </button>
    </div>
  )
}
