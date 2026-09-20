export interface Migration {
  readonly version: number
  readonly name: string
  readonly sql: string
}

// Every `migrations/NNNN_name.sql` file, loaded as text at build time. Files are forward-only:
// never edit one that has shipped (see docs/SPEC.md §3).
const files = import.meta.glob<string>('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function toMigration(path: string, sql: string): Migration {
  const name = (path.split('/').pop() ?? path).replace(/\.sql$/, '')
  const match = /^(\d{4})_/.exec(name)
  if (!match?.[1]) {
    throw new Error(`Migration file "${name}" must be named NNNN_description.sql`)
  }
  return { version: Number(match[1]), name, sql }
}

export const MIGRATIONS: readonly Migration[] = Object.entries(files)
  .map(([path, sql]) => toMigration(path, sql))
  .sort((a, b) => a.version - b.version)
