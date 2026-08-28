---
name: launch-project
description: >
  Launches Claude Code in remote mode for a project previously registered
  with /add-project. Use when the user asks to launch, open, or start a
  remote session for a named project.
argument-hint: [name]
allowed-tools: [Bash]
---

# Launch Project Skill

Launch Claude Code in remote mode for a project registered with
`/add-project`.

Given `$ARGUMENTS` (a project name):

1. If the name is missing, ask the user which registered project to launch.
   You can list known projects with:
   ```
   node bin/claude-remote-launcher.js list-projects
   ```
2. Run the launcher CLI to start a remote session for the project:
   ```
   node bin/claude-remote-launcher.js launch-project "<name>"
   ```
   (Use the globally installed `claude-remote-launcher` command instead if the
   CLI has been installed via `npm install -g`.)
3. Report the result to the user, including any error message if the project
   was not found (for example, if it has not been registered yet).
