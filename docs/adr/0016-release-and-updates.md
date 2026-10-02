# ADR-0016: Release and updates

- **Status:** Accepted
- **Date:** 2026-10-02

## Context

v1 needs a way to reach users and a way to keep them current. The app is Windows only, a single developer maintains it, and there is no budget for a code-signing certificate before the first release. The source lives at https://github.com/Adam-Dickinson/Achievement-Tracker, which already runs CI on `windows-latest`.

Update checking is the first request the app makes to anything other than the platforms the user has connected, so it has a privacy cost that needs a decision, not a default.

## Options considered

| Option | Result |
|---|---|
| No auto-update, manual download only | Simplest, but users on old versions miss fixes and never learn a new version exists |
| Microsoft Store (MSIX) | Handles signing and updates, but needs a developer account, a review process and MSIX packaging constraints |
| Sign with Azure Trusted Signing or a purchased certificate | Removes the SmartScreen warning, but costs money and setup time that a first release does not justify yet |
| Download updates automatically | Less friction, but the app fetches and stages a binary the user did not ask for |
| **GitHub Releases, `electron-updater` in notify-only mode, unsigned for v1** | No cost, no new infrastructure, the user stays in control of every download |

## Decision

- **Platform:** Windows only for v1.
- **Installer:** per-user NSIS, built by `electron-builder`. It installs without admin rights and is named `Trophy-Locker-Setup-<version>.exe`.
- **Distribution:** GitHub Releases is the only distribution and update source.
- **Signing:** the v1 installer is unsigned. The SmartScreen warning is accepted and documented in the README: "Windows protected your PC", then More info, then Run anyway.
- **Updates:** `electron-updater` in notify-only mode. The app checks at launch and every 6 hours, tells the user when a newer version exists, and downloads nothing until the user presses Download. The download is verified against the SHA-512 in `latest.yml`.
- **Privacy:** the check reads the public release feed on github.com and sends nothing else. It can be switched off in Settings under Updates. It is on by default, because security fixes matter more than the single request.
- **Release process:** `.github/workflows/release.yml` runs on a pushed tag matching `v*`. It fails if the tag does not match the version in `package.json`, runs the same checks as CI, then packages the installer and uploads it to a draft release. The workflow has no comments, so its behaviour is recorded here.
- **Publishing:** a release is a pushed tag plus pressing Publish on the draft. Nothing reaches users until the draft is published.
- **License:** the project is GPL-3.0-only.

## Consequences

**Positive:**

- No certificate cost and no new hosting.
- The user decides when anything is downloaded.
- Signing can be added later without changing the update mechanism: `electron-updater` verifies the publisher once a certificate exists.
- Reviewing the draft before pressing Publish is a built-in last check.

**Negative / to accept:**

- Users see a SmartScreen warning at first install until reputation builds.
- The app contacts github.com on launch and every 6 hours unless the user switches it off.
- A release depends on GitHub Actions and GitHub Releases being available.

## Revisit if

- The SmartScreen warning measurably stops people installing: add signing (Azure Trusted Signing or a certificate).
- A platform other than Windows is added: packaging and update feeds need their own decision.
- Users ask for automatic downloads.
