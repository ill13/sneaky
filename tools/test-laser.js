// ============================================================
//  F40 - the laser: the industrial skin of the duty cycle. A stationary emitter
//  whose beam blinks live (LASER_ON) / dormant (LASER_OFF). Cross it while it's
//  dormant; touch the live beam and it trips the ALARM (not a hit). No switch -
//  its defense is pure timing. Driven through the real update()/doDistract paths.
//  Permanent test - keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// T1: a laser exists (when TOOLS.laser), is a machine, in the laser room,
// and cannot be knocked out.
{
  g.reset(42);
  const L = state.guards.find((x) => x.laser);
  ok(!!L, 'T1: a laser exists when TOOLS.laser is on');
  if (L) {
    ok(L.machine === true, 'T1: the laser is a machine (non-knockable / non-distractable)');
    ok(L.room[0] === g.LASER_ROOM[0] && L.room[1] === g.LASER_ROOM[1], 'T1: the laser is in its room (D)');
    ok(g.isKnockoutTarget(L) === false, 'T1: a laser cannot be knocked out');
  }
}

// T2: the duty cycle - live LASER_ON, dormant LASER_OFF (shared with the sleeper).
{
  g.reset(42); state.gameOver = false;
  const L = state.guards.find((x) => x.laser);
  state.player.invuln = 999;
  state.player.x = 112; state.player.y = 112;   // in room A, clear of the beam
  L.dutyT = 0; L.asleep = false;
  let a = -1;
  for (let i = 0; i < Math.ceil(g.LASER_ON * 60) + 12; i++) { g.update(1 / 60); if (L.asleep) { a = i + 1; break; } }
  ok(a > 0 && Math.abs(a / 60 - g.LASER_ON) < 0.2, `T2: live -> dormant at ~${g.LASER_ON}s (got ${(a / 60).toFixed(2)}s)`);
  let b = -1;
  for (let i = 0; i < Math.ceil(g.LASER_OFF * 60) + 12; i++) { g.update(1 / 60); if (!L.asleep) { b = i + 1; break; } }
  ok(b > 0 && Math.abs(b / 60 - g.LASER_OFF) < 0.2, `T2: dormant -> live at ~${g.LASER_OFF}s (got ${(b / 60).toFixed(2)}s)`);
}

// T3: the live beam trips the alarm (not a hit) when you cross it.
{
  g.reset(42); state.gameOver = false;
  const L = state.guards.find((x) => x.laser);
  L.dutyT = 0; L.asleep = false;   // beam live
  state.player.x = L.x + 100; state.player.y = L.y;   // on the beam line, midpoint
  state.player.invuln = 999;
  let alarmed = false;
  for (let i = 0; i < 5; i++) { g.update(1 / 60); if (state.alarmTime > 0) { alarmed = true; break; } }
  ok(alarmed && state.player.hits === 0, 'T3: the live beam trips the alarm, not a hit (hits stay 0)');
}

// T4: crossing a dormant beam is safe (no alarm).
{
  g.reset(42); state.gameOver = false;
  const L = state.guards.find((x) => x.laser);
  L.dutyT = 0; L.asleep = true;   // beam dormant
  state.player.x = L.x + 100; state.player.y = L.y;
  state.player.invuln = 999;
  let alarmed = false;
  for (let i = 0; i < 5; i++) { g.update(1 / 60); if (state.alarmTime > 0) { alarmed = true; break; } }
  ok(!alarmed, 'T4: crossing a dormant beam is safe (no alarm)');
}

// T5: the beam contact respects the segment (off the line is safe even when live).
{
  g.reset(42); state.gameOver = false;
  const L = state.guards.find((x) => x.laser);
  L.dutyT = 0; L.asleep = false;   // beam live
  state.player.x = L.x + 100; state.player.y = L.y + 50;   // 50px below the beam line
  state.player.invuln = 999;
  let alarmed = false;
  for (let i = 0; i < 5; i++) { g.update(1 / 60); if (state.alarmTime > 0) { alarmed = true; break; } }
  ok(!alarmed, 'T5: standing off the beam line is safe (contact is the segment, not the room)');
}

// T6: a distraction does not affect the laser (machines can't be lured).
{
  g.reset(42);
  const L = state.guards.find((x) => x.laser);
  const st = L.state;
  state.player.x = L.x - 20; state.player.y = L.y;
  g.doDistract();
  ok(L.state === st, 'T6: a distraction does not affect the laser');
}

// T7: the laser has no switch (its defense is pure timing, not the circuit).
{
  g.reset(42);
  const L = state.guards.find((x) => x.laser);
  const anyTarget = state.switches.some((s) => s.target.id === L.id);
  ok(!anyTarget, 'T7: the laser has no switch (you can only time it, not stop it)');
}

// T8: TOOLS.laser off removes the laser (the curation toggle).
{
  g.reset(42);
  const before = state.guards.filter((x) => x.laser).length;
  g.TOOLS.laser = false;
  g.reset(42);
  const after = state.guards.filter((x) => x.laser).length;
  g.TOOLS.laser = true;   // restore
  ok(before > 0 && after === 0, `T8: TOOLS.laser off removes the laser (${before} -> ${after})`);
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F40 (laser) CHECKS PASSED');
process.exit(fails ? 1 : 0);
