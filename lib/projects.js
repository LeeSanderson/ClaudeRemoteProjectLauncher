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

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse projects file at ${filePath}: ${err.message}`);
  }
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
 * Returns the key under which the given name is stored in `projects`, or
 * undefined if no project matches.
 *
 * Names are compared case-insensitively, so `/launch-project d12canvas` finds
 * the project registered as `D12Canvas`. The comparison is deliberately
 * locale-independent (`toLowerCase`, not `toLocaleLowerCase`): project names are
 * identifiers, and the same projects.json is shared by whatever locale the
 * machine happens to be running under.
 */
function findProjectKey(projects, name) {
  if (!name) {
    return undefined;
  }

  const target = name.toLowerCase();
  return Object.keys(projects).find((key) => key.toLowerCase() === target);
}

/**
 * Registers (or updates) a project with the given name and path.
 * The path must exist and be a directory. Returns the stored project entry.
 *
 * A project already registered under a name differing only in case is replaced,
 * taking on the new casing, rather than added alongside — two such entries could
 * not be told apart by name lookup.
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
  const existingKey = findProjectKey(projects, name);

  if (existingKey !== undefined && existingKey !== name) {
    delete projects[existingKey];
  }

  const project = { name, path: resolvedPath };
  projects[name] = project;
  saveProjects(projects);

  return project;
}

/**
 * Returns the registered project with the given name, or undefined if it
 * has not been registered. The name is matched case-insensitively; the returned
 * entry carries the casing it was registered under.
 */
function getProject(name) {
  const projects = loadProjects();
  const key = findProjectKey(projects, name);

  return key === undefined ? undefined : projects[key];
}

/**
 * Removes the registered project with the given name and returns the entry that
 * was removed. Throws if no project is registered under that name.
 *
 * The name is matched case-insensitively, like getProject, so a project can be
 * removed under whatever casing the user types. Only the registration is
 * removed — the project directory itself is left alone.
 */
function removeProject(name) {
  if (!name || !name.trim()) {
    throw new Error('Project name is required.');
  }

  const projects = loadProjects();
  const key = findProjectKey(projects, name);

  if (key === undefined) {
    throw new Error(`No project registered with name "${name}".`);
  }

  const removed = projects[key];
  delete projects[key];
  saveProjects(projects);

  return removed;
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
  findProjectKey,
  addProject,
  getProject,
  removeProject,
  listProjects,
};
