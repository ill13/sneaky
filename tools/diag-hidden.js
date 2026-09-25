// LEGACY: written for the old 80x15 strip layout; not part of the current test suite (grid map, 69x23).
// Count hidden tiles in room 1 the moment a guard starts chasing.
const { chromium } = require('playwright');
const URL = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;   // relative: no machine path baked in
(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222');
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#game');
  await page.evaluate(() => window.__SNEAK.reset(42));

  const sleep = (ms) => page.waitForTimeout(ms);
  for (const k of ['w','a','s','d']) await page.keyboard.up(k);
  // walk right toward the room-1 guard to trigger a chase
  await page.keyboard.down('d');
  let chased = false;
  for (let i = 0; i < 200; i++) {
    const s = await page.evaluate(() => window.__SNEAK.state());
    if (s.guards.includes('chase')) { chased = true; break; }
    if (s.gameOver) break;
    await sleep(60);
  }
  await page.keyboard.up('d');
  const s = await page.evaluate(() => window.__SNEAK.state());
  console.log('chased:', chased, 'pos:', s.x.toFixed(0), s.y.toFixed(0), 'gameOver:', s.gameOver);
  const diag = await page.evaluate(() => {
    const st = window.__SNEAK.state();
    const W = 80, H = 15, T = 32;
    const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return Math.abs(a); };
    const los = (x0, y0, x1, y1) => {
      const d = Math.hypot(x1 - x0, y1 - y0); const steps = Math.max(1, Math.ceil(d / 8));
      for (let i = 1; i < steps; i++) { const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps; const c = Math.floor(x / T), r = Math.floor(y / T); if (c < 0 || r < 0 || c >= W || r >= H || st.map[r][c] === 1) return false; }
      return true;
    };
    const vis = (c, r) => { const cx = (c + 0.5) * T, cy = (r + 0.5) * T; for (const g of st.cones) { const dx = cx - g.x, dy = cy - g.y; if (Math.hypot(dx, dy) > g.range) continue; if (norm(Math.atan2(dy, dx) - g.facing) > g.fov / 2) continue; if (los(g.x, g.y, cx, cy)) return true; } return false; };
    const solid = (c, r) => c < 0 || r < 0 || c >= W || r >= H || st.map[r][c] === 1;
    let floor = 0, hidden = 0, hiddenFree2 = 0; const hiddenList = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (st.map[r][c] === 1) continue;
      floor++;
      const v = vis(c, r);
      if (!v) {
        hidden++;
        let free = 0; for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) if (!solid(c + dc, r + dr)) free++;
        if (free >= 2) { hiddenFree2++; if (hiddenList.length < 12) hiddenList.push([c, r, free]); }
      }
    }
    // report guard cones
    const cones = st.cones.map((g) => ({ x: g.x.toFixed(0), y: g.y.toFixed(0), facing: g.facing.toFixed(2), fov: (g.fov * 180 / Math.PI).toFixed(0), range: g.range.toFixed(0) }));
    return { floor, hidden, hiddenFree2, hiddenList, cones, player: [st.x.toFixed(0), st.y.toFixed(0)] };
  });
  console.log(JSON.stringify(diag, null, 2));
  await page.close();
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
