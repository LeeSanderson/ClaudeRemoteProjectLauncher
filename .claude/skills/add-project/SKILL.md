---
name: add-project
description: Registers a local project's name and path in projects.json so it can later be launched with /launch-project. Use when the user asks to add, register, or remember a project for the Claude Remote Project Launcher.
argument-hint: "[name] [path]"
allowed-tools: [Bash]
---

# Add Project Skill

Register a local project so it can be launched later with `/launch-project`.

Given `$ARGUMENTS` (a project name and a path, in that order):

1. If either the name or path is missing, ask the user to provide both, e.g.
   `/add-project my-app /home/user/projects/my-app`.
2. Run the launcher CLI to register the project:
   ```
   node bin/claude-remote-launcher.js add-project "<name>" "<path>"
   ```
   (Use the globally installed `claude-remote-launcher` command instead if the
   CLI has been installed via `npm install -g`.)
3. Report the result to the user, including any error message if registration
   failed (for example, if the path does not exist).
