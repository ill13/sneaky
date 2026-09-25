// ============================================================
//  F42 - the robot: the moving machine. A sentry that patrols a lane (guard
//  movement) with a vision cone; a sustained look (ROBOT_LOCK) trips the ALARM
//  (not a hit), like the camera. It never chases, shoots, or tags. Its switch
//  stops it for the run. Driven through the real update()/doDistract paths.
//  Permanent test - keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };
// Pin the robot in place (a 1-point patrol at its own position) so its facing
// holds and canSee stays stable while we drive the detection fuse.
const pin = (R) => { R.path = [{ x: R.x, y: R.y }]; R.wp = 0; R.pathTiles = []; };

// T1: a robot exists (when TOOLS.robot), is a machine, in the Vault, non-knockable.
{
  g.reset(42);
  const R = state.guards.find((x) => x.robot);
  ok(!!R, 'T1: a robot exists when TOOLS.robot is on');
  if (R) {
    ok(R.machine === true, 'T1: the robot is a machine (non-knockable / non-distractable)');
    ok(R.room[0] === g.ROBOT_ROOM[0] && R.room[1] === g.ROBOT_ROOM[1], 'T1: the robot is in the Vault (the file room)');
    ok(g.isKnockoutTarget(R) === false, 'T1: a robot cannot be knocked out');
  }
}

// T2: the robot patrols (it moves along its lane, like a guard).
{
  g.reset(42); state.gameOver = false;
  const R = state.guards.find((x) => x.robot);
  state.player.x = 112; state.player.y = 112;   // in room A, far from the Vault
  state.player.invuln = 999;
  const sx = R.x, sy = R.y;
  for (let i = 0; i < 180; i++) g.update(1 / 60);
  ok(Math.hypot(R.x - sx, R.y - sy) > 4, 'T2: the robot patrols its lane (it moves)');
}

// T3: the robot has a switch targeting it (armed by default).
{
  g.reset(42);
  const R = state.guards.find((x) => x.robot);
  const sw = state.switches.find((s) => s.target.id === R.id);
  ok(!!sw && sw.on === true, 'T3: the robot has a switch targeting it (armed by default)');
}

// T4: a sustained look trips the alarm (not a hit).
{
  g.reset(42); state.gameOver = false;
  const R = state.guards.find((x) => x.robot);
  pin(R);
  state.player.x = R.x + 15; state.player.y = R.y;
  R.facing = 0;   // face the player (east)
  state.player.invuln = 999;
  let alarmed = false;
  for (let i = 0; i < Math.ceil(g.ROBOT_LOCK * 60) + 60; i++) { g.update(1 / 60); if (state.alarmTime > 0) { alarmed = true; break; } }
  ok(alarmed && state.player.hits === 0, 'T4: the robot trips the alarm on a sustained look (not a hit)');
}

// T5: the robot never chases (it stays in patrol, even when it sees you).
{
  g.reset(42); state.gameOver = false;
  const R = state.guards.find((x) => x.robot);
  pin(R);
  state.player.x = R.x + 15; state.player.y = R.y;
  R.facing = 0;
  state.player.invuln = 999;
  let chased = false;
  for (let i = 0; i < 240; i++) { g.update(1 / 60); if (R.state === 'chase') { chased = true; break; } }
  ok(!chased, 'T5: the robot never chases (it stays in patrol)');
}

// T6: a disabled robot is stopped + blind (switch off) - no movement, no alarm.
{
  g.reset(42); state.gameOver = false;
  const R = state.guards.find((x) => x.robot);
  const sw = state.switches.find((s) => s.target.id === R.id);
  // F43: power the robot off by occupying its plate (stand on it, one frame)
  state.player.x = sw.x; state.player.y = sw.y;
  g.update(1 / 60);   // stepSwitches activates it (held)
  const sx = R.x, sy = R.y;
  state.player.x = R.x + 15; state.player.y = R.y;
  R.facing = 0;
  state.player.invuln = 999;
  let alarmed = false;
  for (let i = 0; i < 120; i++) { g.update(1 / 60); if (state.alarmTime > 0) alarmed = true; }
  ok(R.disabled && Math.hypot(R.x - sx, R.y - sy) <= 2 && !alarmed, 'T6: a disabled robot is stopped + blind (no movement, no alarm)');
}

// T7: a distraction does not affect the robot (machines can't be lured).
{
  g.reset(42);
  const R = state.guards.find((x) => x.robot);
  const st = R.state;
  state.player.x = R.x - 20; state.player.y = R.y;
  g.doDistract();
  ok(R.state === st, 'T7: a distraction does not affect the robot');
}

// T8: TOOLS.robot off removes the robot + its switch (the curation toggle).
{
  g.reset(42);
  const before = state.guards.filter((x) => x.robot).length;
  g.TOOLS.robot = false;
  g.reset(42);
  const after = state.guards.filter((x) => x.robot).length;
  const robotSwitch = state.switches.some((s) => { const u = state.guards.find((x) => x.id === s.target.id); return u && u.robot; });
  g.TOOLS.robot = true;   // restore
  ok(before > 0 && after === 0 && !robotSwitch, 'T8: TOOLS.robot off removes the robot + its switch');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F42 (robot) CHECKS PASSED');
process.exit(fails ? 1 : 0);
