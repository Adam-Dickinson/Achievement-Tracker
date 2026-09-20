using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace AchievementTracker.App.Services;

/// <summary>
/// Makes the overlay window click-through and non-activating so it never steals focus from a
/// game. Only touches the overlay's own window styles: nothing is injected into other processes.
/// </summary>
[SupportedOSPlatform("windows")]
internal static partial class WindowsOverlayStyles
{
    private const int GwlExStyle = -20;
    private const nint WsExTransparent = 0x00000020; // mouse events fall through to the window below
    private const nint WsExToolWindow = 0x00000080; // hidden from Alt+Tab
    private const nint WsExNoActivate = 0x08000000; // never becomes the foreground window

    public static void Apply(nint hwnd)
    {
        var style = GetWindowLongPtr(hwnd, GwlExStyle);
        SetWindowLongPtr(hwnd, GwlExStyle, style | WsExTransparent | WsExToolWindow | WsExNoActivate);
    }

    [LibraryImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    private static partial nint GetWindowLongPtr(nint hWnd, int nIndex);

    [LibraryImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
    private static partial nint SetWindowLongPtr(nint hWnd, int nIndex, nint dwNewLong);
}
