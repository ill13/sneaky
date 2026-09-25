// F34 clue-system test: the notes are how you learn where the keys are.
//  - three clue notes, one per colored key, one per top-row room (A/B/C)
//  - each clue sits in a room that is NOT its key's room
//  - searching a clue container sets state.clues[keyId] (the minimap gate)
//  - searching a flavor note banks it in foundNotes
// Driven through the real input path (teleport + face + hold ACT), not direct calls.
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const st = () => g.state;

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };
const T = 32;

// a standable floor tile adjacent to a container (the search access tile)
function accessTileOf(ct) {
  const m = st().map;
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nc = ct.c + dc, nr = ct.r + dr;
    if (nc >= 0 && nr >= 0 && nc < m[0].length && nr < m.length && m[nr][nc] === 0) return [nc, nr, dc, dr];
  }
  return null;
}
// face the container and hold ACT until it opens (the real search path)
function searchContainer(ct) {
  const acc = accessTileOf(ct);
  if (!acc) return false;
  const [nc, nr] = acc;
  st().player.x = (nc + 0.5) * T; st().player.y = (nr + 0.5) * T;
  // the direction to press is toward the container (access tile -> container)
  const toC = { left: 'a', right: 'd', up: 'w', down: 's' };
  // compute the facing from player tile to container tile
  const dx = ct.c - nc, dy = ct.r - nr;
  const key = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'd' : 'a') : (dy > 0 ? 's' : 'w');
  const s = st();
  for (const k in s.keys) delete s.keys[k];
  s.keys[key] = true; s.keys['e'] = true;
  const limit = g.CONTAINER_TYPES[ct.arc].searchTime + 0.6;
  for (let t = 0; t < limit; t += 1 / 60) g.update(1 / 60);
  delete s.keys['e']; delete s.keys[key];
  return ct.opened;
}

// ---- placement: one clue per top-row room, none in its key's room ----
{
  g.reset(42);
  const clues = st().containers.filter((c) => c.contents.some((i) => i.role === 'clue'));
  ok(clues.length === 3, 'three clue notes exist');
  const rooms = clues.map((c) => c.rc + ',' + c.rr).sort();
  ok(JSON.stringify(rooms) === JSON.stringify(['0,0', '1,0', '2,0']),
    'clues occupy the three top-row rooms A/B/C: ' + rooms.join(' '));
  let distinctFromKey = true;
  for (const c of clues) {
    const it = c.contents.find((i) => i.role === 'clue');
    const k = g.KEYS.find((x) => x.id === it.keyId);
    if (k.room[0] === c.rc && k.room[1] === c.rr) distinctFromKey = false;
  }
  ok(distinctFromKey, 'no clue sits in its own key\'s room');
  ok(!st().clues.blue && !st().clues.gold && !st().clues.red, 'no clues known at reset');
}

// ---- searching a clue banks the knowledge (the minimap gate) ----
{
  g.reset(42);
  const blueClue = st().containers.find((c) => c.contents.some((i) => i.role === 'clue' && i.keyId === 'blue'));
  const opened = searchContainer(blueClue);
  ok(opened, 'searching the blue clue container opens it');
  ok(!!st().clues.blue, 'reading the blue clue banks state.clues.blue (minimap lights up)');
  ok(!st().clues.gold && !st().clues.red, 'the other clues stay unknown until searched');
  ok(st().noteToast && st().noteToast.clue && /BLUE/.test(st().noteToast.text),
    'finding a clue raises a clue toast: ' + (st().noteToast ? st().noteToast.text : '-'));
}

// ---- the full clue chain: read all three, learn all three key rooms ----
{
  g.reset(42);
  const clues = st().containers.filter((c) => c.contents.some((i) => i.role === 'clue'));
  let all = true;
  for (const c of clues) { if (!searchContainer(c)) all = false; }
  ok(all, 'all three clue containers are searchable to completion');
  ok(!!st().clues.blue && !!st().clues.gold && !!st().clues.red,
    'the full clue chain reveals all three key rooms');
}

// ---- flavor notes still bank as foundNotes ----
{
  g.reset(42);
  const flavor = st().containers.find((c) => c.contents.some((i) => i.role === 'note'));
  searchContainer(flavor);
  ok(st().foundNotes.length >= 1, 'searching a flavor note banks it in foundNotes');
  ok(!st().noteToast || !st().noteToast.clue, 'a flavor note is not flagged as a clue');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F34 CLUE-SYSTEM CHECKS PASSED');
process.exit(fails ? 1 : 0);
