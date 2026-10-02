import { CirclePlus, KeyRound, PlugZap, ShieldAlert, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { AccountSummary } from '@shared/ipc'
import { AccountCard } from './AccountCard'
import { ConnectFlow } from './ConnectFlow'
import { ConnectPrompt } from './ConnectPrompt'
import { isOnline, ONLINE_PLATFORMS, type OnlinePlatform } from './sources'
import { useAccounts } from './useAccounts'
import { Rpcs3Card } from './Rpcs3Card'
import { ShadPs4Card } from './ShadPs4Card'

export interface AccountCounts {
  readonly connected: number
  readonly needsSignIn: number
  readonly available: number
}

export function countAccounts(accounts: readonly AccountSummary[]): AccountCounts {
  const active = accounts.filter((account) => account.status !== 'disabled')
  return {
    connected: active.filter((account) => account.status === 'connected').length,
    needsSignIn: active.filter(
      (account) => account.status === 'needs_reauth' || account.status === 'error',
    ).length,
    available: ONLINE_PLATFORMS.filter(
      (platform) => !active.some((account) => account.platform === platform),
    ).length,
  }
}

export function Accounts() {
  const { accounts, reload } = useAccounts()

  return (
    <div className="flex flex-col">
      <div className="mt-2">
        <p className="text-[13px] font-semibold text-fg-muted">Sources</p>
        <h1 className="font-display text-[52px] leading-14 font-extrabold">Accounts</h1>
      </div>

      {accounts ? (
        <AccountsBody accounts={accounts} onChanged={reload} />
      ) : (
        <p role="status" className="mt-7">
          Loading...
        </p>
      )}
    </div>
  )
}

function AccountsBody({
  accounts,
  onChanged,
}: {
  accounts: readonly AccountSummary[]
  onChanged: () => void
}) {
  const [reconnecting, setReconnecting] = useState<number | null>(null)
  const [reconnectingShadPs4, setReconnectingShadPs4] = useState<string | null>(null)
  const [reconnectingRpcs3, setReconnectingRpcs3] = useState<string | null>(null)
  const counts = countAccounts(accounts)

  const slot = (platform: OnlinePlatform) => {
    const own = accounts.filter((account) => account.platform === platform)
    if (own.length === 0) {
      return <ConnectPrompt key={platform} platform={platform} onConnected={onChanged} />
    }
    return own.map((account) => (
      <div key={account.id} className="flex flex-col gap-3">
        <AccountCard
          account={account}
          onChanged={onChanged}
          onReconnect={() => setReconnecting(account.id)}
        />
        {reconnecting === account.id && isOnline(account.platform) && (
          <ConnectFlow
            platform={account.platform}
            onConnected={() => {
              setReconnecting(null)
              onChanged()
            }}
            onClose={() => setReconnecting(null)}
          />
        )}
      </div>
    ))
  }

  return (
    <>
      <div className="mt-7 grid gap-6 md:grid-cols-3">
        <SummaryTile
          tone="success"
          icon={<PlugZap aria-hidden="true" className="size-6" />}
          value={counts.connected}
          label="Connected sources"
        />
        <SummaryTile
          tone="warning"
          icon={<TriangleAlert aria-hidden="true" className="size-6" />}
          value={counts.needsSignIn}
          label="Need signing in again"
        />
        <SummaryTile
          tone="primary"
          icon={<CirclePlus aria-hidden="true" className="size-6" />}
          value={counts.available}
          label="Available to connect"
        />
      </div>

      <section aria-labelledby="online-platforms" className="mt-12">
        <div className="mb-4">
          <h2 id="online-platforms" className="font-display text-2xl leading-7 font-bold">
            Online platforms
          </h2>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Achievements pulled straight from each platform
          </p>
        </div>
        <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
          {ONLINE_PLATFORMS.flatMap((platform) => slot(platform))}
        </div>
      </section>

      <section aria-labelledby="emulators" className="mt-12">
        <div className="mb-4">
          <h2 id="emulators" className="font-display text-2xl leading-7 font-bold">
            Emulators
          </h2>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Trophies from their own local files, no sign-in
          </p>
        </div>
        <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
          {accounts
            .filter((account) => account.platform === 'shadps4')
            .map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onChanged={onChanged}
                onReconnect={() => setReconnectingShadPs4(account.displayName)}
              />
            ))}
          <ShadPs4Card
            connectedNames={accounts
              .filter((account) => account.platform === 'shadps4' && account.status !== 'disabled')
              .map((account) => account.displayName)}
            onConnected={() => {
              setReconnectingShadPs4(null)
              onChanged()
            }}
            reconnectName={reconnectingShadPs4}
          />
          {accounts
            .filter((account) => account.platform === 'rpcs3')
            .map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onChanged={onChanged}
                onReconnect={() => setReconnectingRpcs3(account.displayName)}
              />
            ))}
          <Rpcs3Card
            connectedNames={accounts
              .filter((account) => account.platform === 'rpcs3' && account.status !== 'disabled')
              .map((account) => account.displayName)}
            onConnected={() => {
              setReconnectingRpcs3(null)
              onChanged()
            }}
            reconnectName={reconnectingRpcs3}
          />
        </div>
      </section>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <InfoCard
          tone="primary"
          icon={<KeyRound aria-hidden="true" className="size-5.5" />}
          title="Where your keys live"
        >
          Tokens and API keys are encrypted by Windows for your user account and kept in a file only
          this app reads, never in the app database or logs. Every request goes straight from this
          PC to the platform.
        </InfoCard>
        <InfoCard
          tone="warning"
          icon={<ShieldAlert aria-hidden="true" className="size-5.5" />}
          title="About “unofficial” sources"
        >
          These platforms have no public achievements API, so the app reads the services their own
          apps use. They stay off until you opt in, and can break without notice. Unlocks a sync
          missed still appear in Activity once it catches up.
        </InfoCard>
      </div>
    </>
  )
}

type Tone = 'success' | 'warning' | 'primary'

const TONE: Record<Tone, string> = {
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  primary: 'bg-primary/15 text-primary',
}

function SummaryTile({
  tone,
  icon,
  value,
  label,
}: {
  tone: Tone
  icon: ReactNode
  value: number
  label: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-panel border border-line bg-surface-1 bg-linear-to-b from-white/5 to-white/1 p-5 shadow-float">
      <span className={`flex size-12 items-center justify-center rounded-2xl ${TONE[tone]}`}>
        {icon}
      </span>
      <p className="flex flex-col">
        <span className="font-display text-4xl leading-9 font-extrabold">{value}</span>
        <span className="text-[13px] text-fg-muted">{label}</span>
      </p>
    </div>
  )
}

function InfoCard({
  tone,
  icon,
  title,
  children,
}: {
  tone: Tone
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex gap-4 rounded-panel border border-line bg-surface-1 p-6 shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_14px_30px_-16px_rgb(0_0_0/0.7)]">
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${TONE[tone]}`}
      >
        {icon}
      </span>
      <div>
        <h2 className="font-display text-[19px] font-bold">{title}</h2>
        <p className="mt-1 text-sm leading-5.5 text-fg-muted">{children}</p>
      </div>
    </div>
  )
}
