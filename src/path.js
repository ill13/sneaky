// ============================================================
//  SNEAK RUN - pathfinding.
//
//  The ONE pathfinding algorithm is A*: a 4-connected search over a room's
//  walkable tiles with a Manhattan heuristic. Every guard that goes from tile
//  A to tile B uses it. There is no beeline, no greedy steering, no second
//  pathfinder - if a unit moves toward a goal, it is A* through this file.
//
//  Boundary note (Phase 4): the "always and only A*" rule scopes to UNIT
//  PATHFINDING. mapgen.js has a flood-fill (reachable) that is NOT a pathfinder
//  - it is a generation-time solvability validator (is the exit / key / every
//  room on a walkable route from spawn?) and it routes no unit; test-gen relies
//  on it. tactics_3d, by contrast, uses Dijkstra (turn reachability) + BFS flow
//  fields (AI); those stay in that game and never bleed into SNEAK RUN.
//
//  This file is pure: it computes paths and picks goal tiles. It never moves
//  an entity - "following" a returned path (advancing the guard tile by tile
//  with collision) is movement and stays in update.js.
// ============================================================

// Interior bounds of a room: the walkable 16x10, excluding the wall ring it
// sits in. A path built on these bounds can never route through a doorway.
function roomBounds(rc, rr) {
  const [ox, oy] = roomOrigin(rc, rr);
  return { c0: ox, c1: ox + 15, r0: oy, r1: oy + 9 };
}

// Is (c,r) walkable inside room (rc,rr)? In-bounds AND a floor tile.
function roomWalkable(rc, rr, c, r) {
  const b = roomBounds(rc, rr);
  if (c < b.c0 || c > b.c1 || r < b.r0 || r > b.r1) return false;
  return state.map[r][c] === 0 && !crateAt(c, r);   // F43: a crate is not walkable (guards route around it)
}

// Nearest walkable tile of room (rc,rr) to a world point. This is the pursuit
// goal: your tile while you're in the room, or the door-edge tile if you're in
// the next room (the guard walks to the gap and stops - it can't follow you in).
function nearestFloorTile(rc, rr, wx, wy) {
  const b = roomBounds(rc, rr);
  let best = null, bd = Infinity;
  for (let r = b.r0; r <= b.r1; r++) {
    for (let c = b.c0; c <= b.c1; c++) {
      if (state.map[r][c] !== 0) continue;
      const d = (c * TILE + 16 - wx) * (c * TILE + 16 - wx) + (r * TILE + 16 - wy) * (r * TILE + 16 - wy);
      if (d < bd) { bd = d; best = [c, r]; }
    }
  }
  return best;
}

// A* over a 4-connected grid of walkable tiles. Pure: hand it a walkable
// predicate and it returns the [c,r] tiles from start (excluded) to goal, or []
// when the start is off-grid or the goal is unreachable. The Manhattan heuristic
// is admissible on a 4-connected unit-cost grid, so the first pop of the goal is
// the optimal path.
class AStar {
  findPath(sc, sr, tc, tr, walkable) {
    if (sc === tc && sr === tr) return [];
    if (!walkable(sc, sr)) return [];
    const K = (c, r) => r * COLS + c;
    const h = (c, r) => Math.abs(c - tc) + Math.abs(r - tr);   // Manhattan
    const open = new Set([K(sc, sr)]);
    const came = new Map();
    const gScore = new Map([[K(sc, sr), 0]]);
    const fScore = new Map([[K(sc, sr), h(sc, sr)]]);
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];   // 4-connected
    while (open.size) {
      let cur = -1, cf = Infinity;
      for (const k of open) { const f = fScore.get(k); if (f < cf) { cf = f; cur = k; } }
      const cc = cur % COLS, cr = (cur / COLS) | 0;
      if (cc === tc && cr === tr) {
        const out = [];
        let k = cur;
        while (came.has(k)) { out.push([k % COLS, (k / COLS) | 0]); k = came.get(k); }
        out.reverse();
        return out;
      }
      open.delete(cur);
      for (const [dc, dr] of NB) {
        const nc = cc + dc, nr = cr + dr;
        if (!walkable(nc, nr)) continue;
        const nk = K(nc, nr);
        const tg = gScore.get(cur) + 1;
        if (tg < (gScore.get(nk) === undefined ? Infinity : gScore.get(nk))) {
          came.set(nk, cur);
          gScore.set(nk, tg);
          fScore.set(nk, tg + h(nc, nr));
          open.add(nk);
        }
      }
    }
    return [];
  }
}

const PATH = new AStar();   // the single shared pathfinder instance

// A* across a guard's OWN room: the guard's current tile -> a goal tile. If the
// guard is off-grid (just woke, mid-carry drop) it snaps to the nearest floor
// tile first. A room is open and connected by the mapgen validator, so a path to
// any interior goal exists; [] only guards a malformed goal tile.
function roomPath(g, tc, tr) {
  let sc = Math.floor(g.x / TILE), sr = Math.floor(g.y / TILE);
  if (!roomWalkable(g.room[0], g.room[1], sc, sr)) {
    const s = nearestFloorTile(g.room[0], g.room[1], g.x, g.y);
    if (!s) return [];
    sc = s[0]; sr = s[1];
  }
  const w = (c, r) => roomWalkable(g.room[0], g.room[1], c, r);
  return PATH.findPath(sc, sr, tc, tr, w);
}
