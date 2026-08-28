'use strict';

const { spawn } = require('child_process');
const { getProject } = require('./projects');
const { buildTerminalCommand } = require('./terminal');

/**
 * The Claude CLI command to invoke. Overridable via CLAUDE_CLI_COMMAND for
 * testing or for users with a differently named/aliased binary.
 */
function getClaudeCommand() {
  return process.env.CLAUDE_CLI_COMMAND || 'claude';
}

/**
 * The CLI flag used to start Claude Code in remote (remote-control) mode.
 * Overridable via CLAUDE_REMOTE_FLAG for testing.
 */
function getRemoteFlag() {
  return process.env.CLAUDE_REMOTE_FLAG || '--remote-control';
}

/**
 * Launches Claude Code in remote mode with the working directory set to the
 * path of the registered project with the given name.
 *
 * `claude --remote-control` starts an interactive session, which needs a TTY.
 * By default the session is therefore opened in a new terminal window, so that
 * launching works from contexts without a usable TTY of their own — notably
 * from inside a Claude Code session via the /launch-project skill. Pass
 * `newWindow: false` to run it attached to the current stdio instead, which
 * only works when the caller already has a TTY.
 *
 * Returns `{ child, project, terminal }`, where `terminal` is the terminal
 * descriptor used, or null when running attached.
 */
function launchProject(name, options = {}) {
  const {
    spawnFn = spawn,
    newWindow = true,
    buildTerminalCommandFn = buildTerminalCommand,
  } = options;

  const project = getProject(name);

  if (!project) {
    throw new Error(`No project registered with name "${name}". Use add-project to register it first.`);
  }

  const argv = [getClaudeCommand(), getRemoteFlag()];

  if (!newWindow) {
    const child = spawnFn(argv[0], argv.slice(1), {
      cwd: project.path,
      stdio: 'inherit',
    });

    return { child, project, terminal: null };
  }

  const terminal = buildTerminalCommandFn(project.path, argv);

  const child = spawnFn(terminal.file, terminal.args, {
    cwd: project.path,
    detached: true,
    stdio: 'ignore',
    windowsVerbatimArguments: terminal.verbatim === true,
  });

  // Let the launcher process exit without waiting on the new window.
  if (typeof child.unref === 'function') {
    child.unref();
  }

  return { child, project, terminal };
}

module.exports = {
  getClaudeCommand,
  getRemoteFlag,
  launchProject,
};
