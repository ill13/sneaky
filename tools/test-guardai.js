// F19 verification: a guard is room-confined. It chases within its room, chases to
// the door edge when the player slips into the next room, holds a search, then
// resumes patrol - and never has its feet in a room it doesn't own.
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const T = g.TILE;
const step = (dt) => g.update(dt);
const roomOf = (x, y) => g.roomAt(Math.floor(x / T), Math.floor(y / T));

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg); if (!cond) fails++; };

for (const seed of [42, 7, 1337, 9000]) {
  g.reset(seed);
  const S = g.state;
  // pick a guard in the spawn room (room 0,0)
  const home = S.guards.find((gd) => gd.room[0] === 0 && gd.room[1] === 0);
  if (!home) { ok(false, `seed ${seed}: no guard in spawn room`); continue; }
  const [rc, rr] = home.room;

  // place the player 2 tiles in front of the guard so it spots us
  S.player.x = home.x + Math.cos(home.facing) * T * 2;
  S.player.y = home.y + Math.sin(home.facing) * T * 2;

  let sawChase = false, crossed = false;
  for (let f = 0; f < 240; f++) {   // 4s of play
    step(1 / 60);
    for (const gd of S.guards) {
      const rm = roomOf(gd.x, gd.y);
      if (rm && (rm[0] !== gd.room[0] || rm[1] !== gd.room[1])) crossed = true;
    }
    if (home.state === 'chase') sawChase = true;
  }
  ok(sawChase, `seed ${seed}: guard in spawn room entered chase when spotted`);
  ok(!crossed, `seed ${seed}: NO guard ever crossed out of its own room (4s)`);

  // now force the door-edge / search / resume sequence on this guard directly
  g.reset(seed);
  const H = g.state.guards.find((gd) => gd.room[0] === rc && gd.room[1] === rr);
  H.state = 'chase';
  H.seenFor = 0;
  // put the player in the room just to the right of H's room (across its door)
  const bC = rc + 1, bR = rr;
  if (bC <= 2) {
    // find a floor tile in the neighbor room
    let placed = false;
    outer:
    for (let r = 1 + bR * 11 + 1; r <= 1 + bR * 11 + 9; r++)
      for (let c = 1 + bC * 17 + 1; c <= 1 + bC * 17 + 15; c++)
        if (g.map()[r][c] === 0) { S.player.x = (c + 0.5) * T; S.player.y = (r + 0.5) * T; placed = true; break outer; }
    if (placed) {
      let sawSearch = false, sawPatrolAgain = false, crossed2 = false;
      let sawSearchFirst = false;
      for (let f = 0; f < 600; f++) {
        step(1 / 60);
        const rm = roomOf(H.x, H.y);
        if (rm && (rm[0] !== rc || rm[1] !== rr)) crossed2 = true;
        if (H.state === 'search') { sawSearch = true; sawSearchFirst = sawSearchFirst || !sawPatrolAgain; }
        if (sawSearch && H.state === 'patrol') sawPatrolAgain = true;
      }
      ok(sawSearch, `seed ${seed}: guard chased to the door edge then SEARCHED (player in next room)`);
      ok(sawSearchFirst && sawPatrolAgain, `seed ${seed}: after search, guard RESUMED patrol`);
      ok(!crossed2, `seed ${seed}: guard never crossed into the neighbor room during the chase`);
    } else { ok(false, `seed ${seed}: no floor tile found in neighbor room`); }
  }
}

// ---- Doorway sight (F21): a guard must NOT see the player across a doorway ----
// The east door of room (0,0) is on abs col 17 (rows 6,7). A plain LOS ray clears
// the 2-tile gap, so the only thing that keeps a (0,0) guard from seeing a
// (1,0) player is the room gate. We verify the cross-door player is in range and
// FOV, then assert canSee is false - and that a same-room player IS seen.
console.log('');
for (const seed of [42, 7, 1337]) {
  g.reset(seed);
  const S = g.state;
  const m = g.map();
  const home = S.guards.find((gd) => gd.room[0] === 0 && gd.room[1] === 0);
  if (!home) { ok(false, `seed ${seed}: no spawn guard for doorway test`); continue; }
  // pick a clear door row, then the nearest floor tile to the door on the (0,0) side
  let row = -1;
  for (const rr of [6, 7]) if (m[rr][18] === 0) { row = rr; break; }
  let gcol = -1;
  if (row >= 0) for (const cc of [16, 15, 14, 13]) if (m[row][cc] === 0) { gcol = cc; break; }
  if (row < 0 || gcol < 0) { ok(false, `seed ${seed}: no clear door row/col for doorway test`); continue; }
  home.x = (gcol + 0.5) * T; home.y = (row + 0.5) * T; home.facing = 0; // facing east, at the door
  S.player.x = (18 + 0.5) * T; S.player.y = (row + 0.5) * T;           // just across, room (1,0)
  const dist = Math.hypot(S.player.x - home.x, S.player.y - home.y);
  ok(dist < g.VISION_RANGE && g.angleDiff(0, home.facing) < g.CHASE_FOV / 2,
     `seed ${seed}: cross-door player is in range (${(dist / T).toFixed(1)} tiles) and in FOV`);
  ok(!g.canSee(home, g.CHASE_FOV, g.VISION_RANGE),
     `seed ${seed}: guard does NOT see the player across the doorway`);
  S.player.x = home.x + 5; S.player.y = home.y;   // 5px ahead, same room
  ok(g.canSee(home, g.CHASE_FOV, g.VISION_RANGE),
     `seed ${seed}: guard DOES see the player in its own room (control)`);
}

// ---- Return-to-patrol must not freeze (F22) ----
// A guard that just gave up the chase is OFF its lane. Walking to its waypoint
// now uses A* (was a straight beeline), so a dense room's obstacles can't wedge
// it. Drop each guard at a random off-lane floor tile, resume patrol, and assert
// it keeps moving - never freezes for the final 1.5s of a 6s window.
let froze = 0, resumed = 0;
for (const seed of [42, 7, 1337]) {
  g.reset(seed);
  const S = g.state;
  const m = g.map();
  let rs = seed;
  const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return (rs >>> 8) / 0x7fffff; };
  for (const gd of S.guards) {
    if (gd.machine) continue;   // F39: a camera (machine) has no patrol path to resume
    const c0 = 1 + gd.room[0]*17, c1 = 16 + gd.room[0]*17, r0 = 1 + gd.room[1]*11, r1 = 10 + gd.room[1]*11;
    let spot = null;
    for (let t = 0; t < 60 && !spot; t++) {
      const c = c0 + Math.floor(rnd() * (c1 - c0 + 1));
      const r = r0 + Math.floor(rnd() * (r1 - r0 + 1));
      if (m[r][c] === 0 && !gd.path.some(p => Math.hypot(p.x - (c+0.5)*T, p.y - (r+0.5)*T) < 5)) spot = [c, r];
    }
    if (!spot) continue;
    gd.x = (spot[0]+0.5)*T; gd.y = (spot[1]+0.5)*T;
    g.resumePatrol(gd);
    let px = gd.x, py = gd.y, frozen = 0;
    for (let f = 0; f < 360; f++) {
      g.update(1/60);
      const d = Math.hypot(gd.x - px, gd.y - py);
      px = gd.x; py = gd.y;
      if (f >= 270 && d < 0.4) frozen++;
    }
    resumed++;
    if (frozen > 100) { froze++; ok(false, `seed ${seed}: guard @room ${gd.room} FROZE on return to patrol (${frozen}/90 frames)`); }
  }
}
ok(resumed > 0 && froze === 0, `return-to-patrol: ${resumed} off-lane resumes, ${froze} froze (A* keeps them moving)`);

console.log(fails === 0 ? '\nALL F19 AI CHECKS PASSED' : `\n${fails} F19 CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
