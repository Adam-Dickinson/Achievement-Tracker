// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VisibleToast } from '@shared/ipc'
import { OverlayApp } from './OverlayApp'
import { fakeApi } from '@/test/fake-api'

let deliver: (toasts: readonly VisibleToast[]) => void = () => {}
const unsubscribe = vi.fn()

function toast(id: number, title: string): VisibleToast {
  return {
    id,
    heading: 'Achievement unlocked',
    rarity: 'rare',
    title,
    description: 'Earn all other trophies',
    game: 'God of War',
    platform: 'PlayStation',
    percent: 2.8,
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

    act(() => deliver([toast(1, 'First'), toast(2, 'Second'), toast(3, 'Third')]))

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
})
