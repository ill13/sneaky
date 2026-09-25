// ============================================================
//  F23 - body dragging: grab a downed guard, carry it (slowed, room-bound),
//  hide it in a bin (inert forever), or drop it (wakes on its own timer).
//  Permanent test - keep this green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
const T = g.TILE;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// one rising edge of the action key (E), then clear it
function pressAction() {
  state.keys['e'] = true; g.update(1 / 60);
  state.keys['e'] = false; g.update(1 / 60);
}
function clearKeys() { for (const k in state.keys) delete state.keys[k]; }
// put a downed body exactly at the player's feet, in the player's room
function downBodyHere() {
  const pr = g.roomAt(Math.floor(state.player.x / T), Math.floor(state.player.y / T));
  const gd = state.guards.find(x => pr && x.room[0] === pr[0] && x.room[1] === pr[1] &&
    (x.state === 'patrol' || x.state === 'chase' || x.state === 'search')) || state.guards[0];
  gd.state = 'down'; gd.ko = g.KO_TIME; gd.x = state.player.x; gd.y = state.player.y;
  return gd;
}

// ---- T1: grab a downed body ----
g.reset(42); state.gameOver = false;
let body = downBodyHere();
ok(!state.carrying, 'T1: nothing carried at reset');
pressAction();
ok(state.carrying === body, 'T1: E next to a downed body grabs it');
ok(body.state === 'down', 'T1: a carried body stays down (you are holding it)');

// ---- T2: carrying slows the player ----
function dispRight(frames) {
  clearKeys();
  const x0 = state.player.x;
  for (let i = 0; i < frames; i++) { state.keys['d'] = true; g.update(1 / 60); }
  delete state.keys['d']; g.update(1 / 60);
  return state.player.x - x0;
}
{
  // room E (1,1). F33: furniture is procedural, so find a clear 4-tile rightward
  // run to measure speed on rather than assuming a fixed spot is floor.
  const origin = [1 + 1 * 17, 1 + 1 * 11];
  g.reset(42); state.gameOver = false; clearKeys();
  const mm = state.map;
  let spot = null;
  outer: for (let lr = 1; lr < 9; lr++) for (let lc = 1; lc < 12; lc++) {
    for (let d = 0; d < 4; d++) if (mm[origin[1] + lr][origin[0] + lc + d] !== 0) continue outer;
    spot = [ (origin[0] + lc + 0.5) * T, (origin[1] + lr + 0.5) * T ]; break outer;
  }
  ok(spot !== null, 'T2: found a clear run in room E to measure on');
  state.player.x = spot[0]; state.player.y = spot[1];
  g.update(1 / 60);
  const free = dispRight(12);
  // now carry a room-E body and repeat the same move
  const eb = state.guards.find(x => x.room[0] === 1 && x.room[1] === 1);
  eb.state = 'down'; eb.ko = g.KO_TIME; eb.x = state.player.x; eb.y = state.player.y;
  state.carrying = eb; clearKeys();
  state.player.x = spot[0]; state.player.y = spot[1];
  g.update(1 / 60);
  const carry = dispRight(12);
  const ratio = free > 0 ? carry / free : 1;
  ok(carry < free && Math.abs(ratio - g.CARRY_SPEED_MULT) < 0.12,
    `T2: carrying slows you (free ${free.toFixed(1)}px, carry ${carry.toFixed(1)}px, ratio ${ratio.toFixed(2)} vs ${g.CARRY_SPEED_MULT})`);
}

// ---- T3: hide the body in a bin -> inert forever ----
g.reset(42); state.gameOver = false; clearKeys();
body = downBodyHere();
pressAction();
const spotA = state.hideSpots.find(s => { const rm = g.roomAt(s.c, s.r); return rm && rm[0] === 0 && rm[1] === 0; });
ok(!!spotA, 'T3: the spawn room has a hide spot');
state.player.x = spotA.x; state.player.y = spotA.y; g.update(1 / 60);   // walk body to the bin
pressAction();                                                          // hide it
ok(state.carrying === null, 'T3: hiding releases the carry');
ok(body.state === 'hidden', 'T3: the body becomes hidden');
ok(spotA.occupied && spotA.body === body, 'T3: the bin is now occupied by the body');
for (let i = 0; i < 300; i++) g.update(1 / 60);
ok(body.state === 'hidden', 'T3: a hidden body never wakes (300 frames)');

// ---- T4: drop the body (no bin) -> it wakes on its own timer ----
g.reset(42); state.gameOver = false; clearKeys();
body = downBodyHere();
pressAction();
state.player.x += 60; state.player.y += 60;   // step off before dropping
pressAction();
ok(state.carrying === null, 'T4: dropping releases the carry');
ok(body.state === 'down', 'T4: a dropped body stays down (on its KO timer)');
let woke = false;
for (let i = 0; i < (g.KO_TIME + 2) * 60 && !woke; i++) { g.update(1 / 60); if (body.state !== 'down') woke = true; }
ok(woke, 'T4: a dropped body wakes on its own timer');

// ---- T5: room-bound carry - the body can't be carried through a doorway ----
g.reset(42); state.gameOver = false; clearKeys();
body = downBodyHere();
pressAction();
const doorR = 6;                                   // A->B doorway rows 6,7 (DOOR_V)
state.player.x = (16 + 0.5) * T; state.player.y = (doorR + 0.5) * T; g.update(1 / 60);   // just inside the door (room A)
ok(state.carrying === body, 'T5: still carrying just inside the doorway');
state.player.x = (17 + 0.5) * T;                  // step onto the door tile (roomAt -> null)
g.update(1 / 60);
ok(state.carrying === null, 'T5: the body drops the moment you cross the doorway');
ok(body.state === 'down', 'T5: the dropped body is still down at the threshold');
ok(g.roomAt(Math.floor(body.x / T), Math.floor(body.y / T))[0] === 0, 'T5: the body stayed in its own room (room-bound)');

// ---- T6: an occupied bin rejects a second body ----
g.reset(42); state.gameOver = false; clearKeys();
const origin = [1 + 1 * 17, 1 + 1 * 11];          // room E (1,1)
state.player.x = (origin[0] + 8 + 0.5) * T; state.player.y = (origin[1] + 4 + 0.5) * T; g.update(1 / 60);
const eGuards = state.guards.filter(x => x.room[0] === 1 && x.room[1] === 1);
ok(eGuards.length >= 2, 'T6: room E has two guards');
const a = eGuards[0], b = eGuards[1];
a.state = 'down'; a.ko = g.KO_TIME; a.x = state.player.x; a.y = state.player.y;
pressAction();
const spotE = state.hideSpots.find(s => { const rm = g.roomAt(s.c, s.r); return rm && rm[0] === 1 && rm[1] === 1; });
state.player.x = spotE.x; state.player.y = spotE.y; g.update(1 / 60);
pressAction();
ok(spotE.occupied, 'T6: first body hides, bin E is occupied');
b.state = 'down'; b.ko = g.KO_TIME; b.x = state.player.x; b.y = state.player.y;
pressAction();
ok(state.carrying === b, 'T6: grab a second body');
g.update(1 / 60);
pressAction();   // try to hide in the same, now-occupied bin
ok(state.carrying === null, 'T6: an occupied bin can\'t hold a second body');
ok(b.state !== 'hidden', 'T6: the second body is dropped, not hidden');

console.log(fails === 0 ? '\nALL F23 BODY CHECKS PASSED' : `\n${fails} F23 CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
