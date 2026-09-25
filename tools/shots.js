// review shots: start modal, local radar, radar offline during alarm
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
  page.on('dialog', (d) => d.accept('1234').catch(() => {}));
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto(URL);
  await sleep(800);
  await page.screenshot({ path: path.join(DIR, 'review-start-modal.png') });

  const state = () => page.evaluate(() => window.__SNEAK.state());
  const shot = (n) => page.screenshot({ path: path.join(DIR, n + '.png') });

  // local radar: fresh run, player at spawn in room (0,0) with its patrol guard
  await page.evaluate(() => window.__SNEAK.reset(2000));
  await page.keyboard.press('Enter');
  await sleep(2500);
  await shot('review-radar-local');

  // radar offline: stand in front of the first guard until the alarm rings
  const c0 = (await state()).cones[0];
  await page.evaluate(([x, y]) => window.__SNEAK.teleport(x, y), [c0.x + 30, c0.y]);
  for (let i = 0; i < 120; i++) {
    await sleep(50);
    if ((await state()).alarm) break;
  }
  await sleep(120);
  await shot('review-radar-offline');

  // 3x3: red door discovery - stand in room E (the hub) so the minimap
  // reveals the vault door marker for the first time
  await page.evaluate(() => window.__SNEAK.reset(42));
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__SNEAK.teleport(19 * 32 + 16, 20 * 32 + 16));
  await sleep(1500);
  const alarm1 = (await state()).alarm;
  if (alarm1) console.log('WARN: alarm on door shot');
  await shot('review-3x3-door');

  // 3x3: vault approach - player standing on the door approach tile with the key,
  // red door marker visible on the local radar
  await page.evaluate(() => { window.__SNEAK.state().hasKey = true; });
  await page.evaluate(() => window.__SNEAK.teleport(23 * 32 + 16, 21 * 32 + 16));
  await sleep(1200);
  await shot('review-3x3-vault');

  await page.close();
  console.log('shots saved');
  process.exit(0);
})();
