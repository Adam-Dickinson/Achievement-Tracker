using System.Collections.Concurrent;

namespace AchievementTracker.Core;

/// <summary>
/// Where tokens and API keys live. Production will use the Windows Credential Manager
/// (added in M1); tests use <see cref="InMemorySecretStore"/>. Secrets must never be written
/// to SQLite, config files or logs.
/// </summary>
public interface ISecretStore
{
    Secret? Find(string key);

    void Save(string key, Secret value);

    void Delete(string key);
}

public sealed class InMemorySecretStore : ISecretStore
{
    private readonly ConcurrentDictionary<string, Secret> _items = new();

    public Secret? Find(string key) => _items.GetValueOrDefault(key);

    public void Save(string key, Secret value) => _items[key] = value;

    public void Delete(string key) => _items.TryRemove(key, out _);
}
