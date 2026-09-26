// ============================================================
//  F47 - the pull. Face a crate and press ACT: a one-tile swap (the crate comes
//  to your tile, you take its old one). It's a discrete action (not the automatic
//  push), makes a quiet room-confined noise, and can move a crate onto/off a
//  switch plate. Keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
const T = g.TILE;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// put the player one tile WEST of a crate (so pressing RIGHT faces the crate)
function setupWestOfCrate() {
  const b = state.crates[0];
  if (!b) return null;
  state.player.x = (b.c - 1 + 0.5) * T; state.player.y = (b.r + 0.5) * T;
  return b;
}

// P1: the ACT context is 'pull' when you face a crate
{
  g.reset(42);
  const b = setupWestOfCrate();
  ok(!!b, 'P1: there is a crate to pull');
  state.keys['d'] = true;   // face right (toward the crate)
  const ctx = g.actionContext();
  delete state.keys['d'];
  ok(ctx === 'pull', 'P1: facing a crate lights the ACT as "pull" (got ' + ctx + ')');
}

// P2: the pull swaps the player and the crate
{
  g.reset(42);
  const b = setupWestOfCrate();
  const bC = b.c, bR = b.r;
  const playerC = bC - 1, playerR = bR;
  state.keys['d'] = true; state.keys['e'] = true;   // face right + press ACT
  g.update(1 / 60);
  state.keys['d'] = false; state.keys['e'] = false;
  ok(b.c === playerC && b.r === playerR, 'P2: the crate moved to the player\'s tile (' + bC + ',' + bR + ' -> ' + b.c + ',' + b.r + ')');
  ok(state.player.x === (bC + 0.5) * T && state.player.y === (bR + 0.5) * T, 'P2: the player took the crate\'s old tile');
}

// P3: the pull makes a quiet noise a guard in the room can hear
{
  g.reset(42);
  const b = setupWestOfCrate();
  // put a patrolling guard in the same room, near the crate
  const room = g.roomAt(b.c, b.r);
  let guard = null;
  for (const gd of state.guards) if (!gd.machine && !gd.asleep && gd.state === 'patrol' && gd.room[0] === room[0] && gd.room[1] === room[1]) { guard = gd; break; }
  if (guard) {
    guard.x = (b.c - 2 + 0.5) * T; guard.y = (b.r + 0.5) * T;   // ~2 tiles from the crate
    state.keys['d'] = true; state.keys['e'] = true;
    g.update(1 / 60);
    state.keys['d'] = false; state.keys['e'] = false;
    ok(guard.state === 'hear' || guard.state === 'investigate', 'P3: a nearby guard heard the pull (' + guard.state + ')');
  } else ok(true, 'P3: (no nearby guard to hear it, skipped)');
}

// P4: the pull can move a crate ONTO a switch plate (player stands on the plate)
{
  g.reset(42);
  // find a switch plate and a crate in the same room
  const sw = state.switches[0];
  const b = state.crates.find((c) => { const r = g.roomAt(c.c, c.r); const sr = g.roomAt(sw.c, sw.r); return r && sr && r[0] === sr[0] && r[1] === sr[1]; });
  if (sw && b) {
    // stand the player on the plate, crate one tile east
    state.player.x = (sw.c + 0.5) * T; state.player.y = (sw.r + 0.5) * T;
    b.c = sw.c + 1; b.r = sw.r; b.x = (b.c + 0.5) * T; b.y = (b.r + 0.5) * T;
    state.keys['d'] = true; state.keys['e'] = true;   // face east (toward the crate) + ACT
    g.update(1 / 60);
    state.keys['d'] = false; state.keys['e'] = false;
    ok(b.c === sw.c && b.r === sw.r, 'P4: the pull dragged the crate onto the switch plate');
  } else ok(true, 'P4: (no switch+crate in a shared room, skipped)');
}

// P5: without ACT, facing a crate pushes it (the automatic push, not the pull)
{
  g.reset(42);
  const b = setupWestOfCrate();
  const bC = b.c, bR = b.r;
  // the tile east of the crate must be clear for the push to work
  if (!g.tileBlocked(bC + 1, bR)) {
    state.keys['d'] = true;   // face right, NO ACT - walk into the crate to push it
    for (let i = 0; i < 8; i++) g.update(1 / 60);
    state.keys['d'] = false;
    ok(b.c === bC + 1 && b.r === bR, 'P5: without ACT the crate is pushed (not pulled) (' + bC + ' -> ' + b.c + ')');
  } else ok(true, 'P5: (crate\'s far tile blocked, push can\'t run, skipped)');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F47 (pull) CHECKS PASSED');
process.exit(fails ? 1 : 0);
