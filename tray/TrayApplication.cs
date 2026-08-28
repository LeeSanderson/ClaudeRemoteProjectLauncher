using System.Diagnostics;

namespace ClaudeLauncherTray;

/// <summary>
/// The tray icon itself: its menu, its status polling, and the actions it
/// offers over the launcher session.
/// </summary>
internal sealed class TrayApplication : ApplicationContext
{
    /// <summary>
    /// How often the session's window is checked. Frequent enough that the menu
    /// is never meaningfully out of date, cheap enough to ignore — one
    /// EnumWindows-free handle check per tick.
    /// </summary>
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(1);

    /// <summary>
    /// Consecutive automatic restarts allowed before giving up, so a session
    /// that fails instantly cannot spin forever.
    /// </summary>
    private const int MaxConsecutiveRestarts = 3;

    /// <summary>
    /// How long a session has to survive before its restart counts as having
    /// worked. Without this, a session that opens a window and then dies would
    /// reset the counter on every attempt and restart forever.
    /// </summary>
    private static readonly TimeSpan RestartConsideredSuccessfulAfter = TimeSpan.FromMinutes(1);

    private readonly LauncherOptions options;
    private readonly LauncherSession session;
    private readonly TrayIcons icons;
    private readonly NotifyIcon notifyIcon;
    private readonly System.Windows.Forms.Timer pollTimer;

    private readonly ToolStripMenuItem statusItem;
    private readonly ToolStripMenuItem showItem;
    private readonly ToolStripMenuItem hideItem;
    private readonly ToolStripMenuItem startItem;
    private readonly ToolStripMenuItem restartItem;
    private readonly ToolStripMenuItem stopItem;
    private readonly ToolStripMenuItem autoRestartItem;

    /// <summary>Set while an action is in flight, to keep the menu from re-entering it.</summary>
    private bool busy;

    /// <summary>Set while the session is being stopped on purpose, so the poll does not treat it as a crash.</summary>
    private bool stopping;

    private bool sessionWasRunning;
    private int consecutiveRestarts;
    private DateTime sessionStartedUtc = DateTime.MinValue;

    public TrayApplication(LauncherOptions options)
    {
        this.options = options;

        session = new LauncherSession(options);
        icons = new TrayIcons();

        statusItem = new ToolStripMenuItem("Launcher") { Enabled = false };
        showItem = new ToolStripMenuItem("&Show window", null, (_, _) => ShowWindow());
        hideItem = new ToolStripMenuItem("&Hide window", null, (_, _) => session.HideWindow());
        startItem = new ToolStripMenuItem("S&tart session", null, async (_, _) => await StartSessionAsync(showWindow: true));
        restartItem = new ToolStripMenuItem("&Restart session", null, async (_, _) => await RestartSessionAsync());
        stopItem = new ToolStripMenuItem("Sto&p session", null, async (_, _) => await StopSessionAsync());

        autoRestartItem = new ToolStripMenuItem("Restart &automatically")
        {
            CheckOnClick = true,
            Checked = options.AutoRestart,
        };

        // The default action for a double-click, and shown bold to say so.
        showItem.Font = new Font(showItem.Font, FontStyle.Bold);

        var menu = new ContextMenuStrip();
        menu.Items.AddRange(new ToolStripItem[]
        {
            statusItem,
            new ToolStripSeparator(),
            showItem,
            hideItem,
            new ToolStripSeparator(),
            startItem,
            restartItem,
            stopItem,
            new ToolStripSeparator(),
            autoRestartItem,
            new ToolStripMenuItem("&Open repository folder", null, (_, _) => OpenRepositoryFolder()),
            new ToolStripSeparator(),
            new ToolStripMenuItem("E&xit", null, (_, _) => ExitApplication()),
        });

        menu.Opening += (_, _) => UpdateMenu();

        notifyIcon = new NotifyIcon
        {
            Icon = icons.Stopped,
            Text = "Claude launcher",
            ContextMenuStrip = menu,
            Visible = true,
        };

        notifyIcon.DoubleClick += (_, _) => OnDoubleClick();

        pollTimer = new System.Windows.Forms.Timer { Interval = (int)PollInterval.TotalMilliseconds };
        pollTimer.Tick += (_, _) => Poll();
        pollTimer.Start();

        UpdateMenu();

        if (options.StartSession)
        {
            // Fire and forget: the constructor must return so the message loop
            // can start, and failures surface as a balloon tip.
            _ = StartSessionAsync(options.StartVisible);
        }
    }

    /// <summary>
    /// Double-clicking shows the session, or starts one if none is running —
    /// the two things most likely to be wanted without opening the menu.
    /// </summary>
    private async void OnDoubleClick()
    {
        if (session.IsRunning)
        {
            ShowWindow();
        }
        else
        {
            await StartSessionAsync(showWindow: true);
        }
    }

    private void ShowWindow()
    {
        session.ShowWindow();
        UpdateMenu();
    }

    private async Task StartSessionAsync(bool showWindow)
    {
        if (busy || session.IsRunning)
        {
            return;
        }

        busy = true;
        UpdateMenu();

        try
        {
            await session.StartAsync(showWindow);
            sessionStartedUtc = DateTime.UtcNow;
        }
        catch (Exception error)
        {
            Notify("Could not start the launcher session", error.Message, ToolTipIcon.Error);
        }
        finally
        {
            busy = false;
            sessionWasRunning = session.IsRunning;
            UpdateMenu();
        }
    }

    private async Task StopSessionAsync()
    {
        if (busy || !session.IsRunning)
        {
            return;
        }

        busy = true;
        stopping = true;
        UpdateMenu();

        try
        {
            await session.StopAsync();
        }
        finally
        {
            busy = false;
            stopping = false;
            sessionWasRunning = false;
            UpdateMenu();
        }
    }

    private async Task RestartSessionAsync()
    {
        var wasShown = session.IsWindowShown;

        await StopSessionAsync();
        await StartSessionAsync(wasShown);
    }

    /// <summary>
    /// Watches for the session ending on its own — the window being closed, or
    /// Claude Code exiting — and reports or restarts accordingly.
    /// </summary>
    private void Poll()
    {
        var running = session.IsRunning;

        if (sessionWasRunning && !running && !stopping && !busy)
        {
            OnSessionEndedUnexpectedly();
        }

        sessionWasRunning = running;
        UpdateMenu();
    }

    private void OnSessionEndedUnexpectedly()
    {
        // A session that ran for a decent while was healthy, so the next failure
        // starts counting again from zero.
        if (DateTime.UtcNow - sessionStartedUtc > RestartConsideredSuccessfulAfter)
        {
            consecutiveRestarts = 0;
        }

        if (!autoRestartItem.Checked)
        {
            Notify(
                "Launcher session ended",
                "The session window was closed. Use the tray menu to start it again.",
                ToolTipIcon.Info);

            return;
        }

        if (consecutiveRestarts >= MaxConsecutiveRestarts)
        {
            Notify(
                "Launcher session keeps stopping",
                $"Gave up after {MaxConsecutiveRestarts} restarts. Start it from the tray menu to see why.",
                ToolTipIcon.Error);

            return;
        }

        consecutiveRestarts++;

        // Restarted hidden, matching how it runs the rest of the time.
        _ = StartSessionAsync(showWindow: false);
    }

    private void UpdateMenu()
    {
        var running = session.IsRunning;
        var shown = session.IsWindowShown;

        notifyIcon.Icon = running ? icons.Running : icons.Stopped;

        var state = busy ? "working…" : running ? shown ? "running (window open)" : "running (hidden)" : "stopped";

        statusItem.Text = $"{options.SessionName}: {state}";

        // NotifyIcon.Text is capped at 63 characters by the shell.
        var tooltip = $"Claude {options.SessionName} — {state}";
        notifyIcon.Text = tooltip.Length > 63 ? tooltip[..63] : tooltip;

        showItem.Enabled = running && !busy;
        hideItem.Enabled = running && shown && !busy;
        startItem.Enabled = !running && !busy;
        restartItem.Enabled = running && !busy;
        stopItem.Enabled = running && !busy;
    }

    private void OpenRepositoryFolder()
    {
        try
        {
            using var _ = Process.Start(new ProcessStartInfo(options.RepositoryRoot) { UseShellExecute = true });
        }
        catch (Exception error)
        {
            Notify("Could not open the repository folder", error.Message, ToolTipIcon.Error);
        }
    }

    private void Notify(string title, string message, ToolTipIcon icon) =>
        notifyIcon.ShowBalloonTip(10_000, title, message, icon);

    private void ExitApplication()
    {
        pollTimer.Stop();

        // Leaving the session running would strand a window nobody can reach,
        // since the tray icon is the only handle on a hidden one.
        if (session.IsRunning)
        {
            session.Stop();
        }

        notifyIcon.Visible = false;
        ExitThread();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            pollTimer.Dispose();
            notifyIcon.ContextMenuStrip?.Dispose();
            notifyIcon.Dispose();
            session.Dispose();
            icons.Dispose();
        }

        base.Dispose(disposing);
    }
}
