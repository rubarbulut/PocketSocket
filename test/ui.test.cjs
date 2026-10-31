'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { _electron: electron } = require('playwright');
test('desktop UI loads with isolated renderer, correct platform and safe idle state', { timeout: 45000 }, async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({ args: [path.resolve(__dirname, '..')], env, timeout: 30000 });
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
  } finally { await desktop.close(); }
});
