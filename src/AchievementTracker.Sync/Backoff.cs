namespace AchievementTracker.Sync;

/// <summary>
/// Sync engine building blocks (docs/SPEC.md §5). Planned for M1: a scheduler (one supervised
/// task per account), a diff engine that applies the baseline rule (the first sync of a game
/// emits no events), and a running-game detector (M2).
/// </summary>
public static class Backoff
{
    private const int MaxExponent = 16;

    /// <summary>Exponential backoff: <c>baseDelay * 2^attempt</c>, capped at <paramref name="max"/>. Callers add jitter.</summary>
    public static TimeSpan Delay(int attempt, TimeSpan baseDelay, TimeSpan max)
    {
        var exponent = Math.Clamp(attempt, 0, MaxExponent);
        var ticks = baseDelay.Ticks * Math.Pow(2, exponent);
        return TimeSpan.FromTicks((long)Math.Min(ticks, max.Ticks));
    }
}
