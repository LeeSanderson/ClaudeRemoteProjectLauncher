using System.Runtime.InteropServices;
using System.Text;

namespace ClaudeLauncherTray;

/// <summary>
/// The user32 entry points used to find, show and hide the terminal window the
/// launcher session runs in.
/// </summary>
/// <remarks>
/// Two Win32 details drive the design here, both of which are easy to get wrong:
///
/// 1. <c>SW_SHOW</c> does not work on a console window that was created hidden.
///    The call succeeds but the window stays invisible. <c>SW_RESTORE</c> does
///    work, and also handles the minimised case, so it is the only "make this
///    visible" command used.
///
/// 2. <see cref="ShowWindow"/> returns the window's *previous* visibility, not
///    whether the call succeeded. A <c>false</c> return simply means the window
///    was already hidden, so the result is never worth testing.
/// </remarks>
internal static class NativeMethods
{
    internal const int SW_HIDE = 0;
    internal const int SW_RESTORE = 9;

    internal const uint WM_CLOSE = 0x0010;

    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr window, StringBuilder buffer, int capacity);

    [DllImport("user32.dll")]
    internal static extern bool IsWindow(IntPtr window);

    [DllImport("user32.dll")]
    internal static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    internal static extern bool ShowWindow(IntPtr window, int command);

    [DllImport("user32.dll")]
    internal static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    internal static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    /// <summary>
    /// Frees an icon handle obtained from <see cref="System.Drawing.Bitmap.GetHicon"/>,
    /// which <see cref="System.Drawing.Icon.FromHandle"/> does not own and will
    /// not release.
    /// </summary>
    [DllImport("user32.dll")]
    internal static extern bool DestroyIcon(IntPtr icon);

    /// <summary>
    /// Returns the handles of every top-level window of the given class,
    /// including hidden ones.
    /// </summary>
    /// <remarks>
    /// Hidden windows are the whole point: <see cref="System.Diagnostics.Process.MainWindowHandle"/>
    /// only ever reports *visible* windows, so it returns zero for a session
    /// started hidden and cannot be used to find the window again.
    /// </remarks>
    internal static HashSet<IntPtr> FindWindowsByClass(string className)
    {
        var matches = new HashSet<IntPtr>();
        var buffer = new StringBuilder(256);

        EnumWindows(
            (window, _) =>
            {
                buffer.Clear();

                if (GetClassName(window, buffer, buffer.Capacity) > 0
                    && string.Equals(buffer.ToString(), className, StringComparison.Ordinal))
                {
                    matches.Add(window);
                }

                return true;
            },
            IntPtr.Zero);

        return matches;
    }
}
