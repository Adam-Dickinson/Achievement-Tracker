using AchievementTracker.App.Services;
using AchievementTracker.App.ViewModels;
using AchievementTracker.App.Views;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;

namespace AchievementTracker.App;

public sealed class App : Application
{
    private IClassicDesktopStyleApplicationLifetime? _desktop;
    private MainWindow? _mainWindow;
    private MainWindowViewModel? _mainViewModel;
    private bool _quitting;

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            _desktop = desktop;

            // Closing the main window hides it; the app keeps running in the tray.
            desktop.ShutdownMode = ShutdownMode.OnExplicitShutdown;

            _mainViewModel = new MainWindowViewModel(new OverlayService());
            _mainWindow = new MainWindow { DataContext = _mainViewModel };
            _mainWindow.Closing += OnMainWindowClosing;
            desktop.MainWindow = _mainWindow;
        }

        base.OnFrameworkInitializationCompleted();
    }

    private void OnMainWindowClosing(object? sender, WindowClosingEventArgs e)
    {
        if (_quitting)
        {
            return;
        }

        e.Cancel = true;
        _mainWindow?.Hide();
    }

    private void ShowMainWindow()
    {
        if (_mainWindow is null)
        {
            return;
        }

        _mainWindow.Show();
        if (_mainWindow.WindowState == WindowState.Minimized)
        {
            _mainWindow.WindowState = WindowState.Normal;
        }

        _mainWindow.Activate();
    }

    private void OnTrayClicked(object? sender, EventArgs e) => ShowMainWindow();

    private void OnOpenClicked(object? sender, EventArgs e) => ShowMainWindow();

    private void OnTestNotificationClicked(object? sender, EventArgs e) =>
        _mainViewModel?.SendTestNotificationCommand.Execute(null);

    private void OnQuitClicked(object? sender, EventArgs e)
    {
        _quitting = true;
        _desktop?.Shutdown();
    }
}
