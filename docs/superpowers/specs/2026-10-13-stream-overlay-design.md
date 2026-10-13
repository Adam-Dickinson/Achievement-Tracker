# Stream overlay design

- **Date:** 2026-10-13
- **Status:** Approved by owner (choices below were picked in conversation)
- **ADR:** [ADR-0018](../../adr/0018-stream-overlay.md)

## Goal

Show unlock toasts on stream. The desktop toast window is not captured by OBS's Game Capture, so streamers never see their unlocks on stream. Trophy Locker should serve the same toasts as a page OBS can load as a Browser Source.

## Owner decisions

| Question | Choice |
|---|---|
| Look | The app's own toast (same `Toast` component, same rarity and platinum styling) |
| Pausing desktop pop-ups | Does not pause the stream overlay; it has its own on/off switch |
| Sound | The chime plays on stream too, with its own on/off and volume |
| Position | Set in OBS; the page is a column of toasts in its top-left corner, no corner setting |

## How it works

```
Scheduler.onUnlocks ──┬─> NotificationService (desktop) ─> OverlayService ─> overlay window (IPC)
                      └─> NotificationService (stream)  ─> StreamOverlayServer ─> OBS page (Server-Sent Events)
```

- **A second `NotificationService`** feeds the stream. It shares the desktop filters (minimum rarity, enabled platforms, duration) but ignores the pause toggle, and only receives unlocks while the stream overlay is on. Reusing the class keeps queueing, burst grouping and platinum handling identical.
- **`StreamOverlayServer`** (`src/main/stream-overlay.ts`) is a `node:http` server bound to `127.0.0.1` only:
  - `GET /` serves `stream.html`; in dev it redirects to the Vite dev server's `stream.html` with an `events` query pointing back at this server.
  - `GET /events` is a Server-Sent Events stream: the current frame on connect, then every frame the stream `NotificationService` publishes, plus a keep-alive comment every 15 s.
  - Other `GET`s serve built renderer assets from `out/renderer`, refusing any path that escapes that folder.
  - Requests whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>` get 403 (blocks DNS rebinding). Only `GET` is allowed.
  - Starting on a busy port reports an error status instead of throwing.
- **The page** is a new renderer entry, `stream.html` → `src/renderer/src/stream/main.tsx`. It renders the existing `OverlayApp`, which now takes an optional `subscribe` prop (default `window.api.onToasts`). The stream entry passes a subscriber built on `EventSource`. Frames are checked with `parseOverlayFrame` (zod) in `src/shared/stream-overlay.ts`, and malformed ones are ignored. Frames always use corner `top-left` and scale `1`; OBS does position and size.

## Settings

`NotificationSettings` gains:

```ts
stream: {
  enabled: boolean            // default false
  port: number                // default 47821, 1024–65535
  sound: { enabled: boolean; volume: number }  // default on, 0.6
}
```

Stored settings without `stream` (every existing install) read back with the defaults. A patch can change any part of `stream`. Changing `enabled` or `port` starts, stops or restarts the server.

## IPC

- `stream:get-status` → `StreamOverlayStatus` (`{ state: 'off' | 'running' | 'error', url: string | null, message: string | null }`)
- `stream:status-changed` push to the main window
- `stream:send-test` shows a sample toast on the stream overlay only
- The existing `notifications:update-settings` payload check accepts the `stream` patch.

All handlers check the sender like the rest of `main/ipc.ts`.

## UI

Settings → Notifications gets a **Stream overlay (OBS)** section (`StreamOverlaySection.tsx`): an on/off switch, the Browser Source URL with a Copy button, status ("Running", or the error such as the port being in use), a port field, chime on/off and volume, and a "Send test to stream" button. A short line explains how to add the URL in OBS.

## Testing

- `stream-overlay.test.ts`: serves `stream.html` and assets, refuses path escapes and foreign `Host` headers, 405 for non-GET, SSE sends the current frame then published frames, stop closes clients, a busy port gives an error status, dev mode redirects.
- `settings-store.test.ts`: `stream` defaults, old settings without `stream`, patch merging, invalid values fall back.
- `stream-overlay` shared parser tests: valid frame, malformed JSON, wrong shapes.
- `OverlayApp.test.tsx`: uses the `subscribe` prop.
- `StreamOverlaySection.test.tsx`: switch, URL and copy, status text, error text, sound controls, test button.
- `ipc.test.ts`: new handlers check the sender; the settings patch with `stream` passes validation.

## Out of scope

- Any new look for stream toasts (theming can come later).
- Remote access from another PC (localhost only by design).
- Showing achievement icons (toasts have none today).
