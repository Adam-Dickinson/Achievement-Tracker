import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc'
import { ArtworkCard } from './ArtworkCard'
import { NotificationsCard } from './NotificationsCard'

export function Settings() {
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
    <div className="mt-8 flex max-w-3xl flex-col gap-6">
      <NotificationsCard />
      <ArtworkCard />
      {info && (
        <p className="text-sm text-fg-subtle">
          Trophy Locker v{info.version} · database schema {info.schemaVersion}
        </p>
      )}
    </div>
  )
}
