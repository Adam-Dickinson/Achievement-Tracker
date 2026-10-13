// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  type NotificationSettingsPatch,
  type StreamOverlayStatus,
} from '@shared/ipc'
import { fakeApi } from '@/test/fake-api'
import { StreamOverlaySection } from './StreamOverlaySection'

const RUNNING: StreamOverlayStatus = {
  state: 'running',
  url: 'http://127.0.0.1:47821/',
  message: null,
}

const ON: NotificationSettings = {
  ...DEFAULT_NOTIFICATION_SETTINGS,
  stream: { ...DEFAULT_NOTIFICATION_SETTINGS.stream, enabled: true },
}

const patch = vi.fn<(next: NotificationSettingsPatch) => Promise<void>>()
let pushStatus: (status: StreamOverlayStatus) => void = () => {}
const stopListening = vi.fn()
const writeText = vi.fn<(text: string) => Promise<void>>()

function setUp(status: StreamOverlayStatus) {
  window.api = fakeApi({
    getStreamOverlayStatus: vi.fn().mockResolvedValue(status),
    onStreamOverlayStatusChanged: vi.fn((listener: (s: StreamOverlayStatus) => void) => {
      pushStatus = listener
      return stopListening
    }),
  })
}

beforeEach(() => {
  patch.mockResolvedValue(undefined)
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  setUp(RUNNING)
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('StreamOverlaySection', () => {
  it('shows only the switch while the stream overlay is off', () => {
    setUp({ state: 'off', url: null, message: null })
    render(<StreamOverlaySection settings={DEFAULT_NOTIFICATION_SETTINGS} patch={patch} />)

    expect(screen.getByRole('switch', { name: 'Show unlocks on stream' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.queryByLabelText('Stream overlay port')).not.toBeInTheDocument()
  })

  it('turns the stream overlay on', () => {
    render(<StreamOverlaySection settings={DEFAULT_NOTIFICATION_SETTINGS} patch={patch} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Show unlocks on stream' }))

    expect(patch).toHaveBeenCalledWith({ stream: { enabled: true } })
  })

  it('shows the Browser Source URL once the server is running and copies it', async () => {
    render(<StreamOverlaySection settings={ON} patch={patch} />)

    expect(await screen.findByText('http://127.0.0.1:47821/')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledWith('http://127.0.0.1:47821/')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('explains a server error such as a busy port', async () => {
    setUp({
      state: 'error',
      url: null,
      message: 'Port 47821 is already in use by another program.',
    })
    render(<StreamOverlaySection settings={ON} patch={patch} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Port 47821 is already in use')
    expect(screen.getByRole('button', { name: /Send test to stream/ })).toBeDisabled()
  })

  it('follows status changes pushed from the app', async () => {
    setUp({ state: 'off', url: null, message: null })
    render(<StreamOverlaySection settings={ON} patch={patch} />)
    expect(await screen.findByText('Starting…')).toBeInTheDocument()

    act(() => pushStatus(RUNNING))

    expect(screen.getByText('http://127.0.0.1:47821/')).toBeInTheDocument()
  })

  it('stops listening for status changes when it unmounts', () => {
    const { unmount } = render(<StreamOverlaySection settings={ON} patch={patch} />)

    unmount()

    expect(stopListening).toHaveBeenCalledOnce()
  })

  it('saves a valid port when you press Enter', () => {
    render(<StreamOverlaySection settings={ON} patch={patch} />)
    const port = screen.getByLabelText('Stream overlay port')

    fireEvent.change(port, { target: { value: '50000' } })
    fireEvent.keyDown(port, { key: 'Enter' })

    expect(patch).toHaveBeenCalledWith({ stream: { port: 50000 } })
  })

  it('refuses a port outside the allowed range and says why', () => {
    render(<StreamOverlaySection settings={ON} patch={patch} />)
    const port = screen.getByLabelText('Stream overlay port')

    fireEvent.change(port, { target: { value: '80' } })
    fireEvent.blur(port)

    expect(patch).not.toHaveBeenCalled()
    expect(port).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Use a number from 1024 to 65535.')).toBeInTheDocument()
  })

  it('does not save the port when it has not changed', () => {
    render(<StreamOverlaySection settings={ON} patch={patch} />)

    fireEvent.blur(screen.getByLabelText('Stream overlay port'))

    expect(patch).not.toHaveBeenCalled()
  })

  it('toggles the stream chime separately from the desktop sound', () => {
    render(<StreamOverlaySection settings={ON} patch={patch} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Chime on stream' }))

    expect(patch).toHaveBeenCalledWith({ stream: { sound: { enabled: false } } })
  })

  it('changes the stream volume', () => {
    render(<StreamOverlaySection settings={ON} patch={patch} />)

    expect(screen.getByText('60%')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Stream volume'), { target: { value: '0.25' } })

    expect(patch).toHaveBeenCalledWith({ stream: { sound: { volume: 0.25 } } })
  })

  it('sends a test toast to the stream when running', async () => {
    render(<StreamOverlaySection settings={ON} patch={patch} />)
    const button = await screen.findByRole('button', { name: /Send test to stream/ })

    await vi.waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)

    expect(window.api.sendTestStreamToast).toHaveBeenCalledOnce()
  })
})
