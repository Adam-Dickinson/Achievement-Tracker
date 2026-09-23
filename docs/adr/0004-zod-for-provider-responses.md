# ADR-0004: zod schemas for provider responses

- **Status:** Accepted
- **Date:** 2026-09-23

## Context

Providers turn platform replies (JSON today; Xbox and PlayStation replies are much larger than Steam's) into normalized `Remote*` objects. That data is untrusted: SPEC §9 and CLAUDE.md rule 6 say parsers must be defensive and throw `ProviderError('parse', ...)` on malformed input rather than crash or guess.

The first parser, Steam's `parseGlobalPercentages`, was written with hand-written checks (`isRecord`, `typeof`, `Array.isArray`) on `unknown`. It worked, but it showed two problems:

- **Typos in key names are silent.** After a check, the value is a `Record<string, unknown>`, so TypeScript accepts any key. `achievementPercentages` (Steam sends `achievementpercentages`) compiled cleanly and made every real response look like "no data". Only the fixture test caught it.
- **Interfaces alone don't help at runtime.** A TypeScript `interface` describing Steam's reply documents the shape, but it is erased at build time. Casting `JSON.parse` output to it (`as SteamRarityResponse`) checks nothing. Pairing interfaces with hand-written checks means describing every shape twice, and the two copies can drift.

With 8+ platforms and several endpoints each, this code will grow large, and the owner is learning TypeScript as they go.

## Options considered

| Option | Runtime check | TypeScript type | Notes |
|---|---|---|---|
| Hand-written checks only (status quo) | Yes | No model of the reply | No dependency. Verbose, and key typos are silent |
| Interfaces + hand-written checks | Yes | Yes, written separately | No dependency. Every shape described twice; the copies can drift |
| **zod** | Yes | Yes, derived from the schema (`z.infer`) | One description per shape. The most widely used option, with the best docs and examples for a learner. About 450 KB minified (measured), main process only |
| valibot | Yes | Yes, derived | Smaller bundle (tree-shaken), but bundle size doesn't matter in the main process, and it has a smaller community |
| JSON Schema + ajv | Yes | Needs a separate type generator | Built for interoperable JSON Schema documents, which we don't need. Clumsier to write by hand |

## Decision

**Use zod (v4) to describe and check every external reply a provider parses.** For each reply, a schema describes what we rely on. `schema.safeParse(json)` checks it, and a failure is thrown as `ProviderError('parse', ...)` with the zod issue as the `cause`. The TypeScript type comes from the schema with `z.infer`, so the model and the check are the same thing.

Conventions:

- **Schemas live beside the provider that uses them** (at the top of `src/main/providers/steam/parse.ts`, moving to a `schemas.ts` beside it if the file gets long), in the main process only. The renderer and `shared` don't import zod.
- **Describe only the fields we use.** zod drops unknown keys by default, so new fields a platform adds later don't break parsing.
- **Watch `z.coerce.number()`: it turns `''` and `'  '` into `0`.** Numbers that arrive as strings (Steam's rarity `"94.9"`) must be required to be non-empty after trimming before they are converted.
- **Mapping stays separate from checking.** A schema checks the platform's reply; plain functions then map the checked data to `Remote*` objects (building URLs, turning Unix seconds into `Date`, `0` into `null`).
- **Fixture tests stay the proof.** A schema can still contain a typo; tests against sanitized real replies in `tests/fixtures/` catch it.

## Consequences

**Positive:**

- Each reply's shape is written once and reads like the fixture it came from.
- Code that uses the checked data is fully typed, so a mistyped field name there is a compile error.
- Error messages name the path and the expected type (for example `expected string, received number → at achievementpercentages.achievements[0].name`) without echoing the value, so they don't copy response data into logs.

**Negative / to accept:**

- One more runtime dependency, which has to be kept up to date. About 450 KB minified, in the main process only: negligible next to Electron (~100 MB).
- zod is a new API to learn on top of TypeScript. The cost is small next to writing and maintaining hand-written checks for every platform.
- The `z.coerce` trap above has to be remembered wherever numbers arrive as strings.

**To do:** Steam's parsers use zod from the start. `parseGlobalPercentages` is rewritten with a schema, and its 20 tests must pass unchanged. Binary local files (RPCS3 trophies, Steam's appcache) are not JSON: their byte-level parsers stay hand-written, but they may still use a schema to check the decoded result.

## Revisit if

- zod makes a breaking major release that is costly to adopt: valibot is the nearest substitute, and schemas are confined to the main process (`src/main/providers` and `src/main/ipc.ts`).
- ~~We start validating IPC payloads from the renderer.~~ Done 2026-09-23: `main/ipc.ts` checks UI payloads with zod too, the same way.
