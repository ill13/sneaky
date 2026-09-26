// ============================================================
//  F46 - the hit pool + health items. A hit costs 1 hp + raises the alarm +
//  staggers you (no movement for a beat); at 0 you're caught. Health items top
//  you back up 1, capped at max. 1-2 per run. Keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// H1: the player starts with the full hit pool
{
  g.reset(42);
  ok(state.player.hp === g.PLAYER_HP_START, 'H1: the player starts at ' + g.PLAYER_HP_START + ' hp (got ' + state.player.hp + ')');
  ok(state.player.stagger === 0, 'H1: no stagger at the start');
}

// H2: a non-lethal hit costs 1 hp, raises the alarm, and staggers you
{
  g.reset(42);
  state.player.invuln = 0;
  g.hitPlayer();
  ok(state.player.hp === g.PLAYER_HP_START - 1, 'H2: a hit costs 1 hp (now ' + state.player.hp + ')');
  ok(state.alarmTime > 0, 'H2: a non-lethal hit raises the alarm');
  ok(state.player.stagger > 0, 'H2: a non-lethal hit staggers you');
  ok(!state.gameOver, 'H2: one hit is not death');
}

// H3: at 0 hp you are caught
{
  g.reset(42);
  state.player.invuln = 0; g.hitPlayer();      // hp 2 -> 1
  state.player.invuln = 0; g.hitPlayer();      // hp 1 -> 0
  ok(state.player.hp <= 0, 'H3: hp is drained to 0');
  ok(state.gameOver === true, 'H3: at 0 hp you are caught');
}

// H4: a health item tops you up 1, capped at max
{
  g.reset(42);
  state.player.invuln = 0; g.hitPlayer();      // hp 2 -> 1
  g.grantItem({ role: 'health', id: 'h0' });
  ok(state.player.hp === g.PLAYER_HP_START, 'H4: a health item restores 1 hp (back to ' + state.player.hp + ')');
  g.grantItem({ role: 'health', id: 'h1' });
  ok(state.player.hp === g.PLAYER_HP_MAX, 'H4: a second item tops you to the max (' + g.PLAYER_HP_MAX + ')');
  g.grantItem({ role: 'health', id: 'h2' });
  ok(state.player.hp === g.PLAYER_HP_MAX, 'H4: hp is capped at the max (still ' + state.player.hp + ')');
}

// H5: the stagger blocks movement
{
  g.reset(42);
  state.player.invuln = 0; g.hitPlayer();      // staggered
  ok(state.player.stagger > 0, 'H5: you are staggered after a hit');
  const x0 = state.player.x;
  state.keys['d'] = true;                       // hold right
  for (let i = 0; i < 10; i++) g.update(1 / 60);
  const moved = Math.abs(state.player.x - x0);
  state.keys['d'] = false;
  ok(moved < 2, 'H5: you cannot move while staggered (moved ' + moved.toFixed(2) + 'px)');
}

// H6: the stagger expires and you can move again
{
  g.reset(42);
  state.player.invuln = 0; g.hitPlayer();
  for (let i = 0; i < Math.ceil(g.HIT_STAGGER * 60) + 10; i++) g.update(1 / 60);
  ok(state.player.stagger <= 0, 'H6: the stagger expires');
  const x0 = state.player.x;
  state.keys['d'] = true;
  for (let i = 0; i < 10; i++) g.update(1 / 60);
  state.keys['d'] = false;
  ok(Math.abs(state.player.x - x0) > 2, 'H6: you can move again after the stagger');
}

// H7: each run has 1-2 health items in its containers
{
  for (const seed of [42, 7, 99999, 123456, 300]) {
    const L = g.generateLayout(seed);
    let healths = 0;
    for (const ct of L.containers) if (ct.contents && ct.contents.some((x) => x.role === 'health')) healths++;
    ok(healths >= 1 && healths <= 2, 'H7: seed ' + seed + ' has ' + healths + ' health item(s)');
  }
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F46 (hit pool + health) CHECKS PASSED');
process.exit(fails ? 1 : 0);
