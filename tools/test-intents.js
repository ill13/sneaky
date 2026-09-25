// ============================================================
//  tools/test-intents.js - Phase 3: the intent layer + the multiplayer proof.
//  Drives the real game via load-game.cjs.
//  - T1: the per-frame input (held keys + pad + queued intents) is plain,
//        JSON-serializable data.
//  - T2 (the money shot): the run is a pure function of (seed, input stream).
//        Two identical scripted input streams on a fresh reset(42) replay the
//        player path frame-for-frame. This is "forward the intents over the
//        wire" - the input stream alone, against a fresh seeded state, reproduces
//        the run, deterministically, headless.
//  - T3: a queued meta intent is consumed by the controller even across a
//        paused frame (the intro/menu set state.paused).
// ============================================================
const { loadGame } = require('./load-game.cjs');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + msg); }
}

const g = loadGame();

// ---------------- T1: the input stream is plain, serializable data ----------------
g.reset(42);
g.state.keys['d'] = true;                       // a held key
g.state.pad.right = true;                       // a held pad direction
g.state.intentQueue.push({ type: 'distract' });    // a queued discrete intent
const snap = { keys: g.state.keys, pad: g.state.pad, intentQueue: g.state.intentQueue };
let t1 = false;
try {
  const back = JSON.parse(JSON.stringify(snap));
  t1 = back && typeof back.keys === 'object' && Array.isArray(back.intentQueue)
       && back.keys.d === true && back.pad.right === true && back.intentQueue[0].type === 'distract';
} catch (e) { t1 = false; }
ok(t1, 'T1: the input stream (keys + pad + intentQueue) is plain, JSON-serializable data');

// clear the staged inputs so the scripted runs start clean
for (const k in g.state.keys) delete g.state.keys[k];
g.state.pad.up = g.state.pad.down = g.state.pad.left = g.state.pad.right = g.state.pad.x = g.state.pad.y = false;
g.state.intentQueue = [];

// ---------------- T2: deterministic replay (the multiplayer proof) ----------------
// Script a fixed per-frame input stream (a held direction + a beat action), run
// it on a fresh reset(42), and record the player's position each frame. Do it
// TWICE (fresh reset each time) and confirm the two paths match frame-for-frame.
// Identical input against a fresh seeded state -> an identical run. That is
// exactly what you would forward over a wire.
function scriptedRun() {
  g.reset(42);
  const dt = 1 / 60;
  const N = 90; // 1.5s of play, all inside the spawn room (no leave/kill needed)
  const path = [];
  for (let f = 0; f < N; f++) {
    // clear, then apply the deterministic pattern for this frame
    for (const k in g.state.keys) delete g.state.keys[k];
    g.state.pad.up = g.state.pad.down = g.state.pad.left = g.state.pad.right = g.state.pad.x = g.state.pad.y = false;
    if (f < 45) g.state.keys['d'] = true;       // hold right for the first half
    else g.state.keys['s'] = true;              // then hold down
    if (f % 30 === 15) g.state.keys['e'] = true; // beat: one edge-triggered action
    g.update(dt);
    path.push([g.state.player.x, g.state.player.y]);
  }
  return path;
}
const runA = scriptedRun();
const runB = scriptedRun();
let replayOk = runA.length === runB.length;
let firstDiverge = -1;
for (let f = 0; replayOk && f < runA.length; f++) {
  if (Math.abs(runA[f][0] - runB[f][0]) > 1e-6 || Math.abs(runA[f][1] - runB[f][1]) > 1e-6) {
    replayOk = false; firstDiverge = f;
  }
}
const moved = Math.hypot(runA[runA.length-1][0] - runA[0][0], runA[runA.length-1][1] - runA[0][1]);
console.log('  (' + runA.length + ' frames, player travelled ' + moved.toFixed(1) + 'px over the scripted input)');
ok(replayOk, 'T2: two identical input streams on a fresh seed replay the player path frame-for-frame'
   + (replayOk ? '' : '  (diverged at frame ' + firstDiverge + ')'));
ok(moved > 40, 'T2b: the scripted input actually drove the player (' + moved.toFixed(1) + 'px, not zero)');

// ---------------- T3: a meta intent is consumed across a paused frame ----------------
g.reset(42);
const spawnX = g.state.player.x, spawnY = g.state.player.y;
g.state.player.x = 600; g.state.player.y = 300;  // drag the player off-spawn
g.state.paused = true;                            // freeze the run (like the intro/menu)
g.state.intentQueue.push({ type: 'restart' });    // queue a meta intent
g.update(1 / 60);                                 // the controller drains it BEFORE the paused early-return
ok(Math.abs(g.state.player.x - spawnX) < 1 && Math.abs(g.state.player.y - spawnY) < 1,
   'T3: a queued restart is consumed across a paused frame (player back at spawn)');

// ---------------- T4: the replay module reproduces a live run ----------------
// Drive the SAME scripted input two ways - the "live" way (set state.keys/pad
// directly, exactly how the browser does it) and the replay module (runReplay
// with the same encoded frames) - and confirm the player paths match. The replay
// driver is faithful to the real sim; it is not a re-implementation.
const DT = 1 / 60, NF = 90;
const frameKeys = (f) => (f < 45 ? ['d'] : ['s']);
function liveRun() {
  g.reset(42);
  const path = [];
  for (let f = 0; f < NF; f++) {
    for (const k in g.state.keys) delete g.state.keys[k];
    g.state.pad.up = g.state.pad.down = g.state.pad.left = g.state.pad.right = g.state.pad.x = g.state.pad.y = false;
    g.state.intentQueue.length = 0;
    for (const k of frameKeys(f)) g.state.keys[k] = true;
    g.update(DT);
    path.push([g.state.player.x, g.state.player.y]);
  }
  return path;
}
const livePath = liveRun();
const repFrames = Array.from({ length: NF }, (_, f) => ({ keys: frameKeys(f), pad: {} }));
const repRes = g.runReplay(42, repFrames, DT);
let t4 = repRes.frames.length === livePath.length;
for (let f = 0; t4 && f < NF; f++) {
  if (Math.abs(repRes.frames[f].x - livePath[f][0]) > 1e-6 || Math.abs(repRes.frames[f].y - livePath[f][1]) > 1e-6) t4 = false;
}
ok(t4, 'T4: runReplay reproduces a live-driven run frame-for-frame');

// ---------------- T5: the replay is deterministic ----------------
const rep2 = g.runReplay(42, repFrames, DT);
let t5 = repRes.frames.length === rep2.frames.length;
for (let f = 0; t5 && f < NF; f++) {
  const a = repRes.frames[f], b = rep2.frames[f];
  if (Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) > 1e-6 || JSON.stringify(a.keyBag) !== JSON.stringify(b.keyBag) || a.file !== b.file || a.won !== b.won) t5 = false;
}
ok(t5, 'T5: two runReplay calls on the same input are bit-identical (deterministic)');

console.log('');
console.log(fail === 0 ? 'ALL INTENT TESTS PASSED (' + pass + ' checks)' : 'FAILURES: ' + fail + ' of ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
