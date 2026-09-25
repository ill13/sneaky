// ============================================================
//  SNEAK RUN - movement + collision.
//  One unit-aware resolver for every unit (player, guards, and any future
//  VIP / stronger guard / multiplayer peer): hand it a unit {x, y, r} and a
//  delta, it advances it as far as the walls allow, sliding along a blocked
//  axis. Axis-separated (X then Y, each with its own collision check).
//  Moves are sub-stepped so a lag spike can't tunnel a thin wall; at a normal
//  60fps frame the delta (~2.5px) is under the ceiling, so it's one step and
//  feels exactly like the classic resolver. Uses the live state.map.
// ============================================================

// F43: the crate on tile (c,r), or null. Crates are solid - folded into the
// collision, sight, and pathfinding blocked-tests so they block player / guards /
// vision / A* for free (they're furniture that happens to move).
function crateAt(c, r) {
  for (const b of (state.crates || [])) if (b.c === c && b.r === r) return b;
  return null;
}
// F43: is tile (c,r) blocked by map geometry OR a crate? The push's far-tile check
// and the crate-solid tests share this one predicate.
function tileBlocked(c, r) {
  return solid(c, r, state.map) || !!crateAt(c, r);
}
// Collision footprint: the 8 corners + edge midpoints of a 2r x 2r box.
function hitsWall(x, y, r) {
  const pts = [[-r, 0], [r, 0], [0, -r], [0, r], [-r, -r], [r, -r], [-r, r], [r, r]];
  return pts.some(([ox, oy]) => {
    const c = Math.floor((x + ox) / TILE), rr = Math.floor((y + oy) / TILE);
    return solid(c, rr, state.map) || !!crateAt(c, rr);
  });
}

// Sub-step ceiling in px. A normal frame's delta is ~2.5px (player) / ~1.6px
// (chaser), so the common case is a single step; only a lag spike gets split.
const MOVE_STEP = 8;

function tryMove(u, dx, dy) {
  if (!dx && !dy) return u;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / MOVE_STEP));
  const sx = dx / n, sy = dy / n;
  for (let i = 0; i < n; i++) {
    if (!hitsWall(u.x + sx, u.y, u.r)) u.x += sx;
    if (!hitsWall(u.x, u.y + sy, u.r)) u.y += sy;
  }
  return u;
}

// Phase 1.3: the movement path for FREE-steering units (the player today; a VIP
// or a stronger roamer tomorrow). Runs the tick's axis move, then the corner
// escape: holding a pure axis straight into a corner wedge (our corner caught by
// the neighbour's corner, the tile ahead is open floor) used to dead-stop. If the
// held axis is fully blocked AND rolling a hair along the free perpendicular opens
// the way ahead, nudge that way so the unit rounds the corner. Pure-axis holds
// only; diagonals and open corridors are untouched. tryMove is all-or-nothing per
// axis, so "blocked" is simply "the held axis didn't move". `dx`/`dy` is this
// tick's intended move; the escape nudge scales with it. A patrol unit does NOT
// call this - it follows an A* path (followPath) and never free-steers.
// F43: the push. A crate is shoveled one tile when you walk straight into it and
// the tile beyond is clear. Runs BEFORE the player's freeMove, so the crate pops
// out of the way and the player's normal collision then slides it forward into the
// vacated space - no clamping math, tryMove does the follow. Straight-on only:
// a pure-axis hold, head-on with the crate (same tile row/col), far tile open.
// Returns the pushed crate (so the caller can fire the guard reaction) or null.
function tryPushCrate(p, mx, my) {
  const pc = Math.floor(p.x / TILE), pr = Math.floor(p.y / TILE);
  const EPS = 1.5;   // px - how close your edge must be to the crate's face to push
  let dir = null, crate = null, fc = 0, fr = 0;
  if (mx > 0 && my === 0) { dir = [1, 0]; crate = crateAt(pc + 1, pr); fc = pc + 2; fr = pr; }
  else if (mx < 0 && my === 0) { dir = [-1, 0]; crate = crateAt(pc - 1, pr); fc = pc - 2; fr = pr; }
  else if (my > 0 && mx === 0) { dir = [0, 1]; crate = crateAt(pc, pr + 1); fc = pc; fr = pr + 2; }
  else if (my < 0 && mx === 0) { dir = [0, -1]; crate = crateAt(pc, pr - 1); fc = pc; fr = pr - 2; }
  if (!dir || !crate) return null;
  // head-on: your edge must be at the crate's near face (same tile row/col is already true).
  // the crate sits at (pc + dir[0], pr + dir[1]); its face toward you is the inner edge:
  // right->(pc+1)*T, left->pc*T, down->(pr+1)*T, up->pr*T.
  const faceX = (pc + dir[0] + (dir[0] > 0 ? 0 : 1)) * TILE;   // the crate's near face, x
  const faceY = (pr + dir[1] + (dir[1] > 0 ? 0 : 1)) * TILE;   // the crate's near face, y
  const atFaceX = dir[0] > 0 ? (p.x + p.r >= faceX - EPS) : dir[0] < 0 ? (p.x - p.r <= faceX + EPS) : true;
  const atFaceY = dir[1] > 0 ? (p.y + p.r >= faceY - EPS) : dir[1] < 0 ? (p.y - p.r <= faceY + EPS) : true;
  if (!atFaceX || !atFaceY) return null;
  if (tileBlocked(fc, fr)) return null;   // the far tile is open (map + no other crate)
  crate.c = fc; crate.r = fr;
  crate.x = (fc + 0.5) * TILE; crate.y = (fr + 0.5) * TILE;
  return crate;
}

function freeMove(unit, dx, dy) {
  const bpx = unit.x, bpy = unit.y;
  tryMove(unit, dx, dy);
  const px2 = unit.x, py2 = unit.y;
  const moveMag = Math.max(Math.abs(dx), Math.abs(dy));
  const roll = Math.max(1, moveMag * 0.5);
  const probe = unit.r + 3;
  const mx = Math.sign(dx), my = Math.sign(dy);
  if (my === 0 && mx !== 0 && px2 === bpx) {
    const sgn = mx > 0 ? 1 : -1;
    if (!hitsWall(px2, py2 - probe, unit.r) &&
        !hitsWall(px2 + sgn * probe, py2 - probe, unit.r)) unit.y -= roll;
    else if (!hitsWall(px2, py2 + probe, unit.r) &&
             !hitsWall(px2 + sgn * probe, py2 + probe, unit.r)) unit.y += roll;
  } else if (mx === 0 && my !== 0 && py2 === bpy) {
    const sgn = my > 0 ? 1 : -1;
    if (!hitsWall(px2 - probe, py2, unit.r) &&
        !hitsWall(px2 - probe, py2 + sgn * probe, unit.r)) unit.x -= roll;
    else if (!hitsWall(px2 + probe, py2, unit.r) &&
             !hitsWall(px2 + probe, py2 + sgn * probe, unit.r)) unit.x += roll;
  }
  return unit;
}
