// ============================================================
//  SNEAK RUN - tools/replay.js: run a recorded input stream headless.
//
//   node tools/replay.js <intent-file.json>   replay an intent file
//   node tools/replay.js                       run the built-in demo (no file)
//
//  An intent file is { "seed": 42, "dt": 0.01666, "frames": [ {keys, pad, intents}, ... ] }
//  where each frame's keys is an array of held key names (e.g. ["d"]), pad is an
//  object of {up,down,left,right,x,y}, and intents is an array of meta intents.
//  This is the "point it at an intent file" payoff of Phase 6.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const fs = require('fs');

// the built-in demo: hold right for 45 frames, then down for 45, act on a beat -
// the same scripted stream test-intents uses, so the demo and the tests agree.
function demoFrames(N) {
  const frames = [];
  for (let f = 0; f < N; f++) {
    const keys = f < 45 ? ['d'] : ['s'];
    if (f % 30 === 15) keys.push('e');
    frames.push({ keys, pad: {} });
  }
  return frames;
}

function report(seed, dt, frames) {
  const last = frames[frames.length - 1] || { x: 0, y: 0, keyBag: { blue: false, gold: false, red: false }, file: false, alarm: false, won: false, over: false };
  console.log('replay seed ' + seed + '  (' + frames.length + ' frames @ dt=' + dt + ')');
  console.log('  final player: ' + Math.round(last.x) + ',' + Math.round(last.y));
  const haveK = Object.keys(last.keyBag || {}).filter((id) => last.keyBag[id]).join(',') || 'none';
  console.log('  keys: ' + haveK + '  file: ' + last.file + '  alarm: ' + last.alarm +
    '  ' + (last.won ? 'WON' : (last.over ? 'CAUGHT' : 'still running')));
  console.log('  path (every 15th frame):');
  for (let f = 0; f < frames.length; f += 15) {
    const fr = frames[f];
    console.log('    f' + f + '  x=' + Math.round(fr.x) + ' y=' + Math.round(fr.y) +
      '  guards=[' + fr.guards.map((s) => s[0]).join('') + ']');
  }
}

const file = process.argv[2];
const g = loadGame();
if (file) {
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { frames, seed } = g.runReplay(spec.seed, spec.frames, spec.dt);
  report(seed, spec.dt, frames);
} else {
  const seed = 42, dt = 1 / 60;
  const { frames } = g.runReplay(seed, demoFrames(90), dt);
  report(seed, dt, frames);
}
