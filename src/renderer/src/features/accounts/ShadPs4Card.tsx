import type { EmulatorConnectInput } from '@shared/ipc'
import { EmulatorCard, type EmulatorCardProps } from './EmulatorCard'

const find = () => window.api.findShadPs4()
const choose = () => window.api.chooseShadPs4Folder()
const connect = (input: EmulatorConnectInput) => window.api.connectShadPs4(input)

export function ShadPs4Card(props: EmulatorCardProps) {
  return (
    <EmulatorCard
      {...props}
      platform="shadps4"
      name="shadPS4"
      description="PS4 trophies from its own data folder"
      find={find}
      choose={choose}
      connect={connect}
    />
  )
}
