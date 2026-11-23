// Real browser smoke checks. Authentication and live cloud writes need the owner's account.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.JPMAP_PORT = '18765';
process.env.JPMAP_HOST = '127.0.0.1';
const server = require('../server.js');
(async () => {
  let browser;
  try {
    if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    fs.mkdirSync(path.join(__dirname, '../previews'), { recursive: true });
    for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport, acceptDownloads: true });
      const page = await context.newPage(), errors = [], failedResources = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (response.url().startsWith('http://127.0.0.1:18765/') && response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`);
      });
      await page.goto('http://127.0.0.1:18765/', { waitUntil: 'domcontentloaded' });
      await page.locator('#cloudBtn').click();
      await page.locator('#cloudLoginForm').waitFor({ state: 'visible' });
      // Wait for the real official SDK, rather than mocking login or the database.
      await page.waitForFunction(() => window.cloudbase && window.JP_SYNC_CHANGE, { timeout: 25000 });
      const api = await page.evaluate(() => {
        const config = window.JP_CLOUDBASE_CONFIG;
        const claims = JSON.parse(atob(config.publishableKey.split('.')[1]));
        const app = window.cloudbase.init({ env: config.env, region: config.region, accessKey: config.publishableKey });
        return { role: claims.role, env: claims.aud, auth: typeof app.auth.getSession, rpc: typeof app.rdb().rpc };
      });
      assert.equal(api.role, 'anon');
      assert.equal(api.env, 'jpmap-d2gsyqixu8b7f8714');
      assert.equal(api.auth, 'function'); assert.equal(api.rpc, 'function');
      if (process.argv.includes('--probe-cloud') && name === 'desktop') {
        const probe = await page.evaluate(async () => {
          const config = window.JP_CLOUDBASE_CONFIG;
          const app = window.cloudbase.init({ env: config.env, region: config.region, accessKey: config.publishableKey });
          try {
            const result = await Promise.race([app.rdb().rpc('jpmap_load', {}), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000))]);
            return { code: result.error?.code, message: result.error?.message, rows: Array.isArray(result.data) ? result.data.length : undefined };
          } catch (error) { return { message: error.message }; }
        });
        console.log('Live anonymous read probe (no login or writes):', JSON.stringify(probe));
      }
      await page.screenshot({ path: path.join(__dirname, `../previews/cloud-${name}.png`) });
      const downloadEvent = page.waitForEvent('download');
      await page.locator('#cloudExportBtn').click();
      const download = await downloadEvent;
      const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
      assert.equal(exported.format, 'jpmap-backup-v1');
      assert.ok(exported.payload.places.length >= 3);
      exported.payload.places[0].note = '浏览器备份恢复验证';
      page.on('dialog', prompt => prompt.accept());
      await page.locator('#cloudImportFile').setInputFiles({ name: 'jpmap-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('jpmap-prototype-v1')).places[0].note === '浏览器备份恢复验证');
      await page.locator('#cloudBackups summary').click();
      await page.locator('#cloudRestoreBtn').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('jpmap-prototype-v1')).places[0].note !== '浏览器备份恢复验证');
      await page.locator('#closeCloudBtn').click();
      assert.equal(await page.locator('#cloudDialog').isVisible(), false);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#cloudBtn').waitFor();
      assert.deepEqual(errors, []); assert.deepEqual(failedResources, []);
      console.log(`${name}: login UI, real SDK interfaces, backup export/import/restore, reload and local assets passed`);
      await context.close();
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
