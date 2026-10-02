import { useEffect, useState } from 'react'
import type { AppInfo, Profile } from '@shared/ipc'
import { ArtworkCard } from './ArtworkCard'
import { DataCard } from './DataCard'
import { LogsCard } from './LogsCard'
import { NotificationsCard } from './NotificationsCard'
import { ProfileCard } from './ProfileCard'
import { StartupCard } from './StartupCard'

interface SettingsProps {
  profile: Profile | null
  onRename: (name: string) => Promise<void>
}

export function Settings({ profile, onRename }: SettingsProps) {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.getAppInfo().then((data) => {
      if (!cancelled) setInfo(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mt-8 flex flex-col gap-8">
      {profile && (
        <div className="max-w-3xl">
          <ProfileCard profile={profile} onRename={onRename} />
        </div>
      )}
      <NotificationsCard />
      <div className="flex max-w-3xl flex-col gap-6">
        <ArtworkCard />
        <DataCard />
        <StartupCard />
        <LogsCard />
        {info && (
          <p className="text-sm text-fg-subtle">
            Trophy Locker v{info.version} · database schema {info.schemaVersion}
          </p>
        )}
      </div>
    </div>
  )
}
