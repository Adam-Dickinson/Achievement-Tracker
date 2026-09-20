using AchievementTracker.Store;
using Microsoft.Data.Sqlite;

namespace AchievementTracker.Tests;

public class MigrationTests
{
    [Fact]
    public void Migrations_are_numbered_sequentially_from_one_and_non_empty()
    {
        var all = Migrations.All;

        Assert.NotEmpty(all);
        for (var i = 0; i < all.Count; i++)
        {
            Assert.Equal(i + 1, all[i].Version);
            Assert.StartsWith($"{i + 1:0000}_", all[i].Name, StringComparison.Ordinal);
            Assert.False(string.IsNullOrWhiteSpace(all[i].Sql));
        }
    }

    [Fact]
    public void Applying_to_an_empty_database_creates_the_schema()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();

        var version = MigrationRunner.Apply(connection);

        Assert.Equal(Migrations.All[^1].Version, version);
        var tables = Query(connection, "SELECT name FROM sqlite_master WHERE type = 'table'");
        foreach (var expected in new[] { "account", "game", "platform_game", "achievement", "unlock", "sync_state", "setting" })
        {
            Assert.Contains(expected, tables);
        }
    }

    [Fact]
    public void Applying_twice_is_a_no_op()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();

        var first = MigrationRunner.Apply(connection);
        var second = MigrationRunner.Apply(connection);

        Assert.Equal(first, second);
    }

    private static List<string> Query(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        using var reader = command.ExecuteReader();
        var rows = new List<string>();
        while (reader.Read())
        {
            rows.Add(reader.GetString(0));
        }

        return rows;
    }
}
