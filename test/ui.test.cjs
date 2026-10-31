'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { profile, privateKey } = require('./fixtures.cjs');
const { _electron: electron } = require('playwright');
test('desktop UI loads with isolated renderer, correct platform and safe idle state', { timeout: 45000 }, async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch(process.env.POCKET_TEST_EXECUTABLE
    ? { executablePath: process.env.POCKET_TEST_EXECUTABLE, args: [], env, timeout: 30000 }
    : { args: [path.resolve(__dirname, '..')], env, timeout: 30000 });
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pocketsocket-ui-'));
  try {
    const page = await desktop.firstWindow();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('#apps input').first().waitFor();
    assert.equal(await page.title(), 'PocketSocket');
    assert.equal(await page.locator('#apps input:checked').count(), 1);
    assert.equal(await page.locator('#connect').isDisabled(), true);
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    const result = await page.evaluate(() => window.pocket.initial());
    assert.equal(result.ok, true);
    assert.equal(result.value.platform, process.platform);
    assert.equal(result.value.state.hasSession, false);
    if (process.platform !== 'darwin') assert.equal(await page.locator('#platform-warning').isVisible(), true);
    const filename = path.join(temp, 'test-profile.conf');
    await fs.writeFile(filename, profile, { mode: 0o600 });
    await desktop.evaluate(({ dialog }, filename) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    }, filename);
    await page.locator('#import').click();
    await page.waitForFunction(() => document.getElementById('profile-title').textContent === 'test-profile.conf');
    assert.equal(await page.locator('#connect').isEnabled(), process.platform === 'darwin');
    const imported = await page.evaluate(() => window.pocket.initial());
    assert(!JSON.stringify(imported).includes(privateKey), 'Private keys must not cross into renderer state.');
    await fs.writeFile(filename, profile + '\n[Peer]\n');
    await page.locator('#import').click();
    await page.waitForFunction(() => document.getElementById('message').classList.contains('error'));
    assert.equal(await page.locator('#profile-title').textContent(), 'test-profile.conf', 'Invalid replacement must keep the valid profile.');
    await page.locator('#forget').click();
    await page.waitForFunction(() => document.getElementById('profile-title').textContent === 'WireGuard dosyasını seç');
    assert.equal(await page.locator('#connect').isDisabled(), true);
    await page.locator('#apps input').first().uncheck();
    assert.equal(await page.locator('#route-apps').textContent(), 'Uygulama seçilmedi');
    await page.locator('#apps input').first().check();
    await page.locator('#diagnostics summary').click();
    assert.equal(await page.locator('#empty').isVisible(), true);
    assert.deepEqual(errors, []);
    await page.locator('#diagnostics summary').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await fs.mkdir('.build', { recursive: true });
    await page.screenshot({ path: '.build/desktop.png' });
  } finally { await desktop.close(); await fs.rm(temp, { recursive: true, force: true }); }
});
