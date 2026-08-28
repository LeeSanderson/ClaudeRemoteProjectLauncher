---
name: remove-project
description: Removes a project from the list registered in projects.json, so it no longer appears in /list-projects and can no longer be launched with /launch-project. Use when the user asks to remove, delete, deregister, or forget a project of the Claude Remote Project Launcher.
argument-hint: "[name]"
allowed-tools: [Bash]
---

# Remove Project Skill

Remove a project from the list registered with `/add-project`.

Only the **registration** is removed. The project directory and its contents are
left untouched, and any remote session already launched for it keeps running.

Given `$ARGUMENTS` (a project name):

1. If the name is missing, list the registered projects and ask the user which
   one to remove:
   ```
   node bin/claude-remote-launcher.js list-projects
   ```
2. Confirm with the user before removing, quoting the name and path that
   `list-projects` shows for it. Removal is not undoable — re-registering means
   supplying the path again — and a mistyped name can match a project the user
   did not mean, because names are matched **case-insensitively**
   (`my-app` removes the project registered as `My-App`).
3. Run the launcher CLI to remove the project:
   ```
   node bin/claude-remote-launcher.js remove-project "<name>"
   ```
   (Use the globally installed `claude-remote-launcher` command instead if the
   CLI has been installed via `npm install -g`.)

   The CLI reports the name and path it removed, so you can show the user
   exactly what was deregistered.
4. Report the result to the user, including any error message if the project
   was not found (for example, if it was never registered, or has already been
   removed). If the name was not found, `list-projects` output is worth showing
   so the user can pick the right one.
