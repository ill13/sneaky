// Input-wiring check (desktop viewport): gamepad library loaded, touch dpad
// moves the player, touch buttons drive ACT/retry/new-seed. Complements
// check-mobile.js (layout/orientation) - this one is about the INPUTS.
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
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const cdp = await context.newCDPSession(page);
  const sleep = (ms) => page.waitForTimeout(ms);

  const touchStart = (x, y, id = 1) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] });
  const touchMove = (x, y, id = 1) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id }] });
  const touchEnd = (id = 1) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const tap = async (sel) => {
    const el = page.locator(sel);
    const r = await el.boundingBox();
    await touchStart(r.x + r.width / 2, r.y + r.height / 2);
    await sleep(80);
    await touchEnd();
  };
  const S = () => page.evaluate(() => window.__SNEAK.state());

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#game');
  await sleep(400);

  // dismiss the intro modal (game is paused behind it)
  await page.keyboard.press('Enter');
  await sleep(150);
  const introGone = await page.evaluate(() => document.getElementById('intro').classList.contains('hidden'));
  check('intro dismissed with Enter', introGone);

  // library loaded + enabled (UMD nests the singleton under .ResponsiveGamepad)
  const rg = await page.evaluate(() => {
    const g = window.ResponsiveGamepad;
    const inst = g && (g.ResponsiveGamepad || g);
    return {
      loaded: !!inst,
      enabled: !!(inst && inst.isEnabled && inst.isEnabled()),
      version: inst && inst.getVersion ? inst.getVersion() : '?',
    };
  });
  check('responsive-gamepad loaded + enabled', rg.loaded && rg.enabled, rg.version);

  // show the touch UI via the real 'c' toggle (same path a desktop dev uses)
  await page.keyboard.press('c');
  await sleep(150);
  const uiVisible = await page.evaluate(() => getComputedStyle(document.getElementById('touch-ui')).display === 'block');
  check('touch UI toggled visible with C', uiVisible);

  await page.evaluate(() => window.__SNEAK.reset(7));
  await sleep(200);
  const spawn = await S(); // right after reset, player is AT spawn
  const sx = spawn.x, sy = spawn.y;

  // 4-way d-pad: one hold-button per arm of the cross. Touch each button's
  // center and confirm the matching axis moves. The empty 3x3 center cell and
  // corners are dead space, so aim for the four button thirds.
  const r = await page.locator('#touch-dpad').boundingBox();
  const W = r.width, H = r.height;
  const cx = r.x + W / 2, cy = r.y + H / 2;
  const upPt    = { x: cx, y: r.y + H / 6 };
  const downPt  = { x: cx, y: r.y + 5 * H / 6 };
  const leftPt  = { x: r.x + W / 6, y: cy };
  const rightPt = { x: r.x + 5 * W / 6, y: cy };
  let s = await S();

  // ---- dpad LEFT ----
  await page.evaluate((p) => window.__SNEAK.teleport(p.x, p.y), { x: sx, y: sy });
  await sleep(60);
  let x0 = (await S()).x;
  await touchStart(leftPt.x, leftPt.y); await sleep(160); await touchEnd();
  s = await S();
  check('touch dpad LEFT moves player left', s.x < x0 - 15, `x ${x0.toFixed(0)} -> ${s.x.toFixed(0)}`);

  // ---- dpad RIGHT ----
  await page.evaluate((p) => window.__SNEAK.teleport(p.x, p.y), { x: sx, y: sy });
  await sleep(60);
  const x0r = (await S()).x;
  await touchStart(rightPt.x, rightPt.y); await sleep(160); await touchEnd();
  s = await S();
  check('touch dpad RIGHT moves player right', s.x > x0r + 15, `x ${x0r.toFixed(0)} -> ${s.x.toFixed(0)}`);

  // ---- dpad UP ----
  await page.evaluate((p) => window.__SNEAK.teleport(p.x, p.y), { x: sx, y: sy });
  await sleep(60);
  const y0u = (await S()).y;
  await touchStart(upPt.x, upPt.y); await sleep(160); await touchEnd();
  s = await S();
  check('touch dpad UP moves player up', s.y < y0u - 15, `y ${y0u.toFixed(0)} -> ${s.y.toFixed(0)}`);

  // ---- dpad DOWN ----
  await page.evaluate((p) => window.__SNEAK.teleport(p.x, p.y), { x: sx, y: sy });
  await sleep(60);
  const y0d = (await S()).y;
  await touchStart(downPt.x, downPt.y); await sleep(160); await touchEnd();
  s = await S();
  check('touch dpad DOWN moves player down', s.y > y0d + 15, `y ${y0d.toFixed(0)} -> ${s.y.toFixed(0)}`);

  // ---- diagonal: hold up + left (two simultaneous touches) ----
  await page.evaluate((p) => window.__SNEAK.teleport(p.x, p.y), { x: sx, y: sy });
  await sleep(60);
  const xd2 = (await S()).x, yd2 = (await S()).y;
  await touchStart(upPt.x, upPt.y, 1);
  await touchStart(leftPt.x, leftPt.y, 2);
  await sleep(260);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: upPt.x, y: upPt.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: leftPt.x, y: leftPt.y, id: 2 }] });
  s = await S();
  check('touch dpad diagonal (up+left) moves up+left', s.x < xd2 - 10 && s.y < yd2 - 10, `x ${xd2.toFixed(0)} -> ${s.x.toFixed(0)}, y ${yd2.toFixed(0)} -> ${s.y.toFixed(0)}`);

  // ---- ACT button (touch ACT = gamepad X): contextual action -> knockout ----
  // knockoutSetup puts the player 20px behind a guard facing east; the guard's AI
  // re-aims its facing on the next tick, so retry a few times until the rear
  // arc lines up. With no body in context the button resolves to a knockout.
  let gs = (await S()).guards;
  let knocked = false;
  for (let i = 0; i < 6 && !knocked; i++) {
    const staged = await page.evaluate(() => window.__SNEAK.knockoutSetup());
    if (!staged) break;
    await sleep(40);
    await tap('#btn-act');
    await sleep(200);
    gs = (await S()).guards;
    knocked = gs.includes('down');
  }
  check('touch ACT button (no body) knocks guard out', knocked, gs.join(','));

  // ---- Menu: RESTART (retry same seed, resets position) ----
  // the hamburger + its items are standard DOM buttons (click listeners), so use
  // Playwright's real click (what a phone tap synthesizes), not the CDP touch tap.
  const seedR = (await S()).seed;
  await page.locator('#btn-menu').click();
  await sleep(160);
  await page.locator('#menu-restart').click();
  await sleep(250);
  s = await S();
  const backAtSpawn = Math.abs(s.x - sx) < 3 && Math.abs(s.y - sy) < 3;
  check('menu RESTART retries same seed', s.seed === seedR && !s.gameOver, `${seedR} -> ${s.seed}`);
  check('menu RESTART resets player to spawn', backAtSpawn, `x=${s.x.toFixed(0)} y=${s.y.toFixed(0)} (spawn ${sx.toFixed(0)},${sy.toFixed(0)})`);

  // ---- Menu: NEW RUN (new seed) ----
  const seedBefore = (await S()).seed;
  await page.locator('#btn-menu').click();
  await sleep(160);
  await page.locator('#menu-new').click();
  await sleep(250);
  const seedAfter = (await S()).seed;
  check('menu NEW RUN changes seed', seedAfter !== seedBefore, `${seedBefore} -> ${seedAfter}`);

  // ---- Enter key: restart (same behavior as R / touch R) ----
  await page.evaluate(() => window.__SNEAK.reset(7));
  await sleep(200);
  const sx7 = (await S()).x;
  await page.evaluate((p) => window.__SNEAK.teleport(p.x + 40, p.y), { x: sx7, y: (await S()).y });
  await sleep(80);
  await page.keyboard.press('Enter');
  await sleep(250);
  const postE = await S();
  check('Enter restarts the run (player back at spawn)', Math.abs(postE.x - sx7) < 3 && !postE.gameOver, `x=${postE.x.toFixed(0)} (spawn ${sx7.toFixed(0)})`);

  await page.screenshot({ path: path.join(SHOT_DIR, 'touch-ui.png') });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await page.close();
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('CHECK-TOUCH ERROR:', e.message); process.exit(2); });
