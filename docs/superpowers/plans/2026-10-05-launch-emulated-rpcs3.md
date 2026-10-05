# Launching emulated games (RPCS3) and RPCS3 cover art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RPCS3 games can be started from Game detail, and RPCS3 games get their own cover art from the game icon in the trophy folder. shadPS4 launching is deferred (see Deviations).

**Architecture:** Builds on the launch module from `2026-10-05-launch-games-base-steam.md` (already on this branch). A new RPCS3 install adapter reads `<rpcs3>/config/games.yml` (serial to game path), reads each game's real title from `PARAM.SFO` (inside the ISO for `.iso` files, or the game folder), and produces a `program` launch target (`rpcs3.exe --no-gui <path>`). The RPCS3 program is found beside the data folder or chosen by the user and saved in settings. The RPCS3 provider sets `coverUrl` to the trophy folder's `ICON0.PNG`.

**Tech Stack:** Electron main (Node), zod v4 for IPC payloads, React 19, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-05-launch-games-design.md](../specs/2026-10-05-launch-games-design.md) (sections 1 and 3, phase 7), amended by the Deviations below.

## Global Constraints

- CLAUDE.md applies in full: TypeScript strict with `noUncheckedIndexedAccess`, no `any`, no code comments, Prettier (no semicolons, single quotes), ESLint zero warnings, Tailwind tokens only (no hex).
- Rule 4: never read or touch a game process; the emulator is started as a detached program, nothing is attached to it.
- Rule 6: parsers defensive: size limits, bounds checks, `ProviderError('parse', ...)` on malformed input; never trust length fields read from a file.
- Rule 9: new capability goes `src/shared/ipc.ts` → `src/main/ipc.ts` (sender checked, payload validated) → `src/preload/index.ts`. The renderer never supplies a path or arguments for launching; the only path it can cause is the emulator program, chosen through a dialog opened by the main process.
- Rule 10: formats were verified against the owner's real RPCS3 install on 5 October 2026: `rpcs3.exe` sits beside `dev_hdd0`; `config/games.yml` has the single line `BLUS30443: D:/Emulators/PS3 Games/Demons Souls (USA)/Demon's Souls (USA).iso`; the ISO is ISO 9660 (`CD001` at sector 16) with `PS3_GAME/PARAM.SFO` giving `TITLE = Demon's Souls` and `TITLE_ID = BLUS30443`; the trophy folder `dev_hdd0/home/00000001/trophy/NPWR00881_00/` holds `ICON0.PNG` (112,321 bytes); `rpcs3.exe --help` lists `--no-gui` and `(S)ELF [Args...]`.
- Never run Prettier on `.md` files.
- Before each commit: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` all pass. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Test output must be pristine: silence expected `console.warn` calls with a spy restored in `afterEach`.

## Deviations from the spec (recorded in Task 5)

- **shadPS4 launching is not built.** The owner's machine has no installed shadPS4 game (the install folders list is empty, only `.pkg` files exist), so rule 10 cannot be satisfied. `shadPS4.exe -g <game path or ID>` is verified from `--help`. It gets its own plan when a game is installed.
- **Matching RPCS3 games to the library uses the game's own title.** Nothing local links the trophy set `NPWR00881_00` to the serial `BLUS30443`, so the adapter reads `TITLE` from `PARAM.SFO` and the existing title matching links it to the library entry ("Demon's Souls" equals "Demon's Souls").
- **Program targets must be absolute `.exe` paths** (deferred review item from the base plan).
- **RPCS3 cover art:** `coverUrl` is a `file://` URL of the local `ICON0.PNG`.

---

### Task 1: RPCS3 cover art from ICON0.PNG

**Files:**
- Modify: `src/main/providers/rpcs3/local.ts` (`listGames`)
- Test: `src/main/providers/rpcs3/local.test.ts` (or the existing test file that covers `listGames`; follow its fake `LocalFiles` helpers)

**Interfaces:**
- Consumes: `LocalFiles.listFolder` (`src/main/providers/local-files.ts`), the existing `trophyFolders(files, account)` and the path of a trophy set's folder (read `local.ts` to see how it builds `join(<data dir>, 'dev_hdd0', 'home', <user>, 'trophy', <npCommId>)`).
- Produces: `RemoteGame.coverUrl` is `pathToFileURL(<trophy folder>/ICON0.PNG).href` when the file exists, else `null`.

- [ ] **Step 1: Write the failing tests.** Using the existing fake `LocalFiles` in the RPCS3 tests, add:

```ts
  it('uses the trophy folder icon as the cover when it exists', async () => {
    const games = await listGames(filesWith({ trophySets: ['NPWR00881_00'], icon: true }), ACCOUNT, NOW)

    expect(games[0]?.coverUrl).toBe(pathToFileURL(join(TROPHY_ROOT, 'NPWR00881_00', 'ICON0.PNG')).href)
  })

  it('has no cover when the trophy folder has no icon', async () => {
    const games = await listGames(filesWith({ trophySets: ['NPWR00881_00'], icon: false }), ACCOUNT, NOW)

    expect(games[0]?.coverUrl).toBeNull()
  })

  it('has no cover when the folder cannot be listed', async () => {
    const games = await listGames(filesWith({ trophySets: ['NPWR00881_00'], iconListingFails: true }), ACCOUNT, NOW)

    expect(games[0]?.coverUrl).toBeNull()
  })
```

(`filesWith`, `ACCOUNT`, `NOW`, `TROPHY_ROOT` stand for the helpers/fixtures the existing tests already use; adapt names to the real ones and extend the fake `LocalFiles` so `listFolder` of a trophy set folder returns `ICON0.PNG` plus `TROPCONF.SFM` and `TROPUSR.DAT` entries, a listing without it, or rejects.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/providers/rpcs3`
Expected: FAIL (`coverUrl` is `null`).

- [ ] **Step 3: Implement.** In `listGames`, replace `coverUrl: null` with the result of a small helper:

```ts
async function trophyIcon(files: LocalFiles, folder: string): Promise<string | null> {
  try {
    const entries = await files.listFolder(folder)
    const icon = entries?.find((entry) => !entry.isDirectory && entry.name.toUpperCase() === 'ICON0.PNG')
    return icon ? pathToFileURL(join(folder, icon.name)).href : null
  } catch {
    return null
  }
}
```

and `coverUrl: await trophyIcon(files, <the trophy set folder>)` inside the existing `Promise.all` map (import `pathToFileURL` from `node:url`; `join` from `node:path` if not already imported).

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/main/providers/rpcs3 && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/providers/rpcs3
git commit -m "Use the RPCS3 trophy folder icon as the game cover"
```

---

### Task 2: PS3 title reading (ISO 9660, PARAM.SFO, games.yml)

**Files:**
- Create: `src/main/launch/ps3/iso9660.ts`, `src/main/launch/ps3/file-source.ts`, `src/main/launch/ps3/param-sfo.ts`, `src/main/launch/ps3/games-yml.ts`, `src/main/launch/ps3/title.ts`
- Create: `src/main/launch/ps3/test-helpers.ts` (builds a tiny ISO and a PARAM.SFO for tests)
- Create: `tests/fixtures/rpcs3/PARAM.SFO` (the real 1,008-byte file, extracted by the script in Step 1)
- Test: `src/main/launch/ps3/{iso9660,file-source,param-sfo,games-yml,title}.test.ts`

**Interfaces:**
- Produces:
  - `ByteSource { read(position: number, length: number): Promise<Uint8Array> }` and `fileByteSource(path: string): ByteSource`
  - `readIsoFile(source: ByteSource, path: readonly string[]): Promise<Uint8Array | null>` (null when a path part is missing; throws `ProviderError('parse')` when it is not an ISO 9660 image or a record is malformed)
  - `ParamSfo { readonly title: string; readonly titleId: string | null }`, `parseParamSfo(bytes: Uint8Array): ParamSfo`
  - `GameEntry { readonly serial: string; readonly path: string }`, `parseGamesYml(text: string): GameEntry[]`
  - `TitleDeps { readonly files: Pick<LocalFiles, 'readBytes'>; readonly openSource: (path: string) => ByteSource }`, `readPs3Title(path: string, deps: TitleDeps): Promise<ParamSfo | null>`

- [ ] **Step 1: Extract the real fixture** (one-off, not committed): run this in the repo root and confirm it prints `TITLE = Demon's Souls`:

```bash
node -e "
const fs=require('fs');const fd=fs.openSync(\"D:/Emulators/PS3 Games/Demons Souls (USA)/Demon's Souls (USA).iso\",'r');
const rd=(p,l)=>{const b=Buffer.alloc(l);fs.readSync(fd,b,0,l,p);return b};
const pvd=rd(16*2048,2048);let lba=pvd.readUInt32LE(158),len=pvd.readUInt32LE(166);
const ls=(l,n)=>{const b=rd(l*2048,n),o=[];let p=0;while(p<n){const r=b[p];if(!r){p=(Math.floor(p/2048)+1)*2048;continue}o.push({name:b.toString('latin1',p+33,p+33+b[p+32]).replace(/;1\$/,''),lba:b.readUInt32LE(p+2),len:b.readUInt32LE(p+10)});p+=r}return o};
const g=ls(lba,len).find(e=>e.name==='PS3_GAME');const s=ls(g.lba,g.len).find(e=>e.name==='PARAM.SFO');
const sfo=rd(s.lba*2048,s.len);fs.mkdirSync('tests/fixtures/rpcs3',{recursive:true});fs.writeFileSync('tests/fixtures/rpcs3/PARAM.SFO',sfo);console.log(sfo.length)"
```

The file holds only the game's title, serial and version (no account data). If the ISO is unavailable, skip the fixture and keep only the synthetic tests (note it in the report).

- [ ] **Step 2: Write the failing tests.**

`src/main/launch/ps3/test-helpers.ts`:

```ts
import type { ByteSource } from './iso9660'

const SECTOR = 2048

export function buildSfo(entries: Record<string, string>): Uint8Array {
  const keys = Object.keys(entries)
  const keyTable = new TextEncoder().encode(keys.map((key) => `${key}\0`).join(''))
  const values = keys.map((key) => new TextEncoder().encode(`${entries[key]}\0`))
  const keyOffset = 20 + keys.length * 16
  const dataOffset = keyOffset + keyTable.length
  const dataLength = values.reduce((total, value) => total + value.length, 0)
  const bytes = new Uint8Array(dataOffset + dataLength)
  const view = new DataView(bytes.buffer)
  bytes.set([0x00, 0x50, 0x53, 0x46], 0)
  view.setUint32(4, 0x0101, true)
  view.setUint32(8, keyOffset, true)
  view.setUint32(12, dataOffset, true)
  view.setUint32(16, keys.length, true)
  let keyPosition = 0
  let dataPosition = 0
  keys.forEach((key, index) => {
    const entry = 20 + index * 16
    const value = values[index] ?? new Uint8Array()
    view.setUint16(entry, keyPosition, true)
    view.setUint16(entry + 2, 0x0204, true)
    view.setUint32(entry + 4, value.length, true)
    view.setUint32(entry + 8, value.length, true)
    view.setUint32(entry + 12, dataPosition, true)
    bytes.set(value, dataOffset + dataPosition)
    keyPosition += key.length + 1
    dataPosition += value.length
  })
  bytes.set(keyTable, keyOffset)
  return bytes
}

function record(name: string, lba: number, size: number, directory: boolean): Uint8Array {
  const nameBytes = [...name].map((char) => char.charCodeAt(0))
  let length = 33 + nameBytes.length
  if (length % 2 === 1) length += 1
  const bytes = new Uint8Array(length)
  const view = new DataView(bytes.buffer)
  bytes[0] = length
  view.setUint32(2, lba, true)
  view.setUint32(10, size, true)
  bytes[25] = directory ? 2 : 0
  bytes[32] = nameBytes.length
  bytes.set(nameBytes, 33)
  return bytes
}

function sectorOf(records: Uint8Array[]): Uint8Array {
  const sector = new Uint8Array(SECTOR)
  let offset = 0
  for (const item of records) {
    sector.set(item, offset)
    offset += item.length
  }
  return sector
}

export function buildIso(sfo: Uint8Array): Uint8Array {
  const image = new Uint8Array(SECTOR * 24)
  const volume = new Uint8Array(SECTOR)
  volume[0] = 1
  volume.set([0x43, 0x44, 0x30, 0x30, 0x31], 1)
  volume.set(record('', 20, SECTOR, true).subarray(0, 34), 156)
  image.set(volume, 16 * SECTOR)
  image.set(sectorOf([record('PS3_DISC.SFB;1', 23, 10, false), record('PS3_GAME', 21, SECTOR, true)]), 20 * SECTOR)
  image.set(sectorOf([record('PARAM.SFO;1', 22, sfo.length, false)]), 21 * SECTOR)
  image.set(sfo, 22 * SECTOR)
  return image
}

export function memorySource(bytes: Uint8Array): ByteSource {
  return {
    read: (position, length) => Promise.resolve(bytes.slice(position, position + length)),
  }
}
```

`iso9660.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import { readIsoFile } from './iso9660'
import { buildIso, buildSfo, memorySource } from './test-helpers'

const SFO = buildSfo({ TITLE: "Demon's Souls", TITLE_ID: 'BLUS30443' })

describe('readIsoFile', () => {
  it('reads a file from a folder of the image', async () => {
    const bytes = await readIsoFile(memorySource(buildIso(SFO)), ['PS3_GAME', 'PARAM.SFO'])

    expect(bytes).toEqual(SFO)
  })

  it('matches names without regard to case', async () => {
    const bytes = await readIsoFile(memorySource(buildIso(SFO)), ['ps3_game', 'param.sfo'])

    expect(bytes).toEqual(SFO)
  })

  it('returns null when a part of the path is missing', async () => {
    const source = memorySource(buildIso(SFO))

    await expect(readIsoFile(source, ['PS3_GAME', 'NOPE.SFO'])).resolves.toBeNull()
    await expect(readIsoFile(source, ['MISSING', 'PARAM.SFO'])).resolves.toBeNull()
  })

  it('returns null for an empty path', async () => {
    await expect(readIsoFile(memorySource(buildIso(SFO)), [])).resolves.toBeNull()
  })

  it('refuses something that is not an ISO 9660 image', async () => {
    await expect(readIsoFile(memorySource(new Uint8Array(40_000)), ['A'])).rejects.toBeInstanceOf(
      ProviderError,
    )
  })

  it('refuses a file that is too large to be a PARAM.SFO', async () => {
    const image = buildIso(SFO)
    new DataView(image.buffer).setUint32(21 * 2048 + 10, 10_000_000, true)

    await expect(readIsoFile(memorySource(image), ['PS3_GAME', 'PARAM.SFO'])).rejects.toBeInstanceOf(
      ProviderError,
    )
  })

  it('refuses a directory record that runs past the directory', async () => {
    const image = buildIso(SFO)
    image[20 * 2048] = 255
    image[20 * 2048 + 1 + 0] = image[20 * 2048 + 1] ?? 0

    await expect(readIsoFile(memorySource(image), ['PS3_GAME', 'PARAM.SFO'])).rejects.toBeInstanceOf(
      ProviderError,
    )
  })
})
```

(If the last test's byte poke does not produce an out-of-range record with the real helper, change it so the first record's length byte is `255` and the directory size is `2048`: a record length of 255 at offset 0 fits, so instead poke the length byte at the last record start to `200`; the assertion is that a record whose declared length overruns the directory throws `ProviderError`. Make the test fail first against a naive implementation, then pass.)

`param-sfo.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProviderError } from '@shared/errors'
import { parseParamSfo } from './param-sfo'
import { buildSfo } from './test-helpers'

describe('parseParamSfo', () => {
  it('reads the title and serial', () => {
    expect(parseParamSfo(buildSfo({ TITLE: "Demon's Souls", TITLE_ID: 'BLUS30443' }))).toEqual({
      title: "Demon's Souls",
      titleId: 'BLUS30443',
    })
  })

  it('reads the real Demon\'s Souls file', () => {
    const bytes = readFileSync(join(__dirname, '../../../../tests/fixtures/rpcs3/PARAM.SFO'))

    expect(parseParamSfo(bytes)).toEqual({ title: "Demon's Souls", titleId: 'BLUS30443' })
  })

  it('allows a missing serial', () => {
    expect(parseParamSfo(buildSfo({ TITLE: 'Game' }))).toEqual({ title: 'Game', titleId: null })
  })

  it.each([
    ['too short', new Uint8Array(8)],
    ['wrong magic', new Uint8Array(64)],
    ['no title', buildSfo({ TITLE_ID: 'BLUS30443' })],
  ])('refuses a file that is %s', (_name, bytes) => {
    expect(() => parseParamSfo(bytes)).toThrow(ProviderError)
  })

  it('refuses an entry count that does not fit the file', () => {
    const bytes = buildSfo({ TITLE: 'Game' })
    new DataView(bytes.buffer).setUint32(16, 100_000, true)

    expect(() => parseParamSfo(bytes)).toThrow(ProviderError)
  })

  it('refuses a data offset outside the file', () => {
    const bytes = buildSfo({ TITLE: 'Game' })
    new DataView(bytes.buffer).setUint32(20 + 12, 1_000_000, true)

    expect(() => parseParamSfo(bytes)).toThrow(ProviderError)
  })
})
```

(If the real fixture could not be extracted in Step 1, delete the "real" test.)

`games-yml.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseGamesYml } from './games-yml'

describe('parseGamesYml', () => {
  it('reads serial to path lines', () => {
    expect(
      parseGamesYml("BLUS30443: D:/Emulators/PS3 Games/Demons Souls (USA)/Demon's Souls (USA).iso\n"),
    ).toEqual([
      { serial: 'BLUS30443', path: "D:/Emulators/PS3 Games/Demons Souls (USA)/Demon's Souls (USA).iso" },
    ])
  })

  it('strips quotes and handles Windows line endings', () => {
    expect(parseGamesYml('BLES00001: "E:/Games/A B"\r\nNPUB30001: \'E:/Games/C\'\r\n')).toEqual([
      { serial: 'BLES00001', path: 'E:/Games/A B' },
      { serial: 'NPUB30001', path: 'E:/Games/C' },
    ])
  })

  it('skips comments, blanks and anything that is not a serial', () => {
    expect(parseGamesYml('# note\n\nnot a line\nC: D:/x\nBLUS30443:\n')).toEqual([])
  })
})
```

`file-source.test.ts`:

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileByteSource } from './file-source'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tl-source-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('fileByteSource', () => {
  it('reads a slice from a position', async () => {
    const path = join(dir, 'a.bin')
    await writeFile(path, Buffer.from([1, 2, 3, 4, 5, 6]))

    const bytes = await fileByteSource(path).read(2, 3)

    expect([...bytes]).toEqual([3, 4, 5])
  })

  it('returns what exists when the file is shorter than asked', async () => {
    const path = join(dir, 'b.bin')
    await writeFile(path, Buffer.from([1, 2]))

    expect([...(await fileByteSource(path).read(1, 10))]).toEqual([2])
  })

  it('rejects when the file does not exist', async () => {
    await expect(fileByteSource(join(dir, 'missing.bin')).read(0, 1)).rejects.toThrow()
  })
})
```

`title.test.ts`:

```ts
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { readPs3Title } from './title'
import { buildIso, buildSfo, memorySource } from './test-helpers'

const SFO = buildSfo({ TITLE: "Demon's Souls", TITLE_ID: 'BLUS30443' })

function deps(files: Record<string, Uint8Array>) {
  return {
    files: { readBytes: vi.fn((path: string) => Promise.resolve(files[path] ?? null)) },
    openSource: vi.fn(() => memorySource(buildIso(SFO))),
  }
}

describe('readPs3Title', () => {
  it('reads the title from inside an iso', async () => {
    const d = deps({})

    await expect(readPs3Title('D:/G/game.ISO', d)).resolves.toEqual({
      title: "Demon's Souls",
      titleId: 'BLUS30443',
    })
    expect(d.openSource).toHaveBeenCalledWith('D:/G/game.ISO')
  })

  it('reads PS3_GAME/PARAM.SFO from a game folder', async () => {
    const d = deps({ [join('D:/G/folder', 'PS3_GAME', 'PARAM.SFO')]: SFO })

    await expect(readPs3Title('D:/G/folder', d)).resolves.toEqual({
      title: "Demon's Souls",
      titleId: 'BLUS30443',
    })
    expect(d.openSource).not.toHaveBeenCalled()
  })

  it('falls back to PARAM.SFO at the top of the folder', async () => {
    const d = deps({ [join('D:/G/folder', 'PARAM.SFO')]: SFO })

    await expect(readPs3Title('D:/G/folder', d)).resolves.toMatchObject({ titleId: 'BLUS30443' })
  })

  it('returns null when the folder has no PARAM.SFO', async () => {
    await expect(readPs3Title('D:/G/folder', deps({}))).resolves.toBeNull()
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/main/launch/ps3`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement.**

`src/main/launch/ps3/iso9660.ts`:

```ts
import { ProviderError } from '@shared/errors'

export interface ByteSource {
  read(position: number, length: number): Promise<Uint8Array>
}

const SECTOR = 2048
const VOLUME_SECTOR = 16
const MAX_DIRECTORY_BYTES = 1_048_576
const MAX_FILE_BYTES = 262_144
const LATIN1 = new TextDecoder('latin1')

interface Entry {
  readonly name: string
  readonly lba: number
  readonly size: number
  readonly directory: boolean
}

function malformed(reason: string): ProviderError {
  return new ProviderError('parse', `RPCS3: ${reason}`)
}

function same(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase()
}

export async function readIsoFile(
  source: ByteSource,
  path: readonly string[],
): Promise<Uint8Array | null> {
  const folders = [...path]
  const file = folders.pop()
  if (file === undefined) return null

  const volume = await source.read(VOLUME_SECTOR * SECTOR, SECTOR)
  if (volume.length < SECTOR || volume[0] !== 1 || LATIN1.decode(volume.subarray(1, 6)) !== 'CD001') {
    throw malformed('the game file is not an ISO 9660 disc image')
  }
  const view = new DataView(volume.buffer, volume.byteOffset, volume.byteLength)
  let directory: Entry = {
    name: '',
    lba: view.getUint32(158, true),
    size: view.getUint32(166, true),
    directory: true,
  }

  for (const name of folders) {
    const next = (await listDirectory(source, directory)).find(
      (entry) => entry.directory && same(entry.name, name),
    )
    if (!next) return null
    directory = next
  }

  const entry = (await listDirectory(source, directory)).find(
    (item) => !item.directory && same(item.name, file),
  )
  if (!entry) return null
  if (entry.size > MAX_FILE_BYTES) throw malformed(`${file} is larger than ${MAX_FILE_BYTES} bytes`)
  return source.read(entry.lba * SECTOR, entry.size)
}

async function listDirectory(source: ByteSource, directory: Entry): Promise<Entry[]> {
  if (directory.size > MAX_DIRECTORY_BYTES) throw malformed('a disc image folder is too large')
  const bytes = await source.read(directory.lba * SECTOR, directory.size)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries: Entry[] = []
  let offset = 0
  while (offset < bytes.length) {
    const length = bytes[offset] ?? 0
    if (length === 0) {
      offset = (Math.floor(offset / SECTOR) + 1) * SECTOR
      continue
    }
    const nameLength = bytes[offset + 32] ?? 0
    if (length < 34 || offset + length > bytes.length || 33 + nameLength > length) {
      throw malformed('a disc image folder entry is damaged')
    }
    entries.push({
      name: LATIN1.decode(bytes.subarray(offset + 33, offset + 33 + nameLength)).replace(/;\d+$/, ''),
      lba: view.getUint32(offset + 2, true),
      size: view.getUint32(offset + 10, true),
      directory: ((bytes[offset + 25] ?? 0) & 2) !== 0,
    })
    offset += length
  }
  return entries
}
```

`src/main/launch/ps3/file-source.ts`:

```ts
import { open } from 'node:fs/promises'
import type { ByteSource } from './iso9660'

export function fileByteSource(path: string): ByteSource {
  return {
    async read(position, length) {
      const handle = await open(path, 'r')
      try {
        const buffer = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buffer, 0, length, position)
        return buffer.subarray(0, bytesRead)
      } finally {
        await handle.close()
      }
    },
  }
}
```

`src/main/launch/ps3/param-sfo.ts`:

```ts
import { ProviderError } from '@shared/errors'

export interface ParamSfo {
  readonly title: string
  readonly titleId: string | null
}

const HEADER_BYTES = 20
const ENTRY_BYTES = 16
const MAX_ENTRIES = 1024
const UTF8 = new TextDecoder('utf-8')

function malformed(reason: string): ProviderError {
  return new ProviderError('parse', `RPCS3: PARAM.SFO ${reason}`)
}

function text(bytes: Uint8Array, start: number, limit: number): string {
  let end = start
  while (end < limit && bytes[end] !== 0) end++
  return UTF8.decode(bytes.subarray(start, end))
}

export function parseParamSfo(bytes: Uint8Array): ParamSfo {
  if (bytes.length < HEADER_BYTES) throw malformed('is too short')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, false) !== 0x00505346) throw malformed('has the wrong magic number')
  const keyTable = view.getUint32(8, true)
  const dataTable = view.getUint32(12, true)
  const count = view.getUint32(16, true)
  if (count > MAX_ENTRIES || HEADER_BYTES + count * ENTRY_BYTES > bytes.length) {
    throw malformed('has an entry count that does not fit the file')
  }

  const values = new Map<string, string>()
  for (let index = 0; index < count; index++) {
    const entry = HEADER_BYTES + index * ENTRY_BYTES
    const keyStart = keyTable + view.getUint16(entry, true)
    const dataStart = dataTable + view.getUint32(entry + 12, true)
    const length = view.getUint32(entry + 4, true)
    if (keyStart >= bytes.length || dataStart + length > bytes.length) {
      throw malformed('has an entry outside the file')
    }
    values.set(text(bytes, keyStart, bytes.length), text(bytes, dataStart, dataStart + length))
  }

  const title = values.get('TITLE')
  if (!title) throw malformed('has no TITLE')
  return { title, titleId: values.get('TITLE_ID') ?? null }
}
```

`src/main/launch/ps3/games-yml.ts`:

```ts
export interface GameEntry {
  readonly serial: string
  readonly path: string
}

const LINE = /^([A-Z]{4}\d{5}):\s*(.+)$/

export function parseGamesYml(text: string): GameEntry[] {
  const entries: GameEntry[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const match = LINE.exec(line)
    const serial = match?.[1]
    const value = unquote((match?.[2] ?? '').trim())
    if (serial && value !== '') entries.push({ serial, path: value })
  }
  return entries
}

function unquote(value: string): string {
  const quote = value[0]
  if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
    return value.slice(1, -1)
  }
  return value
}
```

`src/main/launch/ps3/title.ts`:

```ts
import { join } from 'node:path'
import type { LocalFiles } from '../../providers/local-files'
import type { ByteSource } from './iso9660'
import { readIsoFile } from './iso9660'
import { parseParamSfo, type ParamSfo } from './param-sfo'

const MAX_SFO_BYTES = 262_144

export interface TitleDeps {
  readonly files: Pick<LocalFiles, 'readBytes'>
  readonly openSource: (path: string) => ByteSource
}

export async function readPs3Title(path: string, deps: TitleDeps): Promise<ParamSfo | null> {
  const bytes = path.toLowerCase().endsWith('.iso')
    ? await readIsoFile(deps.openSource(path), ['PS3_GAME', 'PARAM.SFO'])
    : await readFromFolder(path, deps.files)
  return bytes === null ? null : parseParamSfo(bytes)
}

async function readFromFolder(
  path: string,
  files: Pick<LocalFiles, 'readBytes'>,
): Promise<Uint8Array | null> {
  for (const parts of [['PS3_GAME', 'PARAM.SFO'], ['PARAM.SFO']]) {
    const bytes = await files.readBytes(join(path, ...parts), MAX_SFO_BYTES)
    if (bytes !== null) return bytes
  }
  return null
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/main/launch/ps3 && npm run typecheck && npm run lint`
Expected: PASS. If a test helper byte layout disagrees with the parser (the plan was written without running it), fix the helper or parser so both match the real formats listed in Global Constraints, keeping the real-file fixture test as the arbiter.

- [ ] **Step 6: Commit**

```bash
git add src/main/launch/ps3 tests/fixtures/rpcs3/PARAM.SFO
git commit -m "Read PS3 game titles from ISO 9660 images, PARAM.SFO and games.yml"
```

---

### Task 3: RPCS3 install adapter and absolute program paths

**Files:**
- Create: `src/main/launch/rpcs3.ts`
- Modify: `src/main/launch/start.ts` (program targets need an absolute path)
- Modify: `src/main/providers/rpcs3/local.ts` (export `dataDirOf(externalId)` if no inverse of `accountExternalId` exists; read the file first)
- Modify: `src/main/index.ts` (register the adapter)
- Test: `src/main/launch/rpcs3.test.ts`, `src/main/launch/start.test.ts`, `src/main/providers/rpcs3/local.test.ts`

**Interfaces:**
- Consumes: `parseGamesYml`, `readPs3Title`, `TitleDeps`, `fileByteSource` (Task 2), `InstallAdapter`/`InstalledGame` (`src/main/launch/types.ts`), `LocalFiles`, `LOCAL_FILES`, the RPCS3 accounts (`listConnectedAccounts(db)` filtered to platform `rpcs3`) and `accountExternalId` (`src/main/providers/rpcs3/local.ts`).
- Produces: `Rpcs3InstallDeps { dataDirs: () => string[]; exePath: (dataDir: string) => Promise<string | null>; files: Pick<LocalFiles, 'readText' | 'readBytes'>; openSource: (path: string) => ByteSource }`, `createRpcs3InstallAdapter(deps): InstallAdapter`. Task 4 supplies the real `exePath`; in this task `exePath` is `<dataDir>/rpcs3.exe` when it exists (verified beside `dev_hdd0` on the owner's machine).

- [ ] **Step 1: Write the failing tests.**

`rpcs3.test.ts`:

```ts
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildIso, buildSfo, memorySource } from './ps3/test-helpers'
import { createRpcs3InstallAdapter, type Rpcs3InstallDeps } from './rpcs3'

const ROOT = 'D:\\Emulators\\rpcs3'
const EXE = join(ROOT, 'rpcs3.exe')
const GAMES = join(ROOT, 'config', 'games.yml')
const SFO = buildSfo({ TITLE: "Demon's Souls", TITLE_ID: 'BLUS30443' })

function deps(over: Partial<Rpcs3InstallDeps> & { yml?: string | null } = {}): Rpcs3InstallDeps {
  const yml = over.yml === undefined ? 'BLUS30443: D:/Games/Demons Souls.iso\n' : over.yml
  return {
    dataDirs: () => [ROOT],
    exePath: () => Promise.resolve(EXE),
    files: {
      readText: (path) => Promise.resolve(path === GAMES ? yml : null),
      readBytes: () => Promise.resolve(null),
    },
    openSource: () => memorySource(buildIso(SFO)),
    ...over,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('createRpcs3InstallAdapter', () => {
  it('lists every game in games.yml with its real title and a program target', async () => {
    await expect(createRpcs3InstallAdapter(deps()).findInstalled()).resolves.toEqual([
      {
        platform: 'rpcs3',
        externalId: 'BLUS30443',
        title: "Demon's Souls",
        target: { kind: 'program', exe: EXE, args: ['--no-gui', 'D:/Games/Demons Souls.iso'] },
      },
    ])
  })

  it('lists nothing when the emulator program cannot be found', async () => {
    const adapter = createRpcs3InstallAdapter(deps({ exePath: () => Promise.resolve(null) }))

    await expect(adapter.findInstalled()).resolves.toEqual([])
  })

  it('lists nothing when there is no games.yml', async () => {
    await expect(createRpcs3InstallAdapter(deps({ yml: null })).findInstalled()).resolves.toEqual([])
  })

  it('lists nothing when no RPCS3 account is connected', async () => {
    await expect(createRpcs3InstallAdapter(deps({ dataDirs: () => [] })).findInstalled()).resolves.toEqual([])
  })

  it('skips a game whose title cannot be read and keeps the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const adapter = createRpcs3InstallAdapter(
      deps({
        yml: 'BLUS30443: D:/Games/good.iso\nBLES00001: D:/Games/bad.iso\n',
        openSource: (path) =>
          path.endsWith('bad.iso') ? memorySource(new Uint8Array(40_000)) : memorySource(buildIso(SFO)),
      }),
    )

    const result = await adapter.findInstalled()

    expect(result.map((game) => game.externalId)).toEqual(['BLUS30443'])
    expect(warn).toHaveBeenCalledOnce()
  })

  it('skips a game whose file is gone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const adapter = createRpcs3InstallAdapter(
      deps({ openSource: () => ({ read: () => Promise.reject(new Error('ENOENT')) }) }),
    )

    await expect(adapter.findInstalled()).resolves.toEqual([])
    expect(warn).toHaveBeenCalledOnce()
  })
})
```

Add to `start.test.ts`:

```ts
  it('refuses a program path that is not absolute', async () => {
    const d = deps()

    const result = await startTarget({ kind: 'program', exe: 'rpcs3.exe', args: [] }, d)

    expect(result.ok).toBe(false)
    expect(d.fileExists).not.toHaveBeenCalled()
    expect(d.spawnProgram).not.toHaveBeenCalled()
  })

  it('allows an upper case .EXE', async () => {
    const d = deps()

    await expect(
      startTarget({ kind: 'program', exe: 'D:\\Emu\\RPCS3.EXE', args: [] }, d),
    ).resolves.toEqual({ ok: true })
  })
```

(Existing tests that use absolute `D:\\...` paths stay as they are; any test using a relative exe must be updated to an absolute path.)

If `dataDirOf` is added to `local.ts`, add a table test in `local.test.ts`: `dataDirOf(accountExternalId({ dataDir: 'D:\\Emu\\rpcs3', userId: '00000001' }))` equals `'D:\\Emu\\rpcs3'`, and `dataDirOf('garbage')` is `null`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/launch src/main/providers/rpcs3`
Expected: FAIL.

- [ ] **Step 3: Implement.**

`src/main/launch/rpcs3.ts`:

```ts
import { join } from 'node:path'
import type { LocalFiles } from '../providers/local-files'
import type { InstallAdapter, InstalledGame } from './types'
import { parseGamesYml } from './ps3/games-yml'
import type { ByteSource } from './ps3/iso9660'
import { readPs3Title } from './ps3/title'

const MAX_GAMES_YML_BYTES = 1_000_000

export interface Rpcs3InstallDeps {
  readonly dataDirs: () => string[]
  readonly exePath: (dataDir: string) => Promise<string | null>
  readonly files: Pick<LocalFiles, 'readText' | 'readBytes'>
  readonly openSource: (path: string) => ByteSource
}

export function createRpcs3InstallAdapter(deps: Rpcs3InstallDeps): InstallAdapter {
  return {
    platform: 'rpcs3',
    async findInstalled() {
      const found = await Promise.all(deps.dataDirs().map((dir) => installedIn(deps, dir)))
      return found.flat()
    },
  }
}

async function installedIn(deps: Rpcs3InstallDeps, dataDir: string): Promise<InstalledGame[]> {
  const exe = await deps.exePath(dataDir)
  if (exe === null) return []
  const text = await deps.files.readText(join(dataDir, 'config', 'games.yml'), MAX_GAMES_YML_BYTES)
  if (text === null) return []

  const games = await Promise.all(
    parseGamesYml(text).map(async ({ serial, path }): Promise<InstalledGame | null> => {
      try {
        const sfo = await readPs3Title(path, deps)
        if (sfo === null) return null
        return {
          platform: 'rpcs3',
          externalId: serial,
          title: sfo.title,
          target: { kind: 'program', exe, args: ['--no-gui', path] },
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.warn(`Launch: skipped the RPCS3 game ${serial} (${reason})`)
        return null
      }
    }),
  )
  return games.filter((game) => game !== null)
}
```

`src/main/launch/start.ts`: add `import { isAbsolute } from 'node:path'` and change the program check to:

```ts
  if (!isAbsolute(exe) || !exe.toLowerCase().endsWith('.exe')) {
    return { ok: false, reason: 'That game cannot be started from here.' }
  }
```

`src/main/providers/rpcs3/local.ts`: read how `accountExternalId({ dataDir, userId })` encodes the account id; add the inverse `dataDirOf(externalId: string): string | null` next to it (returns the `dataDir` or `null` for a malformed id) with the table test above.

`src/main/index.ts`: add the adapter to the `LaunchService` adapters list:

```ts
      createRpcs3InstallAdapter({
        dataDirs: () =>
          listConnectedAccounts(db)
            .filter((account) => account.platform === 'rpcs3')
            .flatMap((account) => dataDirOf(account.externalId) ?? []),
        exePath: (dir) => findRpcs3Program(dir),
        files: LOCAL_FILES,
        openSource: fileByteSource,
      }),
```

with imports for `createRpcs3InstallAdapter`, `fileByteSource`, `dataDirOf`, `listConnectedAccounts` (already used by the scheduler setup; import from `./store/sync-store` if not in scope), and this temporary helper placed in `src/main/launch/rpcs3-program.ts`:

```ts
import { access } from 'node:fs/promises'
import { join } from 'node:path'

export async function findRpcs3Program(dataDir: string): Promise<string | null> {
  const candidate = join(dataDir, 'rpcs3.exe')
  try {
    await access(candidate)
    return candidate
  } catch {
    return null
  }
}
```

(with its own tiny test using a temp folder: present returns the path, absent returns `null`). Task 4 replaces `findRpcs3Program` with the version that prefers a saved setting.

- [ ] **Step 4: Run tests, typecheck, lint, then the whole suite**

Run: `npx vitest run src/main/launch src/main/providers/rpcs3 && npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main
git commit -m "Add the RPCS3 install adapter and require absolute program paths"
```

---

### Task 4: Emulator program setting, IPC and the card row

**Files:**
- Create: `src/main/launch/emulator-programs.ts` (service), `src/renderer/src/features/accounts/EmulatorProgramRow.tsx`
- Modify: `src/main/store/settings-store.ts` (`readEmulatorProgram`, `saveEmulatorProgram`), `src/shared/launch.ts` (types), `src/shared/ipc.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/src/test/fake-api.ts`, `src/main/index.ts`, `src/main/launch/rpcs3-program.ts` (becomes setting-aware), `src/renderer/src/features/accounts/Rpcs3Card.tsx`
- Test: `src/main/store/settings-store.test.ts`, `src/main/launch/emulator-programs.test.ts`, `src/main/ipc.test.ts`, `src/renderer/src/features/accounts/EmulatorProgramRow.test.tsx`, and the Rpcs3Card test if one exists

**Interfaces:**
- Produces:
  - `shared/launch.ts`: `EmulatorId = 'rpcs3'`, `EmulatorProgram { readonly emulator: EmulatorId; readonly path: string | null; readonly source: 'chosen' | 'found' | null }`
  - `window.api.getEmulatorPrograms(): Promise<EmulatorProgram[]>`, `chooseEmulatorProgram(emulator: EmulatorId): Promise<EmulatorProgram>` (opens the file dialog in main; cancelling returns the unchanged program); IPC channels `launch:get-emulator-programs`, `launch:choose-emulator-program`
  - `EmulatorPrograms` service: `constructor(deps: { read(emulator): string | null; save(emulator, path): void; dataDirs(emulator): string[]; fileExists(path): Promise<boolean>; chooseFile(): Promise<string | null>; onChanged(): void })`, `list(): Promise<EmulatorProgram[]>`, `choose(emulator): Promise<EmulatorProgram>`, `resolve(emulator, dataDir): Promise<string | null>` (a saved path that still exists wins, then `<dataDir>/rpcs3.exe` if it exists, else `null`)
  - Settings keys `emulator.rpcs3.exe` (JSON string)

- [ ] **Step 1: Write the failing tests.**

`emulator-programs.test.ts`:

```ts
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { EmulatorPrograms } from './emulator-programs'

const DIR = 'D:\\Emu\\rpcs3'
const BESIDE = join(DIR, 'rpcs3.exe')
const CHOSEN = 'E:\\Tools\\rpcs3\\rpcs3.exe'

function service(
  over: Partial<ConstructorParameters<typeof EmulatorPrograms>[0]> = {},
  existing: string[] = [BESIDE],
) {
  const saved = new Map<string, string>()
  const onChanged = vi.fn()
  const svc = new EmulatorPrograms({
    read: () => saved.get('rpcs3') ?? null,
    save: (emulator, path) => void saved.set(emulator, path),
    dataDirs: () => [DIR],
    fileExists: (path) => Promise.resolve(existing.includes(path)),
    chooseFile: () => Promise.resolve(CHOSEN),
    onChanged,
    ...over,
  })
  return { svc, saved, onChanged }
}

describe('EmulatorPrograms', () => {
  it('finds rpcs3.exe beside the data folder', async () => {
    await expect(service().svc.list()).resolves.toEqual([
      { emulator: 'rpcs3', path: BESIDE, source: 'found' },
    ])
  })

  it('reports nothing when it is not beside the data folder and none is chosen', async () => {
    await expect(service({}, []).svc.list()).resolves.toEqual([
      { emulator: 'rpcs3', path: null, source: null },
    ])
  })

  it('prefers a saved program that still exists', async () => {
    const { svc } = service({ read: () => CHOSEN }, [BESIDE, CHOSEN])

    await expect(svc.list()).resolves.toEqual([{ emulator: 'rpcs3', path: CHOSEN, source: 'chosen' }])
    await expect(svc.resolve('rpcs3', DIR)).resolves.toBe(CHOSEN)
  })

  it('falls back to the one beside the data folder when the saved program is gone', async () => {
    const { svc } = service({ read: () => CHOSEN }, [BESIDE])

    await expect(svc.resolve('rpcs3', DIR)).resolves.toBe(BESIDE)
  })

  it('saves a chosen exe, announces the change and returns it', async () => {
    const { svc, saved, onChanged } = service({}, [BESIDE, CHOSEN])

    await expect(svc.choose('rpcs3')).resolves.toEqual({ emulator: 'rpcs3', path: CHOSEN, source: 'chosen' })
    expect(saved.get('rpcs3')).toBe(CHOSEN)
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('keeps the current program when the dialog is cancelled', async () => {
    const { svc, saved, onChanged } = service({ chooseFile: () => Promise.resolve(null) })

    await expect(svc.choose('rpcs3')).resolves.toEqual({ emulator: 'rpcs3', path: BESIDE, source: 'found' })
    expect(saved.size).toBe(0)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it.each(['relative.exe', 'E:\\Tools\\notes.txt', 'E:\\Tools\\rpcs3.bat'])(
    'refuses to save %s',
    async (path) => {
      const { svc, saved } = service({ chooseFile: () => Promise.resolve(path) }, [BESIDE, path])

      await svc.choose('rpcs3')

      expect(saved.size).toBe(0)
    },
  )

  it('refuses to save an exe that does not exist', async () => {
    const { svc, saved } = service({}, [BESIDE])

    await svc.choose('rpcs3')

    expect(saved.size).toBe(0)
  })
})
```

`settings-store.test.ts`: add tests that `readEmulatorProgram(db, 'rpcs3')` returns `null` when unset, returns a saved path after `saveEmulatorProgram`, ignores a stored non-string value (returns `null`), and survives invalid JSON.

`ipc.test.ts`: add handlers `getEmulatorPrograms: vi.fn(() => Promise.resolve([{ emulator: 'rpcs3' as const, path: null, source: null }]))` and `chooseEmulatorProgram: vi.fn((emulator) => Promise.resolve({ emulator, path: null, source: null }))` to `fakes`, and tests: both refuse an untrusted sender; `chooseEmulatorProgram` called with `'rpcs3'` reaches the handler; with `'shadps4'`, `''`, `42` or `{}` it does not call the handler and resolves to the current list entry for rpcs3 via `handlers.getEmulatorPrograms()` (invalid input must not throw to the renderer: return `{ emulator: 'rpcs3', path: null, source: null }`).

`EmulatorProgramRow.test.tsx` (jsdom): renders the program path with "Found next to the data folder" when `source` is `'found'`, with "Chosen by you" when `'chosen'`, "Not found" plus the hint "Choose rpcs3.exe so games can be started from here." when `null`; **Choose…** calls `chooseEmulatorProgram('rpcs3')` and shows the returned path; a rejected call shows "Something went wrong. Try again."; the button is disabled while choosing; a rejected `getEmulatorPrograms` shows "Could not read the emulator program."

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/launch src/main/store src/main/ipc.test.ts src/renderer/src/features/accounts`
Expected: FAIL.

- [ ] **Step 3: Implement.**

`src/shared/launch.ts` additions:

```ts
export type EmulatorId = 'rpcs3'

export interface EmulatorProgram {
  readonly emulator: EmulatorId
  readonly path: string | null
  readonly source: 'chosen' | 'found' | null
}
```

`src/main/launch/emulator-programs.ts`:

```ts
import { isAbsolute, join } from 'node:path'
import type { EmulatorId, EmulatorProgram } from '@shared/launch'

const EXE_NAMES: Record<EmulatorId, string> = { rpcs3: 'rpcs3.exe' }

export interface EmulatorProgramsDeps {
  readonly read: (emulator: EmulatorId) => string | null
  readonly save: (emulator: EmulatorId, path: string) => void
  readonly dataDirs: (emulator: EmulatorId) => string[]
  readonly fileExists: (path: string) => Promise<boolean>
  readonly chooseFile: () => Promise<string | null>
  readonly onChanged: () => void
}

export class EmulatorPrograms {
  readonly #deps: EmulatorProgramsDeps

  constructor(deps: EmulatorProgramsDeps) {
    this.#deps = deps
  }

  async list(): Promise<EmulatorProgram[]> {
    return [await this.#describe('rpcs3')]
  }

  async resolve(emulator: EmulatorId, dataDir: string): Promise<string | null> {
    const saved = this.#deps.read(emulator)
    if (saved !== null && (await this.#deps.fileExists(saved))) return saved
    const beside = join(dataDir, EXE_NAMES[emulator])
    return (await this.#deps.fileExists(beside)) ? beside : null
  }

  async choose(emulator: EmulatorId): Promise<EmulatorProgram> {
    const chosen = await this.#deps.chooseFile()
    if (chosen !== null && isAbsolute(chosen) && chosen.toLowerCase().endsWith('.exe')) {
      if (await this.#deps.fileExists(chosen)) {
        this.#deps.save(emulator, chosen)
        this.#deps.onChanged()
      }
    }
    return this.#describe(emulator)
  }

  async #describe(emulator: EmulatorId): Promise<EmulatorProgram> {
    const saved = this.#deps.read(emulator)
    if (saved !== null && (await this.#deps.fileExists(saved))) {
      return { emulator, path: saved, source: 'chosen' }
    }
    for (const dir of this.#deps.dataDirs(emulator)) {
      const beside = join(dir, EXE_NAMES[emulator])
      if (await this.#deps.fileExists(beside)) return { emulator, path: beside, source: 'found' }
    }
    return { emulator, path: null, source: null }
  }
}
```

`settings-store.ts`: follow the existing `readLogLevel`/`saveLogLevel` pattern for `readEmulatorProgram(db, emulator: EmulatorId): string | null` and `saveEmulatorProgram(db, emulator, path)` using key `` `emulator.${emulator}.exe` ``, validating with `z.string().min(1)`.

`src/shared/ipc.ts`: channels `getEmulatorPrograms: 'launch:get-emulator-programs'`, `chooseEmulatorProgram: 'launch:choose-emulator-program'`; Api methods `getEmulatorPrograms(): Promise<EmulatorProgram[]>`, `chooseEmulatorProgram(emulator: EmulatorId): Promise<EmulatorProgram>`. `src/main/ipc.ts`: handlers `getEmulatorPrograms(): Promise<EmulatorProgram[]>`, `chooseEmulatorProgram(emulator: EmulatorId): Promise<EmulatorProgram>`; registrations check the sender; the choose registration validates `z.literal('rpcs3')`, and on a failed parse returns `handlers.getEmulatorPrograms().then((list) => list[0] ?? { emulator: 'rpcs3', path: null, source: null })`. Preload and fake-api entries follow the Task 1 pattern from the base plan (`fakeApi`: `getEmulatorPrograms: vi.fn().mockResolvedValue([{ emulator: 'rpcs3', path: null, source: null }])`, `chooseEmulatorProgram: vi.fn().mockResolvedValue({ emulator: 'rpcs3', path: null, source: null })`).

`src/main/index.ts`: create `const emulatorPrograms = new EmulatorPrograms({ read: (e) => readEmulatorProgram(db, e), save: (e, p) => saveEmulatorProgram(db, e, p), dataDirs: () => <the same rpcs3 dataDirs lookup used by the adapter>, fileExists: (p) => access(p).then(() => true, () => false), chooseFile: <dialog.showOpenDialog with filters [{ name: 'Program', extensions: ['exe'] }] and properties ['openFile'], using the same mainWindow-aware pattern as the existing folder chooser near line 213, returns the first path or null>, onChanged: () => void launcher.scan() })`; wire the two handlers; change the RPCS3 adapter's `exePath` to `(dir) => emulatorPrograms.resolve('rpcs3', dir)`; delete `src/main/launch/rpcs3-program.ts` and its test (replaced by the service).

`EmulatorProgramRow.tsx`: a small function component taking no props that calls `window.api.getEmulatorPrograms()` in an effect (cancel flag cleanup, rejection sets an error message), shows the first program for `'rpcs3'`, and a **Choose…** button calling `chooseEmulatorProgram('rpcs3')` with a busy flag and an error message; use existing design tokens and the `Button` component (`src/renderer/src/components/Button.tsx`). Render it from `Rpcs3Card.tsx` only when the card is connected (read `EmulatorCard.tsx` for how connected state is exposed; if the connected state is not available to the wrapper, render the row inside `EmulatorCard` through an optional `footer?: ReactNode` prop shown only when connected, and pass `<EmulatorProgramRow />` from `Rpcs3Card`; add a test for that prop).

- [ ] **Step 4: Run tests, typecheck, lint, full suite**

Run: `npx vitest run src/main src/renderer && npm run typecheck && npm run lint && npm run format:check && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Let the user choose the RPCS3 program and find it beside the data folder"
```

---

### Task 5: Docs

**Files:**
- Modify: `docs/adr/0017-launching-installed-games.md`, `docs/superpowers/specs/2026-10-05-launch-games-design.md` (Deviations), `docs/SPEC.md` (IPC rows), `docs/PROJECT-MAP.md`, `docs/ARCHITECTURE.md` if it lists the launch module's parts, `docs/PROVIDERS.md` (RPCS3 section), `docs/ROADMAP.md`, `CLAUDE.md` (test count)

**Interfaces:** none (documentation).

- [ ] **Step 1: Read what was built** (`git log --oneline main..HEAD`, the new files under `src/main/launch/ps3/`, `rpcs3.ts`, `emulator-programs.ts`, the RPCS3 `listGames` change) and document that, not the plan.
- [ ] **Step 2: Update** (hand edits with the Edit tool, never a formatter):
  - **PROVIDERS.md (RPCS3):** verified 5 October 2026 on the owner's install: `rpcs3.exe` beside `dev_hdd0`; `config/games.yml` format; ISO 9660 with `PS3_GAME/PARAM.SFO` giving `TITLE` and `TITLE_ID`; the trophy folder's `ICON0.PNG`; `rpcs3.exe --help` options. State that launching with `--no-gui <path>` is **not yet verified by hand** and that the owner must add the date and result.
  - **ADR-0017:** add the RPCS3 section (title read from PARAM.SFO because nothing local links the trophy set to the serial, program found beside the data folder or chosen, `file://` cover art), the shadPS4 deferral and why (nothing installed to verify against; `shadPS4.exe -g <game path or ID>` seen in `--help`), and that `file://` covers include the local path (also present in data exports).
  - **Spec Deviations:** the four points under "Deviations from the spec" in this plan; the Emulator program row is built for RPCS3 only.
  - **SPEC.md IPC table:** `launch:get-emulator-programs`, `launch:choose-emulator-program`.
  - **PROJECT-MAP.md:** every new file, plus where to work to add another emulator.
  - **ROADMAP.md:** tick "RPCS3 launch" built (hand verification pending) under "After v1: launch installed games"; leave shadPS4 launching, Ubisoft, Epic, EA and Xbox open; note RPCS3 cover art done.
  - **CLAUDE.md:** update the test count to the current `npm test` total.
- [ ] **Step 3: Verify** `npm run format:check` (does not touch `.md`), `npm run lint`, `npm run typecheck`, `npm test`.
- [ ] **Step 4: Commit**

```bash
git add docs CLAUDE.md
git commit -m "Document RPCS3 launching and cover art"
```

---

## Self-review

- **Spec coverage:** spec section 3 (emulator programs found beside the data folder, asked when missing, validated `.exe`, Browse in the emulator's card) is Task 4; RPCS3 adapter and `games.yml` (section 1) is Tasks 2 and 3; cover art is Task 1 (new, from the owner's report); the deferred absolute-path item is in Task 3. shadPS4 is explicitly deferred with the reason.
- **Placeholders:** none; places that depend on existing helper names (Task 1 tests, `dataDirOf`, the file dialog pattern, `EmulatorCard` footer) say exactly what to find and what to produce.
- **Types:** `ByteSource`, `ParamSfo`, `GameEntry`, `TitleDeps`, `Rpcs3InstallDeps`, `EmulatorId`, `EmulatorProgram`, `EmulatorPrograms` are consistent across tasks. The `rpcs3-program.ts` helper is introduced in Task 3 and removed in Task 4.
