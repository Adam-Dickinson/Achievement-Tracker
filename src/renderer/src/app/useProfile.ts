import { useEffect, useState } from 'react'
import type { Profile } from '@shared/ipc'

export function displayName(profile: Profile | null): string {
  return profile?.name ?? profile?.windowsName ?? ''
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.getProfile().then((data) => {
      if (!cancelled) setProfile(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const rename = async (name: string) => {
    setProfile(await window.api.setProfileName(name))
  }

  return { profile, rename }
}
