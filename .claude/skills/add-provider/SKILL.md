---
name: add-provider
description: Use when adding a new online achievement platform (API-based, e.g. Steam, Xbox, PSN, Epic, Ubisoft, EA, RetroAchievements) to Achievement Tracker. Walks through research, interface implementation, fixtures, registration, and UI.
---

# Add an online provider

Follow in order. Don't skip step 1: the endpoints in `docs/PROVIDERS.md` are unverified.

## 1. Research spike (write findings down)
- Capture **real** requests/responses for: auth, list games, per-game achievements (schema + unlock state), rarity if available.
- Sanitize and save to `tests/fixtures/<platform>/`. Raw captures go in `tests/fixtures/_raw/` (gitignored).
- Update `docs/PROVIDERS.md` for the platform: what's verified, auth flow, rate limits, ToS/unofficial status, expiry behavior.
- If there's no viable, non-password-based path, stop and record an "unsupported" verdict instead of building it.

## 2. Add the `Platform` value
- `src/AchievementTracker.Core/Platform.cs`: add the enum member and extend `Id()`, `DisplayName()` and `IsUnofficial()`. The switch expressions are exhaustive and warnings are errors, so the compiler lists anything you missed.
- Update `PlatformTests` if needed (it already checks every value has an id and display name).

## 3. Implement the provider
- Create `src/AchievementTracker.Providers/<Platform>/<Platform>Provider.cs` (namespace `AchievementTracker.Providers.<Platform>`), a `sealed class` implementing `IAchievementProvider` (see `docs/SPEC.md` §4). Return normalized `Remote*` records only.
- Take an `HttpClient` (from `IHttpClientFactory`) via the constructor; never `new HttpClient()` per call.
- Map failures to `ProviderException` with the right `ProviderErrorKind` (`AuthExpired`, `RateLimited` + `retryAfter`, `Network`, `Parse`, `Unsupported`).
- Declare honest `ProviderCapabilities` (`Polling`, `LocalWatch`, `GlobalRarity`, `OAuth`, `Unofficial`).
- Store tokens via `ISecretStore`, keyed by account id. Never passwords. Never log tokens (`Secret` is redacted, so keep secrets wrapped in it).
- Pass the `CancellationToken` to every awaited call.
- Register the provider where providers are composed (see `App`).

## 4. Test
- Parser/mapper tests from fixtures (no network).
- Tests with a stubbed `HttpMessageHandler` for auth refresh, 401 → `AuthExpired`, 429 → `RateLimited`.
- Run `dotnet build` (zero warnings) and `dotnet test`.

## 5. Connect UI
- Add a connect view + view-model under `src/AchievementTracker.App/Views/Accounts/` (OAuth via browser/loopback, token paste, or key entry).
- If unofficial: require the "I understand this is unofficial" opt-in before connecting.

## 6. Finish
- Verify baseline behavior: first sync produces **no** notifications; a later new unlock produces exactly one.
- Update the README support table and ROADMAP checkboxes.
