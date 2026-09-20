namespace AchievementTracker.Core;

public enum ProviderErrorKind
{
    /// <summary>Credentials expired or invalid: prompt the user to re-authenticate.</summary>
    AuthExpired,

    /// <summary>The platform asked us to slow down: back off.</summary>
    RateLimited,

    /// <summary>Transient network failure: retry with backoff.</summary>
    Network,

    /// <summary>The response or file wasn't in the expected shape.</summary>
    Parse,

    /// <summary>This provider can't do that (e.g. no public API).</summary>
    Unsupported,

    Other,
}

/// <summary>
/// Typed provider failure. The sync engine maps <see cref="Kind"/> to backoff, re-auth prompts
/// or UI status (docs/SPEC.md §4). Never put secrets in messages.
/// </summary>
public sealed class ProviderException(
    ProviderErrorKind kind,
    string message,
    TimeSpan? retryAfter = null,
    Exception? inner = null) : Exception(message, inner)
{
    public ProviderErrorKind Kind { get; } = kind;

    public TimeSpan? RetryAfter { get; } = retryAfter;

    /// <summary>Whether retrying later (with backoff) can plausibly succeed.</summary>
    public bool IsRetryable => Kind is ProviderErrorKind.RateLimited or ProviderErrorKind.Network;
}
