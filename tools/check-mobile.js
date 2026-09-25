// Mobile-first layout check: phone-sized viewports (portrait + landscape,
// dpr 3), verifies the canvas fits, nothing scrolls, the touch UI stays on
// screen and still works, and takes screenshots of both orientations.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;   // relative: no machine path baked in
const SHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  [' + extra + ']' : ''));
  ok ? pass++ : fail++;
}

(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const cdp = await context.newCDPSession(page);
  const sleep = (ms) => page.waitForTimeout(ms);

  const touchStart = (x, y, id = 1) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] });
  const touchMove = (x, y, id = 1) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id }] });
  const touchEnd = (id = 1) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  const geom = () => page.evaluate(() => {
    const c = document.getElementById('game').getBoundingClientRect();
    const d = document.getElementById('touch-dpad').getBoundingClientRect();
    const b = document.getElementById('btn-act').getBoundingClientRect();   // the contextual action button
    const mi = document.getElementById('minimap').getBoundingClientRect();
    const r = document.getElementById('rotate-hint');
    return {
      canvas: { x: c.x, y: c.y, w: c.width, h: c.height },
      dpad: { x: d.x, y: d.y, w: d.width, h: d.height },
      btnNew: { x: b.x, y: b.y, w: b.width, h: b.height },
      minimap: { x: mi.x, y: mi.y, w: mi.width, h: mi.height, hidden: getComputedStyle(document.getElementById('minimap')).display === 'none' },
      scrollH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
      rotateHintShown: getComputedStyle(r).display !== 'none',
      coarse: matchMedia('(pointer: coarse)').matches,
    };
  });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#game');
  await sleep(400);

  // dismiss the intro modal (Enter works on touch too)
  await page.keyboard.press('Enter');
  await sleep(150);

  // force the touch UI visible (desktop chrome emulates fine pointer)
  await page.evaluate(() => {
    document.getElementById('touch-ui').style.display = 'block';
    window.dispatchEvent(new Event('resize'));
  });
  await sleep(150);
  await page.evaluate(() => window.__SNEAK.reset(7));
  await sleep(200);

  // ============ PORTRAIT 390x844 ============
  let g = await geom();
  check('P: canvas fits viewport width', g.canvas.w <= 390 && g.canvas.x >= 0, `${g.canvas.w.toFixed(0)}x${g.canvas.h.toFixed(0)} at x=${g.canvas.x.toFixed(0)}`);
  check('P: canvas is full-bleed (fills the column top to bottom)', g.canvas.w >= 370 && g.canvas.h >= 844 - 96, `w=${g.canvas.w.toFixed(0)} h=${g.canvas.h.toFixed(0)} (viewport 390x844)`);
  check('P: no page scroll', g.scrollH <= g.innerH + 1, `scroll ${g.scrollH} vs ${g.innerH}`);
  check('P: dpad fully on screen', g.dpad.x >= 0 && g.dpad.y >= 0 && g.dpad.y + g.dpad.h <= 844,
    `${g.dpad.w.toFixed(0)}px at (${g.dpad.x.toFixed(0)},${g.dpad.y.toFixed(0)})`);
  check('P: buttons fully on screen', g.btnNew.y + g.btnNew.h <= 844 && g.btnNew.x + g.btnNew.w <= 390,
    `${g.btnNew.w.toFixed(0)}px at (${g.btnNew.x.toFixed(0)},${g.btnNew.y.toFixed(0)})`);
  check('P: minimap retired (hidden, sight wedges now in-world)', g.minimap.hidden, 'display=' + (g.minimap.hidden ? 'none' : 'visible'));
  console.log('      (info) pointer:coarse emulated =', g.coarse, '| rotate hint shown =', g.rotateHintShown);

  // touch works at phone size
  const px0 = await page.evaluate(() => window.__SNEAK.state().x);
  await touchStart(g.dpad.x + 10, g.dpad.y + g.dpad.h / 2);
  await sleep(120);
  await touchMove(g.dpad.x + 8, g.dpad.y + g.dpad.h / 2 + 2);
  await sleep(300);
  await touchEnd();
  const px1 = await page.evaluate(() => window.__SNEAK.state().x);
  check('P: touch dpad moves player', px1 < px0 - 10, `x ${px0.toFixed(0)} -> ${px1.toFixed(0)}`);

  await page.screenshot({ path: path.join(SHOT_DIR, 'mobile-portrait.png') });

  // ============ LANDSCAPE 844x390 ============
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(250);
  await page.evaluate(() => window.__SNEAK.reset(7));
  await sleep(200);

  g = await geom();
  const wantH = 390 - 16; // full-bleed: canvas = viewport - padding (16); the header now lives in the canvas top strip
  check('L: canvas sized by height budget', Math.abs(g.canvas.h - wantH) < 6, `h=${g.canvas.h.toFixed(0)} (want ~${wantH.toFixed(0)})`);
  check('L: canvas fully in viewport', g.canvas.y >= 0 && g.canvas.y + g.canvas.h <= 390 && g.canvas.x >= 0 && g.canvas.x + g.canvas.w <= 844,
    `${g.canvas.w.toFixed(0)}x${g.canvas.h.toFixed(0)} at (${g.canvas.x.toFixed(0)},${g.canvas.y.toFixed(0)})`);
  check('L: no page scroll', g.scrollH <= g.innerH + 1, `scroll ${g.scrollH} vs ${g.innerH}`);
  check('L: dpad fully on screen', g.dpad.x >= 0 && g.dpad.y >= 0 && g.dpad.y + g.dpad.h <= 390,
    `${g.dpad.w.toFixed(0)}px at (${g.dpad.x.toFixed(0)},${g.dpad.y.toFixed(0)})`);
  check('L: buttons fully on screen', g.btnNew.y + g.btnNew.h <= 390 && g.btnNew.x + g.btnNew.w <= 844,
    `${g.btnNew.w.toFixed(0)}px at (${g.btnNew.x.toFixed(0)},${g.btnNew.y.toFixed(0)})`);
  check('L: minimap retired (hidden, sight wedges now in-world)', g.minimap.hidden, 'display=' + (g.minimap.hidden ? 'none' : 'visible'));

  // touch still works after the resize (library rect re-cache)
  const lx0 = await page.evaluate(() => window.__SNEAK.state().x);
  await touchStart(g.dpad.x + 10, g.dpad.y + g.dpad.h / 2);
  await sleep(120);
  await touchMove(g.dpad.x + 8, g.dpad.y + g.dpad.h / 2 - 2);
  await sleep(300);
  await touchEnd();
  const lx1 = await page.evaluate(() => window.__SNEAK.state().x);
  check('L: touch dpad works after resize', lx1 < lx0 - 10, `x ${lx0.toFixed(0)} -> ${lx1.toFixed(0)}`);

  await page.screenshot({ path: path.join(SHOT_DIR, 'mobile-landscape.png') });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await context.close();
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('CHECK-MOBILE ERROR:', e.message); process.exit(2); });
