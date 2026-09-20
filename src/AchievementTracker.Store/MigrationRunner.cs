using Microsoft.Data.Sqlite;

namespace AchievementTracker.Store;

/// <summary>Applies pending migrations, tracking progress in SQLite's <c>user_version</c> pragma.</summary>
public static class MigrationRunner
{
    /// <summary>Applies every migration newer than the database's version and returns the new version.</summary>
    public static int Apply(SqliteConnection connection)
    {
        var current = GetVersion(connection);

        foreach (var migration in Migrations.All.Where(m => m.Version > current))
        {
            using var transaction = connection.BeginTransaction();
            Execute(connection, transaction, migration.Sql);
            Execute(connection, transaction, $"PRAGMA user_version = {migration.Version}");
            transaction.Commit();
        }

        return GetVersion(connection);
    }

    public static int GetVersion(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA user_version";
        return Convert.ToInt32(command.ExecuteScalar(), System.Globalization.CultureInfo.InvariantCulture);
    }

    private static void Execute(SqliteConnection connection, SqliteTransaction transaction, string sql)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
#pragma warning disable CA2100 // Migration SQL comes from embedded resources we ship, never from user input.
        command.CommandText = sql;
#pragma warning restore CA2100
        command.ExecuteNonQuery();
    }
}
