using AchievementTracker.Core;

namespace AchievementTracker.Tests;

public class PlatformTests
{
    public static TheoryData<Platform> AllPlatforms => [.. Enum.GetValues<Platform>()];

    [Fact]
    public void Ids_are_unique()
    {
        var ids = Enum.GetValues<Platform>().Select(p => p.Id()).ToList();

        Assert.Equal(ids.Count, ids.Distinct().Count());
    }

    [Theory]
    [MemberData(nameof(AllPlatforms))]
    public void Every_platform_has_an_id_and_display_name(Platform platform)
    {
        Assert.False(string.IsNullOrWhiteSpace(platform.Id()));
        Assert.False(string.IsNullOrWhiteSpace(platform.DisplayName()));
    }

    [Fact]
    public void Official_apis_are_not_flagged_unofficial()
    {
        Assert.False(Platform.Steam.IsUnofficial());
        Assert.False(Platform.RetroAchievements.IsUnofficial());
        Assert.True(Platform.PlayStation.IsUnofficial());
    }
}
