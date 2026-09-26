// ============================================================
//  F44 - the laser nook in room D. A box walled on three sides, one side fully
//  open (the entrance). The laser emitter sits at a corner of the open side and
//  its beam runs ACROSS the entrance (spans the whole side). The gold key's
//  container is in the bowl, inside on the far side. Time the off-window to slip
//  across the beam, grab the key, get out. Verifies the geometry, the forced key
//  placement, the beam gate, and that the key stays in the solvable chain. Green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
const T = g.TILE;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

const nookAbs = (t) => { const [ox, oy] = [1 + g.NOOK.room[0] * 17, 1 + g.NOOK.room[1] * 11]; return [ox + t[0], oy + t[1]]; };
const bowl = nookAbs(g.NOOK.bowl);
const emitter = nookAbs(g.NOOK.emitter);
const approach = nookAbs(g.NOOK.approach);
// the entrance (the open side) - the middle tile of that side, where the beam runs
const N = g.NOOK;
const entrance = nookAbs(N.mouthSide === 'right' ? [N.c1, N.r0 + Math.floor((N.h - 1) / 2)]
  : N.mouthSide === 'left' ? [N.c0, N.r0 + Math.floor((N.h - 1) / 2)]
  : N.mouthSide === 'top' ? [N.c0 + Math.floor((N.w - 1) / 2), N.r0]
  : [N.c0 + Math.floor((N.w - 1) / 2), N.r1]);

g.reset(42);
const m = state.map;

// N1: the nook walls are carved and the entrance (the open side) is fully open.
{
  const wallTop = m[bowl[1] - 1][bowl[0]] === 1 && m[bowl[1] - 1][bowl[0] + 1] === 1;
  const wallBottom = m[bowl[1] + 1][bowl[0]] === 1 && m[bowl[1] + 1][bowl[0] + 1] === 1;
  const wallLeft = m[bowl[1]][bowl[0] - 1] === 1;
  ok(wallTop && wallBottom && wallLeft, 'N1: the nook has top, bottom, and left walls');
  ok(m[entrance[1]][entrance[0]] === 0, 'N1: the entrance (open side) is open');
  ok(m[approach[1]][approach[0]] === 0, 'N1: the approach tile outside the entrance is floor');
}

// N2: the gold key's container is in the nook's bowl.
{
  const goldCt = state.containers.find((ct) => ct.contents && ct.contents.some((x) => x.role === 'key' && x.id === 'gold'));
  ok(!!goldCt, 'N2: the gold key is in a container');
  ok(goldCt && goldCt.c === bowl[0] && goldCt.r === bowl[1], 'N2: the gold key container is the nook bowl');
}

// N3: the laser emitter sits at a corner of the open side, beam across the entrance.
{
  const laser = state.guards.find((x) => x.laser);
  ok(!!laser, 'N3: the laser exists');
  ok(laser && Math.round((laser.x / T) - 0.5) === emitter[0] && Math.round((laser.y / T) - 0.5) === emitter[1], 'N3: the laser emitter is at the corner of the open side');
  ok(laser && Math.abs(laser.beamDir - Math.PI / 2) < 0.01, 'N3: the beam runs across the entrance (south for the right mouth)');
}

// N4: the nook interior is reachable (the floor tile beside the bowl, through the entrance).
{
  const interior = [bowl[0] + 1, bowl[1]];   // the floor tile beside the bowl (the player stands here to search)
  const spawnTile = [Math.round(state.player.x / T - 0.5), Math.round(state.player.y / T - 0.5)];
  const reach = g.reachable(m, spawnTile, [interior], true);
  ok(reach, 'N4: the nook interior is reachable from spawn (through the entrance)');
}

// N5: the beam, when live, runs across the entrance (you must time it); the bowl is clear.
{
  const laser = state.guards.find((x) => x.laser);
  laser.asleep = false;   // beam live
  // the entrance (the open side) is on the beam
  state.player.x = (entrance[0] + 0.5) * T; state.player.y = (entrance[1] + 0.5) * T;
  ok(g.beamContact(laser) === true, 'N5: the live beam runs across the entrance (the gate is on)');
  // inside the nook (the bowl) you are clear of the beam
  state.player.x = (bowl[0] + 0.5) * T; state.player.y = (bowl[1] + 0.5) * T;
  ok(g.beamContact(laser) === false, 'N5: inside the nook (the bowl) you are clear of the beam');
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
