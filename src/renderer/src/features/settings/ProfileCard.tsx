import { useId, useState } from 'react'
import { Button } from '@/components/Button'
import { MAX_PROFILE_NAME, type Profile } from '@shared/ipc'

interface ProfileCardProps {
  profile: Profile
  onRename: (name: string) => Promise<void>
}

export function ProfileCard({ profile, onRename }: ProfileCardProps) {
  const [name, setName] = useState(profile.name ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const id = useId()
  const unchanged = name.trim() === (profile.name ?? '')

  const save = async (next: string) => {
    setBusy(true)
    setSaved(false)
    try {
      await onRename(next)
      setName(next.trim())
      setSaved(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-5 shadow-float"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
          Profile
        </h2>
        <p className="text-sm text-fg-muted">
          The name at the top of your Library, and the letter in the top bar. Leave it empty to use
          your Windows name{profile.windowsName ? ` (${profile.windowsName})` : ''}.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void save(name)
        }}
      >
        <label className="flex min-w-72 flex-1 flex-col gap-2 text-sm text-fg-muted">
          Your name
          <input
            type="text"
            maxLength={MAX_PROFILE_NAME}
            value={name}
            placeholder={profile.windowsName}
            onChange={(event) => {
              setName(event.target.value)
              setSaved(false)
            }}
            disabled={busy}
            className="rounded-control border border-line bg-canvas px-3 py-2 text-fg placeholder:text-fg-subtle"
          />
        </label>
        <Button type="submit" disabled={busy || unchanged}>
          {busy ? 'Saving…' : 'Save name'}
        </Button>
        {profile.name !== null && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void save('')}>
            Use Windows name
          </Button>
        )}
      </form>
      {saved && (
        <p role="status" className="text-sm text-fg-muted">
          Saved.
        </p>
      )}
    </section>
  )
}
