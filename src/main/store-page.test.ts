import { describe, expect, it, vi } from 'vitest'
import { isStorePageUrl, openStorePage } from './store-page'

describe('isStorePageUrl', () => {
  it.each(['steam://nav/games/details/620', 'https://www.xbox.com/games/store/_/9NR1R1XWLCNB'])(
    'accepts %s',
    (url) => {
      expect(isStorePageUrl(url)).toBe(true)
    },
  )

  it.each([
    'steam://run/620',
    'steam://nav/games/details/620/../run',
    'steam://nav/games/details/',
    'http://www.xbox.com/games/store/_/9NR1R1XWLCNB',
    'https://www.xbox.com/games/store/_/9nr1r1xwlcnb',
    'https://www.xbox.com.evil.test/games/store/_/9NR1R1XWLCNB',
    'https://www.xbox.com/games/store/_/9NR1R1XWLCNB?next=file:///c:/',
    'file:///C:/Windows/notepad.exe',
    '',
  ])('refuses %s', (url) => {
    expect(isStorePageUrl(url)).toBe(false)
  })
})

describe('openStorePage', () => {
  it('opens an allowed store page', async () => {
    const open = vi.fn(() => Promise.resolve())

    expect(await openStorePage('steam://nav/games/details/620', open)).toBe(true)
    expect(open).toHaveBeenCalledExactlyOnceWith('steam://nav/games/details/620')
  })

  it.each([
    ['no link', null],
    ['a link that is not a store page', 'steam://run/620'],
  ])('opens nothing for %s', async (_label, url) => {
    const open = vi.fn(() => Promise.resolve())

    expect(await openStorePage(url, open)).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})
