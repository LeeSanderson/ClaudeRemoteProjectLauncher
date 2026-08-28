'use strict';

const assert = require('node:assert/strict');
const { test, afterEach } = require('node:test');

const { canResolve, buildTerminalCommand } = require('../lib/terminal');

const ARGV = ['claude', '--remote-control'];

afterEach(() => {
  delete process.env.CLAUDE_TERMINAL_COMMAND;
});

/** Resolves only the executables named in `available`. */
function resolver(...available) {
  return (command) => available.includes(command);
}

test('canResolve reports true when the probe command succeeds', () => {
  const calls = [];
  const execFileSyncFn = (file, args) => {
    calls.push({ file, args });
  };

  assert.equal(canResolve('wt.exe', { execFileSyncFn, platform: 'win32' }), true);
  assert.deepEqual(calls[0], { file: 'where', args: ['wt.exe'] });
});

test('canResolve reports false when the probe command throws', () => {
  const execFileSyncFn = () => {
    throw new Error('not found');
  };

  assert.equal(canResolve('gnome-terminal', { execFileSyncFn, platform: 'linux' }), false);
});

test('canResolve probes with which on non-Windows platforms', () => {
  const calls = [];
  const execFileSyncFn = (file, args) => {
    calls.push({ file, args });
  };

  canResolve('xterm', { execFileSyncFn, platform: 'linux' });
  assert.deepEqual(calls[0], { file: 'which', args: ['xterm'] });
});

test('windows prefers Windows Terminal in a new window with the project directory', () => {
  const result = buildTerminalCommand('C:\\projects\\my-app', ARGV, {
    platform: 'win32',
    canResolveFn: resolver('wt.exe'),
  });

  assert.equal(result.file, 'wt.exe');
  assert.deepEqual(result.args, [
    '-w', '-1', 'new-tab', '-d', 'C:\\projects\\my-app', 'claude', '--remote-control',
  ]);
  assert.equal(result.verbatim, false);
});

test('windows falls back to cmd start with an always-quoted empty window title', () => {
  const result = buildTerminalCommand('C:\\projects\\my app', ARGV, {
    platform: 'win32',
    canResolveFn: resolver(),
  });

  assert.equal(result.file, 'cmd.exe');
  assert.equal(result.verbatim, true);
  assert.equal(result.args[0], '/c');
  // An unquoted first token would be read by `start` as the program to run.
  assert.match(result.args[1], /^start "" /);
  // A cwd containing spaces must be quoted.
  assert.match(result.args[1], /\/D "C:\\projects\\my app"/);
  assert.match(result.args[1], /cmd\.exe \/k claude --remote-control$/);
});

test('macos drives Terminal.app via osascript with a quoted cd', () => {
  const result = buildTerminalCommand("/Users/me/my 'app'", ARGV, { platform: 'darwin' });

  assert.equal(result.file, 'osascript');
  assert.equal(result.verbatim, false);
  // Single quotes in the path must survive POSIX quoting, then AppleScript escaping.
  assert.match(result.args[1], /do script "cd '\/Users\/me\/my '\\\\''app'\\\\''' && exec 'claude' '--remote-control'"/);
  assert.match(result.args[3], /activate/);
});

test('linux uses the first terminal emulator found on PATH', () => {
  const result = buildTerminalCommand('/home/me/my-app', ARGV, {
    platform: 'linux',
    canResolveFn: resolver('xterm', 'konsole'),
  });

  // konsole comes before xterm in the preference order.
  assert.equal(result.file, 'konsole');
  assert.deepEqual(result.args, ['--workdir', '/home/me/my-app', '-e', 'claude', '--remote-control']);
});

test('linux throws a helpful error when no terminal emulator is found', () => {
  assert.throws(
    () => buildTerminalCommand('/home/me/my-app', ARGV, { platform: 'linux', canResolveFn: resolver() }),
    /CLAUDE_TERMINAL_COMMAND/,
  );
});

test('CLAUDE_TERMINAL_COMMAND overrides platform detection', () => {
  process.env.CLAUDE_TERMINAL_COMMAND = 'alacritty -e';

  const result = buildTerminalCommand('/home/me/my-app', ARGV, {
    platform: 'win32',
    canResolveFn: resolver('wt.exe'),
  });

  assert.equal(result.file, 'alacritty');
  assert.deepEqual(result.args, ['-e', 'claude', '--remote-control']);
});

test('a blank CLAUDE_TERMINAL_COMMAND is ignored', () => {
  process.env.CLAUDE_TERMINAL_COMMAND = '   ';

  const result = buildTerminalCommand('C:\\projects\\my-app', ARGV, {
    platform: 'win32',
    canResolveFn: resolver('wt.exe'),
  });

  assert.equal(result.file, 'wt.exe');
});
