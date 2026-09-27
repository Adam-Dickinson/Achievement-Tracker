// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@shared/ipc'
import { fakeApi } from '@/test/fake-api'
import { displayName, useProfile } from './useProfile'

afterEach(cleanup)

describe('displayName', () => {
  it('prefers the saved name, then the Windows name', () => {
    expect(displayName({ name: 'Adam', windowsName: 'adamg' })).toBe('Adam')
    expect(displayName({ name: null, windowsName: 'adamg' })).toBe('adamg')
  })

  it('is empty until the profile is known', () => {
    expect(displayName(null)).toBe('')
  })
})

describe('useProfile', () => {
  it('loads the profile, and replaces it with what the main process returns on rename', async () => {
    window.api = fakeApi()
    const { result } = renderHook(() => useProfile())
    expect(result.current.profile).toBeNull()

    await waitFor(() => expect(result.current.profile).toEqual({ name: null, windowsName: 'adam' }))

    await act(() => result.current.rename(' Ada '))

    expect(window.api.setProfileName).toHaveBeenCalledExactlyOnceWith(' Ada ')
    expect(result.current.profile).toEqual({ name: 'Ada', windowsName: 'adam' })
  })

  it('ignores a reply that arrives after it is gone', async () => {
    let reply: (value: Profile) => void = () => {}
    window.api = fakeApi({
      getProfile: vi.fn(
        () =>
          new Promise<Profile>((resolve) => {
            reply = resolve
          }),
      ),
    })
    const { result, unmount } = renderHook(() => useProfile())

    unmount()
    await act(async () => reply({ name: null, windowsName: 'adam' }))

    expect(result.current.profile).toBeNull()
  })
})
