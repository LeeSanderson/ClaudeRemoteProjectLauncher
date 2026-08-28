'use strict';

const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpHome;
let tmpProjectDir;
let projects;
let launcher;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-remote-launcher-home-'));
  tmpProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-remote-launcher-project-'));
  process.env.CLAUDE_REMOTE_LAUNCHER_HOME = tmpHome;
  delete require.cache[require.resolve('../lib/projects')];
  delete require.cache[require.resolve('../lib/launcher')];
  projects = require('../lib/projects');
  launcher = require('../lib/launcher');
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
  fs.rmSync(tmpProjectDir, { recursive: true, force: true });
  delete process.env.CLAUDE_REMOTE_LAUNCHER_HOME;
  delete process.env.CLAUDE_CLI_COMMAND;
  delete process.env.CLAUDE_REMOTE_FLAG;
});

test('launchProject throws when the project is not registered', () => {
  assert.throws(() => launcher.launchProject('missing'), /No project registered/);
});

test('launchProject spawns the claude CLI with remote flag and project cwd', () => {
  projects.addProject('my-app', tmpProjectDir);

  const calls = [];
  const fakeChild = new EventEmitter();
  const spawnFn = (command, args, options) => {
    calls.push({ command, args, options });
    return fakeChild;
  };

  const child = launcher.launchProject('my-app', { spawnFn });

  assert.equal(child, fakeChild);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'claude');
  assert.deepEqual(calls[0].args, ['--remote-control']);
  assert.equal(calls[0].options.cwd, path.resolve(tmpProjectDir));
  assert.equal(calls[0].options.stdio, 'inherit');
});

test('launchProject honours CLAUDE_CLI_COMMAND and CLAUDE_REMOTE_FLAG overrides', () => {
  projects.addProject('my-app', tmpProjectDir);
  process.env.CLAUDE_CLI_COMMAND = 'custom-claude';
  process.env.CLAUDE_REMOTE_FLAG = '--rc';

  const calls = [];
  const fakeChild = new EventEmitter();
  const spawnFn = (command, args, options) => {
    calls.push({ command, args, options });
    return fakeChild;
  };

  launcher.launchProject('my-app', { spawnFn });

  assert.equal(calls[0].command, 'custom-claude');
  assert.deepEqual(calls[0].args, ['--rc']);
});
