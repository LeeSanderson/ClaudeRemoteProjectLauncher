'use strict';

const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpHome;
let tmpProjectDir;
let projects;
let launcher;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-remote-launcher-home-'));
  tmpProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-remote-launcher-project-'));
  process.env.CLAUDE_REMOTE_LAUNCHER_HOME = tmpHome;
  delete require.cache[require.resolve('../lib/projects')];
  delete require.cache[require.resolve('../lib/launcher')];
  projects = require('../lib/projects');
  launcher = require('../lib/launcher');
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
  fs.rmSync(tmpProjectDir, { recursive: true, force: true });
  delete process.env.CLAUDE_REMOTE_LAUNCHER_HOME;
  delete process.env.CLAUDE_CLI_COMMAND;
  delete process.env.CLAUDE_REMOTE_FLAG;
  delete process.env.CLAUDE_TERMINAL_COMMAND;
});

/**
 * Returns a spawn stub that records its calls and hands back a fake child.
 */
function recordingSpawn() {
  const calls = [];
  const fakeChild = new EventEmitter();
  let unrefs = 0;
  fakeChild.unref = () => {
    unrefs += 1;
  };

  const spawnFn = (command, args, options) => {
    calls.push({ command, args, options });
    return fakeChild;
  };

  return { calls, fakeChild, spawnFn, unrefCount: () => unrefs };
}

test('launchProject throws when the project is not registered', () => {
  assert.throws(() => launcher.launchProject('missing'), /No project registered/);
});

test('launchProject opens the claude remote session in a new terminal window', () => {
  projects.addProject('my-app', tmpProjectDir);

  const { calls, fakeChild, spawnFn, unrefCount } = recordingSpawn();
  const terminalCalls = [];
  const buildTerminalCommandFn = (cwd, argv) => {
    terminalCalls.push({ cwd, argv });
    return { file: 'fake-term', args: ['--run', ...argv], verbatim: false, description: 'Fake Terminal' };
  };

  const result = launcher.launchProject('my-app', { spawnFn, buildTerminalCommandFn });

  assert.equal(result.child, fakeChild);
  assert.equal(result.project.name, 'my-app');
  assert.equal(result.terminal.description, 'Fake Terminal');

  // The claude command, remote flag and session name are handed to the builder.
  assert.equal(terminalCalls.length, 1);
  assert.equal(terminalCalls[0].cwd, path.resolve(tmpProjectDir));
  assert.deepEqual(terminalCalls[0].argv, ['claude', '--remote-control', 'my-app']);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'fake-term');
  assert.deepEqual(calls[0].args, ['--run', 'claude', '--remote-control', 'my-app']);
  assert.equal(calls[0].options.cwd, path.resolve(tmpProjectDir));
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.stdio, 'ignore');
  assert.equal(calls[0].options.windowsVerbatimArguments, false);

  // The launcher must not keep the parent process alive.
  assert.equal(unrefCount(), 1);
});

test('launchProject passes windowsVerbatimArguments through for verbatim terminals', () => {
  projects.addProject('my-app', tmpProjectDir);

  const { calls, spawnFn } = recordingSpawn();
  const buildTerminalCommandFn = () => ({
    file: 'cmd.exe',
    args: ['/c', 'start "" cmd.exe /k claude --remote-control'],
    verbatim: true,
    description: 'a new console window',
  });

  launcher.launchProject('my-app', { spawnFn, buildTerminalCommandFn });

  assert.equal(calls[0].options.windowsVerbatimArguments, true);
});

test('launchProject with newWindow false runs attached to the current stdio', () => {
  projects.addProject('my-app', tmpProjectDir);

  const { calls, spawnFn } = recordingSpawn();
  const buildTerminalCommandFn = () => {
    throw new Error('should not build a terminal command when newWindow is false');
  };

  const result = launcher.launchProject('my-app', { spawnFn, newWindow: false, buildTerminalCommandFn });

  assert.equal(result.terminal, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'claude');
  assert.deepEqual(calls[0].args, ['--remote-control', 'my-app']);
  assert.equal(calls[0].options.cwd, path.resolve(tmpProjectDir));
  assert.equal(calls[0].options.stdio, 'inherit');
  assert.equal(calls[0].options.detached, undefined);
});

test('sessionCleanEnv strips the current session markers but keeps user config', () => {
  const cleaned = launcher.sessionCleanEnv({
    CLAUDECODE: '1',
    CLAUDE_CODE_CHILD_SESSION: '1',
    CLAUDE_CODE_SESSION_ID: 'abc-123',
    CLAUDE_CODE_MESSAGING_SOCKET: '\\\\.\\pipe\\LOCAL\\cc-msg-deadbeef',
    CLAUDE_CODE_MESSAGING_TOKEN: 'secret',
    CLAUDE_CODE_SSE_PORT: '52046',
    CLAUDE_CODE_ENTRYPOINT: 'cli',
    CLAUDE_PID: '1234',
    ANTHROPIC_API_KEY: 'keep-me',
    CLAUDE_CODE_USE_BEDROCK: '1',
    CLAUDE_CONFIG_DIR: '/home/me/.claude',
    PATH: '/usr/bin',
  });

  assert.deepEqual(Object.keys(cleaned).sort(), [
    'ANTHROPIC_API_KEY',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CONFIG_DIR',
    'PATH',
  ]);
});

test('sessionCleanEnv matches names case-insensitively, as Windows does', () => {
  const cleaned = launcher.sessionCleanEnv({ claude_code_child_session: '1', Claude_Pid: '9' });

  assert.deepEqual(cleaned, {});
});

test('sessionCleanEnv does not mutate the environment it is given', () => {
  const original = { CLAUDE_CODE_CHILD_SESSION: '1', PATH: '/usr/bin' };

  launcher.sessionCleanEnv(original);

  assert.deepEqual(original, { CLAUDE_CODE_CHILD_SESSION: '1', PATH: '/usr/bin' });
});

test('launchProject spawns with the session markers stripped from the env', () => {
  projects.addProject('my-app', tmpProjectDir);

  const { calls, spawnFn } = recordingSpawn();
  const buildTerminalCommandFn = (cwd, argv) => ({
    file: 'fake-term', args: argv, verbatim: false, description: 'Fake Terminal',
  });
  const env = {
    CLAUDE_CODE_CHILD_SESSION: '1',
    CLAUDE_CODE_SESSION_ID: 'abc-123',
    CLAUDE_CODE_MESSAGING_TOKEN: 'secret',
    ANTHROPIC_API_KEY: 'keep-me',
  };

  launcher.launchProject('my-app', { spawnFn, buildTerminalCommandFn, env });

  assert.equal(calls[0].options.env.CLAUDE_CODE_CHILD_SESSION, undefined);
  assert.equal(calls[0].options.env.CLAUDE_CODE_SESSION_ID, undefined);
  assert.equal(calls[0].options.env.CLAUDE_CODE_MESSAGING_TOKEN, undefined);
  assert.equal(calls[0].options.env.ANTHROPIC_API_KEY, 'keep-me');
});

test('launchProject also strips the session markers when running attached', () => {
  projects.addProject('my-app', tmpProjectDir);

  const { calls, spawnFn } = recordingSpawn();
  const env = { CLAUDE_CODE_CHILD_SESSION: '1', ANTHROPIC_API_KEY: 'keep-me' };

  launcher.launchProject('my-app', { spawnFn, newWindow: false, env });

  assert.equal(calls[0].options.env.CLAUDE_CODE_CHILD_SESSION, undefined);
  assert.equal(calls[0].options.env.ANTHROPIC_API_KEY, 'keep-me');
});

test('launchProject honours CLAUDE_CLI_COMMAND and CLAUDE_REMOTE_FLAG overrides', () => {
  projects.addProject('my-app', tmpProjectDir);
  process.env.CLAUDE_CLI_COMMAND = 'custom-claude';
  process.env.CLAUDE_REMOTE_FLAG = '--rc';

  const { spawnFn } = recordingSpawn();
  const terminalCalls = [];
  const buildTerminalCommandFn = (cwd, argv) => {
    terminalCalls.push({ cwd, argv });
    return { file: 'fake-term', args: argv, verbatim: false, description: 'Fake Terminal' };
  };

  launcher.launchProject('my-app', { spawnFn, buildTerminalCommandFn });

  assert.deepEqual(terminalCalls[0].argv, ['custom-claude', '--rc', 'my-app']);
});

test('launchProject finds the project whatever case the name is given in', () => {
  projects.addProject('D12Canvas', tmpProjectDir);

  const { spawnFn } = recordingSpawn();
  const terminalCalls = [];
  const buildTerminalCommandFn = (cwd, argv) => {
    terminalCalls.push({ cwd, argv });
    return { file: 'fake-term', args: argv, verbatim: false, description: 'Fake Terminal' };
  };

  const result = launcher.launchProject('d12canvas', { spawnFn, buildTerminalCommandFn });

  // The session is named with the registered casing, not the one typed.
  assert.equal(result.project.name, 'D12Canvas');
  assert.deepEqual(terminalCalls[0].argv, ['claude', '--remote-control', 'D12Canvas']);
});

test('launchProject names the remote session after the project', () => {
  projects.addProject('My Long Project', tmpProjectDir);

  const { spawnFn } = recordingSpawn();
  const terminalCalls = [];
  const buildTerminalCommandFn = (cwd, argv) => {
    terminalCalls.push({ cwd, argv });
    return { file: 'fake-term', args: argv, verbatim: false, description: 'Fake Terminal' };
  };

  launcher.launchProject('My Long Project', { spawnFn, buildTerminalCommandFn });

  // The name stays a single argv entry, so the terminal layer can quote it.
  assert.deepEqual(terminalCalls[0].argv, ['claude', '--remote-control', 'My Long Project']);
});
