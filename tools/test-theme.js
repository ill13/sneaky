// F33 theme-swap test: mutate the THEME object in place for a different setting
// and prove the core loop (reset + update) still runs, the briefing follows the
// theme, and the core never reads a theme string (it reads roles/archetypes/mech).
const { loadGame } = require('./load-game.cjs');
const g = loadGame();

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

const T = g.THEME;   // same object as the global THEME (mutate in place, it's a const)
const corporate = g.buildBriefing();
ok(/Vault/.test(corporate) && /contract/.test(corporate) && !/East Storage/.test(corporate),
  'default theme: the briefing names the objective room (Vault) - and no longer the key rooms (F34: the notes do)');

// save, then swap to a "dungeon" theme in place
const saved = { rooms: T.rooms, player: T.player, containers: T.containers, items: T.items };
T.rooms = {
  '0,0': 'the Gatehouse', '1,0': 'the Armory', '2,0': 'the Cellar',
  '0,1': 'the Scriptorium', '1,1': 'the Vault Hall', '2,1': 'the East Keep',
  '0,2': 'the Cistern', '1,2': 'the Strongbox', '2,2': 'the Crypt',
};
T.player = { name: 'the thief', framing: 'One dungeon, nine rooms, three keys.' };
T.containers = {
  fast: { name: 'a chest', glyph: 'chest', color: '#6b5d45' },
  mid: { name: 'a strongbox', glyph: 'box', color: '#46536a' },
  loud: { name: 'a forge', glyph: 'forge', color: '#3f4a52' },
  safe: { name: 'the strongbox', glyph: 'safe', color: '#5c5244' },
};
T.items = { key: { name: 'key' }, objective: { name: 'the relic' }, upgrade: { name: 'a trinket' }, note: { name: 'a scrap' } };

const dungeon = g.buildBriefing();
ok(/Strongbox/.test(dungeon) && /relic/.test(dungeon) && !/Vault/.test(dungeon),
  'swapped theme: the briefing follows the dungeon objective (the relic in the Strongbox)');
ok(/East Keep/.test(g.clueText('blue')) && /Vault Hall/.test(g.clueText('red')),
  'swapped theme: the clue texts re-skin too (blue in the East Keep, red in the Vault Hall)');

// the core loop still runs under the swapped theme (reset + updates, no throw)
let ran = true, containers = 0;
try {
  g.reset(42);
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  containers = g.state.containers.length;
} catch (e) { ran = false; console.log('   threw:', e.message); }
ok(ran && containers >= 18, 'core loop runs under the swapped theme (reset + 60 frames, ' + containers + ' containers)');

// a quest container still holds its item and is searchable under the swap
const gold = g.state.containers.find((c) => c.contents.some((i) => i.role === 'key' && i.id === 'gold'));
ok(!!gold && gold.arc && g.CONTAINER_TYPES[gold.arc].searchTime > 0, 'quest item still in an archetype container (searchable) under the swap');

// restore
T.rooms = saved.rooms; T.player = saved.player; T.containers = saved.containers; T.items = saved.items;
ok(g.buildBriefing() === corporate, 'restoring the theme restores the corporate briefing');

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F33 THEME-SWAP CHECKS PASSED');
process.exit(fails ? 1 : 0);
