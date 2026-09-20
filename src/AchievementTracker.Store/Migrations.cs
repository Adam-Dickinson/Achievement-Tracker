using System.Globalization;

namespace AchievementTracker.Store;

/// <summary>One forward-only schema change, loaded from an embedded <c>Migrations/NNNN_name.sql</c>.</summary>
public sealed record Migration(int Version, string Name, string Sql);

/// <summary>
/// All migrations, in order. Files are forward-only: never edit one that has shipped.
/// See the <c>db-migration</c> skill before changing the schema.
/// </summary>
public static class Migrations
{
    public static IReadOnlyList<Migration> All { get; } = Load();

    private static List<Migration> Load()
    {
        var assembly = typeof(Migrations).Assembly;
        var migrations = new List<Migration>();

        foreach (var resource in assembly.GetManifestResourceNames())
        {
            var marker = resource.LastIndexOf("Migrations.", StringComparison.Ordinal);
            if (marker < 0 || !resource.EndsWith(".sql", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var fileName = resource[(marker + "Migrations.".Length)..];
            var name = fileName[..^".sql".Length];
            var version = int.Parse(name[..4], CultureInfo.InvariantCulture);

            using var stream = assembly.GetManifestResourceStream(resource)!;
            using var reader = new StreamReader(stream);
            migrations.Add(new Migration(version, name, reader.ReadToEnd()));
        }

        return [.. migrations.OrderBy(m => m.Version)];
    }
}
