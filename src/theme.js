// ============================================================
//  SNEAK RUN - THEME (the swappable presentation layer, F33)
//
//  This is the ONLY layer that knows "desk" / "office" / "intruder". The core
//  loop reads roles / archetypes / mech and NEVER a string in here; rendering
//  and the HUD read this. Swap this object (or load another one) to reskin the
//  whole game - "chests in a dungeon" is a data file, not a refactor.
//
//  Keys used by the rest of the code:
//    THEME.rooms["rc,rr"]            room display names (briefing + future UI)
//    THEME.containers[arch]          { name, glyph } per container archetype
//    THEME.items[role]               { name } per item role
//    THEME.itemsKey[role]            per-key-name override (keys are colored)
//    THEME.player.name / .briefing   who you are + the run's framing line
// ============================================================
const THEME = {
  id: 'corporate',
  player: {
    name: 'the intruder',
    framing: 'One building, nine rooms, three colored keys. Get the contract, leave alive.',
  },
  // the 3x3, room [rc,rr] -> name. A is the spawn, the bottom row is the sealed
  // objective row. These feed the briefing ("the blue key is in East Storage").
  rooms: {
    '0,0': 'the West Office',   // A spawn
    '1,0': 'the Mailroom',      // B
    '2,0': 'the Supply Room',   // C dead end
    '0,1': 'Records',           // D (gold key)
    '1,1': 'the Archives',      // E (red key)
    '2,1': 'East Storage',      // F dead end (blue key)
    '0,2': 'the Loading Dock',  // G exit
    '1,2': 'the Vault',         // H (the contract)
    '2,2': 'the Basement',      // I dead end (gold door)
  },
  containers: {
    fast: { name: 'a desk',         glyph: 'desk',    color: '#6b5d45' },
    mid:  { name: 'a file cabinet', glyph: 'cabinet', color: '#46536a' },
    loud: { name: 'a copier',       glyph: 'copier',  color: '#3f4a52' },
    safe: { name: 'the safe',       glyph: 'safe',    color: '#5c5244' },
  },
  items: {
    key:       { name: 'key' },
    objective: { name: 'the contract' },
    upgrade:   { name: 'a mod' },
    note:      { name: 'a paper' },
    clue:      { name: 'a note' },
  },
};

// The display name of a room (the single owner of room naming - the core loop
// and the minimap read this, never a hardcoded string).
function roomName(rc, rr) { return THEME.rooms[rc + ',' + rr] || ('room ' + rc + ',' + rr); }
// F34: the text of a key clue - "The BLUE key is in East Storage." Generated
// from the key's room + the theme, so a theme swap re-skins the clues too.
function clueText(keyId) {
  const k = KEYS.find((x) => x.id === keyId);
  return 'The ' + k.name + ' key is in ' + roomName(k.room[0], k.room[1]) + '.';
}

// Build the run briefing. F34: the briefing no longer names the key rooms - the
// CLUE notes do. It anchors the objective (the contract, in the Vault, behind
// the red door) and teaches the loop (search the furniture; the notes name the
// rooms). You learn where each key is by finding its note.
function buildBriefing() {
  const rn = (rc, rr) => roomName(rc, rr);
  return THEME.items.objective.name + ' is in ' + rn(ROLE.file[0], ROLE.file[1]) +
    ', behind the red door. The three keys are hidden in the other rooms - search the '
    + 'furniture and read the notes you find: each one names a room.';
}
