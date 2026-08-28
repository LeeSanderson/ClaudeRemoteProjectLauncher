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
   `/add-project my-app C:\Dev\Personal\my-app`.
2. Make sure the path is **absolute** before registering it. The CLI resolves a
   relative path against its own working directory — this launcher's own
   repository — not against the directory the user had in mind, so a relative
   path is silently registered as the wrong project. If the user gave a relative
   path, resolve it to an absolute one and confirm it with them before
   continuing.
3. Check whether the name is already taken:
   ```
   node bin/claude-remote-launcher.js list-projects
   ```
   Registering an existing name **overwrites** its stored path without warning,
   and the CLI reports success either way. Compare names
   **case-insensitively** — `my-app` and `My-App` are the same project, and
   registering the second replaces the first. If the name is already registered,
   tell the user which path it currently points at and ask whether to replace it
   or use a different name.
4. Run the launcher CLI to register the project:
   ```
   node bin/claude-remote-launcher.js add-project "<name>" "<path>"
   ```
   (Use the globally installed `claude-remote-launcher` command instead if the
   CLI has been installed via `npm install -g`.)
5. Report the result to the user, including any error message if registration
   failed (for example, if the path does not exist).
