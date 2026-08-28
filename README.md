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

# Launch Claude in remote mode for a registered project (in a new terminal window)
node bin/claude-remote-launcher.js launch-project my-app

# ...or attached to the current terminal, if it already has a TTY
node bin/claude-remote-launcher.js launch-project my-app --here
```

You can also install the package so that the `claude-remote-launcher` command
is available on your `PATH`:

```sh
npm install -g .
claude-remote-launcher add-project my-app /path/to/my-app
claude-remote-launcher launch-project my-app
```

## How launching works

`claude --remote-control` starts an *interactive* session, which needs a TTY. A
caller without one — notably a Claude Code session running the
`/launch-project` skill — would otherwise make Claude fall back to `--print`
mode and fail with `Input must be provided either through stdin or as a prompt
argument when using --print`.

So `launch-project` opens the session in a **new terminal window** by default,
giving it a TTY of its own. The terminal is chosen per platform:

| Platform | Terminal used |
| --- | --- |
| Windows | Windows Terminal (`wt.exe`) if present, otherwise `cmd.exe /c start` |
| macOS | `Terminal.app`, driven via `osascript` |
| Linux / other Unix | first of `gnome-terminal`, `konsole`, `xfce4-terminal`, `alacritty`, `kitty`, `x-terminal-emulator`, `xterm` found on `PATH` |

Set `CLAUDE_TERMINAL_COMMAND` to override the choice, for example
`CLAUDE_TERMINAL_COMMAND="alacritty -e"`. Pass `--here` to skip the new window
and run the session attached to the current terminal instead.

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
