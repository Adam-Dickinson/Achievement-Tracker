import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  LayoutDashboard,
  Monitor,
  Send,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/Button'
import { PlatformBadge } from '@/components/PlatformBadge'
import { Select, type SelectOption } from '@/components/Select'
import { ToggleGroup } from '@/components/ToggleGroup'
import { Toast } from '@/overlay/Toast'
import { platformName } from '@shared/platform'
import { RARITIES, RARITY_LABEL, type Rarity } from '@shared/rarity'
import {
  TOAST_CORNERS,
  TOAST_SCALE,
  TOAST_SIZES,
  type DisplayInfo,
  type NotificationSettings,
  type NotificationSettingsPatch,
  type ToastCorner,
  type ToastPayload,
} from '@shared/ipc'

interface SettingRowProps {
  label: string
  description?: string
  children: ReactNode
}

interface SettingCardProps {
  icon: LucideIcon
  title: string
  description: string
  children: ReactNode
}

const CORNER_LABEL: Record<ToastCorner, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
}

const CORNER_DOT: Record<ToastCorner, string> = {
  'top-left': 'top-2 left-2',
  'top-right': 'top-2 right-2',
  'bottom-left': 'bottom-2 left-2',
  'bottom-right': 'bottom-2 right-2',
}

const CORNER_POSITION: Record<ToastCorner, string> = {
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
}

const PREVIEW_FIT_SCALE = 0.7

const SIZE_LABEL = { small: 'Small', medium: 'Medium', large: 'Large' } as const

const NOTIFIABLE_PLATFORMS = ['steam', 'xbox', 'playstation', 'epic', 'ubisoft', 'ea'] as const

const PREVIEW_TOASTS: Record<Rarity, ToastPayload> = {
  common: {
    heading: 'Achievement unlocked',
    rarity: 'common',
    title: 'Welcome Aboard',
    description: 'Complete the tutorial',
    game: 'Hades',
    platform: 'steam',
    percent: 42,
    platinum: false,
  },
  uncommon: {
    heading: 'Achievement unlocked',
    rarity: 'uncommon',
    title: 'Fleet Footed',
    description: 'Win a race using only the starter car',
    game: 'Forza Horizon 5',
    platform: 'xbox',
    percent: 18.5,
    platinum: false,
  },
  rare: {
    heading: 'Achievement unlocked',
    rarity: 'rare',
    title: 'Age of the Stars',
    description: 'The Age of the Stars ending.',
    game: 'Elden Ring',
    platform: 'steam',
    percent: 6.4,
    platinum: false,
  },
  ultra_rare: {
    heading: 'Achievement unlocked',
    rarity: 'ultra_rare',
    title: 'Age of the Stars',
    description: 'The Age of the Stars ending.',
    game: 'Elden Ring',
    platform: 'steam',
    percent: 1.2,
    platinum: false,
  },
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-8 border-t border-white/7 py-5 first:border-t-0">
      <div className="max-w-75">
        <div className="text-[15px] font-semibold">{label}</div>
        {description && (
          <div className="mt-0.5 text-[13px] leading-4.75 text-fg-muted">{description}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4">{children}</div>
    </div>
  )
}

function SettingCard({ icon: Icon, title, description, children }: SettingCardProps) {
  return (
    <section className="rounded-panel border border-line bg-surface-1 p-6 shadow-float">
      <div className="mb-2 flex items-center gap-4">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Icon size={22} aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-display text-lg leading-6 font-bold">{title}</h3>
          <div className="text-[13px] text-fg-muted">{description}</div>
        </div>
      </div>
      {children}
    </section>
  )
}

interface SwitchProps {
  label: string
  on: boolean
  onToggle: () => void
}

function Switch({ label, on, onToggle }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={on}
      onClick={onToggle}
      className={`relative h-7 w-11.5 shrink-0 rounded-full transition-colors ${
        on ? 'bg-primary' : 'bg-white/12'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.75 left-0.75 size-5.5 rounded-full bg-white shadow-sm transition-transform ${
          on ? 'translate-x-4.5' : ''
        }`}
      />
    </button>
  )
}

export function NotificationsCard() {
  const id = useId()
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [displays, setDisplays] = useState<readonly DisplayInfo[]>([])
  const [previewRarity, setPreviewRarity] = useState<Rarity>('ultra_rare')

  useEffect(() => {
    let cancelled = false
    void window.api.getNotificationSettings().then((data) => {
      if (!cancelled) setSettings(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void window.api.listDisplays().then(setDisplays)
  }, [])

  async function patch(next: NotificationSettingsPatch) {
    setSettings(await window.api.updateNotificationSettings(next))
  }

  const monitorOptions: SelectOption<string>[] = [
    { id: 'primary', label: 'Primary display' },
    ...displays.map((display) => ({
      id: String(display.id),
      label: display.primary ? `${display.label} (primary)` : display.label,
    })),
  ]

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="font-display text-2xl font-bold">
          Notifications
        </h2>
        <p className="text-sm text-fg-muted">
          See how an unlock toast looks over whatever is on your screen. The bell in the top bar
          pauses notifications, like Pause notifications in the tray.
        </p>
      </div>

      {settings && (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
          <div className="flex flex-col gap-6 xl:col-span-7">
            <SettingCard
              icon={LayoutDashboard}
              title="Placement"
              description="Where and how big toasts appear"
            >
              <SettingRow label="Screen corner" description="Toasts slide in from here.">
                <div role="group" aria-label="Screen corner" className="grid grid-cols-2 gap-3">
                  {TOAST_CORNERS.map((corner) => {
                    const on = settings.corner === corner
                    return (
                      <button
                        key={corner}
                        type="button"
                        aria-pressed={on}
                        onClick={() => void patch({ corner })}
                        className="flex flex-col items-center gap-2"
                      >
                        <span
                          className={`relative h-15.5 w-26 rounded-2xl border ${
                            on
                              ? 'border-2 border-primary bg-primary/10'
                              : 'border-white/10 bg-white/4'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`absolute h-4 w-9 rounded-lg ${CORNER_DOT[corner]} ${
                              on ? 'bg-primary' : 'bg-white/20'
                            }`}
                          />
                        </span>
                        <span
                          className={`text-xs font-semibold ${on ? 'text-primary' : 'text-fg-muted'}`}
                        >
                          {CORNER_LABEL[corner]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </SettingRow>

              <SettingRow label="Monitor" description="Which display shows toasts.">
                <Select
                  label="Monitor"
                  icon={Monitor}
                  options={monitorOptions}
                  value={settings.monitor === 'primary' ? 'primary' : String(settings.monitor)}
                  onChange={(value) =>
                    void patch({ monitor: value === 'primary' ? 'primary' : Number(value) })
                  }
                />
              </SettingRow>

              <SettingRow label="Size" description="Scales the whole toast.">
                <ToggleGroup
                  label="Toast size"
                  variant="segmented"
                  options={TOAST_SIZES.map((size) => ({ id: size, label: SIZE_LABEL[size] }))}
                  selected={settings.size}
                  onSelect={(size) => void patch({ size })}
                />
              </SettingRow>

              <SettingRow label="Stay on screen" description="How long each toast is held.">
                <span className="font-display w-15 text-right text-2xl font-extrabold">
                  {settings.durationSec.toFixed(1)}s
                </span>
                <input
                  type="range"
                  aria-label="Stay on screen"
                  min={1}
                  max={15}
                  step={0.5}
                  value={settings.durationSec}
                  onChange={(event) => void patch({ durationSec: Number(event.target.value) })}
                  className="w-50 accent-primary"
                />
              </SettingRow>
            </SettingCard>

            <SettingCard
              icon={SlidersHorizontal}
              title="What triggers a toast"
              description="Pick what is worth interrupting you for"
            >
              <SettingRow label="Minimum rarity" description="Anything rarer always shows.">
                <ToggleGroup
                  label="Minimum rarity"
                  variant="segmented"
                  options={RARITIES.map((rarity) => ({
                    id: rarity,
                    label: `${RARITY_LABEL[rarity]}+`,
                  }))}
                  selected={settings.minRarity}
                  onSelect={(minRarity) => void patch({ minRarity })}
                />
              </SettingRow>

              <SettingRow label="Platforms" description="Turn individual sources on or off.">
                <div className="grid w-110 grid-cols-2 gap-2">
                  {NOTIFIABLE_PLATFORMS.map((platform) => {
                    const on = settings.enabledPlatforms[platform]
                    return (
                      <div
                        key={platform}
                        className="flex items-center justify-between rounded-2xl bg-white/4 px-3.5 py-2.5"
                      >
                        <span className="flex items-center gap-2.5 text-sm font-semibold">
                          <PlatformBadge platform={platform} size={28} />
                          {platformName(platform)}
                        </span>
                        <Switch
                          label={`${platformName(platform)} notifications`}
                          on={on}
                          onToggle={() => void patch({ enabledPlatforms: { [platform]: !on } })}
                        />
                      </div>
                    )
                  })}
                </div>
              </SettingRow>
            </SettingCard>

            <SettingCard
              icon={Volume2}
              title="Sound"
              description="A distinct chime for each rarity tier"
            >
              <SettingRow label="Play a sound" description="One sound per rarity tier.">
                <Switch
                  label="Play a sound"
                  on={settings.sound.enabled}
                  onToggle={() =>
                    void patch({ sound: { ...settings.sound, enabled: !settings.sound.enabled } })
                  }
                />
              </SettingRow>

              <SettingRow label="Volume">
                <span className="w-10.5 text-right text-sm font-semibold">
                  {Math.round(settings.sound.volume * 100)}%
                </span>
                <input
                  type="range"
                  aria-label="Volume"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.sound.volume}
                  onChange={(event) =>
                    void patch({ sound: { ...settings.sound, volume: Number(event.target.value) } })
                  }
                  className="w-50 accent-primary"
                />
              </SettingRow>
            </SettingCard>
          </div>

          <aside className="flex flex-col gap-4 xl:sticky xl:top-24 xl:col-span-5">
            <div className="rounded-panel border border-line bg-surface-1 p-4 shadow-float">
              <div className="mb-3 flex items-center justify-between px-2 pt-1">
                <h3 className="font-display text-lg font-bold">Live preview</h3>
                <span className="rounded-full bg-white/6 px-3 py-1 text-xs font-semibold">
                  {CORNER_LABEL[settings.corner]} · {settings.durationSec.toFixed(1)}s
                </span>
              </div>
              <div className="relative aspect-video overflow-hidden rounded-2xl bg-linear-to-br from-surface-2 to-canvas">
                <div
                  className={`absolute ${CORNER_POSITION[settings.corner]}`}
                  style={{
                    transform: `scale(${TOAST_SCALE[settings.size] * PREVIEW_FIT_SCALE})`,
                    transformOrigin: settings.corner.replace('-', ' '),
                  }}
                >
                  <Toast {...PREVIEW_TOASTS[previewRarity]} />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 px-1 pb-1">
                <Select
                  label="Preview rarity"
                  icon={Sparkles}
                  options={RARITIES.map((rarity) => ({ id: rarity, label: RARITY_LABEL[rarity] }))}
                  value={previewRarity}
                  onChange={setPreviewRarity}
                />
                <Button onClick={() => void window.api.sendTestNotification()}>
                  <span className="flex items-center gap-2">
                    <Send size={16} aria-hidden="true" />
                    Send test toast
                  </span>
                </Button>
              </div>
            </div>
            <p className="px-2 text-[13px] leading-5 text-fg-muted">
              The test toast uses the size, corner and duration you have set.
            </p>
          </aside>
        </div>
      )}
    </section>
  )
}
