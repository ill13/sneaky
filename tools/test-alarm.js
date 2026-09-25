// ============================================================
//  F31 - the alarm, made real:
//    1. while hot, patrol/investigate movement is faster (x1.15)
//    2. while hot, a guard that loses you keeps hunting longer
//       (search time x1.75) - "they stop giving up"
//    3. the blue key no longer sits in the spawn room (it's in the
//       F dead end, a real detour before you can open the exit door)
//  Permanent test - keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// T0: the multipliers are the tuned values
{
  ok(g.ALARM_PATROL_SPEED_MULT === 1.15, `T0: ALARM_PATROL_SPEED_MULT is 1.15 (got ${g.ALARM_PATROL_SPEED_MULT})`);
  ok(g.ALARM_SEARCH_MULT === 1.75, `T0: ALARM_SEARCH_MULT is 1.75 (got ${g.ALARM_SEARCH_MULT})`);
}

// Force a guard from 'chase' into 'search' (it "arrives" with an empty path and
// can't see you because you're in a wall-separated room) and return the searchT
// it was given.
function searchTimeAfter(alarmSec) {
  g.reset(42); state.gameOver = false;
  const G = state.guards.find(x => x.state === 'patrol' && !x.post);
  if (!G) return null;
  const [rc, rr] = G.room;
  const orc = (rc + 1) % 3;                          // a different, wall-separated room
  state.player.x = (1 + orc * 17 + 7 + 0.5) * g.TILE;
  state.player.y = (1 + rr * 11 + 5 + 0.5) * g.TILE;
  G.state = 'chase'; G.pathTiles = []; G.targetTile = null; G.seenFor = 99;
  state.alarmTime = alarmSec;
  g.update(1 / 60);
  return G.state === 'search' ? G.searchT : null;
}

// T1: the search a guard enters is longer while the alarm is hot
{
  const tHot = searchTimeAfter(5);
  const tCold = searchTimeAfter(0);
  ok(tHot !== null && tCold !== null, 'T1: guard entered search in both the hot and cold cases');
  const wantHot = g.SEARCH_TIME * g.ALARM_SEARCH_MULT;
  ok(tHot !== null && Math.abs(tHot - wantHot) < 0.01, `T1: hot search = ${g.SEARCH_TIME}x${g.ALARM_SEARCH_MULT} = ${wantHot.toFixed(2)}s (got ${tHot !== null ? tHot.toFixed(2) : 'n/a'})`);
  ok(tCold !== null && Math.abs(tCold - g.SEARCH_TIME) < 0.01, `T1: cold search = ${g.SEARCH_TIME}s (got ${tCold !== null ? tCold.toFixed(2) : 'n/a'})`);
}

// T2: while hot, a patrol guard covers more ground in the same time
{
  function patrolDistance(alarmSec, frames) {
    g.reset(42); state.gameOver = false;
    const G = state.guards.find(x => x.state === 'patrol' && !x.post);
    if (!G) return null;
    G.pause = 0;
    const x0 = G.x, y0 = G.y;
    state.alarmTime = alarmSec;
    for (let i = 0; i < frames; i++) { g.update(1 / 60); if (G.state !== 'patrol') break; }
    return Math.hypot(G.x - x0, G.y - y0);
  }
  const hot = patrolDistance(5, 180);
  const cold = patrolDistance(0, 180);
  ok(hot !== null && cold !== null, 'T2: measured patrol movement in both cases');
  const ratio = hot !== null && cold > 0 ? hot / cold : 0;
  ok(hot !== null && hot > cold && ratio > 1.02 && ratio < 1.40, `T2: hot patrol is faster (${hot.toFixed(1)}px vs ${cold.toFixed(1)}px, x${ratio.toFixed(2)})`);
}

// T3: the blue key is in the F dead end, not the spawn room
{
  g.reset(42);
  const ct = state.containers.find((c) => c.contents.some((i) => i.role === 'key' && i.id === 'blue'));
  const kr = [ct.rc, ct.rr];
  ok(kr[0] === 2 && kr[1] === 1, `T3: blue key container is in room F [2,1] (got [${kr[0]},${kr[1]}])`);
  ok(!(kr[0] === 0 && kr[1] === 0), 'T3: the blue key is NOT in the spawn room A');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F31 ALARM CHECKS PASSED');
process.exit(fails ? 1 : 0);
