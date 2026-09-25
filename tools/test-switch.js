// ============================================================
//  F43 - the floor-plate switch + the pushable crate.
//  The camera is a machine (non-knockable) that scans its cone and trips the
//  ALARM after a sustained look. The switch is a floor plate: occupy it (stand
//  on it, or park a crate on it) and the machine powers off; clear it and a
//  grace window (SWITCH_GRACE) keeps it down, then it re-arms. Driven through
//  the real update()/stepSwitches path. Permanent test - keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// stand the player on a tile and tick one frame (so stepSwitches runs)
const standOn = (sw) => { state.player.x = sw.x; state.player.y = sw.y; g.update(1 / 60); };
// leave the plate and park the player in the spawn room (invulnerable), so the
// grace window runs in peace - a guard in the switch room would otherwise catch
// you before the window closes and end the run.
const leaveSafe = () => { state.player.x = 112; state.player.y = 112; state.player.invuln = 999; for (const k of ['a','d','w','s']) delete state.keys[k]; };

// T1: a camera exists (when TOOLS.camera), is a machine, in the showcase room,
// and cannot be knocked out.
{
  g.reset(42);
  const cam = state.guards.find((x) => x.camera);
  ok(!!cam, 'T1: a camera exists when TOOLS.camera is on');
  if (cam) {
    ok(cam.machine === true, 'T1: the camera is a machine (non-knockable / non-distractable)');
    ok(cam.room[0] === g.CAM_ROOM[0] && cam.room[1] === g.CAM_ROOM[1], 'T1: the camera is in the showcase room (E)');
    ok(g.isKnockoutTarget(cam) === false, 'T1: a camera cannot be knocked out');
  }
}

// T2: a switch exists, targets the camera, and is armed by default.
{
  g.reset(42);
  const sw = state.switches[0];
  const cam = state.guards.find((x) => x.camera);
  ok(!!sw, 'T2: a switch exists');
  if (sw && cam) {
    ok(sw.target.id === cam.id && sw.target.kind === 'unit', 'T2: the switch targets the camera');
    ok(sw.on === true && cam.disabled === false, 'T2: the switch is armed (the machine on) by default');
  }
}

// T3: occupying the plate powers the camera off (no button, no facing needed).
{
  g.reset(42);
  const sw = state.switches[0];
  const cam = state.guards.find((x) => x.id === sw.target.id);
  standOn(sw);
  ok(sw.on === false && cam.disabled === true, 'T3: standing on the plate powers the camera off');
  ok(sw.grace === 0, 'T3: while occupied the grace timer does not run (fully active)');
}

// T4: a disabled camera is blind even when the player is in range + facing.
{
  g.reset(42);
  const cam = state.guards.find((x) => x.camera);
  cam.disabled = true; cam.facing = 0;
  state.player.x = cam.x + 40; state.player.y = cam.y;
  ok(g.canSee(cam, g.CAM_FOV, g.VISION_RANGE) === false, 'T4: a disabled camera is blind');
}

// T5: an armed camera accumulates its detection fuse when it sees you.
{
  g.reset(42); state.gameOver = false;
  const cam = state.guards.find((x) => x.camera);
  cam.disabled = false; cam.facing = 0; cam.camT = 0; cam.seenFor = 0;
  state.player.x = cam.x + 40; state.player.y = cam.y; state.player.invuln = 999;
  for (const k of ['a', 'd', 'w', 's']) delete state.keys[k];
  let saw = false;
  for (let i = 0; i < 12; i++) { g.update(1 / 60); if (cam.seenFor > 0) { saw = true; break; } }
  ok(saw, 'T5: an armed camera accumulates its fuse when it sees you');
}

// T6: the camera trips the ALARM (not a hit) after CAM_LOCK of sustained look.
{
  g.reset(42); state.gameOver = false;
  const cam = state.guards.find((x) => x.camera);
  cam.disabled = false; cam.facing = 0; cam.camT = 0; cam.seenFor = 0;
  state.player.x = cam.x + 40; state.player.y = cam.y; state.player.invuln = 999;
  for (const k of ['a', 'd', 'w', 's']) delete state.keys[k];
  let alarmed = false;
  for (let i = 0; i < 120; i++) { g.update(1 / 60); if (state.alarmTime > 0) { alarmed = true; break; } }
  ok(alarmed && state.player.hits === 0, 'T6: the camera trips the alarm, not a hit (hits stay 0)');
}

// T7: a distraction does not move the camera (machines can't be lured).
{
  g.reset(42);
  const cam = state.guards.find((x) => x.camera);
  const st = cam.state;
  state.player.x = cam.x - 20; state.player.y = cam.y;
  g.doDistract();
  ok(cam.state === st && cam.hearAngle === undefined, 'T7: a distraction does not affect the camera');
}

// T8: walking off the plate starts the grace window (the machine STAYS down).
{
  g.reset(42); state.gameOver = false;
  const sw = state.switches[0];
  const cam = state.guards.find((x) => x.id === sw.target.id);
  standOn(sw);
  leaveSafe();
  g.update(1 / 60);
  ok(sw.on === false && cam.disabled === true, 'T8: leaving the plate keeps the camera down (grace running)');
  ok(sw.grace > 0 && sw.grace <= g.SWITCH_GRACE, 'T8: the grace window is counting (0 < grace <= SWITCH_GRACE)');
}

// T9: the grace window expires and the machine re-arms (comes back on).
{
  g.reset(42); state.gameOver = false;
  const sw = state.switches[0];
  const cam = state.guards.find((x) => x.id === sw.target.id);
  standOn(sw);
  leaveSafe();
  let rearmed = false;
  for (let i = 0; i < 400; i++) {   // ~6.6s of grace at 1/60
    g.update(1 / 60);
    if (sw.on === true && cam.disabled === false) { rearmed = true; break; }
  }
  ok(rearmed, 'T9: after the grace window the camera re-arms');
}

// T10: re-occupying the plate cancels the grace (back to fully active).
{
  g.reset(42); state.gameOver = false;
  const sw = state.switches[0];
  const cam = state.guards.find((x) => x.id === sw.target.id);
  standOn(sw);
  leaveSafe();
  g.update(1 / 60);
  const graceMid = sw.grace;
  ok(graceMid > 0, 'T10: grace is running while the plate is empty');
  standOn(sw);                                                // step back on
  ok(sw.on === false && cam.disabled === true && sw.grace === 0, 'T10: re-occupying cancels the grace (no timer)');
}

// T11: a crate parked on the plate holds it down with NO timer (persistent).
{
  g.reset(42); state.gameOver = false;
  const sw = state.switches[0];
  const cam = state.guards.find((x) => x.id === sw.target.id);
  // park a crate on the switch tile
  const crate = g.makeCrate(sw.c, sw.r);
  state.crates.push(crate);
  // player is far away (spawn) - only the crate occupies the plate
  for (const k of ['a', 'd', 'w', 's']) delete state.keys[k];
  g.update(1 / 60);
  ok(sw.on === false && cam.disabled === true, 'T11: a crate on the plate powers the camera off');
  ok(sw.grace === 0, 'T11: a crate on the plate means no grace timer (fully active)');
}

// T12: TOOLS.camera off removes the camera + its switch (the curation toggle).
{
  g.reset(42);
  const before = state.guards.filter((x) => x.camera).length;
  g.TOOLS.camera = false;
  g.reset(42);
  const after = state.guards.filter((x) => x.camera).length;
  const camSwitch = state.switches.some((s) => { const u = state.guards.find((x) => x.id === s.target.id); return u && u.camera; });
  g.TOOLS.camera = true;   // restore
  ok(before > 0 && after === 0 && !camSwitch, 'T12: TOOLS.camera off removes the camera + its switch');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F43 (switch plate) CHECKS PASSED');
process.exit(fails ? 1 : 0);
