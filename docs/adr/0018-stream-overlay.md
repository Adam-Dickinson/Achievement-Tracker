# ADR-0018: Stream overlay for OBS

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

The owner streams on Twitch and YouTube and wants unlocks to appear on stream. The desktop toast window is a separate always-on-top window, so OBS's Game Capture never sees it, and Display Capture would put the whole desktop on stream. Streamers also tend to pause desktop pop-ups while live so they don't see everything twice. The design and the owner's choices are in `docs/superpowers/specs/2026-10-13-stream-overlay-design.md`.

## Options considered

| Option | Result |
|---|---|
| OBS Window Capture of the toast window | No code, but Electron's transparent window often captures as a black box or flickers, and the window only exists while a toast shows |
| A separate tool reading the SQLite file | No app change, but it couples to the schema, polls instead of being told, and breaks rule 8 in spirit (SQL outside `main/store`) |
| Write unlocks to a file for OBS text sources | Plain text only, no rarity styling or animation |
| **A localhost page served by the app, fed by the same notification logic** | One Browser Source URL, the real toast design, live updates, nothing outside the app touches its data |

## Decision

- **The app serves the overlay itself.** `StreamOverlayServer` (`src/main/stream-overlay.ts`) is a `node:http` server bound to `127.0.0.1` only, on a settable port (default `47821`, `1024`–`65535`). It serves a new renderer entry, `stream.html`, and its built assets, and pushes frames over Server-Sent Events at `/events`. In dev it redirects to the Vite dev server's `stream.html`, passing its own events address.
- **Same toasts, separate queue.** A second `NotificationService` feeds the stream. It shares the desktop filters (minimum rarity, platforms, duration) so both show the same unlocks, but ignores the tray's pause, because pausing desktop pop-ups is what streamers do to avoid doubles. It only receives unlocks while the stream overlay is on. Reusing the class keeps queueing, bursts and platinums identical.
- **Same component.** The page renders the existing `OverlayApp`, which gained an optional `subscribe` prop (default `window.api.onToasts`). The stream page passes an `EventSource` subscriber; frames are checked with zod (`parseOverlayFrame`) and malformed ones are ignored. Frames always use corner `top-left` and scale `1`, because OBS does the positioning and sizing.
- **Own chime settings.** The stream has its own sound on/off and volume, so the stream can hear a chime while the desktop stays quiet, or the other way round. The chime plays in the browser source, where OBS can capture it.
- **Off by default.** Nothing listens until the user turns it on in Settings → Notifications → Stream overlay. A busy port gives an error status shown in Settings, never a crash.
- **Locked to this machine.** Besides binding to `127.0.0.1`, the server answers only `GET`, refuses any `Host` other than `127.0.0.1:<port>` or `localhost:<port>` (blocks DNS rebinding from a web page), serves only `stream.html` and files under `assets/` (no path can escape the renderer folder), and sends CORS headers only in dev, for the dev server's origin. Frames carry what a toast shows (titles, game names, rarity), never IDs, tokens or paths.

## Consequences

**Positive:**

- One URL in OBS shows exactly the toasts the app would show, for every platform and emulator, with the real design.
- No schema change, no new dependency (`node:http` is built in, zod was already used).
- The desktop overlay's code path is unchanged apart from `OverlayApp` taking an optional prop.

**Negative:**

- The app now listens on a local port while the feature is on, so another program could take that port first; the user then picks another in Settings.
- zod is now in one renderer bundle (the stream page's only, about 170 kB); the main window and the desktop overlay don't load it.
- The stream page is a third renderer entry to keep building and testing.
