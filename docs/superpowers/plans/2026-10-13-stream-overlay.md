# Stream overlay implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve unlock toasts as a localhost page OBS loads as a Browser Source.

**Architecture:** A second `NotificationService` (ignores pause) publishes frames to `StreamOverlayServer`, a `node:http` server on `127.0.0.1` that serves a new `stream.html` renderer entry and streams frames over Server-Sent Events. The page reuses `OverlayApp`/`Toast` through a new `subscribe` prop.

**Tech Stack:** Electron main (`node:http`), React renderer, zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-stream-overlay-design.md`

## Global Constraints

- Server binds `127.0.0.1` only; `Host` must be `127.0.0.1:<port>` or `localhost:<port>`; `GET` only.
- Default port `47821`, valid `1024`–`65535`. Stream overlay off by default.
- Stored notification settings without `stream` must read back with defaults (existing installs).
- No code comments (CLAUDE.md). Strict TS, no `any`. Tests beside code.
- Renderer imports only `shared`. New IPC goes `shared/ipc.ts` → `main/ipc.ts` (sender check) → `preload`.
- Done = `npm run format:check`, `lint`, `typecheck`, `test` pass; docs updated; ADR-0018 written.

---

### Task 1: Shared types and frame parser

**Files:** Modify `src/shared/ipc.ts`; Create `src/shared/stream-overlay.ts`, `src/shared/stream-overlay.test.ts`

- [ ] Add `StreamOverlaySettings`, `stream` on `NotificationSettings`/`NotificationSettingsPatch`/defaults, `StreamOverlayStatus`, IPC names `getStreamOverlayStatus`, `streamOverlayStatusChanged`, `sendTestStreamToast`, and `Api` methods.
- [ ] `parseOverlayFrame(text): OverlayFrame | null` with zod; `STREAM_PORT_MIN/MAX`, `DEFAULT_STREAM_PORT`.
- [ ] Tests: valid frame, bad JSON, wrong shape.

### Task 2: Settings store

**Files:** Modify `src/main/store/settings-store.ts`, `settings-store.test.ts`

- [ ] Schema accepts optional `stream`; read fills defaults; update deep-merges `stream` and `stream.sound`.
- [ ] Tests: defaults, legacy row without `stream`, patch merge, invalid falls back.

### Task 3: StreamOverlayServer

**Files:** Create `src/main/stream-overlay.ts`, `src/main/stream-overlay.test.ts`

- [ ] `configure({enabled, port})` starts/stops/restarts; `publish(toasts)`; `status`; `stop()`; status listener.
- [ ] Routes, Host check, path guard, SSE with keep-alive, dev redirect.
- [ ] Tests with a temp renderer dir and real HTTP on port 0.

### Task 4: Wiring and IPC

**Files:** Modify `src/main/index.ts`, `src/main/ipc.ts`, `src/main/ipc.test.ts`, `src/preload/index.ts`, `src/renderer/src/test/fake-api.ts`

- [ ] Second `NotificationService`; `onUnlocks` also notifies it when enabled; settings apply to both; quit stops server.
- [ ] IPC handlers with sender checks; patch schema accepts `stream`; preload methods; fake API.
- [ ] Tests: new channels reject untrusted senders; `stream` patch passes validation; invalid port rejected.

### Task 5: Stream page

**Files:** Create `src/renderer/stream.html`, `src/renderer/src/stream/main.tsx`, `src/renderer/src/stream/subscribe.ts`, `subscribe.test.ts`; Modify `OverlayApp.tsx`, `OverlayApp.test.tsx`, `electron.vite.config.ts`

- [ ] `OverlayApp` `subscribe` prop; stream entry with `EventSource` subscriber; build input.
- [ ] Tests: `OverlayApp` uses the prop; subscriber parses frames, ignores bad ones, closes on cleanup.

### Task 6: Settings UI

**Files:** Create `src/renderer/src/features/settings/StreamOverlaySection.tsx`, `.test.tsx`; Modify `NotificationsCard.tsx`

- [ ] Switch, URL + Copy, status/error, port, chime + volume, test button.
- [ ] Tests for each control and status text.

### Task 7: Docs and checks

**Files:** Create `docs/adr/0018-stream-overlay.md`; Modify `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT-MAP.md`, `docs/ROADMAP.md`, `README.md`, `CLAUDE.md` status

- [ ] Write ADR and doc updates.
- [ ] Run `npm run format:check`, `lint`, `typecheck`, `test`, `build`; run the built app and load the page in a browser.
