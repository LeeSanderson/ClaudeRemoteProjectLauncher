namespace ClaudeLauncherTray;

/// <summary>
/// Resolves executables on the current PATH, so the tray can check its
/// prerequisites before launching anything.
/// </summary>
/// <remarks>
/// The pre-flight check matters more here than in a terminal: a session that
/// fails immediately closes its own window, taking the error message with it.
/// Checking first lets the tray report the real reason in a balloon tip instead
/// of silently flickering a window at every restart attempt.
/// </remarks>
internal static class Executables
{
    /// <summary>
    /// Returns the full path of <paramref name="command"/> as found on PATH, or
    /// null when it cannot be resolved. An absolute or relative path is checked
    /// directly rather than searched for.
    /// </summary>
    internal static string? Resolve(string command)
    {
        if (string.IsNullOrWhiteSpace(command))
        {
            return null;
        }

        if (command.Contains(Path.DirectorySeparatorChar) || command.Contains(Path.AltDirectorySeparatorChar))
        {
            var full = Path.GetFullPath(command);
            return File.Exists(full) ? full : null;
        }

        var extensions = (Environment.GetEnvironmentVariable("PATHEXT") ?? ".COM;.EXE;.BAT;.CMD")
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var directories = (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        foreach (var directory in directories)
        {
            // A malformed PATH entry must not take the whole search down.
            string candidate;
            try
            {
                candidate = Path.Combine(directory, command);
            }
            catch (ArgumentException)
            {
                continue;
            }

            if (Path.HasExtension(command) && File.Exists(candidate))
            {
                return candidate;
            }

            foreach (var extension in extensions)
            {
                if (File.Exists(candidate + extension))
                {
                    return candidate + extension;
                }
            }
        }

        return null;
    }

    /// <summary>
    /// Returns the first resolvable command from <paramref name="commands"/>,
    /// or null when none of them resolve.
    /// </summary>
    internal static string? ResolveFirst(params string[] commands)
    {
        foreach (var command in commands)
        {
            var resolved = Resolve(command);

            if (resolved is not null)
            {
                return resolved;
            }
        }

        return null;
    }
}
