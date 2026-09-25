// Verify the "you got spotted" orange edge pulse: put the player inside a guard's
// cone, catch the frames right after the spot.
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

  await page.evaluate(() => window.__SNEAK.reset(42));
  await sleep(300);
  // place the player ~50px in front of guard 0, inside its facing cone
  const g = await page.evaluate(() => {
    const gu = state.guards.find((x) => x.state === 'patrol') || state.guards[0];
    return { x: gu.x, y: gu.y, f: gu.facing };
  });
  // ~130px out: inside the 192px vision range but outside the 60px shoot range,
  // so the guard spots + chases (orange pulse) without immediately shooting/alarming
  const px = g.x + Math.cos(g.f) * 130, py = g.y + Math.sin(g.f) * 130;
  await page.evaluate(([x, y]) => window.__SNEAK.teleport(x, y), [px, py]);
  await sleep(150);   // ~0.15s after spot: pulse still strong, guard not yet in shoot range
  await page.screenshot({ path: path.join(DIR, 'spot-clean-1.png') });
  await sleep(150);
  await page.screenshot({ path: path.join(DIR, 'spot-clean-2.png') });
  const sf = await page.evaluate(() => ({ spotFlash: +state.spotFlash.toFixed(2), chase: state.guards.some((x) => x.state === 'chase'), alarm: state.alarmTime > 0 }));
  console.log('state', JSON.stringify(sf));
  await page.close();
  console.log('DONE');
  process.exit(0);
})().catch((e) => { console.error('SPOT ERROR:', e.message); process.exit(2); });
