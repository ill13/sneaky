// Render the minimap buffer at ~4x scale (pixelated) so the content is legible.
// Same pixels the user sees, just magnified. Door / local / offline states.
const { chromium } = require('playwright');
const path = require('path');
const URL = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;   // relative: no machine path baked in
const DIR = path.join(__dirname, 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222');
  const ctx = browser.contexts()[0] || (await browser.newContext());
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on('dialog', (d) => d.accept('42').catch(() => {}));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#game');
  await sleep(400);
  await page.keyboard.press('Enter');
  await sleep(150);

  const zoom = (n) => page.evaluate((name) => {
    const m = document.getElementById('minimap');
    m.style.width = '420px';           // ~3.4x native 125px
    m.style.height = 'auto';
  }, n);
  const shot = (n) => page.locator('#minimap').screenshot({ path: path.join(DIR, n + '.png') });

  // LOCAL: fresh run, player in spawn A with its guard
  await page.evaluate(() => window.__SNEAK.reset(42));
  await page.keyboard.press('Enter');
  await sleep(1600);
  await zoom(); await sleep(120);
  await shot('minimap-zoom-local');

  // DOOR: player in hub E, explored A+E, door closed
  await page.evaluate(() => window.__SNEAK.reset(42));
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.evaluate(() => window.__SNEAK.teleport(19 * 32 + 16, 20 * 32 + 16));
  await sleep(1500);
  await zoom(); await sleep(120);
  await shot('minimap-zoom-door');

  // OFFLINE: alarm ringing
  await page.evaluate(() => window.__SNEAK.reset(42));
  await page.keyboard.press('Enter');
  await sleep(200);
  const c0 = await page.evaluate(() => window.__SNEAK.state().cones[0]);
  await page.evaluate(([x, y]) => window.__SNEAK.teleport(x, y), [c0.x + 30, c0.y]);
  for (let i = 0; i < 200; i++) { await sleep(50); if (await page.evaluate(() => state.alarmTime > 0)) break; }
  await sleep(120);
  await zoom(); await sleep(120);
  await shot('minimap-zoom-offline');

  await page.close();
  console.log('DONE');
  process.exit(0);
})().catch((e) => { console.error('ZOOM ERROR:', e.message); process.exit(2); });
