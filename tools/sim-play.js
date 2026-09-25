// Headless playability sim: drives the game's OWN update() at 60fps with a
// quest-chain BFS policy (key -> red door -> file -> exit, hide when chased).
// No browser, no input latency - this isolates "is the game winnable?"
const { loadGame } = require('./load-game.cjs');
const game = loadGame();

const T = 32, W = 52, H = 34;   // 3x3 grid of 16x10 rooms
const key = (c, r) => r * W + c;
// F29: which colored key guards a locked tile (null for non-door tiles)
const doorKeyFor = (c, r) => {
  for (const k of game.KEYS) for (const [tc, tr] of game.doorSecTiles(k.doorSec)) if (tc === c && tr === r) return k.id;
  return null;
};
const heldKeySet = () => { const s = st(); const set = new Set(); for (const id of Object.keys(s.keys)) if (s.keys[id]) set.add(id); return set; };
const SOLID = (m, c, r) => {
  if (c < 0 || r < 0 || c >= W || r >= H) return true;
  const v = m[r][c];
  if (v === 1) return true;
  if (v === 2) return !heldKeySet().has(doorKeyFor(c, r)); // locked door passes once its key is held
  return false;
};

const st = () => game.state;
const map = () => game.map();
const guards = () => game.guards();
const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return Math.abs(a); };
// Cell-walk DDA, mirrors the game's hasLOS (src/sight.js) so the bot's plan of
// "which tiles a guard watches" matches the guards' REAL vision. Uses this file's
// key-aware SOLID so a held key opens the vault door for planning.
const los = (x0, y0, x1, y1) => {
  const d = Math.hypot(x1 - x0, y1 - y0);
  if (d < 1e-6) return true;
  const m = map();
  let cx = Math.floor(x0 / T), cy = Math.floor(y0 / T);
  const dx = x1 - x0, dy = y1 - y0;
  const ux = dx / d, uy = dy / d;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  let tMaxX = dx !== 0 ? ((stepX > 0 ? (cx + 1) : cx) * T - x0) / ux : Infinity;
  let tMaxY = dy !== 0 ? ((stepY > 0 ? (cy + 1) : cy) * T - y0) / uy : Infinity;
  const tDeltaX = dx !== 0 ? T / Math.abs(ux) : Infinity;
  const tDeltaY = dy !== 0 ? T / Math.abs(uy) : Infinity;
  let guard = 0;
  while (guard++ < 512) {
    if (SOLID(m, cx, cy)) return false;
    const next = Math.min(tMaxX, tMaxY);
    if (next >= d) return true;
    if (Math.abs(tMaxX - tMaxY) < 1.0) {
      if (SOLID(m, cx + stepX, cy) || SOLID(m, cx, cy + stepY)) return false;
    }
    if (tMaxX < tMaxY) { cx += stepX; tMaxX += tDeltaX; }
    else { cy += stepY; tMaxY += tDeltaY; }
  }
  return true;
};
const guardSeesTile = (g, tile) => {
  const cx = (tile[0] + 0.5) * T, cy = (tile[1] + 0.5) * T;
  const dx = cx - g.x, dy = cy - g.y;
  const s = st();
  const range = s.alarmTime > 0 ? game.VISION_RANGE * 1.4 : game.VISION_RANGE;
  if (Math.hypot(dx, dy) > range) return false;
  const fov = g.state === 'chase' ? game.CHASE_FOV : game.PATROL_FOV;
  if (norm(Math.atan2(dy, dx) - g.facing) > fov / 2) return false;
  return los(g.x, g.y, cx, cy);
};
const marginSeesTile = (g, tile) => {
  const cx = (tile[0] + 0.5) * T, cy = (tile[1] + 0.5) * T;
  const dx = cx - g.x, dy = cy - g.y;
  const s = st();
  const range = (s.alarmTime > 0 ? game.VISION_RANGE * 1.4 : game.VISION_RANGE) + 16;
  if (Math.hypot(dx, dy) > range) return false;
  const fov = g.state === 'chase' ? game.CHASE_FOV : game.PATROL_FOV;
  if (norm(Math.atan2(dy, dx) - g.facing) > fov / 2 + 0.06) return false;
  return los(g.x, g.y, cx, cy);
};
const visibleSet = () => {
  const vis = new Set();
  const s = st();
  for (const g of guards()) {
    if (g.state === 'down' || g.state === 'dazed') continue;
    const range = s.alarmTime > 0 ? game.VISION_RANGE * 1.4 : game.VISION_RANGE;
    const fov = g.state === 'chase' ? game.CHASE_FOV : game.PATROL_FOV;
    const cr = Math.floor(g.x / T), cc = Math.floor(g.y / T);
    const span = Math.ceil(range / T);
    for (let r = Math.max(0, cc - span); r <= Math.min(H - 1, cc + span); r++) {
      for (let c = Math.max(0, cr - span); c <= Math.min(W - 1, cr + span); c++) {
        if (map()[r][c] === 1) continue;
        if (marginSeesTile(g, [c, r])) vis.add(key(c, r));
      }
    }
  }
  return vis;
};

const DIRS = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] };

// ---- patrol prediction (patrols are cyclic waypoint loops - deterministic) ----
// Where is guard g after t seconds of pure patrol? Exact on the loop; the
// skilled player's "when does the lane clear" read, done in math.
function guardPosAt(g, t) {
  const line = g.path, n = line.length;
  if (n < 2 || t <= 0) return { x: g.x, y: g.y, facing: g.facing };
  const L = [];
  for (let i = 0; i < n; i++) {
    const a = line[i], b = line[(i + 1) % n];
    L.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  let x = g.x, y = g.y, facing = g.facing;
  let rem = t;
  if (g.pause > 0) {
    rem -= Math.min(rem, g.pause);
    if (rem <= 1e-9) return { x, y, facing };
  }
  let wp = g.wp;
  let prev = (wp - 1 + n) % n;
  let dOn = Math.hypot(x - line[prev].x, y - line[prev].y);
  while (rem > 1e-9) {
    const segLen = L[prev] || 1;
    const segLeft = Math.max(0, segLen - dOn);
    const tSeg = segLeft / 55;
    if (rem < tSeg) {
      const f = (dOn + 55 * rem) / segLen;
      x = line[prev].x + (line[wp].x - line[prev].x) * f;
      y = line[prev].y + (line[wp].y - line[prev].y) * f;
      facing = Math.atan2(line[wp].y - line[prev].y, line[wp].x - line[prev].x);
      return { x, y, facing };
    }
    rem -= tSeg;
    x = line[wp].x; y = line[wp].y;
    // arrival: wp advances, 0.7s pause with the OLD facing (direction of the
    // segment just traveled) - exactly what the game does
    if (rem < 0.7) return { x, y, facing };
    rem -= 0.7;
    prev = wp; wp = (wp + 1) % n; dOn = 0;
  }
  return { x, y, facing };
}
const fpSeesTile = (fp, tile) => {
  if (!tile) return false;   // defensive: a malformed transit/wait tile (deferred bot)
  const cx = (tile[0] + 0.5) * T, cy = (tile[1] + 0.5) * T;
  const dx = cx - fp.x, dy = cy - fp.y;
  if (Math.hypot(dx, dy) > game.VISION_RANGE + 16) return false; // 16px conservative pad
  if (norm(Math.atan2(dy, dx) - fp.facing) > game.PATROL_FOV / 2 + 0.06) return false; // 3.4deg pad
  return los(fp.x, fp.y, cx, cy);
};
// Find a safe commit time. Two constraints:
// (1) TRANSIT: each [tile, offsetFromCommit] is checked against the guards'
//     predicted position at commit + offset (the bot visits tile i ~0.25s i
//     after crossing - a window clean "now" but swept mid-transit is the
//     death the bot kept dying to).
// (2) WAIT: the tile we stand on while waiting must stay unwatched for the
//     WHOLE wait. That is monotonic, so it reduces to: commit before the
//     first moment any patrol watches the wait tile (T_first), swept at
//     0.25s - dense enough to catch the narrow slivers where a guard sits
//     at a lane end sweeping a 2-tile arc.
// Returns seconds-to-wait, or null.
function crossingWindow(transit, waitTile, maxWait) {
  let tFirst = null;
  if (waitTile) {
    for (let wt = 0; wt <= maxWait; wt += 0.25) {
      let seen = false;
      for (const g of guards()) {
        if (g.state === 'down' || g.state === 'dazed') continue;
        if (fpSeesTile(guardPosAt(g, wt), waitTile)) { seen = true; break; }
      }
      if (seen) { tFirst = wt; break; }
    }
  }
  for (let t = 0; t <= maxWait; t += 0.25) {
    if (tFirst !== null && t >= tFirst) break;
    let ok = true;
    for (const [tl, off] of transit) {
      for (const g of guards()) {
        if (g.state === 'down' || g.state === 'dazed') continue;
        // 0.5s envelope (early-late arrival + facing switch); a 1s pad was
        // wider than the 0.7s waypoint pause and made pause windows unreachable
        for (const d of (off >= 0.25 ? [-0.25, 0, 0.25] : [0, 0.25])) {
          if (fpSeesTile(guardPosAt(g, t + off + d), tl)) { ok = false; break; }
        }
        if (!ok) break;
      }
      if (!ok) break;
    }
    if (ok) return t;
  }
  return null;
}

// Patrol routes are deterministic: every guard's waypoint line, sampled to
// tiles. A human reads the radar and doesn't run down a watched lane - soft
// penalty so the bot still crosses a lane when it has to, just prefers clean.
function riskySet() {
  const r = new Set();
  for (const g of guards()) {
    const line = g.path;   // pixel waypoints
    for (let i = 0; i + 1 < line.length; i++) {
      const c0 = Math.floor(line[i].x / T), r0 = Math.floor(line[i].y / T);
      const c1 = Math.floor(line[i + 1].x / T), r1 = Math.floor(line[i + 1].y / T);
      const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0), 1);
      for (let s = 0; s <= steps; s++) {
        const c = Math.round(c0 + ((c1 - c0) * s) / steps), rr = Math.round(r0 + ((r1 - r0) * s) / steps);
        r.add(key(c, rr));
        // cone reach: a guard on this lane watches up to ~4 tiles off it
        for (let dc = -4; dc <= 4; dc++) for (let dr = -4; dr <= 4; dr++) {
          if (dc === 0 && dr === 0) continue;
          if (Math.max(Math.abs(dc), Math.abs(dr)) > 4) continue;
          r.add(key(c + dc, rr + dr));
        }
      }
    }
  }
  return r;
}

// Full BFS path (list of [c,r] tiles, pc first, tc last) or null.
let risky = new Set();

// A* on the tile grid. `avoid` tiles are hard-forbidden (cones); `soft` tiles
// carry +4 (patrol lanes: cross only when there's no cleaner way) - human
// routing in one pass instead of a forbidden-then-fallback double BFS.
function astarPath(pc, tc, avoid, soft) {
  const solid = (c, r) => SOLID(map(), c, r);
  const free = (c, r) => { let f = 0; for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!solid(c + dc, r + dr)) f++; return f; };
  const startK = key(pc[0], pc[1]), goalK = tc ? key(tc[0], tc[1]) : null;
  const g = new Map([[startK, 0]]);
  const prev = new Map([[startK, null]]);
  const h = (c, r) => goalK ? Math.abs(c - tc[0]) + Math.abs(r - tc[1]) : 0;
  const open = [{ c: pc[0], r: pc[1], f: h(pc[0], pc[1]) }];
  const closed = new Set();
  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();
    if (goalK !== null && cur.c === tc[0] && cur.r === tc[1]) break;
    if (closed.has(key(cur.c, cur.r))) continue;
    closed.add(key(cur.c, cur.r));
    const d0 = g.get(key(cur.c, cur.r));
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = cur.c + dc, nr = cur.r + dr;
      const k = key(nc, nr);
      if (solid(nc, nr) || closed.has(k)) continue;
      if (free(nc, nr) === 1) continue; // no dead-end pockets on route paths
      if (avoid && avoid.has(k)) continue;
      const cost = 1 + (soft && soft.has(k) ? 4 : 0);
      const ng = d0 + cost;
      if (!g.has(k) || ng < g.get(k)) {
        g.set(k, ng);
        prev.set(k, [cur.c, cur.r]);
        open.push({ c: nc, r: nr, f: ng + h(nc, nr) });
      }
    }
  }
  if (goalK === null || !g.has(goalK)) return null;
  const path = [];
  let cur = [tc[0], tc[1]];
  while (true) {
    path.unshift(cur);
    const p = prev.get(key(cur[0], cur[1]));
    if (!p || (p[0] === pc[0] && p[1] === pc[1])) break;
    cur = p;
  }
  if (path[0][0] !== pc[0] || path[0][1] !== pc[1]) path.unshift(pc);
  return path;
}

// Old signature shim: blocked = cone tiles (hard), lanes always soft-avoided.
function bfsPath(pc, tc, blocked, allowDeadEnd) {
  return astarPath(pc, tc, blocked, risky);
}

// Pick a cardinal direction that actually moves the player toward a target
// point (dry-run the collision so a wall-jammed axis falls through to the
// perpendicular axis instead of grinding).
function stepDirTo(tx, ty, p) {
  const dx = tx - p.x, dy = ty - p.y;
  const cands = [];
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx > 3) cands.push('d');
    if (dx < -3) cands.push('a');
    if (dy > 3) cands.push('s');
    if (dy < -3) cands.push('w');
  } else {
    if (dy > 3) cands.push('s');
    if (dy < -3) cands.push('w');
    if (dx > 3) cands.push('d');
    if (dx < -3) cands.push('a');
  }
  const sp = 150 * (1 / 60);
  for (const dir of cands) {
    const [ax, ay] = DIRS[dir];
    if (!game.hitsWall(p.x + ax * sp, p.y + ay * sp, 11)) return dir;
  }
  return null;
}

// First step toward cover. Pass 1: a route that stays in hidden tiles the
// whole way. Pass 2 (chased with no clean route): sprint to the NEAREST
// hidden tile even if the route crosses visible tiles - cover beats safety.
function nearestHiddenFirst(pc, vis) {
  const solid = (c, r) => SOLID(map(), c, r);
  const bfs = (avoidVis) => {
    const depth = new Map([[key(pc[0], pc[1]), 0]]);
    const q = [[pc[0], pc[1]]];
    while (q.length) {
      const [c, r] = q.shift();
      const d0 = depth.get(key(c, r));
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (solid(nc, nr) || depth.has(key(nc, nr))) continue;
        if (avoidVis && vis.has(key(nc, nr))) continue;
        depth.set(key(nc, nr), d0 + 1);
        q.push([nc, nr]);
      }
    }
    return depth;
  };
  for (const avoidVis of [true, false]) {
    const depth = bfs(avoidVis);
    let best = null, bestDepth = 1e9, bestFar = -1;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const k = key(c, r);
      if (solid(c, r) || vis.has(k) || !depth.has(k)) continue;
      const d = depth.get(k);
      const far = Math.hypot((c + 0.5) * T - st().player.x, (r + 0.5) * T - st().player.y);
      if (d < bestDepth || (d === bestDepth && far > bestFar)) { bestDepth = d; bestFar = far; best = [c, r]; }
    }
    if (!best) continue;
    let cur = best;
    while (depth.get(key(cur[0], cur[1])) > 1) {
      const dCur = depth.get(key(cur[0], cur[1]));
      let parent = null;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = cur[0] + dc, nr = cur[1] + dr;
        if (depth.has(key(nc, nr)) && depth.get(key(nc, nr)) === dCur - 1) { parent = [nc, nr]; break; }
      }
      if (!parent) break;
      cur = parent;
    }
    const dc = cur[0] - pc[0], dr = cur[1] - pc[1];
    if (dc === 1) return 'd'; if (dc === -1) return 'a'; if (dr === 1) return 's'; if (dr === -1) return 'w';
    return null;
  }
  return null;
}

// door approach tiles (E side of the vault door, wall y=22)
const DOOR_APPROACH = [[23, 21], [24, 21]];

// all open door gaps (the only ways between rooms; the door tiles appear
// once the key is held, and nearestGap's BFS just won't reach the rest)
const GAPS = [];
// vertical doors: ONE centered door per open section (rows 5-6) -> rows 6,7 / 17,18
for (const x of [17, 34]) {
  for (const r of [6, 7, 17, 18]) GAPS.push([x, r]);
}
// horizontal doors: two per open section, cols 4-5 and 10-11
for (const y of [11, 22]) for (const c of [0, 1, 2]) for (const dc of [4, 5, 10, 11]) GAPS.push([1 + c * 17 + dc, y]);

// nearest gap tile by raw-map BFS (null if none within 14 steps)
function nearestGap(pc) {
  const solid = (c, r) => SOLID(map(), c, r);
  const depth = new Map([[key(pc[0], pc[1]), 0]]);
  const q = [[pc[0], pc[1]]];
  while (q.length) {
    const [c, r] = q.shift();
    const d0 = depth.get(key(c, r));
    if (d0 >= 14) continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (solid(nc, nr) || depth.has(key(nc, nr))) continue;
      depth.set(key(nc, nr), d0 + 1);
      q.push([nc, nr]);
    }
  }
  let best = null, bestD = 1e9;
  for (const g of GAPS) {
    const k = key(g[0], g[1]);
    if (depth.has(k) && depth.get(k) < bestD) { bestD = depth.get(k); best = g; }
  }
  return best;
}

// F33: the current quest target is a CONTAINER (a key, then the file), not a floor
// tile. goalTile points at the floor access tile you stand on to search it.
function currentQuestContainer() {
  const s = st();
  for (const k of game.KEYS) if (!s.keyBag[k.id])
    return s.containers.find((c) => c.contents.some((i) => i.role === 'key' && i.id === k.id));
  if (!s.hasFile) return s.containers.find((c) => c.contents.some((i) => i.role === 'objective'));
  return null;
}
function accessTileOf(container) {
  const s = st(), map = s.map;
  let best = null, bestD = 1e9;
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nc = container.c + dc, nr = container.r + dr;
    if (nc < 0 || nr < 0 || nc >= map[0].length || nr >= map.length || map[nr][nc] !== 0) continue;
    const d = Math.hypot(nc - s.player.x / T, nr - s.player.y / T);
    if (d < bestD) { bestD = d; best = [nc, nr]; }
  }
  return best;
}
function goalTile() {
  const s = st();
  const q = currentQuestContainer();
  if (q) { const at = accessTileOf(q); if (at) return at; }
  if (!s.doorsOpen.red) return game.doorSecApproach(1)[0];
  if (!s.doorsOpen.blue) return game.doorSecApproach(0)[0];
  return [Math.floor(s.exitPos.x / T), Math.floor(s.exitPos.y / T)];
}

function play(seed, maxSec) {
  game.reset(seed);
  const s = st();
  s.intro = false; s.paused = false; // headless: no modal
  risky = riskySet(); // patrol lines are static per seed
  const dt = 1 / 60;
  const frames = Math.floor(maxSec / dt);
  let hideUntil = -1, path = [], recomputeIn = 0, stuck = 0, lastPos = null, holdFrames = 0, crossWait = 0, committedRoom = null, lastRoom = null, commitHold = 0, lastGoalKey = null, deadWaitFrames = 0;
  for (let i = 0; i < frames; i++) {
    const s2 = st();
    if (s2.gameOver) break;
    const p = s2.player;
      const pc = [Math.floor(p.x / T), Math.floor(p.y / T)];
      { const prTile = game.roomAt(pc[0], pc[1]); if (prTile) lastRoom = prTile; }
    const vis = visibleSet();
    let dir = null;
    const chased = guards().some((g) => g.state === 'chase');
    if (chased) { crossWait = 0; committedRoom = null; commitHold = 0; } // prediction is void while anyone chases
    { const gk = goalTile().join('.'); if (lastGoalKey !== null && gk !== lastGoalKey) { committedRoom = null; commitHold = 0; recomputeIn = 0; } lastGoalKey = gk; } // a new objective voids the old timed route
    // drop waypoints already reached
    while (path.length) {
      const t0 = path[0];
      if (Math.hypot((t0[0] + 0.5) * T - p.x, (t0[1] + 0.5) * T - p.y) < 7) path.shift();
      else break;
    }
    if (chased || i < hideUntil) {
      // break line of sight first: a pillar shadow and 3s of quiet beats a
      // sprint between two chasers. Only bolt for the nearest room exit when
      // no clean hiding spot is reachable.
      dir = nearestHiddenFirst(pc, vis);
      path = [];
      if (!dir) {
        const gap = nearestGap(pc);
        if (gap) {
          const full = bfsPath(pc, gap, vis, false) || bfsPath(pc, gap, null, false);
          if (full) {
            path = full.slice(1);
            recomputeIn = 30;
            if (path.length) {
              const t0 = path[0];
              dir = stepDirTo((t0[0] + 0.5) * T, (t0[1] + 0.5) * T, p);
            }
          }
        }
      }
      if (chased) hideUntil = i + 210; // 3.5s of hiding: just past the 3.0s give-up
      if (!dir) {
        // nothing hidden reachable: flee, maximizing distance from the nearest chaser
        const chasers = guards().filter((g) => g.state === 'chase');
        if (chasers.length) {
          chasers.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
          const ch = chasers[0];
          let best = null, bestD = -1;
          for (const d of ['w', 'a', 's', 'd']) {
            const [ax, ay] = DIRS[d];
            if (game.hitsWall(p.x + ax * 16, p.y + ay * 16, 11)) continue;
            const nd = Math.hypot(ch.x - (p.x + ax * 32), ch.y - (p.y + ay * 32));
            if (nd > bestD) { bestD = nd; best = d; }
          }
          dir = best;
        }
      }
    } else {
      const prNow = game.roomAt(pc[0], pc[1]);
      const t0Room = path.length ? game.roomAt(path[0][0], path[0][1]) : null;
      const committedActive = !!committedRoom && ((prNow && prNow[0] === committedRoom[0] && prNow[1] === committedRoom[1]) ||
        (t0Room && t0Room[0] === committedRoom[0] && t0Room[1] === committedRoom[1]));
      if (!path.length || recomputeIn <= 0) {
        if (committedActive) {
          // committed to the timed route: keep following it through the room
          recomputeIn = 15;
        } else {
          const full = astarPath(pc, goalTile(), vis, risky) || astarPath(pc, goalTile(), null, risky) || astarPath(pc, goalTile(), null, null);
          path = full ? full.slice(1) : []; // skip our own tile
          recomputeIn = 30;
          committedRoom = null; commitHold = 0;
        }
      }
      recomputeIn--;
      // drop the commitment only once we are fully past the committed room
      if (committedRoom && !committedActive) { committedRoom = null; commitHold = 0; }
      if (path.length) {
        const t0 = path[0];
        dir = stepDirTo((t0[0] + 0.5) * T, (t0[1] + 0.5) * T, p);
        if (dir) {
          // wait at the room edge if the waypoint we are about to enter is in a cone
          for (const g of guards()) {
            if (g.state === 'down' || g.state === 'dazed') continue;
            if (marginSeesTile(g, t0)) {
              if (process.env.DBGSIM2) console.log(`    hold: tile(${t0[0]},${t0[1]}) seen by g@${(g.x / T).toFixed(1)},${(g.y / T).toFixed(1)} f=${g.facing.toFixed(2)} d=${Math.hypot(g.x - p.x, g.y - p.y).toFixed(0)}`);
              dir = null;
              break;
            }
          }
// doorway timing: before crossing INTO a new room, read the radar.
          // roomAt() is null ON gap/wall tiles, so resolve the target room
          // through the gap: if the waypoint sits on the wall, peek at the
          // far side; if the player stands in the gap, any waypoint room is
          // the target.
          if (dir) {
            const pr = game.roomAt(pc[0], pc[1]);
            let tr = game.roomAt(t0[0], t0[1]);
            if (!tr && pr) {
              for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = game.roomAt(t0[0] + dc, t0[1] + dr);
                if (nr && (nr[0] !== pr[0] || nr[1] !== pr[1])) { tr = nr; break; }
              }
            }
            const crossing = tr && (pr ? (pr[0] !== tr[0] || pr[1] !== tr[1]) : true);
            if (crossing) {
              // reactive: any live guard in the target room watching the
              // entry tile right now -> hold
              for (const g of guards()) {
                if (g.state === 'down' || g.state === 'dazed') continue;
                const gr = game.roomAt(Math.floor(g.x / T), Math.floor(g.y / T));
                if (!gr || gr[0] !== tr[0] || gr[1] !== tr[1]) continue;
                if (marginSeesTile(g, t0)) {
                  if (process.env.DBGSIM2) console.log(`    door-hold: entry(${t0[0]},${t0[1]}) watched by g@${(g.x / T).toFixed(1)},${(g.y / T).toFixed(1)} f=${g.facing.toFixed(2)}`);
                  dir = null;
                  break;
                }
              }
            }
          }
          // predictive timing: patrols are deterministic, so scan the next 12s
          // for the first moment the next 12-tile chunk of the route is clean.
          // fires when crossing into a new room OR when the chunk cuts through
          // patrol-lane / cone-reach territory (key and door approaches etc)
          if (dir) {
            const pr2 = game.roomAt(pc[0], pc[1]);
            let tr2 = game.roomAt(t0[0], t0[1]);
            if (!tr2 && pr2) {
              for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = game.roomAt(t0[0] + dc, t0[1] + dr);
                if (nr && (nr[0] !== pr2[0] || nr[1] !== pr2[1])) { tr2 = nr; break; }
              }
            }
            const crossing2 = tr2 && (pr2 ? (pr2[0] !== tr2[0] || pr2[1] !== tr2[1]) : true);
            let chunkRisky = false, firstRiskyRoom = null;
            const chunkLen = crossing2 ? 24 : 12; // room exits validate the whole transit
            for (let si = 0; si < path.length && si < chunkLen; si++) {
              if (risky.has(key(path[si][0], path[si][1]))) {
                chunkRisky = true;
                const rr = game.roomAt(path[si][0], path[si][1]);
                if (rr) firstRiskyRoom = rr;
                break;
              }
            }
            const windowActive = crossing2 || chunkRisky;
            if (windowActive && dir) {
              if (commitHold > 0) commitHold--; // validated chunk in transit: ride it
              else {
                // transit strip: the next 12 path tiles, each checked at its
                // visit time (~0.25s per tile, commit clock starts now)
                const transit = [];
                for (let si = 0; si < path.length && si < chunkLen; si++) {
                  transit.push([path[si], (si + 1) * 0.25]);
                }
                if (!transit.length) transit.push([t0, 0.25]);
                // wait spot: our standing tile, as long as it is NOT in the room
                // whose lanes we are about to cross (null = nothing to check)
                const prw = game.roomAt(pc[0], pc[1]);
                const waitTarget = tr2 || firstRiskyRoom;
                const waitTile = (!prw || (waitTarget && prw[0] !== waitTarget[0] || prw[1] !== waitTarget[1])) ? pc : null;
                const w = crossingWindow(transit, waitTile, 12);
                committedRoom = waitTarget; // the timed route is law until we are past it
                if (w === null) { dir = null; crossWait = 0; } // no clean window: hold, re-scan
                else if (w > 0.75) {
                  crossWait = w; dir = null;
                  if (process.env.DBGSIM2) console.log(`    window: hold ${(w).toFixed(2)}s for room(${waitTarget ? waitTarget[0] + ',' + waitTarget[1] : '?'})`);
                } else { crossWait = 0; commitHold = 120; } // validated: ride the chunk
              }
            } else crossWait = 0;
          }
                    if (crossWait > 0 && dir !== null) dir = null; // still waiting it out
        }
      }
    }
    // a hold only works while you are UNSEEN. Two triggers, same remedy:
    // (a) some guard watches the tile we stand on (frozen in a cone waiting
    //     on a window that will never open), or
    // (b) a window is pending and we stand on the open gap tile itself (the
    //     wait belongs one tile back inside our own room).
    // Step to a tile that is currently unwatched by every guard.
    if (dir === null && !chased) {
      let mustMove = false;
      { const prNow = game.roomAt(pc[0], pc[1]); if (!prNow && crossWait > 0) mustMove = true; }
      if (!mustMove) {
        for (const g of guards()) {
          if (g.state === 'down' || g.state === 'dazed') continue;
          if (marginSeesTile(g, [pc[0], pc[1]])) { mustMove = true; break; }
        }
      }
      if (mustMove) {
        // angle away from the watcher; if nobody watches yet (gap exposure),
        // angle back toward the nearest room
        let watcher = null;
        for (const g of guards()) {
          if (g.state === 'down' || g.state === 'dazed') continue;
          if (marginSeesTile(g, [pc[0], pc[1]])) { watcher = g; break; }
        }
        let ang = Math.PI;
        if (watcher) ang = Math.atan2(p.y - watcher.y, p.x - watcher.x);
        else {
          // back toward the room we came from, not into the target room
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = game.roomAt(pc[0] + dx, pc[1] + dy);
            if (nr && lastRoom && nr[0] === lastRoom[0] && nr[1] === lastRoom[1]) { ang = Math.atan2(dy, dx); break; }
          }
        }
        const opts = Object.keys(DIRS).filter((d) => !game.hitsWall(p.x + DIRS[d][0] * 16, p.y + DIRS[d][1] * 16, 11));
        opts.sort((a, b) => Math.abs(norm(Math.atan2(DIRS[a][1], DIRS[a][0]) - ang)) - Math.abs(norm(Math.atan2(DIRS[b][1], DIRS[b][0]) - ang)));
        // exposure score per candidate step: 0 = unwatched now,
        // 1 = watched but has an unwatched neighbor (escape in 2),
        // 2 = fully exposed
        const watched = (tl) => guards().some((g2) => {
          if (g2.state === 'down' || g2.state === 'dazed') return false;
          return marginSeesTile(g2, tl);
        });
        let best = null, bestScore = 3;
        for (const d of opts) {
          const nx = pc[0] + DIRS[d][0], ny = pc[1] + DIRS[d][1];
          let score;
          if (!watched([nx, ny])) score = 0;
          else {
            score = 2;
            for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const tx = nx + ox, ty = ny + oy;
              if (game.hitsWall((tx + 0.5) * T, (ty + 0.5) * T, 11)) continue;
              if (!watched([tx, ty])) { score = 1; break; }
            }
          }
          if (score < bestScore) { bestScore = score; best = d; }
        }
        dir = best || opts[0] || null;
        holdFrames = 0;
        crossWait = 0;
        if (process.env.DBGSIM2) console.log(`    unseen-void: tile(${pc[0]},${pc[1]}) exposed, retreat ${dir}`);
      }
    }
    // never let the bot freeze on the open gap: standing on the wall section
    // with no direction means backing toward the room we came from
    if (dir === null && !chased && !game.roomAt(pc[0], pc[1])) {
      let ang = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = game.roomAt(pc[0] + dx, pc[1] + dy);
        if (nr && lastRoom && nr[0] === lastRoom[0] && nr[1] === lastRoom[1]) { ang = Math.atan2(dy, dx); break; }
      }
      if (ang === null) ang = lastPos ? Math.atan2(lastPos[1] - p.y, lastPos[0] - p.x) : Math.PI;
      const opts = Object.keys(DIRS).filter((d) => !game.hitsWall(p.x + DIRS[d][0] * 16, p.y + DIRS[d][1] * 16, 11));
      opts.sort((a, b) => Math.abs(norm(Math.atan2(DIRS[a][1], DIRS[a][0]) - ang)) - Math.abs(norm(Math.atan2(DIRS[b][1], DIRS[b][0]) - ang)));
      if (opts.length) dir = opts[0];
      if (process.env.DBGSIM2) console.log(`    gap-stall: tile(${pc[0]},${pc[1]}) -> ${dir}`);
    }
    // stuck: no real progress while we have somewhere to go -> fresh route
    if (lastPos && Math.hypot(p.x - lastPos[0], p.y - lastPos[1]) < 0.5) {
      if (++stuck > 45) { path = []; recomputeIn = 0; stuck = 0; }
    } else stuck = 0;
    lastPos = [p.x, p.y];
    // don't stand still forever: after 5s of holding, take the raw path anyway
    // (humans wait out a full patrol half-cycle, ~5-8s, before committing)
    if (dir === null && !chased) {
      if (++holdFrames > 300) { const f = bfsPath(pc, goalTile(), null, true); if (f) path = f.slice(1); holdFrames = 0; }
      // dead-window stall (not a pending wait): hop to a neighbor that is
      // unwatched now AND has a live window (the pin-spot deadlock escape)
      if (crossWait <= 0) { if (++deadWaitFrames > 60) {
        for (const [ox, oy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const tx = pc[0] + ox, ty = pc[1] + oy;
          if (game.hitsWall((tx + 0.5) * T, (ty + 0.5) * T, 11)) continue;
          let watched = false; for (const g of guards()) { if (g.state === 'down' || g.state === 'dazed') continue; if (marginSeesTile(g, [tx, ty])) { watched = true; break; } }
          if (watched) continue;
          const cand = astarPath([tx, ty], goalTile(), null, risky);
          if (!cand || cand.length < 2) continue;
          const transit = []; for (let si = 0; si < cand.length && si < 12; si++) transit.push([cand[si + 1], (si + 1) * 0.25]);
          const w2 = crossingWindow(transit, [tx, ty], 12);
          if (w2 !== null) { dir = ox === 1 ? 'd' : ox === -1 ? 'a' : oy === 1 ? 's' : 'w'; holdFrames = 0; crossWait = 0; deadWaitFrames = 0; if (process.env.DBGSIM2) console.log('    nudge: hop to (' + tx + ',' + ty + ') w=' + w2.toFixed(2)); break; }
        }
      } } else deadWaitFrames = 0;
    }
    else holdFrames = 0;
    if (process.env.DBGSIM2 && i % 30 === 0) {
      const chasers = guards().filter((g) => g.state === 'chase').map((g) => `g@${(g.x / T).toFixed(1)},${(g.y / T).toFixed(1)} f=${g.facing.toFixed(1)}`);
      console.log(`  t=${(i / 60).toFixed(1)} dir=${dir} goal=${JSON.stringify(goalTile())} chased=${chased ? chasers.join(' ') : '-'} pos=${(p.x / T).toFixed(1)},${(p.y / T).toFixed(1)}`);
    }
    // F33: in range of the quest container, face it and HOLD ACT to search it.
    // (searchTarget needs a held direction toward the container, so we press AND hold.)
    const q = currentQuestContainer();
    let searchHold = false;
    if (q && !q.opened && !chased) {
      const dxc = q.x - p.x, dyc = q.y - p.y;
      if (Math.hypot(dxc, dyc) < game.SEARCH_RANGE) {
        dir = Math.abs(dxc) > Math.abs(dyc) ? (dxc > 0 ? 'd' : 'a') : (dyc > 0 ? 's' : 'w');
        searchHold = true;
      }
    }
    s.keys['e'] = searchHold;
    s.keys['w'] = dir === 'w'; s.keys['a'] = dir === 'a'; s.keys['s'] = dir === 's'; s.keys['d'] = dir === 'd';
    game.update(dt);
    if (process.env.DBGSIM2) for (const g of guards()) { const k = 'simSeen'; if (!g[k]) g[k] = g.state; if (g[k] !== 'chase' && g.state === 'chase') { const d = Math.hypot(p.x - g.x, p.y - g.y); console.log('    CHASE-START t=' + (i / 60).toFixed(2) + ' g@' + (g.x / T).toFixed(1) + ',' + (g.y / T).toFixed(1) + ' f=' + g.facing.toFixed(2) + ' bot@' + (p.x / T).toFixed(1) + ',' + (p.y / T).toFixed(1) + ' dist=' + d.toFixed(0)); } g[k] = g.state; }
  }
  const end = st();
  const nk = Object.values(end.keyBag).filter(Boolean).length;
  return { won: end.won, gameOver: end.gameOver, nKeys: nk, hasFile: end.hasFile, doorsOpen: { ...end.doorsOpen } };
}

const SEEDS = process.env.SIMSEEDS ? process.env.SIMSEEDS.split(',').map(Number) : [42, 7, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000];
let wins = 0; const winning = [];
for (const seed of SEEDS) {
  const r = play(seed, 120);
  if (r.won) { wins++; winning.push(seed); }
  const stage = r.nKeys < 3 ? 'keys(' + r.nKeys + '/3)' : (!r.doorsOpen.red || !r.doorsOpen.blue ? 'doors' : (r.hasFile ? 'file' : 'exit'));
  console.log(`seed ${String(seed).padStart(6)}: ${r.won ? 'WIN' : 'lost (' + stage + ')'}  keys=${r.nKeys}/3 doors=b${r.doorsOpen.blue}/r${r.doorsOpen.red} file=${r.hasFile}`);
}
console.log(`\nWINS: ${wins}/${SEEDS.length} -> ${wins > 0 ? 'GAME IS WINNABLE' : 'NOT WINNABLE BY THIS POLICY'}`);
console.log('winning seeds:', winning.join(', '));
