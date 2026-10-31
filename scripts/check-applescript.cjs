'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeLaunchScript } = require('../app/lib/privilege.cjs');
if (process.platform !== 'darwin') throw new Error('AppleScript compilation requires macOS.');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketsocket-applescript-'));
try {
  const script = makeLaunchScript({ core: "/Applications/Pocket Socket's.app/mihomo", config: '/tmp/config.json', supervisor: '/tmp/supervisor.sh', lease: '/tmp/lease', parentPid: 1234, parentStart: 'Sat Oct 31 12:00:00 2026', coreHash: 'a'.repeat(64) });
  const source = path.join(dir, 'launch.applescript');
  fs.writeFileSync(source, script);
  execFileSync('/usr/bin/osacompile', ['-o', path.join(dir, 'launch.scpt'), source]);
  console.log('Authorization AppleScript compiled; not executed.');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
