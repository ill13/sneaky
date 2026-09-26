// ============================================================
//  SNEAK RUN - HUD + overlay + intro modal (DOM text, no canvas)
// ============================================================
const objectiveEl = document.getElementById('objective');
const statusEl = document.getElementById('status');
const powerEl = document.getElementById('power');
const timerEl = document.getElementById('timer');
const seedEl = document.getElementById('seed');
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlay-text');
const overlaySub = document.getElementById('overlay-sub');
const intro = document.getElementById('intro');
const introBox = document.getElementById('intro-box');
const introScrollMark = document.getElementById('intro-scroll');
// ---- hamburger menu (F24): retry / new / seed / help, one panel instead of three buttons ----
const menuEl = document.getElementById('menu');
const btnMenu = document.getElementById('btn-menu');
const menuSeedEl = document.getElementById('menu-seed');
const menuRestart = document.getElementById('menu-restart');
const menuNew = document.getElementById('menu-new');
const menuSeedType = document.getElementById('menu-seedtype');
const menuHelp = document.getElementById('menu-help');
const menuClose = document.getElementById('menu-close');
const actBtn = document.getElementById('btn-act');
const verEl = document.getElementById('ver');
const menuInvEl = document.getElementById('menu-inv');
const briefingEl = document.getElementById('briefing');   // F33: the run briefing
const noteToastEl = document.getElementById('note-toast');   // F34: the note/clue you just read
const roomNameEl = document.getElementById('room-name');   // the "you are here" room label
let lastRoom = null;   // the player's current room (held while in a doorway so it doesn't flicker blank)
if (verEl) verEl.textContent = 'v' + VERSION;   // version tracker next to the title
// "scroll down" cue: the box is scrollable on small screens; show the bobbing
// marker while there is more text below and hide it at the bottom
function introScrollHint() {
  if (!introBox || !introScrollMark) return;
  const scrollable = introBox.scrollHeight > introBox.clientHeight + 4;
  const atBottom = introBox.scrollTop >= introBox.scrollHeight - introBox.clientHeight - 8;
  introScrollMark.style.display = (state.intro && scrollable && !atBottom) ? 'block' : 'none';
}
if (introBox) introBox.addEventListener('scroll', introScrollHint);
addEventListener('resize', introScrollHint);
const introClose = () => {
  state.intro = false;
  state.paused = false;
  intro.classList.add('hidden');
  introScrollHint();
};
const btnPlay = document.getElementById('btn-play');
if (btnPlay) btnPlay.addEventListener('click', introClose);
function showIntro(show) {
  state.intro = show;
  state.paused = show;
  intro.classList.toggle('hidden', !show);
  if (show && briefingEl) briefingEl.textContent = buildBriefing();   // F33: name the rooms that hold the keys + file
  introScrollHint();
}

// ---- hamburger menu (F24) ----
function typeSeed() {
  if (typeof prompt !== 'function') return;
  const v = parseInt(prompt('Seed (0-999999):', String(state.currentSeed)), 10);
  if (v >= 0 && v <= 999999) reset(v);
}
function openMenu(show) {
  if (!menuEl) return;
  state.menuOpen = show;
  menuEl.classList.toggle('hidden', !show);
  if (btnMenu) btnMenu.classList.toggle('open', show);
  state.paused = show;             // freeze the run while the menu is up
}
function closeMenu() { openMenu(false); }
function toggleMenu() { openMenu(menuEl ? menuEl.classList.contains('hidden') : false); }
// toggle the touch-controls overlay (hybrid devices / desktop testing) - the 'C'
// key intent. Extracted from input.js so the controller owns the frame lifecycle.
function toggleTouch() {
  const ui = document.getElementById('touch-ui');
  if (ui) {
    ui.style.display = (getComputedStyle(ui).display === 'block') ? 'none' : 'block';
    window.dispatchEvent(new Event('resize')); // library re-caches touch element rects on resize
  }
}
if (btnMenu) btnMenu.addEventListener('click', toggleMenu);
if (menuHelp) menuHelp.addEventListener('click', () => { closeMenu(); if (!state.gameOver) showIntro(true); });
if (menuRestart) menuRestart.addEventListener('click', () => { closeMenu(); reset(state.currentSeed); });
if (menuNew) menuNew.addEventListener('click', () => { closeMenu(); reset(Math.floor(Math.random() * 1e6)); });
if (menuSeedType) menuSeedType.addEventListener('click', () => { closeMenu(); typeSeed(); });
if (menuClose) menuClose.addEventListener('click', closeMenu);
// tap outside the panel closes it
addEventListener('click', (e) => {
  if (state.menuOpen && menuEl && !menuEl.contains(e.target) && e.target !== btnMenu) closeMenu();
});

function showOverlay(text, isWin) {
  overlayText.textContent = text;
  overlayText.classList.toggle('win', isWin);
  overlaySub.textContent = 'seed ' + state.currentSeed + ' | menu (M): retry / new / type seed';
  overlay.classList.remove('hidden');
}

function updateHUD() {
  const p = state.player;
  if (state.gameOver) return;
  // F29: quest chain - collect all three keys, open the doors, steal the file, escape
  const haveKeys = Object.values(state.keyBag).filter(Boolean).length;
  const allKeys = haveKeys === KEYS.length;
  const reqDoors = KEYS.filter((k) => k.doorSec !== 2 && !state.doorsOpen[k.id]);   // blue (exit) + red (vault) gate the objective
  if (!allKeys) {
    objectiveEl.textContent = 'FIND THE KEYS ' + haveKeys + '/' + KEYS.length;
  } else if (reqDoors.length) {
    objectiveEl.textContent = 'OPEN THE DOORS';
  } else if (!state.hasFile) {
    objectiveEl.textContent = 'STEAL THE FILE';
  } else if (state.exitHint > 0) {
    objectiveEl.textContent = 'ESCAPE NOW - THE COMPOUND IS HOT';
  } else {
    objectiveEl.textContent = 'FIND THE EXIT';
  }
  if (state.alarmTime > 0) {
    statusEl.textContent = 'ALARM - HIDE ' + Math.ceil(state.alarmTime) + 's';
    statusEl.style.color = '#ff5555';
  } else {
    const down = state.guards.find((g) => g.state === 'down');
    if (down) {
      statusEl.textContent = 'GUARD DOWN ' + Math.ceil(down.ko) + 's';
      statusEl.style.color = '#8fd3ff';
    } else if (state.guards.some((g) => g.state === 'chase')) {
      statusEl.textContent = 'SPOTTED! BREAK LOS!';
      statusEl.style.color = '#ffcc44';
    } else {
      statusEl.textContent = state.hasFile ? 'IN THE BAG - GO' : 'CLEAN';
      statusEl.style.color = state.hasFile ? '#66ffcc' : '#8a9b8e';
    }
  }
  // calm states (CLEAN / IN THE BAG / GUARD DOWN) sit still; only danger pulses
  statusEl.classList.toggle('blink', state.alarmTime > 0 || state.guards.some((g) => g.state === 'chase'));
  // the "you are here" room label - names the room you're standing in (held while in a doorway)
  {
    const pc = Math.floor(p.x / TILE), pr = Math.floor(p.y / TILE);
    const cur = roomAt(pc, pr);
    if (cur) lastRoom = cur;
    if (roomNameEl) roomNameEl.textContent = lastRoom ? roomName(lastRoom[0], lastRoom[1]) : '';
  }
  // banked dead-end upgrades
  const got = UPG_TYPES.filter((t) => state.upgrades[t]).map((t) => UPGRADES[t].label);
  powerEl.textContent = got.length ? 'PWR ' + got.join(' ') : '';
  powerEl.classList.toggle('hidden', !got.length);
  timerEl.textContent = state.elapsed.toFixed(1) + 's';
  // seed lives in the menu now (F24); the header is objective + status + timer only
  if (menuSeedEl) menuSeedEl.textContent = String(state.currentSeed);
  // F29: the menu inventory lists the colored keys you've collected
  if (menuInvEl) {
    // F30: the menu is the full inventory - keys, the file, and banked upgrades
    // (with their effect), since the header now shows these as icons only.
    const rows = [];
    for (const k of KEYS) if (state.keyBag[k.id]) rows.push('<span style="color:' + k.color + '">&#9670; ' + k.name + ' KEY</span>');
    // F34: the clue notes you've read - the room each key is in (until you have it)
    for (const k of KEYS) if (state.clues[k.id] && !state.keyBag[k.id]) rows.push('<span style="color:' + k.color + '">&#9656; <i>' + clueText(k.id) + '</i></span>');
    if (state.hasFile) rows.push('<span style="color:#e8f2ff">&#9670; FILE</span>');
    for (const u of UPG_TYPES) if (state.upgrades[u]) rows.push('<span style="color:' + UPGRADES[u].color + '">&#9670; ' + UPGRADES[u].label + ' <i>(' + UPGRADES[u].desc + ')</i></span>');
    if (state.foundNotes.length) rows.push('<span style="color:#c9b98a">&#9670; <i>' + state.foundNotes[state.foundNotes.length - 1] + '</i></span>');   // F33: the latest note you read
    if (rows.length) {
      menuInvEl.className = '';
      menuInvEl.innerHTML = rows.join('<br>');
    } else {
      menuInvEl.className = 'menu-inv-empty';
      menuInvEl.textContent = 'nothing';
    }
  }
  // F34: the note/clue you just read, floating over the play area as it fades
  if (noteToastEl) {
    if (state.noteToast) {
      noteToastEl.textContent = (state.noteToast.clue ? 'NOTE: ' : '') + state.noteToast.text;
      noteToastEl.className = state.noteToast.clue ? 'show clue' : 'show';
    } else noteToastEl.className = '';
  }
  // one contextual button: lit whenever pressing it would do something (the
  // context resolves to a verb), dim when there's nothing to act on here.
  if (actBtn) {
    const ready = (typeof actionContext === 'function') && actionContext() !== null;
    actBtn.classList.toggle('lit', ready);
    actBtn.classList.toggle('dim', !ready);
  }
}
