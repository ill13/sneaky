# SEARCH - containers, hold-to-search, and the theme seams

**Status: SHIPPED as 0.16.0 (F33), clue notes landed 0.17.0 (F34).** All five
phases are in; the theme-swap is proven by `tools/test-theme.js`. The notes are no
longer flavor: 0.17.0 made them the clue system - each key's room is learned from a
note dealt into the top row, the briefing no longer names key rooms, and a key's
minimap dot lights up only once its note is read. What's left is future content,
not structure: weapons/gear get shooting, a general inventory lands with the first
weapon, and per-theme wall plans (3x3 stays core for now).

Goal: replace "walk over a floor item" with "search a container" - hold the ACT
button while a short timer counts down - and build the data seams so the whole
presentation layer (desks/copiers/safes, offices, the intruder) is a swappable
theme. The core loop - hinted room, search the containers, time the noise, open
the door, take the objective, escape - is theme-agnostic. "Chests in a dungeon"
must later be a data file, not a refactor.

Confirmed with LO (this session):
- No exact item locations on the minimap. The **room** is the hinted objective
  (intro/briefing now, found notes later); the **container** within it is the puzzle.
- Items live in containers, 2-3 per room. "Worthless" flavor items will become
  narrative clues later, so contents are data-driven with stable ids from day one.
- Search noise: yes, a fraction of the lure radius, room-confined, reusing the
  hear->investigate pipeline. Loud is a per-container property.
- Theme seams (container archetypes + item roles + a THEME object) ship in the
  same minor version as the loop.

Layers (the line we don't cross):
1. **Core loop** (theme-agnostic): rooms, walls, doors, fog, guards, sight, alarm,
   the ACT button, hold-to-search, noise, keys-open-doors, objective, escape.
   Reads only roles / archetypes / mech.
2. **Gameplay data** (theme-agnostic, content-specific): `CONTAINER_TYPES`
   (archetypes + stats), `ITEMS` (roles + mech), room roles.
3. **Theme data** (swappable): `THEME` - the only layer that knows "desk". Maps
   archetype/role/room to {name, sprite, palette} and owns the intro copy.

---

## Phase 0 - Decision gates (LO confirms before implementation)

- [ ] **D1 - Search time per archetype.** Recommend: `fast` 1.0s, `mid` 2.0s,
      `loud` 1.5s, `safe` 3.0s. (safe = the objective's home, the tense hold.)
- [ ] **D2 - When the noise fires.** v1 = a single noise event **when the
      container opens** (simple, readable). Continuous whir-while-searching is a
      later option. Recommend: on-open for v1.
- [ ] **D3 - Noise radius.** Locked at **2 tiles (64px)**, room-confined, a named
      constant `SEARCH_NOISE`. (Lure stays `DISTRACT_HEARING` = 5 tiles.)
- [ ] **D4 - Containers per room.** Key/objective rooms (F, D, E, H) get **3**;
      other rooms get **1-2**. Every key room has >=2 so "which container" is a
      real choice.
- [ ] **D5 - Upgrades in containers too.** Consistent with "no exact locations for
      ANY item": the dead-end upgrades (C/F/I) sit in a container in their room.
      Recommend: yes, containers.
- [ ] **D6 - Objective room hint.** The vault (H) is hinted in the briefing like
      the keys (not "obvious"). Recommend: hinted, for consistency.
- [ ] **D7 - Theme-seam scope this version.** Archetypes + item roles (incl.
      weapon/gear as empty stub roles) + one `THEME` (corporate). The **general
      inventory is NOT built yet** - `keyBag`/`upgrades`/`hasFile` stay; they
      become views over a general inventory when weapons land. Recommend: as stated.
- [ ] **D8 - Room-hint bootstrap.** The intro/briefing states each key's room and
      the vault as plain text (a static clue, not a live compass). Later this text
      is replaced by found notes. Recommend: yes.
- [ ] **D9 - Containers are solid furniture.** A container occupies a floor tile
      and blocks movement (like an obstacle), placed off the patrol lanes and
      validated like obstacles (patrols clear + solvable). It stays solid when
      opened (no path recompute). Recommend: solid.

---

## Phase 1 - Data model + theme seams (no behavior change)

Introduce the three layers without changing how the game plays (floor items still
work until Phase 2 moves them into containers).

- [ ] **Item roles (`src/content.js`).** `ITEMS` = a table of item *definitions*:
      `{ id, role, mech }`. Roles: `key` (mech: color, doorSec), `objective`,
      `upgrade` (mech: effect), `note` (mech: text), `weapon` (mech: dmg, cd -
      stub, no instances yet), `gear` (mech: {} - stub). Flavor items are `note`.
      Stable ids so narrative is a content drop-in later.
- [ ] **Container archetypes (`src/content.js`).** `CONTAINER_TYPES = { fast:
      {searchTime, noise}, mid: {...}, loud: {...}, safe: {...} }` (values from
      D1/D3). Pure stats, no names.
- [ ] **THEME object (`src/theme.js` or in content.js).** The default "corporate"
      theme: `containers: {fast:{name,sprite,palette}, ...}`, `items: {key:{name},
      objective:{name}, note:{name}, ...}`, `rooms: {A:{name}, ...}` (3x3 names),
      `player: {name, briefing}`. The ONLY place the strings "desk"/"office"/
      "intruder" live.
- [ ] **Move display strings into THEME.** Room names, item names, and the intro
      copy move out of inline literals into `THEME`. Core loop code never reads a
      theme string - assert this with a test (grep/guard).
- [ ] **Test:** a theme-swap smoke test - swap `THEME` to a stub "pirate" map and
      confirm the core still runs (proves the seam, no pirate art needed).

## Phase 2 - Generator: place containers, assign contents

- [ ] **Place containers per room** (mapgen.js): 2-3 in key/objective rooms, 1-2
      elsewhere (D4). Solid, off-lane, validated like obstacles (D9). Each
      container = `{ id, archetype, tile, contents: [itemIds], opened:false }`.
- [ ] **Assign quest items to containers.** Blue key -> a container in F, gold ->
      D, red -> E, objective -> H (D6), dead-end upgrades -> a container in C/F/I
      (D5). Fill remaining containers with `note` (flavor).
- [ ] **State.** `state.containers` array; `opened` flag per container. `reset()`
      rebuilds from the layout.
- [ ] **Solvability proof.** `validateKeyChain` now proves the *container tile*
      holding each key (and the objective) is reachable, not a bare floor tile.
- [ ] **Retire floor placement** of keys/objective/upgrades (they're in containers
      now). `keyPos`/`filePos`/`upgPos` become "the container that holds them."
- [ ] **Test:** every seed places the right count, quest items land in the right
      rooms' containers, proof holds, patrols clear.

## Phase 3 - Search interaction (controller + update + render)

- [ ] **New action verb: `search`.** In `actionContext()`, facing a container
      (same 30-degree face gate as F32, within `SEARCH_RANGE`) and it's unopened
      -> context is `search`. Guard/kill verbs still beat it.
- [ ] **Hold-to-progress.** ACT is held while context is `search`:
      `searchT += dt` (per current container). Release ACT -> cancel (progress
      resets). Complete at `CONTAINER_TYPES[arch].searchTime` -> open.
- [ ] **On open:** award contents (key -> `keyBag`, objective -> `hasFile`,
      upgrade -> `upgrades`, note -> `state.foundNotes`), set `opened=true`,
      small "found" beat.
- [ ] **Noise (D2/D3).** If the archetype is `loud`, emit one noise event on open
      (radius `SEARCH_NOISE`, room-confined) reusing the hear->investigate path.
- [ ] **Progress UI (render.js).** A ring around the player (or the container)
      filling with `searchT/searchTime`. ACT button shows its held state.
- [ ] **`state.foundNotes`** (array) - the slot where future clues live.
- [ ] **Test:** hold-to-open awards the right item; release cancels; a loud open
      lures an in-range same-room guard; silent opens don't; opened containers
      can't be re-searched.

## Phase 4 - Minimap + HUD + briefing

- [ ] **Minimap:** remove the exact colored item dots. Show containers as generic
      marks in explored rooms (you see the room has stuff, not what's in it).
- [ ] **Briefing (intro/briefing, D8):** text naming each key's room + the vault,
      sourced from `THEME.rooms` + the item->room assignment.
- [ ] **Menu:** a "Found items" list from `state.foundNotes` (flavor now, clues
      later). The F30 inventory row keeps showing carried keys/objective/upgrades.
- [ ] **Objective copy** ("FIND THE KEYS n/3") unchanged.

## Phase 5 - Verification

- [ ] Full headless suite green (gen, units, move, los, cone, guardai, bodies,
      knock, action, intents, serialize, corner, f28, alarm + new search/theme
      tests).
- [ ] check-touch, check-mobile, playtest green.
- [ ] Screenshots: a container in view + progress ring mid-hold; an opened
      container; the minimap with generic container marks (no item dots); the
      briefing naming rooms; the menu Found-items list.
- [ ] Bump minor version (0.16.0), feature-checklist entry.

---

## What this does NOT do (explicitly deferred)

- No second theme (pirate/assassin) - the seam is built, the skins come later.
- No weapons/gear instances and no shooting - the roles are stubs; the general
  inventory lands when weapons do.
- No found-notes-as-real-clues yet - `foundNotes` is populated with flavor text;
  the clue system (notes pointing to rooms, replacing the briefing) is the next
  narrative step.
- No per-theme layouts - the 3x3 stays core; if a theme ever needs its own map,
  the wall plan becomes theme data then.
