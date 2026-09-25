// test-action.js - the single contextual action button (F27): the verb resolver
// precedence. Headless - we position the player and one guard directly, so each
// context is isolated and deterministic (no AI drift, no wall collisions to fight).
const { loadGame } = require('./load-game.cjs');
const G = loadGame();
const { reset, state, actionContext, tryAction, solid, canDistract, TILE } = G;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const tile = (cx, cy) => ({ x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE });

reset(42);
const bins = state.hideSpots;
const adjWall = (c, r) => solid(c+1,r,state.map) || solid(c-1,r,state.map) || solid(c,r+1,state.map) || solid(c,r-1,state.map);
const nearBin = (x, y) => bins.some(b => Math.hypot(b.x - x, b.y - y) < 40);

// the move direction that points from (c,r) at the adjacent wall (F32: the
// distract is direction-aware, so the tests must face the wall too)
const wallFacing = (c, r) => {
  if (solid(c+1, r, state.map)) return [1, 0];
  if (solid(c-1, r, state.map)) return [-1, 0];
  if (solid(c, r+1, state.map)) return [0, 1];
  if (solid(c, r-1, state.map)) return [0, -1];
  return null;
};
const face = ([dx, dy]) => {
  state.keys['a'] = dx < 0; state.keys['d'] = dx > 0;
  state.keys['w'] = dy < 0; state.keys['s'] = dy > 0;
};
const unface = () => { for (const k of ['a', 'd', 'w', 's']) delete state.keys[k]; };

// a floor tile touching a wall AND clear of any bin (a clean distract spot)
let wallSpot = null, wallC = -1, wallR = -1;
for (let r = 0; r < 21 && !wallSpot; r++) for (let c = 0; c < 16; c++) {
  if (solid(c, r, state.map) || !adjWall(c, r)) continue;
  const t = tile(c, r);
  if (!nearBin(t.x, t.y)) { wallSpot = t; wallC = c; wallR = r; break; }
}
ok(!!wallSpot, 'setup: found a wall-adjacent floor tile clear of any bin');
ok(wallSpot && canDistract(wallSpot.x, wallSpot.y, ...wallFacing(wallC, wallR)), 'setup: that tile is distract-able while facing its wall');

// park every guard on the floor tile FURTHEST from wallSpot so the wall context
// is clean (no guard within knockout/grab range).
function parkAway() {
  let best = null, bd = -1;
  for (let r = 0; r < 21; r++) for (let c = 0; c < 16; c++) {
    if (solid(c, r, state.map)) continue;
    const d = Math.hypot((c+0.5)*TILE - wallSpot.x, (r+0.5)*TILE - wallSpot.y);
    if (d > bd) { bd = d; best = tile(c, r); }
  }
  for (const g of state.guards) { g.x = best.x; g.y = best.y; g.state = 'patrol'; g.facing = 0; g.pathTiles = []; g.ko = 0; g.seenFor = 0; }
}
// put guard[0] 24px EAST of the player, facing east -> the player sits in its
// rear arc (knockable). The player is placed at (x,y).
function guardBehind(x, y) {
  const g = state.guards[0];
  g.x = x + 24; g.y = y; g.facing = 0; g.state = 'patrol'; g.ko = 0; g.pathTiles = []; g.seenFor = 0;
  state.player.x = x; state.player.y = y;
  return g;
}

// 1. carrying + a free bin  ->  hide
parkAway();
const bin = bins[0];
state.player.x = bin.x; state.player.y = bin.y;
state.carrying = state.guards[1]; state.guards[1].state = 'down';
ok(actionContext() === 'hide', 'carrying at a free bin -> hide');

// 2. carrying + flush to a wall, no bin  ->  drop (a wall is NOT a distraction)
parkAway();
state.player.x = wallSpot.x; state.player.y = wallSpot.y;
state.carrying = state.guards[1]; state.guards[1].state = 'down';
ok(actionContext() === 'drop', 'carrying against a wall (no bin) -> drop, not distract');
state.carrying = null;

// 3. not carrying + an awake guard in your rear arc  ->  knockout
parkAway();
guardBehind(wallSpot.x, wallSpot.y);
ok(actionContext() === 'knockout', 'awake guard in rear arc -> knockout');

// 4. not carrying + a downed guard in grab range  ->  grab
parkAway();
state.player.x = wallSpot.x; state.player.y = wallSpot.y;
const dg = state.guards[1]; dg.state = 'down'; dg.ko = 3; dg.x = wallSpot.x + 16; dg.y = wallSpot.y;
ok(actionContext() === 'grab', 'downed guard in range -> grab');

// 5. not carrying + flush to a wall, no guard  ->  distract (F32: while
// facing the wall; along the wall it must NOT trigger)
parkAway();
state.player.x = wallSpot.x; state.player.y = wallSpot.y;
face(wallFacing(wallC, wallR));
ok(actionContext() === 'distract', 'flush to a wall (facing it), no guard -> distract');
const wf = wallFacing(wallC, wallR);
face(wf[0] !== 0 ? [0, 1] : [1, 0]);   // face a direction that is NOT the wall
ok(actionContext() !== 'distract', 'flush to a wall, facing elsewhere -> NOT distract');
unface();

// 6. not carrying + wall AND an awake guard behind  ->  knockout (guard beats wall)
parkAway();
guardBehind(wallSpot.x, wallSpot.y);
ok(actionContext() === 'knockout', 'wall + awake guard -> knockout (guard actions beat the distract)');

// 7. open floor (no wall) + awake guard behind  ->  knockout (needs no wall)
parkAway();
let openSpot = null;
for (let r = 2; r < 19 && !openSpot; r++) for (let c = 2; c < 14; c++) {
  if (solid(c, r, state.map) || adjWall(c, r) || nearBin(tile(c, r).x, tile(c, r).y)) continue;
  openSpot = tile(c, r); break;
}
guardBehind(openSpot.x, openSpot.y);
ok(actionContext() === 'knockout', 'open floor + awake guard behind -> knockout');

// 8. PERFORMANCE: tryAction actually performs the verb it resolved
parkAway();
state.player.x = wallSpot.x; state.player.y = wallSpot.y;
const dg2 = state.guards[2]; dg2.state = 'down'; dg2.ko = 3; dg2.x = wallSpot.x + 16; dg2.y = wallSpot.y;
tryAction();
ok(state.carrying === dg2, 'tryAction grab -> state.carrying set to the body');
state.carrying = null;

parkAway();
guardBehind(wallSpot.x, wallSpot.y);
tryAction();
ok(state.guards[0].state === 'down', 'tryAction knockout -> the guard goes down');

console.log(fail === 0 ? `ALL ACTION-CONTEXT TESTS PASSED (${pass} checks)` : `FAILED: ${fail} failed, ${pass} passed`);
process.exit(fail === 0 ? 0 : 1);
