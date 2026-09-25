// ============================================================
//  F39 - the camera + its switch: the "operating the environment" verb.
//  A camera is a machine (non-knockable, non-distractable) that scans its cone
//  and trips the ALARM after a sustained look. The switch is the only way to
//  power it off (latching). Driven through the real update()/tryAction paths.
//  Permanent test - keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// set the held move direction (what `heldMoveDir()` reads) toward a point
const faceToward = (x, y) => {
  const dx = x - state.player.x, dy = y - state.player.y;
  state.keys['a'] = dx < 0; state.keys['d'] = dx > 0;
  state.keys['w'] = dy < 0; state.keys['s'] = dy > 0;
};
const unface = () => { for (const k of ['a', 'd', 'w', 's']) delete state.keys[k]; };

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

// T2: a switch exists, targets the camera, and is on (armed) by default.
{
  g.reset(42);
  const sw = state.switches[0];
  const cam = state.guards.find((x) => x.camera);
  ok(!!sw, 'T2: a switch exists');
  if (sw && cam) {
    ok(sw.target.id === cam.id && sw.target.kind === 'unit', 'T2: the switch targets the camera');
    ok(sw.on === true, 'T2: the switch is on (the machine armed) by default');
  }
}

// T3: flipSwitch powers off the target machine (latching - one-way).
{
  g.reset(42);
  const sw = state.switches[0];
  const cam = state.guards.find((x) => x.id === sw.target.id);
  g.flipSwitch(sw);
  ok(sw.on === false, 'T3: flipSwitch sets the switch off (latching)');
  ok(cam.disabled === true, 'T3: flipSwitch disables the target camera');
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
  unface();
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
  unface();
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

// T8: the switch context - you only need to be ON/OVER it (no facing, no direction).
{
  g.reset(42);
  const sw = state.switches[0];
  const p = state.player;
  unface();                                  // no direction held at all
  p.x = sw.x - 30; p.y = sw.y;               // 30px away, within SWITCH_RANGE
  ok(g.switchTarget() === sw, 'T8: standing in range with no direction -> switchTarget resolves it');
  p.x = sw.x; p.y = sw.y;                    // exactly on the switch tile
  ok(g.switchTarget() === sw, 'T8: standing on the switch -> still resolves it');
  p.x = sw.x - 80;                           // 80px out, past SWITCH_RANGE
  ok(g.switchTarget() === null, 'T8: out of range -> no switch target');
}

// T8b: operating the switch (flipSwitch) powers the camera off.
{
  g.reset(42);
  const sw = state.switches[0];
  const cam = state.guards.find((x) => x.id === sw.target.id);
  const p = state.player;
  p.x = sw.x - 30; p.y = sw.y;
  faceToward(sw.x, sw.y);
  g.flipSwitch(g.switchTarget());
  ok(sw.on === false && cam.disabled === true, 'T8b: operating the switch powers the camera off');
}

// T9: TOOLS.camera off removes the camera + its switch (the curation toggle).
{
  g.reset(42);
  const before = state.guards.filter((x) => x.camera).length;
  g.TOOLS.camera = false;
  g.reset(42);
  const after = state.guards.filter((x) => x.camera).length;
  const camSwitch = state.switches.some((s) => { const u = state.guards.find((x) => x.id === s.target.id); return u && u.camera; });
  g.TOOLS.camera = true;   // restore
  ok(before > 0 && after === 0 && !camSwitch, 'T9: TOOLS.camera off removes the camera + its switch');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F39 (switch + camera) CHECKS PASSED');
process.exit(fails ? 1 : 0);
