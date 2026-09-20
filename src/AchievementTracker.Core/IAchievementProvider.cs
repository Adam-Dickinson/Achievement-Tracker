namespace AchievementTracker.Core;

/// <summary>What the UI and sync engine may assume about a provider.</summary>
public sealed record ProviderCapabilities
{
    /// <summary>Can push change notifications from local files (no polling needed).</summary>
    public bool LocalWatch { get; init; }

    /// <summary>Must be polled on a schedule.</summary>
    public bool Polling { get; init; }

    /// <summary>Supplies global rarity percentages.</summary>
    public bool GlobalRarity { get; init; }

    /// <summary>Sign-in happens through an OAuth-style web flow.</summary>
    public bool OAuth { get; init; }

    /// <summary>Relies on unofficial endpoints; must be opt-in and labelled.</summary>
    public bool Unofficial { get; init; }
}

/// <summary>User-supplied input for connecting an account.</summary>
public abstract record AuthInput
{
    public sealed record ApiKey(Secret Key, string AccountId) : AuthInput;

    public sealed record Token(Secret Value) : AuthInput;

    public sealed record OAuthCallback(Uri RedirectUrl) : AuthInput;

    public sealed record LocalPath(string Path) : AuthInput;
}

/// <summary>
/// A platform adapter. Pure: no SQL, no notifications, no UI (docs/ARCHITECTURE.md §2).
/// Failures are reported as <see cref="ProviderException"/>.
/// </summary>
public interface IAchievementProvider
{
    Platform Platform { get; }

    ProviderCapabilities Capabilities { get; }

    Task<AccountCredentials> AuthenticateAsync(AuthInput input, CancellationToken ct = default);

    /// <summary>Check the credentials are still valid and return the account identity.</summary>
    Task<AccountInfo> ValidateAsync(AccountCredentials credentials, CancellationToken ct = default);

    /// <summary>All games with achievement data for this account.</summary>
    Task<IReadOnlyList<RemoteGame>> ListGamesAsync(
        AccountCredentials credentials,
        CancellationToken ct = default);

    /// <summary>Full schema and unlock state for one game.</summary>
    Task<RemoteGameAchievements> FetchGameAsync(
        AccountCredentials credentials,
        RemoteGameRef game,
        CancellationToken ct = default);

    /// <summary>
    /// Event-driven sources return a handle (dispose to stop); polled sources keep the default.
    /// The callback only signals "something changed for this game": the sync engine re-fetches
    /// and diffs. Watchers never emit unlocks themselves.
    /// </summary>
    IDisposable? Watch(AccountCredentials credentials, Action<RemoteGameRef> onChange) => null;
}
