using System.Security.Cryptography;
using System.Text;

namespace ClaudeLauncherTray;

/// <summary>
/// Entry point for the tray application.
/// </summary>
internal static class Program
{
    private const string UsageText = """
        Runs the Claude Remote Project Launcher session from the notification area.

          --repo <path>        Repository holding Start-Launcher.ps1.
                               Defaults to the first one found above this executable.
          --session-name <name>  Remote Control session name. Defaults to "Launcher".
          --windows-terminal   Host the session in a new Windows Terminal window (default
                               when wt.exe is installed).
          --conhost            Host the session in a classic console window instead.
                               Renders the TUI less well, but never flashes on screen.
          --visible            Leave the session window on screen at startup.
          --no-start           Start the tray without starting a session.
          --auto-restart       Restart the session if its window disappears.
          --help               Show this message.
        """;

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Contains("--help") || args.Contains("-h") || args.Contains("/?"))
        {
            Show(UsageText, "Claude launcher tray", MessageBoxIcon.Information);
            return 0;
        }

        LauncherOptions options;

        try
        {
            options = LauncherOptions.Parse(args);
        }
        catch (ArgumentException error)
        {
            Show($"{error.Message}\n\n{UsageText}", "Claude launcher tray", MessageBoxIcon.Error);
            return 2;
        }

        // One tray icon per repository: a second icon for the same launcher
        // would fight the first over the same session window.
        using var singleInstance = new Mutex(
            initiallyOwned: true,
            name: SingleInstanceName(options.RepositoryRoot),
            createdNew: out var isOnlyInstance);

        if (!isOnlyInstance)
        {
            Show(
                $"A launcher tray for {options.RepositoryRoot} is already running.\n\n"
                    + "Look for its icon in the notification area.",
                "Claude launcher tray",
                MessageBoxIcon.Information);

            return 1;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.Run(new TrayApplication(options));

        return 0;
    }

    /// <summary>
    /// A per-user, per-repository mutex name. The repository path is hashed
    /// because it may contain backslashes, which are not allowed in a mutex name.
    /// </summary>
    private static string SingleInstanceName(string repositoryRoot)
    {
        var bytes = Encoding.UTF8.GetBytes(repositoryRoot.ToLowerInvariant());
        var hash = Convert.ToHexString(SHA256.HashData(bytes));

        return $"Local\\ClaudeLauncherTray-{hash[..16]}";
    }

    private static void Show(string message, string caption, MessageBoxIcon icon) =>
        MessageBox.Show(message, caption, MessageBoxButtons.OK, icon);
}
