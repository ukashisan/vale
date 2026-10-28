// End-to-end check of the web build in headless Chromium (iPhone viewport):
// create a game from the template, play it with touch, persist a save,
// reload, then reopen and play with the network offline.
// Usage: node scripts/smoke-test.mjs
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
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

// Every template file must be in the service worker's offline cache list.
const sw = await readFile(join(ROOT, 'sw.js'), 'utf8');
const templateIds = await readdir(join(ROOT, 'templates'));
for (const id of templateIds) {
  const m = JSON.parse(await readFile(join(ROOT, 'templates', id, 'manifest.json'), 'utf8'));
  for (const f of ['manifest.json', ...m.files, ...m.assets]) {
    if (!sw.includes("'templates/" + id + '/' + f + "'")) fail('sw.js does not cache templates/' + id + '/' + f);
  }
}
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
  await page.click('#close-btn');

  // Create and play every template, still offline.
  for (const id of templateIds) {
    await page.click('#new-btn');
    await page.fill('#new-name', 'T ' + id);
    await page.check('input[name=template][value="' + id + '"]');
    await page.click('dialog button[value=ok]');
    await frame.locator('canvas').waitFor({ timeout: 10000 });
    const b = await page.locator('.game-frame').boundingBox();
    // Taps across the screen, then hold the lower-left (platformer's move button) and lower-right.
    for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.3], [0.1, 0.9], [0.8, 0.9]]) {
      await page.touchscreen.tap(b.x + b.width * fx, b.y + b.height * fy);
      await page.waitForTimeout(250);
    }
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.9);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await page.waitForTimeout(1000);
    if (await page.isVisible('#error')) fail(id + ': ' + await page.textContent('#error-text'));
    if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT.replace('.png', '-' + id + '.png') });
    await page.click('#close-btn');
  }
  if (errors.length) fail('page errors: ' + errors.join('; '));
  console.log('smoke test passed');
} finally {
  await browser.close();
  server.close();
}
