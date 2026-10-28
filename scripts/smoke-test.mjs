// End-to-end check of the web build in headless Chromium (iPhone viewport):
// create a game from the template, play it with touch, persist a save,
// reload, then reopen and play with the network offline.
// Usage: node scripts/smoke-test.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const ROOT = new URL('../app/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
  if (path === '' || path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const url = 'http://localhost:' + server.address().port + '/';

const fail = msg => { throw new Error(msg); };
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));

try {
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.click('#new-btn');
  await page.fill('#new-name', 'Smoke Test');
  await page.click('dialog button[value=ok]');

  const frame = page.frameLocator('.game-frame');
  await frame.locator('canvas').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  if (await page.isVisible('#error')) fail('game error: ' + await page.textContent('#error-text'));

  // Tap to start, then drag via touch to steer.
  const box = await page.locator('.game-frame').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height * 0.7;
  await page.touchscreen.tap(cx, cy);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Exercise the save channel from inside the sandbox.
  const gameFrame = page.frames().find(f => f !== page.mainFrame());
  const sandboxed = await gameFrame.evaluate(() => {
    let blocked = false;
    try { localStorage.length; } catch { blocked = true; }
    Vale.save({ best: 4242 });
    return blocked;
  });
  if (!sandboxed) fail('game frame can access storage; sandbox is not applied');
  await page.waitForTimeout(300);
  if (await page.isVisible('#error')) fail('game error: ' + await page.textContent('#error-text'));
  await page.click('#close-btn');

  // Reload and confirm the project and its save data persisted.
  await page.reload();
  await page.locator('.card h3', { hasText: 'Smoke Test' }).waitFor();

  // Offline relaunch.
  await context.setOffline(true);
  await page.reload();
  await page.locator('.card h3', { hasText: 'Smoke Test' }).waitFor();
  await page.click('.card button.primary');
  await frame.locator('canvas').waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  const best = await page.frames().find(f => f !== page.mainFrame()).evaluate(() => Vale.saveData.best);
  if (best !== 4242) fail('save data not restored, got ' + best);
  if (await page.isVisible('#error')) fail('offline game error: ' + await page.textContent('#error-text'));
  await page.screenshot({ path: process.env.SCREENSHOT || 'smoke-test.png' });
  if (errors.length) fail('page errors: ' + errors.join('; '));
  console.log('smoke test passed');
} finally {
  await browser.close();
  server.close();
}
