using System.Drawing.Imaging;

namespace ClaudeLauncherTray;

/// <summary>
/// The pair of tray icons used to show session state at a glance: the Claude
/// Code icon while a session is running, and a greyed-out copy of it when none
/// is.
/// </summary>
internal sealed class TrayIcons : IDisposable
{
    private Icon? extractedIcon;
    private Icon? greyscaleIcon;
    private IntPtr greyscaleHandle = IntPtr.Zero;

    /// <summary>
    /// Builds the icon pair from the Claude Code executable, falling back to a
    /// stock icon when it cannot be found or read, and to the running icon when
    /// a greyed-out copy cannot be produced.
    /// </summary>
    public TrayIcons()
    {
        Running = ExtractClaudeIcon() ?? SystemIcons.Application;
        Stopped = CreateGreyscaleCopy(Running) ?? Running;
    }

    /// <summary>Shown while a launcher session is running.</summary>
    public Icon Running { get; }

    /// <summary>Shown while no launcher session is running.</summary>
    public Icon Stopped { get; }

    public void Dispose()
    {
        greyscaleIcon?.Dispose();
        extractedIcon?.Dispose();

        // Icon.FromHandle does not take ownership of the handle from GetHicon.
        if (greyscaleHandle != IntPtr.Zero)
        {
            NativeMethods.DestroyIcon(greyscaleHandle);
            greyscaleHandle = IntPtr.Zero;
        }
    }

    private Icon? ExtractClaudeIcon()
    {
        var claudeCommand = Environment.GetEnvironmentVariable("CLAUDE_CLI_COMMAND") ?? "claude";
        var claudePath = Executables.Resolve(claudeCommand);

        if (claudePath is null)
        {
            return null;
        }

        try
        {
            extractedIcon = Icon.ExtractAssociatedIcon(claudePath);
            return extractedIcon;
        }
        catch (Exception)
        {
            // Not an icon-bearing executable, or unreadable.
            return null;
        }
    }

    /// <summary>
    /// Returns a desaturated, faded copy of <paramref name="source"/>, or null
    /// if one cannot be produced — in which case state is conveyed by the
    /// tooltip alone.
    /// </summary>
    private Icon? CreateGreyscaleCopy(Icon source)
    {
        try
        {
            using var original = source.ToBitmap();
            using var greyscale = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb);

            // Standard luminance weights, with alpha dropped to 60% so a stopped
            // session reads as "off" rather than merely colourless.
            var matrix = new ColorMatrix(new[]
            {
                new[] { 0.299f, 0.299f, 0.299f, 0f, 0f },
                new[] { 0.587f, 0.587f, 0.587f, 0f, 0f },
                new[] { 0.114f, 0.114f, 0.114f, 0f, 0f },
                new[] { 0f, 0f, 0f, 0.6f, 0f },
                new[] { 0f, 0f, 0f, 0f, 1f },
            });

            using (var graphics = Graphics.FromImage(greyscale))
            using (var attributes = new ImageAttributes())
            {
                attributes.SetColorMatrix(matrix);

                graphics.DrawImage(
                    original,
                    new Rectangle(0, 0, original.Width, original.Height),
                    0,
                    0,
                    original.Width,
                    original.Height,
                    GraphicsUnit.Pixel,
                    attributes);
            }

            greyscaleHandle = greyscale.GetHicon();
            greyscaleIcon = Icon.FromHandle(greyscaleHandle);

            return greyscaleIcon;
        }
        catch (Exception)
        {
            return null;
        }
    }
}
