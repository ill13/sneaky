// Definitive minimap legibility: read the exact 156x102 minimap buffer, upscale
// 4x with imageSmoothing OFF (crisp), and save. Same pixels the user sees.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const URL = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;   // relative: no machine path baked in
const DIR = path.join(__dirname, 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCALE = 4;

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

  // grab the minimap buffer, upscale SCALE x (no smoothing), return PNG dataURL
  const grab = () => page.evaluate((SC) => {
    const m = document.getElementById('minimap');
    const w = m.width, h = m.height;               // 156 x 102 internal buffer
    const out = document.createElement('canvas');
    out.width = w * SC; out.height = h * SC;
    const c = out.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#000'; c.fillRect(0, 0, out.width, out.height);
    c.drawImage(m, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }, SCALE);
  const save = (dataUrl, name) => {
    const b64 = dataUrl.split(',')[1];
    fs.writeFileSync(path.join(DIR, name + '.png'), Buffer.from(b64, 'base64'));
    console.log('saved ' + name);
  };

  // LOCAL
  await page.evaluate(() => window.__SNEAK.reset(42));
  await page.keyboard.press('Enter');
  await sleep(1600);
  save(await grab(), 'minimap-big-local');

  // DOOR (player in hub E)
  await page.evaluate(() => window.__SNEAK.reset(42));
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.evaluate(() => window.__SNEAK.teleport(19 * 32 + 16, 20 * 32 + 16));
  await sleep(1500);
  save(await grab(), 'minimap-big-door');

  // OFFLINE (alarm)
  await page.evaluate(() => window.__SNEAK.reset(42));
  await page.keyboard.press('Enter');
  await sleep(200);
  const c0 = await page.evaluate(() => window.__SNEAK.state().cones[0]);
  await page.evaluate(([x, y]) => window.__SNEAK.teleport(x, y), [c0.x + 30, c0.y]);
  for (let i = 0; i < 200; i++) { await sleep(50); if (await page.evaluate(() => state.alarmTime > 0)) break; }
  await sleep(120);
  save(await grab(), 'minimap-big-offline');

  await page.close();
  console.log('DONE');
  process.exit(0);
})().catch((e) => { console.error('ZOOM2 ERROR:', e.message); process.exit(2); });
