// 0.1.0 layout review: whole-facility board, in-world cones, "!" cue, 4-way
// dpad, version tag. One page on the CDP default context, isolated shots.
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
  await page.setViewportSize({ width: 390, height: 844 });
  page.on('dialog', (d) => d.accept('42').catch(() => {}));

  const geo = () => page.evaluate(() => {
    const c = document.getElementById('game').getBoundingClientRect();
    const h = document.getElementById('hud').getBoundingClientRect();
    const m = document.getElementById('minimap').getBoundingClientRect();
    const d = document.getElementById('touch-dpad').getBoundingClientRect();
    const ver = document.getElementById('ver');
    return {
      canvas: { x: c.x, y: c.y, w: Math.round(c.width), h: Math.round(c.height) },
      hud: { w: Math.round(h.width), h: Math.round(h.height) },
      minimapVisible: m.width > 0 && getComputedStyle(document.getElementById('minimap')).display !== 'none',
      dpad: { x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.width), h: Math.round(d.height) },
      ver: ver ? ver.textContent : null,
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
  const frame = (n) => page.screenshot({ path: path.join(DIR, n + '.png') });
  const shot = async (fn, label) => {
    try { await fn(); console.log('OK  ' + label); }
    catch (e) { console.log('ERR ' + label + '  [' + e.message.split('\n')[0] + ']'); }
  };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#game');
  await sleep(400);
  // force touch UI on (desktop CDP is a fine pointer) so the 4-way pad shows
  await page.evaluate(() => { document.getElementById('touch-ui').style.display = 'block'; window.dispatchEvent(new Event('resize')); });
  await sleep(250);

  // ---------- INTRO (version tag + rules) ----------
  console.log('INTRO', JSON.stringify(await geo()));
  await shot(() => frame('v010-intro-portrait'), 'intro (version tag)');

  // ---------- PORTRAIT mid-run (whole board + cones + 4-way pad) ----------
  await page.evaluate(() => { document.getElementById('intro').classList.add('hidden'); });
  await page.evaluate(() => window.__SNEAK.reset(42));
  await sleep(1700);
  console.log('PORTRAIT', JSON.stringify(await geo()));
  await shot(() => frame('v010-portrait-run'), 'portrait run');

  // ---------- "!" cue: put the player in front of a guard -> chase ----------
  const cone = await page.evaluate(() => {
    const g = window.__SNEAK.state().cones.find((c) => c.state === 'patrol') || window.__SNEAK.state().cones[0];
    return { x: g.x, y: g.y, facing: g.facing };
  });
  await page.evaluate((c) => window.__SNEAK.teleport(c.x + Math.cos(c.facing) * 130, c.y + Math.sin(c.facing) * 130), cone);
  for (let i = 0; i < 40; i++) { await sleep(40); if ((await page.evaluate(() => window.__SNEAK.state().guards)).some((s) => s === 'chase')) break; }
  await sleep(120);
  console.log('SPOT state:', await page.evaluate(() => JSON.stringify({ spotFlash: window.__SNEAK.state() ? null : null, guards: window.__SNEAK.state().guards })));
  await shot(() => frame('v010-portrait-spotted'), 'portrait spotted (! cue)');

  // ---------- LANDSCAPE ----------
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(250);
  await page.evaluate(() => window.__SNEAK.reset(42));
  await sleep(1600);
  console.log('LANDSCAPE', JSON.stringify(await geo()));
  await shot(() => frame('v010-landscape-run'), 'landscape run');

  // ---------- DESKTOP ----------
  await page.setViewportSize({ width: 720, height: 900 });
  await sleep(250);
  await page.evaluate(() => { document.getElementById('touch-ui').style.display = 'none'; window.dispatchEvent(new Event('resize')); });
  await page.evaluate(() => window.__SNEAK.reset(42));
  await sleep(1800);
  console.log('DESKTOP', JSON.stringify(await geo()));
  await shot(() => frame('v010-desktop-run'), 'desktop run');

  await page.close();
  console.log('DONE');
  process.exit(0);
})().catch((e) => { console.error('SHOT-010 ERROR:', e.message); process.exit(2); });
