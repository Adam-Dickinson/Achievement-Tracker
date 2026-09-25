import { describe, expect, it } from 'vitest'
import {
  allowNavigation,
  isEaAddress,
  isSonyAddress,
  isSteamAddress,
  mayNavigate,
} from './navigation'

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

describe('isSteamAddress', () => {
  it.each([
    'https://store.steampowered.com/login/',
    'https://login.steampowered.com/jwt/refresh',
    'https://steamcommunity.com/login/home/',
    'https://help.steampowered.com/en/',
  ])('allows %s', (url) => {
    expect(isSteamAddress(url)).toBe(true)
  })

  it.each([
    'http://store.steampowered.com/login/',
    'https://steampowered.com.example.org/',
    'https://notsteamcommunity.com/',
    'https://www.ea.com/',
  ])('blocks %s', (url) => {
    expect(isSteamAddress(url)).toBe(false)
  })
})

describe('isSonyAddress', () => {
  it.each([
    'https://ca.account.sony.com/api/authz/v3/oauth/authorize',
    'https://my.account.sony.com/sonyacct/signin/',
  ])('allows %s', (url) => {
    expect(isSonyAddress(url)).toBe(true)
  })

  it.each([
    'http://my.account.sony.com/sonyacct/signin/',
    'https://sony.com.example.org/',
    'https://www.playstation.com/',
    'com.scee.psxandroid.scecompcall://redirect/?code=1',
  ])('blocks %s', (url) => {
    expect(isSonyAddress(url)).toBe(false)
  })
})
