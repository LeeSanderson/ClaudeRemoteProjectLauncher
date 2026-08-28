'use strict';

const assert = require('node:assert/strict');
const { test, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const binPath = path.join(__dirname, '..', 'bin', 'claude-remote-launcher.js');

let tmpHome;
let tmpProjectDir;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-remote-launcher-home-'));
  tmpProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-remote-launcher-project-'));
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
  fs.rmSync(tmpProjectDir, { recursive: true, force: true });
});

function runCli(args) {
  return execFileSync('node', [binPath, ...args], {
    env: { ...process.env, CLAUDE_REMOTE_LAUNCHER_HOME: tmpHome },
    encoding: 'utf8',
  });
}

test('add-project then list-projects shows the registered project', () => {
  const addOutput = runCli(['add-project', 'my-app', tmpProjectDir]);
  assert.match(addOutput, /Registered project "my-app"/);

  const listOutput = runCli(['list-projects']);
  assert.match(listOutput, /my-app/);
  assert.match(listOutput, new RegExp(path.resolve(tmpProjectDir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('list-projects reports when no projects are registered', () => {
  const output = runCli(['list-projects']);
  assert.match(output, /No projects registered/);
});

test('launch-project reports an error for an unregistered project', () => {
  assert.throws(() => runCli(['launch-project', 'missing']), /No project registered/);
});

test('running with no command prints usage', () => {
  const output = runCli([]);
  assert.match(output, /Usage: claude-remote-launcher/);
});
