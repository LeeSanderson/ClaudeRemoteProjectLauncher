using System.Diagnostics;

namespace ClaudeLauncherTray;

/// <summary>
/// The launcher session and the terminal window it runs in: starting it,
/// showing and hiding that window, and stopping it again.
/// </summary>
/// <remarks>
/// <para>
/// The session is <c>Start-Launcher.ps1</c> running in a terminal, which is
/// what gives <c>claude --remote-control</c> the TTY it needs. A hidden window
/// still provides a full TTY, so the session runs perfectly well out of sight
/// and only needs to be shown when there is something to read or type — an
/// authentication prompt, or an error.
/// </para>
/// <para>
/// Both hosts are tracked the same way: snapshot the existing windows of the
/// host's window class, launch, then wait for the handle that appears. Windows
/// Terminal makes this the only workable approach — <c>wt.exe</c> hands the
/// request to the long-lived, shared <c>WindowsTerminal.exe</c> process and
/// exits immediately, so there is no child process to track and the new window
/// is the only thing that identifies the session.
/// </para>
/// </remarks>
internal sealed class LauncherSession : IDisposable
{
    private const string WindowsTerminalWindowClass = "CASCADIA_HOSTING_WINDOW_CLASS";
    private const string ConsoleWindowClass = "ConsoleWindowClass";

    private static readonly TimeSpan WindowAppearTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan WindowClosePatience = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan PollInterval = TimeSpan.FromMilliseconds(100);

    /// <summary>
    /// How long a freshly started session is held hidden against its host.
    /// Windows Terminal shows its window as part of its own startup, which can
    /// land after the window handle first becomes findable and would otherwise
    /// undo the initial hide.
    /// </summary>
    private static readonly TimeSpan HideSettlePeriod = TimeSpan.FromSeconds(3);

    private readonly LauncherOptions options;

    /// <summary>The conhost process, for <see cref="SessionHost.Console"/> only.</summary>
    private Process? hostedProcess;

    private IntPtr windowHandle = IntPtr.Zero;

    /// <summary>
    /// The visibility last asked for, so the settle period can stop enforcing
    /// hidden the moment the window is deliberately shown.
    /// </summary>
    private bool windowShouldBeShown;

    public LauncherSession(LauncherOptions options) => this.options = options;

    /// <summary>
    /// True while the session's window is still around. For the console host the
    /// hosting process is checked too, so a crashed host counts as stopped even
    /// if its window handle has not yet been reaped.
    /// </summary>
    public bool IsRunning =>
        windowHandle != IntPtr.Zero
        && NativeMethods.IsWindow(windowHandle)
        && (hostedProcess is null || !hostedProcess.HasExited);

    /// <summary>True when the session is running and its window is on screen.</summary>
    public bool IsWindowShown => IsRunning && NativeMethods.IsWindowVisible(windowHandle);

    private string WindowClass =>
        options.Host == SessionHost.WindowsTerminal ? WindowsTerminalWindowClass : ConsoleWindowClass;

    /// <summary>
    /// Checks everything the session needs before launching, returning a
    /// user-facing reason when something is missing, or null when all is well.
    /// </summary>
    public string? CheckPrerequisites()
    {
        if (!File.Exists(options.LauncherScriptPath))
        {
            return $"Start-Launcher.ps1 was not found at {options.LauncherScriptPath}. "
                + "Pass --repo with the path to the repository.";
        }

        if (ResolvePowerShell() is null)
        {
            return "Could not find PowerShell (pwsh.exe or powershell.exe) on PATH.";
        }

        // Mirrors the check in Start-Launcher.ps1 and getClaudeCommand() in
        // lib/launcher.js, so the same override works everywhere.
        var claudeCommand = Environment.GetEnvironmentVariable("CLAUDE_CLI_COMMAND") ?? "claude";

        if (Executables.Resolve(claudeCommand) is null)
        {
            return $"Could not find the Claude Code CLI ('{claudeCommand}'). "
                + "Install it, or set CLAUDE_CLI_COMMAND to its full path.";
        }

        if (options.Host == SessionHost.WindowsTerminal && Executables.Resolve("wt.exe") is null)
        {
            return "Windows Terminal (wt.exe) was not found. Start the tray with --conhost instead.";
        }

        if (options.Host == SessionHost.Console && Executables.Resolve("conhost.exe") is null)
        {
            return "conhost.exe was not found.";
        }

        return null;
    }

    /// <summary>
    /// Starts the session and waits for its window to appear, hiding it
    /// immediately unless <paramref name="showWindow"/> is set.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// The prerequisites are not met, or no window appeared in time.
    /// </exception>
    public async Task StartAsync(bool showWindow)
    {
        if (IsRunning)
        {
            return;
        }

        if (CheckPrerequisites() is { } problem)
        {
            throw new InvalidOperationException(problem);
        }

        Forget();

        var before = NativeMethods.FindWindowsByClass(WindowClass);

        if (options.Host == SessionHost.WindowsTerminal)
        {
            StartInWindowsTerminal();
        }
        else
        {
            StartInConsole();
        }

        windowHandle = await WaitForNewWindowAsync(before).ConfigureAwait(true);

        if (windowHandle == IntPtr.Zero)
        {
            Stop();

            throw new InvalidOperationException(
                "The launcher session did not open a terminal window. It may have exited immediately — "
                + "start the tray with --visible to watch it.");
        }

        if (showWindow)
        {
            ShowWindow();
        }
        else
        {
            HideWindow();
            await KeepHiddenWhileStartingAsync().ConfigureAwait(true);
        }
    }

    /// <summary>
    /// Holds a just-started session's window hidden for a short settle period,
    /// re-hiding it if its host shows it again, and stops as soon as the window
    /// is deliberately shown.
    /// </summary>
    private async Task KeepHiddenWhileStartingAsync()
    {
        var deadline = DateTime.UtcNow + HideSettlePeriod;

        while (DateTime.UtcNow < deadline && !windowShouldBeShown)
        {
            if (IsRunning && NativeMethods.IsWindowVisible(windowHandle))
            {
                NativeMethods.ShowWindow(windowHandle, NativeMethods.SW_HIDE);
            }

            await Task.Delay(PollInterval).ConfigureAwait(true);
        }
    }

    /// <summary>
    /// Brings the session window back on screen and focuses it.
    /// </summary>
    public void ShowWindow()
    {
        windowShouldBeShown = true;

        if (!IsRunning)
        {
            return;
        }

        // SW_RESTORE, not SW_SHOW: a console window created hidden ignores
        // SW_SHOW entirely. SW_RESTORE also un-minimises, so it is the only
        // command needed to get the window back in front of the user.
        NativeMethods.ShowWindow(windowHandle, NativeMethods.SW_RESTORE);
        NativeMethods.SetForegroundWindow(windowHandle);
    }

    /// <summary>
    /// Hides the session window. The session keeps running with a full TTY.
    /// </summary>
    public void HideWindow()
    {
        windowShouldBeShown = false;

        if (IsRunning)
        {
            NativeMethods.ShowWindow(windowHandle, NativeMethods.SW_HIDE);
        }
    }

    /// <summary>
    /// Closes the session window, ending the session.
    /// </summary>
    /// <remarks>
    /// The window is asked to close first so PowerShell and Claude Code can shut
    /// down normally; the console host is killed only if it outlives that.
    /// </remarks>
    public async Task StopAsync()
    {
        if (windowHandle != IntPtr.Zero && NativeMethods.IsWindow(windowHandle))
        {
            NativeMethods.PostMessage(windowHandle, NativeMethods.WM_CLOSE, IntPtr.Zero, IntPtr.Zero);

            var deadline = DateTime.UtcNow + WindowClosePatience;

            while (DateTime.UtcNow < deadline && NativeMethods.IsWindow(windowHandle))
            {
                // Deliberately off the UI thread: the tray menu must stay
                // responsive while a session takes its time shutting down.
                await Task.Delay(PollInterval).ConfigureAwait(false);
            }
        }

        if (hostedProcess is { HasExited: false })
        {
            try
            {
                hostedProcess.Kill(entireProcessTree: true);
            }
            catch (Exception)
            {
                // Already gone, or exiting as we asked — nothing useful to do.
            }
        }

        Forget();
    }

    /// <summary>
    /// Blocking form of <see cref="StopAsync"/>, for the application exit path.
    /// Safe to block on because <see cref="StopAsync"/> never resumes on the UI
    /// thread.
    /// </summary>
    public void Stop() => StopAsync().GetAwaiter().GetResult();

    public void Dispose() => Forget();

    /// <summary>
    /// Launches the session in a new Windows Terminal window.
    /// </summary>
    /// <remarks>
    /// <c>-w -1</c> forces a brand new window rather than a tab in an existing
    /// one, which both keeps the session separate from the user's own terminals
    /// and makes the new-window search unambiguous. The argument list is kept
    /// free of semicolons, which Windows Terminal would otherwise read as its
    /// own "start another tab" separator.
    /// </remarks>
    private void StartInWindowsTerminal()
    {
        var start = new ProcessStartInfo(Executables.Resolve("wt.exe")!)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = options.RepositoryRoot,
        };

        start.ArgumentList.Add("-w");
        start.ArgumentList.Add("-1");
        start.ArgumentList.Add("new-tab");
        start.ArgumentList.Add("--title");
        start.ArgumentList.Add($"Claude {options.SessionName}");
        start.ArgumentList.Add("-d");
        start.ArgumentList.Add(options.RepositoryRoot);

        foreach (var argument in PowerShellCommandLine())
        {
            start.ArgumentList.Add(argument);
        }

        // wt.exe hands off to the shared WindowsTerminal.exe process and exits,
        // so this process is deliberately not retained.
        using var launcher = Process.Start(start);
    }

    /// <summary>
    /// Launches the session under an explicitly started <c>conhost.exe</c>.
    /// </summary>
    /// <remarks>
    /// conhost is named explicitly rather than left to Windows, because Windows
    /// 11 delegates consoles to Windows Terminal by default — which would leave
    /// the visible window owned by <c>WindowsTerminal.exe</c> and our child
    /// holding nothing but an invisible <c>PseudoConsoleWindow</c> stub.
    ///
    /// The window is always created hidden and only then shown, so this host
    /// never flashes a window on screen at logon.
    /// </remarks>
    private void StartInConsole()
    {
        var start = new ProcessStartInfo(Executables.Resolve("conhost.exe")!)
        {
            UseShellExecute = false,
            WindowStyle = ProcessWindowStyle.Hidden,
            WorkingDirectory = options.RepositoryRoot,
        };

        foreach (var argument in PowerShellCommandLine())
        {
            start.ArgumentList.Add(argument);
        }

        hostedProcess = Process.Start(start);
    }

    /// <summary>
    /// The PowerShell invocation of Start-Launcher.ps1, as an argument list.
    /// </summary>
    private IEnumerable<string> PowerShellCommandLine()
    {
        yield return ResolvePowerShell()!;
        yield return "-NoLogo";
        yield return "-NoProfile";
        // The script is unsigned and may sit in a directory the machine policy
        // distrusts; bypassing for this one invocation keeps the tray working
        // without changing the user's execution policy.
        yield return "-ExecutionPolicy";
        yield return "Bypass";
        yield return "-File";
        yield return options.LauncherScriptPath;
        yield return "-SessionName";
        yield return options.SessionName;
    }

    private static string? ResolvePowerShell() => Executables.ResolveFirst("pwsh.exe", "powershell.exe");

    /// <summary>
    /// Waits for a window of the host's class that was not already open, and
    /// returns its handle — or <see cref="IntPtr.Zero"/> if none appears in time
    /// or the console host dies first.
    /// </summary>
    private async Task<IntPtr> WaitForNewWindowAsync(HashSet<IntPtr> before)
    {
        var deadline = DateTime.UtcNow + WindowAppearTimeout;

        while (DateTime.UtcNow < deadline)
        {
            foreach (var window in NativeMethods.FindWindowsByClass(WindowClass))
            {
                if (!before.Contains(window))
                {
                    return window;
                }
            }

            // No point waiting out the timeout if the host has already given up.
            if (hostedProcess is { HasExited: true })
            {
                return IntPtr.Zero;
            }

            await Task.Delay(PollInterval).ConfigureAwait(true);
        }

        return IntPtr.Zero;
    }

    private void Forget()
    {
        hostedProcess?.Dispose();
        hostedProcess = null;
        windowHandle = IntPtr.Zero;
    }
}
