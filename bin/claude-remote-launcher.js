#!/usr/bin/env node

'use strict';

const { addProject, removeProject, listProjects } = require('../lib/projects');
const { launchProject } = require('../lib/launcher');

function printUsage() {
  console.log(`Usage: claude-remote-launcher <command> [options]

Commands:
  add-project <name> <path>   Register a local project by name and path
  remove-project <name>       Remove a registered project (leaves the directory alone)
  launch-project <name>       Launch Claude in remote mode for a registered project,
                              in a new terminal window
  list-projects               List all registered projects

Options:
  --here                      launch-project only: run the session attached to the
                              current terminal instead of opening a new window
                              (requires an interactive TTY)
`);
}

function runAddProject(args) {
  const [name, projectPath] = args;

  if (!name || !projectPath) {
    console.error('Usage: claude-remote-launcher add-project <name> <path>');
    process.exitCode = 1;
    return;
  }

  const project = addProject(name, projectPath);
  console.log(`Registered project "${project.name}" at ${project.path}`);
}

function runRemoveProject(args) {
  const [name] = args;

  if (!name) {
    console.error('Usage: claude-remote-launcher remove-project <name>');
    process.exitCode = 1;
    return;
  }

  const project = removeProject(name);
  console.log(`Removed project "${project.name}" (was registered at ${project.path})`);
}

function runLaunchProject(args) {
  const here = args.includes('--here');
  const [name] = args.filter((arg) => !arg.startsWith('--'));

  if (!name) {
    console.error('Usage: claude-remote-launcher launch-project <name> [--here]');
    process.exitCode = 1;
    return;
  }

  const { child, project, terminal } = launchProject(name, { newWindow: !here });

  if (here) {
    child.on('exit', (code) => {
      process.exitCode = code === null ? 1 : code;
    });
    return;
  }

  child.on('error', (err) => {
    console.error(`Error: failed to open a terminal window using ${terminal.file}: ${err.message}`);
    process.exitCode = 1;
  });

  console.log(`Launched Claude in remote mode for "${project.name}" in ${terminal.description} (${project.path}).`);
}

function runListProjects() {
  const projects = listProjects();

  if (projects.length === 0) {
    console.log('No projects registered yet. Use add-project to register one.');
    return;
  }

  for (const project of projects) {
    console.log(`${project.name}\t${project.path}`);
  }
}

function main(argv) {
  const [command, ...args] = argv;

  try {
    switch (command) {
      case 'add-project':
        runAddProject(args);
        break;
      case 'remove-project':
        runRemoveProject(args);
        break;
      case 'launch-project':
        runLaunchProject(args);
        break;
      case 'list-projects':
        runListProjects();
        break;
      default:
        printUsage();
        if (command) {
          process.exitCode = 1;
        }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { main };
