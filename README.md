# SNEAK RUN

A real-time, room-by-room stealth burner. The facility is a 3x3 grid of rooms; each
room is its own little level. The three colored keys, the file, and the upgrades are
hidden inside furniture - desks, cabinets, copiers, the safe. You don't know where
the keys are yet: the notes left in the furniture name their rooms. Search the rooms
up top, read what you find, and each room lights up on the minimap. Hold ACT on a
container to search it, open the matching doors on the sealed bottom row, take the
file, and reach the exit - without getting spotted. Silent quarter: no audio, no
compass, no exact objective marker. The fog is the game.

Plain HTML/CSS/JS. Zero dependencies. No build step. Works from `file://` - open
`index.html`. Mobile-first (portrait is the primary target), keyboard + gamepad +
touch all supported.

## Controls
- Move: `WASD` / arrows / d-pad / gamepad left stick
- Act (one contextual button): `E` / `Space` / pad X / pad Y / touch ACT. The verb comes from context, not the key: **knock out** an awake guard in your rear arc, **grab** a downed one, **hide** it at a bin (or **drop** it while your hands are full), **search** the furniture you're facing (hold it - a ring fills while you work), or **distract** the guards by pressing toward the wall you're flush against (the noise is the wall you're facing, so drifting along a wall never fires it). Guard actions always beat a distraction; carrying a body leaves your hands full.
- Menu (`M`): restart, new seed, seed entry, help
- Debug (`G`): bank every item at once - all three keys, the file, all three mods, and the clue knowledge (minimap lights up). Skips the collecting, not the run; doors still open on proximity. For tuning and playtest setup.

## Run the tests
```
node tools/test-gen.js        # map generation (density, reachability, solvability)
node tools/test-cone.js       # vision cone / LOS math
node tools/test-guardai.js    # the room-confined guard AI (chase, search, return, doorway)
node tools/test-bodies.js     # grab / carry / hide / drop bodies in bins
node tools/test-knock.js      # the distract mechanic (make a noise at a wall, lure a same-room guard)
node tools/test-move.js       # movement / collision / radius / no-tunnel
node tools/test-corner.js     # corner-wedge escape on the real update()
node tools/test-units.js      # the data-driven unit model + new-type provenance
node tools/test-intents.js    # the intent layer + the run replays itself + determinism
node tools/test-serialize.js  # the whole state JSON-round-trips losslessly
node tools/test-los.js        # knockout mid-animation + no seeing through kitty-cornered blocks
node tools/test-action.js     # the contextual ACT button (knockout/grab/hide/distract/drop precedence)
node tools/sim-play.js        # a deterministic, search-aware bot plays (a difficulty probe, not a tuning signal)
node tools/replay.js [file]   # run a recorded intent stream headless (or the built-in demo)
```
Playwright UI checks (need a debug Chrome on `:9222` + `NODE_PATH` pointing at your Playwright install; override the port with `CDP_URL`):
```
node tools/check-mobile.js    # layout across portrait / landscape / desktop
node tools/check-touch.js     # the touch input flow (menu, the ACT button)
```

## The source (`src/`)
Flat classic scripts, shared global scope, loaded in dependency order (see
`index.html` for the per-file responsibility notes). One responsibility per file;
no file owns both rules and DOM.

| file | job |
|---|---|
| `config.js` | all tunable constants + `VERSION` |
| `unit.js` | the `UNIT_TYPES` stat table, `statsFor(type)`, `makeUnit` |
| `rng.js` | the seeded RNG (`mulberry32`) - only the seed drives layout |
| `content.js` | procedural content: obstacle shapes, patrol patterns, container archetypes + contents |
| `theme.js` | the presentation layer: room names, container glyphs/colors, item names, the briefing (theme-swappable) |
| `state.js` | `makeGuard` + the initial state shape |
| `mapgen.js` | the 3x3 room layout, obstacles, patrol paths, reachability |
| `sight.js` | vision rules (`canSee` / `preSpot` / `hasLOS`) + the single fog owner |
| `movement.js` | `tryMove` / `freeMove`: radius-aware collision (all units) |
| `path.js` | A* - the ONE pathfinding algorithm (`roomPath`) |
| `ai.js` | the guard AI: the room-confined pursuit state machine |
| `hud.js` | the DOM: the menu panel + HUD text/buttons |
| `game.js` | `reset()` - builds a run from a seed |
| `update.js` | `update()` orchestration + player interactions (knockout / body-drag / distract) + combat |
| `controller.js` | `stepPlayer` + `processIntents`: consumes the player's intents |
| `replay.js` | `runReplay`: the deterministic, serializable run driver |
| `render.js` | the canvas: world, minimap, cones, HUD |
| `controls.js` | the touch d-pad + buttons + gamepad poll |
| `input.js` | keyboard -> raw held input + meta intents |
| `main.js` | boot, the main loop, the `__SNEAK` dev hooks |

## Design notes
- **Rooms are levels.** A guard lives in one room and never crosses a door. When it
  loses you it searches the last-seen tile (a door-edge if you're across the gap),
  then returns to patrol. Doorways are gaps you can see through, but not a sight
  line - a guard can't be activated by a glimpse through a doorway.
- **Stats are data.** Every unit reads its row from `UNIT_TYPES` via
  `statsFor(type)`. Adding a new unit type (a stronger guard, a VIP) is a data row +
  spawn logic, not a new code path - see `tools/test-units.js`.
- **Deterministic.** The sim is a pure function of (seed, input stream). A* and the
  guard AI are `Math.random`-free; only the seed drives the layout. The input stream
  is plain/serializable, so a recorded run replays itself and the whole state
  round-trips through JSON - the multiplayer/persistence foundation.
- **Only A\*.** Pathfinding is A* in `src/path.js`. (`mapgen.js` has a separate
  flood-fill, but that's a generation-time solvability check, not a unit pathfinder.)

## Dev hooks
`window.__SNEAK` exposes the state, `reset(seed)`, `replay(seed, frames, dt)`,
`serialize()`, and a few test helpers (dump a body, force an act, set up a lure).
Reproducible captures use seed `42`.
