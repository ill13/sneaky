// ============================================================
//  F25 - distract: stand by a wall, make a noise, and guards in YOUR room
//  hear it - freeze + "!" + turn to the sound (hear), then walk to it
//  (investigate), sweep, and resume patrol. Room-confined sound, no global
//  alarm, and a guard locked on you keeps chasing. Permanent test - keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
const T = g.TILE;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// T1: a distraction makes an in-range same-room patrol guard HEAR it (freeze + "!" + turn)
for (const seed of [42, 7]) {
  g.reset(seed); state.gameOver = false;
  const gd = state.guards.find(x => x.state === 'patrol' && x.room && x.room[0] === 0 && x.room[1] === 0);
  ok(!!gd, `seed ${seed}: found a patrol guard in room A`);
  if (!gd) continue;
  gd.x = state.player.x + 30; gd.y = state.player.y;      // within DISTRACT_HEARING (160px)
  g.doDistract();
  ok(gd.state === 'hear', `seed ${seed}: an in-range guard hears the noise (freeze + "!" + turn to sound)`);
  ok(Math.abs(gd.hearT - g.HEAR_PAUSE) < 1e-6, `seed ${seed}: the guard froze for ${g.HEAR_PAUSE}s (hearT)`);
}

// T1b: once the pause is over and you're out of sight, the guard WALKS to the sound
{
  g.reset(42); state.gameOver = false;
  const gd = state.guards.find(x => x.state === 'patrol' && x.room && x.room[0] === 0 && x.room[1] === 0);
  if (!gd) ok(false, 'T1b: no patrol guard in room A');
  else {
    gd.x = state.player.x + 60; gd.y = state.player.y;
    g.doDistract();
    state.player.x = (20 + 0.5) * T; state.player.y = (5 + 0.5) * T;   // hidden: room (1,0), guard can't see it
    let walked = false;
    for (let i = 0; i < 90; i++) { g.update(1 / 60); if (gd.state === 'investigate') { walked = true; break; } }
    ok(walked, 'T1b: after the pause the guard walks to the noise (investigate)');
  }
}

// T2: a guard across the door (a different room) is NOT lured - sound is room-confined
{
  g.reset(42); state.gameOver = false;
  const other = state.guards.find(x => x.room && !(x.room[0] === 0 && x.room[1] === 0) && (x.state === 'patrol' || x.state === 'search'));
  ok(!!other, 'T2: found a guard outside room A');
  if (other) { g.doDistract(); ok(!(other.state === 'hear' || other.state === 'investigate'), 'T2: a guard across the door is NOT lured (room-confined sound)'); }
}

// T3: a guard that's chasing you keeps its lock-on (a distraction can't break it)
{
  g.reset(42); state.gameOver = false;
  const ch = state.guards.find(x => x.room && x.room[0] === 0 && x.room[1] === 0);
  if (ch) { ch.state = 'chase'; g.doDistract(); ok(ch.state === 'chase', 'T3: a chasing guard keeps its lock-on (not lured)'); }
  else ok(false, 'T3: no guard in room A');
}

// T4: a distraction sets the cooldown
{
  g.reset(42); state.gameOver = false;
  g.doDistract();
  ok(Math.abs(state.distractCd - g.DISTRACT_COOLDOWN) < 1e-6, `T4: distraction sets a ${g.DISTRACT_COOLDOWN}s cooldown (got ${state.distractCd})`);
}

// T5: full cycle - hear -> investigate -> sweep -> patrol (no freeze), player hidden
{
  g.reset(42); state.gameOver = false;
  const gd = state.guards.find(x => x.state === 'patrol' && x.room && x.room[0] === 0 && x.room[1] === 0);
  if (!gd) { ok(false, 'T5: no patrol guard in room A'); }
  else {
    gd.x = state.player.x + 60; gd.y = state.player.y;
    g.doDistract();
    ok(gd.state === 'hear', 'T5: the guard first HEARS the noise (freeze)');
    state.player.x = (20 + 0.5) * T; state.player.y = (5 + 0.5) * T;   // hidden
    let heard = false, investigated = false, resumed = false;
    for (let i = 0; i < 420; i++) {
      g.update(1 / 60);
      if (gd.state === 'hear') heard = true;
      if (gd.state === 'investigate') investigated = true;
      if (gd.state === 'patrol') { resumed = true; break; }
    }
    ok(heard && investigated && resumed, `T5: hear -> investigate -> patrol, no freeze (heard=${heard} investigated=${investigated} resumed=${resumed})`);
  }
}

// T6: on hearing, the guard turns to face the sound it heard
{
  g.reset(42); state.gameOver = false;
  const gd = state.guards.find(x => x.state === 'patrol' && x.room && x.room[0] === 0 && x.room[1] === 0);
  if (gd) {
    const px = state.player.x, py = state.player.y;
    gd.x = px - 50; gd.y = py; gd.facing = Math.PI / 2;   // guard west of the player, facing south (away from the sound to the east)
    g.doDistract();
    ok(gd.state === 'hear', 'T6: guard enters the hear (freeze) state');
    state.player.x = (20 + 0.5) * T; state.player.y = (5 + 0.5) * T;   // hide so it walks, not chases
    for (let i = 0; i < 40; i++) g.update(1 / 60);   // run through the freeze-and-turn
    const da = Math.abs(Math.atan2(Math.sin(0 - gd.facing), Math.cos(0 - gd.facing)));
    ok(da < 0.5, `T6: the guard turned toward the sound (facing ${gd.facing.toFixed(2)} rad, target ~0/east)`);
  } else ok(false, 'T6: no patrol guard in room A');
}

// ============================================================
//  F32 - direction-aware distract: the noise is the wall you're pressing
//  toward. Near a wall but facing elsewhere = no trigger, no lit button.
// ============================================================

// A spot in room A: on floor, inside the top-wall band (facing up triggers),
// with no wall in the right-facing band (facing right must NOT trigger).
function wallSpot() {
  for (let c = 2; c <= 8; c++) {
    const px = (c + 0.5) * T, py = (1 + 0.5) * T;
    if (g.solid(c, 1, state.map)) continue;
    if (!g.canDistract(px, py, 0, -1)) continue;
    if (g.canDistract(px, py, 1, 0)) continue;
    return [px, py];
  }
  return null;
}
function setupWallSpot() {
  g.reset(42); state.gameOver = false;
  const spot = wallSpot();
  if (!spot) return null;
  for (const q of state.guards) if (q.room && q.room[0] === 0 && q.room[1] === 0) { q.x = 15.5 * T; q.y = 9.5 * T; }
  state.player.x = spot[0]; state.player.y = spot[1];
  return spot;
}

// T7: near the wall + pressing toward it -> the ACT context IS distract
{
  if (!setupWallSpot()) ok(false, 'T7: no wall spot');
  else {
    state.keys['w'] = true;
    ok(g.actionContext() === 'distract', 'T7: facing the wall, the ACT button reads distract (it will light)');
    delete state.keys['w'];
  }
}

// T8: near the wall + pressing parallel to it -> NOT distract
{
  if (!setupWallSpot()) ok(false, 'T8: no wall spot');
  else {
    state.keys['d'] = true;
    ok(g.actionContext() !== 'distract', `T8: facing along the wall, the ACT button is NOT distract (context=${g.actionContext()})`);
    delete state.keys['d'];
  }
}

// T9: near the wall + standing still -> NOT distract (no direction held)
{
  if (!setupWallSpot()) ok(false, 'T9: no wall spot');
  else ok(g.actionContext() !== 'distract', 'T9: standing still by the wall, no trigger');
}

// T10: the full input path - a real E press only fires the noise when you are
//      pressing toward the wall (the accidental case is dead)
{
  if (setupWallSpot()) {
    state.keys['w'] = true; state.keys['e'] = true;
    g.update(1 / 60);
    state.keys['e'] = false;
    ok(state.distractCd > 0 && !!state.distractFx, 'T10: pressing toward the wall + ACT -> the noise fires');
  }
  if (setupWallSpot()) {
    state.keys['d'] = true; state.keys['e'] = true;
    g.update(1 / 60);
    state.keys['d'] = false; state.keys['e'] = false;
    ok(state.distractCd === 0 && !state.distractFx, 'T10: pressing parallel + ACT -> no noise');
  }
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F25 DISTRACT CHECKS PASSED');
process.exit(fails ? 1 : 0);
