# SNEAK RUN

Real-time stealth, room by room. The facility is a 3x3 grid of rooms, and here's the
thing: each room is its own little level, not one big open space. You solve a room,
you move on. The three colored keys, the file, and the upgrades are all stuffed inside
furniture - desks, cabinets, copiers, the safe - and you don't know where any of them
are at the start. The notes you pull out of the furniture name the rooms for you. So
the loop is: search the top rooms, read what you find, and each one lights up on the
minimap as you go. Hold ACT on a container to search it, open the matching doors on the
sealed bottom row, take the file, and reach the exit. Try not to get spotted doing any
of it. Silent quarter, by the way: no audio, no compass, no exact objective marker. The
fog is the game.

And it's built the way I like to build things - plain HTML/CSS/JS, zero dependencies,
no build step. You open `index.html` from `file://` and it just runs. Nothing phones
home, nothing's tracked, no cloud, no telemetry. [nothing leaves the device, ever -
that's the design, not a feature I bolted on afterward] It's mobile-first (portrait is
the primary target) with keyboard, gamepad, and touch all supported. I'm not here to
impress you with a framework. I'm here to hand you a game that runs.

**Play it live:** [https://ill13.github.io/sneaky/](https://ill13.github.io/sneaky/) -
GitHub Pages, deployed from `main`. Every push to `main` updates the live game.

## Controls

- Move: `WASD` / arrows / d-pad / gamepad left stick.
- Act - one contextual button: `E` / `Space` / pad X / pad Y / touch ACT. The verb comes
  from context, not the key. Same button, different job depending on what's in front of
  you: **knock out** an awake guard in your rear arc, **grab** a downed one, **hide** it
  at a bin (or **drop** it when your hands are already full), **search** the furniture
  you're facing (hold it - a ring fills while you work), or **distract** the guards by
  pressing toward the wall you're flush against (the noise is the wall you're facing, so
  sliding along a wall never fires it). A guard's own action always beats a distraction,
  and carrying a body means your hands are full, full stop.
- Menu (`M`): restart, new seed, seed entry, help.
- Debug (`G`): banks every item at once - all three keys, the file, all three mods, and
  the clue knowledge (the minimap lights up). It skips the collecting, not the run: the
  doors still open on proximity. It's for tuning and setting up a playtest, not for
  winning.

## Run the tests

Keep them green. If one goes red, you broke something, and it will tell you which.
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
Playwright UI checks (you'll need a debug Chrome on `:9222` and `NODE_PATH` pointed at
your Playwright install; override the port with `CDP_URL`):
```
node tools/check-mobile.js    # layout across portrait / landscape / desktop
node tools/check-touch.js     # the touch input flow (menu, the ACT button)
```

## The source (`src/`)

Flat classic scripts, shared global scope, loaded in dependency order - the per-file
responsibility notes are in `index.html`. One job per file, and no file owns both the
rules and the DOM. I went to school in the '70s, '80s, and '90s, so black boxes aren't
something I just accept, and a file that's secretly three files is a black box by
another name.

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
  loses you it searches the last tile it saw you in (a door-edge if you're across the
  gap), then goes back to patrol. Doorways are gaps you can see through, but they're not
  a sight line - a guard can't be triggered by a glimpse through a doorway.
- **Stats are data.** Every unit reads its row off `UNIT_TYPES` via `statsFor(type)`.
  Adding a new unit - a meaner guard, a VIP - is a data row plus some spawn logic, not a
  new code path. `tools/test-units.js` is the proof.
- **The duty cycle.** A unit can carry a `duty: {on, off}` flag: awake `on`, asleep
  `off`, repeating - and it's only honored in patrol (a guard chasing you never dozes).
  The sleeping guard is its first face; the **laser** (F40) is its industrial skin - the
  same flag drives a beam that blinks live/dormant. Every tool is gated by `TOOLS` in
  `config.js` (the demo is a kitchen sink; the narrative pass turns them off).
- **Machines + switches (the fifth verb).** A machine is a data row with
  `machine: true` - you can't club it and you can't lure it. Three faces ship: the
  **camera** (scans a cone, trips the **alarm** on a sustained look - stop it with its
  **switch**, a fixed single-tile plate you step onto and tap, and it latches off), the
  **laser** (a beam that blinks live/dormant on the duty cycle - touch the live beam and
  it trips the alarm; **no switch**, it's pure timing), and the **robot** (a moving
  sentry that patrols a lane with a vision cone; a sustained look trips the alarm,
  **no chase** - stop it with its switch). All three run through `machineAlarm` (an
  escalation, not a hit). Machines get pushed after the post/sleeper designation so they
  never shift the stride-rule indices.
- **Deterministic.** The sim is a pure function of (seed, input stream). A* and the
  guard AI are `Math.random`-free; only the seed drives the layout. The input stream is
  plain and serializable, so a recorded run replays itself and the whole state
  round-trips through JSON. That's the multiplayer/persistence foundation, and honestly
  it's why I trust this thing.
- **Only A\*.** Pathfinding is A* in `src/path.js`. (`mapgen.js` has a separate
  flood-fill, but that's a generation-time solvability check, not a unit pathfinder.
  Don't conflate the two.)

## Dev hooks

`window.__SNEAK` exposes the state, `reset(seed)`, `replay(seed, frames, dt)`,
`serialize()`, and a few test helpers (dump a body, force an act, set up a lure).
Reproducible captures use seed `42`.
