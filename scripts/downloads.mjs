import { execFileSync } from 'node:child_process'

const repo = 'Adam-Dickinson/Trophy-Locker'
const installer = /^Trophy-Locker-Setup-.+\.exe$/

const releases = JSON.parse(
  execFileSync('gh', ['api', `repos/${repo}/releases`, '--paginate', '--slurp'], { encoding: 'utf8' }),
).flat()

const rows = releases
  .filter((release) => !release.draft)
  .map((release) => ({
    version: release.tag_name,
    published: release.published_at.slice(0, 10),
    downloads: release.assets
      .filter((asset) => installer.test(asset.name))
      .reduce((sum, asset) => sum + asset.download_count, 0),
  }))

const total = rows.reduce((sum, row) => sum + row.downloads, 0)
console.table(rows)
console.log(`Total installer downloads: ${total}`)
