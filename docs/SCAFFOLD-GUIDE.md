# Scaffold Guide: what's here, and Rust for first-timers

Written for someone new to Rust. It explains what was built in the initial commit, how the pieces connect, and the Rust concepts you'll meet when reading the code. Read it once, then use it as a reference.

> **Honest status:** the Rust code has **never been compiled**. It was written on a machine without a Rust toolchain. The frontend was built and tested; the Rust was not. Your first job is to run `cargo check --workspace` and fix whatever it reports (see [§8](#8-your-first-30-minutes)). Compiler errors in Rust are unusually helpful, so this is a good way to learn.

---

## 1. The big picture

The app has two halves that talk to each other:

```
┌─ Rust (the "backend") ───────────────┐      ┌─ TypeScript/React (the "frontend") ─┐
│ Talks to Steam/Xbox/PSN, reads files, │ IPC  │ Draws the windows: dashboard,        │
│ stores data, detects unlocks          │◄────►│ library, settings, the toast pop-up  │
└───────────────────────────────────────┘      └──────────────────────────────────────┘
                     └────────────── Tauri glues them into one desktop app ───────────┘
```

- **Tauri** is the framework. It gives you a native window that shows a web page (your React UI), plus a Rust process behind it. Think "Electron, but the backend is Rust and the app is much smaller."
- **IPC** (inter-process communication) means the UI calls Rust functions by name, e.g. `invoke("app_version")`, and Rust can send events back.
- The decision and reasoning are in [ADR-0001](adr/0001-tech-stack.md).

## 2. What was created

| Area | What | State |
|---|---|---|
| Docs | Design, spec, architecture, providers, roadmap, ADR, this guide | Complete drafts |
| Mockups | 7 screens in `docs/design/mockups/` | Reference only |
| Claude skills | `.claude/skills/*` recipes for recurring tasks | Ready to use |
| **Rust workspace** | 5 crates (see §3) | `at-core` real, others stubs. **Uncompiled** |
| **Frontend** | React + Vite + Tailwind shell, 2 windows | Builds, lints, tests pass |
| CI | `.github/workflows/ci.yml` | Written, never run |
| Icons | `src-tauri/icons/` generated from `app-icon.svg` | Done |

Nothing *does* anything yet (no syncing, no notifications). The scaffold is the skeleton the milestones in the [roadmap](ROADMAP.md) fill in.

## 3. The Rust workspace, file by file

### Cargo, Rust's build tool and package manager

- `Cargo.toml` is Rust's `package.json`. A **crate** is a Rust package (a library or a program).
- The root [`Cargo.toml`](../Cargo.toml) declares a **workspace**: several crates in one repo, built together and sharing one `target/` folder (like a pnpm/npm workspace). Members: `crates/core`, `crates/store`, `crates/providers`, `crates/sync`, `src-tauri`.
- `[workspace.dependencies]` lists shared versions once. A member says `serde.workspace = true` to use it. `at-core = { path = "crates/core" }` is a dependency on a sibling crate in this repo.
- Crate names use hyphens (`at-core`) but in code you write underscores: `use at_core::Platform;`.
- `Cargo.lock` is like `pnpm-lock.yaml`. Commit it for apps.
- `rust-toolchain.toml` pins "stable" Rust with `rustfmt` (formatter) and `clippy` (linter).

### The crates and how they depend on each other

```
at-core  ←  at-store
   ↑     ←  at-providers   ←  at-sync  ←  src-tauri (the app)
```

Arrows point at what is depended on. `at-core` depends on no other crate in the repo. This one-way rule keeps the code tidy: providers can never reach into the database, and so on ([ARCHITECTURE.md](ARCHITECTURE.md) §2).

### `crates/core`: the shared vocabulary (real code)

| File | What it defines |
|---|---|
| `platform.rs` | `enum Platform { Steam, Xbox, ... }` with helper methods |
| `model.rs` | Data shapes: `RemoteGame`, `RemoteAchievement`, `UnlockEvent`, `Rarity`, `Secret`... |
| `error.rs` | `ProviderError`, the ways a platform call can fail |
| `provider.rs` | `trait AchievementProvider`, the interface every platform must implement |
| `secrets.rs` | `trait SecretStore` (where tokens live) and an in-memory version for tests |
| `lib.rs` | Declares the modules and re-exports the important names |

### `crates/store`: the database (schema only)

`migrations/0001_init.sql` is the full SQLite schema. `lib.rs` embeds it into the program with `include_str!`. No queries yet; you'll add `sqlx` in M1.

### `crates/providers`: one folder per platform (stubs)

`steam/`, `xbox/`, `playstation/`, `retroachievements/`, `rpcs3/`, `epic/`, `ubisoft/`, `ea/`, `xenia/`, `local_file/`. Each `mod.rs` is only a doc comment saying what it will do and its priority.

### `crates/sync`: the engine (one small real function)

`backoff.rs` computes retry delays (5s, 10s, 20s... capped). `events.rs` re-exports `UnlockEvent`. The scheduler and diff logic arrive in M1.

### `src-tauri`: the app itself

- `src/main.rs` is the program entry point. It just calls `run()`.
- `src/lib.rs` builds the Tauri app and registers the commands the UI may call.
- `src/commands/mod.rs` has one command, `app_version`, to prove the Rust↔UI bridge works.
- `src/notify/` and `src/tray.rs` are placeholders (M1).
- `tauri.conf.json` defines two windows: **main** (the app) and **overlay** (a hidden, transparent, always-on-top window for toasts).
- `capabilities/default.json` lists what those windows are allowed to do (Tauri denies by default).
- `build.rs` runs at compile time to set up Tauri. You won't touch it.

### The frontend (`src/`, `index.html`, `overlay.html`)

- Two HTML entry points, one per window. `vite.config.ts` builds both.
- `src/styles/index.css` holds the design tokens (colors, fonts) as Tailwind theme values, matching `.superdesign/design-system.md`.
- `src/overlay/Toast.tsx` is the unlock pop-up component; `src/app/App.tsx` is a placeholder shell.
- `src/lib/rarity.ts` mirrors the Rust `Rarity::from_percent` so both sides classify identically (there's a test).
- `src/features/*` are empty folders waiting for the screens in the mockups.

## 4. Rust concepts, using this codebase as the examples

You don't need to memorise these. Skim, then look at the file when you're curious.

### Everything has an owner (ownership and borrowing)

The big idea in Rust. A value has exactly one owner, and when the owner goes out of scope the value is freed (no garbage collector, no manual `free`). To use a value without taking it, you **borrow** it with `&`.

```rust
async fn list_games(&self, creds: &AccountCredentials) -> Result<...>
```

`&self` and `&AccountCredentials` mean "I only look at these; the caller keeps them." If it were `creds: AccountCredentials` (no `&`), the function would *take* it and the caller couldn't use it afterwards. `&mut` is a borrow you can modify. Most compiler errors you'll hit early are about this, and the messages tell you what to change.

### `enum` and `match`: enums that carry meaning

[`platform.rs`](../crates/core/src/platform.rs) defines `Platform` as an enum: a value that is exactly one of a fixed set of variants. `match` handles each case, and **the compiler refuses to compile if you forget one**. That's why adding a new platform later will point you to every place that needs updating:

```rust
pub fn display_name(self) -> &'static str {
    match self {
        Platform::Steam => "Steam",
        Platform::Xbox => "Xbox",
        // ...every variant must appear
    }
}
```

`matches!(self, Platform::Xbox | Platform::Playstation | ...)` is a shortcut that returns `true`/`false`.

### `Option` and `Result`: no `null`, no exceptions

- `Option<T>` is either `Some(value)` or `None`. Rust has no null. `description: Option<String>` in [`model.rs`](../crates/core/src/model.rs) says "may be missing", and the compiler forces you to handle both cases.
- `Result<T, E>` is either `Ok(value)` or `Err(error)`. Functions that can fail return it, e.g. `Result<Vec<RemoteGame>, ProviderError>`. There are no exceptions.
- The `?` operator means "if this is an error, return it from my function now; otherwise unwrap the value". Seen in [`secrets.rs`](../crates/core/src/secrets.rs): `let map = self.inner.lock().map_err(|e| e.to_string())?;`
- `.unwrap()` means "crash if this is an error/None." Fine in tests, **avoided in app code** (project rule in `CLAUDE.md`).

### `struct`, `impl`, and `derive`

A `struct` is a record of fields (like a TS interface/class). Methods live in an `impl` block. Lines like

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteGame { ... }
```

ask the compiler to **generate code** for you: `Debug` (printable with `{:?}`), `Clone` (`.clone()` copies it), `Serialize`/`Deserialize` (to/from JSON, via the `serde` crate). `#[serde(rename_all = "snake_case")]` controls how variants are spelled in JSON.

### `trait`: an interface

[`provider.rs`](../crates/core/src/provider.rs) defines `trait AchievementProvider`: the list of methods every platform must provide (`authenticate`, `list_games`, `fetch_game`...). Steam, Xbox, etc. will each write `impl AchievementProvider for SteamProvider { ... }`. A trait method can have a default body (`watch` returns `None` unless overridden, since only file-based emulators need it).

`Send + Sync` on the trait means "safe to share across threads." Needed because the sync engine runs providers concurrently.

### `async`/`await` and `#[async_trait]`

Same idea as JavaScript: `async fn` returns a "future" you `.await`. Rust needs a runtime (**tokio**, added in M1) to run them. Traits with `async fn` need the `#[async_trait]` attribute for now.

### `dyn`, `Box`, `Arc`: trait objects and shared pointers

You'll see `Arc<dyn Fn(RemoteGameRef) + Send + Sync>` and `Box<dyn Send + Sync>` in `provider.rs`. Read them as:
- `dyn Trait`: "some value that implements this trait; I don't know which type until runtime."
- `Box<T>`: put a value on the heap (needed when the size isn't known).
- `Arc<T>`: a reference-counted pointer that many threads can share safely.

The `ChangeCallback` is a function a file-watching provider calls when a file changes. The `WatchHandle` stops the watcher when dropped ("dropping" = the value going out of scope, Rust's automatic cleanup).

### `Secret`: making a mistake impossible

`Secret` in `model.rs` wraps a string and implements `Debug` by hand so it prints `Secret(<redacted>)`. If anyone logs a struct containing it, the token can't leak. There's a test proving it. This "newtype" pattern (a tiny wrapper type with a special rule) is common in Rust.

### Modules and visibility

Each file is a **module**. `pub mod error;` in `lib.rs` says "there's a file `error.rs`, and make it public." Items are private unless marked `pub`. `pub use platform::Platform;` re-exports so callers write `at_core::Platform` instead of `at_core::platform::Platform`. `use super::*;` (in tests) means "bring everything from the parent module into scope."

### Tests live next to the code

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn rarity_thresholds() { assert_eq!(Rarity::from_percent(1.4), Rarity::UltraRare); }
}
```

`#[cfg(test)]` means "only compile this when testing." Run them with `cargo test`. There are tests in `at-core`, `at-store` and `at-sync` already.

### Attributes: `#[...]` and `#![...]`

Metadata for the compiler. `#[tauri::command]` marks a function the UI can call; `#[derive(...)]` generates code; `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` in `main.rs` hides the console window in release builds.

### Macros: names ending in `!`

`println!`, `matches!`, `include_str!`, `generate_handler![...]`, `generate_context!()`. They generate code at compile time. `include_str!("../migrations/0001_init.sql")` embeds that file's text into the program.

## 5. How the pieces will fit at runtime (once built out)

```
Scheduler (at-sync) ── every N minutes ──► Provider.fetch_game() (at-providers)
        │                                         │ returns RemoteGameAchievements
        ▼                                         ▼
   diff against DB (at-store)  ──► new unlock? ──► UnlockEvent ──► notification service
                                    (skip on the                       │
                                     first sync!)                      ▼
                                                        overlay window shows Toast.tsx
```

Full detail: [ARCHITECTURE.md](ARCHITECTURE.md) §3 and [SPEC.md](SPEC.md) §5.

## 6. Command cheat sheet

| Command | Does |
|---|---|
| `cargo check --workspace` | Type-check everything fast, without producing a program. **Use this constantly.** |
| `cargo build` | Compile (debug) |
| `cargo test --workspace` | Run all Rust tests |
| `cargo test -p at-core` | Test one crate |
| `cargo fmt --all` | Auto-format |
| `cargo clippy --workspace --all-targets` | Lint: catches common mistakes and non-idiomatic code |
| `pnpm install` | Install frontend dependencies |
| `pnpm tauri dev` | Run the whole app with hot reload (first run compiles for several minutes) |
| `pnpm tauri build` | Produce an installer |
| `pnpm lint` / `typecheck` / `test` / `build` | Frontend checks (these pass today) |

## 7. Installing what you need (Windows)

1. **Rust:** install from https://rustup.rs (choose the default). It also offers the **Visual Studio C++ Build Tools**; you need the "Desktop development with C++" workload.
2. **WebView2:** already on Windows 11.
3. **pnpm:** `npm i -g pnpm@9` (or `corepack enable`).
4. Recommended VS Code extensions are listed in `.vscode/extensions.json` (rust-analyzer is the important one: inline errors and type hints).

Then verify: `rustc --version`, `cargo --version`, `pnpm --version`.

## 8. Your first 30 minutes

1. `pnpm install`
2. `cargo check --workspace`. **Expect some errors** (the code was never compiled). Read each one top to bottom: Rust's messages say what's wrong, point at the line, and often suggest the exact fix. Fix the first error, re-run (later errors are often side effects of the first).
3. `cargo test --workspace` and confirm the tests pass.
4. `pnpm tauri dev` and confirm the window opens (a placeholder shell). The overlay window is hidden by design.
5. Try the loop: change the `app_version` command in `src-tauri/src/commands/mod.rs`, re-run, and see it rebuild.

Likely trouble spots to look at first: `src-tauri/tauri.conf.json` (window options can differ between Tauri versions), the dependency versions in `Cargo.toml`, and the trait/`async_trait` code in `provider.rs`.

## 9. Learning resources

- **The Rust Programming Language** ("the Book"): https://doc.rust-lang.org/book/. Read chapters 1-10 first; ownership is chapter 4.
- **Rustlings**: small exercises that teach by fixing compiler errors: https://github.com/rust-lang/rustlings
- **Rust by Example**: https://doc.rust-lang.org/rust-by-example/
- **Tauri 2 docs**: https://tauri.app/
- **Tokio tutorial** (for async, needed in M1): https://tokio.rs/tokio/tutorial
- Rust standard library docs: https://doc.rust-lang.org/std/. Run `cargo doc --open` to browse docs for this project and its dependencies.

## 10. Working with Claude on this project

- `CLAUDE.md` holds the project rules Claude follows. Read them: they are also good rules for you.
- Project skills in `.claude/skills/` automate recurring tasks: `add-provider`, `add-emulator-adapter`, `db-migration`, `write-adr`.
- When learning, ask Claude to explain compiler errors or code before fixing them, and don't just accept fixes you don't understand.

## 11. Glossary

| Term | Meaning |
|---|---|
| Crate | A Rust package (library or program) |
| Workspace | Several crates built together |
| Trait | An interface: a set of methods a type must implement |
| Derive | Ask the compiler to generate common code for a type |
| Borrow (`&`) | Use a value without taking ownership |
| `Option` / `Result` | Rust's null-safe "maybe" and "success or error" types |
| Macro (`name!`) | Code that writes code at compile time |
| Clippy | Rust's linter |
| Tauri | Framework that wraps a web UI in a small native app with a Rust backend |
| IPC | Messages between the UI and the Rust side |
| Provider | An adapter for one platform (Steam, Xbox, ...) |
| Baseline | The first sync of a game, which stores existing unlocks silently |
