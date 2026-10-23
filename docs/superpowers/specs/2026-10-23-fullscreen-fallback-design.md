# Full-screen fallback and quiet hours design

- **Date:** 2026-10-23
- **Status:** Approved by owner (the design below was approved in conversation)
- **ADR:** [ADR-0019](../../adr/0019-fullscreen-detection.md)

## Goal

An unlock toast is an always-on-top window. Windows draws a game in true exclusive full-screen above every other window, so the toast is never seen. When that happens, show a Windows notification instead. Also add a daily quiet-hours schedule (SPEC F-25).

The owner has not yet seen a toast go missing; the design was built before that was checked, so it is cautious: only the state Windows reports for exclusive full-screen Direct3D switches to the fallback, and borderless or "optimised" full-screen games keep the real toast.

## Owner decisions

| Question | Choice |
|---|---|
| When to check | Only when a toast is about to show; no polling |
| How to check | Windows' own `SHQueryUserNotificationState`, called through koffi; never the game process (rule 4) |
| Which state falls back | Exclusive full-screen Direct3D only |
| Fallback | A Windows notification, on by default, with a switch in Settings |
| Quiet hours | A daily window, off by default, may cross midnight |
| Manual Do Not Disturb | The existing pause (tray, nav bell), also shown in Settings |
| Stream overlay | Unchanged: ignores the pause and quiet hours (ADR-0018) |
| Settings UI | Written by the owner; Claude builds the backend, IPC and tests |

## How it works

```
Scheduler.onUnlocks -> NotificationService (desktop)
                         paused or quiet hours?        -> drop (still in Activity)
                         filters, bursts, platinums     -> toasts
                         delivery()                      -> 'overlay': queue -> OverlayService
                                                         -> 'native':  showNative(toast) per toast
```

- **`main/fullscreen.ts`**: `readNotificationState()` loads `shell32.dll` through koffi once and calls `SHQueryUserNotificationState`. The result is mapped to a `NotificationState`:

  | Windows value | Name | State |
  |---|---|---|
  | 1 | `QUNS_NOT_PRESENT` (locked, screen saver) | `not-present` |
  | 2 | `QUNS_BUSY` (a full-screen app) | `busy` |
  | 3 | `QUNS_RUNNING_D3D_FULL_SCREEN` | `exclusive-fullscreen` |
  | 4 | `QUNS_PRESENTATION_MODE` | `presentation` |
  | 5 | `QUNS_ACCEPTS_NOTIFICATIONS` | `normal` |
  | 6 | `QUNS_QUIET_TIME` (first hour after a Windows install) | `quiet-time` |
  | 7 | `QUNS_APP` (a Store app full-screen) | `app` |
  | anything else, a failed call, koffi missing | | `unknown` |

  A failure to load is logged once and every later call answers `unknown`, so the app behaves as before.
- **`chooseDelivery(state, fallback)`** (pure): `native` only for `exclusive-fullscreen` with the fallback on; otherwise `overlay`.
- **`NotificationService`** gains optional `delivery` and `showNative` dependencies (the stream service passes neither, so it is unchanged) and a `quietHours` setter. `notify()` drops events while paused or inside quiet hours, as it drops them while paused today. It then builds the same toasts as before (filters, bursts of more than 5, platinums last) and either queues them for the overlay or hands each to `showNative`. `show()` (test toasts) ignores pause and quiet hours as before but follows the delivery choice, so a test toast sent from the tray during a game shows the fallback.
- **`main/native-toast.ts`**: `nativeToastText(toast)` gives the Windows notification's title (the toast heading: "Achievement unlocked", "Platinum unlocked", "7 achievements unlocked") and body (the achievement name, and a second line with the game, the rarity label and the percent). `showNativeToast` shows it with Electron's `Notification`, `silent` when the chime is off, keeps a reference until it closes (so it is not garbage collected), and opens the main window when clicked. Nothing shows when notifications are not supported.
- **`shared/quiet-hours.ts`**: `QuietHours { enabled, start, end }` in minutes after midnight, `isQuietTime(quietHours, date)` (local time; `start > end` crosses midnight; `start === end` is never quiet, so a mistake cannot silence the whole day), and `timeToMinutes` / `minutesToTime` for the UI's `HH:MM` inputs.

## Settings

`NotificationSettings` gains:

```jsonc
"fullscreenFallback": true,
"quietHours": { "enabled": false, "start": 1320, "end": 420 }  // 22:00 to 07:00
```

Saved in the same `notifications.settings` row, read with defaults when missing (no migration), patched through `updateNotificationSettings` and validated in `main/ipc.ts`. The manual Do Not Disturb switch uses the existing `getNotificationsPaused` / `setNotificationsPaused` calls.

## Packaging

koffi 3.3.2 (MIT) is a production dependency. Its Windows binary comes from the optional `@koromix/koffi-win32-x64` package (1.1 MB). The main bundle keeps koffi external, and electron-builder must unpack the `.node` file from the asar archive; the packaged build is checked to load it.

## Errors

- koffi or `shell32.dll` cannot load, or the call fails: `unknown`, overlay as before, one warning in the log.
- Notifications not supported: the fallback shows nothing; the unlock is still in Activity.

## Testing

- The state mapping for every Windows value and for a failed call or load (the call is injected, so tests run on Linux CI).
- `chooseDelivery` for every state and both switch positions.
- `isQuietTime` inside, outside, at the edges, across midnight, `start === end`, disabled; the time conversions.
- `NotificationService`: quiet hours drop unlocks but not test toasts; native delivery sends one native toast per toast (bursts, platinums) and nothing to the overlay; the stream-style service without the dependencies is unchanged.
- `nativeToastText` for a single unlock, a burst, a platinum, no percent.
- Settings: defaults, saving, old rows without the new fields, invalid values, IPC patch validation.

## Not included

- A real check with a game. The owner checks it by hand: start a game in exclusive full-screen and use the tray's "Send test notification" with a delay, or wait for a real unlock.
- Detecting borderless full-screen as a reason to fall back.
- Per-day schedules.
