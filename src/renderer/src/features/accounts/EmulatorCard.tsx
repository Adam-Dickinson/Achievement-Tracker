import { FolderOpen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { PlatformTile } from '@/components/PlatformTile'
import { plural } from '@/lib/format'
import type {
  ChooseEmulatorFolderResult,
  EmulatorConnectInput,
  EmulatorFolder,
  ConnectResult,
} from '@shared/ipc'
import type { Platform } from '@shared/platform'

export interface EmulatorCardProps {
  connectedNames: readonly string[]
  onConnected: () => void
  reconnectName?: string | null
}

interface EmulatorCardSource extends EmulatorCardProps {
  platform: Platform
  name: string
  description: string
  find: () => Promise<EmulatorFolder | null>
  choose: () => Promise<ChooseEmulatorFolderResult>
  connect: (input: EmulatorConnectInput) => Promise<ConnectResult>
}

export function EmulatorCard({
  platform,
  name,
  description,
  find,
  choose,
  connect: connectUser,
  connectedNames,
  onConnected,
  reconnectName,
}: EmulatorCardSource) {
  const [folder, setFolder] = useState<EmulatorFolder | null>(null)
  const [searched, setSearched] = useState(false)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const radios = useRef(new Map<string, HTMLInputElement>())

  useEffect(() => {
    let cancelled = false
    void find().then((found) => {
      if (cancelled) return
      setFolder(found)
      setSearched(true)
    })
    return () => {
      cancelled = true
    }
  }, [find])

  async function chooseFolder() {
    setError(null)
    const result = await choose()
    if (result.kind === 'chosen') {
      setFolder(result.folder)
      setChosenId(null)
    } else if (result.kind === 'not_found') {
      setError(`No ${name} data found in ${result.path}.`)
    }
  }

  const available = folder?.users.filter((user) => !connectedNames.includes(user.name)) ?? []
  const availableRef = useRef(available)
  useEffect(() => {
    availableRef.current = available
  })
  const selected = available.some((user) => user.id === chosenId)
    ? chosenId
    : (available[0]?.id ?? null)

  useEffect(() => {
    if (!reconnectName || !folder) return
    const match = availableRef.current.find((user) => user.name === reconnectName)
    if (!match) return
    setChosenId(match.id)
    radios.current.get(match.id)?.focus()
  }, [reconnectName, folder])

  async function connect() {
    if (!folder || !selected) return
    setBusy(true)
    setError(null)
    try {
      const result = await connectUser({ path: folder.path, userId: selected })
      if (result.ok) onConnected()
      else setError(result.message)
    } finally {
      setBusy(false)
    }
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
          <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>
        </div>
      </div>

      {!searched && <p className="mt-5 text-sm text-fg-muted">Looking for {name}…</p>}

      {searched && !folder && (
        <div className="mt-5 flex flex-col gap-3">
          <p className="text-sm text-fg-muted">No {name} data found automatically.</p>
          <Button variant="secondary" onClick={() => void chooseFolder()}>
            <span className="flex items-center gap-2">
              <FolderOpen aria-hidden="true" className="size-4" />
              Choose folder…
            </span>
          </Button>
        </div>
      )}

      {folder && (
        <div className="mt-5 flex flex-col gap-4">
          <p className="truncate text-[13px] text-fg-muted" title={folder.path}>
            {folder.path}
          </p>

          {available.length === 0 ? (
            <p className="text-sm text-fg-muted">Every {name} user here is already connected.</p>
          ) : (
            <div role="radiogroup" aria-label={`${name} user`} className="flex flex-col gap-2">
              {available.map((user) => (
                <label
                  key={user.id}
                  className="flex items-center justify-between gap-3 rounded-control bg-surface-2 px-3.5 py-2.5 text-sm font-semibold"
                >
                  <span className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name={`${platform}-user`}
                      checked={selected === user.id}
                      onChange={() => setChosenId(user.id)}
                      ref={(el) => {
                        if (el) radios.current.set(user.id, el)
                        else radios.current.delete(user.id)
                      }}
                    />
                    {user.name}
                  </span>
                  <span className="text-fg-muted">
                    {user.unlocked} unlocked in {plural(user.games, 'game')}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {available.length > 0 && (
              <Button disabled={!selected || busy} onClick={() => void connect()}>
                {busy ? 'Connecting…' : 'Connect'}
              </Button>
            )}
            <Button variant="secondary" onClick={() => void chooseFolder()}>
              Choose a different folder…
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
