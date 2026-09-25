// F35 debug-grant test: the 'grantAll' meta intent (the G key) banks every item
// in one frame - all three keys, the file, all three mods, and the clue knowledge
// - through the real intent path (intent queue -> processIntents -> grantAllItems),
// not a direct call.
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const st = () => g.state;

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// nothing banked at reset
g.reset(42);
ok(!st().hasFile && !st().keyBag.blue && !st().upgrades.stim, 'nothing banked at reset');

// fire the grantAll intent (what the G key emits) and advance one frame
st().intentQueue.push({ type: 'grantAll' });
g.update(1 / 60);

ok(st().keyBag.blue && st().keyBag.gold && st().keyBag.red, 'all three keys banked');
ok(st().hasFile === true, 'the file is banked');
ok(st().upgrades.stim && st().upgrades.hush && st().upgrades.heavy, 'all three mods banked');
ok(st().clues.blue && st().clues.gold && st().clues.red, 'all clue rooms known (minimap lights up)');

// the objective now wants the escape, not the keys
g.update(1 / 60);
const obj = st().hasFile ? 'escape-phase' : 'keys';   // hasFile true -> past the steal phase
ok(st().hasFile, 'run is in the escape phase (file in hand)');

// the doors open on proximity once you have the keys - a red door opens when
// you stand on its approach tile with the red key
{
  g.reset(42);
  st().intentQueue.push({ type: 'grantAll' });
  g.update(1 / 60);
  const approach = g.doorSecApproach(1)[0];   // red door (E-H) approach tile
  st().player.x = (approach[0] + 0.5) * 32; st().player.y = (approach[1] + 0.5) * 32;
  for (let i = 0; i < 3; i++) g.update(1 / 60);
  ok(st().doorsOpen.red === true, 'the red door opens on proximity once the red key is banked');
}

// grantAll is idempotent / safe to repeat (no throw, no double-bank surprise)
{
  g.reset(42);
  st().intentQueue.push({ type: 'grantAll' });
  g.update(1 / 60);
  st().intentQueue.push({ type: 'grantAll' });
  g.update(1 / 60);
  ok(st().hasFile && st().keyBag.blue, 'grantAll is safe to repeat');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F35 DEBUG-GRANT CHECKS PASSED');
process.exit(fails ? 1 : 0);
