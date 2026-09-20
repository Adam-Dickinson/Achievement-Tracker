# UI Mockups

Initial designs for every core screen, generated with [Superdesign](https://superdesign.dev) from the brief in [../DESIGN.md](../DESIGN.md) and a local design-system file (`.superdesign/`, git-ignored). The resulting tokens are in `src/AchievementTracker.App/Themes/Tokens.axaml`.

**Live canvas** (comment/iterate): https://superdesign.dev/teams/7cc1c153-6043-4e66-95ae-8dc30811ca1d/projects/4bd4cb42-4e16-4fb7-8ef0-f9cf56409448

Static HTML snapshots live in [`mockups/`](mockups/); open them directly in a browser. Sizes are 1440x900.

| Screen | Snapshot | Superdesign draft id | Build under `src/AchievementTracker.App/` |
|---|---|---|---|
| Dashboard | [dashboard.html](mockups/dashboard.html) | `8204918a-4869-4cec-ba73-bfe098a3887f` | `Views/Dashboard` |
| Library | [library.html](mockups/library.html) | `aacf7ec7-8501-4806-9cc6-f648f81879ca` | `Views/Library` |
| Game detail | [game-detail.html](mockups/game-detail.html) | `5b6a84ea-0715-41dd-a09c-2db27bc83791` | `Views/GameDetail` |
| Unlock toast (overlay) | [unlock-toast.html](mockups/unlock-toast.html) | `4d4e0785-71b2-4354-9da8-d98c9f6f2ecd` | `Views/ToastView` (built) |
| Accounts | [accounts.html](mockups/accounts.html) | `f60bd2ff-5180-436e-97a4-61e92c890a8e` | `Views/Accounts` |
| Notification settings | [notification-settings.html](mockups/notification-settings.html) | `c9f50582-a106-431f-8aba-e265a2b2985a` | `Views/Settings` |
| Onboarding | [onboarding.html](mockups/onboarding.html) | `3b7abd38-f288-40e1-8a11-0b651ab8e5ba` | `Views/Onboarding` |

Not yet designed: Activity timeline, and the tray menu.

## Notes for implementation

- The mockups are **reference designs, not production code**: static HTML with placeholder data. Rebuild them as Avalonia views (XAML + view-models) using the tokens in `src/AchievementTracker.App/Themes/Tokens.axaml` (which mirror the design system). The unlock toast is already built: `Views/ToastView.axaml`.
- Rarity must always be shown with a text label, never color alone (DESIGN.md §10).
- Platform colors appear only inside badges.
- Iterating on a design: use the Superdesign canvas, or the `superdesign` skill (`iterate-design-draft` on the draft id above), then re-export with `get-design --draft-id <id> --output docs/design/mockups/<name>.html`.
