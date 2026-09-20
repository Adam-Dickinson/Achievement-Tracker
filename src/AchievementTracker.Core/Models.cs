namespace AchievementTracker.Core;

// Normalized DTOs returned by providers. Providers know nothing about SQLite.

/// <summary>What a provider needs to talk to the platform for one account.</summary>
/// <param name="ExternalId">Platform-side identifier (steamid64, xuid, RA username, ...).</param>
public sealed record AccountCredentials(Platform Platform, string ExternalId, Secret? Secret);

public sealed record AccountInfo(string ExternalId, string DisplayName);

/// <summary>Identifies a game on a platform (appid, titleId, NPWR id, RA game id, ...).</summary>
public sealed record RemoteGameRef(string ExternalId);

public sealed record RemoteGame(
    RemoteGameRef Reference,
    string Title,
    string? IconUrl,
    DateTimeOffset? LastPlayed);

public sealed record RemoteAchievement(
    string ExternalId,
    string Name,
    string? Description,
    string? IconUrl,
    string? IconLockedUrl,
    bool Hidden,
    int? Points,
    string? Tier,
    double? GlobalPercent);

public sealed record RemoteUnlock(
    string AchievementExternalId,
    DateTimeOffset? UnlockedAt,
    (int Current, int Max)? Progress);

/// <summary>Full schema plus the account's unlock state for one game.</summary>
public sealed record RemoteGameAchievements(
    IReadOnlyList<RemoteAchievement> Achievements,
    IReadOnlyList<RemoteUnlock> Unlocks);

/// <summary>Emitted by the sync engine after a new unlock is committed to the store.</summary>
public sealed record UnlockEvent(
    Platform Platform,
    string GameTitle,
    RemoteAchievement Achievement,
    DateTimeOffset DetectedAt);
