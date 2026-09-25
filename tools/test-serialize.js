// ============================================================
//  tools/test-serialize.js - Phase 6: prove `state` is plain, serializable.
//  The whole run state (map, units, guards, fog, quest flags, carried body,
//  intent queue...) must JSON-round-trip losslessly. This is the save/resume +
//  "send the state over the wire" foundation: if it serializes, multiplayer and
//  persistence are "forward the bytes," not a rewrite.
// ============================================================
const { loadGame } = require('./load-game.cjs');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + msg); }
}

const g = loadGame();
g.reset(42);

// play 60 frames with some input so the sim mutates state (guards move, a room
// gets remembered, the player advances) - we serialize a LIVED-IN state, not a
// pristine one.
const dt = 1 / 60;
for (let f = 0; f < 60; f++) {
  for (const k in g.state.keys) delete g.state.keys[k];
  g.state.pad.up = g.state.pad.down = g.state.pad.left = g.state.pad.right = g.state.pad.x = g.state.pad.y = false;
  if (f % 2 === 0) g.state.keys['d'] = true;
  g.update(dt);
}

const orig = g.state;
const px = orig.player.x, py = orig.player.y;
const g0 = orig.guards[0];
const g0room = g0.room.slice(), g0state = g0.state, g0facing = g0.facing;
const exploredCopy = orig.explored.slice();
const playerFields = ['x', 'y', 'r', 'invuln', 'hits', 'type', 'id'];

// S1: it serializes without throwing (no cycles, no BigInt).
let json = null, parsed = null, threw = null;
try { json = JSON.stringify(orig); parsed = JSON.parse(json); } catch (e) { threw = String(e); }
ok(json !== null, 'S1: state JSON.stringifies + parses without throwing' + (threw ? '  (' + threw + ')' : ''));
if (json === null) { console.log(''); process.exit(1); }

// S2: the run data actually landed in the bytes (the player's exact x is a
// substring of the serialized state), and the round-trip is stable plain data.
ok(json.includes(String(px)), 'S2a: the player position is literally present in the serialized state');
ok(JSON.stringify(parsed) === json, 'S2b: the round-trip is stable (re-serializing the parse equals the original bytes)');

// S3-S7: the run-defining facts survive the round trip.
ok(parsed.player.x === px && parsed.player.y === py, 'S3: the player position survives');
ok(parsed.guards[0].room[0] === g0room[0] && parsed.guards[0].room[1] === g0room[1]
   && parsed.guards[0].state === g0state && parsed.guards[0].facing === g0facing,
   'S4: a guard\'s room + AI state + facing survive');
ok(parsed.explored.join(',') === exploredCopy.join(','), 'S5: the fog (explored) survives');
ok(Array.isArray(parsed.map) && parsed.map.length === orig.map.length, 'S6: the map survives (dims intact)');
ok(Array.isArray(parsed.units) && parsed.units.length === orig.units.length, 'S7: the unit array survives (' + parsed.units.length + ' units)');

// S8: the player unit's data fields all survive (a dropped function/undefined
// would show up as a missing field).
let allFields = playerFields.every((f) => f in parsed.player);
ok(allFields, 'S8: every player data field survives (x,y,r,invuln,hits,type,id - nothing dropped)');

console.log('');
console.log(fail === 0 ? 'ALL SERIALIZE TESTS PASSED (' + pass + ' checks, ' + json.length + ' bytes of state)' : 'FAILURES: ' + fail + ' of ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
