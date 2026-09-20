const NAV = ["Dashboard", "Library", "Activity", "Accounts", "Settings"] as const;

/**
 * App shell placeholder. Target designs live in docs/design/mockups/ (start
 * with dashboard.html); build screens under src/features/*.
 */
export function App() {
  return (
    <div className="flex h-full">
      <aside className="flex w-60 flex-col border-r border-line bg-surface-1 p-4">
        <div className="mb-6 font-display text-lg font-semibold">Achievement Tracker</div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item, i) => (
            <div
              key={item}
              className={
                "rounded-control px-3 py-2 text-sm " +
                (i === 0 ? "bg-surface-3 text-fg" : "text-fg-muted")
              }
            >
              {item}
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex flex-1 items-center justify-center text-fg-muted">
        Scaffold ready. See docs/ROADMAP.md, M1.
      </main>
    </div>
  );
}
