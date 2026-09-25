import { describe, expect, it } from 'vitest'
import { allowNavigation, isEaAddress, mayNavigate } from './navigation'

describe('mayNavigate', () => {
  it('blocks navigation for a window without a rule', () => {
    expect(mayNavigate({}, 'https://www.ea.com/')).toBe(false)
  })

  it("follows a window's own rule, and only for that window", () => {
    const signIn = {}
    const other = {}
    allowNavigation(signIn, isEaAddress)

    expect(mayNavigate(signIn, 'https://signin.ea.com/p/juno/login')).toBe(true)
    expect(mayNavigate(signIn, 'https://accounts.google.com/')).toBe(false)
    expect(mayNavigate(other, 'https://signin.ea.com/p/juno/login')).toBe(false)
  })
})

describe('isEaAddress', () => {
  it.each([
    'https://ea.com/',
    'https://www.ea.com/login_check',
    'https://accounts.ea.com/connect/auth?client_id=x',
    'https://signin.ea.com/p/juno/login',
  ])('allows %s', (url) => {
    expect(isEaAddress(url)).toBe(true)
  })

  it.each([
    'http://signin.ea.com/p/juno/login',
    'https://notea.com/',
    'https://ea.com.example.org/',
    'https://www.facebook.com/login',
    'javascript:alert(1)',
    'not a url',
  ])('blocks %s', (url) => {
    expect(isEaAddress(url)).toBe(false)
  })
})
