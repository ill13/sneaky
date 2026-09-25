// ============================================================
//  SNEAK RUN - controller: consumes the player's intents, mutates state.
//
//  Phase 3 (H1 = full). Input capture (input.js, controls.js) never mutates
//  game state - it only RECORDS raw held input (state.keys / state.pad) and
//  EMITs plain-data meta intents into state.intentQueue. This file is the
//  single consumer, mirroring tactics_3d's createController/processIntent
//  adapted to real-time:
//
//    stepPlayer(dt)    the player's gameplay intents for one frame: the held
//                      move (keys OR'd with pad -> freeMove), the edge-triggered
//                      act (knockout / grab / hide / distract), and the room-bound
//                      carried-body follow. This is the exact block that lived
//                      inline in update.js, moved here so the whole player path
//                      is one unit and input stays a pure emitter.
//
//    processIntents()  drains state.intentQueue of meta intents (restart,
//                      newSeed, typeSeed, menu, help, intro). Runs even while
//                      paused (intro/menu set state.paused), so a queued intent
//                      can always advance the frame. Added in slice 3.4.
//
//  Everything it calls (freeMove, tryAction, doDistract, canDistract, roomAt, reset,
//  toggleMenu, ...) is a global resolved at call time; this file just needs to
//  load before main.js so the loop can reach it.
// ============================================================

// The player's gameplay intents, one frame. Behavior is byte-identical to the
// block it replaced in update.js - this is a move, not a change.
function stepPlayer(dt) {
  // player (keyboard keys OR'd with gamepad/touch directions - heldMoveDir in
  // update.js is the single source, also used by the direction-aware distract)
  const [mx, my] = heldMoveDir();
  if (mx || my) {
    // F43: the push runs BEFORE the free-move - shove a crate one tile out of the
    // way, then the player's collision slides them into the vacated space. A crate
    // you can't push (far tile blocked, or you're not head-on on it) is solid.
    const pushed = tryPushCrate(state.player, mx, my);
    if (pushed) onCrateMoved(pushed);
    const len = Math.hypot(mx, my);
    const speed = statsFor('player').moveSpeed * (state.upgrades.stim ? UPG_STIM_MULT : 1) * (state.carrying ? CARRY_SPEED_MULT : 1);
    // Phase 1.3: the player free-moves through freeMove (movement.js), the shared
    // movement path that also carries the corner-escape assist - so any future
    // free-steering unit (VIP, a stronger roamer) inherits it for free.
    freeMove(state.player, (mx / len) * speed * dt, (my / len) * speed * dt);
  }
  // action (F27): ONE contextual button - E / Space (key) or X / Y (pad) or the
  // touch ACT button. Edge-triggered (one verb per press); tryAction() picks the
  // verb from context (knockout / grab / hide / distract / drop). The distract is
  // no longer a separate input - it's the wall-branch of this one contextual action.
  const act = !!(state.keys['e'] || state.keys[' '] || state.pad.x || state.pad.y);
  if (act && !state.actionPrev) tryAction();
  state.actionPrev = act;
  stepSearch(dt, act);   // F33: hold ACT on a container to search it (a hold, not an edge)
  // the carried body follows you, but is ROOM-BOUND: it can't go through a
  // doorway, so the moment you cross the threshold (roomAt -> null/other room)
  // it drops back at the last in-room tile and you're released from it.
  if (state.carrying) {
    const cg = state.carrying;
    const pr = roomAt(Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE));
    if (!pr || pr[0] !== cg.room[0] || pr[1] !== cg.room[1]) state.carrying = null;
    else { cg.x = state.player.x; cg.y = state.player.y; }
  }
}

// Consume queued meta intents (Phase 3.4). Runs at the TOP of update(), BEFORE
// the paused early-return, because the intro/menu both set state.paused - so a
// queued intent must still be able to advance the frame (dismiss the intro, open
// the menu, restart) while the run is frozen. This reproduces the exact state-
// machine that used to live inline in the keydown/poll handlers; input capture
// now only EMITs these plain-data intents.
function processIntents() {
  const q = state.intentQueue;
  while (q.length) {
    const it = q.shift();
    switch (it.type) {
      case 'dismissIntro':
        if (state.intro) introClose();
        break;
      case 'restart':
        reset(state.currentSeed);              // retry the same seed (mid-run / game over)
        break;
      case 'newSeed':
        reset(Math.floor(Math.random() * 1e6)); // roll a fresh run (reset also closes the intro)
        break;
      case 'typeSeed':
        typeSeed();
        break;
      case 'toggleMenu':
        toggleMenu();
        break;
      case 'closeMenu':
        if (state.menuOpen) closeMenu();
        break;
      case 'help':
        if (state.intro) introClose();
        else if (!state.gameOver) showIntro(true);
        break;
      case 'toggleTouch':
        toggleTouch();
        break;
      case 'grantAll':   // debug (G): bank every item (keys + file + mods + clue knowledge)
        grantAllItems();
        break;
    }
  }
}
