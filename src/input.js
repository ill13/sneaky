// ============================================================
//  SNEAK RUN - input: keyboard
//  Phase 3 (H1=full): this file NEVER mutates game state. It only records the
//  held key (state.keys) and EMITs plain-data meta intents into
//  state.intentQueue. The controller (src/controller.js processIntents)
//  consumes them next frame, reproducing this exact state-machine. Behavior
//  is unchanged - the actions just move behind an intent boundary so the whole
//  input stream is serializable (replay + multiplayer).
// ============================================================
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  state.keys[k] = true;

  if (state.intro) {
    // During the intro: N starts a fresh run; a move key / Enter dismisses it;
    // T / M / Esc / ? / C still work (R does nothing while the intro is up).
    if (k === 'n') state.intentQueue.push({ type: 'newSeed' });
    else if (['enter', 'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k))
      state.intentQueue.push({ type: 'dismissIntro' });
    else if (k === 't') state.intentQueue.push({ type: 'typeSeed' });
    else if (k === 'm') state.intentQueue.push({ type: 'toggleMenu' });
    else if (k === 'escape' && state.menuOpen) state.intentQueue.push({ type: 'closeMenu' });
    else if (k === '?') state.intentQueue.push({ type: 'help' });
    else if (k === 'c') state.intentQueue.push({ type: 'toggleTouch' });
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    return;
  }

  // Not in the intro. R / Enter retry the same seed; N rolls a new one.
  if (k === 'r' || k === 'enter') state.intentQueue.push({ type: 'restart' });
  else if (k === 'n') state.intentQueue.push({ type: 'newSeed' });
  else if (k === 't') state.intentQueue.push({ type: 'typeSeed' });
  else if (k === 'm') state.intentQueue.push({ type: 'toggleMenu' });
  else if (k === 'escape' && state.menuOpen) state.intentQueue.push({ type: 'closeMenu' });
  else if (k === '?') state.intentQueue.push({ type: 'help' });
  else if (k === 'c') state.intentQueue.push({ type: 'toggleTouch' });
  else if (k === 'g') state.intentQueue.push({ type: 'grantAll' });   // debug: bank every item

  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
});
addEventListener('keyup', (e) => { state.keys[e.key.toLowerCase()] = false; });
