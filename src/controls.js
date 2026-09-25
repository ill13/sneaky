// ============================================================
//  SNEAK RUN - controls: gamepad + touch
//  Vendored responsive-gamepad (Apache 2.0, src/vendor/) normalizes
//  keyboard + gamepad + touch into one state object. Keyboard stays
//  in input.js; this maps pad/touch into state.pad and edge-triggers
//  the meta actions from gamepad face buttons + touch buttons.
//  A = retry / start   B = new seed   X = act (contextual: knockout/grab/hide/distract)
//  (seed entry moved into the menu; gamepad keeps A/B for retry/new)
// ============================================================
(function () {
  // UMD exposes window.ResponsiveGamepad.ResponsiveGamepad (rollup default-export quirk);
  // accept a bare singleton too, and no-op in headless node tests.
  const RG = typeof ResponsiveGamepad !== 'undefined'
    ? (ResponsiveGamepad.ResponsiveGamepad || ResponsiveGamepad)
    : null;
  if (!RG || typeof RG.enable !== 'function') return;
  const I = RG.RESPONSIVE_GAMEPAD_INPUTS;
  RG.enable();

  // ---- touch UI (shown via CSS on coarse-pointer devices) ----
  // 4-way d-pad: one hold-button per direction. DPAD_* ids feed the derived
  // UP/DOWN/LEFT/RIGHT that poll() merges into state.pad; hold two for a diagonal.
  const dpadUp = document.getElementById('dpad-up');
  if (dpadUp) RG.TouchInput.addButtonInput(dpadUp, I.DPAD_UP);
  const dpadDown = document.getElementById('dpad-down');
  if (dpadDown) RG.TouchInput.addButtonInput(dpadDown, I.DPAD_DOWN);
  const dpadLeft = document.getElementById('dpad-left');
  if (dpadLeft) RG.TouchInput.addButtonInput(dpadLeft, I.DPAD_LEFT);
  const dpadRight = document.getElementById('dpad-right');
  if (dpadRight) RG.TouchInput.addButtonInput(dpadRight, I.DPAD_RIGHT);
  // one contextual action button (F27): maps to pad X. E / Space (keyboard) and
  // pad Y are aliases of the SAME contextual action in the controller.
  const btnAct = document.getElementById('btn-act');
  if (btnAct) RG.TouchInput.addButtonInput(btnAct, I.X);

  // ---- merge pad/touch into the game, once per frame ----
  let prevA = false, prevB = false;
  function poll() {
    const s = RG.getState();
    state.pad.up = !!s.UP;
    state.pad.down = !!s.DOWN;
    state.pad.left = !!s.LEFT;
    state.pad.right = !!s.RIGHT;
    state.pad.x = !!s.X;   // the contextual action (primary): held, consumed by the controller
    state.pad.y = !!s.Y;   // the contextual action (alias): held, consumed by the controller
    // meta actions, edge-triggered -> EMITTED as intents (the controller consumes
    // them). A = dismiss the intro if up, else retry the same seed; B = new seed.
    if (s.A && !prevA) state.intentQueue.push({ type: state.intro ? 'dismissIntro' : 'restart' });
    if (s.B && !prevB) state.intentQueue.push({ type: 'newSeed' });
    prevA = !!s.A; prevB = !!s.B;
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);
})();
