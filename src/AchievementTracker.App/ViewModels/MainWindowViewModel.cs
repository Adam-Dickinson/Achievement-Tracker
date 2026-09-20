using AchievementTracker.App.Services;
using AchievementTracker.Core;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace AchievementTracker.App.ViewModels;

public sealed partial class MainWindowViewModel : ObservableObject
{
    private static readonly ToastViewModel[] SampleToasts =
    [
        new(Rarity.UltraRare, "Lord of Frenzied Flame", "Achieve the Lord of Frenzied Flame ending", "Elden Ring", "Steam", 1.4),
        new(Rarity.Rare, "Platinum Trophy", "Earn all other trophies", "God of War", "PlayStation", 2.8),
        new(Rarity.Uncommon, "Fleet Footed", "Win a race using only the starter car", "Forza Horizon 5", "Xbox", 18.5),
        new(Rarity.Common, "Welcome Aboard", "Complete the tutorial", "Hades", "Steam", 42.0),
    ];

    private readonly OverlayService _overlay;
    private int _nextSample;

    public MainWindowViewModel(OverlayService overlay)
    {
        _overlay = overlay;
        NavItems =
        [
            new("Dashboard", "Overall progress, recent unlocks, closest to 100%."),
            new("Library", "Every game across every platform."),
            new("Activity", "A timeline of everything you have unlocked."),
            new("Accounts", "Connect Steam, Xbox, PlayStation and emulators."),
            new("Settings", "Notifications, sync, startup and appearance."),
        ];
        _selectedNav = NavItems[0];
    }

    public IReadOnlyList<NavItem> NavItems { get; }

    [ObservableProperty]
    private NavItem _selectedNav;

    [ObservableProperty]
    private string _syncStatus = "Not synced yet";

    /// <summary>Shows the next sample unlock toast (cycles through the rarity tiers).</summary>
    [RelayCommand]
    private void SendTestNotification()
    {
        var toast = SampleToasts[_nextSample % SampleToasts.Length];
        _nextSample++;
        _overlay.Show(toast, TimeSpan.FromSeconds(5));
    }
}
