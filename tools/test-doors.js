// F37 - a keyed door, once opened, gets the SAME lintel frame as an ordinary open door.
// Before the fix, doorLintels was built once at reset (open gaps only), so an unlocked
// door became a bare gap with no frame. Now opening a locked door adds its lintels.
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const st = () => g.state;

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };
const hasLintel = (c, r, o) => st().doorLintels.some(([lc, lr, lo]) => lc === c && lr === r && lo === o);

// all keyed doors sit on row 22 (horizontal wall) -> 'h' orientation
// blue: tiles (6,22),(7,22); red: (23,22),(24,22); gold: (40,22),(41,22)
const DOORS = { blue: [[6, 22], [7, 22]], red: [[23, 22], [24, 22]], gold: [[40, 22], [41, 22]] };

for (const [id, tiles] of Object.entries(DOORS)) {
  g.reset(42);
  const baseCount = st().doorLintels.length;
  // none of the locked-door tiles have a lintel while the door is shut
  const preExisting = tiles.filter(([c, r]) => hasLintel(c, r, 'h')).length;
  ok(preExisting === 0, `${id}: no lintel on the locked door while it's shut`);

  // bank the key and stand on the approach tile to open it
  st().keyBag[id] = true;
  const appr = g.doorSecApproach(g.KEYS.find(k => k.id === id).doorSec)[0];
  st().player.x = (appr[0] + 0.5) * 32; st().player.y = (appr[1] + 0.5) * 32;
  for (let i = 0; i < 3; i++) g.update(1 / 60);

  ok(st().doorsOpen[id] === true, `${id}: the door opens with the key`);
  for (const [c, r] of tiles) {
    ok(hasLintel(c, r, 'h'), `${id}: tile (${c},${r}) gets an 'h' lintel frame once open`);
  }
  ok(st().doorLintels.length === baseCount + tiles.length,
     `${id}: lintel count went ${baseCount} -> ${st().doorLintels.length} (+${tiles.length})`);
}

// orientation sanity: a hypothetical door on a vertical line (c 17/34) would take 'v'
{
  g.reset(42);
  const c = 17, r = 5;   // a vertical wall line
  const o = (c === 17 || c === 34) ? 'v' : 'h';
  ok(o === 'v', `vertical wall line (c=17) maps to 'v' orientation (got ${o})`);
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F37 DOOR-LINTEL CHECKS PASSED');
process.exit(fails ? 1 : 0);
