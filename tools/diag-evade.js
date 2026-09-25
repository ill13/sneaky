// LEGACY: written for the old 80x15 strip layout; not part of the current test suite (grid map, 69x23).
// Call evadeStep at chase time and report WHY it returns what it does.
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
  await page.keyboard.down('d');
  let chased = false;
  for (let i = 0; i < 200; i++) {
    const s = await page.evaluate(() => window.__SNEAK.state());
    if (s.guards.includes('chase')) { chased = true; break; }
    if (s.gameOver) break;
    await sleep(60);
  }
  await page.keyboard.up('d');

  const out = await page.evaluate(() => {
    const st = window.__SNEAK.state();
    const W = 80, H = 15, T = 32;
    const key = (c, r) => r * W + c;
    const solid = (c, r) => c < 0 || r < 0 || c >= W || r >= H || st.map[r][c] === 1;
    const pc = [Math.floor(st.x / T), Math.floor(st.y / T)];
    const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return Math.abs(a); };
    const los = (x0, y0, x1, y1) => { const d = Math.hypot(x1 - x0, y1 - y0); const steps = Math.max(1, Math.ceil(d / 8)); for (let i = 1; i < steps; i++) { const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps; const c = Math.floor(x / T), r = Math.floor(y / T); if (c < 0 || r < 0 || c >= W || r >= H || st.map[r][c] === 1) return false; } return true; };
    const vis = (c, r) => { const cx = (c + 0.5) * T, cy = (r + 0.5) * T; for (const g of st.cones) { const dx = cx - g.x, dy = cy - g.y; if (Math.hypot(dx, dy) > g.range) continue; if (norm(Math.atan2(dy, dx) - g.facing) > g.fov / 2) continue; if (los(g.x, g.y, cx, cy)) return true; } return false; };
    let best = null, bestScore = -1e9;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (st.map[r][c] === 1) continue;
      if (vis(c, r)) continue;
      let free = 0; for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) if (!solid(c + dc, r + dr)) free++;
      if (free < 2) continue;
      const chaser = st.cones[0]; // nearest chaser approx
      const distToChaser = Math.hypot((c + 0.5) * T - chaser.x, (r + 0.5) * T - chaser.y);
      const score = distToChaser + free * 8;
      if (score > bestScore) { bestScore = score; best = [c, r]; }
    }
    // BFS reachability to best
    const prev = new Map([[key(pc[0], pc[1]), null]]);
    const q = [[pc[0], pc[1]]];
    let reached = false;
    while (q.length) {
      const [c, r] = q.shift();
      if (c === best[0] && r === best[1]) { reached = true; break; }
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nc = c + dc, nr = r + dr;
        if (solid(nc, nr) || prev.has(key(nc, nr))) continue;
        prev.set(key(nc, nr), [c, r]);
        q.push([nc, nr]);
      }
    }
    return { pc, best, bestScore: bestScore.toFixed(0), reached, mapDims: [st.map.length, st.map[0].length], mapType: typeof st.map[0][0] };
  });
  console.log('chased:', chased);
  console.log(JSON.stringify(out, null, 2));
  await page.close();
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
