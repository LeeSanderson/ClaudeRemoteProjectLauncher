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
 * Environment variables Claude Code sets to describe the session a process is
 * running under. When launch-project is itself run from inside a Claude Code
 * session they are present in our own environment, and a plain spawn would pass
 * them straight into the session we are launching. That new session would then
 * treat itself as a nested child of ours — turning its transcript saving off —
 * and would also be holding our session id, IPC socket and messaging token.
 *
 * This is deliberately a denylist of session-scoped names rather than an
 * allowlist: user configuration (ANTHROPIC_*, CLAUDE_CODE_USE_BEDROCK,
 * CLAUDE_CONFIG_DIR, CLAUDE_CODE_MAX_OUTPUT_TOKENS, ...) must reach the new
 * session untouched, and dropping an unrecognised setting would be a worse
 * failure than missing a newly added marker.
 */
const SESSION_SCOPED_ENV_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_PID',
];

/**
 * Returns a copy of `env` with the current Claude Code session's markers
 * removed, so the launched session starts as a fresh top-level session.
 *
 * Names are compared case-insensitively, because Windows environment variable
 * names are.
 */
function sessionCleanEnv(env = process.env) {
  const denied = new Set(SESSION_SCOPED_ENV_VARS.map((name) => name.toLowerCase()));
  const cleaned = {};

  for (const [name, value] of Object.entries(env)) {
    if (!denied.has(name.toLowerCase())) {
      cleaned[name] = value;
    }
  }

  return cleaned;
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
    env = process.env,
  } = options;

  const project = getProject(name);

  if (!project) {
    throw new Error(`No project registered with name "${name}". Use add-project to register it first.`);
  }

  const argv = [getClaudeCommand(), getRemoteFlag()];
  const childEnv = sessionCleanEnv(env);

  if (!newWindow) {
    const child = spawnFn(argv[0], argv.slice(1), {
      cwd: project.path,
      env: childEnv,
      stdio: 'inherit',
    });

    return { child, project, terminal: null };
  }

  const terminal = buildTerminalCommandFn(project.path, argv);

  const child = spawnFn(terminal.file, terminal.args, {
    cwd: project.path,
    env: childEnv,
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
  SESSION_SCOPED_ENV_VARS,
  getClaudeCommand,
  getRemoteFlag,
  sessionCleanEnv,
  launchProject,
};
