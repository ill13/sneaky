// Regression tests for two play-session bugfixes:
//  1. A guard mid distract-response animation (investigate / hear) or its dazed
//     wobble can be knocked out - you can interrupt the animation to put it down.
//  2. Guards can no longer see through the diagonal seam where two kitty-cornered
//     (corner-touching) blocks meet - hasLOS walks the ray cell-by-cell (DDA)
//     instead of sampling every 8px.
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state, TILE: T, hasLOS } = g;

let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : ''));
  if (!cond) fails++;
};

// ---- Section A: knock out a guard while it is in an animated state ----
// The player sits in the guard's REAR arc (guard faces away, player 20px behind,
// within KO_DIST=26). Pressing the action key must drop the guard even though
// it is in a state the old whitelist (patrol/chase/search) excluded.
function knockoutAnimated(stateName) {
  g.reset(42); state.gameOver = false;
  const pr = g.roomAt(Math.floor(state.player.x / T), Math.floor(state.player.y / T));
  const gd = state.guards.find((x) => x.room && x.room[0] === pr[0] && x.room[1] === pr[1]);
  if (!gd) { ok(stateName + ': no same-room guard to test', false); return; }
  gd.state = stateName;
  gd.x = state.player.x + 20; gd.y = state.player.y;   // guard 20px ahead in +x
  gd.facing = 0;                                        // facing +x -> player (at -x) is behind it
  gd.pathTiles = []; gd.wpTile = 0;
  state.actionPrev = false;
  state.keys['e'] = true; g.update(1 / 60); state.keys['e'] = false;
  ok(stateName + ': rear knockout works mid animation (guard -> down)', gd.state === 'down');
}
knockoutAnimated('investigate');
knockoutAnimated('hear');
knockoutAnimated('dazed');

// control: a bin-hidden guard is never knocked out (the filter still excludes it).
g.reset(42); state.gameOver = false;
const pr2 = g.roomAt(Math.floor(state.player.x / T), Math.floor(state.player.y / T));
const hidden = state.guards.find((x) => x.room && x.room[0] === pr2[0] && x.room[1] === pr2[1]);
if (hidden) {
  hidden.state = 'hidden'; hidden.x = state.player.x + 20; hidden.y = state.player.y; hidden.facing = 0;
  state.actionPrev = false;
  state.keys['e'] = true; g.update(1 / 60); state.keys['e'] = false;
  ok('hidden: a bin-hidden guard is not knocked out (still hidden)', hidden.state === 'hidden');
}

// ---- Section B: LOS across kitty-cornered blocks ----
// Tiny 6x6 grid (T=32). Two solid blocks diagonally adjacent (corner-touching) at
// (1,1) and (2,2) share the corner (2T,2T). A ray from upper-right to lower-left
// threads that corner through the two empty anti-diagonal cells.
function tinyMap(solidCells) {
  const m = Array.from({ length: 6 }, () => new Array(6).fill(0));
  for (const [c, r] of solidCells) m[r][c] = 1;
  state.map = m;
}

// B1 (the bug): ray threads the corner between (1,1) and (2,2) -> must be BLOCKED.
tinyMap([[1, 1], [2, 2]]);
ok('kitty-corner: a ray threading the corner between two diagonal blocks is blocked',
  hasLOS(3.5 * T, 0.5 * T, 0.5 * T, 3.5 * T) === false);

// B2 (control): same endpoints on an EMPTY grid -> CLEAR.
tinyMap([]);
ok('control: the same ray on an open grid is clear',
  hasLOS(3.5 * T, 0.5 * T, 0.5 * T, 3.5 * T) === true);

// B3 (control): a straight wall still blocks a straight ray.
tinyMap([[2, 1]]);
ok('control: a straight ray through a solid block is blocked',
  hasLOS(0.5 * T, 1.5 * T, 3.5 * T, 1.5 * T) === false);

// B4 (control): a genuine open diagonal corridor (blocks 2+ tiles apart) stays clear.
tinyMap([[0, 0], [3, 3]]);
ok('control: an open diagonal corridor between non-adjacent blocks stays clear',
  hasLOS(2.5 * T, 0.5 * T, 0.5 * T, 2.5 * T) === true);

// B5 (control): a clear straight horizontal line stays clear.
tinyMap([]);
ok('control: a clear straight line stays clear',
  hasLOS(0.5 * T, 1.5 * T, 5.5 * T, 1.5 * T) === true);

// restore a real map so nothing is left on the tiny grid
g.reset(42);
console.log(fails === 0 ? '\nALL LOS/KNOCKOUT TESTS PASSED' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
