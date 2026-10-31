'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
if (process.platform !== 'darwin') throw new Error('Packaged app validation requires macOS.');
const folder = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
const bundle = path.resolve('dist', folder, 'PocketSocket.app');
const resources = path.join(bundle, 'Contents', 'Resources');
// OS utilities cannot read scripts hidden inside app.asar. Helpers must be real files.
const supervisor = path.join(resources, 'helpers', 'supervisor.sh');
const core = path.join(resources, 'core', 'mihomo');
assert(fs.statSync(supervisor).isFile());
assert(fs.statSync(core).isFile());
assert.equal(fs.readFileSync(supervisor, 'utf8'), fs.readFileSync('app/supervisor.sh', 'utf8'));
fs.accessSync(core, fs.constants.X_OK);
execFileSync('/bin/sh', ['-n', supervisor], { stdio: 'inherit' });
execFileSync(core, ['-v'], { stdio: 'inherit' });
execFileSync(process.execPath, ['--test', 'test/ui.test.cjs'], {
  env: { ...process.env, POCKET_TEST_EXECUTABLE: path.join(bundle, 'Contents', 'MacOS', 'PocketSocket') }, stdio: 'inherit'
});
console.log('Packaged app, on-disk supervisor and executable core verified.');
