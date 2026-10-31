'use strict';
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { version } = require('./core-manifest.json');
const app = require('../package.json');
(async () => {
  await fs.mkdir('dist', { recursive: true });
  execFileSync('git', ['archive', '--format=tar.gz', '--prefix=PocketSocket/', '--output', path.resolve('dist', `PocketSocket-${app.version}-source.tar.gz`), 'HEAD']);
  const r = await fetch(`https://codeload.github.com/MetaCubeX/mihomo/tar.gz/refs/tags/${version}`, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`Source download failed: ${r.status}`);
  await fs.writeFile(path.join('dist', `mihomo-${version}-source.tar.gz`), Buffer.from(await r.arrayBuffer()));
  await fs.copyFile('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md');
  const files = (await fs.readdir('dist')).filter(n => /\.(dmg|zip|tar\.gz)$/.test(n)).sort();
  const lines = [];
  for (const name of files) {
    const digest = createHash('sha256').update(await fs.readFile(path.join('dist', name))).digest('hex');
    lines.push(`${digest}  ${name}`);
  }
  await fs.writeFile('dist/SHA256SUMS.txt', lines.join('\n') + '\n');
  console.log('Application/source archives and SHA256SUMS ready.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
