# UI Mockups

Initial designs for every core screen, generated with [Superdesign](https://superdesign.dev) from the brief in [../DESIGN.md](../DESIGN.md) and a local design-system file (`.superdesign/`, git-ignored). The resulting tokens are in `src/renderer/src/styles/index.css`.

**Live canvas** (comment/iterate): https://superdesign.dev/teams/7cc1c153-6043-4e66-95ae-8dc30811ca1d/projects/4bd4cb42-4e16-4fb7-8ef0-f9cf56409448

> On 2026-09-21 the designs were reworked into the "Afterglow" direction (floating cards, colour-in game art, lime accent; see [DESIGN.md](../DESIGN.md) §7). The live canvas above is the source of truth. The HTML snapshots below were re-exported from it on 2026-09-27, when Activity was added and every screen took the Trophy Locker name.

Static HTML snapshots live in [`mockups/`](mockups/); open them directly in a browser. Sizes are 1440x900.

| Screen | Snapshot | Superdesign draft id | Build under `src/renderer/src/` |
|---|---|---|---|
| Dashboard | [dashboard.html](mockups/dashboard.html) | `8204918a-4869-4cec-ba73-bfe098a3887f` | `features/dashboard` (built to the design) |
| Library | [library.html](mockups/library.html) | `aacf7ec7-8501-4806-9cc6-f648f81879ca` | `features/library` (built: virtualized grid with colour-in covers, search, platform and progress filters, sorts; the portrait/list views still to do) |
| Game detail | [game-detail.html](mockups/game-detail.html) | `5b6a84ea-0715-41dd-a09c-2db27bc83791` | `features/game-detail` (built: header, four tiles, per-platform tabs, filters, search, sort choice, virtualized achievements; "Open in Steam" still to do) |
| Unlock toast (overlay) | [unlock-toast.html](mockups/unlock-toast.html) | `4d4e0785-71b2-4354-9da8-d98c9f6f2ecd` | `overlay/Toast.tsx` (built in the Afterglow look, stacking up to 3; platform badge still to do) |
| Accounts | [accounts.html](mockups/accounts.html) | `f60bd2ff-5180-436e-97a4-61e92c890a8e` | `features/accounts` |
| Notification settings | [notification-settings.html](mockups/notification-settings.html) | `c9f50582-a106-431f-8aba-e265a2b2985a` | `features/settings` |
| Onboarding | [onboarding.html](mockups/onboarding.html) | `3b7abd38-f288-40e1-8a11-0b651ab8e5ba` | `features/onboarding` |
| Activity | [activity.html](mockups/activity.html) | `eb386cc4-faad-4445-a923-854824785ea1` | `features/activity` (built before the design: day sections of unlock rows and Show more; the header card with this week's count, streak and rarest, and the rarity legend, still to build) |

Not designed: the tray menu, which is a native Electron menu. Activity was designed after it was built, keeping its day sections and rows and adding a header card.

## Notes for implementation

- The mockups are **reference designs, not production code**: static HTML with placeholder data. Rebuild them as React components using the tokens in `src/renderer/src/styles/index.css`. The unlock toast is already built: `src/renderer/src/overlay/Toast.tsx`.
- Rarity must always be shown with a text label, never color alone (DESIGN.md §10).
- Platform colors appear only inside badges.
- Iterating on a design: use the Superdesign canvas, or the `superdesign` skill (`iterate-design-draft` on the draft id above), then re-export with `get-design --draft-id <id> --output docs/design/mockups/<name>.html`.
