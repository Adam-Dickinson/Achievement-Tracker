// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToastPayload } from '@shared/ipc'
import { OverlayApp } from './OverlayApp'

afterEach(cleanup)

describe('OverlayApp', () => {
  it('shows a toast when the main process sends one, and unsubscribes on unmount', () => {
    let deliver: (toast: ToastPayload) => void = () => {}
    const unsubscribe = vi.fn()
    window.api = {
      getAppInfo: vi.fn(),
      sendTestNotification: vi.fn(),
      onToast: (listener) => {
        deliver = listener
        return unsubscribe
      },
    }

    const { unmount } = render(<OverlayApp />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() =>
      deliver({
        rarity: 'rare',
        title: 'Platinum Trophy',
        description: 'Earn all other trophies',
        game: 'God of War',
        platform: 'PlayStation',
        percent: 2.8,
        durationMs: 5000,
      }),
    )
    expect(screen.getByText('Platinum Trophy')).toBeInTheDocument()

    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
