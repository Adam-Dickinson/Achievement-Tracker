namespace AchievementTracker.Core;

/// <summary>Rarity tier derived from the global unlock percentage (docs/DESIGN.md §6).</summary>
public enum Rarity
{
    Common,
    Uncommon,
    Rare,
    UltraRare,
}

public static class RarityExtensions
{
    /// <summary>Maps the share of players (0-100) who unlocked an achievement to a tier.</summary>
    public static Rarity FromPercent(double percent) => percent switch
    {
        < 2 => Rarity.UltraRare,
        < 10 => Rarity.Rare,
        <= 30 => Rarity.Uncommon,
        _ => Rarity.Common,
    };

    public static string Label(this Rarity rarity) => rarity switch
    {
        Rarity.Common => "Common",
        Rarity.Uncommon => "Uncommon",
        Rarity.Rare => "Rare",
        Rarity.UltraRare => "Ultra Rare",
        _ => throw new ArgumentOutOfRangeException(nameof(rarity), rarity, null),
    };
}
