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

// Collision footprint: the 8 corners + edge midpoints of a 2r x 2r box.
function hitsWall(x, y, r) {
  const pts = [[-r, 0], [r, 0], [0, -r], [0, r], [-r, -r], [r, -r], [-r, r], [r, r]];
  return pts.some(([ox, oy]) => solid(Math.floor((x + ox) / TILE), Math.floor((y + oy) / TILE), state.map));
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
