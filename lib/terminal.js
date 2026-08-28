'use strict';

const { execFileSync } = require('child_process');

/**
 * Terminal emulators tried, in order, on Linux and other Unix-likes. Each entry
 * builds the argv that runs `argv` in a new window. The working directory is
 * also applied through the spawn options, so the explicit directory flags only
 * matter for emulators that ignore the inherited cwd.
 */
const UNIX_TERMINALS = [
  { file: 'gnome-terminal', build: (cwd, argv) => ['--working-directory', cwd, '--', ...argv] },
  { file: 'konsole', build: (cwd, argv) => ['--workdir', cwd, '-e', ...argv] },
  { file: 'xfce4-terminal', build: (cwd, argv) => [`--working-directory=${cwd}`, '-x', ...argv] },
  { file: 'alacritty', build: (cwd, argv) => ['--working-directory', cwd, '-e', ...argv] },
  { file: 'kitty', build: (cwd, argv) => ['--directory', cwd, ...argv] },
  { file: 'x-terminal-emulator', build: (cwd, argv) => ['-e', ...argv] },
  { file: 'xterm', build: (cwd, argv) => ['-e', ...argv] },
];

/**
 * Returns true when the given executable can be resolved on the current PATH.
 */
function canResolve(command, { execFileSyncFn = execFileSync, platform = process.platform } = {}) {
  const probe = platform === 'win32' ? 'where' : 'which';

  try {
    execFileSyncFn(probe, [command], { stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Quotes a value for use as a single token in a cmd.exe command line.
 */
function cmdQuote(value) {
  return /[\s&|<>^]/.test(value) ? `"${value}"` : value;
}

/**
 * Quotes a value for use as a single token in a POSIX shell command line.
 */
function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Escapes a value for embedding inside a double-quoted AppleScript string.
 */
function escapeAppleScript(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Builds the spawn descriptor that opens a new terminal window running `argv`
 * with its working directory set to `cwd`.
 *
 * Returns `{ file, args, verbatim, description }`. `verbatim` requests
 * windowsVerbatimArguments, needed by the cmd.exe `start` fallback because it
 * has to control its own quoting. `description` names the terminal for
 * user-facing messages.
 *
 * Throws when no supported terminal emulator can be found.
 */
function buildTerminalCommand(cwd, argv, { canResolveFn = canResolve, platform = process.platform } = {}) {
  const override = process.env.CLAUDE_TERMINAL_COMMAND;

  if (override && override.trim()) {
    const [file, ...prefixArgs] = override.trim().split(/\s+/);
    return { file, args: [...prefixArgs, ...argv], verbatim: false, description: file };
  }

  if (platform === 'win32') {
    if (canResolveFn('wt.exe')) {
      return {
        file: 'wt.exe',
        args: ['-w', '-1', 'new-tab', '-d', cwd, ...argv],
        verbatim: false,
        description: 'Windows Terminal',
      };
    }

    // `start` treats an unquoted first token as the program to run, so the
    // window title must always be passed as an explicit empty quoted string.
    // `/k` keeps the console open once the session ends, so errors stay visible.
    const inner = argv.map(cmdQuote).join(' ');

    return {
      file: 'cmd.exe',
      args: ['/c', `start "" /D ${cmdQuote(cwd)} cmd.exe /k ${inner}`],
      verbatim: true,
      description: 'a new console window',
    };
  }

  if (platform === 'darwin') {
    const shellCommand = `cd ${shellQuote(cwd)} && exec ${argv.map(shellQuote).join(' ')}`;

    return {
      file: 'osascript',
      args: [
        '-e',
        `tell application "Terminal" to do script "${escapeAppleScript(shellCommand)}"`,
        '-e',
        'tell application "Terminal" to activate',
      ],
      verbatim: false,
      description: 'Terminal.app',
    };
  }

  for (const terminal of UNIX_TERMINALS) {
    if (canResolveFn(terminal.file)) {
      return {
        file: terminal.file,
        args: terminal.build(cwd, argv),
        verbatim: false,
        description: terminal.file,
      };
    }
  }

  throw new Error(
    'Could not find a terminal emulator to open. Set CLAUDE_TERMINAL_COMMAND to the '
      + 'command that opens one (for example "alacritty -e"), or run launch-project --here '
      + 'from an existing terminal.',
  );
}

module.exports = {
  UNIX_TERMINALS,
  canResolve,
  buildTerminalCommand,
};
