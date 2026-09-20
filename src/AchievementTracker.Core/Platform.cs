namespace AchievementTracker.Core;

/// <summary>Every source achievements can come from. Keep in sync with docs/SPEC.md §3.</summary>
public enum Platform
{
    Steam,
    Xbox,
    PlayStation,
    Epic,
    Ubisoft,
    Ea,
    RetroAchievements,
    Rpcs3,
    Xenia,
    LocalFile,
}

public static class PlatformExtensions
{
    /// <summary>Stable identifier used in the database and settings.</summary>
    public static string Id(this Platform platform) => platform switch
    {
        Platform.Steam => "steam",
        Platform.Xbox => "xbox",
        Platform.PlayStation => "playstation",
        Platform.Epic => "epic",
        Platform.Ubisoft => "ubisoft",
        Platform.Ea => "ea",
        Platform.RetroAchievements => "retroachievements",
        Platform.Rpcs3 => "rpcs3",
        Platform.Xenia => "xenia",
        Platform.LocalFile => "local_file",
        _ => throw new ArgumentOutOfRangeException(nameof(platform), platform, null),
    };

    public static string DisplayName(this Platform platform) => platform switch
    {
        Platform.Steam => "Steam",
        Platform.Xbox => "Xbox",
        Platform.PlayStation => "PlayStation",
        Platform.Epic => "Epic Games",
        Platform.Ubisoft => "Ubisoft Connect",
        Platform.Ea => "EA app",
        Platform.RetroAchievements => "RetroAchievements",
        Platform.Rpcs3 => "RPCS3",
        Platform.Xenia => "Xenia",
        Platform.LocalFile => "Local file",
        _ => throw new ArgumentOutOfRangeException(nameof(platform), platform, null),
    };

    /// <summary>Unofficial integrations are opt-in and labelled in the UI (docs/PROVIDERS.md).</summary>
    public static bool IsUnofficial(this Platform platform) =>
        platform is Platform.Xbox
            or Platform.PlayStation
            or Platform.Epic
            or Platform.Ubisoft
            or Platform.Ea;
}
