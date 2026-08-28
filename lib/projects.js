'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Resolves the directory where launcher state (including projects.json) is stored.
 * Can be overridden with the CLAUDE_REMOTE_LAUNCHER_HOME environment variable,
 * which is primarily useful for tests.
 */
function getStoreDir() {
  return process.env.CLAUDE_REMOTE_LAUNCHER_HOME || path.join(os.homedir(), '.claude-remote-launcher');
}

/**
 * Resolves the full path to the projects.json file.
 */
function getProjectsFilePath() {
  return path.join(getStoreDir(), 'projects.json');
}

/**
 * Loads the registered projects from projects.json.
 * Returns an empty object if the file does not exist yet.
 */
function loadProjects() {
  const filePath = getProjectsFilePath();

  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, 'utf8').trim();

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

/**
 * Persists the given projects map to projects.json, creating the store
 * directory if necessary.
 */
function saveProjects(projects) {
  const dir = getStoreDir();

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(getProjectsFilePath(), `${JSON.stringify(projects, null, 2)}\n`);
}

/**
 * Registers (or updates) a project with the given name and path.
 * The path must exist and be a directory. Returns the stored project entry.
 */
function addProject(name, projectPath) {
  if (!name || !name.trim()) {
    throw new Error('Project name is required.');
  }

  if (!projectPath || !projectPath.trim()) {
    throw new Error('Project path is required.');
  }

  const resolvedPath = path.resolve(projectPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Project path does not exist: ${resolvedPath}`);
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`Project path is not a directory: ${resolvedPath}`);
  }

  const projects = loadProjects();
  const project = { name, path: resolvedPath };
  projects[name] = project;
  saveProjects(projects);

  return project;
}

/**
 * Returns the registered project with the given name, or undefined if it
 * has not been registered.
 */
function getProject(name) {
  const projects = loadProjects();
  return projects[name];
}

/**
 * Returns all registered projects as an array.
 */
function listProjects() {
  return Object.values(loadProjects());
}

module.exports = {
  getStoreDir,
  getProjectsFilePath,
  loadProjects,
  saveProjects,
  addProject,
  getProject,
  listProjects,
};
