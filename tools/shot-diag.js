// Diagnostic: ground-truth state + clean mobile frames for door & alarm minimap states.
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
  await page.evaluate(() => { document.getElementById('touch-ui').style.display = 'block'; window.dispatchEvent(new Event('resize')); });
  await sleep(150);

  const diag = () => page.evaluate(() => {
    const p = state.player;
    const rc = Math.floor(p.x / 32), rr = Math.floor(p.y / 32);
    const dc = rc - 1, dr = rr - 1;
    const inGrid = dc >= 0 && dr >= 0 && Math.floor(dc / 17) <= 2 && Math.floor(dr / 11) <= 2 && dc % 17 <= 15 && dr % 11 <= 9;
    const curRoom = inGrid ? [Math.floor(dc / 17), Math.floor(dr / 11)] : null;
    const mi = document.getElementById('minimap').getBoundingClientRect();
    const guardsInCur = state.guards.filter((g) => {
      const gc = Math.floor(g.x / 32), gr = Math.floor(g.y / 32);
      const gdc = gc - 1, gdr = gr - 1;
      return gdc >= 0 && gdr >= 0 && curRoom && Math.floor(gdc / 17) === curRoom[0] && Math.floor(gdr / 11) === curRoom[1];
    }).map((g) => g.state);
    return {
      player: [Math.round(p.x), Math.round(p.y)], tile: [rc, rr], curRoom,
      explored: state.explored.slice(), doorTiles: state.doorTiles, doorOpen: state.doorOpen,
      hasKey: state.hasKey, alarm: state.alarmTime > 0, alarmTime: +state.alarmTime.toFixed(1),
      guardsInCur, minimapRect: { x: Math.round(mi.x), y: Math.round(mi.y), w: Math.round(mi.width), h: Math.round(mi.height) },
    };
  });
  const frame = (n) => page.screenshot({ path: path.join(DIR, n + '.png') });
  const mini = (n) => page.locator('#minimap').screenshot({ path: path.join(DIR, n + '.png') });

  // ---- DOOR state (player in hub E, key in hand) ----
  await page.evaluate(() => window.__SNEAK.reset(42));
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.evaluate(() => { window.__SNEAK.state().hasKey = true; });
  await page.evaluate(() => window.__SNEAK.teleport(19 * 32 + 16, 20 * 32 + 16));
  await sleep(1600);
  console.log('DOOR', JSON.stringify(await diag()));
  await frame('mobile-door-frame');
  await mini('mobile-minimap-door');

  // ---- ALARM / OFFLINE state ----
  await page.evaluate(() => window.__SNEAK.reset(42));
  await page.keyboard.press('Enter');
  await sleep(200);
  const c0 = (await page.evaluate(() => window.__SNEAK.state().cones[0]));
  await page.evaluate(([x, y]) => window.__SNEAK.teleport(x, y), [c0.x + 30, c0.y]);
  for (let i = 0; i < 200; i++) { await sleep(50); if ((await page.evaluate(() => window.__SNEAK.state().alarm))) break; }
  await sleep(120);
  console.log('OFFLINE', JSON.stringify(await diag()));
  await frame('mobile-alarm-frame');
  await mini('mobile-minimap-offline');

  await page.close();
  console.log('DONE');
  process.exit(0);
})().catch((e) => { console.error('DIAG ERROR:', e.message); process.exit(2); });
