import type { EmulatorConnectInput } from '@shared/ipc'
import { EmulatorCard, type EmulatorCardProps } from './EmulatorCard'

const find = () => window.api.findRpcs3()
const choose = () => window.api.chooseRpcs3Folder()
const connect = (input: EmulatorConnectInput) => window.api.connectRpcs3(input)

export function Rpcs3Card(props: EmulatorCardProps) {
  return (
    <EmulatorCard
      {...props}
      platform="rpcs3"
      name="RPCS3"
      description="PS3 trophies from its own install folder"
      find={find}
      choose={choose}
      connect={connect}
    />
  )
}
