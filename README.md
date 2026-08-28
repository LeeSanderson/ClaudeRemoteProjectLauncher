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

### Session naming

The session is started as `claude --remote-control "<project name>"`, so it
appears under the project's name in the Claude app's Remote Control session
list. Without a name Claude auto-generates one prefixed with the machine's
hostname, which makes several launched projects hard to tell apart.

The name is registered server-side, so it is not visible in any local file.
Note that `~/.claude/sessions/<pid>.json` also has a `name` field (with
`nameSource: "derived"`) — that is the separate *local* session name, derived
from the working directory, and it is not affected by this flag.

### A fresh session, not a nested one

When `launch-project` is run from inside a Claude Code session — which is the
normal case for the `/launch-project` skill — that session's own environment
contains markers describing it:

```
CLAUDECODE=1
CLAUDE_CODE_CHILD_SESSION=1
CLAUDE_CODE_SESSION_ID=...
CLAUDE_CODE_MESSAGING_SOCKET=...
CLAUDE_CODE_MESSAGING_TOKEN=...
CLAUDE_CODE_SSE_PORT=...
CLAUDE_CODE_ENTRYPOINT=cli
CLAUDE_PID=...
```

A plain `spawn` inherits all of them, so the launched session would believe it
was a nested child of the launching one — reporting `Transcript saving is off —
inherited CLAUDE_CODE_CHILD_SESSION marker` and saving no transcript — while
also holding the launching session's id, IPC socket and messaging token.

The launcher therefore strips those variables (see `SESSION_SCOPED_ENV_VARS` in
`lib/launcher.js`) before spawning, so the new session starts as a normal
top-level session. The list is a denylist of session-scoped names: user
configuration such as `ANTHROPIC_API_KEY`, `CLAUDE_CODE_USE_BEDROCK` or
`CLAUDE_CONFIG_DIR` is passed through untouched, since silently dropping a
setting would be a worse failure than missing a newly added marker.

## Starting the Launcher session

`Start-Launcher.ps1` (in the repository root) starts a remote-control session
for *this* repository, named `Launcher`:

```powershell
.\Start-Launcher.ps1

# ...or under a different name, if you run one per machine
.\Start-Launcher.ps1 -SessionName "Launcher (laptop)"
```

It runs `claude --remote-control Launcher` with the working directory set to the
repository root, taken from the script's own location, so it works from any
current directory. From that session the skills below are available, which makes
it the session you drive from the Claude app to launch remote-control sessions
for your other projects.

The session is attached to the terminal you run the script from, because
`claude --remote-control` needs a TTY; start it from a terminal window rather
than from another process. Set `CLAUDE_CLI_COMMAND` if your Claude Code binary
is not called `claude` or is not on `PATH`.

## Claude Code skills

Three Claude Code skills are provided under `.claude/skills/` so the same
functionality is available from within a Claude Code session:

- `/add-project <name> <path>` — registers a local project's name and path in
  `projects.json`.
- `/list-projects` — lists the registered projects and their paths.
- `/launch-project <name>` — launches Claude Code in remote mode for a
  previously registered project.

## Development

Install dependencies (none required beyond Node.js) and run the test suite:

```sh
npm test
```
