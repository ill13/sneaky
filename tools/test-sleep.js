// ============================================================
//  F38 - the sleeping guard: the first face of the shared "duty cycle"
//  timing flag. A sleeper is a normal guard that dozes on its patrol round
//  (SLEEP_ON awake / SLEEP_OFF asleep), blind + stationary while down.
//  Driven through the real update() loop (not direct function calls).
//  Permanent test - keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// A sleeper in a room OTHER than the spawn room (A), so a player parked at
// spawn can't be spotted (room-confined sight) and it never leaves patrol.
const findSleeper = () => state.guards.find(x => x.type === 'sleeper' && !x.post && !(x.room[0] === 0 && x.room[1] === 0));
const parkFar = () => { state.player.x = 112; state.player.y = 112; state.player.invuln = 999; };

// T1: exactly the stride-rule guards are sleepers, and none overlap the posts
{
  g.reset(42);
  const sleepers = state.guards.filter(x => x.type === 'sleeper');
  const expected = state.guards.filter((x) => !x.machine).map((x, i) => !x.post && i % g.SLEEP_STRIDE === g.SLEEP_OFFSET).filter(Boolean).length;
  ok(sleepers.length === expected && expected > 0, `T1: ${expected} sleepers by the stride rule (got ${sleepers.length})`);
  ok(sleepers.every(x => !x.post), 'T1: no sleeper is also a post guard');
}

// T2: the duty cycle flips on schedule - awake SLEEP_ON, asleep SLEEP_OFF
{
  g.reset(42); state.gameOver = false;
  const S = findSleeper();
  ok(!!S, 'T2: found a sleeper');
  if (S) {
    parkFar();
    S.state = 'patrol'; S.asleep = false; S.dutyT = 0;
    let a = -1;
    for (let i = 0; i < Math.ceil(g.SLEEP_ON * 60) + 12; i++) { g.update(1 / 60); if (S.asleep) { a = i + 1; break; } }
    ok(a > 0 && Math.abs(a / 60 - g.SLEEP_ON) < 0.2, `T2: awake -> asleep at ~${g.SLEEP_ON}s (got ${(a / 60).toFixed(2)}s)`);
    let b = -1;
    for (let i = 0; i < Math.ceil(g.SLEEP_OFF * 60) + 12; i++) { g.update(1 / 60); if (!S.asleep) { b = i + 1; break; } }
    ok(b > 0 && Math.abs(b / 60 - g.SLEEP_OFF) < 0.2, `T2: asleep -> awake at ~${g.SLEEP_OFF}s (got ${(b / 60).toFixed(2)}s)`);
  }
}

// T3: the same player, in the same spot, is seen when awake and blind to when asleep
{
  g.reset(42);
  const S = findSleeper();
  if (S) {
    S.state = 'patrol'; S.facing = 0;          // face east
    state.player.x = S.x + 40; state.player.y = S.y;   // 40px east, inside the 72-deg cone
    S.asleep = false;
    const awake = g.canSee(S, g.PATROL_FOV, g.VISION_RANGE);
    S.asleep = true;
    const asleep = g.canSee(S, g.PATROL_FOV, g.VISION_RANGE);
    ok(awake === true && asleep === false, `T3: same player - seen awake (${awake}), blind asleep (${asleep})`);
  } else ok(false, 'T3: no sleeper');
}

// T4: a dozing guard is stationary and stays blind across real frames
{
  g.reset(42); state.gameOver = false;
  const S = findSleeper();
  if (S) {
    S.state = 'patrol'; S.asleep = true; S.dutyT = 0;
    state.player.x = S.x + Math.cos(S.facing) * 40; state.player.y = S.y + Math.sin(S.facing) * 40;
    const x0 = S.x, y0 = S.y;
    let saw = false;
    for (let i = 0; i < 30; i++) { g.update(1 / 60); if (g.canSee(S, g.PATROL_FOV, g.VISION_RANGE)) saw = true; }
    ok(!saw, 'T4: a dozing guard never spots the player across 0.5s of frames');
    ok(Math.hypot(S.x - x0, S.y - y0) < 1, `T4: a dozing guard is stationary (${Math.hypot(S.x - x0, S.y - y0).toFixed(2)}px drift)`);
  } else ok(false, 'T4: no sleeper');
}

// T5: a normal guard never dozes (the duty flag is a no-op for it)
{
  g.reset(42); state.gameOver = false;
  const N = state.guards.find(x => x.type === 'guard' && !x.post);
  ok(!!N, 'T5: found a normal guard');
  if (N) {
    parkFar();
    for (let i = 0; i < 300; i++) g.update(1 / 60);   // 5s, longer than a full duty cycle
    ok(N.asleep === false, 'T5: a normal guard never dozes');
  }
}

// T6: a dozing guard is a valid knockout target (rear arc, in range)
{
  g.reset(42);
  const S = findSleeper();
  if (S) {
    S.state = 'patrol'; S.asleep = true; S.facing = 0;   // face east
    state.player.x = S.x - 20; state.player.y = S.y;      // 20px directly behind, within KO_DIST
    ok(g.isKnockoutTarget(S) === true, 'T6: a dozing guard can be knocked out from behind');
  } else ok(false, 'T6: no sleeper');
}

// T7: a chasing guard never dozes (the duty timer is paused out of patrol)
{
  g.reset(42); state.gameOver = false;
  const S = findSleeper();
  if (S) {
    S.state = 'chase'; S.asleep = false; S.dutyT = 0; S.facing = 0;
    state.player.x = S.x + 40; state.player.y = S.y; state.player.invuln = 999;   // it stays on you
    for (let i = 0; i < 300; i++) g.update(1 / 60);   // 5s
    ok(S.asleep === false, 'T7: a chasing guard never dozes (duty paused out of patrol)');
  } else ok(false, 'T7: no sleeper');
}

// T8: the TOOLS.sleep toggle gates the sleepers (the curation switch)
{
  g.reset(42);
  const before = state.guards.filter(x => x.type === 'sleeper').length;
  g.TOOLS.sleep = false;
  g.reset(42);
  const after = state.guards.filter(x => x.type === 'sleeper').length;
  g.TOOLS.sleep = true;   // restore
  ok(before > 0 && after === 0, `T8: TOOLS.sleep off removes the sleepers (${before} -> ${after})`);
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F38 (sleep) CHECKS PASSED');
process.exit(fails ? 1 : 0);
