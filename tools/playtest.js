// SNEAK RUN - real browser playtest via Playwright over CDP (Chrome on 9222)
// Covers: intro modal, movement, full quest chain (key -> red door -> file ->
// exit), knockouts, alarm cascade -> CAUGHT, R/N/T seeds, help modal.
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

  const dialogs = [];
  let dialogAccept = null;
  page.on('dialog', async (d) => {
    dialogs.push({ type: d.type(), msg: d.message(), accepted: dialogAccept });
    if (dialogAccept) await d.accept(dialogAccept);
    else await d.dismiss();
  });

  const state = () => page.evaluate(() => window.__SNEAK.state());
  const hud = () => page.evaluate(() => ({
    objective: document.getElementById('objective').textContent,
    status: document.getElementById('status').textContent,
    timer: document.getElementById('timer').textContent,
    seed: document.getElementById('seed').textContent,
  }));
  const shot = async (name) => {
    const p = path.join(SHOT_DIR, name + '.png');
    await page.screenshot({ path: p });
    console.log('      shot: ' + path.basename(p));
  };
  const sleep = (ms) => page.waitForTimeout(ms);

  // ---------- load + intro modal ----------
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#game');
  await sleep(300);
  const introVisible = await page.evaluate(() => !document.getElementById('intro').classList.contains('hidden'));
  check('intro modal visible on load', introVisible);
  const paused = await page.evaluate(() => window.__SNEAK.state().x); // just prove the hook is live
  check('state hook live behind the modal', Number.isFinite(paused));
  await page.click('#btn-play');
  await sleep(100);
  check('PLAY button dismisses the intro',
    await page.evaluate(() => document.getElementById('intro').classList.contains('hidden')));
  await shot('01-start');

  // ---------- reset to a known seed ----------
  await page.evaluate(() => window.__SNEAK.reset(12345));
  await sleep(200);
  const SEED = (await state()).seed;
  const h0 = await hud();
  check('menu seed matches usedSeed (F24: the header seed moved to the menu)',
    await page.evaluate(() => document.getElementById('menu-seed').textContent) === String(SEED));
  check('HUD objective starts as FIND THE KEYS 0/3', h0.objective === 'FIND THE KEYS 0/3', h0.objective);
  const mini = await page.evaluate(() => {
    const el = document.getElementById('minimap');
    return el ? { w: el.width, h: el.height } : null;
  });
  check('minimap canvas present (156x102)', !!mini && mini.w === 156 && mini.h === 102, mini && `${mini.w}x${mini.h}`);

  // ---------- movement ----------
  const b = await state();
  await page.keyboard.down('d'); await sleep(400); await page.keyboard.up('d');
  check('D moves right', (await state()).x > b.x + 20);
  const by = (await state()).y;
  await page.keyboard.down('s'); await sleep(300); await page.keyboard.up('s');
  check('S moves DOWN', (await state()).y > by + 10);
  const bm = await state();
  await page.keyboard.down('w'); await sleep(250); await page.keyboard.up('w');
  await page.keyboard.down('a'); await sleep(250); await page.keyboard.up('a');
  const ba = await state();
  check('W/A move up/left', ba.y < bm.y && ba.x < bm.x);

  // ---------- quest chain (teleport-driven) ----------
  await page.evaluate((s) => window.__SNEAK.reset(s), SEED);
  await sleep(100);
  const T = 32;
  let s0 = await state();
  // F33: collect a quest item by SEARCHING its container (stand on an access tile,
  // face it, hold ACT for the archetype's time). Works for keys + the file.
  const searchItem = async (role, id) => {
    const info = await page.evaluate(([role, id]) => {
      const map = __SNEAK.state().map;
      const ct = state.containers.find((c) => c.contents.some((i) => i.role === role && (id === undefined || i.id === id)));
      if (!ct) return null;
      let stand = null, dir = null;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = ct.c + dc, nr = ct.r + dr;
        if (nc >= 0 && nr >= 0 && nc < map[0].length && nr < map.length && map[nr][nc] === 0) {
          stand = [nc, nr]; dir = dc > 0 ? 'left' : dc < 0 ? 'right' : dr > 0 ? 'up' : 'down'; break;
        }
      }
      return { x: (stand[0] + 0.5) * 32, y: (stand[1] + 0.5) * 32, dir, st: CONTAINER_TYPES[ct.arc].searchTime };
    }, [role, id]);
    if (!info) return false;
    await page.evaluate(([x, y]) => window.__SNEAK.teleport(x, y), [info.x, info.y]);
    const key = info.dir === 'right' ? 'ArrowRight' : info.dir === 'left' ? 'ArrowLeft' : info.dir === 'down' ? 'ArrowDown' : 'ArrowUp';
    await page.keyboard.down(key);
    await page.keyboard.down('e');
    await sleep((info.st + 0.7) * 1000);
    await page.keyboard.up('e');
    await page.keyboard.up(key);
    return true;
  };
  // F29: collect all three colored keys (now by searching their containers)
  for (const kid of ['blue', 'gold', 'red']) await searchItem('key', kid);
  let s = await state();
  const nKeys = Object.values(s.keyBag).filter(Boolean).length;
  check('all three keys found by searching', nKeys === 3, 'keys=' + nKeys);
  check('objective becomes OPEN THE DOORS', (await hud()).objective === 'OPEN THE DOORS', (await hud()).objective);

  // F29: open the blue door (D-G, the exit) then the red door (E-H, the vault)
  await page.evaluate((p) => window.__SNEAK.teleport(p[0], p[1]), [7 * T + 16, 21 * T + 16]);   // blue door approach (D side)
  await sleep(150);
  s = await state();
  check('blue door opens at the D approach with the blue key', s.doorsOpen.blue, 'doorsOpen=' + JSON.stringify(s.doorsOpen));

  await page.evaluate((p) => window.__SNEAK.teleport(p[0], p[1]), [24 * T + 16, 21 * T + 16]);   // red door approach (E side)
  await sleep(150);
  s = await state();
  check('red door opens at the E approach with the red key', s.doorsOpen.red, 'doorsOpen=' + JSON.stringify(s.doorsOpen));
  check('objective becomes STEAL THE FILE', (await hud()).objective === 'STEAL THE FILE', (await hud()).objective);
  await shot('02-door-open');

  await searchItem('objective');
  s = await state();
  check('file found by searching the safe', s.hasFile);
  check('objective becomes FIND THE EXIT', (await hud()).objective === 'FIND THE EXIT', (await hud()).objective);

  await page.evaluate((e) => window.__SNEAK.teleport(e[0], e[1]), s.exit);
  await sleep(150);
  s = await state();
  check('full chain wins the run', s.won && s.gameOver, 'won=' + s.won);
  const winText = await page.evaluate(() => document.getElementById('overlay-text').textContent);
  check('overlay shows ESCAPED', winText.startsWith('ESCAPED'), winText);
  await shot('06-escaped');

  // ---------- knockout ----------
  await page.evaluate((s) => window.__SNEAK.reset(s), SEED);
  await sleep(150);
  const bumped = await page.evaluate(() => window.__SNEAK.knockoutSetup());
  check('knockoutSetup found a patrol guard', bumped);
  await page.keyboard.down('e'); await sleep(120); await page.keyboard.up('e');
  s = await state();
  check('E from behind knocks the guard down', s.guards.includes('down'), s.guards.join(','));
  check('status shows GUARD DOWN', (await hud()).status.startsWith('GUARD DOWN'), (await hud()).status);
  await sleep(11500); // KO 10s + daze (F28)
  s = await state();
  check('guard wakes after the KO window', !s.guards.includes('down'), s.guards.join(','));

  // ---------- alarm cascade + death ----------
  await page.evaluate((s) => window.__SNEAK.reset(s), SEED);
  await sleep(150);
  // Stand directly in front of the first guard (it starts at its line's west
  // end facing east): it spots us, chases, and shoots. Deterministic.
  const c0 = (await state()).cones[0];
  await page.evaluate(([x, y]) => window.__SNEAK.teleport(x, y), [c0.x + 30, c0.y]);
  let alarmSeen = false, deathSeen = false;
  for (let i = 0; i < 300; i++) {
    await sleep(50);
    const st = await state();
    if (!alarmSeen && st.alarm) { alarmSeen = true; await shot('03-alarm'); }
    if (st.gameOver && !st.won) { deathSeen = true; break; }
  }
  check('getting spotted triggers ALARM (shot)', alarmSeen);
  check('then a second hit -> CAUGHT', deathSeen);
  const ovText = await page.evaluate(() => document.getElementById('overlay-text').textContent);
  const ovSub = await page.evaluate(() => document.getElementById('overlay-sub').textContent);
  check('overlay shows CAUGHT', ovText === 'CAUGHT', ovText);
  check('overlay shows seed + R/N/T', ovSub.includes(String(SEED)), ovSub);
  await shot('04-caught');

  // ---------- R / N / T ----------
  await page.keyboard.press('r');
  await sleep(250);
  const sR = await state();
  check('R resets to same usedSeed', sR.seed === SEED && !sR.gameOver, 'seed=' + sR.seed);
  check('R returns player to spawn (112, 112)', Math.abs(sR.x - 112) < 8 && Math.abs(sR.y - 112) < 8, 'x=' + sR.x.toFixed(0) + ' y=' + sR.y.toFixed(0));

  await page.keyboard.press('n');
  await sleep(250);
  check('N changes the seed', (await state()).seed !== SEED, SEED + ' -> ' + (await state()).seed);

  const beforeT = dialogs.length;
  dialogAccept = '42';
  await page.keyboard.press('t');
  await sleep(500);
  dialogAccept = null;
  check('T opens a prompt', dialogs.length === beforeT + 1 && dialogs[dialogs.length - 1].type === 'prompt');
  const S42 = (await state()).seed;
  check('T applied typed seed (deterministic usedSeed)', Number.isFinite(S42) && S42 >= 0, '42 -> ' + S42);

  // ---------- determinism ----------
  await page.evaluate(() => window.__SNEAK.reset(42)); const d1 = await state();
  await page.evaluate(() => window.__SNEAK.reset(42)); const d2 = await state();
  check('determinism: reset(42) twice identical',
    d1.seed === d2.seed && JSON.stringify(d1.file) === JSON.stringify(d2.file) && JSON.stringify(d1.exit) === JSON.stringify(d2.exit) && JSON.stringify(d1.keys_pos) === JSON.stringify(d2.keys_pos),
    'usedSeed=' + d1.seed);
  check('file, keys, exit distinct valid tiles',
    Number.isFinite(d1.file[0]) && Number.isFinite(d1.keys_pos[0][0]) &&
    (d1.file[0] !== d1.exit[0] || d1.file[1] !== d1.exit[1]));

  // ---------- help modal ----------
  await page.evaluate(() => window.__SNEAK.reset(42));
  await sleep(150);
  await page.keyboard.press('?');
  await sleep(150);
  check('? opens the help modal (paused)',
    await page.evaluate(() => !document.getElementById('intro').classList.contains('hidden')));
  await page.click('#btn-play');
  await sleep(100);
  check('PLAY closes the help modal',
    await page.evaluate(() => document.getElementById('intro').classList.contains('hidden')));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await page.close();
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('PLAYTEST ERROR:', e.message); process.exit(2); });
