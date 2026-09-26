// ============================================================
//  F44 - the laser nook in room D. A box missing one side (the mouth), the
//  gold key's container in the bowl, the laser emitter on the mouth with its
//  beam pointing out. Time the off-window to slip in, grab the key, get out.
//  Verifies the geometry, the forced key placement, the beam gate, and that the
//  key stays in the solvable chain. Keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
const T = g.TILE;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

const nookAbs = (t) => { const [ox, oy] = [1 + g.NOOK.room[0] * 17, 1 + g.NOOK.room[1] * 11]; return [ox + t[0], oy + t[1]]; };
const mouth = nookAbs(g.NOOK.mouth);
const bowl = nookAbs(g.NOOK.bowl);
const emitter = nookAbs(g.NOOK.emitter);
const approach = nookAbs(g.NOOK.approach);

g.reset(42);
const m = state.map;

// N1: the nook walls are carved (top + bottom + left) and the mouth is open.
{
  const top = [bowl[0] - 1, bowl[1] - 1];   // row above the bowl, into the box
  const wallTop = m[bowl[1] - 1][bowl[0]] === 1 && m[bowl[1] - 1][bowl[0] + 1] === 1;
  const wallBottom = m[bowl[1] + 1][bowl[0]] === 1 && m[bowl[1] + 1][bowl[0] + 1] === 1;
  const wallLeft = m[bowl[1]][bowl[0] - 1] === 1;
  ok(wallTop && wallBottom && wallLeft, 'N1: the nook has top, bottom, and left walls');
  ok(m[mouth[1]][mouth[0]] === 0, 'N1: the mouth is open (the only entrance)');
  ok(m[approach[1]][approach[0]] === 0, 'N1: the approach tile outside the mouth is floor');
}

// N2: the gold key's container is in the nook's bowl.
{
  const goldCt = state.containers.find((ct) => ct.contents && ct.contents.some((x) => x.role === 'key' && x.id === 'gold'));
  ok(!!goldCt, 'N2: the gold key is in a container');
  ok(goldCt && goldCt.c === bowl[0] && goldCt.r === bowl[1], 'N2: the gold key container is the nook bowl');
}

// N3: the laser emitter sits on the mouth, facing out (east).
{
  const laser = state.guards.find((x) => x.laser);
  ok(!!laser, 'N3: the laser exists');
  ok(laser && laser.c !== undefined || (laser && Math.round((laser.x / T) - 0.5) === emitter[0] && Math.round((laser.y / T) - 0.5) === emitter[1]), 'N3: the laser emitter is on the nook mouth');
  ok(laser && laser.beamDir === 0, 'N3: the beam points out (east)');
}

// N4: the nook interior is reachable (the floor tile beside the bowl, through the mouth).
{
  const interior = [bowl[0] + 1, bowl[1]];   // the floor tile beside the bowl (the player stands here to search)
  const spawnTile = [Math.round(state.player.x / T - 0.5), Math.round(state.player.y / T - 0.5)];
  const reach = g.reachable(m, spawnTile, [interior], true);
  ok(reach, 'N4: the nook interior is reachable from spawn (through the mouth)');
}

// N5: the beam, when live, covers the mouth/approach (you must time it).
{
  const laser = state.guards.find((x) => x.laser);
  laser.asleep = false;   // beam live
  state.player.x = (approach[0] + 0.5) * T; state.player.y = (approach[1] + 0.5) * T;
  ok(g.beamContact(laser) === true, 'N5: the live beam covers the approach (the gate is on)');
  // inside the nook (west of the emitter) you are clear of the beam
  state.player.x = (bowl[0] + 1.5) * T; state.player.y = (bowl[1] + 0.5) * T;
  ok(g.beamContact(laser) === false, 'N5: inside the nook you are clear of the beam');
}

// N6: the gold key stays in the solvable chain (the nook does not break it).
{
  const L = g.generateLayout(42);
  const qc = L.questContainer || {};
  ok(!!qc.gold, 'N6: the gold key is assigned (in the layout quest-container map)');
  const acc = (ct) => ct ? [[ct.c + 1, ct.r], [ct.c - 1, ct.r], [ct.c, ct.r + 1], [ct.c, ct.r - 1]] : [];
  const keyRows = g.KEYS.map((k) => ({
    id: k.id, doorTiles: g.doorSecTiles(k.doorSec), approach: g.doorSecApproach(k.doorSec), access: acc(qc[k.id]),
  }));
  const kc = g.validateKeyChain(L.map, L.spawn, keyRows, { access: acc(qc.objective) }, L.exit);
  ok(kc.allKeys, 'N6: all three keys (incl. the nook gold) are in the solvable chain');
  ok(kc.fileOk && kc.exitOk, 'N6: the file and exit are still reachable with the nook in place');
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL F44 (laser nook) CHECKS PASSED');
process.exit(fails ? 1 : 0);
