// SNEAK RUN - playability bot: proves the game is WINNABLE.
// Dumb BFS bot: walks to the file, then the exit. Hides (stands still)
// while a guard chases (pre-alarm chasers give up in 2.5s).
// Tries a series of seeds; clearing at least one = winnable.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const SHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const URL = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;   // relative: no machine path baked in
const SEEDS = [42, 7, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000];

// Runs IN the page (page.evaluate serializes the callback body only).
// Avoids tiles inside guard sight cones (simple raycast LOS), like a human would.
const bfsNext = ([map, pc, tc, cones, hasKey]) => {
  const W = 69, H = 23, T = 32;
  const key = (c, r) => r * W + c;
  const solid = (c, r) => c < 0 || r < 0 || c >= W || r >= H || map[r][c] === 1 || (map[r][c] === 2 && !hasKey);
  if (solid(tc[0], tc[1])) return null;

  const los = (x0, y0, x1, y1) => {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(d / 8));
    for (let i = 1; i < steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps;
      const c = Math.floor(x / T), r = Math.floor(y / T);
      if (solid(c, r)) return false;
    }
    return true;
  };
  const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return Math.abs(a); };
  const visible = (c, r) => {
    const cx = (c + 0.5) * T, cy = (r + 0.5) * T;
    for (const g of cones) {
      const dx = cx - g.x, dy = cy - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist > g.range) continue;
      if (norm(Math.atan2(dy, dx) - g.facing) > g.fov / 2) continue;
      if (los(g.x, g.y, cx, cy)) return true;
    }
    return false;
  };

  const prev = new Map();
  const q = [[pc[0], pc[1]]];
  prev.set(key(pc[0], pc[1]), null);
  while (q.length) {
    const [c, r] = q.shift();
    if (c === tc[0] && r === tc[1]) {
      let cur = [c, r];
      while (true) { const p = prev.get(key(cur[0], cur[1])); if (p === null || (p[0] === pc[0] && p[1] === pc[1])) break; cur = p; }
      const dc = cur[0] - pc[0], dr = cur[1] - pc[1];
      if (dc === 1) return 'd'; if (dc === -1) return 'a';
      if (dr === 1) return 's'; if (dr === -1) return 'w';
      return null;
    }
    for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nc = c + dc, nr = r + dr;
      if (solid(nc, nr) || prev.has(key(nc, nr))) continue;
      if (visible(nc, nr)) continue;      // prefer tiles guards can't see
      prev.set(key(nc, nr), [c, r]);
      q.push([nc, nr]);
    }
  }
  // fallback: if cones fully wall us in, walk the raw map path
  const q2 = [[pc[0], pc[1]]];
  const prev2 = new Map([[key(pc[0], pc[1]), null]]);
  while (q2.length) {
    const [c, r] = q2.shift();
    if (c === tc[0] && r === tc[1]) {
      let cur = [c, r];
      while (true) { const p = prev2.get(key(cur[0], cur[1])); if (p === null || (p[0] === pc[0] && p[1] === pc[1])) break; cur = p; }
      const dc = cur[0] - pc[0], dr = cur[1] - pc[1];
      if (dc === 1) return 'd'; if (dc === -1) return 'a';
      if (dr === 1) return 's'; if (dr === -1) return 'w';
      return null;
    }
    for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nc = c + dc, nr = r + dr;
      if (solid(nc, nr) || prev2.has(key(nc, nr))) continue;
      prev2.set(key(nc, nr), [c, r]);
      q2.push([nc, nr]);
    }
  }
  return null; // no path (should not happen; generator validates)
};

(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222');
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#game');
  await page.waitForTimeout(300);

  const state = () => page.evaluate(() => window.__SNEAK.state());
  const sleep = (ms) => page.waitForTimeout(ms);
  const releaseAll = async () => { for (const k of ['w', 'a', 's', 'd']) await page.keyboard.up(k); };

  // In-page helper: given a desired (dx,dy) unit direction, is the next
  // position free of walls? (player radius 10)
  const freeDir = ([map, x, y, dx, dy, hasKey]) => {
    const T = 32, r = 10, W = 69, H = 23, sp = 150 * 0.1; // 100ms step
    const nx = x + dx * sp, ny = y + dy * sp;
    const solid = (c, rr) => c<0 || rr<0 || c>=W || rr>=H || map[rr][c]===1 || (map[rr][c]===2 && !hasKey);
    const pts = [[-r,0],[r,0],[0,-r],[0,r],[-r,-r],[r,-r],[-r,r],[r,r]];
    return pts.every(([ox,oy]) => !solid(Math.floor((nx+ox)/T), Math.floor((ny+oy)/T)));
  };
  // In-page helper: is tile (c,r) inside any guard cone?
  const tileVisible = ([cones, c, r]) => {
    const T = 32, cx = (c+0.5)*T, cy = (r+0.5)*T;
    const norm = (a) => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return Math.abs(a); };
    for (const g of cones) {
      const dx = cx - g.x, dy = cy - g.y;
      if (Math.hypot(dx,dy) > g.range) continue;
      if (norm(Math.atan2(dy,dx) - g.facing) > g.fov/2) continue;
      return true;
    }
    return false;
  };

  // In-page helper: flee to the best safe tile (hidden, not a dead-end corner,
  // open, and far from the chaser). Returns the first BFS step.
  const evadeStep = ([map, x, y, cones, chaser, hasKey]) => {
    const W = 69, H = 23, T = 32;
    const key = (c, r) => r * W + c;
    const solid = (c, r) => c < 0 || r < 0 || c >= W || r >= H || map[r][c] === 1 || (map[r][c] === 2 && !hasKey);
    const pc = [Math.floor(x / T), Math.floor(y / T)];
    const norm = (a) => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return Math.abs(a); };
    const los = (x0, y0, x1, y1) => {
      const d = Math.hypot(x1-x0, y1-y0); const steps = Math.max(1, Math.ceil(d/8));
      for (let i=1;i<steps;i++){ const x=x0+((x1-x0)*i)/steps, y=y0+((y1-y0)*i)/steps; const c=Math.floor(x/T), rr=Math.floor(y/T); if (solid(c, rr)) return false; }
      return true;
    };
    // when fleeing, hide from THE CHASER (the immediate threat), not every guard
    const vis = (c, r) => { const cx=(c+0.5)*T, cy=(r+0.5)*T; const g = chaser; const dx=cx-g.x, dy=cy-g.y; if (Math.hypot(dx,dy)>g.range) return false; if (norm(Math.atan2(dy,dx)-g.facing)>g.fov/2) return false; return los(g.x, g.y, cx, cy); };
    // BFS from the player to get depth of every reachable floor tile
    const freeCount = (c, r) => { let f = 0; for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) if (!solid(c + dc, r + dr)) f++; return f; };
    // BFS that avoids dead-end tiles (free==1) so the bot never runs into a corner
    const depth = new Map([[key(pc[0], pc[1]), 0]]);
    const q = [[pc[0], pc[1]]];
    while (q.length) {
      const [c, r] = q.shift();
      const d0 = depth.get(key(c, r));
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nc = c + dc, nr = r + dr;
        if (solid(nc, nr) || depth.has(key(nc, nr))) continue;
        if (freeCount(nc, nr) === 1) continue;   // no dead-ends
        depth.set(key(nc, nr), d0 + 1);
        q.push([nc, nr]);
      }
    }
    // nearest hidden, non-corner tile (tie-break: farther from the chaser)
    let best = null, bestDepth = 1e9, bestFar = -1;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const k = key(c, r);
      if (map[r][c] === 1 || !depth.has(k)) continue;
      if (vis(c, r)) continue;                              // must be hidden
      let free = 0;
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) if (!solid(c + dc, r + dr)) free++;
      if (free < 2) continue;                               // avoid dead-end corners
      const d = depth.get(k);
      const far = Math.hypot((c + 0.5) * T - chaser.x, (r + 0.5) * T - chaser.y);
      if (d < bestDepth || (d === bestDepth && far > bestFar)) { bestDepth = d; bestFar = far; best = [c, r]; }
    }
    if (!best) return null;
    // walk back until cur is the depth-1 tile (the first step from the player)
    let cur = best;
    while (depth.get(key(cur[0], cur[1])) > 1) {
      const dCur = depth.get(key(cur[0], cur[1]));
      let parent = null;
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nc = cur[0] + dc, nr = cur[1] + dr;
        if (depth.has(key(nc, nr)) && depth.get(key(nc, nr)) === dCur - 1) { parent = [nc, nr]; break; }
      }
      if (!parent) break;
      cur = parent;
    }
    const dc = cur[0] - pc[0], dr = cur[1] - pc[1];
    if (dc === 1) return 'd'; if (dc === -1) return 'a'; if (dr === 1) return 's'; if (dr === -1) return 'w';
    return null;
  };

  const DIRS = { w:[0,-1], a:[-1,0], s:[0,1], d:[1,0] };

  // dismiss the intro modal once (the game is paused behind it)
  await page.keyboard.press('Enter');
  await sleep(200);

  let won = 0, wins = [];
  for (const seed of SEEDS) {
    await page.evaluate((s) => window.__SNEAK.reset(s), seed);
    await sleep(200);
    let result = 'timeout';
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      const s = await state();
      if (s.gameOver) { result = s.won ? 'WIN' : 'caught'; break; }
      await releaseAll();

      let dir = null;
      const chasing = s.guards.indexOf('chase') !== -1;

      // 1) dodge an incoming bullet
      const bullet = s.bullets.find((b) => Math.hypot(b.x - s.x, b.y - s.y) < 80 &&
        Math.sign(b.x - s.x) === Math.sign(b.vx) && Math.sign(b.y - s.y) === Math.sign(b.vy));
      if (bullet) {
        // strafe perpendicular to the bullet's travel
        const pvx = -Math.sign(bullet.vy) || 1, pvy = Math.sign(bullet.vx);
        const cand = [pvy>0?'s':'w', pvx>0?'d':'a'];
        for (const k of cand) if (await page.evaluate(freeDir, [s.map, s.x, s.y, ...DIRS[k], s.hasKey])) { dir = k; break; }
      }

      // 2) if chased, actively run to the farthest free, non-visible direction
      else if (chasing) {
        const chaser = await page.evaluate((st) => {
          // nearest guard in chase state
          let best = null, bd = Infinity;
          st.cones.forEach((c, i) => {
            if (st.guards[i] !== 'chase') return;
            const d = Math.hypot(c.x - st.x, c.y - st.y);
            if (d < bd) { bd = d; best = c; }
          });
          return best;
        }, s);
        if (chaser) {
          // path to the best safe tile (hidden + open + far), not a greedy dash
          dir = await page.evaluate(evadeStep, [s.map, s.x, s.y, s.cones, chaser, Object.values(s.keyBag).some(Boolean)]);
          if (process.env.DBGBOT) console.log('  chase: chaser=(' + chaser.x.toFixed(0) + ',' + chaser.y.toFixed(0) + ') dist=' + Math.hypot(chaser.x-s.x, chaser.y-s.y).toFixed(0) + ' dir=' + dir);
        }
      }

      // 3) otherwise path through the quest chain, avoiding cones
      else {
        const pc = [Math.floor(s.x / 32), Math.floor(s.y / 32)];
        const anyKey = Object.values(s.keyBag).some(Boolean);
        const ids = ['blue', 'gold', 'red'];
        const missingKey = s.keys_pos.find((p, i) => !s.keyBag[ids[i]]);
        let t;
        if (missingKey) t = [Math.floor(missingKey[0] / 32), Math.floor(missingKey[1] / 32)];
        else if (!s.doorsOpen.blue) t = [7, 21]; // blue door approach (exit)
        else if (!s.doorsOpen.red) t = [24, 21]; // red door approach (vault)
        else if (!s.hasFile) t = [Math.floor(s.file[0] / 32), Math.floor(s.file[1] / 32)];
        else t = [Math.floor(s.exit[0] / 32), Math.floor(s.exit[1] / 32)];
        dir = await page.evaluate(bfsNext, [s.map, pc, t, s.cones, anyKey]);
        if (dir) {
          const [dx, dy] = DIRS[dir];
          const nx = s.x + dx * 32, ny = s.y + dy * 32;
          if (s.cones.some((g) => Math.hypot(g.x - nx, g.y - ny) < 90)) dir = null; // hold, let the patrol pass
        }
      }

      if (dir) { await page.keyboard.down(dir); await sleep(100); }
      else await sleep(100);
    }
    await releaseAll();
    console.log(`seed ${String(seed).padStart(6)}: ${result}`);
    if (result === 'WIN') { won++; wins.push(seed); await page.screenshot({ path: path.join(SHOT_DIR, 'bot-win-seed-' + seed + '.png') }); }
  }

  console.log(`\nWINS: ${won}/${SEEDS.length} -> ${won > 0 ? 'GAME IS WINNABLE' : 'NO SEED CLEARED'}`);
  console.log('winning seeds:', wins.join(', '));
  await page.close();
  await browser.close();
  process.exit(won > 0 ? 0 : 1);
})().catch((e) => { console.error('BOT ERROR:', e.message); process.exit(2); });
