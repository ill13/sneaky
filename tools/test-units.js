// ============================================================
//  tools/test-units.js - Phase 1 provenance for the unified unit model.
//  Drives the real game via load-game.cjs. The money shot (T4) proves a NEW
//  unit type is just a table row + a spawn: the shared movement + sight treat
//  it by ITS OWN stats, with no changes to movement/sight/AI code.
// ============================================================
const { loadGame } = require('./load-game.cjs');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + msg); }
}

// ---------------- T1-T3: identity + refs on a real run ----------------
const g = loadGame();
g.reset(42);
const U = g.units();
const T = g.TILE, COLS = g.COLS, ROWS = g.ROWS, map = g.map();

// T1: every unit has a valid type (statsFor resolves) + a unique id
const seenIds = new Set();
let t1 = true;
for (const u of U) {
  let row; try { row = g.statsFor(u.type); } catch (e) { row = null; }
  if (!row) t1 = false;
  if (seenIds.has(u.id)) t1 = false;
  seenIds.add(u.id);
}
ok(t1, 'T1: every unit has a valid type (statsFor resolves) + a unique id');

// T2: exactly 1 player at units[0], 16 guards
ok(U[0].type === 'player' && U.filter((u) => u.type === 'player').length === 1,
   'T2a: exactly one player, at units[0]');
ok(U.filter((u) => u.type === 'guard').length === 16, 'T2b: exactly 16 guards');

// T3: convenience refs agree with the single array
ok(g.player() === U[0], 'T3a: state.player === state.units[0]');
ok(g.guards().length === U.length - 1, 'T3b: state.guards.length === units.length - 1');

// ---------------- T4: provenance - a new type is a row + a spawn ----------------
// A fresh load so the test-only row can't leak into the run above.
const h = loadGame();
h.reset(42);
const T2 = h.TILE, COLS2 = h.COLS, ROWS2 = h.ROWS, map2 = h.map();

// Register a test-only type: fat, fast, sees far. Everything below must key off
// THIS row, not the default guard row, with zero movement/sight/AI edits.
h.UNIT_TYPES.testguard = {
  radius: 18,
  moveSpeed: 200,
  chaseSpeed: 200,
  sightDist: 300,
  patrolFov: Math.PI,      // 180deg
  chaseFov: Math.PI,
  moveType: 'free',
};
const TS = h.statsFor('testguard');
const GS = h.statsFor('guard');

// T4a: makeUnit stamps the new unit with the table's radius + identity
const tg = h.makeUnit('testguard', 99, { x: 0, y: 0, facing: 0, state: 'patrol' });
ok(tg.type === 'testguard' && tg.id === 99 && tg.r === 18,
   'T4a0: makeUnit(testguard) -> type/id + r=18 pulled from the table');

// T4a: collision uses each unit's OWN radius. Find a wall tile in room A with an
// interior floor tile to its right; the 20px box (guard) fits at that floor
// centre, the 36px box (testguard) reaches into the wall.
let spotX = null, spotY = null;
outer: for (let r = 1; r < ROWS2 - 1; r++) {
  for (let c = 1; c < COLS2 - 2; c++) {
    if (!h.solid(c, r, map2)) continue;                 // candidate wall tile
    const fc = c + 1, fr = r;                           // floor candidate to its right
    const rm = h.roomAt(fc, fr);
    if (!rm || rm[0] !== 0 || rm[1] !== 0) continue;    // must be room A
    if (h.solid(fc, fr, map2)) continue;                // F must be floor
    // F interior enough that a 20px box centred on it stays on floor (up/down/right)
    if (h.solid(fc, fr - 1, map2) || h.solid(fc, fr + 1, map2) || h.solid(fc + 1, fr, map2)) continue;
    const fx = (fc + 0.5) * T2, fy = (fr + 0.5) * T2;
    if (h.hitsWall(fx, fy, GS.radius) === false && h.hitsWall(fx, fy, TS.radius) === true) {
      spotX = fx; spotY = fy; break outer;
    }
  }
}
ok(spotX !== null, 'T4a1: found a wall/floor spot that separates the two box sizes');
if (spotX !== null) {
  ok(h.hitsWall(spotX, spotY, GS.radius) === false, 'T4a2: guard box (r=10) fits at the spot');
  ok(h.hitsWall(spotX, spotY, TS.radius) === true,  'T4a3: testguard box (r=18) overlaps the wall');
}

// T4b: sight keys off the unit's OWN type. Same room, clear LOS, both facing the
// player, at a distance PAST the guard's range but INSIDE the testguard's.
let pair = null;
pa: for (let r1 = 0; r1 < ROWS2; r1++) {
  for (let c1 = 0; c1 < COLS2; c1++) {
    if (h.solid(c1, r1, map2)) continue;
    const rm1 = h.roomAt(c1, r1);
    if (!rm1 || rm1[0] !== 0 || rm1[1] !== 0) continue;
    for (let r2 = 0; r2 < ROWS2; r2++) {
      for (let c2 = 0; c2 < COLS2; c2++) {
        if (h.solid(c2, r2, map2)) continue;
        const rm2 = h.roomAt(c2, r2);
        if (rm2[0] !== rm1[0] || rm2[1] !== rm1[1]) continue;
        const x1 = (c1 + 0.5) * T2, y1 = (r1 + 0.5) * T2;
        const x2 = (c2 + 0.5) * T2, y2 = (r2 + 0.5) * T2;
        const d = Math.hypot(x2 - x1, y2 - y1);
        if (d > GS.sightDist && d < TS.sightDist && h.hasLOS(x1, y1, x2, y2)) {
          pair = { x1, y1, x2, y2, d, room: rm1 }; break pa;
        }
      }
    }
  }
}
ok(pair !== null, 'T4b1: found a same-room clear-LOS pair past the guard range');
if (pair) {
  h.state.player.x = pair.x2; h.state.player.y = pair.y2;
  // both units sit at the same spot, both facing the player -> only the range differs
  const gGuard = h.makeUnit('guard', 200, { x: pair.x1, y: pair.y1, facing: 0, room: pair.room, state: 'patrol' });
  const gTest = h.makeUnit('testguard', 201, { x: pair.x1, y: pair.y1, facing: 0, room: pair.room, state: 'patrol' });
  gGuard.facing = Math.atan2(pair.y2 - pair.y1, pair.x2 - pair.x1);
  gTest.facing = gGuard.facing;
  const seesTest = h.canSee(gTest, TS.patrolFov, TS.sightDist);
  const seesGuard = h.canSee(gGuard, GS.patrolFov, GS.sightDist);
  console.log('  (dist=' + pair.d.toFixed(0) + 'px; guard range=' + GS.sightDist + ', testguard range=' + TS.sightDist + ')');
  ok(seesTest === true, 'T4b2: testguard SEES the player (dist < its ' + TS.sightDist + ' range)');
  ok(seesGuard === false, 'T4b3: normal guard does NOT (dist > its ' + GS.sightDist + ' range)');
}

// ---------------- T5 (3.3b): the guard AI is speed-parameterized by type ----------------
// A second guard type moves through the AI's patrol step - the SAME call the AI
// makes, followPath(g, statsFor(g.type).moveSpeed, dt) - at ITS OWN table speed,
// not the default guard's. Proves the AI is stats-parameterized, not hardwired.
h.UNIT_TYPES.fastguard = {
  radius: 10, moveSpeed: 300, chaseSpeed: 300,
  sightDist: 192, patrolFov: 1.25, chaseFov: 1.6, moveType: 'patrol',
};
let run = null;
rscan: for (let r = 1; r < ROWS2 - 1; r++) {
  for (let c = 1; c < COLS2 - 4; c++) {
    const rm = h.roomAt(c, r);
    if (!rm || rm[0] !== 0 || rm[1] !== 0) continue;
    let clear = true;
    for (let k = 0; k < 4; k++) if (h.solid(c + k, r, map2)) { clear = false; break; }
    if (clear) { run = { c, r }; break rscan; }
  }
}
ok(run !== null, 'T5a: found a clear 4-tile run in room A');
if (run) {
  const dt = 0.1;
  const mk = (type) => ({
    type: type, id: 0, r: 10,
    x: (run.c + 0.5) * T2, y: (run.r + 0.5) * T2,
    facing: 0, state: 'patrol',
    pathTiles: [[run.c + 1, run.r], [run.c + 2, run.r], [run.c + 3, run.r]], wpTile: 0,
  });
  const fast = mk('fastguard');
  const normal = mk('guard');
  // the SAME call the AI makes for a patrolling guard:
  h.followPath(fast, h.statsFor('fastguard').moveSpeed, dt);
  h.followPath(normal, h.statsFor('guard').moveSpeed, dt);
  const fd = fast.x - (run.c + 0.5) * T2;
  const nd = normal.x - (run.c + 0.5) * T2;
  console.log('  (fastguard moved ' + fd.toFixed(1) + 'px, guard moved ' + nd.toFixed(1) + 'px in the same dt=' + dt + ')');
  ok(fd > 20 && nd < 8, 'T5b: the AI steps each guard at ITS OWN table speed (fastguard ' + fd.toFixed(0) + 'px vs guard ' + nd.toFixed(0) + 'px)');
}

console.log('');
console.log(fail === 0 ? 'ALL UNIT-MODEL TESTS PASSED (' + pass + ' checks)' : 'FAILURES: ' + fail + ' of ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
