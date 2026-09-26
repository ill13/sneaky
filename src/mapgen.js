// ============================================================
//  SNEAK RUN - map building + layout generation + validation
//  Grid: 3x3 rooms of 16x10 tiles (52x34). Map values: 0 floor,
//  1 wall, 2 locked door (solid until the key opens it).
//  The room graph is AUTHORED (WALL_PLAN in content.js): the path
//  exists by construction, so generation only validates content.
// ============================================================

// Is tile (c, r) solid in map m? Locked doors (2) count as solid.
function solid(c, r, m) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
  return m[r][c] === 1 || m[r][c] === 2;
}

// Which room does a tile belong to? null outside interiors (3x3 grid).
function roomAt(c, r) {
  const dc = c - 1, dr = r - 1;
  if (dc < 0 || dr < 0) return null;
  const rc = Math.floor(dc / 17), rr = Math.floor(dr / 11);
  if (rc > 2 || rr > 2 || dc % 17 > 15 || dr % 11 > 9) return null;
  return [rc, rr];
}

// Room (c,r) interior origin in absolute tiles
const roomOrigin = (c, r) => [1 + c * 17, 1 + r * 11];

// Convert a room-relative line/tile to absolute tiles
const absT = (t, rc, rr) => {
  const [ox, oy] = roomOrigin(rc, rr);
  return [ox + t[0], oy + t[1]];
};

function buildMap(keyRoom) {
  const m = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  // outer border
  for (let c = 0; c < COLS; c++) { m[0][c] = 1; m[ROWS - 1][c] = 1; }
  for (let r = 0; r < ROWS; r++) { m[r][0] = 1; m[r][COLS - 1] = 1; }
  // inner walls: fully solid, then carve ONLY the authored wall plan
  for (const wx of [17, 34]) for (let r = 1; r < ROWS - 1; r++) m[r][wx] = 1;
  for (const wy of [11, 22]) for (let c = 1; c < COLS - 1; c++) m[wy][c] = 1;
  // vertical sections (x = 17, 34), sections = room rows
  for (const wx of [17, 34]) {
    for (let rr = 0; rr < 3; rr++) {
      if (WALL_PLAN.v[wx][rr] !== 'open') continue;
      const oy = 1 + rr * 11;
      for (const [a, b] of DOOR_V) { m[oy + a][wx] = 0; m[oy + b][wx] = 0; }
    }
  }
  // horizontal sections (y = 11, 22), sections = room cols
  for (const wy of [11, 22]) {
    for (let cc = 0; cc < 3; cc++) {
      const kind = WALL_PLAN.h[wy][cc];
      const ox = 1 + cc * 17;
      if (kind === 'open') {
        for (const [a, b] of DOOR_H) { m[wy][ox + a] = 0; m[wy][ox + b] = 0; }
      } else if (kind === 'door') {
        m[wy][ox + 5] = 2;   // room-relative cols 5-6 (1 east of the vault left lane)
        m[wy][ox + 6] = 2;
      }
    }
  }
  // (obstacles are dropped per-room by generateLayout via placeRoomObstacles;
  // buildMap only lays the authored walls + doors)
  return m;
}

// ---------------- Layout validation ----------------
function segClear(m, c0, r0, c1, r1) {
  const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0), 1);
  for (let s = 0; s <= steps; s++) {
    const c = Math.round(c0 + ((c1 - c0) * s) / steps);
    const r = Math.round(r0 + ((r1 - r0) * s) / steps);
    if (solid(c, r, m)) return false;
  }
  return true;
}

function patrolsClear(m, allPaths) {
  for (const path of allPaths) {
    for (let i = 0; i < path.length; i++) {
      const [c0, r0] = path[i];
      const [c1, r1] = path[(i + 1) % path.length];
      if (!segClear(m, c0, r0, c1, r1)) return false;
    }
  }
  return true;
}

// BFS from `from`; treats locked doors as solid unless treatLockedOpen.
function reachable(m, from, targets, treatLockedOpen) {
  const blk = (c, r) => {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
    const v = m[r][c];
    if (v === 1) return true;
    if (v === 2 && !treatLockedOpen) return true;
    return false;
  };
  const seen = new Set([from[0] + ',' + from[1]]);
  const queue = [from];
  while (queue.length) {
    const [c, r] = queue.shift();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      const key = nc + ',' + nr;
      if (!blk(nc, nr) && !seen.has(key)) {
        seen.add(key);
        queue.push([nc, nr]);
      }
    }
  }
  return targets.every(([c, r]) => seen.has(c + ',' + r));
}

// F29: the multi-key solvability proof. A fixed point: a key becomes "open" the
// moment it's reachable from the spawn (with the doors of already-open keys
// passable), which in turn opens ITS door. Repeats until no new key is in reach.
// Solvable iff every key is collected AND the file and exit lie in the final
// reachable set. This is the generalization of the old "key reachable with the
// vault closed, file/exit reachable with it open" check to N colored keys.
function validateKeyChain(m, spawn, keys, file, exit) {
  const open = new Set();
  const doorSet = {};
  for (const k of keys) doorSet[k.id] = new Set(k.doorTiles.map(([c, r]) => c + ',' + r));
  const reach = () => {
    const blk = (c, r) => {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
      const v = m[r][c];
      if (v === 1) return true;
      if (v === 2) { for (const id of open) if (doorSet[id].has(c + ',' + r)) return false; return true; }
      return false;
    };
    const seen = new Set([spawn[0] + ',' + spawn[1]]);
    const q = [spawn];
    while (q.length) {
      const [c, r] = q.shift();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr, key = nc + ',' + nr;
        if (!blk(nc, nr) && !seen.has(key)) { seen.add(key); q.push([nc, nr]); }
      }
    }
    return seen;
  };
  // F33: a key/objective may be floor-based (k.tile / file tile) OR container-
  // based (k.access / file.access = floor tiles you can stand on to search it).
  const anyReach = (tiles, s) => tiles.some(([c, r]) => s.has(c + ',' + r));
  const keyGot = (k, s) => (k.access ? anyReach(k.access, s) : s.has(k.tile[0] + ',' + k.tile[1]));
  let changed = true;
  while (changed) {
    changed = false;
    const s = reach();
    for (const k of keys) if (!open.has(k.id) && keyGot(k, s)) { open.add(k.id); changed = true; }
  }
  const s = reach();
  const fileOk = file.access ? anyReach(file.access, s) : s.has(file[0] + ',' + file[1]);
  return { allKeys: keys.every((k) => open.has(k.id)), collected: [...open], fileOk, exitOk: s.has(exit[0] + ',' + exit[1]) };
}

// ---------------- Layout generation ----------------
const ALL_ROOMS = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]];

function roleOf(rc, rr) {
  if (rc === ROLE.spawn[0] && rr === ROLE.spawn[1]) return 'spawn';
  if (rc === ROLE.file[0] && rr === ROLE.file[1]) return 'file';
  if (rc === ROLE.exit[0] && rr === ROLE.exit[1]) return 'exit';
  return 'filler';
}

function pickN(rng, pool, n) {
  const copy = [...pool];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
}

function placeUpgrades(rng, m, spawn) {
  // one pickup per dead-end room; seed shuffles type <-> room and the tile
  const rooms = DEAD_ENDS.slice();
  const types = UPG_TYPES.slice();
  const upg = {};
  for (let i = 0; i < UPG_TYPES.length; i++) {   // fixed count: rooms/types shrink per splice
    const room = rooms.splice(Math.floor(rng() * rooms.length), 1)[0];
    const type = types.splice(Math.floor(rng() * types.length), 1)[0];
    upg[type] = absT(pick(rng, UPG_POOL), room[0], room[1]);
  }
  // all three must sit on floor and be reachable with the door CLOSED
  // (dead ends connect through open walls, never through the vault)
  const ok = Object.values(upg).every(([c, r]) => !solid(c, r, m)) &&
    reachable(m, spawn, Object.values(upg), true);   // F29: all doors open (keys gettable), so the I dead end (green door) counts
  return ok ? upg : null;
}

// All floor tiles a pattern's idle path walks over (room-relative "c,r" keys).
// Obstacles must not sit on these, so patrolsClear holds by construction.
function patternLanes(pts) {
  const set = new Set();
  for (let i = 0; i < pts.length; i++) {
    const [c0, r0] = pts[i];
    const [c1, r1] = pts[(i + 1) % pts.length];
    const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0), 1);
    for (let s = 0; s <= steps; s++) {
      const c = Math.round(c0 + ((c1 - c0) * s) / steps);
      const r = Math.round(r0 + ((r1 - r0) * s) / steps);
      set.add(c + ',' + r);
    }
  }
  return set;
}
// Absolute tiles this room keeps free of obstacles AND containers: the spawn
// clear ring, the exit spot, the hide-spot corners, and every locked door's
// approach. F33: keys / file / upgrades now live INSIDE solid containers, so
// they no longer reserve floor tiles - a container placed anywhere legal is fine.
function reservedObjectTiles(rc, rr) {
  const is = (a, b) => a === rc && b === rr;
  const res = [];
  // the spawn keeps a 3x3 clear ring: the touch d-pad check moves the player out
  // in all four directions right after reset, so an obstacle hugging the spawn
  // would wall off an arm of the cross.
  if (is(ROLE.spawn[0], ROLE.spawn[1]))
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++)
      res.push(absT([SPAWN_T[0] + dc, SPAWN_T[1] + dr], rc, rr));
  if (is(ROLE.exit[0], ROLE.exit[1])) for (const t of EXIT_POOL) res.push(absT(t, rc, rr));
  for (const t of HIDE_POOL) res.push(absT(t, rc, rr));   // bin/closet corners (F23): always clear floor
  for (const k of KEYS) for (const t of doorSecApproach(k.doorSec)) res.push(t);   // every door's approach tiles (absolute)
  // F44: the laser nook (walls + interior + approach) is reserved in D
  if (rc === NOOK.room[0] && rr === NOOK.room[1]) for (const t of nookTiles()) res.push(t);
  return res;
}
// Drop 3-5 obstacles into one room: random shape, random floor anchor (1-tile
// margin off the interior border), never on a pattern lane or a reserved object
// tile. A shape that won't fit at a random spot is skipped, so a room may land
// with 3-5 - the validator then proves the room is still beatable.
function placeRoomObstacles(rng, m, rc, rr, laneSet, reserved) {
  const [ox, oy] = roomOrigin(rc, rr);
  const resSet = new Set(reserved.map(([c, r]) => c + ',' + r));
  const n = 3 + Math.floor(rng() * 3);   // 3-5
  let placed = 0;
  for (let i = 0; i < n; i++) {
    const shape = OB_SHAPES[Math.floor(rng() * OB_SHAPES.length)];
    for (let tries = 0; tries < 60; tries++) {
      const ac = ox + 1 + Math.floor(rng() * 13);   // dc 1..13
      const ar = oy + 1 + Math.floor(rng() * 7);    // dr 1..7
      let ok = true;
      const tiles = shape.map(([dc, dr]) => [ac + dc, ar + dr]);
      for (const [c, r] of tiles) {
        if (roomAt(c, r) === null) { ok = false; break; }
        if (m[r][c] !== 0) { ok = false; break; }
        if (laneSet.has((c - ox) + ',' + (r - oy))) { ok = false; break; }
        if (resSet.has(c + ',' + r)) { ok = false; break; }
      }
      if (ok) { for (const [c, r] of tiles) m[r][c] = 1; placed++; break; }
    }
  }
  return placed;
}

// F33: a container is searchable only if the player can stand on a floor tile
// next to it and face it. Guarantee at least one 4-neighbor floor tile.
function hasFloorNeighbor(c, r, m) {
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nc = c + dc, nr = r + dr;
    if (nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && m[nr][nc] === 0) return true;
  }
  return false;
}
// The floor tiles a player can stand on to search the container (for the proof).
function containerAccess(cont, m) {
  const acc = [];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nc = cont.c + dc, nr = cont.r + dr;
    if (nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && m[nr][nc] === 0) acc.push([nc, nr]);
  }
  return acc;
}
// Place up to n single-tile containers (solid furniture) in one room: off the
// patrol lanes, off the reserved tiles, on floor with a floor neighbor. Each is
// stamped into m as solid and appended to `out`.
function placeRoomContainers(rng, m, rc, rr, n, laneSet, reserved, out) {
  const [ox, oy] = roomOrigin(rc, rr);
  const resSet = new Set(reserved.map(([c, r]) => c + ',' + r));
  let placed = 0;
  for (let i = 0; i < n && placed < n; i++) {
    for (let tries = 0; tries < 200 && placed < n; tries++) {
      const c = ox + 1 + Math.floor(rng() * 13);   // dc 1..13 (margin off the border)
      const r = oy + 1 + Math.floor(rng() * 7);    // dr 1..7
      if (roomAt(c, r) === null) continue;
      if (m[r][c] !== 0) continue;                 // not floor (skips walls + placed containers)
      if (laneSet.has((c - ox) + ',' + (r - oy))) continue;
      if (resSet.has(c + ',' + r)) continue;
      if (!hasFloorNeighbor(c, r, m)) continue;    // must be standable/searchable
      m[r][c] = 1;                                  // solid furniture
      out.push({ c, r, rc, rr, id: 'ct' + out.length, arc: null, contents: [], opened: false });
      placed++;
    }
  }
  return placed;
}
// Assign the quest items to distinct containers in their rooms, then fill the
// rest with flavor notes. Returns { containers, for_ } (for_ maps each quest id
// -> its container) or null if a required room had no free container.
function assignContainerContents(rng, containers) {
  const byRoom = {};
  for (const ct of containers) (byRoom[ct.rc + ',' + ct.rr] = byRoom[ct.rc + ',' + ct.rr] || []).push(ct);
  const used = new Set();
  const for_ = {};
  const take = (rc, rr) => {
    const avail = (byRoom[rc + ',' + rr] || []).filter((ct) => !used.has(ct.id));
    if (!avail.length) return null;
    const ct = avail[Math.floor(rng() * avail.length)];
    used.add(ct.id);
    return ct;
  };
  const takeAny = () => {   // F46: a free container in any room (for the health items)
    const avail = containers.filter((ct) => !used.has(ct.id));
    if (!avail.length) return null;
    const ct = avail[Math.floor(rng() * avail.length)];
    used.add(ct.id);
    return ct;
  };
  for (const k of KEYS) {
    let ct;
    if (k.id === 'gold' && NOOK) {
      // F44: the gold key lives in the laser nook's bowl (forced, not random)
      const [nox, noy] = roomOrigin(NOOK.room[0], NOOK.room[1]);
      ct = containers.find((x) => x.c === nox + NOOK.bowl[0] && x.r === noy + NOOK.bowl[1]);
      if (ct) used.add(ct.id);
    } else {
      ct = take(k.room[0], k.room[1]);
    }
    if (!ct) return null;
    ct.arc = k.id === 'gold' ? 'mid' : (rng() < 0.5 ? 'fast' : 'mid');
    ct.contents = [{ role: 'key', id: k.id }];
    for_[k.id] = ct;
  }
  const oc = take(ROLE.file[0], ROLE.file[1]);
  if (!oc) return null;
  oc.arc = 'safe';
  oc.contents = [{ role: 'objective' }];
  for_.objective = oc;
  for (const t of UPG_TYPES) {
    const [rc, rr] = UPG_ROOMS[t];
    const ct = take(rc, rr);
    if (!ct) return null;
    ct.arc = rng() < 0.5 ? 'fast' : 'mid';
    ct.contents = [{ role: 'upgrade', id: t }];
    for_[t] = ct;
  }
  // F34: the three clue notes - one per colored key, dealt one-per-room into the
  // top row (A/B/C) and shuffled per seed. Each note names the room that holds
  // its key, so exploring the top row teaches you where the keys are (the key's
  // room lights up on the minimap). A clue is never in its key's own room, so
  // finding the note is a distinct step from finding the key. Clues are 'fast'
  // (quick to find - the bootstrap shouldn't add friction).
  const clueRooms = shuffle(rng, CLUE_ROOMS);
  const clueKeys = shuffle(rng, KEYS.map((k) => k.id));
  for (let i = 0; i < CLUE_ROOMS.length; i++) {
    const [rc, rr] = clueRooms[i];
    const ct = take(rc, rr);
    if (!ct) return null;
    ct.arc = 'fast';
    ct.contents = [{ role: 'clue', id: clueKeys[i] + 'Clue', keyId: clueKeys[i] }];
    for_['clue_' + clueKeys[i]] = ct;
  }
  // F46: the health items - 1 or 2 per run, in a fast/mid container (never a quest
  // item's). Topping up the hit pool is a "one more chance," a risk/reward find.
  const healthCount = 1 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < healthCount; i++) {
    const ct = takeAny();
    if (!ct) break;
    ct.arc = rng() < 0.5 ? 'fast' : 'mid';
    ct.contents = [{ role: 'health', id: 'health' + i }];
    for_['health' + i] = ct;
  }
  for (const ct of containers) if (!used.has(ct.id)) {
    const r = rng();
    ct.arc = r < 0.4 ? 'fast' : (r < 0.75 ? 'mid' : 'loud');
    ct.contents = [{ role: 'note', id: Math.floor(rng() * NOTE_TEXTS.length) }];
  }
  return { containers, for_ };
}

// F39: pick two free floor tiles in the showcase room for the camera (left half)
// and its switch (right half), both near mid-height. Deterministic per seed (no
// rng): the leftmost/rightmost free tile nearest the mid row. The camera and
// switch are non-solid floor machines, so they never block a patrol lane.
function placeCameraSwitch(m, room) {
  const [ox, oy] = roomOrigin(room[0], room[1]);
  const mid = oy + 4;
  const isFloor = (c, r, left) => m[r][c] === 0 && (left ? (c - ox) <= 7 : (c - ox) > 7);
  const pick = (left) => {
    let best = null, bd = Infinity;
    for (let r = oy + 1; r <= oy + 8; r++) for (let c = ox + 1; c <= ox + 14; c++) {
      if (!isFloor(c, r, left)) continue;
      const d = Math.abs(r - mid) * 10 + (left ? (c - ox) : (ox + 14 - c));
      if (d < bd) { bd = d; best = [c, r]; }
    }
    return best;
  };
  const cam = pick(true), sw = pick(false);
  return (cam && sw) ? { cam, sw } : null;
}

// F42: the robot's patrol lane (a fixed PATTERNS sweep in the room) + a free floor
// tile for its switch (right edge, near mid-height, off the lane). Deterministic.
function placeRobot(m, room) {
  const pat = PATTERNS[ROBOT_PATTERN];
  const path = pat.pts.map((t) => absT(t, room[0], room[1]));
  const [ox, oy] = roomOrigin(room[0], room[1]);
  const mid = oy + 4;
  let sw = null, bd = Infinity;
  for (let r = oy + 1; r <= oy + 8; r++) for (let c = ox + 1; c <= ox + 14; c++) {
    if (m[r][c] !== 0) continue;
    const d = Math.abs(r - mid) * 10 + (ox + 14 - c);
    if (d < bd) { bd = d; sw = [c, r]; }
  }
  return { path, sw };
}
// F43: a pushable crate's home tile. A floor tile near the room's horizontal
// centre, kept clear of the tiles in `avoid` (the machine, its switch, the robot
// lane, and the room's containers - so it never lands on quest furniture).
function placeCrate(m, room, avoid) {
  const [ox, oy] = roomOrigin(room[0], room[1]);
  const mid = oy + 4;
  const bad = new Set((avoid || []).map(([c, r]) => c + ',' + r));
  let best = null, bd = Infinity;
  for (let r = oy + 1; r <= oy + 8; r++) for (let c = ox + 1; c <= ox + 14; c++) {
    if (m[r][c] !== 0 || bad.has(c + ',' + r)) continue;
    const d = Math.abs(r - mid) * 10 + Math.abs(c - (ox + 7));
    if (d < bd) { bd = d; best = [c, r]; }
  }
  return best;
}
// F43: the container tiles in one room (so a crate keeps clear of the furniture).
function containerTiles(containers, room) {
  return containers.filter((ct) => ct.rc === room[0] && ct.rr === room[1]).map((ct) => [ct.c, ct.r]);
}
// F43: one crate in each switch room (the camera room E, the robot room H),
// off the machine, its switch, the robot lane, and the room's containers.
function crateRow(m, camSw, robotPos, containers) {
  if (!TOOLS.crate) return [];
  const out = [];
  if (camSw) {
    const p = placeCrate(m, CAM_ROOM, [camSw.cam, camSw.sw, ...containerTiles(containers, CAM_ROOM)]);
    if (p) out.push(p);
  }
  if (robotPos) {
    const p = placeCrate(m, ROBOT_ROOM, [robotPos.sw, ...robotPos.path, ...containerTiles(containers, ROBOT_ROOM)]);
    if (p) out.push(p);
  }
  return out;
}

// F44: carve the laser nook in room D - a box missing its right side (the mouth).
// Only the top, bottom, and left walls are laid; the right side stays open, so the
// mouth (right-middle) is the single entrance. Deterministic.
function carveNook(m) {
  const [ox, oy] = roomOrigin(NOOK.room[0], NOOK.room[1]);
  const { c0, c1, r0, r1 } = NOOK;
  for (let c = c0; c <= c1; c++) { m[oy + r0][ox + c] = 1; m[oy + r1][ox + c] = 1; }   // top + bottom
  for (let r = r0; r <= r1; r++) m[oy + r][ox + c0] = 1;                              // left
  m[oy + NOOK.mouth[1]][ox + NOOK.mouth[0]] = 0;   // the mouth stays open
}
// F44: every nook tile (the box - walls + interior - plus the approach tile), so
// obstacles and random containers keep clear of it.
function nookTiles() {
  const [ox, oy] = roomOrigin(NOOK.room[0], NOOK.room[1]);
  const { c0, c1, r0, r1, approach } = NOOK;
  const t = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) t.push([ox + c, oy + r]);
  t.push([ox + approach[0], oy + approach[1]]);
  return t;
}
// F44: the laser emitter's absolute tile - it sits on the nook's mouth, so the
// beam (facing out) spans the only entrance. The laser always lives in D (the
// nook's room), so this replaces the old free-tile laser placement.
function nookEmitter() {
  const [ox, oy] = roomOrigin(NOOK.room[0], NOOK.room[1]);
  return [ox + NOOK.emitter[0], oy + NOOK.emitter[1]];
}
// F44: does a patrol pattern stay clear of the nook box? D's lane is restricted to
// patterns that pass, so a guard never patrols through the nook walls.
function patClearsNook(pat) {
  const [ox, oy] = roomOrigin(NOOK.room[0], NOOK.room[1]);
  const { c0, c1, r0, r1 } = NOOK;
  const box = new Set();
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) box.add(c + ',' + r);
  for (const k of patternLanes(pat.pts)) if (box.has(k)) return false;
  return true;
}

function generateLayout(seed) {
  for (let attempt = 0; attempt < 96; attempt++) {
    const rng = mulberry32(seed + attempt);
    const m = buildMap();   // walls + locked doors only; obstacles are procedural
    carveNook(m);           // F44: the laser nook in D (the gold key's vault)

    // one distinct pattern per guard slot, then furniture off the lanes.
    const paths = [];
    const laneSets = {};
    for (const [rc, rr] of ALL_ROOMS) {
      const role = roleOf(rc, rr);
      const laneSet = new Set();
      // F44: D's lane is restricted to patterns that clear the nook box
      const pool = (rc === NOOK.room[0] && rr === NOOK.room[1]) ? PATTERNS.filter(patClearsNook) : PATTERNS;
      for (const pat of pickN(rng, pool, GUARDS_PER_ROLE[role])) {
        for (const k of patternLanes(pat.pts)) laneSet.add(k);
        paths.push(pat.pts.map((t) => absT(t, rc, rr)));
      }
      laneSets[rc + ',' + rr] = laneSet;
    }

    // F33: place the search containers (solid) first, then assign contents.
    const containers = [];
    let minCont = 99;
    for (const [rc, rr] of ALL_ROOMS) {
      const placed = placeRoomContainers(rng, m, rc, rr, containersPerRoom(rc, rr), laneSets[rc + ',' + rr], reservedObjectTiles(rc, rr), containers);
      minCont = Math.min(minCont, placed);
    }
    if (minCont < containersPerRoom(0, 0)) continue;   // every room must hit its minimum

    // F44: the gold key's container is the nook's bowl (forced, deterministic).
    // The bowl is reserved from the random placement above, so this always adds it.
    const [nox, noy] = roomOrigin(NOOK.room[0], NOOK.room[1]);
    const nb = [nox + NOOK.bowl[0], noy + NOOK.bowl[1]];
    if (!containers.some((ct) => ct.c === nb[0] && ct.r === nb[1])) {
      m[nb[1]][nb[0]] = 1;
      containers.push({ c: nb[0], r: nb[1], rc: NOOK.room[0], rr: NOOK.room[1], id: 'ct' + containers.length, arc: null, contents: [], opened: false });
    }

    const assigned = assignContainerContents(rng, containers);
    if (!assigned) continue;   // a required room ran out of free containers

    // obstacles fill the rest; solid containers already block, so these just add
    // cover. A room landing under 1 obstacle is fine (containers are the furniture).
    // F33: keep a floor clearance ring around EVERY container (quest + filler) so an
    // obstacle can't wall one in and make it unsearchable.
    for (const [rc, rr] of ALL_ROOMS) {
      const res = reservedObjectTiles(rc, rr);
      for (const ct of containers) if (ct.rc === rc && ct.rr === rr)
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) res.push([ct.c + dc, ct.r + dr]);
      placeRoomObstacles(rng, m, rc, rr, laneSets[rc + ',' + rr], res);
    }

    const spawn = absT(SPAWN_T, ROLE.spawn[0], ROLE.spawn[1]);
    const exit = absT(pick(rng, EXIT_POOL), ROLE.exit[0], ROLE.exit[1]);
    const hideSpots = ALL_ROOMS.map(([rc, rr]) => absT(pick(rng, HIDE_POOL), rc, rr));

    // F33 proof: a quest item is grabbable iff a floor tile ADJACENT to its
    // container is reachable (with the doors of already-open keys passable).
    const keyRows = KEYS.map((k) => ({
      id: k.id, color: k.color, name: k.name,
      doorTiles: doorSecTiles(k.doorSec), approach: doorSecApproach(k.doorSec),
      access: containerAccess(assigned.for_[k.id], m),
    }));
    const fileAccess = containerAccess(assigned.for_.objective, m);
    const kc = validateKeyChain(m, spawn, keyRows, { access: fileAccess }, exit);

    if (
      patrolsClear(m, paths) &&
      !solid(spawn[0], spawn[1], m) && !solid(exit[0], exit[1], m) &&
      hideSpots.every(([c, r]) => !solid(c, r, m)) &&
      kc.allKeys && kc.fileOk && kc.exitOk
    ) {
      const camSw = placeCameraSwitch(m, CAM_ROOM);   // F39: the camera + its switch
      const laserPos = nookEmitter();                 // F44: the laser on the nook's mouth
      const robotPos = placeRobot(m, ROBOT_ROOM);     // F42: the robot lane + its switch
      const cratePos = crateRow(m, camSw, robotPos, assigned.containers);   // F43: one crate per switch room
      return {
        map: m, paths, spawn, exit, hideSpots, seed, usedSeed: seed + attempt,
        containers: assigned.containers,   // the final containers (solid, with contents)
        questContainer: assigned.for_,      // { blue, gold, red, objective, stim, hush, heavy } -> container
        camSw,                              // F39: { cam: [c,r], sw: [c,r] } | null
        laserPos,                           // F40: [c,r] of the laser emitter | null
        robotPos,                           // F42: { path, sw: [c,r] } | null
        cratePos,                           // F43: [[c, r], ...] one crate per switch room
      };
    }
  }
  return generateFallback(seed);
}

// Fallback: pillar-free safety net, but it still carries containers so the new
// reset/search paths never see a missing field. Rarely hit (96 attempts first).
function generateFallback(seed) {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const m = buildMap();
  const paths = [];
  const laneSets = {};
  for (const [rc, rr] of ALL_ROOMS) {
    const role = roleOf(rc, rr);
    const laneSet = new Set();
    const pool = (rc === NOOK.room[0] && rr === NOOK.room[1]) ? PATTERNS.filter(patClearsNook) : PATTERNS;
    for (const pat of pickN(rng, pool, GUARDS_PER_ROLE[role])) {
      for (const k of patternLanes(pat.pts)) laneSet.add(k);
      paths.push(pat.pts.map((t) => absT(t, rc, rr)));
    }
    laneSets[rc + ',' + rr] = laneSet;
  }
  const containers = [];
  for (const [rc, rr] of ALL_ROOMS)
    placeRoomContainers(rng, m, rc, rr, containersPerRoom(rc, rr), laneSets[rc + ',' + rr], reservedObjectTiles(rc, rr), containers);
  // F44: the nook's bowl (the gold key's container) - same as the main loop
  const [fnx, fny] = roomOrigin(NOOK.room[0], NOOK.room[1]);
  const fb = [fnx + NOOK.bowl[0], fny + NOOK.bowl[1]];
  if (!containers.some((ct) => ct.c === fb[0] && ct.r === fb[1])) {
    m[fb[1]][fb[0]] = 1;
    containers.push({ c: fb[0], r: fb[1], rc: NOOK.room[0], rr: NOOK.room[1], id: 'ct' + containers.length, arc: null, contents: [], opened: false });
  }
  const assigned = assignContainerContents(rng, containers) || { containers, for_: {} };
  const spawn = absT(SPAWN_T, ROLE.spawn[0], ROLE.spawn[1]);
  const exit = absT(EXIT_POOL[0], ROLE.exit[0], ROLE.exit[1]);
  const hideSpots = ALL_ROOMS.map(([rc, rr]) => absT(HIDE_POOL[0], rc, rr));
  const camSw = placeCameraSwitch(m, CAM_ROOM);
  const robotPos = placeRobot(m, ROBOT_ROOM);
  return { map: m, paths, spawn, exit, hideSpots, seed, usedSeed: -1, containers: assigned.containers, questContainer: assigned.for_, camSw, laserPos: nookEmitter(), robotPos, cratePos: crateRow(m, camSw, robotPos, assigned.containers) };
}

// ---------------- Wall edge table (for exact cone clipping) ----------------
// Collects every interior-facing edge of every solid tile ONCE per map.
// Locked doors (2) are solid geometry too.
function buildWallEdges(m) {
  const E = [];
  const seen = new Set();
  const add = (x1, y1, x2, y2) => {
    const k1 = Math.round(x1) + ',' + Math.round(y1) + '|' + Math.round(x2) + ',' + Math.round(y2);
    const k2 = Math.round(x2) + ',' + Math.round(y2) + '|' + Math.round(x1) + ',' + Math.round(y1);
    if (seen.has(k1) || seen.has(k2)) return;
    seen.add(k1);
    E.push({ x1, y1, x2, y2 });
  };
  const sol = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && (m[r][c] === 1 || m[r][c] === 2);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!sol(c, r)) continue;
      const x1 = c * TILE, x2 = x1 + TILE, y1 = r * TILE, y2 = y1 + TILE;
      if (!sol(c, r - 1)) add(x1, y1, x2, y1); // top edge faces open
      if (!sol(c, r + 1)) add(x1, y2, x2, y2); // bottom
      if (!sol(c - 1, r)) add(x1, y1, x1, y2); // left
      if (!sol(c + 1, r)) add(x2, y1, x2, y2); // right
    }
  }
  return E;
}
