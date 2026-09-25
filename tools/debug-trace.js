// LEGACY: written for the old 80x15 strip layout; not part of the current test suite (grid map, 69x23).
// Debug trace: log the bot's life on one seed to find why it dies.
const { chromium } = require('playwright');

const bfsNext = ([map, pc, tc, cones]) => {
  const W = 80, H = 15, T = 32;
  const key = (c, r) => r * W + c;
  if (map[tc[1]][tc[0]] === 1) return null;
  const los = (x0, y0, x1, y1) => {
    const d = Math.hypot(x1 - x0, y1 - y0); const steps = Math.max(1, Math.ceil(d / 8));
    for (let i = 1; i < steps; i++) { const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps; const c = Math.floor(x / T), r = Math.floor(y / T); if (c < 0 || r < 0 || c >= W || r >= H || map[r][c] === 1) return false; }
    return true;
  };
  const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return Math.abs(a); };
  const visible = (c, r) => { const cx = (c + 0.5) * T, cy = (r + 0.5) * T; for (const g of cones) { const dx = cx - g.x, dy = cy - g.y; if (Math.hypot(dx, dy) > g.range) continue; if (norm(Math.atan2(dy, dx) - g.facing) > g.fov / 2) continue; if (los(g.x, g.y, cx, cy)) return true; } return false; };
  const prev = new Map(); const q = [[pc[0], pc[1]]]; prev.set(key(pc[0], pc[1]), null);
  while (q.length) { const [c, r] = q.shift(); if (c === tc[0] && r === tc[1]) { let cur = [c, r]; while (true) { const p = prev.get(key(cur[0], cur[1])); if (p === null || (p[0] === pc[0] && p[1] === pc[1])) break; cur = p; } const dc = cur[0] - pc[0], dr = cur[1] - pc[1]; if (dc === 1) return 'd'; if (dc === -1) return 'a'; if (dr === 1) return 's'; if (dr === -1) return 'w'; return null; } for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue; if (map[nr][nc] === 1 || prev.has(key(nc, nr))) continue; if (visible(nc, nr)) continue; prev.set(key(nc, nr), [c, r]); q.push([nc, nr]); } }
  const q2 = [[pc[0], pc[1]]]; const prev2 = new Map([[key(pc[0], pc[1]), null]]);
  while (q2.length) { const [c, r] = q2.shift(); if (c === tc[0] && r === tc[1]) { let cur = [c, r]; while (true) { const p = prev2.get(key(cur[0], cur[1])); if (p === null || (p[0] === pc[0] && p[1] === pc[1])) break; cur = p; } const dc = cur[0] - pc[0], dr = cur[1] - pc[1]; if (dc === 1) return 'd'; if (dc === -1) return 'a'; if (dr === 1) return 's'; if (dr === -1) return 'w'; return null; } for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue; if (map[nr][nc] === 1 || prev2.has(key(nc, nr))) continue; prev2.set(key(nc, nr), [c, r]); q2.push([nc, nr]); } }
  return null;
};
const URL = require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href;   // relative: no machine path baked in
(async () => {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://localhost:9222');
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#game');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__SNEAK.reset(42));
  await page.waitForTimeout(100);

  const state = () => page.evaluate(() => window.__SNEAK.state());
  const sleep = (ms) => page.waitForTimeout(ms);
  const releaseAll = async () => { for (const k of ['w','a','s','d']) await page.keyboard.up(k); };
  const freeDir = ([map, x, y, dx, dy]) => {
    const T = 32, r = 10, W = 80, H = 15, sp = 15;
    const nx = x + dx*sp, ny = y + dy*sp;
    const pts = [[-r,0],[r,0],[0,-r],[0,r],[-r,-r],[r,-r],[-r,r],[r,r]];
    return pts.every(([ox,oy]) => { const c=Math.floor((nx+ox)/T), rr=Math.floor((ny+oy)/T); return c>=0&&rr>=0&&c<W&&rr<H&&map[rr][c]===0; });
  };
  const tileVisible = ([cones, c, r]) => {
    const T = 32, cx=(c+0.5)*T, cy=(r+0.5)*T;
    const norm = (a) => { while(a>Math.PI)a-=2*Math.PI; while(a<-Math.PI)a+=2*Math.PI; return Math.abs(a); };
    for (const g of cones) { const dx=cx-g.x, dy=cy-g.y; if (Math.hypot(dx,dy)>g.range) continue; if (norm(Math.atan2(dy,dx)-g.facing)>g.fov/2) continue; return true; }
    return false;
  };
  const evadeStep = ([map, x, y, cones, chaser]) => {
    const W = 80, H = 15, T = 32;
    const key = (c, r) => r * W + c;
    const solid = (c, r) => c < 0 || r < 0 || c >= W || r >= H || map[r][c] === 1;
    const pc = [Math.floor(x / T), Math.floor(y / T)];
    const norm = (a) => { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return Math.abs(a); };
    const los = (x0, y0, x1, y1) => {
      const d = Math.hypot(x1-x0, y1-y0); const steps = Math.max(1, Math.ceil(d/8));
      for (let i=1;i<steps;i++){ const x=x0+((x1-x0)*i)/steps, y=y0+((y1-y0)*i)/steps; const c=Math.floor(x/T), rr=Math.floor(y/T); if (c<0||rr<0||c>=W||rr>=H||map[rr][c]===1) return false; }
      return true;
    };
    const vis = (c, r) => { const cx=(c+0.5)*T, cy=(r+0.5)*T; const g = chaser; const dx=cx-g.x, dy=cy-g.y; if (Math.hypot(dx,dy)>g.range) return false; if (norm(Math.atan2(dy,dx)-g.facing)>g.fov/2) return false; return los(g.x, g.y, cx, cy); };
    const freeCount = (c, r) => { let f = 0; for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) if (!solid(c + dc, r + dr)) f++; return f; };
    const depth = new Map([[key(pc[0], pc[1]), 0]]);
    const q = [[pc[0], pc[1]]];
    while (q.length) { const [c, r] = q.shift(); const d0 = depth.get(key(c, r)); for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nc = c + dc, nr = r + dr; if (solid(nc, nr) || depth.has(key(nc, nr))) continue; if (freeCount(nc, nr) === 1) continue; depth.set(key(nc, nr), d0 + 1); q.push([nc, nr]); } }
    let best = null, bestDepth = 1e9, bestFar = -1;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const k = key(c, r);
      if (map[r][c] === 1 || !depth.has(k)) continue;
      if (vis(c, r)) continue;
      let free = 0; for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) if (!solid(c + dc, r + dr)) free++;
      if (free < 2) continue;
      const d = depth.get(k);
      const far = Math.hypot((c + 0.5) * T - chaser.x, (r + 0.5) * T - chaser.y);
      if (d < bestDepth || (d === bestDepth && far > bestFar)) { bestDepth = d; bestFar = far; best = [c, r]; }
    }
    if (!best) return null;
    let cur = best;
    while (depth.get(key(cur[0], cur[1])) > 1) {
      const dCur = depth.get(key(cur[0], cur[1]));
      let parent = null;
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nc = cur[0] + dc, nr = cur[1] + dr; if (depth.has(key(nc, nr)) && depth.get(key(nc, nr)) === dCur - 1) { parent = [nc, nr]; break; } }
      if (!parent) break;
      cur = parent;
    }
    const dc = cur[0] - pc[0], dr = cur[1] - pc[1];
    if (dc === 1) return 'd'; if (dc === -1) return 'a'; if (dr === 1) return 's'; if (dr === -1) return 'w';
    return null;
  };
  const DIRS = { w:[0,-1], a:[-1,0], s:[0,1], d:[1,0] };

  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < 60000) {
    const s = await state();
    if (s.gameOver) { console.log(`t=${((Date.now()-t0)/1000).toFixed(1)}s GAMEOVER won=${s.won} hits=${s.hits} file=${s.hasFile} pos=(${s.x.toFixed(0)},${s.y.toFixed(0)})`); break; }
    await releaseAll();
    const chasing = s.guards.indexOf('chase') !== -1;
    let dir = null;
    const bullet = s.bullets.find((b) => Math.hypot(b.x-s.x,b.y-s.y)<80 && Math.sign(b.x-s.x)===Math.sign(b.vx) && Math.sign(b.y-s.y)===Math.sign(b.vy));
    if (bullet) { const pvx=-Math.sign(bullet.vy)||1, pvy=Math.sign(bullet.vx); for (const k of [pvy>0?'s':'w', pvx>0?'d':'a']) if (await page.evaluate(freeDir,[s.map,s.x,s.y,...DIRS[k]])){dir=k;break;} if(!dir) dir=null; }
    else if (chasing) {
      const chaser = await page.evaluate((st) => { let best=null,bd=1e9; st.cones.forEach((c,i)=>{if(st.guards[i]!=='chase')return; const d=Math.hypot(c.x-st.x,c.y-st.y); if(d<bd){bd=d;best=c;}}); return best; }, s);
      if (chaser) {
        dir = await page.evaluate(evadeStep, [s.map, s.x, s.y, s.cones, chaser]);
        const key = `t=${((Date.now()-t0)/1000).toFixed(1)}s CHASE dist=${Math.hypot(chaser.x-s.x,chaser.y-s.y).toFixed(0)} alarm=${s.alarmTime.toFixed(1)} dir=${dir} hits=${s.hits} pos=(${s.x.toFixed(0)},${s.y.toFixed(0)}) file=${s.hasFile}`;
        if (key !== last) { console.log(key); last = key; }
      }
    } else {
      const pc=[Math.floor(s.x/32),Math.floor(s.y/32)];
      const t = s.hasFile ? [Math.floor(s.exit[0]/32),Math.floor(s.exit[1]/32)] : [Math.floor(s.file[0]/32),Math.floor(s.file[1]/32)];
      dir = await page.evaluate(bfsNext, [s.map, pc, t, s.cones]);
      if (dir && DIRS[dir]) { const [dx, dy] = DIRS[dir]; const nx = s.x + dx * 32, ny = s.y + dy * 32; if (s.cones.some((g) => Math.hypot(g.x - nx, g.y - ny) < 90)) dir = null; }
      const key = `t=${((Date.now()-t0)/1000).toFixed(1)}s MOVE dir=${dir} hits=${s.hits} alarm=${s.alarmTime.toFixed(0)} pos=(${s.x.toFixed(0)},${s.y.toFixed(0)}) file=${s.hasFile} obj=${s.hasFile?'exit':'file'}`;
      if (key !== last) { console.log(key); last = key; }
    }
    if (dir && DIRS[dir]) await page.keyboard.down(dir);
    await sleep(100);
  }
  await releaseAll();
  await page.close();
  await browser.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(2);});
