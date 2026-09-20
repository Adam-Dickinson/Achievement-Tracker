using AchievementTracker.Core;

namespace AchievementTracker.Tests;

public class SecretTests
{
    [Fact]
    public void ToString_is_redacted()
    {
        var secret = new Secret("super-secret-token");

        Assert.DoesNotContain("super-secret-token", secret.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void Records_containing_a_secret_do_not_leak_it()
    {
        var creds = new AccountCredentials(Platform.Steam, "123", new Secret("super-secret-token"));

        Assert.DoesNotContain("super-secret-token", creds.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void InMemorySecretStore_round_trips()
    {
        var store = new InMemorySecretStore();
        Assert.Null(store.Find("a"));

        store.Save("a", new Secret("v"));
        Assert.Equal("v", store.Find("a")!.Expose());

        store.Delete("a");
        Assert.Null(store.Find("a"));
    }
}
