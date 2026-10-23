import { describe, expect, it, vi, type Mock } from 'vitest'
import type { ToastPayload } from '@shared/ipc'
import { createNativeToaster, nativeToastText, type NativeNotification } from './native-toast'

const TOAST: ToastPayload = {
  heading: 'Achievement unlocked',
  rarity: 'rare',
  title: 'Lambda Locator',
  description: 'Find all the caches',
  game: 'Half-Life 2',
  platform: 'steam',
  percent: 4.2,
  platinum: false,
}

function fakeNotification(): NativeNotification & {
  emit(event: 'click' | 'close'): void
  show: Mock<() => void>
} {
  const listeners = new Map<string, () => void>()
  return {
    on: (event, listener) => listeners.set(event, listener),
    show: vi.fn<() => void>(),
    emit: (event) => listeners.get(event)?.(),
  }
}

describe('nativeToastText', () => {
  it('titles a single unlock with its heading and names the game, rarity and percent', () => {
    expect(nativeToastText(TOAST)).toEqual({
      title: 'Achievement unlocked',
      body: 'Lambda Locator\nHalf-Life 2 · Rare · 4.2%',
    })
  })

  it('leaves the percent out when it is unknown', () => {
    expect(nativeToastText({ ...TOAST, percent: null }).body).toBe(
      'Lambda Locator\nHalf-Life 2 · Rare',
    )
  })

  it('names a platinum as a platinum', () => {
    const platinum = { ...TOAST, heading: 'Platinum unlocked', platinum: true, percent: 1.5 }

    expect(nativeToastText(platinum)).toEqual({
      title: 'Platinum unlocked',
      body: 'Lambda Locator\nHalf-Life 2 · Platinum · 1.5%',
    })
  })

  it('titles a burst with its count', () => {
    const burst = { ...TOAST, heading: '7 achievements unlocked', game: '3 games' }

    expect(nativeToastText(burst)).toEqual({
      title: '7 achievements unlocked',
      body: 'Lambda Locator\n3 games · Rare · 4.2%',
    })
  })
})

describe('createNativeToaster', () => {
  it('shows a Windows notification with the toast text', () => {
    const notification = fakeNotification()
    const create = vi.fn(() => notification)
    const toast = createNativeToaster({
      supported: () => true,
      create,
      silent: () => false,
      onClick: vi.fn(),
    })

    toast(TOAST)

    expect(create).toHaveBeenCalledWith({ ...nativeToastText(TOAST), silent: false })
    expect(notification.show).toHaveBeenCalledOnce()
  })

  it('is silent when the chime is off', () => {
    const create = vi.fn(() => fakeNotification())
    const toast = createNativeToaster({
      supported: () => true,
      create,
      silent: () => true,
      onClick: vi.fn(),
    })

    toast(TOAST)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ silent: true }))
  })

  it('opens the app when the notification is clicked', () => {
    const notification = fakeNotification()
    const onClick = vi.fn()
    const toast = createNativeToaster({
      supported: () => true,
      create: () => notification,
      silent: () => false,
      onClick,
    })

    toast(TOAST)
    notification.emit('click')

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows nothing where notifications are not supported', () => {
    const create = vi.fn(() => fakeNotification())
    const toast = createNativeToaster({
      supported: () => false,
      create,
      silent: () => false,
      onClick: vi.fn(),
    })

    toast(TOAST)

    expect(create).not.toHaveBeenCalled()
  })
})
