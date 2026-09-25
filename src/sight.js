// ============================================================
//  SNEAK RUN - vision: the single owner of "who sees whom" and the fog model.
//
//  Two responsibilities, both pure (they read state; they never draw):
//    1. Guard sight - canSee (a confirmed lock), preSpot (the tentative "?"
//       band), guardSharesRoom (room-confined sight, F21), hasLOS, and the
//       exact wall-clipped cone (conePoly - tested, kept available for a
//       precise cone; the minimap currently uses a simplified room-clipped arc
//       and the main viewport deliberately draws none).
//    2. Fog of war - the player's memory of what they have seen.
//
//  The fog model maps 1:1 onto tactics_3d's per-faction vision state. SNEAK RUN
//  has one faction (the player) and is ROOM-granular by design (each room is its
//  own level, and the exact in-room cone is never shown - the unknowable threat
//  is the point). The three concepts:
//    vision     = the room you are in right now (derived, never stored)
//    remembered = state.explored[9], one bit per room, set on entry
//    revealed   = an objective/gadget draws once its room is remembered
// ============================================================

// Grid ray march (Amanatides-Woo DDA): true if a straight line from (x0,y0)->
// (x1,y1) is unobstructed. Walks the ray CELL-BY-CELL instead of sampling every
// 8px - the old sampler threaded the diagonal seam where two kitty-cornered solid
// tiles touch at a corner (no sample ever landed in a block, so a guard saw right
// through it). A DDA can't: to cross from one side of two diagonal blocks to the
// other it must step through a solid cell, which stops the ray. Also used by the
// guard's shot decision, so sight and shots stay consistent.
function hasLOS(x0, y0, x1, y1) {
  let cx = Math.floor(x0 / TILE), cy = Math.floor(y0 / TILE);
  const dx = x1 - x0, dy = y1 - y0;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return true;
  const ux = dx / d, uy = dy / d;          // unit direction; every t below is arc-length (px)
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  let tMaxX = dx !== 0 ? ((stepX > 0 ? (cx + 1) : cx) * TILE - x0) / ux : Infinity;
  let tMaxY = dy !== 0 ? ((stepY > 0 ? (cy + 1) : cy) * TILE - y0) / uy : Infinity;
  const tDeltaX = dx !== 0 ? TILE / Math.abs(ux) : Infinity;
  const tDeltaY = dy !== 0 ? TILE / Math.abs(uy) : Infinity;
  let guard = 0;
  while (guard++ < 512) {
    if (solid(cx, cy, state.map)) return false;
    const next = Math.min(tMaxX, tMaxY);
    if (next >= d) return true;           // the target lies before the next boundary
    // Threading a grid corner: block if either side cell is solid (no corner cutting).
    if (Math.abs(tMaxX - tMaxY) < 1.0) {
      if (solid(cx + stepX, cy, state.map) || solid(cx, cy + stepY, state.map)) return false;
    }
    if (tMaxX < tMaxY) { cx += stepX; tMaxX += tDeltaX; }
    else { cy += stepY; tMaxY += tDeltaY; }
  }
  return true;
}

const angleDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
};

// True if the player is inside the guard's own room - the only place the guard
// can see it. Guards can't cross doors, so sight (and the pre-spot "?" warning
// that foreshadows it) is confined to the guard's room. A doorway is a 2-tile
// floor gap a plain LOS ray would clear, so without this gate a guard could
// "see through" into the next room. Returns true if the guard has no room.
function guardSharesRoom(g) {
  if (!g.room) return true;
  const pr = roomAt(Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE));
  return !!pr && pr[0] === g.room[0] && pr[1] === g.room[1];
}

// Can guard g see the player? Same room + distance + cone + line of sight.
// A knocked-out (down), dazed, or hidden (in a bin) guard is unconscious or out
// of play - its stale facing must never re-heat the alarm.
function canSee(g, fov, range) {
  if (g.state === 'down' || g.state === 'dazed' || g.state === 'hidden') return false;
  const dx = state.player.x - g.x, dy = state.player.y - g.y;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;
  if (!guardSharesRoom(g)) return false;
  if (angleDiff(Math.atan2(dy, dx), g.facing) > fov / 2) return false;
  return hasLOS(g.x, g.y, state.player.x, state.player.y);
}

// Pre-spot: a patrol guard whose facing has swung toward you within PRESPOT_ARC
// (a band around, not inside, the exact cone) with line of sight. This is the
// tentative "?" warning - "something is looking" without a confirmed lock. The
// perception test lives here; render.js only draws the "?" when this is true.
// Patrol guards only (a guard that confirmed you is already chasing). Same room,
// range, and LOS gates as canSee, but the wider facing band.
function preSpot(g, range) {
  if (g.state !== 'patrol') return false;
  if (!guardSharesRoom(g)) return false;
  const dx = state.player.x - g.x, dy = state.player.y - g.y;
  if (Math.hypot(dx, dy) > range) return false;
  if (angleDiff(Math.atan2(dy, dx), g.facing) >= PRESPOT_ARC) return false;
  return hasLOS(g.x, g.y, state.player.x, state.player.y);
}

// ---------------- Exact visibility polygon (cone clipping) ----------------
// Ray/segment intersection: smallest t>0 where the ray hits segment e, else Infinity.
function raySeg(ox, oy, dx, dy, e) {
  const sx = e.x2 - e.x1, sy = e.y2 - e.y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) return Infinity;
  const ex = e.x1 - ox, ey = e.y1 - oy;
  const t = (ex * sy - ey * sx) / denom;   // distance along the ray
  const u = (ex * dy - ey * dx) / denom;   // position along the segment
  if (t > 0 && u >= 0 && u <= 1) return t;
  return Infinity;
}

// World-space visibility polygon for a guard: guard center + one vertex per
// ~1-degree step across the FOV, each ray clipped at the nearest wall edge.
function conePoly(gx, gy, facing, fov, range, edges) {
  const poly = [[gx, gy]];
  const step = Math.PI / 180; // 1 degree
  for (let a = -fov / 2; a <= fov / 2 + 1e-6; a += step) {
    const ang = facing + a;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let t = range;
    for (const e of edges) {
      const tt = raySeg(gx, gy, dx, dy, e);
      if (tt > 0 && tt < t) t = tt;
    }
    poly.push([gx + dx * t, gy + dy * t]);
  }
  return poly;
}

// ============================================================
//  Fog of war - the player's memory. See the header for the 1:1 mapping onto
//  tactics_3d's vision / remembered / revealed. Room-granular: one bit per room.
//  This is the single owner of the room -> explored-index mapping; render.js
//  draws the fog, update.js calls rememberRoom on entry - neither re-derives the
//  index here.
// ============================================================

// Mark a room as remembered (the player's `remembered` set). Called when the
// player is standing in a room.
function rememberRoom(rc, rr) {
  state.explored[rc * 3 + rr] = true;
}

// Is the room (rc,rr) remembered? The minimap fog reads this; the objective and
// hide-spot reveal gates build on it via isRevealed.
function roomRemembered(rc, rr) {
  return !!state.explored[rc * 3 + rr];
}

// Is the objective/gadget at world point (wx,wy) revealed? Nothing draws in a
// room the player has not walked. (The `revealed` concept.)
function isRevealed(wx, wy) {
  const rm = roomAt(Math.floor(wx / TILE), Math.floor(wy / TILE));
  return !!rm && state.explored[rm[0] * 3 + rm[1]];
}
