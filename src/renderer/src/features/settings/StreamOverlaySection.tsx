import { useEffect, useState } from 'react'
import { Cast, Copy, Send } from 'lucide-react'
import { Button } from '@/components/Button'
import {
  STREAM_PORT_MAX,
  STREAM_PORT_MIN,
  type NotificationSettings,
  type NotificationSettingsPatch,
  type StreamOverlayStatus,
} from '@shared/ipc'
import { SettingCard, SettingRow, Switch } from './SettingParts'

interface StreamOverlaySectionProps {
  settings: NotificationSettings
  patch: (next: NotificationSettingsPatch) => Promise<void>
}

const OFF: StreamOverlayStatus = { state: 'off', url: null, message: null }

function validPort(text: string): number | null {
  if (!/^\d+$/.test(text)) return null
  const port = Number(text)
  return port >= STREAM_PORT_MIN && port <= STREAM_PORT_MAX ? port : null
}

export function StreamOverlaySection({ settings, patch }: StreamOverlaySectionProps) {
  const stream = settings.stream
  const [status, setStatus] = useState<StreamOverlayStatus>(OFF)
  const [portDraft, setPortDraft] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const portText = portDraft ?? String(stream.port)

  useEffect(() => {
    let cancelled = false
    void window.api.getStreamOverlayStatus().then((current) => {
      if (!cancelled) setStatus(current)
    })
    const stop = window.api.onStreamOverlayStatusChanged(setStatus)
    return () => {
      cancelled = true
      stop()
    }
  }, [])

  const portError =
    validPort(portText) === null
      ? `Use a number from ${STREAM_PORT_MIN} to ${STREAM_PORT_MAX}.`
      : null

  function commitPort() {
    const port = validPort(portText)
    if (port === null) return
    setPortDraft(null)
    if (port !== stream.port) void patch({ stream: { port } })
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  return (
    <SettingCard
      icon={Cast}
      title="Stream overlay"
      description="Show your unlocks on stream in OBS"
    >
      <SettingRow
        label="Show unlocks on stream"
        description="Keeps working while desktop pop-ups are paused."
      >
        <Switch
          label="Show unlocks on stream"
          on={stream.enabled}
          onToggle={() => void patch({ stream: { enabled: !stream.enabled } })}
        />
      </SettingRow>

      {stream.enabled && (
        <>
          <SettingRow
            label="Browser Source URL"
            description="In OBS, add a Browser Source with this URL, about 480 × 400. Tick Control audio via OBS to hear the chime on stream."
          >
            {status.state === 'running' && status.url ? (
              <div className="flex items-center gap-3">
                <code className="rounded-xl bg-white/6 px-3 py-1.5 text-sm">{status.url}</code>
                <Button onClick={() => void copyUrl(status.url ?? '')}>
                  <span className="flex items-center gap-2">
                    <Copy size={16} aria-hidden="true" />
                    {copied ? 'Copied' : 'Copy'}
                  </span>
                </Button>
              </div>
            ) : status.state === 'error' ? (
              <p role="alert" className="max-w-60 text-sm text-danger">
                {status.message}
              </p>
            ) : (
              <span className="text-sm text-fg-muted">Starting…</span>
            )}
          </SettingRow>

          <SettingRow label="Port" description="Change it only if another program uses this one.">
            <div className="flex flex-col items-end gap-1">
              <input
                type="text"
                inputMode="numeric"
                aria-label="Stream overlay port"
                aria-invalid={portError !== null}
                value={portText}
                onChange={(event) => setPortDraft(event.target.value)}
                onBlur={commitPort}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitPort()
                }}
                className="w-24 rounded-xl border border-white/10 bg-white/4 px-3 py-1.5 text-right text-sm"
              />
              {portError && <span className="text-xs text-danger">{portError}</span>}
            </div>
          </SettingRow>

          <SettingRow label="Chime on stream" description="Separate from the desktop sound.">
            <Switch
              label="Chime on stream"
              on={stream.sound.enabled}
              onToggle={() => void patch({ stream: { sound: { enabled: !stream.sound.enabled } } })}
            />
          </SettingRow>

          <SettingRow label="Stream volume">
            <span className="w-10.5 text-right text-sm font-semibold">
              {Math.round(stream.sound.volume * 100)}%
            </span>
            <input
              type="range"
              aria-label="Stream volume"
              min={0}
              max={1}
              step={0.05}
              value={stream.sound.volume}
              onChange={(event) =>
                void patch({ stream: { sound: { volume: Number(event.target.value) } } })
              }
              className="w-50 accent-primary"
            />
          </SettingRow>

          <SettingRow label="Test" description="Sends a sample toast to the stream overlay only.">
            <Button
              disabled={status.state !== 'running'}
              onClick={() => void window.api.sendTestStreamToast()}
            >
              <span className="flex items-center gap-2">
                <Send size={16} aria-hidden="true" />
                Send test to stream
              </span>
            </Button>
          </SettingRow>
        </>
      )}
    </SettingCard>
  )
}
