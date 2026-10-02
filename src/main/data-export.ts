import type { DatabaseSync } from 'node:sqlite'
import type { AppInfo, ExportResult } from '@shared/ipc'
import { buildDataExport } from './store/export-store'

export interface DataExporterDeps {
  readonly db: DatabaseSync
  readonly appInfo: () => AppInfo
  readonly chooseFile: (defaultName: string) => Promise<string | null>
  readonly writeFile: (path: string, text: string) => Promise<void>
  readonly now?: () => Date
}

const FAILED_MESSAGE =
  'Could not save the file. Check that the folder can be written to and try again.'

export class DataExporter {
  readonly #deps: DataExporterDeps

  constructor(deps: DataExporterDeps) {
    this.#deps = deps
  }

  async run(): Promise<ExportResult> {
    try {
      return await this.#export()
    } catch (err) {
      console.error('Saving the data export failed', err)
      return { kind: 'failed', message: FAILED_MESSAGE }
    }
  }

  async #export(): Promise<ExportResult> {
    const now = (this.#deps.now ?? (() => new Date()))()
    const path = await this.#deps.chooseFile(`trophy-locker-export-${localDate(now)}.json`)
    if (path === null) return { kind: 'cancelled' }

    const { version, schemaVersion } = this.#deps.appInfo()
    const data = buildDataExport(this.#deps.db, {
      appVersion: version,
      schemaVersion,
      exportedAt: now,
    })
    await this.#deps.writeFile(path, JSON.stringify(data, null, 2))
    return {
      kind: 'saved',
      path,
      games: data.games.length,
      achievements: data.games.reduce(
        (total, game) =>
          total + game.entries.reduce((sum, entry) => sum + entry.achievements.length, 0),
        0,
      ),
    }
  }
}

function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
