---
name: add-provider
description: Use when adding a new online achievement platform (API-based, e.g. Steam, Xbox, PSN, Epic, Ubisoft, EA, RetroAchievements) to Achievement Tracker. Walks through research, trait implementation, fixtures, registration, and UI.
---

# Add an online provider

Follow in order. Don't skip step 1: the endpoints in `docs/PROVIDERS.md` are unverified.

## 1. Research spike (write findings down)
- Capture **real** requests/responses for: auth, list games, per-game achievements (schema + unlock state), rarity if available.
- Sanitize and save to `tests/fixtures/<platform>/`. Raw captures go in `tests/fixtures/_raw/` (gitignored).
- Update `docs/PROVIDERS.md` for the platform: what's verified, auth flow, rate limits, ToS/unofficial status, expiry behavior.
- If there's no viable, non-password-based path, stop and record an "unsupported" verdict instead of building it.

## 2. Add the `Platform` variant
- `crates/core/src/platform.rs`: add variant + display name + `is_unofficial()`.

## 3. Implement the provider
- Create `crates/providers/src/<platform>/{mod.rs, auth.rs, api.rs}`.
- Implement `AchievementProvider` (see `docs/SPEC.md` §4). Return normalized `Remote*` DTOs only.
- Map failures to typed `ProviderError` (`AuthExpired`, `RateLimited{retry_after}`, `Network`, `Parse`, `Unsupported`).
- Declare honest `Capabilities` (`polling`, `local_watch`, `global_rarity`, `oauth`, `unofficial`).
- Store tokens via `SecretStore`, keyed by account id. Never passwords. Never log tokens.
- Register in `crates/providers/src/lib.rs`.

## 4. Test
- Parser/mapper tests from fixtures (no network).
- `wiremock` tests for auth refresh, 401 → `AuthExpired`, 429 → `RateLimited`.
- Run `cargo test -p providers` and clippy.

## 5. Connect UI + IPC
- Add connect flow under `src/features/accounts/<platform>/` (OAuth sandbox webview, token paste, or key entry).
- If unofficial: require the "I understand this is unofficial" opt-in before connecting.
- Extend `begin_connect` / `complete_connect` handlers in `src-tauri/src/commands/accounts.rs`. Regenerate bindings.

## 6. Finish
- Verify baseline behavior: first sync produces **no** notifications; a later new unlock produces exactly one.
- Update README support table and ROADMAP checkboxes.
