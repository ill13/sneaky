// F26: unified movement / collision regression tests.
//   tryMove(u, dx, dy) is the ONE movement path for every unit (player, guards,
//   future VIPs). It reads each unit's own radius, sub-steps big frames, and
//   resolves X then Y so a unit blocked on one axis slides along the other.
//   These tests pin that behavior down on controlled maps.
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { TILE, COLS, ROWS, hitsWall, tryMove } = g;

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : ''));
  if (!ok) failures++;
}

// Controlled map: open floor + a 2x2 solid block at cols 26-27, rows 17-18.
function blockMap() {
  const m = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  for (let r = 17; r < 19; r++) for (let c = 26; c < 28; c++) m[r][c] = 1;
  g.state.map = m;
  return m;
}

// ---- T1: slide along a wall face ------------------------------------------
{
  blockMap();
  const u = { x: (28) * TILE + 12, y: 17 * TILE + 30, r: 11 };   // just right of the block
  const y0 = u.y;
  for (let i = 0; i < 60; i++) tryMove(u, 0, -2.5);             // drive up
  check('T1: unit slides up along a wall face', (y0 - u.y) > 40, `climbed ${(y0 - u.y).toFixed(1)}px`);
  check('T1: slide stayed clear of the block', !hitsWall(u.x, u.y, 11), `at (${u.x.toFixed(0)},${u.y.toFixed(0)})`);
}

// ---- T2: round a convex corner without tunneling or freezing --------------
// A unit driven diagonally into a tile's corner must stop short of it (never
// tunnel/overlap the solid tile) and must not freeze on the corner - a nudge
// along the free axis still slides it clear. Footprint-agnostic.
{
  const m = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  m[17][26] = 1;   // tile spans x[832,864] y[544,576]; bottom-right corner (864,576)
  g.state.map = m;
  const u = { x: 864 + 40, y: 576 + 40, r: 11 };                // SE of the corner
  let tunneled = false;
  for (let i = 0; i < 120; i++) {
    tryMove(u, -1.7, -1.7);                                     // drive NW into the corner
    if (u.x + 11 > 832 && u.x - 11 < 864 && u.y + 11 > 544 && u.y - 11 < 576) tunneled = true;
  }
  check('T2a: diagonal corner approach never tunnels the tile', !tunneled, `ended at (${u.x.toFixed(0)},${u.y.toFixed(0)})`);
  const before = { x: u.x, y: u.y };
  for (let i = 0; i < 30; i++) tryMove(u, 0, -2.5);             // nudge up along the free axis
  const moved = Math.hypot(u.x - before.x, u.y - before.y);
  check('T2b: not frozen on the corner (a nudge still slides)', moved > 10, `nudged ${moved.toFixed(0)}px`);
}

// ---- T3: sub-stepping stops a lag spike from tunneling a wall --------------
{
  const m = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  for (let r = 0; r < ROWS; r++) m[r][26] = 1;                 // 1-tile wall, col 26
  g.state.map = m;
  const u = { x: 25 * TILE + 16, y: 17 * TILE, r: 11 };         // left of the wall
  tryMove(u, 60, 0);                                            // one big 60px step
  check('T3: a 60px lag-spike step cannot tunnel the wall', u.x < 26 * TILE, `x=${u.x.toFixed(1)} (wall at ${26 * TILE})`);
}

// ---- T4: movement is unit-aware (reads each unit's own radius) -------------
// A 1-tile (32px) vertical corridor: a small unit fits, a bigger one is blocked.
{
  const m = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  for (let r = 0; r < ROWS; r++) { m[r][25] = 1; m[r][27] = 1; }   // corridor at col 26, 32px wide
  g.state.map = m;
  const small = { x: 26 * TILE + 16, y: 20 * TILE, r: 14 };     // 28px < 32px
  const big = { x: 26 * TILE + 16, y: 20 * TILE, r: 17 };       // 34px > 32px
  for (let i = 0; i < 30; i++) { tryMove(small, 0, -2.5); tryMove(big, 0, -2.5); }
  const smallClimbed = 20 * TILE - small.y, bigClimbed = 20 * TILE - big.y;
  check('T4: a 28px unit fits the 32px corridor', smallClimbed > 30, `climbed ${smallClimbed.toFixed(0)}px`);
  check('T4: a 34px unit is blocked by the same corridor', bigClimbed < 12, `climbed ${bigClimbed.toFixed(0)}px (welded at the wall face)`);
}

console.log(failures === 0 ? '\nALL F26 MOVEMENT CHECKS PASSED' : `\n${failures} MOVEMENT FAILURE(S)`);
process.exit(failures ? 1 : 0);
