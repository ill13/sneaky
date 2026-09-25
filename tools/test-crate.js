// ============================================================
//  F43 - the pushable crate. A solid, unbreakable, unsearchable tile you
//  shove one square at a time. Blocks player collision, guard pathing, and
//  line of sight. A patrolling guard notices a crate shoved into its lane
//  (one-time stall + re-route). Driven through the real paths. Keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
const T = g.TILE;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// a crate in the camera room (E)
const eCrate = () => state.crates[0];

// C1: crates exist in the switch rooms (E, H) when TOOLS.crate is on.
{
  g.reset(42);
  ok(state.crates.length === 2, 'C1: two crates (one per switch room) when TOOLS.crate is on');
  const rooms = state.crates.map((b) => b.c + ',' + b.r).sort();
  const eRoom = state.crates.some((b) => g.roomAt(b.c, b.r) && g.roomAt(b.c, b.r)[0] === 1 && g.roomAt(b.c, b.r)[1] === 1);
  const hRoom = state.crates.some((b) => g.roomAt(b.c, b.r) && g.roomAt(b.c, b.r)[0] === 1 && g.roomAt(b.c, b.r)[1] === 2);
  ok(eRoom && hRoom, 'C1: a crate in the camera room (E) and the robot room (H)');
}

// C2: a crate is solid - it blocks the tile and the player can't walk through it.
{
  g.reset(42);
  const b = eCrate();
  ok(g.crateAt(b.c, b.r) === b, 'C2: crateAt finds the crate on its tile');
  ok(g.tileBlocked(b.c, b.r) === true, 'C2: the crate tile is blocked (map + crate)');
  ok(g.roomWalkable(1, 1, b.c, b.r) === false, 'C2: the crate tile is not walkable (guards route around)');
}

// C3: pushing a crate (head-on, far tile clear) moves it one tile.
{
  g.reset(42);
  const b = eCrate();
  const c0 = b.c, r0 = b.r;
  // put the player directly to the LEFT of the crate, head-on, pushing right
  state.player.x = c0 * T - 1; state.player.y = (r0 + 0.5) * T;
  const pushed = g.tryPushCrate(state.player, 1, 0);
  ok(pushed === b, 'C3: a head-on push resolves the crate');
  ok(b.c === c0 + 1 && b.r === r0, 'C3: the crate advanced one tile (right)');
}

// C4: a push into a wall (far tile blocked) does NOT move the crate.
{
  g.reset(42);
  const b = eCrate();
  // push the crate LEFT: the player stands to the RIGHT of it, head-on, far tile (b.c-1) clear
  let moved = 0;
  for (let i = 0; i < 40; i++) {
    state.player.x = (b.c + 1) * T + 1; state.player.y = (b.r + 0.5) * T;
    if (!g.tryPushCrate(state.player, -1, 0)) break;
    moved++;
  }
  // now it's against a wall; one more push must fail (far tile is a wall)
  state.player.x = (b.c + 1) * T + 1; state.player.y = (b.r + 0.5) * T;
  const cNow = b.c;
  ok(!g.tryPushCrate(state.player, -1, 0), 'C4: a crate against a wall cannot be pushed further');
  ok(b.c === cNow, 'C4: the crate stays put when its far tile is blocked');
  ok(moved > 0, 'C4: the crate DID move before hitting the wall (push works)');
}

// C5: a crate blocks line of sight.
{
  g.reset(42);
  const b = eCrate();
  // a ray from one side of the crate to the other is blocked by the crate
  const x0 = (b.c - 1.5) * T, y0 = (b.r + 0.5) * T;
  const x1 = (b.c + 1.5) * T, y1 = (b.r + 0.5) * T;
  ok(g.hasLOS(x0, y0, x1, y1) === false, 'C5: a crate blocks line of sight');
  // ...and not when there's no crate in the way
  const x2 = (b.c - 1.5) * T, y2 = (b.r + 0.5) * T + 3 * T;   // a lane clear of the crate
  const x3 = (b.c + 1.5) * T, y3 = (b.r + 0.5) * T + 3 * T;
  const clear = g.hasLOS(x2, y2, x3, y3);
  ok(clear === true, 'C5: a lane clear of the crate keeps line of sight');
}

// C6: pushing a crate into a patrolling guard's lane stalls it (one-time pause).
{
  g.reset(42);
  const b = eCrate();
  // find a patrolling guard in room E
  const guard = state.guards.find((x) => !x.machine && !x.asleep && x.state === 'patrol' && x.room[0] === 1 && x.room[1] === 1);
  ok(!!guard, 'C6: a patrolling guard exists in the crate room');
  if (guard) {
    // shove the crate directly onto the guard's tile (next to it) to trigger the near-reaction
    const gc = guard.c !== undefined ? guard.c : Math.floor(guard.x / T);
    // place the crate adjacent to the guard, then push it so it lands on a tile the guard is on its path toward
    state.player.x = b.c * T - 1; state.player.y = (b.r + 0.5) * T;
    const before = guard.pause;
    // move the guard next to the crate and push the crate toward it
    guard.x = (b.c + 1) * T + 0.5 * T; guard.y = (b.r + 0.5) * T;   // guard just right of the crate
    state.player.x = b.c * T - 1; state.player.y = (b.r + 0.5) * T;
    const pushed = g.tryPushCrate(state.player, 1, 0);
    if (pushed) g.onCrateMoved(pushed);
    ok(guard.pause > before, 'C6: a crate shoved beside a patrolling guard stalls it');
  }
}

// C7: TOOLS.crate off removes the crates (the curation toggle).
{
  g.reset(42);
  const before = state.crates.length;
  g.TOOLS.crate = false;
  g.reset(42);
  const after = state.crates.length;
  g.TOOLS.crate = true;   // restore
  ok(before > 0 && after === 0, 'C7: TOOLS.crate off removes the crates');
}

// C8: a crate is not a knockout target and not searchable (it's furniture, not a unit).
{
  g.reset(42);
  const b = eCrate();
  ok(!b.machine && b.arc === undefined, 'C8: a crate has no unit/contents fields (not a guard, not a container)');
  ok(!state.containers.some((ct) => ct.c === b.c && ct.r === b.r), 'C8: a crate tile is not a search container');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F43 (crate) CHECKS PASSED');
process.exit(fails ? 1 : 0);
