// ============================================================
//  SNEAK RUN - unit model: the data-driven unit table.
//
//  One row per unit type (Phase 1, mirroring tactics_3d's UNIT_POOL / UNIT_STATS).
//  A unit is a plain object in `state.units` with a `type`; everything shared
//  (size, speed, sight) comes from this table, so a NEW unit type - a strong
//  guard, a VIP - is a new row + a spawn, with no changes to the movement,
//  collision, sight, or AI code.
//
//  Per type:
//    radius     - collision half-extent (px). tryMove reads each unit's own r.
//    moveSpeed  - walking speed (px/sec): the player always, guards on patrol.
//    chaseSpeed - speed while chasing (guards); equals moveSpeed for the player.
//    sightDist  - how far the unit can see (the player is observed, not an
//                 observer, so 0).
//    patrolFov  - the vision cone while patrolling (player: 0).
//    chaseFov   - the vision cone while chasing (wider; player: 0).
//    moveType   - 'free' (steers on its own input; gets the corner-escape assist)
//                 or 'patrol' (follows an A* path; does not free-move).
//
//  The AI state machine (path, room, lastSeen, searchT, hearT, ...) is NOT here -
//  it lives on each guard instance. This table is identity + stats only.
// ============================================================

const UNIT_TYPES = {
  player: {
    radius: 11,
    moveSpeed: PLAYER_SPEED,
    chaseSpeed: PLAYER_SPEED,
    sightDist: 0,
    patrolFov: 0,
    chaseFov: 0,
    moveType: 'free',
  },
  guard: {
    radius: 10,
    moveSpeed: PATROL_SPEED,
    chaseSpeed: CHASE_SPEED,
    sightDist: VISION_RANGE,
    patrolFov: PATROL_FOV,
    chaseFov: CHASE_FOV,
    moveType: 'patrol',
  },
  // F38: the sleeping guard - a normal guard plus the duty-cycle timing flag. It
  // dozes on its patrol round (SLEEP_ON awake / SLEEP_OFF asleep), blind and
  // stationary while down. A future laser is the same `duty` flag, reskinned.
  sleeper: {
    radius: 10,
    moveSpeed: PATROL_SPEED,
    chaseSpeed: CHASE_SPEED,
    sightDist: VISION_RANGE,
    patrolFov: PATROL_FOV,
    chaseFov: CHASE_FOV,
    moveType: 'patrol',
    duty: { on: SLEEP_ON, off: SLEEP_OFF },
  },
  // F39: the camera (the first machine). A stationary floor sensor - no patrol
  // path, no speed. It scans its cone, and a sustained look trips the alarm.
  // Non-knockable, non-distractable: the switch is the only way to stop it.
  camera: {
    radius: 9,
    moveSpeed: 0,
    chaseSpeed: 0,
    sightDist: VISION_RANGE,
    patrolFov: CAM_FOV,
    chaseFov: CAM_FOV,
    moveType: 'machine',
    machine: true,   // can't be clubbed / lured / woken - the switch is its kill
  },
  // F40: the laser (the industrial skin of the duty cycle). A stationary emitter
  // that projects a beam, blinking on/off. No vision cone (the beam is its threat),
  // no switch (its defense is pure timing). Non-knockable, non-distractable.
  laser: {
    radius: 9,
    moveSpeed: 0,
    chaseSpeed: 0,
    sightDist: 0,     // it doesn't cone-see; the beam is the threat
    patrolFov: 0,
    chaseFov: 0,
    moveType: 'machine',
    machine: true,    // can't be clubbed / lured
    duty: { on: LASER_ON, off: LASER_OFF },   // the blinking (shared with the sleeper)
  },
  // F42: the robot (the moving machine). A sentry that patrols a lane (guard
  // movement) with a vision cone (guard sight) - but it's a machine: non-knockable,
  // non-distractable, and it never chases. A sustained look trips the alarm (not a
  // hit), like the camera. Its switch stops it for the run.
  robot: {
    radius: 10,
    moveSpeed: PATROL_SPEED,   // patrols at guard pace
    chaseSpeed: PATROL_SPEED,  // it never chases (kept for table completeness)
    sightDist: VISION_RANGE,
    patrolFov: PATROL_FOV,
    chaseFov: CHASE_FOV,
    moveType: 'patrol',        // it follows an A* path, like a guard
    machine: true,             // can't be clubbed / lured / woken
  },
};

// Stats lookup: type -> its table row. One source of truth for render + rules.
function statsFor(type) {
  const s = UNIT_TYPES[type];
  if (!s) throw new Error('unknown unit type: ' + type);
  return s;
}

// Stamp a freshly-built unit with its identity: `type`, a stable `id`, and the
// radius from the table (the source of truth, overriding any radius the base
// carried). `base` is the type-specific object - the guard AI block from
// makeGuard, or the player's { x, y, invuln, hits }. Returns the same object.
function makeUnit(type, id, base) {
  return Object.assign(base, { type: type, id: id, r: statsFor(type).radius });
}
