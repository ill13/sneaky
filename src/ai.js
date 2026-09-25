// ============================================================
//  SNEAK RUN - guard AI: the room-confined pursuit state machine.
//
//  PROVENANCE (Phase 3.3, moved to its own file in Phase 7.2): the guard AI is
//  stats-parameterized and reaches motion, sight, and routing ONLY through the
//  shared primitives - every guard row is read once as `const s = statsFor(g.type)`
//  and drives followPath (-> tryMove, radius-aware), canSee/hasLOS, and roomPath
//  (A*). There is no bespoke collision, no bespoke sight, and no hardcoded
//  radius/fov/range. So a new guard type (a strong guard, a VIP) is
//  behavior-parameterized by its UNIT_TYPES row, not a parallel code path - the
//  only literals left are combat-feel constants (contact distance, bullet spawn
//  offset), which are shared by all guards on purpose.
//
//  A guard lives in one room and never crosses a door. Its pursuit is a
//  4-connected A* over the room's interior rectangle, so a path can't route
//  through a wall opening. When the player slips out, the guard chases to the
//  last-seen tile (a door-edge tile if you're across the gap), holds a "search"
//  there, then returns to its patrol - the room is its own puzzle and it keeps
//  no memory past the beat.
//
//  SCOPE: this file is ONLY the guard's autonomous state machine (patrol / chase
//  / search / hear / investigate / dazed / wake). What the PLAYER does to a guard
//  (the rear knockout and the wall-distract) lives in update.js - the AI reacts to
//  you, it doesn't act on you. Pathfinding itself lives in src/path.js - the ONE
//  algorithm, A* over the room's walkable tiles (roomPath / AStar); this file
//  only picks a goal tile and follows the returned path, it never rolls its own.
// ============================================================

// Step the guard along its A* path; returns true when it has reached the end.
function followPath(g, speed, dt) {
  if (!g.pathTiles.length) return true;
  while (g.wpTile < g.pathTiles.length) {
    const [c, r] = g.pathTiles[g.wpTile];
    const cx = (c + 0.5) * TILE, cy = (r + 0.5) * TILE;
    const dx = cx - g.x, dy = cy - g.y;
    const d = Math.hypot(dx, dy);
    if (d < 3) { g.wpTile++; continue; }
    g.facing = Math.atan2(dy, dx);
    const step = speed * dt;
    if (step >= d) { g.x = cx; g.y = cy; g.wpTile++; }
    else { tryMove(g, (dx / d) * step, (dy / d) * step); break; }
  }
  return g.wpTile >= g.pathTiles.length;
}
// A guard giving up on you: back to its patrol from the nearest waypoint.
function resumePatrol(g) {
  g.state = 'patrol';
  g.pause = 0.5;
  g.pathTiles = [];   // drop the chase path so patrol re-paths to the waypoint
  g.wpTile = 0;
  let best = 0, bd = Infinity;
  g.path.forEach((p, i) => { const dd = Math.hypot(p.x - g.x, p.y - g.y); if (dd < bd) { bd = dd; best = i; } });
  g.wp = (best + 1) % g.path.length;
}
// You've been seen: enter the chase, seed the pursuit from your live position.
function enterChase(g) {
  g.state = 'chase';
  g.seenFor = 0;
  g.lastSeen.x = state.player.x; g.lastSeen.y = state.player.y;
  const tt = nearestFloorTile(g.room[0], g.room[1], state.player.x, state.player.y);
  g.targetTile = tt;
  g.pathTiles = tt ? roomPath(g, tt[0], tt[1]) : [];
  g.wpTile = 0;
  state.spotFlash = 1;
}
// shortest signed turn from angle a to angle b (radians) - swinging a guard to face the sound
function angleTo(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// A guard waking up: still close enough = instant spot, otherwise a dazed wobble
function wakeGuard(g) {
  const d = Math.hypot(state.player.x - g.x, state.player.y - g.y);
  if (d < WAKE_SPOT_DIST) {
    g.state = 'chase';
    g.seenFor = 0;
    g.facing = Math.atan2(state.player.y - g.y, state.player.x - g.x);
    return;
  }
  g.state = 'dazed';
  g.daze = DAZE_TIME;
}
// F28: an awake guard stumbles over a downed one and shakes it awake - the body
// stirs toward the waker, wobbles (dazed), then resumes patrol.
function wakeBody(g, wakerX, wakerY) {
  g.state = 'dazed';
  g.daze = DAZE_TIME;
  g.facing = Math.atan2(wakerY - g.y, wakerX - g.x);
}

// F38: advance a unit's duty cycle (the shared "timing" flag). A unit with no
// duty (a normal guard, the player) is untouched. A sleeper dozes on its patrol
// round: awake for duty.on, asleep for duty.off, flipping g.asleep. Ticked only
// in patrol, so a guard that's chasing you never falls asleep mid-pursuit.
function tickDuty(g, dt) {
  const duty = statsFor(g.type).duty;
  if (!duty) return;
  g.dutyT += dt;
  const dur = g.asleep ? duty.off : duty.on;
  if (g.dutyT >= dur) { g.dutyT -= dur; g.asleep = !g.asleep; }
}

// F40: is the player touching the laser's beam? The beam is a line-segment from
// the emitter (g.x,g.y) in beamDir for beamLen. Contact = the player's center is
// within (player.r + BEAM_THICK) of the segment. Pure - reads state only.
function beamContact(g) {
  const x0 = g.x, y0 = g.y;
  const x1 = x0 + Math.cos(g.beamDir) * g.beamLen, y1 = y0 + Math.sin(g.beamDir) * g.beamLen;
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(state.player.x - x0, state.player.y - y0) < state.player.r + BEAM_THICK;
  let t = ((state.player.x - x0) * dx + (state.player.y - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x0 + t * dx, cy = y0 + t * dy;
  return Math.hypot(state.player.x - cx, state.player.y - cy) < state.player.r + BEAM_THICK;
}

// One guard's AI step (Phase 6.2): the room-confined state machine, extracted
// from update()'s guard loop into a named rule so the AI is a testable unit.
// Behavior is byte-identical to the loop body it came from. It reaches motion /
// sight / routing ONLY through the shared primitives (followPath -> tryMove,
// canSee/hasLOS, roomPath) and reads the guard's own row via statsFor(g.type) -
// the alarm-scaled sight/pace helpers live here now (they were only used by the
// guard loop).
function stepGuard(g, dt) {
  const alarmOn = state.alarmTime > 0;
  const visionRangeFor = (s) => alarmOn ? s.sightDist * ALARM_RANGE_MULT : s.sightDist;
  const chaseSpeedFor = (s) => alarmOn ? s.chaseSpeed * ALARM_SPEED_MULT : s.chaseSpeed;
  const moveSpeedFor = (s) => alarmOn ? s.moveSpeed * ALARM_PATROL_SPEED_MULT : s.moveSpeed;

  // hidden in a bin (F23): inert forever, never wakes
  if (g.state === 'hidden') return;
  // knocked out: lies there, does nothing (frozen while being carried, F23)
  if (g.state === 'down') {
    if (state.carrying === g) return;
    g.ko -= dt;
    if (g.ko <= 0) wakeGuard(g);
    return;
  }
  // dazed: wobbles in place, blind
  if (g.state === 'dazed') {
    g.daze -= dt;
    if (g.daze <= 0) resumePatrol(g);
    return;
  }

  // F39: a camera (machine) - stationary, scans its cone, accumulates a
  // detection fuse, and trips the alarm when it locks on. Disabled (by the
  // switch) it's powered off: no vision, no threat. Machines never chase.
  if (g.camera) {
    if (g.disabled) { g.seenFor = 0; return; }
    g.camT += dt;
    g.facing = g.camBase + Math.sin(g.camT * CAM_PAN_SPEED) * CAM_PAN_RANGE;
    const cs = statsFor(g.type);
    if (canSee(g, cs.patrolFov, visionRangeFor(cs))) {
      g.seenFor += dt;
      if (g.seenFor >= CAM_LOCK) { g.seenFor = 0; machineAlarm(); }
    } else g.seenFor = 0;
    return;
  }

  // F40: a laser (machine) - stationary, its beam blinks on/off on the duty
  // cycle (shared with the sleeper: !asleep = live, asleep = dormant). Touch the
  // live beam and it trips the ALARM (an escalation, not a hit). No switch.
  if (g.laser) {
    tickDuty(g, dt);
    if (!g.asleep && beamContact(g)) { g.beamHit = true; machineAlarm(); }
    else g.beamHit = false;
    return;
  }

  // F28: post guard - stuck at its post, only its head turns. It swings through
  // the four cardinal directions in 90-degree steps, holding each, to monitor
  // the room. It sees you (the alarm re-heat reads canSee) and can tag you if
  // you're close, but it never leaves its post.
  if (g.post) {
    g.postT -= dt;
    if (g.postT <= 0) { g.postStep = (g.postStep + 1) % 4; g.postT = POST_SCAN_HOLD; }
    const target = g.postBase + g.postStep * (Math.PI / 2);
    const da = angleTo(g.facing, target);
    const turn = POST_SWING * dt;
    if (Math.abs(da) <= turn) g.facing = target; else g.facing += Math.sign(da) * turn;
    const s = statsFor(g.type);
    if (canSee(g, s.patrolFov, visionRangeFor(s))) state.spotFlash = 1;
    const dx = state.player.x - g.x, dy = state.player.y - g.y;
    const d = Math.hypot(dx, dy);
    g.shootCd -= dt;
    // F36: a sentry only fires on what it's LOOKING at - the same 72-deg gaze it uses to
    // spot you. Inside its blind spot (behind/side of the cone) it neither spots nor shoots,
    // so the rear-arc knockout is actually reachable without eating a facefull of lead. This
    // is what made it "feel 360" before: it fired in a 60px ring all around, in the dark.
    const looking = angleDiff(Math.atan2(dy, dx), g.facing) <= s.patrolFov / 2;
    if (d < SHOOT_RANGE && looking && hasLOS(g.x, g.y, state.player.x, state.player.y) && g.shootCd <= 0) {
      const a = Math.atan2(dy, dx);
      state.bullets.push({
        x: g.x + Math.cos(a) * 12, y: g.y + Math.sin(a) * 12,
        vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, life: BULLET_LIFE,
      });
      g.shootCd = SHOOT_CD;
    }
    if (d < 18 && state.player.invuln <= 0) hitPlayer();
    return;
  }

  // F38: the duty cycle (sleep) - sleepers only, and only in patrol (a guard
  // chasing you stays alert). Ticked before `sees` so vision reflects the state.
  if (g.state === 'patrol') tickDuty(g, dt);

  const s = statsFor(g.type);
  const sees = canSee(g, g.state === 'patrol' ? s.patrolFov : s.chaseFov, visionRangeFor(s));

  // F28: an awake mobile guard stumbles over a downed one and shakes it awake.
  // One wake per frame is plenty; needs clear line of sight. Carried bodies are
  // being dragged to a bin, not lying in the open, so they're never woken this way.
  if (g.state === 'patrol' || g.state === 'chase' || g.state === 'search' || g.state === 'investigate') {
    for (const b of state.guards) {
      if (b !== g && b.state === 'down' && state.carrying !== b &&
          Math.hypot(b.x - g.x, b.y - g.y) < WAKE_DISCOVER_DIST && hasLOS(g.x, g.y, b.x, b.y)) {
        wakeBody(b, g.x, g.y);
        break;
      }
    }
  }

  if (g.state === 'patrol') {
    if (g.asleep) return;   // F38: dozing in place - stationary + blind (canSee is false)
    if (sees) {
      enterChase(g);
    } else if (g.pause > 0) {
      g.pause -= dt;
    } else {
      // Walk to the current patrol waypoint with A*, not a straight line: a
      // guard returning from a chase is off its lane, and beelining to the
      // waypoint could slam it into an obstacle where it'd stall forever.
      // Re-path only when the current path is spent (one A* per waypoint).
      if (!g.pathTiles.length) {
        const t = g.path[g.wp];
        g.pathTiles = roomPath(g, Math.floor(t.x / TILE), Math.floor(t.y / TILE));
        g.wpTile = 0;
      }
      if (followPath(g, moveSpeedFor(s), dt)) {
        const t = g.path[g.wp];
        if (Math.hypot(t.x - g.x, t.y - g.y) < 3) {
          g.wp = (g.wp + 1) % g.path.length;
          g.pathTiles = [];
          g.pause = 0.7;
        }
      }
    }
  } else if (g.state === 'chase') {
    const dx = state.player.x - g.x, dy = state.player.y - g.y;
    const d = Math.hypot(dx, dy);
    if (sees) {
      // still on you: the goal tracks your live tile (a door-edge tile when
      // you're across the gap), so the guard walks to the farthest it can get.
      g.lastSeen.x = state.player.x; g.lastSeen.y = state.player.y;
      g.seenFor = 0;
      const tt = nearestFloorTile(g.room[0], g.room[1], state.player.x, state.player.y);
      if (!g.targetTile || (tt && (tt[0] !== g.targetTile[0] || tt[1] !== g.targetTile[1]))) {
        g.targetTile = tt;
        g.pathTiles = tt ? roomPath(g, tt[0], tt[1]) : [];
        g.wpTile = 0;
      }
    } else {
      g.seenFor += dt;
    }
    const arrived = followPath(g, chaseSpeedFor(s), dt);
    // reached the last-seen tile and can't make it (lost you, or you're across
    // the door it can't cross) -> hold a search, then return to patrol.
    const prm = roomAt(Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE));
    const playerInRoom = !!(prm && prm[0] === g.room[0] && prm[1] === g.room[1]);
    if (arrived && (!sees || !playerInRoom)) {
      g.state = 'search';
      g.searchT = alarmOn ? SEARCH_TIME * ALARM_SEARCH_MULT : SEARCH_TIME;   // while hot, they keep hunting longer
    }
    // shoot when close and unobstructed
    g.shootCd -= dt;
    if (d < SHOOT_RANGE && hasLOS(g.x, g.y, state.player.x, state.player.y) && g.shootCd <= 0) {
      const a = Math.atan2(dy, dx);
      state.bullets.push({
        x: g.x + Math.cos(a) * 12, y: g.y + Math.sin(a) * 12,
        vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED,
        life: BULLET_LIFE,
      });
      g.shootCd = SHOOT_CD;
    }
    // touch = hit too
    if (d < 18 && state.player.invuln <= 0) hitPlayer();
  } else if (g.state === 'hear') {   // F25: just heard the noise - freeze, turn to the sound, then go
    if (sees) { enterChase(g); }   // it turned to the sound and found you right there
    else {
      const da = angleTo(g.facing, g.hearAngle);   // swing the gaze to where the noise came from
      const turn = 5.0 * dt;                        // rad/sec - a quick, readable turn
      if (Math.abs(da) <= turn) g.facing = g.hearAngle;
      else g.facing += Math.sign(da) * turn;
      g.hearT -= dt;
      if (g.hearT <= 0) { g.state = 'investigate'; g.searchT = DISTRACT_INVESTIGATE; g.pathTiles = []; }
    }
  } else if (g.state === 'investigate') {   // F25: lured to a wall by a distraction
    if (sees) {
      enterChase(g);
    } else {
      if (!g.pathTiles.length) g.pathTiles = roomPath(g, g.targetTile[0], g.targetTile[1]);
      if (followPath(g, moveSpeedFor(s), dt)) {
        g.facing += 2.2 * dt;                 // sweep at the noise, looking around
        g.searchT -= dt;
        if (g.searchT <= 0) resumePatrol(g);
      }
    }
  } else { // search
    if (sees) {
      enterChase(g);
    } else {
      g.facing += 2.2 * dt;   // sweep the room, looking around
      g.searchT -= dt;
      if (g.searchT <= 0) resumePatrol(g);
    }
  }
}
