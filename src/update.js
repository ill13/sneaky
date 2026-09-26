// ============================================================
//  SNEAK RUN - simulation: update(dt) orchestration + player interactions.
//
//  This file owns the frame orchestrator (update) and what the PLAYER does to
//  the world: the rear knockout, the body-drag (grab/hide/drop), the wall-distract,
//  and combat (hitPlayer). The guard's AUTONOMOUS state machine (patrol / chase
//  / search / hear / investigate / dazed / wake) lives in src/ai.js - the AI
//  reacts to you, it doesn't act on you. Motion, sight, and routing are the
//  shared primitives in movement.js / sight.js / path.js.
// ============================================================

// ---------------- Alarm cascade ----------------
// HUSH upgrade lengthens the hide window
const alarmDuration = () => ALARM_DURATION + (state.upgrades.hush ? UPG_HUSH_TIME : 0);

function hitPlayer() {
  state.player.hits++;
  state.player.invuln = PLAYER_INVULN;
  state.flash = 0.4;
  state.player.hp -= 1;
  if (state.player.hp <= 0) {
    state.won = false;
    state.gameOver = true;
    showOverlay('CAUGHT', false);
  } else {
    state.player.stagger = HIT_STAGGER;   // F46: flinch - can't move for a beat
    tripAlarm();                          // global escalation: the compound goes hot
  }
  updateHUD();
}
// F39/F40: a machine's detection (a camera's lock, a laser's beam contact) trips
// the ALARM (not a hit) - the compound goes hot and you have to deal with the
// guards. The forgiving grace model: an escalation, not a CAUGHT, and it never
// increments your hit count.
function machineAlarm() {
  tripAlarm();
  state.spotFlash = 1;
  state.flash = Math.max(state.flash, 0.2);
  updateHUD();
}
// F45: the alarm has a location - the tile it was triggered from (where you are).
// Tripping it goes hot AND sends every awake mobile guard in that room converging
// on the trigger tile, then sweeping it. This is the "the room locks down" beat.
function tripAlarm() {
  state.alarmTime = alarmDuration();
  state.alarmPos = [Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE)];
  convergeGuards();
  state.pendingReinforce = true;   // F45: the room pulls in extra guards (spawned at the top of update)
}
// F45: the room pulls in extra (temporary) guards on an alarm - the reinforcement
// spike. They enter from the far side of the room and converge on the trigger tile.
// Temporary: they peel off when the alarm clears or their timer runs out. Capped by
// REINFORCE_MAX so it's a spike, not a swarm. Spawned outside the guard loop (the
// pendingReinforce flag) so we never mutate state.guards mid-iteration.
function spawnReinforcements() {
  const room = state.alarmPos ? roomAt(state.alarmPos[0], state.alarmPos[1]) : null;
  if (!room || !state.alarmPos) return;
  const existing = state.guards.filter((x) => x.reinforcement).length;
  const toSpawn = Math.max(0, REINFORCE_MAX - existing);
  for (let i = 0; i < toSpawn; i++) {
    const tile = reinforceEntryTile(room, state.alarmPos);
    if (!tile) return;
    const g = makeUnit('guard', 1000 + state.guards.length, makeGuard([[tile[0], tile[1]]]));
    g.x = (tile[0] + 0.5) * TILE; g.y = (tile[1] + 0.5) * TILE;
    g.reinforcement = true;
    g.entryDoor = tile;   // F45: it leaves through the doorway it materialized in
    g.reinforceT = REINFORCE_TIME;
    g.state = 'investigate';
    g.targetTile = [state.alarmPos[0], state.alarmPos[1]];
    g.searchT = CONVERGE_TIME;
    g.pathTiles = [];
    state.guards.push(g);
  }
}
// the entry tile: a floor tile in the room as FAR from the trigger as possible, so
// the reinforcement walks in from the far side (a real "arriving" beat).
// F45: the room's doorway tiles - floor tiles IN the room that sit directly
// against a *threshold* tile (a floor tile in no room - the gap in the internal
// wall). We spawn on the just-inside tile (not the threshold itself) so the
// guard's room stays valid; it's the entrance, so it reads as "coming through
// the door". A reinforcement materializes here and leaves through here.
function roomDoorways(room) {
  const doors = [];
  for (let r = 0; r < state.map.length; r++) {
    for (let c = 0; c < state.map[0].length; c++) {
      if (state.map[r][c] !== 0) continue;
      const rm = roomAt(c, r);
      if (!rm || rm[0] !== room[0] || rm[1] !== room[1]) continue;
      const nbrs = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]];
      for (const [nc, nr] of nbrs) {
        if (state.map[nr] && state.map[nr][nc] === 0 && !roomAt(nc, nr)) { doors.push([c, r]); break; }
      }
    }
  }
  return doors;
}
// F45: where a reinforcement appears - the doorway NEAREST the alarm (the closest
// entrance to the action). Falls back to the farthest floor tile if the room is
// sealed (no doorway).
function reinforceEntryTile(room, alarmTile) {
  const doors = roomDoorways(room);
  if (doors.length) {
    let best = doors[0], bd = Infinity;
    for (const d of doors) {
      const dist = Math.hypot(d[0] - alarmTile[0], d[1] - alarmTile[1]);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }
  let best = null, bd = -1;
  for (let r = 0; r < state.map.length; r++) for (let c = 0; c < state.map[0].length; c++) {
    if (state.map[r][c] !== 0) continue;
    const rm = roomAt(c, r);
    if (!rm || rm[0] !== room[0] || rm[1] !== room[1]) continue;
    const d = Math.hypot(c - alarmTile[0], r - alarmTile[1]);
    if (d > bd) { bd = d; best = [c, r]; }
  }
  return best;
}
// F45: despawn the temporary guards. The alarm clearing peels them all off at once
// (the coast is clear); otherwise each peels off on its own timer.
function stepReinforcements(dt) {
  const alarmClear = state.alarmTime <= 0;
  for (let i = state.guards.length - 1; i >= 0; i--) {
    const g = state.guards[i];
    if (!g.reinforcement) continue;
    g.reinforceT -= dt;
    if (!(alarmClear || g.reinforceT <= 0)) continue;
    if (!g.leaving) {
      // the coast is clear (or its time is up): start the walk-back out its door
      g.leaving = true;
      g.state = 'leave';
      g.targetTile = g.entryDoor;
      g.pathTiles = [];
      continue;
    }
    // leaving: it despawns once it's back at the doorway it came in
    const dx = g.x - (g.entryDoor[0] + 0.5) * TILE, dy = g.y - (g.entryDoor[1] + 0.5) * TILE;
    if (Math.hypot(dx, dy) < TILE) state.guards.splice(i, 1);
  }
}
// F45: every awake mobile guard in the alarm's room heads to the trigger tile and
// sweeps it. Reuses the 'investigate' state (move to target + sweep + resume).
// Machines don't converge (they're fixed), and a guard already chasing is already
// on you, so it's left alone.
function convergeGuards() {
  const room = state.alarmPos ? roomAt(state.alarmPos[0], state.alarmPos[1]) : null;
  if (!room) return;
  for (const g of state.guards) {
    if (g.machine) continue;
    if (g.state === 'down' || g.state === 'hidden' || g.state === 'dazed') continue;
    if (g.asleep) continue;   // a dozing guard is asleep - the alarm doesn't rouse it (only the duty cycle does)
    if (g.state === 'chase') continue;   // already on you
    if (g.room[0] !== room[0] || g.room[1] !== room[1]) continue;   // not in the alarm room
    g.state = 'investigate';
    g.targetTile = [state.alarmPos[0], state.alarmPos[1]];
    g.searchT = CONVERGE_TIME;
    g.pathTiles = [];
  }
}

// ---- The single contextual action (F27) ----
// One button, the context picks the verb. Carrying a body means your hands are
// full: you can only hide it (at a bin) or drop it. Not carrying, guard actions
// beat the wall-distract: knock out an awake guard in your rear arc, else grab a
// downed one, else make a distraction at the wall you're flush against.
// actionContext() is the pure resolver (the HUD lights the button from it);
// tryAction() performs it.

// Is guard g a valid knockout target right now? (upright, rear arc, touch range).
// Pure - shared by the button light and the actual knockout so they can't drift.
function isKnockoutTarget(g) {
  if (g.machine) return false;   // F39: a machine (camera) can't be clubbed - the switch is its kill
  if (g.state === 'down' || g.state === 'hidden') return false;
  const dx = state.player.x - g.x, dy = state.player.y - g.y;
  if (Math.hypot(dx, dy) > KO_DIST) return false;
  // player must be inside the rear arc centered on the guard's opposite side
  if (angleDiff(Math.atan2(dy, dx), g.facing + Math.PI) > KO_REAR / 2) return false;
  return true;
}
// A guard knockable right now? (the button lights on this while not carrying)
function knockoutReady() { return state.guards.some(isKnockoutTarget); }
// Knock out every guard in your rear arc. Returns true if any went down.
function tryKnockout() {
  let hit = false;
  for (const g of state.guards) {
    if (!isKnockoutTarget(g)) continue;
    g.state = 'down';
    g.ko = KO_TIME + (state.upgrades.heavy ? UPG_HEAVY_TIME : 0);   // HEAVY upgrade
    g.pause = 0;
    g.seenFor = 0;
    dropBody(g);   // F34: it topples away from you, out of your shadow
    state.flash = Math.max(state.flash, 0.15);
    hit = true;
  }
  return hit;
}
// F34: a knocked guard drops AWAY from the player along the hit axis (player->guard,
// i.e. the way it was facing), so the downed body reads as "that guard, over there"
// instead of merging with your icon. Wall-checked at several distances, with a
// sideways topple as the fallback when it was facing a wall. Computed once, so the
// body stays put (no sliding) while you walk around to grab it.
function dropBody(g) {
  const p = state.player;
  let dx = g.x - p.x, dy = g.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) { dx = Math.cos(g.facing); dy = Math.sin(g.facing); }   // degenerate: topple forward
  else { dx /= d; dy /= d; }
  const cand = [[dx, dy, 15], [dx, dy, 10], [dx, dy, 6], [-dy, dx, 11], [dy, -dx, 11], [dx, dy, 4]];
  for (const [nx, ny, dist] of cand) {
    const tx = g.x + nx * dist, ty = g.y + ny * dist;
    if (!hitsWall(tx, ty, g.r)) { g.x = tx; g.y = ty; return; }
  }
}
function hideSpotNear(x, y) {
  let best = null, bd = HIDE_DIST;
  for (const s of state.hideSpots) {
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function downGuardNear(x, y) {
  for (const g of state.guards) {
    if (g.state !== 'down' || g === state.carrying) continue;
    if (Math.hypot(x - g.x, y - g.y) < GRAB_DIST) return g;
  }
  return null;
}
// The player's currently-held move direction, [mx, my] in -1..1 (zero when
// nothing is held). Keyboard keys OR'd with the pad, same rule as stepPlayer.
function heldMoveDir() {
  let mx = 0, my = 0;
  if (state.keys['arrowleft'] || state.keys['a'] || state.pad.left) mx -= 1;
  if (state.keys['arrowright'] || state.keys['d'] || state.pad.right) mx += 1;
  if (state.keys['arrowup'] || state.keys['w'] || state.pad.up) my -= 1;
  if (state.keys['arrowdown'] || state.keys['s'] || state.pad.down) my += 1;
  return [mx, my];
}
// The verb the action button would perform right now, or null. Pure - no state
// mutation - so the HUD can light the button from it every frame. The button
// only lights for a distract while you're pressing TOWARD the wall, so the lit
// state is the full trigger: no dead presses.
// F47: is there a crate directly in front of you (the held cardinal direction)?
// Pure - shared by the button light and the pull so they can't drift.
function pullReady(px, py, mdx, mdy) {
  const pc = Math.floor(px / TILE), pr = Math.floor(py / TILE);
  let cc = pc, cr = pr;
  if (mdx > 0 && mdy === 0) cc = pc + 1;
  else if (mdx < 0 && mdy === 0) cc = pc - 1;
  else if (mdy > 0 && mdx === 0) cr = pr + 1;
  else if (mdy < 0 && mdx === 0) cr = pr - 1;
  else return false;
  return !!crateAt(cc, cr);
}

function actionContext() {
  const p = state.player;
  const [mdx, mdy] = heldMoveDir();
  if (state.carrying) {
    // hands full: a free bin = hide, otherwise drop (a wall is not a distraction)
    const spot = hideSpotNear(p.x, p.y);
    return (spot && !spot.occupied) ? 'hide' : 'drop';
  }
  if (knockoutReady()) return 'knockout';       // guard actions beat the wall-distract
  if (downGuardNear(p.x, p.y)) return 'grab';
  if (searchTarget()) return 'search';          // F33: facing an unsearched container
  if (pullReady(p.x, p.y, mdx, mdy)) return 'pull';   // F47: a crate in front - pull it
  if (canDistract(p.x, p.y, mdx, mdy) && state.distractCd <= 0) return 'distract';
  return null;
}
function tryAction() {
  const v = actionContext();
  if (!v) return;
  if (v === 'search') return;   // F33: search is a HOLD (stepSearch), not an edge verb
  if (v === 'pull') return;     // F47: the pull is handled in the movement block (it needs the facing)
  const p = state.player;
  if (v === 'knockout') { tryKnockout(); return; }
  if (v === 'grab') {
    const g = downGuardNear(p.x, p.y);
    state.carrying = g; g.x = p.x; g.y = p.y; return;
  }
  if (v === 'hide') {
    const spot = hideSpotNear(p.x, p.y);
    const g = state.carrying; state.carrying = null;
    g.state = 'hidden'; g.x = spot.x; g.y = spot.y;
    spot.occupied = true; spot.body = g; return;
  }
  if (v === 'drop') { state.carrying = null; return; }
  if (v === 'distract') { doDistract(); return; }
}

// F25: distract. You can only distract when you're flush against a wall or
// obstacle AND pressing into it head-on (F32): the noise is the wall you're
// facing, and "along the wall" doesn't count (30-degree cone, 8-way friendly).
// dx/dy is the held move direction (0,0 = standing still = can't face a wall).
function canDistract(px, py, dx, dy) {
  if (!dx && !dy) return false;
  const inv = 1 / Math.hypot(dx, dy); dx *= inv; dy *= inv;
  const cc = Math.floor(px / TILE), cr = Math.floor(py / TILE);
  for (let r = cr - 2; r <= cr + 2; r++) {
    for (let c = cc - 2; c <= cc + 2; c++) {
      if (solid(c, r, state.map)) {
        const wx = (c + 0.5) * TILE - px, wy = (r + 0.5) * TILE - py;
        const d = Math.hypot(wx, wy);
        if (d < DISTRACT_WALL_DIST + TILE * 0.5 && (wx * dx + wy * dy) / d > DISTRACT_FACE_COS) return true;
      }
    }
  }
  return false;
}
function doDistract() {
  const p = state.player;
  state.distractCd = DISTRACT_COOLDOWN;
  state.distractFx = { x: p.x, y: p.y, t: 0 };
  // guards in YOUR room, within hearing, and not locked on you (patrol or
  // searching) break off and investigate where the noise came from: you, at the
  // wall. A guard that currently sees you keeps chasing (a distraction can't
  // break a lock-on). targetTile is stored in TILE coords (roomPath's domain).
  for (const g of state.guards) {
    if (g.machine) continue;   // F39: a machine can't be lured
    if (g.state !== 'patrol' && g.state !== 'search') continue;
    if (!guardSharesRoom(g)) continue;
    if (Math.hypot(g.x - p.x, g.y - p.y) > DISTRACT_HEARING) continue;
    // freeze + "!" + turn to the sound (hear), then walk to it (investigate)
    g.state = 'hear';
    g.hearT = HEAR_PAUSE;
    g.hearAngle = Math.atan2(p.y - g.y, p.x - g.x);
    g.targetTile = [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
    g.pathTiles = [];
  }
}

// ---- F33: hold-to-search containers ----
// The unopened container you're close to AND facing (press toward it). Pure -
// the HUD lights the ACT button from it too. No target while standing still.
function searchTarget() {
  const p = state.player;
  const [mdx, mdy] = heldMoveDir();
  if (!mdx && !mdy) return null;
  let best = null, bd = SEARCH_RANGE;
  for (const ct of state.containers) {
    if (ct.opened) continue;
    const wx = ct.x - p.x, wy = ct.y - p.y;
    const d = Math.hypot(wx, wy);
    if (d > bd) continue;
    if ((wx * mdx + wy * mdy) / d > DISTRACT_FACE_COS) { bd = d; best = ct; }
  }
  return best;
}
// F43: the switch is a floor plate you occupy, not a button you press. Ticked
// once per frame. While the plate is OCCUPIED (you standing on its tile, or a crate
// parked on it) the target machine is powered off and no timer runs. The moment it
// clears, a grace window (SWITCH_GRACE) keeps it down, then it re-arms. Re-occupying
// cancels the grace (back to fully active). One occupant per tile (player XOR crate).
function stepSwitches(dt) {
  const pc = Math.floor(state.player.x / TILE), pr = Math.floor(state.player.y / TILE);
  for (const sw of state.switches) {
    const held = (pc === sw.c && pr === sw.r) || !!crateAt(sw.c, sw.r);
    const u = state.guards.find((x) => x.id === sw.target.id);
    if (held) {
      if (sw.on) { sw.on = false; if (u) u.disabled = true; state.flash = Math.max(state.flash, 0.15); state.distractFx = { x: sw.x, y: sw.y, t: 0 }; updateHUD(); }
      sw.grace = 0;
    } else if (!sw.on) {
      if (sw.wasHeld) sw.grace = SWITCH_GRACE;   // just released - start the window
      sw.grace -= dt;
      if (sw.grace <= 0) { sw.on = true; if (u) u.disabled = false; updateHUD(); }
    }
    sw.wasHeld = held;
  }
}
// F43: a crate has been shoved - a patrolling guard in the room notices. The crate
// is now in its lane (a waypoint tile it would walk) or right beside it, so it
// stutters (one-time stall) and drops its path to re-route around it (roomPath is
// crate-aware). Machines, sleepers, and anything already reacting are left alone.
function onCrateMoved(b) {
  const room = roomAt(b.c, b.r);
  if (!room) return;
  for (const g of state.guards) {
    if (g.machine || g.asleep || g.state !== 'patrol') continue;
    if (g.room[0] !== room[0] || g.room[1] !== room[1]) continue;
    const onPath = g.pathTiles.some(([c, r]) => c === b.c && r === b.r);
    const near = Math.hypot(g.x - b.x, g.y - b.y) < TILE * 1.5;
    if (onPath || near) { g.pause = CRATE_STALL; g.pathTiles = []; }
  }
}
// Accumulate search progress while you hold ACT on the target container. Called
// every frame from the controller; opens it once the archetype's time is met.
function stepSearch(dt, actHeld) {
  const t = actHeld ? searchTarget() : null;
  if (state.searching && state.searching !== t) state.searching.searchT = 0;   // a partial search is dropped
  if (!t) { state.searching = null; return; }
  t.searchT += dt;
  state.searching = t;
  if (t.searchT >= CONTAINER_TYPES[t.arc].searchTime) openContainer(t);
}
// A container opened: it flips to opened, its noise (if loud) carries, and its
// contents are granted.
function openContainer(ct) {
  ct.opened = true;
  ct.searchT = 0;
  state.searching = null;
  const noise = CONTAINER_TYPES[ct.arc].noise;
  if (noise > 0) doSearchNoise(ct.x, ct.y, noise);
  for (const item of ct.contents) grantItem(item);
  state.flash = Math.max(state.flash, 0.15);
  updateHUD();
}
// Grant one item ref by role. Keys/objectives/upgrades bank; notes are read.
// weapon/gear roles are stubs for the shooting feature.
function grantItem(item) {
  if (item.role === 'key') state.keyBag[item.id] = true;
  else if (item.role === 'objective') state.hasFile = true;
  else if (item.role === 'upgrade') state.upgrades[item.id] = true;
  else if (item.role === 'clue') {
    // F34: a clue names the room that holds a key. Bank the knowledge - the key's
    // room now lights up on the minimap - and toast the note so you read it.
    state.clues[item.keyId] = true;
    state.noteToast = { text: clueText(item.keyId), t: 4.5, clue: true };
  }
  else if (item.role === 'note') {
    const text = NOTE_TEXTS[item.id];
    state.foundNotes.push(text);
    state.noteToast = { text, t: 3, clue: false };
  }
  else if (item.role === 'health') {   // F46: top the hit pool back up 1 (capped)
    state.player.hp = Math.min(PLAYER_HP_MAX, state.player.hp + 1);
    state.flash = Math.max(state.flash, 0.2);
    updateHUD();
  }
}
// Debug (G): bank every item at once - all three keys, the file, all three mods,
// and the knowledge of all clue rooms (so the minimap lights up). It skips the
// COLLECTING, not the run: doors still open on proximity and you still have to
// traverse to the exit. Intended for tuning and playtest setup.
function grantAllItems() {
  for (const k of KEYS) state.keyBag[k.id] = true;
  state.hasFile = true;
  for (const t of UPG_TYPES) state.upgrades[t] = true;
  for (const k of KEYS) state.clues[k.id] = true;
  state.player.hp = PLAYER_HP_MAX;   // F46: the debug grant also tops the hit pool
  state.flash = Math.max(state.flash, 0.2);
  updateHUD();
}
// F33: a loud container's open carries (room-confined) - guards in the room
// within the radius break off to investigate the container, not you.
function doSearchNoise(x, y, radius) {
  const room = roomAt(Math.floor(x / TILE), Math.floor(y / TILE));
  for (const g of state.guards) {
    if (g.machine) continue;   // F39: a machine can't be lured
    if (g.state !== 'patrol' && g.state !== 'search') continue;
    if (!room || g.room[0] !== room[0] || g.room[1] !== room[1]) continue;
    if (Math.hypot(g.x - x, g.y - y) > radius) continue;
    g.state = 'hear';
    g.hearT = HEAR_PAUSE;
    g.hearAngle = Math.atan2(y - g.y, x - g.x);
    g.targetTile = [Math.floor(x / TILE), Math.floor(y / TILE)];
    g.pathTiles = [];
  }
}

function update(dt) {
  // Phase 3.4: drain queued meta intents FIRST - the intro/menu set state.paused,
  // so a queued intent must still be able to advance the frame while frozen.
  processIntents();
  if (state.paused || state.gameOver) {
    if (state.flash > 0) state.flash -= dt;
    return;
  }
  state.elapsed += dt;
  // F45: spawn any queued reinforcements BEFORE the guard loop (never mutate
  // state.guards mid-iteration), then let the temp guards age out.
  if (state.pendingReinforce) { spawnReinforcements(); state.pendingReinforce = false; }
  stepReinforcements(dt);
  if (state.flash > 0) state.flash -= dt;
  if (state.spotFlash > 0) state.spotFlash = Math.max(0, state.spotFlash - dt * 2.5);
  if (state.player.invuln > 0) state.player.invuln -= dt;
  if (state.exitHint > 0) state.exitHint -= dt;
  if (state.distractCd > 0) state.distractCd = Math.max(0, state.distractCd - dt);              // F25: attract cooldown
  if (state.distractFx) { state.distractFx.t += dt; if (state.distractFx.t > 0.7) state.distractFx = null; }   // F25: ripple fades out
  if (state.noteToast) { state.noteToast.t -= dt; if (state.noteToast.t <= 0) state.noteToast = null; }   // F34: the note fades

  // alarm decays while you stay hidden; any guard that can see you re-heats it
  if (state.alarmTime > 0) {
    const anySees = state.guards.some((g) => {
      if (g.state !== 'patrol' && g.state !== 'chase' && g.state !== 'search') return false;
      const s = statsFor(g.type);
      return canSee(g, g.state === 'patrol' ? s.patrolFov : s.chaseFov, s.sightDist * ALARM_RANGE_MULT);
    });
    state.alarmTime = anySees ? alarmDuration() : state.alarmTime - dt;
  }

  // Phase 3: the player's gameplay intents - held move, edge-triggered
  // act/distract, room-bound carried-body follow - are consumed by the controller
  // (src/controller.js stepPlayer). Input capture stays a pure emitter.
  stepPlayer(dt);
  stepSwitches(dt);   // F43: the floor-plate switches (occupancy + grace window)

  // mark the room the player is standing in as remembered (minimap + reveal gate)
  const room = roomAt(Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE));
  if (room) rememberRoom(room[0], room[1]);

  // guards - room-confined: each patrols and hunts only within its own room.
  // Phase 6.2: the per-guard AI is a named rule (stepGuard); the loop is pure
  // orchestration. Behavior is unchanged - stepGuard holds the exact body below
  // (with the alarm-scaled sight/pace helpers moved into it).
  for (const g of state.guards) stepGuard(g, dt);

  // bullets
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { state.bullets.splice(i, 1); continue; }
    if (solid(Math.floor(b.x / TILE), Math.floor(b.y / TILE), state.map)) { state.bullets.splice(i, 1); continue; }
    if (state.player.invuln <= 0 && Math.hypot(b.x - state.player.x, b.y - state.player.y) < state.player.r + 3) {
      state.bullets.splice(i, 1);
      hitPlayer();
    }
  }

  // F33: keys / file / upgrades are found by HOLDING ACT on a container (see
  // stepSearch, called from the controller) - there is no floor pickup anymore.

  // F29: locked doors open when you touch them holding the matching key
  const pc = Math.floor(state.player.x / TILE), pr = Math.floor(state.player.y / TILE);
  for (const k of KEYS) {
    if (state.doorsOpen[k.id] || !state.keyBag[k.id]) continue;
    if (state.doorTiles[k.id].some(([c, r]) => {
      const dc = Math.abs(c - pc), dr = Math.abs(r - pr);
      return dc <= 1 && dr <= 1 && !(dc === 0 && dr === 0);
    })) {
      state.doorsOpen[k.id] = true;
      for (const [c, r] of state.doorTiles[k.id]) {
        state.map[r][c] = 0;
        // F37: give the opened locked door the SAME lintel frame as an ordinary open door.
        // doorLintels is built once at reset, only for gaps already open, so an unlocked
        // door was becoming a bare gap with no frame - a playtester spotted the mismatch.
        // Orientation follows the wall line: vertical lines (c 17/34) take 'v', the rest
        // (horizontal lines y 11/22, where all keyed doors sit) take 'h'.
        const o = (c === 17 || c === 34) ? 'v' : 'h';
        if (!state.doorLintels.some(([lc, lr]) => lc === c && lr === r)) state.doorLintels.push([c, r, o]);
      }
      state.wallEdges = buildWallEdges(state.map);   // cones now clip against the open door
      state.flash = Math.max(state.flash, 0.2);
      updateHUD();
    }
  }

  // exit
  if (Math.hypot(state.player.x - state.exitPos.x, state.player.y - state.exitPos.y) < TILE * 0.7) {
    if (state.hasFile) {
      state.won = true;
      state.gameOver = true;
      showOverlay('ESCAPED IN ' + state.elapsed.toFixed(1) + 's', true);
    } else {
      state.exitHint = 1.2;
    }
  }

  updateHUD();
}
