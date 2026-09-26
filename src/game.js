// ============================================================
//  SNEAK RUN - reset (rebuilds a run from a seed)
// ============================================================

function reset(seed) {
  const layout = generateLayout(seed);
  state.map = layout.map;
  state.wallEdges = buildWallEdges(state.map);
  state.currentSeed = seed;
  state.elapsed = 0;
  state.hasFile = false;
  for (const id in state.keyBag) state.keyBag[id] = false;          // F29: reset the key inventory
  for (const id in state.doorsOpen) state.doorsOpen[id] = false;
  state.alarmTime = 0;
  state.gameOver = false;
  state.won = false;
  state.exitHint = 0;
  state.flash = 0;
  state.spotFlash = 0;
  state.intro = false;
  state.paused = false;
  // F33: the search containers from the layout (solid furniture with contents).
  // Quest items live INSIDE them - no floor positions. The minimap room indices
  // come from each quest item's container room.
  state.containers = layout.containers.map((ct) => ({
    id: ct.id, arc: ct.arc, rc: ct.rc, rr: ct.rr, c: ct.c, r: ct.r,
    x: (ct.c + 0.5) * TILE, y: (ct.r + 0.5) * TILE,
    contents: ct.contents, opened: false, searchT: 0,
  }));
  state.foundNotes = [];
  state.searching = null;
  state.clues = {};          // F34: which key rooms you've learned from the notes
  state.noteToast = null;    // F34: the note/clue you just read
  // F29: per-color doors from the layout (three colored keys, three doors). The
  // key's room is its container's room; the door tiles are fixed per color.
  for (const k of KEYS) {
    state.doorTiles[k.id] = doorSecTiles(k.doorSec);
    const q = layout.questContainer[k.id];
    state.keyRoomIdx[k.id] = q.rc * 3 + q.rr;
  }
  // door lintels: every open gap on the authored wall lines
  const lintels = [];
  for (const c of [17, 34]) for (let r = 1; r < ROWS - 1; r++) if (state.map[r][c] === 0) lintels.push([c, r, 'v']);
  for (const y of [11, 22]) for (let c = 1; c < COLS - 1; c++) if (state.map[y][c] === 0) lintels.push([c, y, 'h']);
  state.doorLintels = lintels;   // F29: open gaps only; locked doors are drawn colored in the renderer
  state.fileRoomIdx = layout.questContainer.objective.rc * 3 + layout.questContainer.objective.rr;
  const eR = roomAt(layout.exit[0], layout.exit[1]);
  state.exitRoomIdx = eR[0] * 3 + eR[1];
  // dead-end power resets each run (the mods are found by searching, not stepped on)
  for (const t of UPG_TYPES) state.upgrades[t] = false;
  // mutate in place so any captured reference (test hooks, bots) stays live
  state.exitPos.x = (layout.exit[0] + 0.5) * TILE;
  state.exitPos.y = (layout.exit[1] + 0.5) * TILE;

  state.player = makeUnit('player', 0, {
    x: (layout.spawn[0] + 0.5) * TILE, y: (layout.spawn[1] + 0.5) * TILE,
    invuln: 0, hits: 0,
    hp: PLAYER_HP_START,   // F46: the hit pool - a hit costs 1; at 0 you're caught
    stagger: 0,            // F46: sec you're flinched (can't move) after a non-lethal hit
  });

  state.guards = layout.paths.map((p, i) => makeUnit('guard', i + 1, makeGuard(p)));
  // F28: fixed sentries - a few guards are stuck at their post (only their head
  // swings, in 90-degree steps) instead of patrolling the lane.
  state.guards.forEach((g, i) => {
    if (i % POST_STRIDE === POST_OFFSET) { g.post = true; g.postBase = 0; g.postStep = 0; g.postT = 0; }
    else if (TOOLS.sleep && i % SLEEP_STRIDE === SLEEP_OFFSET) g.type = 'sleeper';   // F38: dozes on its round
  });
  // The machines come AFTER the post/sleeper designation: they are not guards, so
  // they must not shift the stride-rule indices (camera = 100, laser = 101).
  // F39: the camera (first machine) + its switch - the environmental-control
  // showcase. The camera is a machine (non-knockable, non-distractable); the
  // switch plate is the ONLY way to power it off (F43: occupy it, or park a crate
  // on it, and it stays down; clear it and a grace window runs before it re-arms).
  // Placed on two free tiles in CAM_ROOM (the E hub). Gated by TOOLS.camera.
  state.switches = [];
  if (TOOLS.camera && layout.camSw) {
    const [cc, cr] = layout.camSw.cam;
    const cam = makeUnit('camera', 100, makeCamera(cc, cr, 0));   // face east, scanning
    state.guards.push(cam);
    state.switches.push(makeSwitch(layout.camSw.sw[0], layout.camSw.sw[1], cam.id));
  }
  // F40: the laser (the industrial skin of the duty cycle). A fixed emitter whose
  // beam blinks on/off - cross it while it's dormant. No switch (its defense is
  // pure timing). Gated by TOOLS.laser.
  if (TOOLS.laser && layout.laserPos) {
    const [lc, lr] = layout.laserPos;
    state.guards.push(makeUnit('laser', 101, makeLaser(lc, lr, Math.PI)));   // beam points west, across the nook (mouth -> bowl)
  }
  // F42: the robot (the moving machine). A sentry that patrols the Vault lane with
  // a vision cone; a sustained look trips the alarm (not a hit). It never chases.
  // Its switch plate stops it (F43: occupancy + grace), like the camera. Gated by TOOLS.robot.
  if (TOOLS.robot && layout.robotPos) {
    const robot = makeUnit('robot', 102, makeRobot(layout.robotPos.path));
    state.guards.push(robot);
    if (layout.robotPos.sw) state.switches.push(makeSwitch(layout.robotPos.sw[0], layout.robotPos.sw[1], robot.id));
  }
  // F43: the pushable crates - one per switch room (E, H), solid + unbreakable +
  // unsearchable. Shove them one tile; park one on a switch plate to hold the
  // machine down. Gated by TOOLS.crate.
  state.crates = (layout.cratePos || []).map(([c, r]) => makeCrate(c, r));
  state.units = [state.player, ...state.guards];   // Phase 1: single unit array, player first
  // hide spots (F23): one bin/closet per room, from the layout's seed-picked tiles
  state.hideSpots = (layout.hideSpots || []).map(([c, r]) =>
    ({ c, r, x: (c + 0.5) * TILE, y: (r + 0.5) * TILE, occupied: false, body: null }));
  state.carrying = null;
  state.actionPrev = false;
  state.distractCd = 0;
  state.distractPrev = false;
  state.distractFx = null;
  state.intentQueue = [];   // Phase 3: clear any queued intents on a fresh run
  state.bullets = [];
  for (let i = 0; i < state.explored.length; i++) state.explored[i] = false;

  updateHUD();
  overlay.classList.add('hidden');
  showIntro(false);
  for (const k in state.keys) delete state.keys[k];   // drop any held keyboard input (the inventory lives in keyBag)
}
