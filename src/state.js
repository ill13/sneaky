// ============================================================
//  SNEAK RUN - shared mutable game state
//  One object, mutated in place, shared by every script.
// ============================================================
const state = {
  map: null,
  wallEdges: [],
  player: null,   // convenience ref = state.units[0]
  guards: [],     // convenience ref = the guard slice of state.units
  units: [],      // Phase 1: the single unit array [player, ...guards]; source of truth
  bullets: [],
  hasFile: false,
  // F29: inventory - the three colored keys, each opening one bottom-row door
  keyBag: { blue: false, gold: false, red: false },
  doorsOpen: { blue: false, gold: false, red: false },   // per-color door opened
  doorTiles: { blue: [], gold: [], red: [] },            // [[c, r], ...] per-color locked door tiles
  doorLintels: [],        // [[c, r, 'h'|'v'], ...] every open door gap (frame rendering)
  keyRoomIdx: { blue: 0, gold: 0, red: 0 }, fileRoomIdx: 0, exitRoomIdx: 0,   // explored[] indices for minimap icons
  upgrades: { stim: false, hush: false, heavy: false },   // banked dead-end power
  // F33: the search containers (solid furniture), one per placed container. Each
  // holds a small `contents` list of item refs {role, id}; `opened` flips when
  // you finish searching it, `searchT` is the seconds accumulated this session.
  containers: [],
  switches: [],          // F39: the power panels - [{ x, y, c, r, room, target, on }]
  foundNotes: [],        // F33: the flavor-note texts you've read
  searching: null,       // F33: the container currently being searched (HUD progress)
  // F34: the clue system. `clues` maps a key id -> true once you've read the note
  // that names its room (that key's room then lights up on the minimap). The
  // actual room is always KEYS[id].room - the clue just reveals it to you.
  clues: {},
  noteToast: null,       // F34: { text, t, clue } - the note/clue you just read, shown briefly
  alarmTime: 0,
  gameOver: false,
  won: false,
  elapsed: 0,
  exitHint: 0,
  flash: 0,
  spotFlash: 0,             // "you got spotted" edge pulse (decays fast)
  currentSeed: 0,
  intro: false,           // start-of-run instructions modal
  paused: false,          // update() is frozen while paused (intro/help open)
  keys: {},           // keyboard hold state (input.js / controller.js) - NOT the key inventory
  // gamepad/touch directions + action (filled by controls.js, OR'd with keys in update)
  pad: { up: false, down: false, left: false, right: false, x: false, y: false },
  // Phase 3: the intent channel. Input layers ONLY emit plain-data intents here
  // (meta actions: restart/newSeed/typeSeed/toggleMenu/closeMenu/help/intro); the
  // controller (src/controller.js) consumes them each frame. Held move + act/distract
  // stay as raw `keys`/`pad` snapshots merged in the controller. Plain objects,
  // so the whole per-frame input stream is serializable (replay + multiplayer).
  intentQueue: [],
  exitPos: { x: 0, y: 0 },
  explored: [false, false, false, false, false, false, false, false, false], // per room (c*3 + r)
  // Body dragging (F23): the downed guard being dragged (or null), the bins /
  // closets you can hide it in, and the prev-frame action key (edge-trigger).
  carrying: null,
  hideSpots: [],          // [{ c, r, x, y, occupied, body }] one per room
  actionPrev: false,
  distractCd: 0,             // F25: distract - seconds until you can distract again
  distractPrev: false,
  distractFx: null,          // { x, y, t } the ripple being drawn, or null
  menuOpen: false,        // F24: hamburger menu up (freezes the run)
};

const alarm = () => state.alarmTime > 0;

function makeGuard(path) {
  const px = (c, r) => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE });
  const start = px(path[0][0], path[0][1]);
  return {
    x: start.x, y: start.y,   // r comes from the unit table (makeUnit stamps it)
    path: path.map(([c, r]) => px(c, r)),
    wp: 1,
    facing: 0,
    state: 'patrol',   // patrol | chase | search | down | dazed
    pause: 0,
    seenFor: 0,
    shootCd: 0,
    ko: 0,             // sec left down
    daze: 0,           // sec left dazed
    // F19 room-confined AI: a guard never leaves its own room. The room is bound
    // from its patrol line (a line lives wholly in one room), so its A* grid is the
    // room's interior - doors are on the wall, outside it, and can't be pathed.
    room: roomAt(path[0][0], path[0][1]),
    lastSeen: { x: start.x, y: start.y },   // last tile it had LOS on you
    targetTile: null,                       // A* goal: nearest interior tile to lastSeen
    pathTiles: [],                          // current A* path ([c,r]...), start excluded
    wpTile: 0,                              // index into pathTiles
    searchT: 0,                             // sec left in the search hold
    hearT: 0,                               // F25: sec left in the "heard it" freeze-and-turn
    hearAngle: 0,                           // F25: direction the guard swings to when it hears
    // F38: the duty cycle (sleep). dutyT = seconds into the current phase; asleep
    // flips when the phase runs out (only honored in patrol). Non-sleepers never
    // flip it (tickDuty returns early), so asleep stays false for them.
    dutyT: 0,
    asleep: false,
  };
}
// F39: the camera (the first machine). A stationary floor sensor: no patrol
// path, no speed. It scans its cone (camBase +/- a sine sweep), accumulates a
// detection fuse (seenFor), and a machine (knockable/lureable = false). Its id
// is the switch's target.
function makeCamera(c, r, facing) {
  const x = (c + 0.5) * TILE, y = (r + 0.5) * TILE;
  return {
    x, y,
    facing,
    state: 'patrol',
    room: roomAt(c, r),
    camera: true,        // render as a machine
    machine: true,        // non-knockable, non-distractable (the switch is its kill)
    disabled: false,      // flipped off by the switch
    seenFor: 0,           // the detection fuse (sec of sustained line-of-sight)
    camT: 0,              // the lens sweep phase
    camBase: facing,      // the center of the sweep arc
  };
}
// F39: a switch (power panel). A fixed interactable that, when operated (face it
// + ACT), disables its target machine (latching - one-way, stays off). Machines-
// only, so `target` is always a unit id.
function makeSwitch(c, r, targetId) {
  return {
    c, r,
    x: (c + 0.5) * TILE, y: (r + 0.5) * TILE,
    room: roomAt(c, r),
    target: { kind: 'unit', id: targetId },
    on: true,             // the machine is armed until flipped
  };
}
