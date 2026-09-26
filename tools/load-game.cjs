// Loads the whole SNEAK RUN game (classic scripts) into a Node context with
// stubbed DOM globals, returning the same `api` surface the old single-file
// harness used. Each tool calls loadGame() and gets:
//   { generateLayout, reset, update, render, state, ... ,
//     player(), guards(), map(), keys(), filePos(), exitPos(), wallEdges(),
//     VISION_RANGE, CHASE_FOV, PATROL_FOV, SHOOT_RANGE }
const fs = require('fs');
const path = require('path');

const FILES = [
  'config.js', 'unit.js', 'rng.js', 'content.js', 'theme.js', 'state.js', 'mapgen.js', 'sight.js',
  'movement.js', 'path.js', 'ai.js', 'hud.js', 'game.js', 'update.js', 'controller.js', 'replay.js', 'render.js', 'controls.js',
  'input.js', 'main.js',
]; // controls.js no-ops in Node: ResponsiveGamepad (vendored UMD) is browser-only

const ctxStub = new Proxy({}, {
  get: (t, k) => (typeof k === 'string' &&
    ['fillRect', 'beginPath', 'arc', 'fill', 'stroke', 'moveTo', 'lineTo', 'closePath',
     'save', 'restore', 'translate', 'rotate', 'strokeRect', 'fillText', 'setTransform',
     'rect', 'clip', 'drawImage', 'measureText']
      .includes(k) ? (k === 'measureText' ? (s) => ({ width: String(s || '').length * 7 }) : () => {}) : t[k]),
  set: () => true,
});
const els = {};
function mkEl(id) {
  return els[id] ??= {
    textContent: '',
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    getContext: () => ctxStub,
    addEventListener: () => {},
    width: 640, height: 480,
  };
}

function loadGame() {
  // Fresh element store per load so repeated loads don't share stale DOM.
  for (const k of Object.keys(els)) delete els[k];

  const document = {
    getElementById: mkEl,
    querySelector: () => null,
    // the minimap caches its static facility layer on an offscreen canvas
    createElement: (tag) => (tag === 'canvas'
      ? { getContext: () => ctxStub, width: 0, height: 0, style: {} }
      : { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener: () => {} }),
  };
  const addEventListener = () => {};
  const performance = { now: () => Date.now() };
  const requestAnimationFrame = () => 1;
  const windowObj = { __SNEAK: undefined, addEventListener: () => {} };
  const prompt = () => null;

  const dir = path.join(__dirname, '..', 'src');
  const code = FILES.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n');

  // Stop the browser boot (random reset + rAF) and instead hand back the API.
  const bootLine = 'reset(Math.floor(Math.random() * 1e6));\nrequestAnimationFrame(loop);';
  if (!code.includes(bootLine)) throw new Error('boot line not found in src/main.js');
  const stripped = code.replace(bootLine, `
    return {
      generateLayout, reset, update, render, state,
      UNIT_TYPES, statsFor, makeUnit,                       // src/unit.js: the unit model
      units: () => state.units,
      player: () => state.player,
      guards: () => state.guards,
      map: () => state.map,
      bullets: () => state.bullets,
      keys: () => state.keys,
      containers: () => state.containers,   // F33: the search containers
      exitPos: () => state.exitPos,
      wallEdges: () => state.wallEdges,
      VISION_RANGE, CHASE_FOV, PATROL_FOV, SHOOT_RANGE,
      // lower-level helpers + constants for the unit tests
      TILE, COLS, ROWS,
      buildWallEdges, conePoly, raySeg, hasLOS, canSee, guardSharesRoom, angleDiff, hitsWall, tryMove, freeMove,
      resumePatrol, enterChase, roomPath, followPath, stepGuard, angleTo, tickDuty,   // src/ai.js: the guard AI state machine (+F38 duty cycle)
      AStar, PATH, roomBounds, roomWalkable, nearestFloorTile,   // src/path.js: the A* pathfinder
      tryAction, hideSpotNear, downGuardNear, wakeGuard, tryKnockout, canDistract, doDistract,
      actionContext, isKnockoutTarget, knockoutReady,   // F27: the contextual action
      searchTarget, stepSearch, openContainer, grantItem, doSearchNoise, grantAllItems,   // F33: hold-to-search containers + debug grant-all
      hitPlayer, PLAYER_HP_START, PLAYER_HP_MAX, HIT_STAGGER,   // F46: the hit pool + health items
      stepSwitches, onCrateMoved, machineAlarm,   // F43: the floor-plate switch (occupancy + grace) + crate reaction + machine alarm
      tripAlarm, convergeGuards, CONVERGE_TIME,   // F45: the alarm lockdown (converge on the trigger tile)
      spawnReinforcements, stepReinforcements, REINFORCE_MAX, REINFORCE_TIME,   // F45: the temporary reinforcement spike
      roomAt, reachable, solid, generateFallback, mulberry32, validateKeyChain,   // F29: the multi-key solvability proof
      crateAt, tileBlocked, tryPushCrate, tryPullCrate, pullReady, PULL_NOISE,   // F43: the pushable crate (solid + shove); F47: the pull (ACT swap)
      makeCamera, makeSwitch, makeLaser, makeRobot, makeCrate,   // F39: camera + switch; F40: laser; F42: robot; F43: crate
      KEYS, doorSecTiles, doorSecApproach,   // F29: the colored key/door table + helpers
      NOOK, nookEmitter, carveNook, patClearsNook,   // F44: the laser nook (geometry + carving + lane filter)
      SOLUTION_PATH, UPG_TYPES, UPGRADES, WALL_PLAN, DEAD_ENDS,
      CONTAINER_TYPES, NOTE_TEXTS, UPG_ROOMS, OBJECTIVE, containersPerRoom,   // F33: container archetypes + item content
      THEME, buildBriefing, SEARCH_NOISE, SEARCH_RANGE, roomName, clueText,   // F33: the theme layer + search tuning
      shuffle, pick, CLUE_ROOMS, dropBody,   // F34: clue notes + the knockout topple
      CARRY_SPEED_MULT, GRAB_DIST, HIDE_DIST, KO_TIME, DAZE_TIME, WAKE_SPOT_DIST, WAKE_DISCOVER_DIST,
      DISTRACT_HEARING, DISTRACT_WALL_DIST, DISTRACT_FACE_COS, DISTRACT_COOLDOWN, DISTRACT_INVESTIGATE, HEAR_PAUSE,
      POST_STRIDE, POST_OFFSET, POST_SCAN_HOLD, POST_SWING,   // F28: post guards + body discovery
      SLEEP_ON, SLEEP_OFF, SLEEP_STRIDE, SLEEP_OFFSET, TOOLS,   // F38: the duty cycle (sleep) + tool toggles
      CAM_FOV, CAM_LOCK, CAM_PAN_SPEED, CAM_PAN_RANGE, CAM_ROOM, SWITCH_GRACE, CRATE_STALL,   // F39: the camera; F43: switch grace + crate stall
      LASER_ROOM, LASER_ON, LASER_OFF, LASER_RANGE, BEAM_THICK,   // F40: the laser (duty-cycle industrial skin)
      ROBOT_ROOM, ROBOT_LOCK, ROBOT_PATTERN,   // F42: the robot (the moving machine)
      beamContact,   // F40: the laser beam contact test
      SEARCH_TIME, ALARM_SPEED_MULT, ALARM_RANGE_MULT, ALARM_PATROL_SPEED_MULT, ALARM_SEARCH_MULT, ALARM_DURATION,   // F31: alarm scaling
      runReplay,                                            // src/replay.js: deterministic replay driver
    };
  `);

  const boot = new Function(
    'document', 'addEventListener', 'performance', 'requestAnimationFrame', 'window', 'prompt',
    stripped
  );
  return boot(document, addEventListener, performance, requestAnimationFrame, windowObj, prompt);
}

module.exports = { loadGame };
