// Map generation + quest-chain invariants (3x3, path-first). Run: node tools/test-gen.js
const assert = require('assert');
const { loadGame } = require('./load-game.cjs');
const api = loadGame();
const { state, reset, roomAt, TILE, COLS, ROWS, mulberry32 } = api;

// ---- BFS helpers (mirror the game's tile grid) ----
function tileOf(x, y) { return [Math.floor(x / TILE), Math.floor(y / TILE)]; }
const blocked = (m, c, r, openLocked) => {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
  const v = m[r][c];
  return v === 1 || (v === 2 && !openLocked);
};
function bfs(m, from, openLocked) {
  const seen = new Set([from[0] + ',' + from[1]]);
  const q = [from];
  while (q.length) {
    const [c, r] = q.shift();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      const k = nc + ',' + nr;
      if (!blocked(m, nc, nr, openLocked) && !seen.has(k)) { seen.add(k); q.push([nc, nr]); }
    }
  }
  return seen;
}

// Passage exists between two horizontally-adjacent rooms? Scan the shared
// wall column for open (0) or locked (2) tiles inside the room row band.
function hPassage(m, c1, r) {
  const wx = 17 + Math.min(c1, c1 + 1) * 17;
  const y0 = 1 + r * 11;
  let n = 0;
  for (let dy = 0; dy < 10; dy++) { const v = m[y0 + dy][wx]; if (v === 0 || v === 2) n++; }
  return n;
}
// Same for vertically-adjacent rooms (shared wall row).
function vPassage(m, c, r1) {
  const wy = 11 + Math.min(r1, r1 + 1) * 11;
  const x0 = 1 + c * 17;
  let n = 0;
  for (let dx = 0; dx < 16; dx++) { const v = m[wy][x0 + dx]; if (v === 0 || v === 2) n++; }
  return n;
}
// The authored solution path must be walkable on the actual map.
function pathWalkable(m) {
  for (let i = 0; i + 1 < api.SOLUTION_PATH.length; i++) {
    const [c1, r1] = api.SOLUTION_PATH[i];
    const [c2, r2] = api.SOLUTION_PATH[i + 1];
    if (r1 === r2) {
      assert.ok(hPassage(m, Math.min(c1, c2), r1) >= 2,
        'path edge ' + c1 + ',' + r1 + ' -> ' + c2 + ',' + r2 + ' blocked');
    } else {
      assert.ok(vPassage(m, c1, Math.min(r1, r2)) >= 2,
        'path edge ' + c1 + ',' + r1 + ' -> ' + c2 + ',' + r2 + ' blocked');
    }
  }
}

// F33: containers. The container holding a quest item (by role/id) and the
// floor tiles you can stand on to search it (its "access").
const contOf = (role, id) => state.containers.find((ct) => ct.contents.some((i) => i.role === role && (id === undefined || i.id === id)));
const accessTiles = (ct) => {
  const acc = [];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nc = ct.c + dc, nr = ct.r + dr;
    if (nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && state.map[nr][nc] === 0) acc.push([nc, nr]);
  }
  return acc;
};

let n = 0;
function check(name, fn) { n++; try { fn(); console.log('PASS  ' + name); } catch (e) { console.log('FAIL  ' + name + '  [' + e.message + ']'); process.exitCode = 1; } }

// ---------- 1. structure ----------
reset(7);
const m = state.map;
check('map is a 52x34 grid', () => {
  assert.strictEqual(m.length, ROWS);
  assert.strictEqual(m[0].length, COLS);
});
check('border is solid', () => {
  for (let c = 0; c < COLS; c++) { assert.strictEqual(m[0][c], 1); assert.strictEqual(m[ROWS - 1][c], 1); }
  for (let r = 0; r < ROWS; r++) { assert.strictEqual(m[r][0], 1); assert.strictEqual(m[r][COLS - 1], 1); }
});
check('authored wall plan: 20 open gaps at the exact tiles, bottom row fully sealed', () => {
  const open = [
    // vertical opens (ONE centered door each): x17/x34 at rows 6-7 (sec 0) and 17-18 (sec 1)
    ...[6, 7, 17, 18].flatMap((y) => [[17, y], [34, y]]),
    // horizontal opens (two 2-tile doors each section): y11 all three sections
    ...[5, 6, 11, 12, 22, 23, 28, 29, 39, 40, 45, 46].map((x) => [x, 11]),
  ];
  for (const [c, r] of open) assert.strictEqual(m[r][c], 0, 'open gap ' + c + ',' + r);
  // the whole bottom row (y=22) is now LOCKED (value 2) across all three sections
  for (const x of [6, 7, 23, 24, 40, 41]) assert.strictEqual(m[22][x], 2, 'locked ' + x + ',22');
  // sealed sections stay solid
  for (const r of [26, 27, 29, 30]) assert.strictEqual(m[r][17], 1, 'x17 row ' + r + ' must seal');
  for (const r of [26, 27, 29, 30]) assert.strictEqual(m[r][34], 1, 'x34 row ' + r + ' must seal');
  // nothing else open on the wall lines
  let g = 0;
  for (const c of [17, 34]) for (let r = 1; r < ROWS - 1; r++) if (m[r][c] === 0) g++;
  for (const y of [11, 22]) for (let c = 1; c < COLS - 1; c++) if (m[y][c] === 0) g++;
  assert.strictEqual(g, 20, 'open gap count ' + g);
});
check('exactly 6 locked-door tiles: three doors on wall y=22 (blue/red/green)', () => {
  let locked = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (m[r][c] === 2) locked++;
  assert.strictEqual(locked, 6);
  for (const x of [6, 7, 23, 24, 40, 41]) assert.strictEqual(m[22][x], 2);
});
check('authored solution path is walkable (guaranteed solution)', () => pathWalkable(m));
check('spawn room is (0,0) on floor', () => {
  const [c, r] = tileOf(state.player.x, state.player.y);
  assert.deepStrictEqual(roomAt(c, r), [0, 0]);
  assert.strictEqual(m[r][c], 0);
});
check('object rooms: file (1,2), exit (0,2), keys in F/D/E', () => {
  const [ec, er] = tileOf(state.exitPos.x, state.exitPos.y);
  assert.deepStrictEqual(roomAt(ec, er), [0, 2], 'exit room');
  const fileC = contOf('objective');
  assert.deepStrictEqual([fileC.rc, fileC.rr], [1, 2], 'file room');
  for (const k of api.KEYS) {
    const kc = contOf('key', k.id);
    assert.deepStrictEqual([kc.rc, kc.rr], k.room, k.id + ' key room ' + [kc.rc, kc.rr] + ' expected ' + k.room);
  }
});
check('upgrades: one per dead-end room (C/F/I), solid container, door-closed reachable', () => {
  const rooms = [];
  for (const t of ['stim', 'hush', 'heavy']) {
    const ct = contOf('upgrade', t);
    assert.ok(ct, t + ' container missing');
    assert.strictEqual(m[ct.r][ct.c], 1, t + ' container not solid');
    const room = ct.rc + ',' + ct.rr;
    assert.ok(['2,0', '2,1', '2,2'].includes(room), t + ' room ' + room);
    rooms.push(room);
  }
  assert.strictEqual(new Set(rooms).size, 3, 'upgrades must occupy 3 distinct dead ends');
  const [sc, sr] = tileOf(state.player.x, state.player.y);
  const seen = bfs(m, [sc, sr], true);   // the I dead end sits behind the gold door
  for (const t of ['stim', 'hush', 'heavy']) {
    const acc = accessTiles(contOf('upgrade', t));
    assert.ok(acc.some(([c, r]) => seen.has(c + ',' + r)), t + ' not all-doors-open reachable');
  }
});

// ---------- 2. quest reachability (F29: the iterative key chain) ----------
check('all keys grabbable + doors openable + file/exit reachable (validateKeyChain)', () => {
  const [sc, sr] = tileOf(state.player.x, state.player.y);
  const keys = api.KEYS.map((k) => ({
    id: k.id, color: k.color,
    access: accessTiles(contOf('key', k.id)),
    doorTiles: api.doorSecTiles(k.doorSec),
  }));
  const kc = api.validateKeyChain(m, [sc, sr], keys,
    { access: accessTiles(contOf('objective')) },
    [Math.floor(state.exitPos.x / TILE), Math.floor(state.exitPos.y / TILE)]);
  assert.strictEqual(kc.allKeys, true, 'not all keys grabbable: ' + kc.collected);
  assert.strictEqual(kc.fileOk, true, 'file not reachable with all doors open');
  assert.strictEqual(kc.exitOk, true, 'exit not reachable with all doors open');
});
check('with no doors open: every key reachable, file + exit sealed behind locks', () => {
  const [sc, sr] = tileOf(state.player.x, state.player.y);
  const seen = bfs(m, [sc, sr], false);
  for (const k of api.KEYS) {
    const acc = accessTiles(contOf('key', k.id));
    assert.ok(acc.some(([c, r]) => seen.has(c + ',' + r)), k.id + ' key unreachable with all doors locked');
  }
  const fileAcc = accessTiles(contOf('objective'));
  assert.ok(!fileAcc.some(([c, r]) => seen.has(c + ',' + r)), 'file should be sealed behind the red door');
  const [ec, er] = tileOf(state.exitPos.x, state.exitPos.y);
  assert.ok(!seen.has(ec + ',' + er), 'exit should be sealed behind the blue door');
});

// ---------- 3. upgrade pickup ----------
check('searching the upgrade container banks it', () => {
  reset(7);
  const t = ['stim', 'hush', 'heavy'].find((t) => !state.upgrades[t]);
  const ct = contOf('upgrade', t);
  const [ac, ar] = accessTiles(ct)[0];
  state.player.x = (ac + 0.5) * TILE; state.player.y = (ar + 0.5) * TILE;
  const dx = ct.c - ac, dy = ct.r - ar;
  const dir = dx > 0 ? 'arrowright' : dx < 0 ? 'arrowleft' : dy > 0 ? 'arrowdown' : 'arrowup';
  state.keys[dir] = true; state.keys['e'] = true;
  for (let i = 0; i < 60 * 4 && !state.upgrades[t]; i++) api.update(1 / 60);
  state.keys[dir] = false; state.keys['e'] = false;
  assert.strictEqual(state.upgrades[t], true, t + ' not banked');
  assert.ok(ct.opened, 'container should be marked opened');
});

// ---------- 4. many seeds ----------
check('50 seeds: structure + path + reachability hold', () => {
  for (const s of [1, 42, 777, 2024, 99999, 123456, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 31, 32, 33, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110]) {
    reset(s);
    const mm = state.map;
    let locked = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (mm[r][c] === 2) locked++;
    assert.strictEqual(locked, 6, 'seed ' + s + ' locked count');
    pathWalkable(mm);
    const [sc, sr] = tileOf(state.player.x, state.player.y);
    const closed = bfs(mm, [sc, sr], false);
    const open = bfs(mm, [sc, sr], true);
    for (const k of api.KEYS) {
      const acc = accessTiles(contOf('key', k.id));
      assert.ok(acc.some(([c, r]) => closed.has(c + ',' + r)), 'seed ' + s + ': ' + k.id + ' key not closed-reachable');
    }
    {
      const [ec, er] = tileOf(state.exitPos.x, state.exitPos.y);
      assert.ok(open.has(ec + ',' + er), 'seed ' + s + ': exit not open-reachable');
    }
    for (const t of ['stim', 'hush', 'heavy']) {
      const acc = accessTiles(contOf('upgrade', t));
      assert.ok(acc.some(([c, r]) => open.has(c + ',' + r)), 'seed ' + s + ': ' + t + ' not open-reachable');
    }
    {
      const acc = accessTiles(contOf('objective'));
      assert.ok(acc.some(([c, r]) => open.has(c + ',' + r)), 'seed ' + s + ': file not open-reachable');
    }
  }
});

// ---------- 4b. obstacle density (F20) ----------
// Every room drops 3-5 obstacles (procedural), so the interior solid-tile count
// must be real and sane; and a sample of seeds must generate (not fall back).
check('every room has 2-3 containers + 3-5 obstacle shapes (interior solid 4-24), no fallback', () => {
  for (const s of [1, 42, 7, 99999, 123456, 300, 400, 500, 8000, 9000]) {
    const L = api.generateLayout(s);
    assert.ok(L.usedSeed !== -1, 'seed ' + s + ' fell back to pillar-free');
    const byRoom = {};
    for (const ct of L.containers) byRoom[ct.rc + ',' + ct.rr] = (byRoom[ct.rc + ',' + ct.rr] || 0) + 1;
    for (let rr = 0; rr < 3; rr++) for (let rc = 0; rc < 3; rc++) {
      const key = rc + ',' + rr;
      const ox = 1 + rc * 17, oy = 1 + rr * 11;
      let t = 0;
      for (let r = oy; r < oy + 10; r++) for (let c = ox; c < ox + 16; c++) if (L.map[r][c] === 1) t++;
      assert.ok(byRoom[key] >= 2 && byRoom[key] <= 3, 'seed ' + s + ' room ' + key + ' has ' + byRoom[key] + ' containers');
      // F44: room D has the laser nook (9 wall tiles) on top of its obstacles
      const cap = (rc === 0 && rr === 1) ? 33 : 24;
      assert.ok(t >= 4 && t <= cap, 'seed ' + s + ' room ' + key + ' has ' + t + ' interior solid tiles');
    }
  }
});

// ---------- 5. fallback ----------
check('fallback: 52x34, 6 locked tiles, quest containers present, usedSeed -1', () => {
  const L = api.generateFallback(42);
  assert.strictEqual(L.map.length, ROWS);
  assert.strictEqual(L.map[0].length, COLS);
  let locked = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (L.map[r][c] === 2) locked++;
  assert.strictEqual(locked, 6);
  assert.strictEqual(L.usedSeed, -1);
  pathWalkable(L.map);
  assert.ok(L.containers.length >= 18, 'fallback should place containers, got ' + L.containers.length);
  for (const q of ['blue', 'gold', 'red', 'objective', 'stim', 'hush', 'heavy'])
    assert.ok(L.questContainer[q], 'fallback missing quest container ' + q);
  for (const ct of L.containers) assert.strictEqual(L.map[ct.r][ct.c], 1, 'fallback container not solid');
});

// ---------- 6. alarm cascade + knockouts (smoke) ----------
check('alarm cascade: first hit raises alarm, second = CAUGHT', () => {
  reset(10);
  const g = state.guards[0];
  state.player.x = g.x - 40; state.player.y = g.y;
  g.facing = Math.PI;
  g.state = 'patrol';
  for (let i = 0; i < 60 && !state.alarmTime; i++) api.update(1 / 60);
  assert.ok(state.alarmTime > 0, 'alarm should be raised');
  state.player.invuln = 0;
  g.shootCd = 0;
  for (let i = 0; i < 60 && !state.gameOver; i++) api.update(1 / 60);
  assert.ok(state.gameOver && !state.won, 'second shot should be CAUGHT');
});

check('knockout from behind knocks guard out, then it wakes', () => {
  reset(10);
  state.gameOver = false; state.won = false;
  const g = state.guards.find((g) => g.state === 'patrol');
  g.state = 'patrol';
  g.facing = 0;
  state.player.x = g.x - 20; state.player.y = g.y;
  state.keys['e'] = true;
  api.update(1 / 60);
  state.keys['e'] = false;
  assert.strictEqual(g.state, 'down', 'should be down');
  assert.ok(g.ko > 0 && g.ko <= api.KO_TIME);
  for (let i = 0; i < (api.KO_TIME + 1.5 + 0.5) * 60 && g.state === 'down'; i++) api.update(1 / 60);
  assert.ok(['patrol', 'chase', 'dazed'].includes(g.state), 'guard should have woken, got ' + g.state);
});

check('knockout from the FRONT does nothing', () => {
  reset(10);
  state.gameOver = false; state.won = false;
  const g = state.guards.find((g) => g.state === 'patrol');
  g.state = 'patrol';
  g.facing = 0;
  state.player.x = g.x + 20; state.player.y = g.y;
  state.keys['e'] = true;
  api.update(1 / 60);
  state.keys['e'] = false;
  assert.notStrictEqual(g.state, 'down');
});

console.log(process.exitCode ? '\nTEST-GEN FAILURES' : `\nALL MAPGEN TESTS PASSED (${n} checks)`);
