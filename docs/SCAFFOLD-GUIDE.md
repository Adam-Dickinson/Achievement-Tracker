# Scaffold Guide: what's here, and a React + Electron primer

Explains what was built, how the pieces connect, how to run it, and the React and Electron ideas you will meet when reading the code. It is written for someone who is new to React. Read it once, then keep it as a reference.

> **Status:** everything here has been built and checked. `npm run lint`, `npm run typecheck` and `npm test` (27 tests) pass, the production build works, and the built app was run and driven by script: window, IPC, SQLite schema, the click-through toast, close-to-tray and single instance. `npm run dev` (hot reload) was also verified.

---

## 1. The big picture

An Electron app is really **two programs in one**:

```
MAIN PROCESS (Node.js)                    RENDERER (a Chromium web page)
src/main/*                                src/renderer/*   <- React lives here
 - creates windows and the tray            - draws the UI
 - owns the database, network, files       - has NO access to files, the DB or Node
 - later: providers and sync               - asks the main process for things via IPC
        ▲                                          │
        └────────── PRELOAD (src/preload) ─────────┘
              a tiny, safe bridge that exposes  window.api
```

- **Main process**: normal Node.js. It can do anything the computer can do, so it holds all the dangerous, privileged code.
- **Renderer**: a web page inside a window. You build it with React just like a website. For safety it is *sandboxed*: no Node, no file access.
- **Preload script**: runs before the page loads and hands the page a small `window.api` object with only the calls we allow (`getAppInfo`, `sendTestNotification`, `onToast`).
- **IPC** (inter-process communication) is how they talk: the page calls `window.api.something()`, the main process answers.
- `src/shared` holds types both sides use, including the list of IPC calls (`ipc.ts`), so TypeScript catches a mismatch.

There are **two windows**, each a separate React app:
1. the **main window** (`renderer/index.html` → `src/main.tsx` → `app/App.tsx`)
2. the **overlay window** (`renderer/overlay.html` → `overlay/main.tsx` → `overlay/OverlayApp.tsx`): a transparent, click-through window that shows unlock toasts over games.

Decision and reasoning: [ADR-0003](adr/0003-electron-typescript-react.md).

## 2. What was created

| Area | What | State |
|---|---|---|
| Docs | Design, spec, architecture, providers, roadmap, ADRs, this guide | Complete drafts |
| Mockups | 7 screens in `docs/design/mockups/` | Reference only |
| `src/shared` | Platform, Rarity, Secret, models, provider interface, errors, IPC contract | Real, tested |
| `src/main/store` | SQLite schema, migration runner, database opener | Real, tested against a real SQLite database |
| `src/main` | Windows, tray, single instance, overlay service, IPC handlers | Working |
| `src/main/providers`, `sync` | Per-platform stubs; backoff calculation | Stubs / one small piece |
| `src/renderer` | App shell (sidebar + placeholder pages), animated toast, Button, icons | Working, placeholder content |
| CI | `.github/workflows/ci.yml` | Written, not yet run on GitHub (same commands pass locally) |

The main window is a placeholder. The mockups in `docs/design/mockups/` show what it should become, milestone by milestone ([roadmap](ROADMAP.md)).

## 3. The tooling, in plain terms

| Tool | What it does |
|---|---|
| **npm** | Installs packages and runs the scripts in `package.json`. `package-lock.json` pins exact versions, so commit it. |
| **electron-vite** (on Vite) | Builds all three parts (main, preload, renderer) and runs them with hot reload. Config: `electron.vite.config.ts`. |
| **TypeScript** | Types. Two configs: `tsconfig.node.json` (main/preload/shared) and `tsconfig.web.json` (renderer). |
| **React 19** | The UI library. |
| **Tailwind CSS 4** | Styling with utility classes in your JSX (`className="flex gap-2 text-fg-muted"`). The design tokens are in `renderer/src/styles/index.css`. |
| **Motion** | Animation library (`motion/react`). |
| **lucide-react** | Icons. |
| **Vitest + Testing Library** | Tests. Component tests run in a fake browser (jsdom). |
| **ESLint / Prettier** | Lint rules / automatic formatting. |

## 4. File-by-file tour

### `src/shared`
| File | What it defines |
|---|---|
| `platform.ts` | `Platform` (a union of ids like `'steam'`), `PLATFORM_INFO` (display name, unofficial flag) |
| `rarity.ts` | `Rarity` and `rarityFromPercent()`: the rarity tiers from the design |
| `secret.ts` | `Secret`: wraps a token so it prints as `Secret(<redacted>)` everywhere |
| `models.ts` | Data shapes: `RemoteGame`, `RemoteAchievement`, `UnlockEvent`... |
| `errors.ts` | `ProviderError` with a `kind` (`'auth_expired'`, `'rate_limited'`...) |
| `provider.ts` | The `AchievementProvider` interface every platform implements |
| `ipc.ts` | IPC channel names, `ToastPayload`, and the `window.api` type |

### `src/main`
| File | What it does |
|---|---|
| `index.ts` | App start-up: single-instance lock, opens the database, creates the overlay and tray, wires IPC |
| `windows.ts` | Creates the main window and the overlay window (with the security settings) |
| `overlay-service.ts` | Positions the overlay bottom-right, shows it without stealing focus, sends the toast, hides it after N seconds |
| `tray.ts` | The tray icon and its menu |
| `ipc.ts` | Handlers for calls from the UI (checks who is calling) |
| `store/` | `migrations/0001_init.sql` (the schema), `migrate.ts` (applies pending migrations), `database.ts` (opens the file) |
| `sync/backoff.ts` | Retry delays (5 s, 10 s, 20 s... capped) |

### `src/renderer/src`
| File | What it is |
|---|---|
| `main.tsx` | Starts React in the main window |
| `app/App.tsx` | The shell: holds which page is selected, renders `Sidebar` and the page |
| `app/Sidebar.tsx`, `app/navigation.ts` | The nav list (data in `navigation.ts`, UI in `Sidebar.tsx`) |
| `components/Button.tsx`, `TrophyIcon.tsx` | Small reusable components |
| `overlay/OverlayApp.tsx` | Root of the overlay window: listens for toasts and shows one |
| `overlay/Toast.tsx` | The unlock toast, with rarity colours and animation |
| `styles/index.css` | Design tokens and base styles |

## 5. React, using this codebase as the examples

You don't need to memorise these. Skim, then open the file when you're curious.

### A component is a function that returns UI (JSX)
`components/TrophyIcon.tsx` is about the smallest useful one:

```tsx
export function TrophyIcon({ className }: TrophyIconProps) {
  return <svg className={className}>...</svg>
}
```

JSX looks like HTML but is JavaScript. Use `className` (not `class`), and `{ ... }` to insert any JavaScript expression. Component names start with a capital letter; you use them like tags: `<TrophyIcon className="h-6 w-5 text-primary" />`.

### Props: the inputs to a component
Props are the attributes you pass in. `Button.tsx` accepts a `variant` and passes every other prop straight through to the real `<button>`:

```tsx
export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <button className={...} {...props} />
}
```

That is why `<Button onClick={...} disabled>` just works. Props flow **down** (parent to child) and are read-only.

### Rendering lists and conditionals
In `Sidebar.tsx`, `NAV_ITEMS.map(...)` turns an array into a list of buttons. Each item needs a stable `key` so React can track it. For "show this only if...", JSX uses `&&`:

```tsx
{toast && <Toast key={toast.id} {...toast.payload} />}   // renders nothing when toast is null
```

### State: data that changes over time (`useState`)
In `app/App.tsx`:

```tsx
const [page, setPage] = useState<PageId>('dashboard')
```

`page` is the current value; `setPage(x)` changes it **and makes React re-run the component** to redraw with the new value. Never change state by assigning to it directly; always call the setter. This "state changes → UI redraws" loop is the core idea of React.

### Lifting state up
`App` owns `page`, and passes `selected={page}` and `onSelect={setPage}` down to `Sidebar`. The sidebar doesn't own the selection; it just reports clicks upward. When two components need the same data, keep it in their nearest common parent.

### Effects: doing something outside React (`useEffect`)
In `App.tsx`, asking the main process for the app info:

```tsx
useEffect(() => {
  void window.api.getAppInfo().then(setInfo)
}, [])
```

The `[]` (the *dependency list*) means "run once, after the first render". An effect is for side effects: talking to the outside world, timers, subscriptions.

### Effects must clean up after themselves
`overlay/OverlayApp.tsx` has two good examples:

```tsx
useEffect(() => {
  return window.api.onToast((payload) => { ... })   // onToast returns an "unsubscribe" function
}, [])

useEffect(() => {
  if (!toast) return
  const timer = setTimeout(() => setToast(null), toast.payload.durationMs)
  return () => clearTimeout(timer)                   // cancel the timer if a new toast arrives first
}, [toast])                                          // re-run whenever `toast` changes
```

The function you **return** from an effect is its cleanup. React runs it before re-running the effect and when the component disappears. In development, `<StrictMode>` deliberately runs effects twice to expose missing cleanups, so forgetting one shows up quickly as duplicated behaviour.

### Refs: a value that survives re-renders without causing one
`const nextId = useRef(0)` in `OverlayApp` is a counter for toast ids. Changing `nextId.current` doesn't redraw anything, unlike state.

### The `key` trick for animations
Giving `<Toast key={toast.id} />` a new `key` for each toast tells React "this is a different element", so it unmounts the old toast and mounts a new one, which is what triggers the slide-in animation. `AnimatePresence` (from Motion) keeps the old one around just long enough to play its exit animation.

### Events
`onClick={() => onSelect(item.id)}` attaches a handler. Handlers are normal functions; write them inline while small.

### Tailwind: styling with classes
There is no separate CSS file per component. `className="flex items-center gap-3 rounded-control px-3 py-2.5 text-fg-muted"` reads: flex row, centred, 12px gap, our `control` corner radius, padding, muted text colour. Class names like `bg-surface-1`, `text-fg-muted` and `border-rarity-rare` come from the tokens in `styles/index.css`. Conditional styling is just a JavaScript expression building the string (see the `active ? ... : ...` in `Sidebar.tsx`).

Two gotchas worth knowing:
- Tailwind finds classes by scanning your source for **complete strings**, so write `'border-rarity-rare'`, never `` `border-rarity-${x}` `` (see the `STYLES` table in `Toast.tsx`).
- **Don't name a colour token `base`, `sm`, `lg`...** They collide with Tailwind's font-size classes (`text-base` is a size). This exact mistake made the toast title invisible during development; the background colour is now called `canvas`.

### Testing components
`renderer/src/app/App.test.tsx`:

```tsx
render(<App />)
fireEvent.click(screen.getByRole('button', { name: 'Library' }))
expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
```

You render the component, interact with it the way a user would (find things by role/name, not by internal details), and assert on what's visible. The real `window.api` only exists inside Electron, so tests install a fake one in `beforeEach`.

## 6. Electron concepts, using this codebase

### Windows with safe defaults (`main/windows.ts`)
Every window is created with `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. That means the React page cannot touch Node, files or the database, even if it were somehow attacked. Its only door out is `window.api`.

### The preload bridge (`preload/index.ts`)
```ts
contextBridge.exposeInMainWorld('api', {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  ...
})
```
`invoke` sends a request and returns a promise for the reply. The matching `ipcMain.handle(IPC.getAppInfo, ...)` in `main/ipc.ts` produces it. `onToast` is the other direction: the main process pushes with `webContents.send(...)` and the page subscribes.

### The overlay window (`windows.ts`, `overlay-service.ts`)
The trick that makes a toast safe to show over a game:
- `transparent: true`, `frame: false`: no border or background, just the toast
- `alwaysOnTop` at the `'screen-saver'` level: above normal windows
- `focusable: false` + `showInactive()`: it never takes keyboard focus from the game
- `setIgnoreMouseEvents(true)`: clicks fall through to whatever is underneath
- It is created hidden at start-up so a toast appears instantly

On Windows this shows up as the window styles `WS_EX_TRANSPARENT` (click-through) and `WS_EX_NOACTIVATE` (no focus). We confirmed both on the running app. Nothing is injected into the game itself. **Limitation:** a game in *exclusive fullscreen* draws over everything, including this window (a Windows notification fallback is planned).

### Tray, close, single instance (`main/index.ts`, `tray.ts`)
- Closing the main window **destroys** it (saving ~90 MB of memory); the app keeps running in the tray and recreates the window when you click the tray icon. "Quit" in the tray menu exits.
- `app.requestSingleInstanceLock()` stops a second copy from starting; launching again just brings the first window forward.

### The database (`main/store`)
Uses Node's built-in `node:sqlite`, so there is nothing native to compile. The schema lives in `migrations/0001_init.sql`. To change it, you **add** `0002_something.sql`; you never edit an existing migration. `migrate.ts` applies whichever are newer than the database's stored version, each inside a transaction.

## 7. TypeScript ideas used here
- **String-literal unions** instead of enums: `type Rarity = 'common' | 'uncommon' | ...`
- **`Record<Platform, ...>`** tables (e.g. `PLATFORM_INFO`): add a platform to the list and the compiler errors until you describe it. Same for `RARITY_LABEL`.
- **`import type`** for imports that only exist at compile time.
- **Path aliases:** `@/` means `src/renderer/src/`, `@shared/` means `src/shared/`.
- **`readonly`** and **`| null`** in data types to make intent explicit.
- **`satisfies`**: checks a value matches a type without widening it (used in `overlay-service.ts`).

## 8. Command cheat sheet

| Command | Does |
|---|---|
| `npm run dev` | Run the app with hot reload. Edit a `.tsx` file and the window updates instantly. |
| `npm test` | Run all tests once. `npx vitest` runs them in watch mode. |
| `npm run lint` | ESLint (zero warnings allowed) |
| `npm run typecheck` | TypeScript, both configs |
| `npm run format` | Prettier on `src` and config files |
| `npm run build` | Typecheck + production build into `out/` |
| `npm start` | Run the production build |
| `npm install <pkg>` / `npm install -D <pkg>` | Add a dependency / dev dependency |

In development the default menu is kept: press **Ctrl+Shift+I** (or Alt → View → Toggle Developer Tools) to open browser DevTools for the React UI. The React DevTools extension is worth installing later.

## 9. Your first 30 minutes

1. `npm install` (downloads Electron the first time, ~100 MB), then `npm run dev`. The window opens and a trophy icon appears in the tray.
2. Click **Send test notification** and watch the toast slide in at the bottom-right. Click it repeatedly to cycle the four rarity tiers. Try clicking *through* it: it ignores the mouse.
3. **Change something and watch hot reload.** In `app/navigation.ts`, change the description of Dashboard and save. The window updates without a restart.
4. **Add a nav item.** Add `'reports'` to `PageId` and an entry to `NAV_ITEMS` (pick an icon from lucide). The compiler and the UI both pick it up.
5. **Break something on purpose.** Add `'gog'` to `PLATFORMS` in `shared/platform.ts` and run `npm run typecheck`: it lists everything that must be updated. Undo with `git restore .`.
6. **Change the toast.** In `main/overlay-service.ts` the default duration is 5000 ms. In `overlay/Toast.tsx`, tweak the `transition` numbers and watch the animation change.
7. Open `docs/design/mockups/dashboard.html` in a browser: that is what the Dashboard should look like, and a good first real screen to build in M1.

## 10. Troubleshooting

- **`Cannot read properties of undefined (reading 'requestSingleInstanceLock')`:** the environment variable `ELECTRON_RUN_AS_NODE` is set (VS Code's extension host sets it), which makes Electron run as plain Node. Unset it in that shell (`Remove-Item Env:ELECTRON_RUN_AS_NODE`) or launch from a normal terminal.
- **`Error: Electron uninstall` when running `npm run dev`:** Electron's binary wasn't downloaded. `npm install` normally fetches it through the `postinstall` script (`install-electron`); if it's missing (an interrupted install, or you used `--ignore-scripts`), run `npx install-electron`.
- **`EBADENGINE` warnings during `npm install`:** you're on a Node version that some test dependencies don't list as supported (for example Node 25). It still works, but Node 24 LTS avoids the warnings.
- **A Tailwind class does nothing:** check the class name is written out in full somewhere in the source, and that its token exists in `styles/index.css`.
- **Blank window in a production build:** open DevTools (dev builds only) and check for Content-Security-Policy errors: production pages allow only same-origin scripts and styles.

## 11. Known gaps and follow-ups

- **Memory:** measured on a production build in the tray: ~320 MB working set, ~170 MB private, 4 processes. Options to reduce (on-demand overlay, no GPU process) are in ADR-0003. Installer will be ~80-120 MB.
- **`node:sqlite` is marked experimental in Node.** It works and is tested; a small interface (`SqlDatabase`) confines the impact if it ever changes.
- **Not yet done:** toast queue/stacking, autostart, credential storage (`safeStorage`), the real screens, all providers and the sync engine (M1+).
- **Overlay not yet verified over a real game** or across multiple monitors with different DPI (roadmap Spike A).
- CI has not run on GitHub yet.
- Vite is pinned to 7 and TypeScript to 6.0 until electron-vite and typescript-eslint support the newer majors.

## 12. Learning resources

- **React's official docs** (start with "Learn React" and "Thinking in React"): https://react.dev/learn
- **Electron docs** (process model, IPC, security checklist): https://www.electronjs.org/docs/latest/
- **Tailwind CSS docs:** https://tailwindcss.com/docs
- **Motion (animation):** https://motion.dev/docs/react
- **Testing Library:** https://testing-library.com/docs/react-testing-library/intro/
- **TypeScript handbook:** https://www.typescriptlang.org/docs/handbook/intro.html

## 13. Glossary

| Term | Meaning |
|---|---|
| Main process | The Node.js side of Electron: windows, files, database, network |
| Renderer | A web page in a window; here, the React app |
| Preload | A small script that safely exposes `window.api` to the renderer |
| IPC | Messages between the main process and a renderer |
| Component | A function that returns UI; the building block of React |
| Props | Inputs passed into a component |
| State | Data a component remembers; changing it redraws the UI |
| Hook | A function like `useState` / `useEffect` that adds React features to a component |
| Effect | Code that runs after rendering, for side effects; may return a cleanup function |
| JSX | HTML-like syntax inside JavaScript/TypeScript |
| Utility class | A single-purpose CSS class (Tailwind), e.g. `flex`, `gap-3` |
| Migration | A numbered, forward-only SQL file that changes the database schema |
| Provider | An adapter for one platform (Steam, Xbox, ...) |
| Baseline | The first sync of a game, which stores existing unlocks silently |
