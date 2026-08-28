---
name: list-projects
description: Lists the projects registered with /add-project, showing each project's name and path. Use when the user asks which projects are available, registered, or known to the Claude Remote Project Launcher.
allowed-tools: [Bash]
---

# List Projects Skill

List the projects that have been registered with `/add-project` and can be
launched with `/launch-project`.

This skill takes no arguments.

1. Run the launcher CLI to list the registered projects:
   ```
   node bin/claude-remote-launcher.js list-projects
   ```
   (Use the globally installed `claude-remote-launcher` command instead if the
   CLI has been installed via `npm install -g`.)

   Each project is printed as a tab-separated `name` and `path`.
2. Report the projects to the user as a readable list of names and paths.
   If none are registered the CLI says so, in which case tell the user they can
   register one with `/add-project`.
