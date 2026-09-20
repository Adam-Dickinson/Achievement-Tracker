using AchievementTracker.Core;

namespace AchievementTracker.Tests;

public class ProviderExceptionTests
{
    [Theory]
    [InlineData(ProviderErrorKind.Network, true)]
    [InlineData(ProviderErrorKind.RateLimited, true)]
    [InlineData(ProviderErrorKind.AuthExpired, false)]
    [InlineData(ProviderErrorKind.Parse, false)]
    [InlineData(ProviderErrorKind.Unsupported, false)]
    public void IsRetryable_classifies_by_kind(ProviderErrorKind kind, bool expected)
    {
        Assert.Equal(expected, new ProviderException(kind, "x").IsRetryable);
    }
}
