// ============================================================
//  SNEAK RUN - curated content pools (3x3, path-first)
//  The seed shuffles CONTENT from these pools (Spelunky-style):
//  the room graph itself is AUTHORED - the solution path is fixed,
//  so every seed is guaranteed beatable, and the seed only picks
//  pillars, patrols, object tiles, and upgrade placement inside it.
//
//  Grid: 3 cols x 3 rows of 16x10-tile rooms. 52 x 34 tiles total.
//  Room (c,r) interior: x = 1 + c*17 .. 1 + c*17 + 15, y = 1 + r*11 .. 1 + r*11 + 9.
//
//  A(0,0)  B(1,0)  C(2,0)
//  D(0,1)  E(1,1)  F(2,1)
//  G(0,2)  H(1,2)  I(2,2)
//
//  AUTHORED SOLUTION (three colored keys, F29):
//    SPAWN A (blue key) -> D (gold key) -> E (red key) -> open E-H (red)
//    -> H(vault/FILE) -> back E -> D -> open D-G (blue) -> G(EXIT)
//  The gold key opens F-I, a side trip to the I dead end (an upgrade).
//
//  DEAD ENDS: C, F, I (the whole right column hangs off the path).
//  One UPGRADE pickup in each; the seed shuffles which upgrade sits where.
//  Exploring them costs time and risk, and pays out run power.
//
//  The bottom row (G/H/I) is sealed from the rest of the map by three locked
//  doors on wall y=22 - blue (D-G, exit), red (E-H, vault/file), and green
//  (F-I). Each needs its colored key from the open upper region.
// ============================================================

const ROLE = {
  spawn: [0, 0],
  file: [1, 2],
  exit: [0, 2],
};
// F29: three colored keys, each opening one locked door on the bottom row
// (wall y=22). The bottom row is the key-gated objective row: G (exit) needs
// the blue key, H (vault / file) the red key, and I (a dead end) the green
// key. The keys sit in the open upper / middle region; mapgen's iterative
// reachability (validateKeyChain) proves every key is grabbable and every
// door openable, so the run is solvable by construction.
const KEYS = [
  { id: 'blue',  color: '#5ad1e6', name: 'BLUE',  room: [2, 1], doorSec: 0, pool: [[14, 1], [1, 8], [7, 9]] },     // opens D-G (exit G); in the F dead end, not the spawn room
  { id: 'gold',  color: '#ffd23f', name: 'GOLD',  room: [0, 1], doorSec: 2, pool: [[1, 8], [14, 8], [7, 9]] },     // opens F-I (dead end I)
  { id: 'red',   color: '#ff5a5a', name: 'RED',   room: [1, 1], doorSec: 1, pool: [[1, 8], [14, 8], [7, 9]] },     // opens E-H (vault H / file)
];
// F44: the laser nook in room D - a box missing one side (the mouth), with the
// gold key's container in the bowl and the laser emitter sitting on the mouth,
// beam pointing out. You time the beam's off-window to slip in, grab the key,
// and get out before it re-arms. Room-relative tiles in D (16 wide x 10 tall).
const NOOK = {
  room: [0, 1],               // D - the gold key's room
  c0: 1, c1: 4, r0: 7, r1: 9, // the box (4 wide x 3 tall), missing its right side
  mouth: [4, 8],              // the open tile (right-middle) - the only entrance
  bowl: [2, 8],               // the container tile (the gold key)
  emitter: [4, 8],            // the laser emitter, on the mouth, beam pointing out
  facing: 0,                  // east - the beam reaches out through the mouth
  approach: [5, 8],           // the floor tile outside the mouth (where you stand)
};
// Locked door tiles for bottom-row section cc on wall y=22 (a 2-tile block at
// room-relative cols 5,6 - the offset the vault door used) plus the tiles to
// stand on (upper room side) to touch the door.
const doorSecTiles = (cc) => { const ox = 1 + cc * 17; return [[ox + 5, 22], [ox + 6, 22]]; };
const doorSecApproach = (cc) => { const ox = 1 + cc * 17; return [[ox + 5, 21], [ox + 6, 21]]; };

// F34: the clue notes. Each colored key's location is learned from a NOTE found
// in a container, not from the briefing. The three clues sit in the top row
// (A spawn, B, C) - the natural first thing you explore - so the bootstrap is
// fast: search the top row, read the notes, the key rooms light up on the
// minimap. Each clue is placed in a room that is NOT its key's room, so finding
// a note is a real step toward the key, not the same search. CLUE_ROOMS is the
// pool the generator deals the three clues into (one per room, shuffled per seed).
const CLUE_ROOMS = [[0, 0], [1, 0], [2, 0]];   // A, B, C (the top row)

// The authored wall graph. Every wall section is exactly one of:
//   'open'   - two 2-tile gaps (DOOR_V / DOOR_H, room-relative)
//   'door'   - the locked vault door (2 tiles, map value 2)
//   'sealed' - solid. No other openings exist anywhere.
// Vertical walls: x=17 (col 0|1), x=34 (col 1|2); sections = room rows 0..2.
// Horizontal walls: y=11 (row 0|1), y=22 (row 1|2); sections = room cols 0..2.
const WALL_PLAN = {
  v: {
    17: { 0: 'open', 1: 'open', 2: 'sealed' },    // A-B | D-E (path) | G-H sealed (vault)
    34: { 0: 'open', 1: 'open', 2: 'sealed' },    // B-C | E-F | H-I sealed (vault)
  },
  h: {
    11: { 0: 'open', 1: 'open', 2: 'open' },      // A-D | B-E | C-F
    22: { 0: 'door', 1: 'door', 2: 'door' },      // D-G (blue/exit) | E-H (red/vault) | F-I (gold) - all locked
  },
};

// The solution path as a room sequence (repeats = backtracking).
const SOLUTION_PATH = [[0, 0], [0, 1], [1, 1], [1, 2], [1, 1], [0, 1], [0, 2]];

// Reward rooms: the right column, reachable only by leaving the path.
const DEAD_ENDS = [[2, 0], [2, 1], [2, 2]];

// Open door gaps (room-relative):
//   vertical walls (10 tall): ONE centered door, rows 5-6. The old two-door
//     version (rows 3-4 and 6-7) put both gaps in the same ~6-tile guard cone,
//     so the second gap was clutter, not a route. One chokepoint per tight wall.
//   horizontal walls (16 wide): two doors, cols 4-5 and 10-11. The 6-tile spread
//     means they can sit in different threat zones - a real left/right route pick.
const DOOR_V = [[5, 6]];
const DOOR_H = [[4, 5], [10, 11]];

// Patrol PATTERN library (room-relative, F20). Each room gets GUARDS_PER_ROLE
// guards, one distinct pattern each; the guard idles its loop, and a spot fires
// the room-confined A* chase (F19). Shapes are chosen so their lanes leave open
// floor for the 3-5 obstacles the mapgen drops per room. Segments are the guard's
// idle path - the validator (patrolsClear) re-proves every segment is clear.
const PATTERNS = [
  { pts: [[3, 4], [13, 4]] },                     // line: center sweep
  { pts: [[8, 1], [8, 8]] },                      // vline: center drop
  { pts: [[3, 2], [13, 2], [13, 7], [3, 7]] },    // rectMid: mid band loop
  { pts: [[2, 1], [13, 1], [13, 8], [2, 8]] },    // rectFull: near-perimeter loop
  { pts: [[3, 1], [13, 1], [13, 8], [8, 8], [8, 4], [3, 4]] },   // L: hex loop
];
// guards per room role (kept from the old CENTER + extras counts, so the tempo
// and pressure hold; the exit room stays quiet - its return leg is already the
// longest stretch of the run, and ambushing it breaks the loop instead of
// tensioning it - tuned against the sim bot as the "competent amateur" bar)
const GUARDS_PER_ROLE = { spawn: 1, file: 2, exit: 1, filler: 2 };   // F29: no 'key' role (keys sit in spawn/filler rooms); total still 16

// Obstacle shapes (room-relative, F20): the mapgen drops 3-5 of these per room
// at random floor spots off the pattern lanes. Small chunks, corner-hugging
// where possible, so a 16x10 room stays connected and readable.
const OB_SHAPES = [
  [[0, 0]],                         // 1x1
  [[0, 0], [1, 0]],                 // 1x2
  [[0, 0], [0, 1]],                 // 2x1
  [[0, 0], [1, 0], [0, 1], [1, 1]], // 2x2
  [[0, 0], [1, 0], [0, 1]],         // L
];

// Object pools (room-relative, verified clear of every pillar option; the
// validator re-checks each rolled layout).
const SPAWN_T = [2, 2];                                    // A(0,0), top-left, clear of the center patrol line
const START_DOOR = { c: 3, r: 0, w: 2 };   // cosmetic entry marker in the top wall above the spawn (visual only)
// Object positions hug walls and corners, OFF the five patrol lanes
// (top/bottom dr1/dr8 dc3-12, center dr4 dc3-12, sides dc4/dc12 dr2-7):
// a human can wall-shade a grab and retreat; standing on the lane is a
// death trap, not a challenge.
// Key spots must sit where a grab-and-exit CHAINS with a timed crossing:
// the top-right corner pockets ([14,1],[15,2]) and the bottom-right corner
// ([15,7]) sit inside the right-column lane's cone, so a grab there strands
// the player in the sweep. Keep gap-adjacent and far-corner spots only.
const FILE_POOL = [[15, 7], [0, 7], [7, 9], [14, 8], [3, 8], [15, 9]];   // H(1,2)
// G(0,2): the D-G door sits on G's top wall at cols 5,6,11,12 - keep the
// exit off the patrol lanes (dr 1/4/8, dc 4/12) and away from that wall.
// the D-G door sits on G's top wall at cols 4,5,10,11 - the exit can sit
// right under a gap (visible from D) or in a floor corner
const EXIT_POOL = [[4, 0], [5, 0], [0, 9], [15, 9], [7, 9], [0, 4]];

// Dead-end rewards. Walk over one to bank it for the run.
const UPG_TYPES = ['stim', 'hush', 'heavy'];
const UPGRADES = {
  stim:  { label: 'STIM',  glyph: 'V', color: '#5ad1e6', desc: '+15% speed' },
  hush:  { label: 'HUSH',  glyph: 'H', color: '#b48cff', desc: '+5s hide window' },
  heavy: { label: 'HEAVY', glyph: 'W', color: '#ff9d5c', desc: '+4s knockouts' },
};
const UPG_POOL = [[1, 2], [15, 2], [1, 7], [15, 7], [2, 0], [13, 0]];   // per dead-end room, wall-hugging
// F33: which dead-end room each mod is hidden in (C=stim, F=hush, I=heavy - same
// rooms as the old floor placement, now inside a container in that room)
const UPG_ROOMS = { stim: [2, 0], hush: [2, 1], heavy: [2, 2] };

// Hide spots (bins/closets, F23): a wall corner, off the patrol lanes, so each
// room has a place to tuck a knocked-out body. One per room, seed-picked from
// the four interior corners (dc 1/14, dr 1/8 - just outside the lane span).
const HIDE_POOL = [[1, 1], [14, 1], [1, 8], [14, 8]];

// ============================================================
//  F33: search containers + themeable item content
//  Containers are SOLID furniture (archetypes = gameplay stats, no names here -
//  the names live in THEME). A quest item (key / objective / upgrade) sits in ONE
//  container in its room; you find it by holding ACT on the container (the room
//  is the hinted objective, the container within is the puzzle). The rest hold
//  flavor notes (clues later). Archetypes:
//    fast - quick, silent (1.0s)
//    mid  - deliberate, silent (2.0s)
//    loud - deliberate (1.5s) but its OPEN carries (SEARCH_NOISE): the risky one
//    safe - slow, silent (3.0s): the objective's home, the tense hold
// ============================================================
const CONTAINER_TYPES = {
  fast: { searchTime: 1.0, noise: 0 },
  mid:  { searchTime: 2.0, noise: 0 },
  loud: { searchTime: 1.5, noise: SEARCH_NOISE },
  safe: { searchTime: 3.0, noise: 0 },
};
// how many containers a room gets (D4): key/objective rooms get 3, others 2
const containersPerRoom = (rc, rr) => {
  const isKey = KEYS.some((k) => k.room[0] === rc && k.room[1] === rr);
  const isObj = rc === ROLE.file[0] && rr === ROLE.file[1];
  const isNook = rc === NOOK.room[0] && rr === NOOK.room[1];   // F44: D also gets a forced nook-bowl container
  return (isKey || isObj) ? (isNook ? 2 : 3) : 2;
};
// the objective item (themable): the thing you steal from the vault room
const OBJECTIVE = { id: 'objective', role: 'objective' };
// flavor notes - "worthless" now, clues later. The room-hint bootstrap in the
// briefing gets replaced by these as the narrative lands. Stable + data-driven.
const NOTE_TEXTS = [
  'A crumpled memo: "shift change at three - tell the east floor to watch the copiers."',
  'A sticky note in a shaky hand: "the good keys are the colored ones. do not mix them up."',
  'A receipt for office supplies, mostly smudged. Someone circled "toner" twice.',
  'A half-eaten granola bar and a photo of a dog you will think about later.',
  'A laminated badge: "STAFF ONLY - you are very much not staff."',
  'A sticky note: "if the copier jams, do NOT bang it. it wakes the night guard."',
  'A torn page of a phone book. One number is crossed out in red.',
  'A small potted plant, surprisingly alive, in the middle of all this.',
];
