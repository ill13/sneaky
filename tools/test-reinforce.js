// ============================================================
//  F45 - the reinforcement spike. An alarm pulls in a temporary extra guard
//  (capped by REINFORCE_MAX) that enters from the far side of the room and
//  converges on the trigger. It peels off when the alarm clears or its timer
//  runs out. Keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
const T = g.TILE;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

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

function standIn(room) {
  const [ox, oy] = [1 + room[0] * 17, 1 + room[1] * 11];
  outer: for (let r = oy + 1; r < oy + 10; r++) for (let c = ox + 1; c < ox + 16; c++) if (state.map[r][c] === 0) return [c, r];
  return [ox + 2, oy + 2];
}

// R1: an alarm spawns a reinforcement in the trigger room (after one frame)
{
  g.reset(42);
  const room = roomWithGuard();
  const stand = standIn(room);
  state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
  const before = state.guards.length;
  g.tripAlarm();
  ok(state.pendingReinforce === true, 'R1: tripAlarm queues a reinforcement');
  g.update(1 / 60);   // the spawn happens at the top of update
  const reinf = state.guards.filter((x) => x.reinforcement);
  ok(state.pendingReinforce === false, 'R1: the queue is consumed after the frame');
  ok(reinf.length === 1, 'R1: exactly one reinforcement spawned (got ' + reinf.length + ')');
  const r = reinf[0];
  ok(r && r.room[0] === room[0] && r.room[1] === room[1], 'R1: the reinforcement is in the trigger room');
  ok(r && r.state === 'investigate' && r.targetTile && r.targetTile[0] === stand[0] && r.targetTile[1] === stand[1], 'R1: the reinforcement converges on the trigger tile');
}

// R2: the cap holds - a second alarm does not stack more than REINFORCE_MAX
{
  g.reset(42);
  const room = roomWithGuard();
  const stand = standIn(room);
  state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
  g.tripAlarm(); g.update(1 / 60);
  g.tripAlarm(); g.update(1 / 60);   // re-trip while the first is still up
  const reinf = state.guards.filter((x) => x.reinforcement);
  ok(reinf.length <= g.REINFORCE_MAX, 'R2: reinforcements are capped at ' + g.REINFORCE_MAX + ' (got ' + reinf.length + ')');
}

// R3: the reinforcement despawns the moment the alarm clears
{
  g.reset(42);
  const room = roomWithGuard();
  const stand = standIn(room);
  state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
  state.player.invuln = 999;
  g.tripAlarm(); g.update(1 / 60);
  ok(state.guards.some((x) => x.reinforcement), 'R3: a reinforcement is present while hot');
  state.alarmTime = 0;   // the coast clears
  g.update(1 / 60);
  ok(!state.guards.some((x) => x.reinforcement), 'R3: the reinforcement peels off the moment the alarm clears');
}

// R4: with the alarm kept hot, the reinforcement peels off on its own timer
{
  g.reset(42);
  const room = roomWithGuard();
  const stand = standIn(room);
  state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
  state.player.invuln = 999;
  g.tripAlarm(); g.update(1 / 60);
  const r = state.guards.find((x) => x.reinforcement);
  // keep the alarm hot so only the timer can end it
  let present = true;
  for (let i = 0; i < 60 * (g.REINFORCE_TIME + 2); i++) {
    state.alarmTime = Math.max(state.alarmTime, 1);   // hold it hot
    g.update(1 / 60);
    if (!state.guards.some((x) => x.reinforcement)) { present = false; break; }
  }
  ok(!present, 'R4: the reinforcement peels off on its timer once past ' + g.REINFORCE_TIME + 's');
}

// R5: the reinforcement is a real guard - it can path and close on the player
{
  g.reset(42);
  const room = roomWithGuard();
  const stand = standIn(room);
  state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
  state.player.invuln = 999;
  g.tripAlarm(); g.update(1 / 60);
  const r = state.guards.find((x) => x.reinforcement);
  const startD = Math.hypot(r.x - state.player.x, r.y - state.player.y);
  for (let i = 0; i < 60 * 2; i++) { state.alarmTime = Math.max(state.alarmTime, 1); g.update(1 / 60); }
  const endD = Math.hypot(r.x - state.player.x, r.y - state.player.y);
  ok(endD < startD, 'R5: the reinforcement closed on the player (' + startD.toFixed(0) + 'px -> ' + endD.toFixed(0) + 'px)');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F45 (reinforcements) CHECKS PASSED');
process.exit(fails ? 1 : 0);
