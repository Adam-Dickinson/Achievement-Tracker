// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OverlayFrame, VisibleToast } from '@shared/ipc'
import { OverlayApp } from './OverlayApp'
import { fakeApi } from '@/test/fake-api'
import { playChime } from './chime'

vi.mock('./chime', () => ({ playChime: vi.fn() }))

let deliver: (frame: OverlayFrame) => void = () => {}
const unsubscribe = vi.fn()

function toast(id: number, title: string): VisibleToast {
  return {
    id,
    heading: 'Achievement unlocked',
    rarity: 'rare',
    title,
    description: 'Earn all other trophies',
    game: 'God of War',
    platform: 'playstation',
    percent: 2.8,
    platinum: false,
  }
}

function frame(
  toasts: readonly VisibleToast[],
  overrides: Partial<OverlayFrame> = {},
): OverlayFrame {
  return {
    toasts,
    corner: 'bottom-right',
    scale: 1,
    sound: { enabled: false, volume: 0.6 },
    ...overrides,
  }
}

beforeEach(() => {
  window.api = fakeApi({
    onToasts: (listener) => {
      deliver = listener
      return unsubscribe
    },
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('OverlayApp', () => {
  it('shows nothing until the main process sends toasts', () => {
    render(<OverlayApp />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('draws every toast it is sent, oldest first', () => {
    render(<OverlayApp />)

    act(() => deliver(frame([toast(1, 'First'), toast(2, 'Second'), toast(3, 'Third')])))

    const shown = screen.getAllByRole('status').map((card) => card.textContent)
    expect(shown).toHaveLength(3)
    expect(shown[0]).toContain('First')
    expect(shown[2]).toContain('Third')
  })

  it('unsubscribes when it unmounts', () => {
    const { unmount } = render(<OverlayApp />)

    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('aligns toasts toward the chosen corner', () => {
    render(<OverlayApp />)

    act(() => deliver(frame([toast(1, 'First')], { corner: 'top-left' })))

    expect(screen.getByRole('status').parentElement).toHaveClass('items-start', 'justify-start')
  })

  it('scales the toast stack from the chosen corner', () => {
    render(<OverlayApp />)

    act(() => deliver(frame([toast(1, 'First')], { corner: 'top-left', scale: 1.15 })))

    expect(screen.getByRole('status').parentElement).toHaveStyle({
      transform: 'scale(1.15)',
      transformOrigin: 'top left',
    })
  })

  it('plays a chime for a newly shown toast when sound is enabled', () => {
    render(<OverlayApp />)

    act(() => deliver(frame([toast(1, 'First')], { sound: { enabled: true, volume: 0.6 } })))

    expect(playChime).toHaveBeenCalledExactlyOnceWith('rare', 0.6)
  })

  it('does not play a chime when sound is disabled', () => {
    render(<OverlayApp />)

    act(() => deliver(frame([toast(1, 'First')], { sound: { enabled: false, volume: 0.6 } })))

    expect(playChime).not.toHaveBeenCalled()
  })

  it('does not replay a chime for a toast that is still on screen', () => {
    render(<OverlayApp />)

    act(() => deliver(frame([toast(1, 'First')], { sound: { enabled: true, volume: 0.6 } })))
    act(() =>
      deliver(
        frame([toast(1, 'First'), toast(2, 'Second')], { sound: { enabled: true, volume: 0.6 } }),
      ),
    )

    expect(playChime).toHaveBeenCalledTimes(2)
    expect(playChime).toHaveBeenNthCalledWith(2, 'rare', 0.6)
  })
})
