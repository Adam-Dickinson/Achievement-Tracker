import { describe, expect, it, vi } from 'vitest'
import type { KnownGame } from '@shared/launch'
import { LaunchService } from './service'
import type { InstallAdapter, InstalledGame } from './types'

const KNOWN: KnownGame[] = [
  { id: 7, gameId: 3, platform: 'steam', externalId: '220', title: 'Half-Life 2' },
  { id: 8, gameId: 4, platform: 'epic', externalId: 'fn', title: 'Fortnite' },
]

const STEAM_INSTALL: InstalledGame = {
  platform: 'steam',
  externalId: '220',
  title: 'Half-Life 2',
  target: { kind: 'uri', uri: 'steam://rungameid/220' },
}

function adapter(platform: InstallAdapter['platform'], games: InstalledGame[]): InstallAdapter {
  return { platform, findInstalled: vi.fn().mockResolvedValue(games) }
}

function service(over: Partial<ConstructorParameters<typeof LaunchService>[0]> = {}) {
  const start = vi.fn().mockResolvedValue({ ok: true })
  const onChanged = vi.fn()
  const svc = new LaunchService({
    adapters: [adapter('steam', [STEAM_INSTALL])],
    known: () => KNOWN,
    start,
    onChanged,
    ...over,
  })
  return { svc, start, onChanged }
}

describe('LaunchService', () => {
  it('reports nothing installed before the first scan', () => {
    expect(service().svc.installed()).toEqual([])
  })

  it('matches scanned installs to library games and announces the change', async () => {
    const { svc, onChanged } = service()

    await svc.scan()

    expect(svc.installed()).toEqual([{ gameId: 3, platformGameId: 7, platform: 'steam' }])
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('matches against the library as it is now, not as it was at scan time', async () => {
    let known: KnownGame[] = []
    const { svc } = service({ known: () => known })
    await svc.scan()
    expect(svc.installed()).toEqual([])

    known = KNOWN

    expect(svc.installed()).toHaveLength(1)
  })

  it('keeps going when one adapter fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: InstallAdapter = {
      platform: 'epic',
      findInstalled: vi.fn().mockRejectedValue(new Error('boom')),
    }
    const { svc } = service({ adapters: [broken, adapter('steam', [STEAM_INSTALL])] })

    await svc.scan()

    expect(svc.installed()).toHaveLength(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('epic'))
    warn.mockRestore()
  })

  it('shares one scan between callers that overlap', async () => {
    const steam = adapter('steam', [STEAM_INSTALL])
    const { svc } = service({ adapters: [steam] })

    await Promise.all([svc.scan(), svc.scan()])

    expect(steam.findInstalled).toHaveBeenCalledOnce()
  })

  it('starts the target of an installed game', async () => {
    const { svc, start } = service()
    await svc.scan()

    await expect(svc.play(7)).resolves.toEqual({ ok: true })
    expect(start).toHaveBeenCalledWith({ kind: 'uri', uri: 'steam://rungameid/220' })
  })

  it('refuses a game that is not installed', async () => {
    const { svc, start } = service()
    await svc.scan()

    await expect(svc.play(8)).resolves.toEqual({
      ok: false,
      reason: 'That game is not installed.',
    })
    expect(start).not.toHaveBeenCalled()
  })

  it('rescans after a failed start', async () => {
    const steam = adapter('steam', [STEAM_INSTALL])
    const start = vi.fn().mockResolvedValue({ ok: false, reason: 'Could not open the launcher.' })
    const { svc } = service({ adapters: [steam], start })
    await svc.scan()

    await svc.play(7)
    await vi.waitFor(() => expect(steam.findInstalled).toHaveBeenCalledTimes(2))
  })
})
