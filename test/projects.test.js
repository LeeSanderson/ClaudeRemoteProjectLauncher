'use strict';

const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpHome;
let tmpProjectDir;
let projects;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-remote-launcher-home-'));
  tmpProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-remote-launcher-project-'));
  process.env.CLAUDE_REMOTE_LAUNCHER_HOME = tmpHome;
  delete require.cache[require.resolve('../lib/projects')];
  projects = require('../lib/projects');
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
  fs.rmSync(tmpProjectDir, { recursive: true, force: true });
  delete process.env.CLAUDE_REMOTE_LAUNCHER_HOME;
});

test('loadProjects returns an empty object when projects.json does not exist', () => {
  assert.deepEqual(projects.loadProjects(), {});
});

test('addProject registers a project and persists it to projects.json', () => {
  const project = projects.addProject('my-app', tmpProjectDir);

  assert.equal(project.name, 'my-app');
  assert.equal(project.path, path.resolve(tmpProjectDir));

  const filePath = projects.getProjectsFilePath();
  assert.ok(fs.existsSync(filePath));

  const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.deepEqual(saved, { 'my-app': project });
});

test('addProject throws when the name is missing', () => {
  assert.throws(() => projects.addProject('', tmpProjectDir), /name is required/);
});

test('addProject throws when the path is missing', () => {
  assert.throws(() => projects.addProject('my-app', ''), /path is required/);
});

test('addProject throws when the path does not exist', () => {
  const missingPath = path.join(tmpProjectDir, 'does-not-exist');
  assert.throws(() => projects.addProject('my-app', missingPath), /does not exist/);
});

test('addProject throws when the path is not a directory', () => {
  const filePath = path.join(tmpProjectDir, 'file.txt');
  fs.writeFileSync(filePath, 'hello');
  assert.throws(() => projects.addProject('my-app', filePath), /not a directory/);
});

test('addProject updates an existing project when registered again', () => {
  const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-remote-launcher-project-2-'));

  try {
    projects.addProject('my-app', tmpProjectDir);
    const updated = projects.addProject('my-app', secondDir);

    assert.equal(updated.path, path.resolve(secondDir));
    assert.equal(projects.listProjects().length, 1);
  } finally {
    fs.rmSync(secondDir, { recursive: true, force: true });
  }
});

test('getProject returns undefined for unregistered projects', () => {
  assert.equal(projects.getProject('missing'), undefined);
});

test('getProject returns the registered project', () => {
  projects.addProject('my-app', tmpProjectDir);
  const project = projects.getProject('my-app');
  assert.equal(project.name, 'my-app');
  assert.equal(project.path, path.resolve(tmpProjectDir));
});

test('listProjects returns all registered projects', () => {
  const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-remote-launcher-project-2-'));

  try {
    projects.addProject('app-one', tmpProjectDir);
    projects.addProject('app-two', secondDir);

    const list = projects.listProjects();
    assert.equal(list.length, 2);
    assert.deepEqual(
      list.map((p) => p.name).sort(),
      ['app-one', 'app-two']
    );
  } finally {
    fs.rmSync(secondDir, { recursive: true, force: true });
  }
});
