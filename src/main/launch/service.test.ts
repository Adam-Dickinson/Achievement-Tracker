import { afterEach, describe, expect, it, vi } from 'vitest'
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
  afterEach(() => {
    vi.restoreAllMocks()
  })

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
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'))
  })

  it('runs one more scan when one is requested during a scan', async () => {
    let release: () => void = () => {}
    const steam: InstallAdapter = {
      platform: 'steam',
      findInstalled: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<InstalledGame[]>((resolve) => {
              release = () => resolve([])
            }),
        )
        .mockResolvedValue([STEAM_INSTALL]),
    }
    const { svc } = service({ adapters: [steam] })

    const first = svc.scan()
    const second = svc.scan()
    release()
    await Promise.all([first, second])

    expect(steam.findInstalled).toHaveBeenCalledTimes(2)
    expect(svc.installed()).toHaveLength(1)
  })

  it('coalesces many requests during a scan into one follow-up', async () => {
    const steam = adapter('steam', [STEAM_INSTALL])
    const { svc, onChanged } = service({ adapters: [steam] })

    await Promise.all([svc.scan(), svc.scan(), svc.scan(), svc.scan()])

    expect(steam.findInstalled).toHaveBeenCalledTimes(2)
    expect(onChanged).toHaveBeenCalledTimes(2)
  })

  it('starts a fresh scan when requested after the previous one finished', async () => {
    const steam = adapter('steam', [STEAM_INSTALL])
    const { svc } = service({ adapters: [steam] })

    await svc.scan()
    await svc.scan()

    expect(steam.findInstalled).toHaveBeenCalledTimes(2)
  })

  it('still resolves when the follow-up scan has a failing adapter or announcer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: InstallAdapter = {
      platform: 'epic',
      findInstalled: vi.fn().mockRejectedValue(new Error('boom')),
    }
    const onChanged = vi.fn(() => {
      throw new Error('destroyed')
    })
    const { svc } = service({ adapters: [broken], onChanged })

    await expect(Promise.all([svc.scan(), svc.scan()])).resolves.toEqual([undefined, undefined])

    expect(broken.findInstalled).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalled()
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

  it('survives an onChanged callback that throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onChanged = vi.fn(() => {
      throw new Error('destroyed')
    })
    const { svc } = service({ onChanged })

    await expect(svc.scan()).resolves.toBeUndefined()

    expect(svc.installed()).toHaveLength(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('destroyed'))
  })

  it('returns the failure of a start even when the rescan cannot announce', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const steam = adapter('steam', [STEAM_INSTALL])
    const failure = { ok: false, reason: 'Could not open the launcher.' }
    const start = vi.fn().mockResolvedValue(failure)
    const onChanged = vi.fn(() => {
      throw new Error('destroyed')
    })
    const { svc } = service({ adapters: [steam], start, onChanged })
    await svc.scan()

    try {
      await expect(svc.play(7)).resolves.toEqual(failure)
      await vi.waitFor(() => expect(steam.findInstalled).toHaveBeenCalledTimes(2))
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('does not rescan after a successful start', async () => {
    const steam = adapter('steam', [STEAM_INSTALL])
    const { svc } = service({ adapters: [steam] })
    await svc.scan()

    await svc.play(7)
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(steam.findInstalled).toHaveBeenCalledOnce()
  })

  it('scans again once the previous scan has finished', async () => {
    const steam = adapter('steam', [STEAM_INSTALL])
    const { svc } = service({ adapters: [steam] })

    await svc.scan()
    await svc.scan()

    expect(steam.findInstalled).toHaveBeenCalledTimes(2)
  })
})
