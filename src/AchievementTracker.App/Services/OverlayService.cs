using AchievementTracker.App.ViewModels;
using AchievementTracker.App.Views;
using Avalonia;
using Avalonia.Threading;

namespace AchievementTracker.App.Services;

/// <summary>
/// Shows unlock toasts in a transparent, always-on-top, click-through window.
/// Design: docs/DESIGN.md §6. M1 adds the queue, stacking and burst collapsing; for now a new
/// toast simply replaces the current one.
/// </summary>
public sealed class OverlayService
{
    private const int ScreenMargin = 16;

    private readonly DispatcherTimer _hideTimer = new();
    private OverlayWindow? _window;

    public OverlayService() => _hideTimer.Tick += OnHideTimerTick;

    /// <summary>Safe to call from any thread.</summary>
    public void Show(ToastViewModel toast, TimeSpan duration) =>
        Dispatcher.UIThread.Post(() => ShowCore(toast, duration));

    private void ShowCore(ToastViewModel toast, TimeSpan duration)
    {
        _hideTimer.Stop();

        _window ??= new OverlayWindow();
        _window.DataContext = toast;
        PositionBottomRight(_window);

        if (!_window.IsVisible)
        {
            _window.Show();
        }

        if (OperatingSystem.IsWindows() && _window.TryGetPlatformHandle() is { } handle)
        {
            WindowsOverlayStyles.Apply(handle.Handle);
        }

        _hideTimer.Interval = duration;
        _hideTimer.Start();
    }

    private void OnHideTimerTick(object? sender, EventArgs e)
    {
        _hideTimer.Stop();
        _window?.Hide();
    }

    private static void PositionBottomRight(OverlayWindow window)
    {
        var screen = window.Screens.Primary;
        if (screen is null)
        {
            return;
        }

        var area = screen.WorkingArea;
        var width = (int)(window.Width * screen.Scaling);
        var height = (int)(window.Height * screen.Scaling);
        var margin = (int)(ScreenMargin * screen.Scaling);

        window.Position = new PixelPoint(area.Right - width - margin, area.Bottom - height - margin);
    }
}
