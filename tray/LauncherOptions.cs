namespace ClaudeLauncherTray;

/// <summary>
/// Which terminal hosts the launcher session.
/// </summary>
internal enum SessionHost
{
    /// <summary>
    /// Windows Terminal, in a new window of its own. Renders Claude Code's TUI
    /// properly (fonts, emoji, box drawing, scrollback), at the cost of the
    /// window belonging to the shared <c>WindowsTerminal.exe</c> process, so it
    /// is tracked by window handle rather than by process.
    /// </summary>
    WindowsTerminal,

    /// <summary>
    /// A classic console window hosted by an explicitly launched
    /// <c>conhost.exe</c>. Renders the TUI less well, but the session belongs to
    /// our own process tree and never flashes on screen when started hidden.
    /// Used automatically when Windows Terminal is not installed.
    /// </summary>
    Console,
}

/// <summary>
/// Command line options for the tray application.
/// </summary>
internal sealed class LauncherOptions
{
    /// <summary>Repository root, i.e. the directory holding Start-Launcher.ps1.</summary>
    public string RepositoryRoot { get; init; } = string.Empty;

    /// <summary>Remote Control session name passed through to Start-Launcher.ps1.</summary>
    public string SessionName { get; init; } = "Launcher";

    /// <summary>Terminal to host the session in.</summary>
    public SessionHost Host { get; init; } = SessionHost.WindowsTerminal;

    /// <summary>Start the session when the tray application starts.</summary>
    public bool StartSession { get; init; } = true;

    /// <summary>Leave the session window on screen instead of hiding it at startup.</summary>
    public bool StartVisible { get; init; }

    /// <summary>Restart the session automatically when its window disappears.</summary>
    public bool AutoRestart { get; init; }

    public string LauncherScriptPath => Path.Combine(RepositoryRoot, "Start-Launcher.ps1");

    /// <summary>
    /// Parses the command line, falling back to a repository root discovered by
    /// walking up from the executable's own directory.
    /// </summary>
    /// <exception cref="ArgumentException">An option was unknown or missing its value.</exception>
    public static LauncherOptions Parse(string[] args)
    {
        string? repositoryRoot = null;
        var sessionName = "Launcher";
        SessionHost? host = null;
        var startSession = true;
        var startVisible = false;
        var autoRestart = false;

        for (var i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--repo":
                case "--repository":
                    repositoryRoot = ValueFor(args, ref i);
                    break;

                case "--session-name":
                    sessionName = ValueFor(args, ref i);
                    break;

                case "--conhost":
                    host = SessionHost.Console;
                    break;

                case "--windows-terminal":
                    host = SessionHost.WindowsTerminal;
                    break;

                case "--visible":
                    startVisible = true;
                    break;

                case "--no-start":
                    startSession = false;
                    break;

                case "--auto-restart":
                    autoRestart = true;
                    break;

                default:
                    throw new ArgumentException($"Unknown option \"{args[i]}\".");
            }
        }

        repositoryRoot = repositoryRoot is null
            ? DiscoverRepositoryRoot()
            : Path.GetFullPath(repositoryRoot);

        // Windows Terminal is preferred, but falling back keeps the tray usable
        // on machines without it rather than failing at launch time.
        host ??= Executables.Resolve("wt.exe") is not null
            ? SessionHost.WindowsTerminal
            : SessionHost.Console;

        return new LauncherOptions
        {
            RepositoryRoot = repositoryRoot,
            SessionName = sessionName,
            Host = host.Value,
            StartSession = startSession,
            StartVisible = startVisible,
            AutoRestart = autoRestart,
        };
    }

    private static string ValueFor(string[] args, ref int index)
    {
        if (index + 1 >= args.Length)
        {
            throw new ArgumentException($"Option \"{args[index]}\" needs a value.");
        }

        return args[++index];
    }

    /// <summary>
    /// Walks up from the executable's directory looking for Start-Launcher.ps1,
    /// so the tray works whether it is run from <c>tray/bin/...</c> during
    /// development or from a published folder inside the repository.
    /// </summary>
    private static string DiscoverRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "Start-Launcher.ps1")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        // Reported as a missing script by the pre-flight check, which can name
        // the path it looked for.
        return AppContext.BaseDirectory;
    }
}
