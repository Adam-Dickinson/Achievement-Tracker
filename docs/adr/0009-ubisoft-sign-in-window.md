# ADR-0009: Ubisoft signs in through its own page in an app window

- **Status:** Accepted
- **Date:** 2026-09-25

## Context

Spike C found Ubisoft Connect **feasible** (see [PROVIDERS.md](../PROVIDERS.md#ubisoft-connect-p1-verified-2026-09-25-feasible)): after a sign-in, Ubisoft hands back a *remember-me ticket* that can be traded for new sessions without the password, and a session for the Ubisoft Connect launcher's app ID can read a player's games and achievements.

Getting that first remember-me ticket is the problem. The other providers sign in without the app seeing a password:

- Xbox uses Microsoft's OAuth in the system browser with a loopback redirect (ADR-0007).
- Epic's sign-in page ends on a page that shows a code the user pastes into the app.

Ubisoft has neither. Its sign-in page (`account.ubisoft.com`, which embeds `connect.ubisoft.com/login` in an iframe) posts the email and password to `public-ubiservices.ubi.com/v3/profiles/sessions` from the page's own script and keeps the reply in the page. There is no redirect to catch and nothing to copy. Two more facts from the spike shape the decision:

- **The app ID matters.** A session made by the website (`1068ef52-…`) lists games but gets empty or refused achievements; a session for the launcher (`f68a4bb5-…`) reads them. The remember-me ticket from the website can be traded for a launcher session. The older web app ID in community tools (`314d4fef-…`) is retired (error 1002).
- **Remember-me tickets rotate, and reuse revokes the chain.** Every trade returns a new remember-me ticket. Presenting an old one fails (HTTP 401, error 3, "Nonce was not found") *and* invalidates the newest one, so the account has to sign in again.

Rule 5 forbids a provider that needs the user's password stored; SPEC's cross-cutting rule 3 says never store passwords.

## Options considered

| Option | For | Against |
|---|---|---|
| **Ubisoft's page in a locked-down app window** | The user signs in on Ubisoft's real page (with 2-step codes and reCAPTCHA); the app reads only Ubisoft's reply and keeps only the remember-me ticket | The app hosts a third-party login page for the first time; it relies on reading a network reply through the window's DevTools protocol |
| Our own email and password form, posted to the sessions endpoint | Simple | The app would see and handle the password; no reCAPTCHA or 2-step UI; exactly what rule 5 is there to avoid |
| Sign in in the system browser, then paste the session from its developer tools | The app never hosts the page | Unusable for most people (it means finding a reply in DevTools); fragile |
| Read the Ubisoft Connect launcher's stored sign-in on disk | No sign-in at all | Reads another app's encrypted secrets; only works where the launcher is installed and signed in |
| Mark Ubisoft "not supported" | Nothing to build or maintain | Drops a platform the spike showed is feasible |

## Decision

**Sign in on Ubisoft's own page, shown in an app window that is locked down, and keep only the remember-me ticket.** The owner chose this option on 2026-09-25.

The window (`src/main/ubisoft-sign-in-window.ts`):

- is sandboxed, with context isolation on, Node integration off and **no preload**, so the page gets no bridge into the app;
- uses a fresh in-memory session for each sign-in (a random partition name, cache off), so no cookies or storage outlive it, and refuses every permission request;
- inherits the app-wide rules in `main/index.ts`: no pop-ups and no top-level navigation away from the page it was opened on. Only email and password sign-in (with 2-step codes) is supported; "sign in with Google/Apple/…", "create account" and "forgot password" stay blocked;
- sends a plain Chrome user agent, since the page is protected by reCAPTCHA;
- reads **only the body of Ubisoft's 200 reply to `POST /v3/profiles/sessions`**, through the window's own DevTools protocol (`webContents.debugger`), following the sign-in iframe with auto-attach. It never reads the form or the page. The body is parsed at once and only the remember-me ticket, wrapped in `Secret`, leaves the sign-in code.

The provider then trades that ticket for a **launcher session** and from then on renews with the newest remember-me ticket. To live with rotation and reuse revocation:

- **The ticket only rotates in `authenticate()` and `refresh()`.** The connect flow saves `authenticate()`'s ticket straight away, and the Scheduler saves `refresh()`'s at the start of each round (ADR-0007). `listGames` and `fetchGame` never renew. If they find no usable session, or Ubisoft rejects one, they drop it and throw a *retryable* error, so the next round's `refresh()` renews and saves in one step.
- **One renewal per account at a time.** Concurrent `refresh()` calls share one request, because two renewals with the same ticket would revoke the chain.
- **A renewal is not cancelled half-way.** It does not take the caller's abort signal, so a reply carrying a new ticket is always read and handed back.
- A session is kept until 30 minutes before it expires (sessions last about 3 hours).

## Consequences

**Positive:**

- Ubisoft is supported without the app storing, seeing or handling a password, and with Ubisoft's own 2-step and reCAPTCHA checks intact.
- The sign-in flow (`src/main/ubisoft-sign-in.ts`) is plain TypeScript behind a small window interface, so it is tested without Electron; only the thin window adapter needs a real run.

**Negative / to accept:**

- The app now hosts a third-party page. It runs with no bridge into the app and a throwaway session, but it is still more surface than opening the system browser.
- Reading the reply relies on the DevTools protocol and on Ubisoft's page calling that endpoint. If Ubisoft changes its sign-in, the window stops finding a ticket; the user sees it time out after 10 minutes or can cancel.
- Social sign-in (Google, Apple, PlayStation, Xbox, Steam and so on) does not work in the window. Accounts that only have a social sign-in cannot connect until that is added.
- A remember-me ticket that rotates but is never saved, for example if the app is killed between Ubisoft's reply and the save, revokes the chain on the next start and the account shows "needs reconnecting".
- The launcher's app ID is Ubisoft's, not ours. Ubisoft could block it for third parties, as it retired `314d4fef-…`. That is part of "unofficial" (rule 5) and is labelled in the Connect card.

## Revisit if

- Ubisoft offers a public API, OAuth, or a sign-in that ends on a page with a code (like Epic).
- Users need social sign-in: allow the specific identity providers' hosts in the window, keeping the rest of these rules.
- Ubisoft blocks the launcher's app ID for this use, or reuse revocation makes rotation unworkable in practice.
