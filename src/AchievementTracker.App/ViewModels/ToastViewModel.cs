using AchievementTracker.Core;

namespace AchievementTracker.App.ViewModels;

/// <summary>Data for one unlock toast. Spec: .superdesign/design-system.md ("Unlock toast").</summary>
public sealed class ToastViewModel(
    Rarity rarity,
    string title,
    string description,
    string game,
    string platform,
    double percent)
{
    public Rarity Rarity { get; } = rarity;

    public string Title { get; } = title;

    public string Description { get; } = description;

    public string Subtitle { get; } = $"{game} · {platform}";

    public string RarityLabel { get; } = rarity.Label();

    public string PercentText { get; } = $"{percent:0.#}%";

    // One flag per tier, so the view can pick its accent colours with style classes.
    public bool IsCommon => Rarity == Rarity.Common;

    public bool IsUncommon => Rarity == Rarity.Uncommon;

    public bool IsRare => Rarity == Rarity.Rare;

    public bool IsUltraRare => Rarity == Rarity.UltraRare;
}
