'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const folder=process.platform==='darwin'?(process.arch==='arm64'?'mac-arm64':'mac'):process.platform==='win32'?'win-unpacked':'linux-unpacked';
const bundle=path.resolve('dist',folder,...(process.platform==='darwin'?['PocketSocket.app']:[]));
const resources=path.join(bundle,...(process.platform==='darwin'?['Contents','Resources']:['resources']));
// OS utilities cannot read scripts hidden inside app.asar. Helpers must be real files.
const helper=process.platform==='win32'?'supervisor.ps1':process.platform==='linux'?'supervisor-linux.sh':'supervisor.sh';
const supervisor=path.join(resources,'helpers',helper);
const core=path.join(resources,'core',process.platform==='win32'?'mihomo.exe':'mihomo');
assert(fs.statSync(supervisor).isFile());
assert(fs.statSync(core).isFile());
assert.equal(fs.readFileSync(supervisor, 'utf8'), fs.readFileSync(path.join('app',helper), 'utf8'));
fs.accessSync(core, fs.constants.X_OK);
if(process.platform!=='win32')execFileSync('/bin/sh',['-n',supervisor],{stdio:'inherit'});
if(process.platform==='darwin')execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',bundle],{stdio:'inherit'});
execFileSync(core, ['-v'], { stdio: 'inherit' });
execFileSync(process.execPath, ['--test', 'test/ui.test.cjs'], {
  env: { ...process.env, POCKET_TEST_EXECUTABLE: path.join(bundle,...(process.platform==='darwin'?['Contents','MacOS','PocketSocket']:[process.platform==='win32'?'PocketSocket.exe':'pocketsocket'])) }, stdio: 'inherit'
});
console.log('Packaged app, on-disk supervisor and executable core verified.');
