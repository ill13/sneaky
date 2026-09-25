// F26 corner-escape regression: drives the REAL game update() on the geometry
// LO captured (player upper-left of a 1-wide obstacle, lower part of the row
// above it, holding an axis) and confirms the player rolls around the corner
// instead of grinding to a stop. Also confirms a straight wall does NOT
// trigger a false roll (no drift).
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { TILE } = g;

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : ''));
  if (!ok) failures++;
}

function setup(mapFn) {
  g.reset(42);
  const m = Array.from({ length: 34 }, () => new Array(52).fill(0));
  mapFn(m);
  g.state.map = m;
  g.state.guards = [];          // isolate the player
  const p = g.state.player;
  p.hits = 0; p.invuln = 0;
  g.state.keys = {};
  return p;
}
function hold(key, frames) {
  g.state.keys[key] = true;
  for (let i = 0; i < frames; i++) g.update(1 / 60);
  g.state.keys[key] = false;
}

// T1: the reported spot - hold RIGHT into the corner, must roll up and around.
{
  const p = setup((m) => { m[6][5] = 1; m[7][5] = 1; });        // 1-wide, 2-tall obstacle
  p.x = 4 * TILE + 12; p.y = 5 * TILE + 24;                     // col 4, lower row 5
  const sx = p.x;
  hold('d', 180);
  const mx = p.x - sx;
  check('T1: hold right into the corner rolls around (not stuck at ~8px)', mx > 25, `moved right ${mx.toFixed(1)}px`);
}

// T2: vertical mirror - hold DOWN into a corner to the right, must roll left.
{
  const p = setup((m) => { m[5][5] = 1; });                     // single obstacle tile
  p.x = 4 * TILE + 18; p.y = 4 * TILE;                          // col 4 (right side), row 4
  const sy = p.y;
  hold('s', 180);
  const my = p.y - sy;
  check('T2: hold down into a right-side corner rolls left around', my > 25, `moved down ${my.toFixed(1)}px`);
}

// T3: straight wall - holding right into a full wall must NOT drift vertically.
{
  const p = setup((m) => { for (let r = 0; r < 34; r++) m[r][5] = 1; });   // full vertical wall, col 5
  p.x = 4 * TILE + 12; p.y = 10 * TILE;
  const sy = p.y;
  hold('d', 180);
  const drift = Math.abs(p.y - sy);
  check('T3: a straight wall does not trigger a false roll (no vertical drift)', drift < 3, `vertical drift ${drift.toFixed(1)}px`);
}

console.log(failures === 0 ? '\nALL CORNER-ESCAPE CHECKS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
