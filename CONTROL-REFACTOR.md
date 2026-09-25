# CONTROL REFACTOR - SNEAK RUN <-> tactics_3d (unified control system)

Goal: make SNEAK RUN's unit system, movement/collision, pathfinding, vision, and
control the SAME architecture as `tactics_3d`, so the two games speak one
"engine." New unit types (stronger guards, VIPs) become data + shared modules,
not new code, and multiplayer becomes "send intents over the wire."

`docs` lives in the sibling `tactics_3d` repo (the reference game:
turn-based tactics, ES modules, dual 2D/3D renderers, data-driven units,
intent-based control, deterministic serializable state + headless replay).

This is the checklist. **Phase 0 is decisions only LO can make** - the rest is
gated on them.

---

## Phase 0 - Decisions (LO to confirm)

- [x] **D1 · Module system - LOCKED: keep file-based.** tactics_3d is ES modules
      and needs `http://`; SNEAK RUN stays classic scripts so it still drags open
      from `file://` on a phone. We **mirror the architecture** (same module
      boundaries and patterns as the baseline) with classic-script modules - no
      literal file sharing yet. Revisit a shared ES `engine/` later only if it's
      actually wanted.

- [x] **D2 · Scope - LOCKED: tactics_3d is the BASELINE.** A known-good 2D
      turn-based system (tactics_3d) with clean AI, rendering, deterministic
      state, multiplayer-capable intent control. SNEAK RUN is the simpler
      **real-time** sneak game that must run on a potato. So: adopt tactics_3d's
      architecture/patterns (unit model, intent control, renderer-agnostic
      rules, serializable state) and keep SNEAK RUN **standalone + real-time +
      file-based**. Not (b) shared-engine and not (c) a tactics mode - those stay
      open, this is the path.

- [ ] **D3 · Pathfinding.** SNEAK RUN keeps **A\*** only (real-time steering,
      per the standing "always and only A*" directive). tactics_3d keeps
      Dijkstra (turn reachability) + BFS flow fields (AI). If a shared path
      module is built (D2=b), it exposes named modes and SNEAK RUN selects A\*.
      -> **Recommendation: A\* stays the one algorithm inside SNEAK RUN.**

- [ ] **D4 · Loop.** SNEAK RUN keeps its real-time `dt` loop; tactics_3d stays
      turn-based. Every shared module must be **loop-agnostic** (pure functions
      over state, no `requestAnimationFrame`, no DOM).

---

## Phase 1 - Unified unit model (the core of "unified control")

> **STATUS: DONE (0.9.0).** `state.units` is the single unit array (player + guards,
> each tagged with a `type` + stable `id`); `src/unit.js` holds the data-driven
> `UNIT_TYPES` table + `statsFor` + `makeUnit`; the AI, minimap, and dev-hook read
> `statsFor(g.type)`; the corner-escape folded into the shared `freeMove`; the
> provenance test (`tools/test-units.js`, 12 checks) proves a new type is a table
> row + a spawn with no movement/sight/AI edits. Option B (rewrite every ref to
> `state.units`) is deferred.

Mirror tactics_3d's `state.units` + `UNIT_STATS`: guards, the player, and future
strong guards / VIPs become the same thing - a unit with a `type` and data-driven
stats - living in ONE `state.units` array. Every sub-step below keeps the FULL
suite green before the next (this is the phase that touches the stealth AI, so we
move in thin slices and never let the AI logic change - only its data location).

**Ground truth (verified):** the player object is `{x,y,r,invuln,hits}`; the guard
is a rich AI object (state machine + A* path + room confinement). Player-unique
state (carrying, upgrades, hasKey/hasFile, knock*) lives on `state`, not the player
object. `state.guards` is reassigned ONLY in `reset()` and never push/spliced
mid-run, so a stable ref stays valid all run. ~83 refs to `state.player`/`state.guards`
plus the `__SNEAK` hooks and `load-game.cjs` exports depend on those two names.

### 1.0 - Decision gates (LO confirms before implementation)

- [x] **G1 · Storage + refs (recommendation: keep the refs).** `state.units` is the
      single source-of-truth array (`[player, ...guards]`). Keep `state.player` =
      `units[0]` and `state.guards` = the guard slice as stable convenience refs so
      the ~83 existing refs + test hooks keep working untouched. The "rewrite every
      ref to `state.units`" is deferred (see 1.5) - the unified model is achieved
      without it.
- [x] **G2 · Table home (recommendation: new `src/unit.js`).** One-responsibility
      file for the unit table + factory + `statsFor`, mirroring tactics_3d's
      `data/unit-pool.js`. Loaded after `config.js`, before `state.js`/`game.js`.
- [x] **G3 · What the table holds.** Per type: `{ radius, speed, sightDist,
      patrolFov, chaseFov, moveType }`. The AI state machine (path, room, lastSeen,
      searchT, hearT, ...) stays on the unit INSTANCE, not the table.
- [x] **G4 · Player-unique state stays on `state`.** Only `x,y,r,facing,type,id,
      invuln,hits` move onto the player unit. carrying/upgrades/key/file/knock stay
      on `state` (there is exactly one player).
- [x] **G5 · Corner-escape fold (recommendation: fold it now).** Move the 0.8.2
      corner escape out of the player controller into the shared movement (as a
      "free-move assist" for any `moveType:'free'` unit), so the player AND any
      future free unit inherit it. This is the Phase 2.5 loose end.

### 1.1 - The stat table (no behavior change)
- [x] **1.1a** `src/unit.js`: `UNIT_TYPES` with rows for `player` + `guard` (radius
      11/10, speed, sightDist=VISION_RANGE, patrolFov, chaseFov, moveType).
      Values come from the existing config constants - no new numbers.
- [x] **1.1b** `statsFor(type)` lookup + `makeUnit(type, opts)` factory (sets
      `x,y,r,facing,type,id` from the table + type-specific fields: guard gets the
      AI block from `makeGuard`, player gets `invuln,hits`).
- [x] **1.1c** Add `src/unit.js` to `index.html` in the right script order.
- VERIFY: full suite green (new module, nothing uses it yet). Bump patch.

### 1.2 - Tag the units (no behavior change)
- [x] **1.2a** Player unit: `type:'player'`, `id:0`. Each guard: `type:'guard'`,
      `id:1..N`. Populated in `reset()`/`makeGuard`.
- [x] **1.2b** Radius from the table: `player.r = statsFor('player').radius`,
      `guard.r = statsFor('guard').radius` (replaces the hardcoded 11/10 - same values).
- VERIFY: full suite green (type/id added, radii identical). Bump patch.

### 1.3 - The single array + corner-escape fold (no behavior change)
- [x] **1.3a** `state.js`: add `units: []`. `reset()`: build `state.units =
      [state.player, ...state.guards]` AFTER the guards are made; `state.player`/
      `state.guards` remain the same objects (now reachable from `state.units`).
- [x] **1.3b** Per G5: relocate the corner escape from `update.js`'s player block
      into `src/movement.js` as a free-move assist applied when `moveType==='free'`
      and the held axis is caught. The player call site uses it; guards (patrol)
      are unaffected.
- VERIFY: full suite green INCLUDING `test-corner` (the escape must still roll the
      corner through the shared path). Bump patch.

### 1.4 - Route creation + explicit stats through the table
- [x] **1.4a** Guard creation via `makeUnit('guard', { path })`; player via
      `makeUnit('player', { x, y })` (wraps the existing `makeGuard` init).
- [x] **1.4b** Replace the explicit fov/range/speed/radius literals at the AI,
      movement, and render call sites with `statsFor(type)` lookups
      (patrolFov/chaseFov/sightDist/speed/radius). Behavior identical (same values).
- VERIFY: full suite green + seed-42 screenshot byte-identical. Bump patch.

### 1.5 - References (GATED - LO picks the scope)
- [x] **Option A (recommended, LOW CHURN):** keep `state.player`/`state.guards` as
      the convenience refs (done in 1.3). No further ref changes. The unified model
      is complete: one array + types + table + shared movement/sight.
- [ ] **Option B (FULL, HIGH CHURN) - DEFERRED:** rewrite the ~83 refs to iterate
      `state.units` by type, file by file: `update.js`, `render.js`, `sight.js`,
      `hud.js`, `controls.js`, `main.js` (`__SNEAK`), `load-game.cjs` exports,
      tests. Only if a future feature (unit-unit collision, generic unit iteration)
      makes the refs "leaky." Re-run the FULL suite after each file.

### 1.6 - Provenance test (the proof it works)
- [x] New `tools/test-units.js`:
      - T1 every unit in `state.units` has a valid `type`, a `statsFor(type)` row,
        and a unique `id`.
      - T2 exactly 1 player (`units[0]`) and 16 guards (the rest).
      - T3 refs consistent: `state.player === state.units[0]`,
        `state.guards.length === state.units.length - 1`.
      - **T4 (the money shot):** add a test-only row `UNIT_TYPES.testguard`
        (bigger radius, faster, wider cone) + spawn one, and confirm it (a) moves
        through `tryMove` with its OWN radius, (b) is perceived by `canSee` with its
        OWN sight stats, and (c) required NO changes to movement/sight/AI code.
- VERIFY: full suite green + `test-units` green. Bump patch.

### 1.7 - Docs + version
- [x] Mark Phase 1 done here; add a `feature-checklist.md` entry.
- [x] **Version: `0.8.x -> 0.9.0`** (minor - a notable architecture change, no
      gameplay change).
- [x] Screenshot seed 42 portrait + landscape: layout unchanged (`p1-slice14.png`, `p1-slice14-landscape.png`).

**Definition of done:** a new unit type (strong guard, VIP) is added by editing
`UNIT_TYPES` + the spawn list, with NO changes to movement/collision/sight/AI/
control code. Player + guards + future units move through the same `tryMove` and
are perceived through the same sight functions. The model is plain data in one
array, ready for Phase 3 (intents) and Phase 6 (serializable state).

## Phase 2 - Unified movement / collision (fixes sticky corners) - DONE (0.8.0)

One collision resolver for ALL units (this is where the sticky-corner fix lives).

- [x] **2.1** `src/movement.js` now has ONE unit-aware resolver, `tryMove(u, dx, dy)`,
      used by the player AND guards (via followPath) and any future unit. It reads
      each unit's own `r` (radius), like tactics_3d's `canEnter(unit, tile)`.
- [x] **2.2** Sticky-corner fix: (a) the move is **sub-stepped** (max 8px) so a
      lag spike can't tunnel a thin wall or wedge a corner in one jump - inert at a
      normal 60fps frame, so feel-identical to the classic resolver. (b) [REVERTED
      0.8.1] I tried a circular footprint to round corners, but LO reported it felt
      WORSE - the square box's 8 points align exactly with the d-pad's 4-way +
      diagonal axes, so the square reads more stable. Kept the square footprint;
      the real diagonal-catch fix is still open (see the 0.8.1 checklist note).
- [x] **2.3** Guards route through the same `tryMove` (followPath), so they inherit
      the unit-aware, sub-stepped, wall-aware stepping as the player.
- [x] **2.4** `tools/test-move.js` (permanent, 6 checks): slides along a wall,
      corners at the true radius, a 60px lag-spike can't tunnel a wall, and a 34px
      unit is blocked by a 32px corridor while a 28px one passes. All green.
- [x] **2.5** **Corner escape (0.8.2):** the held axis caught on an obstacle corner
      now rolls a hair around it instead of grinding to a stop (LO's exact stuck spot).
      `tools/test-corner.js` (permanent) drives the real `update()`. **Loose end:** it
      lives in the player controller (`update.js`); when Phase 1.3 puts the player on
      the same unit path as guards, fold it into the shared movement so any future
      free-moving unit inherits it.
  Note: the sim-play bot (known-stale, "not a real player") went 1/10->0/10 because
  the tighter circular cornering nudges its finely-tuned 0.25s crossing windows;
  the map stays fully solvable (test-gen 50-seed reachability green, collider fits
  every 32px corridor). Sub-stepping alone keeps the bot green if that's preferred.

## Phase 3 - Unified control (intents) - the multiplayer foundation

> **STATUS: DONE (0.10.0).** H1=full, H2=held-snapshot, H3=new `src/controller.js`,
> H4=verify-not-rewrite, H5=`0.9.0 -> 0.10.0` - all confirmed by LO. Input capture
> now only records raw `keys`/`pad` + emits plain-data meta intents into
> `state.intentQueue`; a single controller consumes them. The run is a pure function
> of (seed, input stream) - `tools/test-intents.js` replays a scripted input stream
> frame-for-frame headless. Behavior-neutral: full suite + `test-intents` green,
> sim-play unchanged, seed-42 unchanged.
>
> Grounded in tactics_3d's `createController`/`processIntent` and SNEAK RUN's actual
> input->state->update flow. Thin slices, full suite green at each step.

### Ground truth (verified against the current code)

Two input sources, both classic scripts, both writing *directly* into `state`:

- **`src/input.js` (keyboard, event-driven).** `keydown` sets `state.keys[k]=true`;
  `keyup` sets it `false`. The SAME keydown handler ALSO calls the meta actions
  directly - `reset` (R/N/Enter), `typeSeed` (T), `toggleMenu` (M), `closeMenu`
  (Esc), `introClose`/`showIntro` (? and any move key while the intro shows). So
  input currently mutates state *and* manages the frame lifecycle.
- **`src/controls.js` (gamepad + touch, polled).** A rAF `poll()` reads
  `ResponsiveGamepad.getState()` once per frame and writes `state.pad.{up,down,
  left,right,x,y}`. Touch d-pad + BUMP/KNOCK buttons feed the same `RG` state (so
  there are NO separate touch click handlers). The poll ALSO edge-triggers the meta
  actions directly from A (intro-close/retry) and B (new seed).

`update(dt)` (called EVERY frame by the loop, even while paused) consumes both:

- **Held move:** ORs `state.keys` + `state.pad` into `mx,my`, then
  `freeMove(state.player, ...)`. Continuous - re-derived every frame while held.
- **`act` (F23):** `keys['e'] || pad.x`, edge-triggered via `state.actionPrev`, ->
  `tryAction()` (context-aware: grab body / hide / drop / rear-bump).
- **`knock` (F25):** `keys[' '] || pad.y`, edge-triggered via `state.knockPrev`,
  cooldown + `canKnock` gate, -> `doKnock()`.
- **Carried body** follows the player but is ROOM-BOUND (drops at the doorway).

`showIntro(show)` and the menu BOTH set `state.paused = show`, so while the intro or
menu is up, `update()` early-returns after only decaying `flash`. **Consequence:**
meta-intent consumption must run at the TOP of `update()`, before that early-return,
or the intro can never be dismissed by an intent. The guard AI + timers run AFTER
the player, so the player must still be stepped before the guard loop (order matters).

Script order: `... movement, path, hud, game, update, render, vendor, controls,
input, main`. A new `controller.js` must load before `main.js` (so the loop can
reach it); everything it calls (`freeMove`, `tryAction`, `doKnock`, `roomAt`,
`reset`, `toggleMenu`, ...) is a global resolved at call time, so its exact position
only needs to precede `main.js`.

### 3.0 - Decision gates (LO confirms before implementation)

- [x] **H1 - Intent scope (the fork).** LO chose **(a) FULL.**
  - **(a) FULL (recommended):** every input-driven state mutation becomes an intent
    - the held `move` (a direction snapshot), the edge-triggered `act` + `knock`,
    AND the meta actions (restart/newSeed/typeSeed/toggleMenu/closeMenu/help/intro).
    Input layers ONLY write raw `state.keys`/`state.pad` + push meta intents to
    `state.intentQueue`; the controller consumes all of it. This is the true
    tactics_3d mirror and the complete "forward the intents" foundation.
  - **(b) GAMEPLAY-ONLY:** only `move`/`act`/`knock` go through the controller;
    meta actions stay as direct calls in input.js/controls.js (lower risk - the
    intro state-machine stays where it is).
  - **Recommendation: (a), shipped in two slices** - gameplay intents first (3.2),
    meta intents second (3.4), because the intro state-machine is the fiddliest
    behavior to reproduce and should not gate the simple win.
- [x] **H2 - Move representation (recommendation: held snapshot).** Move stays a
  *held direction snapshot*, kept as the existing raw per-source snapshots
  (`state.keys` + `state.pad`) merged at consumption - NOT a per-press event. This
  is real-time-correct (a tap is one frame of movement, a hold is many) and preserves
  the exact OR-merge of keyboard + gamepad + touch today. The *discrete* intents are
  `act`, `knock`, and the meta actions.
- [x] **H3 - Controller home + API (recommendation: new `src/controller.js`).**
  `processIntents()` (meta - runs even while paused, reproduces the intro
  state-machine) + `stepPlayer(dt)` (held move via `freeMove` + edge-triggered
  `act`/`knock` + carried-body follow). `update(dt)` calls `processIntents()` first,
  then early-returns if paused, then steps the player, then the guard loop. The
  player block moves OUT of update.js into `stepPlayer` VERBATIM so behavior is
  byte-identical. (The `act` intent is ONE context-aware intent: grab/hide/drop/bump
  - F23 already made the action key context-aware, so no separate grab/hide intents.)
- [x] **H4 - Guard AI unification (recommendation: verify, do NOT rewrite).** LO trusted the call. The
  guard AI already drives units through the shared primitives - `followPath` (->
  `tryMove`), `canSee` (sight.js), `roomPath` (path.js) - and reads
  `statsFor(g.type)` per unit (Phase 1.4). So a new guard type is ALREADY
  behavior-parameterized, not a parallel code path. The tactics_3d "AI emits intents"
  model maps to "AI drives units through shared primitives" in real-time, which is
  already the case. So 3.3 becomes a **verification + provenance** task: confirm the
  guard AI has zero bespoke movement/collision/sight code and that a new guard type's
  AI moves/sees per its own stats. No rewrite.
- [x] **H5 - Version (recommendation: hold, then minor).** Hold the version through
  the slices (like Phase 1 did); bump `0.9.0 -> 0.10.0` when Phase 3 is complete and
  verified. Architecture change, no gameplay change.

### 3.1 - The intent channel (no behavior change)
- [x] **3.1a** `src/state.js`: add `intentQueue: []` to the initial state.
- [x] **3.1b** `src/game.js` `reset()`: clear `state.intentQueue` (and the
  edge-trigger memory `actionPrev`/`knockPrev` already reset there). `load-game.cjs`:
  export it.
- VERIFY: full suite green (new field, unused yet). Hold version.

### 3.2 - The controller: gameplay intents (no behavior change)
- [x] **3.2a** New `src/controller.js`: `stepPlayer(dt)` containing the EXACT player
  block currently in `update.js` (held move -> `freeMove`; `act` edge-trigger ->
  `tryAction`; `knock` edge-trigger -> `doKnock`; carried-body room-bound follow),
  moved verbatim.
- [x] **3.2b** `src/update.js`: replace the inline player block with a
  `stepPlayer(dt)` call in the same position (before the guard loop). Add
  `src/controller.js` to `index.html` (after `update.js`, before `render.js`) and to
  `load-game.cjs` `FILES`.
- VERIFY: full suite green + seed-42 screenshot unchanged + `check-mobile`/`check-touch`
  (the input -> move path still works end to end). Hold version.

### 3.3 - Guard AI provenance (verification, no rewrite) - per H4
- [x] **3.3a** Confirm (documented in the AI header) that the guard state machine only
  reaches motion/sight through `tryMove`/`followPath`/`canSee`/`roomPath`/`statsFor` -
  no bespoke collision, no bespoke sight, no hardcoded radii/fovs.
- [x] **3.3b** Extend `tools/test-units.js` (or add an assertion) proving a second
  guard type's AI moves via `followPath` at its OWN speed and is perceived by `canSee`
  at its OWN sight/FOV - i.e. the AI is stats-parameterized, not hardwired to `guard`.
- VERIFY: full suite green. Hold version.

### 3.4 - Meta intents (no behavior change) - the fiddliest slice
- [x] **3.4a** `src/input.js`: the keydown handler pushes meta intents to
  `state.intentQueue` instead of calling `reset`/`typeSeed`/`toggleMenu`/`closeMenu`/
  `introClose`/`showIntro` directly. Preserve the exact intro nuance verbatim: any
  move key / Enter while `state.intro` closes the intro (N also starts a fresh run);
  R/Enter restart only when NOT in the intro; `?` closes the intro if showing else
  opens help (not on game over).
- [x] **3.4b** `src/controls.js` poll: A (intro-close/retry) and B (new seed) push
  intents instead of calling `introClose`/`reset` directly.
- [x] **3.4c** `src/controller.js`: `processIntents()` drains `state.intentQueue`,
  dispatching each meta intent to the existing functions, reproducing the intro
  state-machine exactly. Called at the TOP of `update()`, BEFORE the paused early-
  return, so the intro/menu can always be dismissed by an intent.
- VERIFY: full suite green + a meta test in `test-intents.js` (queue a toggleMenu /
  restart / intro-close and confirm the controller consumes it across a paused frame)
  + `check-touch` (menu flow). Hold version. This is the slice to playtest the intro
  by hand before signing off.

### 3.5 - Replay foundation (the multiplayer proof)
- [x] **3.5a** `tools/test-intents.js`:
  - T1 intents are PLAIN DATA: `state.intentQueue` + the held input (`keys`,`pad`)
    serialize to JSON and round-trip.
  - T2 (the money shot - deterministic replay): on seed 42, script a fixed input
    stream (a recorded per-frame held direction + discrete `act`/`knock` intents)
    for N frames at a fixed `dt`; capture the player's position each frame. Then
    `reset(42)` fresh and REPLAY the exact recorded stream, and assert the player
    path matches frame-by-frame. This is "forward the intents over the wire": the
    input stream alone, against a fresh seeded state, reproduces the run.
  - T3 a queued meta intent is consumed by the controller across a paused frame.
- VERIFY: `test-intents` green. Hold version.

### 3.6 - Docs + version
- [x] Mark Phase 3 done here; add a `feature-checklist.md` entry.
- [x] **Version: `0.9.0 -> 0.10.0`** (minor - notable architecture change, no
      gameplay change).
- [x] Screenshot seed 42 portrait + landscape: layout unchanged.

**Definition of done:** input capture never mutates game state - it only records raw
held input + emits plain-data intents into `state.intentQueue`. A single controller
consumes those intents (held move + edge-triggered `act`/`knock` + meta) and mutates
state. The per-frame player input stream is plain, serializable, and deterministic,
so a recorded stream replays a run headless and, later, is exactly what you forward
over a wire for multiplayer. The guard AI is proven stats-parameterized (a new guard
type moves/sees per its row). No gameplay or visual change (values unchanged);
full suite + a new `test-intents` green; seed-42 unchanged.

## Phase 4 - Shared pathfinding module - DONE (0.8.3)

- [x] **4.1** Keep A\* as SNEAK RUN's only pathfinder (`src/path.js`). Verified it
      is the sole unit pathfinder: every guard goal uses `roomPath` -> `AStar.
      findPath`, called only from `update.js`. The one BFS in the tree is `reachable`
      in `mapgen.js` - a **generation-time solvability validator** (exit/key/rooms on
      a walkable route from spawn?), not a pathfinder: it routes no unit and test-gen
      depends on it. So it stays.
- [x] **4.2** Boundary documented in the `src/path.js` header: the "only A*" rule
      scopes to unit pathfinding; the mapgen flood-fill is a different job, and
      tactics_3d's Dijkstra/BFS stay in that game.
- [ ] **(if D2=b)** Wrap A\* (and, for tactics_3d, Dijkstra/BFS) in one shared
      path module with named modes; SNEAK RUN selects A\*. - **N/A**: D2 locked to
      baseline/standalone, so there is no shared engine to wrap into.

## Phase 5 - Shared vision module - DONE (0.8.3)

- [x] **5.1** `src/sight.js` is the single perception owner. `preSpot` (the tentative
      "?" band) is extracted out of `render.js` into sight.js next to `canSee`, so all
      of "who sees whom" (canSee confirmed + preSpot tentative + guardSharesRoom +
      hasLOS) lives in one file; render.js only draws.
- [x] **5.2** Fog model consolidated in sight.js as the owner of the room ->
      explored-index mapping: `rememberRoom(rc,rr)` (update.js calls it on entry),
      `roomRemembered(rc,rr)` (minimap fog), `isRevealed(wx,wy)` (objective/upgrade
      reveal gate, was the render-local `isExploredAt`). The header documents the
      1:1 mapping to tactics_3d: `vision` = current room (derived, not stored),
      `remembered` = `state.explored[9]`, `revealed` = draws once remembered.
      Room-granular by design (room isolation).
- [x] **5.3** Confirmed: the main viewport draws NO cone (unknowable threat holds);
      the minimap uses a simplified room-clipped arc gated on the radar upgrade;
      `conePoly`/`raySeg` stay in sight.js as the tested, available precise cone.
      (Note: `render.js drawCone` is an uncalled leftover from before the in-room
      cone was hidden - left in place, flag for a future cleanup pass.)

Full suite green after 4+5: gen 17, cone, guardai, bodies, knock, move, corner,
sim-play 1/10, mobile 14/14, touch 13/13. Screenshot seed 42 confirms fog/minimap/
pre-spot unchanged (`p5-vision-fog.png`).

## Phase 6 - Renderer-agnostic rules + deterministic, replayable state

> **STATUS: DONE (0.11.0).** The payoff of Phases 3+5: the sim is already
> deterministic (Phase 3 T2 proved the run is a pure function of seed + input
> stream) and the rules already live OUT of `render.js` (movement/sight/path are
> their own files; the sim rules are in update.js). So this phase is (a) turn the
> T2 proof into a real, first-class `replay.js` you can point at an intent file,
> (b) prove `state` is plain/serializable end-to-end (the save-resume + send-state
> foundation), and (c) pull the one remaining inline rule block - the guard AI loop
> - into a named rule. Thin, behavior-neutral, suite green at each step.

### Ground truth (verified)

- The rules are ALREADY renderer-agnostic: `movement.js` (tryMove/freeMove),
  `sight.js` (canSee/hasLOS/preSpot/fog), `path.js` (A*), `controller.js` (intents)
  are separate files; none touch the DOM. `update.js` holds the orchestration + the
  sim rules (guard AI, bullets, pickups, key-door, file, exit) + the player step
  (via the controller).
- `update(dt)` order: `processIntents()` -> paused/gameOver early-return -> timers
  (flash/spotFlash/invuln/exitHint/knockCd/knockFx/alarm) -> `stepPlayer(dt)` ->
  `rememberRoom` -> **the guard loop** (one inline body per guard: hidden/down/dazed
  gates, then patrol/chase/hear/investigate/search via `followPath`/`canSee`/
  `roomPath`) -> bullets -> key/upgrade pickups -> locked-door-open -> file -> exit
  -> `updateHUD()`.
- The guard AI body is the one monolithic inline rule block worth naming.
- `state` is plain data end-to-end (map, units/guards, hideSpots, explored, keys,
  pad, intentQueue, upgPos/filePos/exitPos...) - to be PROVEN by a round-trip test,
  which is the save-resume + "send the state" foundation.
- Determinism: A* is deterministic, the guard AI has no `Math.random` (only mapgen
  seeds via `rng.js`), and Phase 3 T2 already replayed a run frame-for-frame.

### 6.0 - Decision gates (LO confirms before implementation)

- [x] **G1 - Where replay lives (recommendation: source module + Node CLI).** [DONE: src/replay.js + tools/replay.js CLI + __SNEAK.replay/serialize]
  - **(a)** New `src/replay.js` with `runReplay(seed, inputFrames, dt) -> frames`
    (resets to seed, feeds each frame's input, steps `update`, records a compact
    per-frame frame) - a source module usable in the browser AND in Node - PLUS a
    `tools/replay.js` CLI that reads a JSON intent file and runs it headless, plus a
    `__SNEAK.replay(...)` dev hook.
  - **(b)** Node-only: just a `tools/replay.js` script, no source module.
  - **Recommendation: (a)** - it's the payoff; a source module means a future in-
    browser replay viewer is a few lines, and it stays file-based (D1).
- [x] **G2 - Guard-step extraction (recommendation: do it, as a pure move).** [DONE: stepGuard(g,dt) in update.js, byte-identical] Pull
  the per-guard AI body out of the `update()` loop into a named rule
  `stepGuard(g, dt)` (in update.js for now), so the loop reads `for (g of guards)
  stepGuard(g, dt)`. A move, not a change - behavior byte-identical. (The full
  `src/rules.js` file split is Phase 7's job, not this phase.)
- [x] **G3 - rules/ file split timing (recommendation: defer to Phase 7).** [CONFIRMED: deferred to Phase 7] Phase 6
  does NOT reshuffle the helper files into a `src/rules.js` (tactics_3d's `rules/`
  pattern) - that's a file-organization concern and belongs with the module layout.
  Phase 6's value is replay + serializability + the named guard rule.
- [x] **G4 - Version (recommendation: minor).** [DONE: shipped 0.11.0] Hold through the slices; bump
  `0.10.0 -> 0.11.0` when Phase 6 is complete and verified.

### 6.1 - State serializability (no behavior change)
- [x] **6.1a** `tools/test-serialize.js`: JSON-round-trip the WHOLE `state` (map,
  units, guards, hideSpots, explored, keys, pad, intentQueue, upgPos/filePos/exitPos,
  doorTiles/Lintels...) after a `reset(42)` and a few frames of play; assert it
  round-trips losslessly (deep-equal) and that a key run fact (e.g. player x/y, a
  guard's room + state) survives. If anything is not plain data, fix it.
- VERIFY: `test-serialize` green + full suite. Hold version.

### 6.2 - The named guard rule (G2, pure move, no behavior change)
- [x] **6.2a** Extract the per-guard AI body from the `update()` guard loop into
  `function stepGuard(g, dt)` (in update.js). [DONE] The loop becomes `for (const g of
  state.guards) stepGuard(g, dt);`. The `visionRangeFor`/`chaseSpeedFor`/`alarmOn`
  helpers and the per-guard `s = statsFor(g.type)` move into `stepGuard`'s scope.
- VERIFY: full suite green INCLUDING `test-guardai` (the AI must behave identically)
  + `test-units` T5 (a second guard type still steps at its own speed). Hold version.

### 6.3 - `replay.js` - the payoff (G1=a)
- [x] **6.3a** New `src/replay.js` [DONE]: `runReplay(seed, inputFrames, dt)` -
  `reset(seed)`, then for each frame apply the frame's input (set `state.keys`/
  `state.pad` from the frame, push any `frame.intents` into `state.intentQueue`),
  call `update(dt)`, and record a compact frame `{x, y, guards, key, file, alarm,
  won, over}`. Returns `{ frames, seed }`. Reuses `update`/controller - no
  duplicated rules.
- [x] **6.3b** Wire it in [DONE]: add `src/replay.js` to `index.html` + `load-game.cjs`
  `FILES`; add `__SNEAK.replay = (seed, frames, dt) => runReplay(...)` and
  `__SNEAK.serialize = () => JSON.parse(JSON.stringify(state))` dev hooks in
  main.js. Export `runReplay` from the harness.
- [x] **6.3c** New `tools/replay.js` (Node CLI) [DONE - file arg + built-in demo]: reads a JSON intent file
  (`{"seed":42,"dt":...,"frames":[...]}`), runs `runReplay`, prints the outcome
  (frame count, final player pos, key/file/won, per-frame or sampled path). This is
  the "point it at an intent file" payoff.
- [x] **6.3d** Extend `tools/test-intents.js` [DONE - T4 + T5]: T4 - record a scripted run's input +
  frames via `runReplay`, then REPLAY the exact recorded frames and assert the
  player path matches (the run replays ITSELF). T5 - the replay is deterministic
  (two calls, same input, identical frames).
- VERIFY: `test-intents` (incl. T4/T5) green + `tools/replay.js` runs a sample
  intent file + full suite. Hold version.

### 6.4 - Determinism confirmation (6.3 ground truth)
- [x] **6.4a** Confirm the sim + tests are reproducible on seed 42 [DONE - T5 bit-stable, sim-play 1/10 unchanged; A* + guard AI are Math.random-free, only the seed drives layout]: the replay of a
  fixed input is bit-stable across runs (T5), and `sim-play` is unchanged. Document
  that A* + the guard AI are `Math.random`-free so only the seed drives layout.
- VERIFY: green. Hold version.

### 6.5 - Docs + version
- [ ] Mark Phase 6 done here; add a `feature-checklist.md` entry.
- [ ] **Version: `0.10.0 -> 0.11.0`** (minor - replay + serializable state).
- [ ] Screenshot seed 42 portrait + landscape: layout unchanged.

**Definition of done:** `state` is PROVEN plain/serializable (round-trips lossless -
the save-resume + send-state foundation). The guard AI is a named rule (`stepGuard`).
`runReplay(seed, inputFrames)` is a first-class source module: it replays a recorded
input stream headless AND in the browser, deterministically, and `tools/replay.js`
runs an intent file to an outcome. No gameplay or visual change; full suite +
`test-intents` + `test-serialize` green; seed-42 unchanged.

> **STATUS: DONE (0.12.0).** D1 = keep flat classic scripts over file:// (ES modules
> can't load over file://, and the zero-deps / file:// ethos is non-negotiable). The
> real structural win was pulling the guard AI out of update.js into its own ai.js -
> the file now mirrors tactics_3d's rules/AI split. One job per file, no file owns
> both rules and DOM.

## Phase 7 - Module layout mirror

- [x] **7.1** Decide final `src/` layout. [DONE: D1=keep flat file://. Kept flat
      classic scripts, ordered by responsibility; added a per-file responsibility note
      to the index.html script list so the load order is self-documenting. No physical
      reordering needed - the order was already dependency-correct.]
- [x] **7.2** One responsibility per file; no file owns both rules and DOM. [DONE:
      extracted the guard AI state machine (followPath / resumePatrol / enterChase /
      angleTo / wakeGuard / stepGuard) from update.js into src/ai.js - update.js is now
      pure orchestration + player interactions + combat. Audit: update.js has zero DOM
      access, render.js only READS state. Behavior-neutral: test-guardai / test-units /
      test-knock green, sim-play unchanged.]
- [x] **7.3** Update `feature-checklist.md` + `README` to match. [DONE: 0.12.0 entry
      added; created README.md (it was missing) documenting the per-file layout, the
      test suite, and the design notes (rooms-as-levels, data-driven units,
      determinism, only-A*).]

---

## Verification (run after EACH phase)

- [x] `node tools/test-gen.js`        (17 checks)
- [x] `node tools/test-cone.js`       (cone tests)
- [x] `node tools/test-guardai.js`    (F19 AI checks incl. F22 return-to-patrol)
- [x] `node tools/test-bodies.js`     (F23 body checks)
- [x] `node tools/test-knock.js`      (F25 knock checks)
- [x] `node tools/test-move.js`       (Phase 2: wall slide, radius, no tunnel, unit-aware)
- [x] `node tools/test-corner.js`     (Phase 2.5: corner escape on the real update())
- [x] `node tools/test-units.js`      (Phase 1: unit model + provenance, 14 checks)
- [x] `node tools/test-intents.js`    (Phase 3+6: intent layer + run-replays-itself + determinism, 6 checks)
- [x] `node tools/test-serialize.js`  (Phase 6: whole state JSON-round-trips losslessly, 9 checks)
- [x] `node tools/replay.js [file]`   (Phase 6: run a recorded intent stream headless)
- [x] `node tools/sim-play.js`        (still winnable)
- [x] `NODE_PATH=<playwright> node tools/check-mobile.js`   (14)
- [x] `NODE_PATH=<playwright> node tools/check-touch.js`    (13)
- [ ] Screenshot at seed 42 (portrait 390x844) visually confirms layout intact.

## Definition of done (the "why" this matters)
- A new unit type (strong guard, VIP) is added by editing the unit table + spawn
  list, with NO changes to movement/collision/sight/control code.
- Player and every guard move through the same `moveUnit`, so nobody sticks to a
  corner and nobody has a bespoke collision path.
- The control layer is intent-based and serializable -> replay works headless and
  multiplayer is "forward the intents," not a rewrite.
