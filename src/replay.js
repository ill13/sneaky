// ============================================================
//  SNEAK RUN - replay: the deterministic, serializable run driver (Phase 6.3).
//
//  runReplay(seed, inputFrames, dt) resets to `seed`, feeds each frame's input,
//  steps the real `update(dt)` (and its controller), and records a compact
//  per-frame frame. It reuses update()/the controller - NO duplicated rules - so
//  it can never drift from the live sim.
//
//  `inputFrames` is a plain array; each frame is { keys: ['d',...], pad: {up,...},
//  intents: [{type:...},...] }. Every frame starts clean (keys + pad cleared,
//  intent queue emptied) and then applies ONLY that frame's input - so a recorded
//  stream is the entire "what the player did," and feeding it to a fresh seed
//  reproduces the run. That is the multiplayer / persistence foundation: forward
//  the seed + the input stream. Usable headless (Node) and in the browser.
// ============================================================
function runReplay(seed, inputFrames, dt) {
  if (dt === undefined) dt = 1 / 60;
  reset(seed);
  const frames = [];
  for (const fr of inputFrames) {
    // start each frame clean, then apply ONLY this frame's recorded input
    for (const k in state.keys) delete state.keys[k];
    state.pad.up = state.pad.down = state.pad.left = state.pad.right = state.pad.x = state.pad.y = false;
    if (fr && fr.keys) for (const k of fr.keys) state.keys[k] = true;
    if (fr && fr.pad) {
      state.pad.up = !!fr.pad.up; state.pad.down = !!fr.pad.down;
      state.pad.left = !!fr.pad.left; state.pad.right = !!fr.pad.right;
      state.pad.x = !!fr.pad.x; state.pad.y = !!fr.pad.y;
    }
    state.intentQueue.length = 0;
    if (fr && fr.intents) for (const it of fr.intents) state.intentQueue.push(it);

    update(dt);
    frames.push({
      x: state.player.x, y: state.player.y,
      guards: state.guards.map((g) => g.state),
      keyBag: Object.assign({}, state.keyBag), file: state.hasFile,   // F29: per-color inventory
      alarm: state.alarmTime > 0,
      won: state.won, over: state.gameOver,
    });
  }
  return { frames, seed };
}
