// ============================================================
//  SNEAK RUN - entry point: test hook, main loop, boot
//  Loads LAST (after input.js). All other names are global.
// ============================================================

// ---------------- Test hook (harmless in play) ----------------
window.__SNEAK = {
  state: () => ({
    x: state.player.x, y: state.player.y, hits: state.player.hits,
    hasFile: state.hasFile,
    keyBag: Object.assign({}, state.keyBag), doorsOpen: Object.assign({}, state.doorsOpen),   // F29: per-color inventory
    distractCd: state.distractCd,   // F25: >0 while the attract is on cooldown
    gameOver: state.gameOver, won: state.won, seed: state.currentSeed,
    // F33: quest items live in containers; report every container (and the
    // specific ones holding the file / each key) so a bot or dev can target them.
    containers: state.containers.map((ct) => ({ id: ct.id, x: ct.x, y: ct.y, opened: ct.opened, arc: ct.arc })),
    file: (() => { const c = state.containers.find((cc) => cc.contents.some((i) => i.role === 'objective')); return c ? [c.x, c.y] : [0, 0]; })(),
    keys_pos: KEYS.map((k) => { const c = state.containers.find((cc) => cc.contents.some((i) => i.role === 'key' && i.id === k.id)); return c ? [c.x, c.y] : [0, 0]; }),
    exit: [state.exitPos.x, state.exitPos.y],
    guards: state.guards.map((g) => g.state),
    alarm: state.alarmTime > 0, alarmTime: state.alarmTime,
    map: state.map,
    // cone data so a bot (or dev) can compute visible tiles
    cones: state.guards.map((g) => ({
      x: g.x, y: g.y, facing: g.facing,
      fov: g.state === 'chase' ? statsFor(g.type).chaseFov : statsFor(g.type).patrolFov,
      range: (state.alarmTime > 0 ? ALARM_RANGE_MULT : 1) * statsFor('guard').sightDist,
      state: g.state,
    })),
    bullets: state.bullets.map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy })),
  }),
  reset: (s) => reset(s),
  // Phase 6: deterministic replay + serializable state (harmless in play).
  // replay(seed, inputFrames, dt) re-runs a recorded input stream headless or in
  // the browser and returns the per-frame frames - the multiplayer foundation.
  replay: (seed, inputFrames, dt) => runReplay(seed, inputFrames, dt),
  serialize: () => JSON.parse(JSON.stringify(state)),   // plain, JSON-safe copy of the run
  // test/dev helpers (harmless in play)
  teleport: (x, y) => { state.player.x = x; state.player.y = y; },
  knockoutSetup: () => {
    const g = state.guards.find((g) => g.state === 'patrol');
    if (!g) return false;
    g.state = 'patrol';
    g.facing = 0; // facing east; player goes directly behind (west)
    state.player.x = g.x - 20;
    state.player.y = g.y;
    return true;
  },
  // dev/screenshot hooks (harmless in play): script the body-drag mechanic (F23)
  dumpBody: (i) => { const g = state.guards[i === undefined ? 0 : i]; if (!g) return false; g.state = 'down'; g.ko = KO_TIME; g.x = state.player.x; g.y = state.player.y; return true; },
  act: () => { tryAction(); return true; },
  carrying: () => !!state.carrying,
  spots: () => state.hideSpots.map((s) => ({ c: s.c, r: s.r, x: s.x, y: s.y, occupied: s.occupied })),
  // dev/screenshot hooks (harmless in play): the distract mechanic (F25)
  canDistract: () => canDistract(state.player.x, state.player.y),
  distract: () => { if (state.distractCd <= 0 && canDistract(state.player.x, state.player.y)) doDistract(); return true; },
  lured: () => state.guards.filter((g) => g.state === 'investigate' || g.state === 'hear').length,
  // dev hook: stage a hidden-player distract - player at the top wall, one of that
  // room's guards 2 tiles south facing AWAY (so it can't see you). Then a distraction lures it.
  lureSetup: () => {
    state.player.x = 80; state.player.y = 48;
    let gi = state.guards.findIndex((g) => g.room && g.room[0] === 0 && g.room[1] === 0 && g.state === 'patrol');
    if (gi < 0) gi = state.guards.findIndex((g) => g.room && g.room[0] === 0 && g.room[1] === 0);
    if (gi < 0) return -1;
    const g = state.guards[gi];
    g.state = 'patrol';
    g.x = 80; g.y = 48 + TILE * 2;
    g.facing = Math.PI / 2;   // facing south, away from the player who is north
    g.pathTiles = [];
    return gi;
  },
};

// ---------------- Main loop ----------------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

reset(Math.floor(Math.random() * 1e6));
requestAnimationFrame(loop);
showIntro(true);   // boot only; R/N resets do not re-open the modal
