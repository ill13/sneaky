// ============================================================
//  F45 - the reinforcement spike. An alarm pulls in a temporary extra guard
//  (capped by REINFORCE_MAX) that materializes at the room's doorway (nearest
//  the trigger) and converges on it. When the alarm clears (or its timer runs
//  out) it walks back out that same doorway and despawns. Keep green.
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

// trip the alarm and advance time until the reinforcement has spawned (it
// materializes REINFORCE_DELAY sec after the trip, not on the next frame).
function tripAndSpawn() {
  state.player.invuln = 999;   // no hits re-tripping the alarm mid-wait
  g.tripAlarm();
  for (let i = 0; i < 60 * (g.REINFORCE_DELAY + 2) && !state.guards.some((x) => x.reinforcement); i++) g.update(1 / 60);
}

// R1: an alarm spawns a reinforcement in the trigger room (after the delay beat)
{
  g.reset(42);
  const room = roomWithGuard();
  const stand = standIn(room);
  state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
  g.tripAlarm();
  ok(state.pendingReinforce === g.REINFORCE_DELAY, 'R1: tripAlarm queues a reinforcement (a ' + g.REINFORCE_DELAY + 's beat)');
  ok(!state.guards.some((x) => x.reinforcement), 'R1: nothing has spawned on the trip frame');
  tripAndSpawn();
  const reinf = state.guards.filter((x) => x.reinforcement);
  ok(state.pendingReinforce === 0, 'R1: the beat is consumed once it spawns');
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
  tripAndSpawn();
  g.tripAlarm(); tripAndSpawn();   // re-trip while the first is still up
  const reinf = state.guards.filter((x) => x.reinforcement);
  ok(reinf.length <= g.REINFORCE_MAX, 'R2: reinforcements are capped at ' + g.REINFORCE_MAX + ' (got ' + reinf.length + ')');
}

// R3: the reinforcement walks back out its door when the alarm clears
{
  g.reset(42);
  const room = roomWithGuard();
  const stand = standIn(room);
  state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
  state.player.invuln = 999;
  tripAndSpawn();
  const r = state.guards.find((x) => x.reinforcement);
  ok(r, 'R3: a reinforcement is present while hot');
  ok(r && r.entryDoor && g.roomAt(r.entryDoor[0], r.entryDoor[1]) && r.entryDoor, 'R3: it remembers the doorway it came in');
  state.alarmTime = 0;   // the coast clears
  g.update(1 / 60);
  ok(state.guards.some((x) => x.reinforcement && x.leaving), 'R3: it starts walking back out its door (not an instant vanish)');
  let present = true;
  for (let i = 0; i < 60 * 5; i++) {
    state.alarmTime = 0;   // keep it clear so only the walk-back ends it
    g.update(1 / 60);
    if (!state.guards.some((x) => x.reinforcement)) { present = false; break; }
  }
  ok(!present, 'R3: it despawns once it is back at the doorway');
}

// R4: with the alarm kept hot, the reinforcement peels off on its own timer
{
  g.reset(42);
  const room = roomWithGuard();
  const stand = standIn(room);
  state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
  state.player.invuln = 999;
  tripAndSpawn();
  const r = state.guards.find((x) => x.reinforcement);
  // keep the alarm hot so only the timer can end it; +6s covers the walk-back
  // out the door after the timer fires (it's not an instant vanish anymore)
  let present = true;
  for (let i = 0; i < 60 * (g.REINFORCE_TIME + 6); i++) {
    state.alarmTime = Math.max(state.alarmTime, 1);   // hold it hot
    g.update(1 / 60);
    if (!state.guards.some((x) => x.reinforcement)) { present = false; break; }
  }
  ok(!present, 'R4: the reinforcement peels off on its timer (once past ' + g.REINFORCE_TIME + 's + the walk-back)');
}

// R5: the reinforcement is a real guard - it can path and close on the player
{
  g.reset(42);
  const room = roomWithGuard();
  const stand = standIn(room);
  state.player.x = (stand[0] + 0.5) * T; state.player.y = (stand[1] + 0.5) * T;
  state.player.invuln = 999;
  tripAndSpawn();
  const r = state.guards.find((x) => x.reinforcement);
  const startD = Math.hypot(r.x - state.player.x, r.y - state.player.y);
  for (let i = 0; i < 60 * 2; i++) { state.alarmTime = Math.max(state.alarmTime, 1); g.update(1 / 60); }
  const endD = Math.hypot(r.x - state.player.x, r.y - state.player.y);
  ok(endD < startD, 'R5: the reinforcement closed on the player (' + startD.toFixed(0) + 'px -> ' + endD.toFixed(0) + 'px)');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F45 (reinforcements) CHECKS PASSED');
process.exit(fails ? 1 : 0);
