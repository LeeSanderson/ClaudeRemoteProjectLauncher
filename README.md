# ClaudeRemoteProjectLauncher
A utility to manage local projects and launch Claude remote sessions

## Overview

`claude-remote-launcher` is a small CLI utility, plus a pair of Claude Code
skills, for registering local projects and launching Claude Code in remote
mode (`claude --remote-control`) for them.

Registered projects are stored in a `projects.json` file under
`~/.claude-remote-launcher/` (configurable via the `CLAUDE_REMOTE_LAUNCHER_HOME`
environment variable, which is mainly useful for testing).

## CLI usage

```sh
# Register a project by name and path
node bin/claude-remote-launcher.js add-project my-app /path/to/my-app

# List registered projects
node bin/claude-remote-launcher.js list-projects

# Launch Claude in remote mode for a registered project
node bin/claude-remote-launcher.js launch-project my-app
```

You can also install the package so that the `claude-remote-launcher` command
is available on your `PATH`:

```sh
npm install -g .
claude-remote-launcher add-project my-app /path/to/my-app
claude-remote-launcher launch-project my-app
```

## Claude Code skills

Two Claude Code skills are provided under `.claude/skills/` so the same
functionality is available from within a Claude Code session:

- `/add-project <name> <path>` — registers a local project's name and path in
  `projects.json`.
- `/launch-project <name>` — launches Claude Code in remote mode for a
  previously registered project.

## Development

Install dependencies (none required beyond Node.js) and run the test suite:

```sh
npm test
```
