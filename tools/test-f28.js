// ============================================================
//  F28 - three guard changes, tested in one file:
//    1. the knockout duration is longer (6s -> 10s, raised by 2/3)
//    2. an awake guard that stumbles over a downed one shakes it awake
//    3. fixed "post" guards: stuck at their post, only the head swings, in
//       90-degree steps, cycling the four cardinal directions
//  Permanent test - keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// T1: the knockout duration was raised (was 6s, now 6 + 2/3 = 10s)
{
  ok(g.KO_TIME === 10, `T1: KO_TIME is 10s (raised from 6 by 2/3, got ${g.KO_TIME})`);
}

// T2: a downed guard left in the open is shaken awake by an awake mobile guard
//     that stumbles close - far faster than the KO timer
{
  g.reset(42); state.gameOver = false;
  const H = state.guards.find(x => x.state === 'patrol' && !x.post);   // an awake, mobile guard
  ok(!!H, 'T2: found an awake mobile guard');
  if (H) {
    const G = state.guards.find(x => x !== H && !x.post);   // any other awake guard, relocated next to H
    ok(!!G, 'T2: found a second guard');
    if (G) {
      const bx = H.x, by = H.y;
      G.state = 'down'; G.ko = g.KO_TIME; G.x = bx; G.y = by;   // body on the floor
      H.x = bx + 30;                                            // H 30px away (within WAKE_DISCOVER_DIST)
      let frames = 0;
      for (let i = 0; i < 60 && G.state === 'down'; i++) { g.update(1 / 60); frames = i + 1; }
      ok(G.state !== 'down', `T2: the patrol guard shakes the body awake in ${frames} frames (vs the ${g.KO_TIME}s KO timer)`);
    }
  }
}

// T2b: the wake is line-of-sight - a body behind a wall is NOT discovered
{
  g.reset(42); state.gameOver = false;
  const H = state.guards.find(x => x.state === 'patrol' && !x.post);
  if (H) {
    // a body 60px away with a wall between: pick a spot where hasLOS fails
    const bx = H.x, by = H.y;
    const G = state.guards.find(x => x !== H && !x.post);
    if (G) {
      // scan for a within-range but walled position for the body relative to H
      let placed = null;
      outer: for (let a = 0; a < 16; a++) {
        const ang = a / 16 * Math.PI * 2;
        const tx = bx + Math.cos(ang) * 55, ty = by + Math.sin(ang) * 55;
        if (!g.hasLOS(bx, by, tx, ty)) { placed = [tx, ty]; break outer; }
      }
      if (placed) {
        G.state = 'down'; G.ko = g.KO_TIME; G.x = placed[0]; G.y = placed[1];
        for (let i = 0; i < 30; i++) g.update(1 / 60);
        ok(G.state === 'down', 'T2b: a body a wall hides from the guard is NOT discovered (LOS-gated)');
      } else {
        ok(true, 'T2b: (no walled spot found in this room; skipped)');
      }
    }
  }
}

// T3: exactly the stride-rule guards are post guards (3 of the 16)
{
  g.reset(42);
  const posts = state.guards.filter(x => x.post);
  const expected = state.guards.map((x, i) => i % g.POST_STRIDE === g.POST_OFFSET).filter(Boolean).length;
  ok(posts.length === expected && expected === 3, `T3: exactly ${expected} post guards (got ${posts.length})`);
}

// T4: a post guard never moves - it's stuck at its post
{
  g.reset(42); state.gameOver = false;
  const P = state.guards.find(x => x.post);
  ok(!!P, 'T4: found a post guard');
  if (P) {
    const x0 = P.x, y0 = P.y;
    for (let i = 0; i < 240; i++) g.update(1 / 60);   // 4 seconds
    const drift = Math.hypot(P.x - x0, P.y - y0);
    ok(drift < 1, `T4: the post guard stays at its post (${drift.toFixed(2)}px drift over 4s)`);
  }
}

// T5: a post guard's head sweeps all four 90-degree cardinal directions
{
  g.reset(42); state.gameOver = false;
  const P = state.guards.find(x => x.post);
  if (P) {
    const base = P.postBase;
    const seen = new Set();
    for (let i = 0; i < 480; i++) {                   // 8s > one full 4-direction cycle (~6.8s)
      g.update(1 / 60);
      for (let k = 0; k < 4; k++) {
        const target = base + k * Math.PI / 2;
        const da = Math.abs(Math.atan2(Math.sin(P.facing - target), Math.cos(P.facing - target)));
        if (da < 0.3) seen.add(k);
      }
    }
    ok(seen.size === 4, `T5: the post guard swept all four 90-degree directions (hit ${[...seen].sort().join(',')})`);
  } else ok(false, 'T5: no post guard');
}

// T6: a post guard is knockable from behind like any other guard
{
  g.reset(42); state.gameOver = false;
  const P = state.guards.find(x => x.post);
  if (P) {
    P.facing = 0;                                      // snap it to face east
    state.player.x = P.x - 20; state.player.y = P.y;   // 20px directly behind (west), within KO_DIST
    const r = g.tryKnockout();
    ok(r === true && P.state === 'down', `T6: a post guard can be knocked out from behind (tryKnockout=${r}, state=${P.state})`);
  } else ok(false, 'T6: no post guard');
}

// T7: F36 - a post guard only fires on what it's LOOKING at. In its blind spot (behind the
//     72-deg gaze) it stays silent, so the rear-arc knockout is reachable without eating
//     lead. (Before F36 it fired in a 60px ring all around - the "feels 360" bug.)
{
  g.reset(42); state.gameOver = false;
  const P = state.guards.find(x => x.post);
  if (P) {
    const A = 0.5;                       // a clear approach angle
    P.x = 320; P.y = 320;                // relocate to open floor
    const plx = P.x + Math.cos(A) * 40, ply = P.y + Math.sin(A) * 40;   // 40px out, in range
    state.player.x = plx; state.player.y = ply; state.player.invuln = 0;
    P.postT = 999999; P.shootCd = 0;
    const fireCount = (pointAt) => {
      let fired = 0;
      for (let i = 0; i < 3; i++) {
        P.facing = pointAt ? A : A + Math.PI;   // pin the gaze (beat the sweep)
        P.postT = 999999;
        const b0 = state.bullets.length;
        g.update(1 / 60);
        fired += Math.max(0, state.bullets.length - b0);   // count NEW bullets this frame
      }
      return fired;
    };
    const at = fireCount(true);
    const away = fireCount(false);
    ok(at >= 1 && away === 0, `T7: the post guard fires when looking (${at}) and stays silent in its blind spot (${away})`);
  } else ok(false, 'T7: no post guard');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F28 CHECKS PASSED');
process.exit(fails ? 1 : 0);
