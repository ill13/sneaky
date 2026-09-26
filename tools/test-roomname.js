// ============================================================
//  The "you are here" room label (HUD). Names the room the player is standing
//  in, held while in a doorway so it never flickers blank. The label's text is
//  the data source render() mirrors onto the canvas. Keep green.
// ============================================================
const { loadGame } = require('./load-game.cjs');
const g = loadGame();
const { state } = g;
const T = g.TILE;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// find a floor tile in a room (absolute coords)
function floorIn(rc, rr) {
  const ox = 1 + rc * 17, oy = 1 + rr * 11;
  outer: for (let r = oy + 1; r < oy + 10; r++) for (let c = ox + 1; c < ox + 16; c++) if (state.map[r][c] === 0) return [c, r];
  return null;
}
function go(c, r) { state.player.x = (c + 0.5) * T; state.player.y = (r + 0.5) * T; }

// R1: at spawn the label names the spawn room (the West Office, room A)
{
  g.reset(42);
  g.update(1 / 60);
  ok(g.roomNameLabel() === 'the West Office', 'R1: the spawn label is the West Office (got ' + JSON.stringify(g.roomNameLabel()) + ')');
}

// R2: the label follows the player into other rooms
{
  g.reset(42);
  const d = floorIn(0, 1);   // D = Records
  go(d[0], d[1]); g.update(1 / 60);
  ok(g.roomNameLabel() === 'Records', 'R2: entering D, the label is Records (got ' + JSON.stringify(g.roomNameLabel()) + ')');
  const h = floorIn(1, 2);   // H = the Vault
  go(h[0], h[1]); g.update(1 / 60);
  ok(g.roomNameLabel() === 'the Vault', 'R2: entering H, the label is the Vault (got ' + JSON.stringify(g.roomNameLabel()) + ')');
}

// R3: in a doorway (roomAt null) the label holds the last room, not blank
{
  g.reset(42);
  // scan for a threshold tile: a floor tile that is in no room
  let door = null;
  outer: for (let r = 1; r < g.ROWS - 1 && !door; r++) for (let c = 1; c < g.COLS - 1 && !door; c++) {
    if (state.map[r][c] === 0 && g.roomAt(c, r) === null) door = [c, r];
  }
  if (door) {
    const a = floorIn(0, 0);
    go(a[0], a[1]); g.update(1 / 60);
    const inRoom = g.roomNameLabel();
    go(door[0], door[1]); g.update(1 / 60);
    ok(g.roomNameLabel() === inRoom && inRoom !== '', 'R3: in a doorway the label holds the last room (got ' + JSON.stringify(g.roomNameLabel()) + ')');
  } else {
    ok(true, 'R3: (no threshold tile found - skipped)');
  }
}

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL room-label CHECKS PASSED');
process.exit(fails ? 1 : 0);
