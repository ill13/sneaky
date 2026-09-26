// ============================================================
//  F45 - the alarm lockdown (converge). Tripping the alarm sends every awake
//  mobile guard in the trigger room to the trigger tile, where they sweep.
//  Machines don't converge; other rooms don't; a guard already chasing is left
//  alone; and after the sweep they resume patrol. Keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
const T = g.TILE;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// find a room that has at least one awake mobile guard, return [rc, rr]
function roomWithGuard() {
  const counts = {};
  for (const gd of state.guards) {
    if (gd.machine) continue;
    if (gd.state === 'down' || gd.state === 'hidden' || gd.state === 'dazed') continue;
    const k = gd.room[0] + ',' + gd.room[1];
    counts[k] = (counts[k] || 0) + 1;
  }
  for (const k of Object.keys(counts)) if (counts[k] >= 1) return k.split(',').map(Number);
  return null;
}

g.reset(42);
const [rc, rr] = roomWithGuard();
const room = [rc, rr];
// a floor tile in that room to stand on (the room origin + 2,2 is usually floor)
const [ox, oy] = [1 + rc * 17, 1 + rr * 11];
let stand = [ox + 2, oy + 2];
// walk to a floor tile in the room if the first guess is solid
outer: for (let r = oy + 1; r < oy + 10; r++) for (let c = ox + 1; c < ox + 16; c++) if (state.map[r][c] === 0) { stand = [c, r]; break outer; }
state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;

// C1: tripping the alarm converges the room's awake mobile guards onto the trigger tile
{
  g.tripAlarm();
  ok(state.alarmTime > 0, 'C1: the alarm is hot');
  ok(state.alarmPos && state.alarmPos[0] === stand[0] && state.alarmPos[1] === stand[1], 'C1: the alarm position is the trigger tile');
  let converged = 0, should = 0;
  for (const gd of state.guards) {
    if (gd.machine) continue;
    if (gd.state === 'down' || gd.state === 'hidden' || gd.state === 'dazed') continue;
    const inRoom = gd.room[0] === rc && gd.room[1] === rr;
    if (inRoom && gd.state !== 'chase') {
      should++;
      if (gd.state === 'investigate' && gd.targetTile && gd.targetTile[0] === stand[0] && gd.targetTile[1] === stand[1]) converged++;
    }
  }
  ok(should > 0, 'C1: the room has convergable guards (' + should + ')');
  ok(converged === should, 'C1: all ' + should + ' awake mobile guards in the room converge on the trigger tile');
}

// C2: guards in other rooms do NOT converge
{
  // reset and trip again, then check a guard outside the room is still patrolling
  g.reset(42);
  state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
  g.tripAlarm();
  let outsideUntouched = true;
  for (const gd of state.guards) {
    if (gd.machine) continue;
    if (gd.state === 'down' || gd.state === 'hidden' || gd.state === 'dazed') continue;
    const inRoom = gd.room[0] === rc && gd.room[1] === rr;
    if (!inRoom && gd.state === 'investigate') { outsideUntouched = false; break; }
  }
  ok(outsideUntouched, 'C2: guards in other rooms are untouched (no cross-room converge)');
}

// C3: machines never converge
{
  g.reset(42);
  state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
  g.tripAlarm();
  let machinesUntouched = true;
  for (const gd of state.guards) if (gd.machine && gd.state === 'investigate') { machinesUntouched = false; break; }
  ok(machinesUntouched, 'C3: machines (camera/laser/robot) never converge');
}

// C4: a guard already chasing is not re-targeted by the converge
{
  g.reset(42);
  // put a mobile guard in the room into chase, pointing at a far tile
  let chaser = null;
  for (const gd of state.guards) {
    if (!gd.machine && gd.state !== 'down' && gd.room[0] === rc && gd.room[1] === rr) { chaser = gd; break; }
  }
  if (chaser) {
    chaser.state = 'chase';
    chaser.targetTile = [ox + 8, oy + 8];
    chaser.pathTiles = [chaser.targetTile];
    state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
    g.tripAlarm();
    ok(chaser.state === 'chase' && chaser.targetTile[0] === ox + 8, 'C4: a guard already chasing keeps its chase target (not re-converged)');
  } else ok(true, 'C4: (no chaser available, skipped)');
}

// C5: a converging guard physically moves toward the trigger tile over frames
{
  g.reset(42);
  state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
  g.tripAlarm();
  const conv = state.guards.find((gd) => !gd.machine && gd.room[0] === rc && gd.room[1] === rr && gd.state === 'investigate');
  if (conv) {
    const startD = Math.hypot(conv.x - (stand[0] + 0.5) * T, conv.y - (stand[1] + 0.5) * T);
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    const endD = Math.hypot(conv.x - (stand[0] + 0.5) * T, conv.y - (stand[1] + 0.5) * T);
    ok(endD < startD, 'C5: the converging guard closed on the trigger tile (' + startD.toFixed(0) + 'px -> ' + endD.toFixed(0) + 'px)');
  } else ok(false, 'C5: no converging guard to measure');
}

// C6: after the sweep, the guard resumes patrol
{
  g.reset(42);
  state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
  state.player.invuln = 999;   // survive the converge so we can watch the sweep expire
  g.tripAlarm();
  const conv = state.guards.find((gd) => !gd.machine && gd.room[0] === rc && gd.room[1] === rr && gd.state === 'investigate');
  if (conv) {
    // run past the converge sweep + a margin
    for (let i = 0; i < 60 * (g.CONVERGE_TIME + 4); i++) g.update(1 / 60);
    ok(conv.state === 'patrol' || conv.state === 'chase', 'C6: after the sweep the guard is back to patrol/chase (was ' + conv.state + ')');
  } else ok(false, 'C6: no converging guard to watch');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F45 (alarm converge) CHECKS PASSED');
process.exit(fails ? 1 : 0);
