// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstalledEntry } from '@shared/launch'
import { fakeApi } from '@/test/fake-api'
import { useInstalled } from './useInstalled'

const ENTRY: InstalledEntry = { gameId: 1, platformGameId: 2, platform: 'steam' }

const getInstalled = vi.fn<() => Promise<InstalledEntry[]>>()
const offInstalled = vi.fn()
const offData = vi.fn()
let installedListener: () => void = () => {}
let dataListener: () => void = () => {}

beforeEach(() => {
  getInstalled.mockResolvedValue([ENTRY])
  window.api = fakeApi({
    getInstalled,
    onInstalledChanged: (listener) => {
      installedListener = listener
      return offInstalled
    },
    onDataChanged: (listener) => {
      dataListener = listener
      return offData
    },
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('useInstalled', () => {
  it('returns null until the list arrives', async () => {
    const { result } = renderHook(() => useInstalled())

    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toEqual([ENTRY]))
  })

  it('fetches again when installs change', async () => {
    const { result } = renderHook(() => useInstalled())
    await waitFor(() => expect(result.current).toEqual([ENTRY]))
    getInstalled.mockResolvedValue([])

    act(() => installedListener())

    await waitFor(() => expect(result.current).toEqual([]))
    expect(getInstalled).toHaveBeenCalledTimes(2)
  })

  it('fetches again when the library data changes', async () => {
    const { result } = renderHook(() => useInstalled())
    await waitFor(() => expect(result.current).toEqual([ENTRY]))

    act(() => dataListener())

    await waitFor(() => expect(getInstalled).toHaveBeenCalledTimes(2))
  })

  it('unsubscribes both listeners on unmount', async () => {
    const { result, unmount } = renderHook(() => useInstalled())
    await waitFor(() => expect(result.current).toEqual([ENTRY]))

    unmount()

    expect(offInstalled).toHaveBeenCalledOnce()
    expect(offData).toHaveBeenCalledOnce()
  })

  it('treats a failed fetch as nothing installed', async () => {
    getInstalled.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useInstalled())

    await waitFor(() => expect(result.current).toEqual([]))
  })
})
