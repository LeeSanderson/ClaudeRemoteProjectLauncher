'use strict';

const { spawn } = require('child_process');
const { getProject } = require('./projects');

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
 * Returns the spawned child process.
 */
function launchProject(name, { spawnFn = spawn } = {}) {
  const project = getProject(name);

  if (!project) {
    throw new Error(`No project registered with name "${name}". Use add-project to register it first.`);
  }

  const child = spawnFn(getClaudeCommand(), [getRemoteFlag()], {
    cwd: project.path,
    stdio: 'inherit',
  });

  return child;
}

module.exports = {
  getClaudeCommand,
  getRemoteFlag,
  launchProject,
};
