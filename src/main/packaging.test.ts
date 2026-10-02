import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../..')

function packagedFiles(): string[] {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    build: { files: string[] }
  }
  return pkg.build.files
}

function assetImports(): string[] {
  const sources = ['src/main/tray.ts', 'src/main/windows.ts']
  return sources.flatMap((file) => {
    const text = readFileSync(join(root, file), 'utf8')
    return [...text.matchAll(/from '\.\.\/\.\.\/(resources\/[^']+)\?asset'/g)].map((m) => m[1]!)
  })
}

describe('installer contents', () => {
  it('ships every resource the main process loads with ?asset', () => {
    const files = packagedFiles()
    const assets = assetImports()

    expect(assets.length).toBeGreaterThan(0)
    for (const asset of assets) expect(files).toContain(asset)
  })

  it('ships the high-DPI tray icon', () => {
    expect(packagedFiles()).toContain('resources/tray@2x.png')
  })
})
