// Targeted review shots (robust): mobile layout (portrait+landscape), minimap
// visibility (element crops in 3 states), and the desktop game viewport.
// One page on the CDP default context; each shot is isolated in try/catch.
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
  await page.setViewportSize({ width: 390, height: 844 }); // start portrait-phone
  page.on('dialog', (d) => d.accept('42').catch(() => {}));

  const st = () => page.evaluate(() => window.__SNEAK.state());
  const geo = () => page.evaluate(() => {
    const c = document.getElementById('game').getBoundingClientRect();
    const m = document.getElementById('minimap').getBoundingClientRect();
    const h = document.getElementById('hud').getBoundingClientRect();
    return {
      canvas: { x: c.x, y: c.y, w: c.width, h: c.height },
      minimap: { x: m.x, y: m.y, w: m.width, h: m.height },
      hud: { x: h.x, y: h.y, w: h.width, h: h.height },
      vw: window.innerWidth, vh: window.innerHeight, scrollH: document.documentElement.scrollHeight,
    };
  });
  const shot = async (fn, label) => {
    try { await fn(); console.log('OK  ' + label); }
    catch (e) { console.log('ERR ' + label + '  [' + e.message.split('\n')[0] + ']'); }
  };
  const frame = (n) => page.screenshot({ path: path.join(DIR, n + '.png') });
  const mini = (n) => page.locator('#minimap').screenshot({ path: path.join(DIR, n + '.png') });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#game');
  await sleep(500);
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.evaluate(() => {
    document.getElementById('touch-ui').style.display = 'block';
    window.dispatchEvent(new Event('resize'));
  });
  await sleep(200);

  // ---------- PORTRAIT 390x844 ----------
  await page.evaluate(() => window.__SNEAK.reset(42));
  await sleep(1800);
  await shot(() => mini('mobile-minimap-local'), 'minimap-local');
  let g = await geo();
  console.log('PORTRAIT', JSON.stringify(g));
  await shot(() => frame('mobile-layout-portrait'), 'portrait frame');

  const c0 = (await st()).cones[0];
  await page.evaluate(([x, y]) => window.__SNEAK.teleport(x, y), [c0.x + 30, c0.y]);
  for (let i = 0; i < 160; i++) { await sleep(50); if ((await st()).alarm) break; }
  await sleep(150);
  await shot(() => mini('mobile-minimap-offline'), 'minimap-offline');
  await shot(() => frame('mobile-alarm'), 'alarm frame');

  await page.evaluate(() => window.__SNEAK.reset(42));
  await sleep(300);
  await page.evaluate(() => { window.__SNEAK.state().hasKey = true; });
  await page.evaluate(() => window.__SNEAK.teleport(19 * 32 + 16, 20 * 32 + 16));
  await sleep(1400);
  await shot(() => mini('mobile-minimap-door'), 'minimap-door');

  // ---------- LANDSCAPE 844x390 ----------
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(250);
  await page.evaluate(() => window.__SNEAK.reset(42));
  await sleep(1600);
  g = await geo();
  console.log('LANDSCAPE', JSON.stringify(g));
  await shot(() => frame('mobile-layout-landscape'), 'landscape frame');
  await shot(() => mini('mobile-minimap-landscape'), 'minimap-landscape');

  // ---------- DESKTOP VIEWPORT 720x900 ----------
  await page.setViewportSize({ width: 720, height: 900 });
  await sleep(250);
  await page.evaluate(() => { document.getElementById('touch-ui').style.display = 'none'; window.dispatchEvent(new Event('resize')); });
  await page.evaluate(() => window.__SNEAK.reset(42));
  await sleep(1800);
  console.log('DESKTOP', JSON.stringify(await geo()));
  await shot(() => frame('viewport-desktop'), 'desktop viewport');
  await shot(() => mini('desktop-minimap'), 'desktop minimap');

  await page.close();
  console.log('DONE');
  process.exit(0);
})().catch((e) => { console.error('SHOT-REVIEW ERROR:', e.message); process.exit(2); });
