using AchievementTracker.Sync;

namespace AchievementTracker.Tests;

public class BackoffTests
{
    [Fact]
    public void Grows_exponentially_then_caps()
    {
        var baseDelay = TimeSpan.FromSeconds(5);
        var max = TimeSpan.FromSeconds(300);

        Assert.Equal(TimeSpan.FromSeconds(5), Backoff.Delay(0, baseDelay, max));
        Assert.Equal(TimeSpan.FromSeconds(10), Backoff.Delay(1, baseDelay, max));
        Assert.Equal(TimeSpan.FromSeconds(40), Backoff.Delay(3, baseDelay, max));
        Assert.Equal(max, Backoff.Delay(20, baseDelay, max));
    }
}
