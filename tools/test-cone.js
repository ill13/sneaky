// Verify conePoly clips EXACTLY at wall surfaces (no overshoot, no stair-step).
const { loadGame } = require('./load-game.cjs');
const api = loadGame();
const { TILE: T, COLS: CW, ROWS: CH, buildWallEdges, conePoly } = api;

let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : ''));
  if (!cond) fails++;
};

// Full-size map, all open, a FULL-HEIGHT wall at col 6 (blocks everything east).
const m = Array.from({ length: CH }, () => new Array(CW).fill(0));
for (let c = 0; c < CW; c++) { m[0][c] = 1; m[CH - 1][c] = 1; }
for (let r = 0; r < CH; r++) { m[r][0] = 1; m[r][CW - 1] = 1; m[r][6] = 1; } // wall at col 6
const edges = buildWallEdges(m);

const gx = (2 + 0.5) * T, gy = (7 + 0.5) * T;   // guard center, 4 tiles west of the wall face
const facing = 0;                                  // east, straight at the wall
const range = 6 * T;                               // 192, far enough to reach the wall (112px away)
const poly = conePoly(gx, gy, facing, 92 * Math.PI / 180, range, edges);

// Every forward ray should stop EXACTLY at the wall's left face: x = 6*T = 192.
const maxX = Math.max(...poly.slice(1).map((p) => p[0]));
ok('cone fully clipped at wall face (maxX = 6T)', Math.abs(maxX - 6 * T) < 0.01,
  `maxX=${maxX.toFixed(2)}, want ${6 * T}`);

// No point may extend BEYOND the wall face.
const beyond = poly.filter((p) => p[0] > 6 * T + 0.5);
ok('no point overshoots the wall face', beyond.length === 0, `beyond=${beyond.length}`);

// Remove the wall -> open field should reach full range (face north, open).
for (let r = 0; r < CH; r++) m[r][6] = 0;
const edges2 = buildWallEdges(m);
const polyN = conePoly(gx, gy, -Math.PI / 2, 92 * Math.PI / 180, range, edges2);
const maxN = Math.max(...polyN.slice(1).map((p) => Math.hypot(p[0] - gx, p[1] - gy)));
ok('open field reaches full range', maxN > range * 0.99, `max=${maxN.toFixed(0)}, want ~${range}`);

// Polygon fan sanity: starts at the guard, ~1-degree steps.
ok('polygon fan size sane', poly.length > 30 && Math.abs(poly[0][0] - gx) < 0.01 && Math.abs(poly[0][1] - gy) < 0.01,
  `n=${poly.length}`);

console.log(fails === 0 ? '\nALL CONE TESTS PASSED' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
