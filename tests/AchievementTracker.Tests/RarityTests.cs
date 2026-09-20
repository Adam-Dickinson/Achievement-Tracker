using AchievementTracker.Core;

namespace AchievementTracker.Tests;

public class RarityTests
{
    [Theory]
    [InlineData(1.4, Rarity.UltraRare)]
    [InlineData(2.0, Rarity.Rare)]
    [InlineData(9.99, Rarity.Rare)]
    [InlineData(10.0, Rarity.Uncommon)]
    [InlineData(30.0, Rarity.Uncommon)]
    [InlineData(42.0, Rarity.Common)]
    public void FromPercent_matches_the_design_thresholds(double percent, Rarity expected)
    {
        Assert.Equal(expected, RarityExtensions.FromPercent(percent));
    }
}
