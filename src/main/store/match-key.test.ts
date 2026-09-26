import { describe, expect, it } from 'vitest'
import { matchKey } from './match-key'

describe('matchKey', () => {
  it.each([
    ["Assassin's Creed IV Black Flag", 'Assassin’s Creed® IV Black Flag'],
    ['Call of Duty: Black Ops III', 'Call of Duty®: Black Ops III'],
    ["Tom Clancy's Rainbow Six Siege", 'Tom Clancy’s Rainbow Six® Siege'],
    ['Kingdom Come: Deliverance', 'Kingdom Come Deliverance'],
    ['Resident Evil 7 Biohazard', 'Resident Evil 7: Biohazard'],
    ['STAR WARS Jedi: Fallen Order™ ', 'STAR WARS Jedi: Fallen Order'],
    ['God of War Ragnarök', 'God of War Ragnarok'],
    ['God of War Ragnarök', 'God of War Ragnarök (PS5 / PC)'],
    ['Grand Theft Auto V (PS3)', 'Grand Theft Auto V (PS4)'],
    ['Terraria', 'Terraria (PS3 / PS Vita / PS4)'],
    ['Dragon Age: Inquisition', 'Dragon Age: Inquisition – Game of the Year Edition'],
    ['Fallout 4', 'Fallout 4: GOTY'],
    ['Borderlands 2', 'Borderlands 2 Deluxe Edition'],
    ['Destiny 2', 'Destiny 2 Digital Deluxe Edition'],
  ])('matches "%s" and "%s"', (a, b) => {
    expect(matchKey(a)).toBe(matchKey(b))
  })

  it.each([
    ['Sniper Elite V2', 'Sniper Elite V2 Remastered'],
    ['The Last of Us™ Part II', 'The Last of Us™ Part II Remastered'],
    ['Call of Duty®: Black Ops', 'Call of Duty®: Black Ops II'],
    ['Minecraft: PlayStation®3 Edition', 'Minecraft: PlayStation®4 Edition'],
    ['Metro Exodus', 'Metro Exodus Enhanced Edition'],
    ['Gold Rush: The Game', 'Rush: The Game'],
  ])('keeps "%s" and "%s" apart', (a, b) => {
    expect(matchKey(a)).not.toBe(matchKey(b))
  })

  it('gives a plain lower-case key', () => {
    expect(matchKey('Assassin’s Creed® III Remastered')).toBe('assassins creed iii remastered')
  })

  it('leaves a platform-looking tag in the middle of a title alone', () => {
    expect(matchKey('Game (PS4) Collection')).toBe('game ps4 collection')
  })

  it('gives an empty key for a title with no letters or digits', () => {
    expect(matchKey('™ ®')).toBe('')
    expect(matchKey('')).toBe('')
  })
})
