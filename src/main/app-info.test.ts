import { describe, expect, it } from 'vitest'
import { appInfo } from './app-info'

describe('appInfo', () => {
  it('reports the version, the schema version and the signed-in user', () => {
    expect(appInfo('1.2.3', 4, () => 'adam')).toEqual({
      version: '1.2.3',
      schemaVersion: 4,
      userName: 'adam',
    })
  })

  it('trims the user name', () => {
    expect(appInfo('1.2.3', 4, () => '  adam ').userName).toBe('adam')
  })

  it('leaves the user name empty when the system cannot say who is signed in', () => {
    const info = appInfo('1.2.3', 4, () => {
      throw new Error('no passwd entry')
    })

    expect(info.userName).toBe('')
  })
})
