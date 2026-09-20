namespace AchievementTracker.Core;

/// <summary>
/// A token or API key. <see cref="ToString"/> is redacted so a secret can't leak into logs
/// through string interpolation or a record's generated ToString.
/// </summary>
public sealed class Secret(string value)
{
    public string Expose() => value;

    public override string ToString() => "Secret(<redacted>)";
}
