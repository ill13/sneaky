# SNEAK RUN - Feature Checklist

Companion to the game in this repo (plain JS/CSS/HTML, zero dependencies, works from `file://`).
Status legend: `[ ]` not started - `[~]` in progress - `[x]` done - `[D]` decision needed from LO.

**Recommended build order:** F1 (quick win) -> F3 (grid map, the big one) -> F4 (key quest, needs grid) -> F5 (minimap, best after grid) -> F2 (knockout, independent, slot in whenever).

---

## F1. Screen real estate: instructions as a start modal - [x] DONE (S)

The persistent `#hint` text block wastes vertical space on phones and is re-read
exactly zero times after run one. It becomes a modal.

- [x] Start-of-run modal ("HOW TO PLAY"): goal (steal the file, reach the exit), the alarm rules in 3 lines, and the full control table (keyboard / gamepad / touch)
- [x] Dismiss: PLAY button (big touch target) + Enter/any move key; game runs paused behind the modal
- [x] `?` button in the HUD reopens the modal any time (pause while open)
- [x] Delete the persistent `#hint` block from the column
- [x] Reclaim the height budget: `#wrap` canvas budget now `100vh - 56px`
- [x] Mobile stretch: full-bleed canvas (F6) - the canvas now fills the column in every orientation; HUD stays a solid strip on top (translucent overlay deferred, looks fine as is)

Acceptance:
- `tools/check-mobile.js` passes with the larger canvas (update the height-budget constant)
- Modal visible on load, PLAY dismisses, `?` reopens; touch test (check-touch.js) still 9/9
- No page scroll in either orientation; desktop column still 640px wide

---

## F2. Knock out / disable guards - [x] DONE (M)

Give the player an offensive option: take a guard down instead of only dodging.

Design (recommended): **knockout from behind**
- Player within ~24px of a guard's rear arc (behind the facing, cone already doesn't cover it) + action input -> guard is **knocked out**
- Temporary KO: guard lies down for ~6s (no patrol, no sight, no shooting), then 1.5s of dazed wobble, then resumes patrol
- If the player is still adjacent when a guard wakes, the guard spots them instantly
- Downed guards render dimmed with an X / stars cue; a waking guard flashes first

- [x] Permanent KO: decided **(a) temporary only** - guards never thin out, tension stays
- [x] Action input mapping: keyboard `E`, gamepad face button `X`, the touch ACT button (F27/0.12.2 merged these into one contextual button)
- [x] `tryKnockout()` in update.js with rear-arc (110 deg) + proximity (54px) check
- [x] guard states: `down` (6s) and `dazed` (1.5s) in the state machine; waking guard chases instantly if the player is still close (50px), else stumbles back to patrol
- [x] HUD status line "GUARD DOWN Xs"
- [x] Node tests: knockout behind -> down; knockout from the front -> nothing; playtest covers knockout via E + the ACT button

Acceptance: new test green in `tools/` (scripted, no browser needed); check-touch +1 for the ACT button.

---

## F3. Grid map instead of a linear strip - [x] DONE (L, the big one)

Today: 80x15 tiles, 4 rooms in a row, doors at fixed rows. It's a hallway, not a
dungeon. Spelunky doctrine stays: **geometry is authored, the seed shuffles contents.**

Proposed shape: **4 cols x 2 rows of rooms** (~16x10 tiles each)
- Full grid ~72x24 tiles (~2300x770 px) -> camera scrolls **both axes** (camY is new; render, cones, bullets, player all get the offset)
- 1-tile walls between rooms; 1-2 door gaps per shared wall, authored per edge in the room graph
- Room roles (curated graph, seed picks which template goes where from a pool):
  - SPAWN corner room (safe-ish, 1 guard)
  - KEY room (holds the key, mid-grid, guarded, optional-ish placement from a pool)
  - LOCKED-DOOR edge guarding the FILE room
  - FILE room (the MacGuffin)
  - EXIT room (behind/past the file, guarded)
  - FILLER rooms: guard-count / pillar-density variants, one or two "calm" rest rooms as breathing room
- `generateLayout(seed)` keeps its 64-attempt re-roll: connectivity, pillar safety, patrol clearance, reachability all re-validated for the grid
- Guard waypoint patterns authored per room-template, not per-room-index

- [x] New room-graph data in content.js (room-relative pools, 8 roles, door gaps per edge)
- [x] mapgen rewrite: 69x23 grid, 4x2 rooms, carved gaps, vault-sealed, 64-attempt validate (connectivity + pillar + patrol + closed/door-open reachability)
- [x] Vertical camera (camY) in render.js + minimap world->mini transform
- [x] test-gen.js: 13 checks (grid dims, borders, 32 gaps + vault sealed, locked tiles, spawn, object rooms, closed vs open reachability, 50-seed sweep, fallback, alarm, knockout)
- [x] playtest.js rewritten for the grid (34 checks)
- [x] sim-play / bot BFS: quest-chain goal (key -> door -> file -> exit); winnability proven (seed 2000 full chain)
- [x] Screenshots: 01-start, 02-door-open, 03-alarm, 04-caught, 06-escaped

Acceptance: all suites green against the grid; a full playthrough possible in the browser on one seed.

---

## F4. Key + locked door fetch quest (gate the MacGuffin) - [x] DONE (M, needs F3)

Standard fetch-it chain: **find the key -> unlock the door -> steal the file -> run to the exit.**

- [x] KEY object: glowing yellow key, seed-placed in (1,1) or (2,0)
- [x] LOCKED DOOR: the vault door (map value 2) renders latched red; solid until opened
- [x] Pickup: walk over the key -> `hasKey`, objective "KEY IN HAND - FIND THE RED DOOR"
- [x] Unlock: stand adjacent with the key -> door opens (tiles -> floor, wall edges rebuilt), objective "STEAL THE FILE"
- [x] Guards: the vault is sealed except the one door; no patrol crosses it
- [x] Minimap hooks: key icon + red locked-door marker
- [x] Node test: door CLOSED -> file unreachable; door OPEN -> reachable; reset re-locks

Acceptance: the file is provably unreachable without the key in `test-gen.js`; full quest chain playable in-browser (manual + playtest).

---

## F5. Minimap + cones only on the minimap - [x] DONE (M, best after F3)

### F5-v2. MGS-style local radar (research-driven) - [x] DONE

LO: cones should only show for the room you're in; the whole map might be too
much; base it on MGS + the genre. Research: `minimap-research.md` (MGS1 official
manual, Hitman wiki Maps page, RE, Deus Ex, Dishonored, MOTN, Shadow Tactics).

- [x] Guard dots + cones only for the player's current room, cones clipped to the room rectangle
- [x] Fog of war: unexplored room interiors black; explored rooms dim skeleton; current room framed
- [x] Alarm: radar goes offline (dim + red static + SIGNAL LOST) - MGS1 alert-mode behavior
- [x] Kept: K/F/E objective icons (explored rooms) + red locked-door marker
- [D] open choice for LO: the explored rooms still show their wall skeleton
      ("known facility" style, Hitman-like). Fully blacking unexplored walls out
      is a one-line change if he wants true radar locality.
- [ ] follow-up (not requested, on the table): on-demand planning map (pause +
      big map with patrol routes, MOTN/Hitman style) - the biggest genre feature left.

The big tension change: **the main view stops drawing sight cones.** Guard bodies +
the small facing wedge stay (otherwise orientation is unreadable). You plan routes
by watching the minimap, not by reading the play field. Side benefit: the cone
stair-step clipping issue (C4) becomes irrelevant in the main view.

- [x] Second `<canvas>` top-right, pointer-events: none, `min(207px, 32vmin)` on mobile
- [x] Minimap contents:
  - wall/room layout (dim), explored rooms slightly brighter (v1 whole-grid draw chosen; fog-of-war deferred)
  - guards: dots with a **small cone wedge** (FOV + range scaled) - the only cones in the game
  - player dot, K/F/E icons once their room is explored
  - red locked-door marker
- [x] Main view: no cone fills; guard body + facing wedge only (`canSee` untouched)
- [x] Per-frame minimap draw: static offscreen layer (redrawn on reset/unlock) + dynamic layer
- [x] Mobile: minimap scales down, no interaction
- [x] Screenshot checks in check-mobile.js (P + L); playtest 34/34 (detection untouched)
- [x] F5-v2 review shots: review-radar-local.png, review-radar-offline.png (tools/shots.js)

Acceptance: visual screenshot in `tools/screenshots/`; all existing suites green; detection behavior byte-identical (same `canSee`).

---

## F6. 3x3 path-first rebuild (supersedes the F3 4x2 geometry) - [x] DONE (L)

The 4x2 grid won on paper but the route was a shallow left-to-right sweep. The
3x3 rebuild makes the geometry carry the design:

- **Authored graph, shuffled contents** (Spelunky doctrine): `WALL_PLAN` + `SOLUTION_PATH`
  in content.js guarantee a walkable route by construction; generation only shuffles
  pillar chunks, patrol extras, object positions, and upgrade placement, then validates.
- **Rooms 9** (52x34 tiles, 16x10 each): A(0,0) spawn, B(1,0)/C(2,0) key rooms,
  D(0,1)/E(1,1)/F(2,1) mid, G(0,2) exit, H(1,2) vault, I(2,2).
- **Backtracking meme**: key is deep in B or C, the file is behind the vault door in H,
  the exit is in G - winning means sweeping back through E/D with everything hot.
- **Locked vault door**: E-H only opening; G-H and H-I sealed (map value 2, opens with key).
- **Upgrades**: one per off-path room (C/F/I dead ends): STIM (speed), HUSH (longer
  hide window), HEAVY (longer KO). Banked for the run, cleared on reset. HUD `#power` chip.
- **Red door discovery**: minimap door marker hidden until room E is explored (local-radar doctrine).
- **Content fixes found by the sim**:
  - Vault door shifted one column east (x23-24): over the vault's left lane the door
    fed the guard cone straight up the approach - a grab-and-dash the player couldn't win.
  - Key pool restricted off the right-column lane's cone: the top-right corner pockets
    violated the "objects hug walls, never the lanes" rule the pools were written with.
- **Full-bleed canvas** (replaces the fixed 640x480 4:3 window that letterboxed phones):
  canvas fills the layout column top to bottom in every orientation; the view window is
  the canvas box clipped to the map (1:1 CSS px), camera follows the player; the map
  centers itself when the screen is wider/taller than the facility. Portrait is now
  first-class - the compound runs vertically (spawn A down to exit G) so a portrait
  slice is actually the right way to play it; the rotate-hint is retired.
- `test-gen.js` rewritten: 16 checks (wall plan, gap count 36, vault seal, locked tiles,
  solution path, object rooms, upgrades, 50-seed sweep).
- Review shots: review-3x3-door.png (door discovery from E), review-3x3-vault.png (approach).

Acceptance: all suites green; full quest chain winnable headless (seed 42).

---

## F7. Mobile minimap legibility + spotted cue + housekeeping - [x] DONE (M)

LO asked for a review of mobile layout, minimap visibility, and the game viewport
(driven through CDP at 390x844 / 844x390 / 720x900). Findings: the minimap is the
ONLY sight-cone channel (main view has none by F5) but is the smallest element on a
phone (~125px), and it floats to the viewport top-right over the play field + HUD
edge despite the old "own row / never on top" comment. Changes:

- [x] Minimap size bumped on mobile: `32vmin -> 38vmin` (capped 156), via a shared
      `:root { --mini }` var (~125px -> ~148px on a 390px phone; desktop unchanged 156).
- [x] Minimap contrast: guard dots 3px -> 4px (patrol dot brighter), cones
      patrol 0.22 -> 0.34 / chase 0.35 -> 0.48 alpha, current-room frame 0.35 -> 0.62
      + lineWidth 1 -> 1.5. Cone/dot read survives phone scale better.
- [x] `#hud` reserves the right column (`calc(var(--mini) + 14px)`) so the floating
      minimap stops covering the seed + `?` button; narrow screens drop the seed
      (redundant - it's on the game-over overlay) so objective/status/timer/? fit.
- [x] New in-view "you got spotted" cue: `state.spotFlash` fires on the patrol->chase
      transition, decays ~0.4s, renders a brief orange edge pulse (distinct from the
      red alarm vignette + red hit flash). Sustained chase also already reads (guard
      turns red, minimap cone goes bright red, HUD "SPOTTED!").
- [x] `#status` blink scoped to danger states only (ALARM / SPOTTED); calm states
      (CLEAN / IN THE BAG / GUARD DOWN) no longer pulse like an alarm.
- [x] Fixed the misleading HTML comment on `#radar` (it's an unstyled spacer; the
      canvas is absolute to the viewport, so the radar DOES sit over the play field).
- [x] Housekeeping: dead root `game.js` (v2 monolith) archived to `.ill13/game.js`;
      46-byte `nul` junk artifact moved to `_trash/nul`. Both verified byte-identical
      before the originals were removed.

Acceptance: test-gen 16/16, test-cone all pass, sim-play 1/10 (seed 42, winnability
unchanged), check-mobile 14/14, check-touch 10/10. Review shots in
`tools/screenshots/` (`mobile-layout-*`, `minimap-big-*`, `spot-clean-*`),
captured via `tools/shot-review.js` + `tools/shot-zoom2.js` + `tools/shot-spot.js`.

---

## F8. 0.1.0 - bounded camera window, in-world wedges, spotted "!" cue, 4-way pad - [x] DONE (L)

The portrait play-area bug (a 3x3 landscape facility shown as a ~1:2 scrolling slice on
a portrait phone) was first "fixed" by drawing the WHOLE facility on one screen. LO
corrected that on principle: total spatial awareness is a tactics-board instinct, not
a stealth one - the unknown corners ARE the tension (MGS on the MSX, Covert Action,
the NES Zelda dungeons, Spelunky). So the whole-board view was reverted in favor of a
bounded camera window that follows the player; the minimap stays retired because a
full threat map is the same whole-world problem in a smaller hat.

- [x] `render.js` back to a following, clamped camera, sized to ~one room at a time.
      Each room is its own level, and when the player is at a doorway the re-centered
      window catches a sliver of the adjoining room to plan the transition. `fitCanvas()`
      picks `VIEW_PORTRAIT` (18x15) or `VIEW_LANDSCAPE` (20x13) from `config.js` (rooms
      are 16x10, walls 1 tile), scales to fit, centers; `camera()` clamps to bounds.
      Tiles culled to the visible range + 1-tile margin. Every position via `fx/fy`.
- [x] Sight wedges drawn in-world: each guard's fov arc (yellow patrol / red chase),
      clipped to its room (open interiors make the room-clip match the true wedge).
- [x] In-world spotted cue: a "!" over every chasing guard - red while it can see
      you (`canSee`), yellow while searching (lost LOS, 3s timer). Pairs with the
      `spotFlash` edge pulse + red chase cone + HUD "SPOTTED!".
- [x] Objectives (key / file / dead-end upgrades) are fog-of-war: they render only once
      their room is `explored`. The exit pad stays always visible. With the bounded
      window this doubles as the "go find it" stealth loop.
- [x] Minimap retired: `#minimap { display:none }` (canvas left in DOM, harmless),
      `drawMinimap`/`drawMinimapStatic` removed from render + their call removed from
      `game.js` reset(). HUD right-column reservation dropped; `#seed` un-hidden.
- [x] No-clear bug fixed: `render()` now fills the canvas with the page background
      (`#0b0d12`) every frame before drawing. The whole-board version never needed it
      (it repainted every pixel), so the semi-transparent cones were re-compositing onto
      themselves frame over frame and saturating to solid yellow in the letterbox.
- [x] Version tracker: `config.js` `VERSION = '0.1.0'`; small tag next to the title in
      the intro (`#ver`, wired in hud.js). Bump on every shipped change.
- [x] Enter = restart: pressing Enter (mid-run or game over) retries the same seed,
      same as R. Overlay + help copy updated.
- [x] 4-way d-pad for mobile: replaced the single drag-zone with a cross of four
      hold-buttons (up/down/left/right), each wired via `TouchInput.addButtonInput`
      to a `DPAD_*` id (the bare UP/DOWN/LEFT/RIGHT are derived at read time). Hold
      two for a diagonal. CSS is a 3x3 grid with a dead center.

Acceptance: test-gen 16/16, test-cone all pass, sim-play 1/10 (seed 42, unchanged),
check-mobile 14/14, check-touch 13/13 (4-way pad all axes + diagonal, Enter restart);
console sweep clean, no ghosting after sustained movement.
Review shots via `tools/shot-010.js` (`v010-intro-portrait`, `v010-portrait-run`,
`v010-portrait-spotted`, `v010-landscape-run`, `v010-desktop-run`).

Tuning knobs (`config.js`): `VIEW_PORTRAIT` / `VIEW_LANDSCAPE` set how much of the
facility is visible (currently ~one room + its doorways). Shrink for tighter
room-isolation, grow to see more neighbors. Landscape is the ideal orientation (the
room's 1.6:1 fills the screen); portrait keeps the room isolated in the dark around it.

---

## F9. Fog-of-war minimap back (cones move off the board) - [x] DONE (M)

LO endorsed the portrait black letterbox ("not an issue - like retro emulators leave a
blank background") and used the freed space to bring the minimap back, while disabling
the in-world sight wedges so the room view stays clean. The minimap is the tactical
layer and it shows occlusion: explored rooms light up, unexplored rooms stay dark, and
you can't see guards or loot in a room you haven't walked. So it's a fog of war, not the
whole-board reveal that got it retired in F8.

- [x] `drawMinimap(t, range)` in render.js: the whole 52x34 facility at `MINI` (2px/
      tile), painted top-right of the canvas (the dark letterbox on portrait, a small
      corner panel over the room on landscape). Dimmed panel + border.
- [x] Fog-of-war occlusion: floor tiles light up only where the room is `explored`
      (walls stay the faint structure, the vault door stays red). Guards + their cones
      render only in explored rooms, each cone clipped to its room (sight never leaks
      through a wall on the map). Player dot (white) + current-room frame always shown.
- [x] Objectives on the map: key (gold) / file (blue) appear once their room is
      explored; the exit (green) and vault door (red) always show - the "go find it"
      loop, at a glance.
- [x] In-world wedges disabled: the `drawCone` loop is removed from `render()` (the
      function stays for the future). The room view is now guard dots + facing
      triangles + the "!" cue - clean. The threat reads on the minimap instead.
- [x] Headless stub: `rect` + `clip` added to the no-op list in tools/load-game.cjs so
      the room-clipped minimap cones run under sim-play.
- [x] Intro rule 2 rewritten: the wedges are gone from the board, the minimap (top
      right) is now the cone/fog layer.

Acceptance: test-gen 16/16, test-cone all pass, sim-play 1/10 (seed 42, unchanged -
exercises the minimap every frame), check-mobile 14/14, check-touch 13/13. Review:
`tools/shot-010.js`, then the top-right of v010-portrait-run / v010-landscape-run (the
zoom crops confirmed the fog-of-war: current room lit with guard+cone, the other eight
rooms dark, exit green, vault door red).

Knobs: `MINI` (minimap px/tile, in render.js) - raise for a bigger, more legible map;
the top-right anchor is fixed. Landscape is the tight spot (the panel sits over the
room's top-right corner, usually a wall).

---

## F10. One doorway per vertical wall (tighter stealth) - [~] DONE, bot re-tune open

LO approved "verticals-to-one but keep the two on the wide walls." Each vertical wall
(x=17, x=34) now has ONE centered two-tile door instead of two; the horizontal walls
(y=11, y=22) keep their two spread doors (6 tiles apart = a real route choice, not
clutter, since the two openings can sit in different threat zones).

- [x] `content.js` `DOOR_V = [[5, 6]]` (was `[[3,4],[6,7]]`); `DOOR_H` unchanged `[[4,5],[10,11]]`.
- [x] `test-gen.js` open-gap count 36 -> 28, vertical open rows -> [6,7,17,18]; 16/16 green.
- [x] `sim-play.js` GAPS table updated to the new door rows (it had the old rows hardcoded,
      which made the bot path at walls instead of the real doors).

Status / open decision [D]:
- The map is still winnable by construction (test-gen reachability passes; the bot now routes
      through the real doors - seed 3000 reaches the vault door).
- But the "competent amateur" bot regressed 1/10 -> 0/10: the single D-E door makes the entry
      into the vault room a gauntlet. Trace (seed 42): the bot crosses, gets pinned against the
      wall by the guard covering the entry, and dies. Two doors used to offer a second, less-
      watched entry. This is the intended chokepoint tension, not a bug - but it moved the bot
      below the old winnability bar.
- Options for LO: (a) leave it - the difficulty spike is the point, winnability is proven by
      test-gen not the bot; (b) re-tune the bot to back out through the door it just entered,
      recovering >=1/10; (c) widen the vertical door to 3 tiles for a fatter crossing window.

Acceptance: test-gen 16/16, check-mobile 14/14, check-touch 13/13. sim-play 0/10 is the open
design question, not a failing test.

---

## F11. Responsive start modal - [x] DONE (S)

LO: the start modal "doesn't seem responsive." Measured across viewports - the box was
`min(92%, 460px)` (hard-capped at 460px, so it floated in the middle of the landscape/desktop
width with big empty margins), `position: absolute` trapped inside the short landscape stage,
and fixed 12px fonts. The content (668px landscape / 838px portrait) overflowed the box, so it
scrolled on both phones. Changes in style.css + index.html:

- [x] `#intro` -> `position: fixed; inset: 0` with padding: full-viewport modal (not trapped in
      the stage; dims the letterbox too - standard modal semantics, more vertical room).
- [x] `#intro-box` width `min(92%, 460px)` -> `min(94%, 580px)` (uses the real width),
      `line-height` 1.45 -> 1.35.
- [x] `clamp()` on the title + all body fonts so text scales with the screen; tighter rule/
      table spacing to cut the content height.
- [x] 2-column layout for short landscape: wrapped the rules and the keys/button in
      `.intro-grid` / `.intro-side` (index.html); a `(orientation: landscape) and
      (max-height: 620px)` media query splits it - rules on the left, keys + PLAY on the right.
      Halves the content height so the whole intro fits without scrolling.

Measured result (no scroll on any viewport; the box scales with the screen):
- portrait 390x844: box 344px, content 688px, fits, single column.
- landscape 844x390: box 680px, content 370px, fits, 2-column (358px rules | 276px side).
- desktop 720x900: box 580px, content 561px, fits, single column.

Acceptance: check-mobile 14/14, check-touch 13/13 (DOM structure intact after the wrapper);
review shots `intro-v2-{portrait,landscape,desktop}.png` in tools/screenshots/.

---

## F12. 4:3 CRT play field (the Metal Gear frame) - [x] DONE (M)

LO: the visible game area should match a classic 1980s CRT / MSX monitor (he sent a
Metal Gear MSX screenshot - the whole play field is a 4:3 frame with the minimap in the
top-right corner). Before, the window was per-orientation (18:15 portrait, 20:13
landscape) and neither was 4:3; the minimap + screen overlays anchored to the full
canvas, not the play area.

- [x] `config.js`: `VIEW_PORTRAIT`/`VIEW_LANDSCAPE` -> single `VIEW_43 = { tw: 20, th: 15 }`
      (20:15 = 4:3). One window for both orientations; the canvas aspect only changes the
      scale + how much letterbox the window gets.
- [x] `render.js` `fitCanvas`: computes the on-screen window rect `WW`/`WH` (the 4:3 "screen"),
      centered in the full-bleed canvas with the dark letterbox around it.
- [x] Minimap re-anchored to the window: `drawMinimap` now places the panel at the top-right
      of the 4:3 window (OXX + WW - MW), not the canvas corner - MGS-style.
- [x] Screen overlays (alarm border, spotted flash, red hit) now frame the window rect, not the
      full canvas - the "screen" flashes, the bezel stays black.
- [x] World clipped to the window (`save`/`rect`/`clip`/`restore` around the draw pass): fixes a
      pre-existing bleed where objectives/guards outside the window painted into the letterbox
      (visible on portrait as the EXIT pad + guards below the frame). A CRT screen has hard edges.
      (save/rect/clip/restore are no-ops in the headless stub, so this is free under sim-play.)

Verified: crt-{portrait,landscape,desktop}.png - 4:3 frame centered with clean letterbox, minimap
in the window's top-right, no bleed. test-gen 16/16, test-cone pass, check-mobile 14/14,
check-touch 13/13. (sim-play 0/10 is the separate F10 door-tension question.)

Knob: `VIEW_43.tw/th` in config.js (keep the ratio 4:3, e.g. 20:15, 24:18). Shrink the whole
window (e.g. 16:12) to zoom in tighter; grow (24:18) to see more.

---

## F13. Minimap moved to a top strip above the play area - [x] DONE (M)

LO: the top-right corner panel was blocking part of the room. The minimap now lives in a
dedicated strip ABOVE the 4:3 play area, so the room is never overlaid.

- [x] `render.js` `fitCanvas`: reserves a top strip (`STRIP_H = ROWS*MINI + 2*MINI_PAD`, ~84px)
      at the top of the canvas; the 4:3 window is centered in the space below it. On a short
      landscape phone the window shrinks slightly to make room (the unblocked view is the point).
- [x] `drawMinimap`: panel centered horizontally in the strip (`MY = MINI_PAD`), no longer
      top-right of the window.
- [x] `render()`: the minimap is drawn AFTER the play-area clip is restored (it lives in the strip,
      not inside the clipped window), so it is never clipped away.
- [x] `MINI` moved up to the module top (fitCanvas needs it to size the strip).

Verified: mini-{portrait,landscape,desktop}.png - minimap in the top strip, room fully clear.
test-gen 16/16, test-cone pass, check-mobile 14/14, check-touch 13/13.

Knob: `MINI_PAD` (strip padding) and `MINI` (minimap size, which also drives the strip height)
in render.js. Bigger MINI = taller strip + smaller play area.

---

## F14. Arcade top strip (info left, minimap right) - [x] DONE (M)

LO: balance the minimap to the top-right and move the header info to the LEFT of the map, for a
centered classic-arcade (80s-90s) look. Before, the header was a DOM bar above the canvas and the
minimap sat centered in the strip - two separate rows, map not on the right.

- [x] Header is now drawn INTO the canvas top strip (left): `drawHeader()` in render.js mirrors the
      values `updateHUD()` writes to the (hidden) DOM spans each frame - objective + status on line 1
      (auto-fit so long objectives never hit the map), power + timer + seed on line 2.
- [x] Minimap right-aligned in the strip (`MX = cssW - MW - 8`), so the strip reads
      `[? header ........ minimap]` like a classic cabinet.
- [x] DOM `#hud` + `#radar` collapsed (`display: none`); their spans stay in the DOM so
      `updateHUD()` still owns the values. The whole game (strip + centered 4:3 window) now reads
      as one centered arcade panel.
- [x] `#btn-help` (the ?) moved out of `#hud` into `#stage` as a positioned overlay (top-left,
      z-index 3) so it stays clickable over the canvas strip.
- [x] `tools/check-mobile.js`: the landscape canvas is now full-bleed (374px, was 334px) since the
      ~40px DOM HUD row is gone; updated `L: canvas sized by height budget` to `390 - 16`.

Verified: arcade-{portrait,landscape,desktop}.png - info left, map right, room centered.
test-gen 16/16, test-cone pass, check-mobile 14/14, check-touch 13/13.

## F15. System UI font stack - [x] DONE (M)

LO: switch from the retro monospace to the system UI stack
(`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) - cleaner, crisper on
mobile, native to each OS.

- [x] `style.css`: `body` font-family + the three `font:` shorthands (#btn-help, overlay, dpad
      buttons) now use the system stack. Zero `Courier`/`monospace` references remain.
- [x] `render.js`: a single `FONT` constant drives all six canvas text draws (header lines, EXIT pad,
      upgrade glyphs, "!" markers), so the canvas text matches the DOM text.

Verified: arcade-*.png re-shot with the new font (header + labels render in the system UI face).
Full suite green.

---

## F16. Portrait hero + fair-death cues + lean minimap + perf - [x] DONE (M)

Design lock from the player-perspective review (the five agreed calls): portrait is the
hero experience (the game is played in portrait first, no rotate); exact guard sight
stays hidden (unknowable threat) but a death must read as the player's own misjudgment;
the minimap stays lean early and earns its cones; difficulty tuning is deferred (the
sim-play bot is not a real player). Four builds landed:

### F16a. Portrait hero (the 4:3 exception) - [x]
- [x] `config.js`: `VIEW_PORTRAIT = { tw: 18, th: 16 }` added; `VIEW_43` kept for landscape/desktop.
- [x] `render.js` `fitCanvas`: portrait (cssH >= cssW) uses `VIEW_PORTRAIT` (18:16 = 1.125, close
      to the 0.46 phone ratio) so the room fills the width and the window is tight; landscape/desktop
      keep the 4:3 CRT. The top strip (header + minimap) is preserved in both.
- Verified: f16-portrait-run.png (room-as-hero, tight window, sliver of the room below at a door),
      f16-landscape-run.png + f16-desktop-run.png (4:3 preserved).

### F16b. Fair-death readability (no exact cone, still a fair warning) - [x]
- [x] Bigger, clearer facing arrow in the room view: guard body 12->14, the facing triangle 9->12,
      outline 2->3 - the sweep reads as "it's turning that way" at a glance.
- [x] Pre-spot "?" cue: `PRESPOT_ARC = 70deg` (config.js); a patrol guard that has LOS on the
      player within range and is turning toward them (angle within the pre-spot arc, but not yet in
      the 36deg cone) shows a faint gold "?". So a death reads as "it was looking right at me", not
      "I got clipped by hidden data". Rendered with the "!" markers in `render()`.
- Verified: f16-prespot.png (gold "?" above the guard turning toward the player). `?` is the new
      middle step between clean and the red "!" of an active spot.

### F16c. Lean minimap: cones behind an upgrade + static-layer cache - [x]
- [x] Lean by default: the minimap shows fog + player dot + guards + K/F/E/vault/exit, NO cones.
      Cones are gated on `state.upgrades` (any of stim/hush/heavy banked) - the map earns its tactical
      detail as you explore the off-path dead ends. (No dedicated 4th upgrade; the map has exactly
      three off-path rooms C/F/I, so "any upgrade" is the honest gate.)
- [x] Perf: the static facility layer (room floors + fog + walls + vault door) is cached to an
      offscreen canvas (`miniLayer`) and repainted only when the explored-room bitmask changes
      (`miniMask`); dynamic dots/cones/objects blit on top each frame. No per-frame full-facility
      fill. (Static tiles never repaint per-frame, so the cache is safe.)
- Verified: f16-cones-off-zoom.png (no wedges, room lit) vs f16-cones-on-zoom.png (yellow fan wedges
      after banking HUSH). Headless stub: `document.createElement('canvas')`, `drawImage`, and a
      `measureText` stub added to load-game.cjs.

### F16d. Intro: PLAY on top - [x]
- [x] index.html: the PLAY button moved to the top, right under the title, with a one-line objective
      (KEY -> RED DOOR -> FILE -> EXIT · never get caught twice) under it; the rules + controls stay
      below. Short-landscape intro re-tightened (compact button + smaller title) so it still fits
      without scrolling (measured 365/365, no scroll).
- Verified: f16-intro-portrait.png, f16-intro-landscape.png, f16-intro-desktop.png.

### F16e. Difficulty deferred [D]
- [ ] sim-play stays 0/10 (the F10 single-vertical-door chokepoint + the bot). Left untouched this
      pass: the bot is not a real player. Revisit with human playtests - candidate knobs: guard
      re-acquire (chase->search) delay, shot reaction time, or the vertical door width (F10 option c).

Full suite green: test-gen 16/16, test-cone all pass, check-mobile 14/14, check-touch 13/13;
sim-play 0/10 (deferred). Review shots in tools/screenshots/ (f16-*).

---

## F17. Info glued to the play area (top strip portrait / right column landscape) - [x] DONE (M)

LO: the gameplay is dead-center (good), but the minimap + info were parked in the top-left
corner (0,0), leaving a dead gap between the info and the room and making the eye travel.
Fix: glue the info to the play area. Portrait: the header + minimap strip sits DIRECTLY
ABOVE the room (the strip + room block is centered, so the eye goes info -> game with no
gap). Landscape/desktop: the info moves to a column on the RIGHT of the room (minimap on
top, objective + status + timer/seed stacked below, vertically centered).

- [x] `render.js` `fitCanvas` now computes the window AND the info block. Portrait (cssH>=cssW):
      width-limited room, `STRIP_H` strip directly above, whole block centered. Landscape
      (cssW>cssH): room fills the left `cssW - COL_W`, a `COL_W` (190px) info column on the
      right. A single `INFO` rect (x/y/w/h/miniY/mode) is written here and read by
      `drawHeader` + `drawMinimap`, so both draw to the same block in either layout.
- [x] `drawHeader` branches on `INFO.mode`: 'top' = left of the strip (stops before the
      minimap); 'right' = stacked below the centered minimap, auto-fit to the column.
- [x] `drawMinimap` places at the right end of the strip ('top') or centered in the column
      ('right').
- [x] `MW`/`MH`/`COL_W`/`INFO` hoisted to module top so the early `fitCanvas()` call can use
      them (they were previously declared after the call -> temporal-dead-zone error).
- Note: the desktop canvas is a 640px-wide tall column (capped by `#wrap`), so it reads as
      portrait-shaped and correctly takes the top-strip layout (a full-width room), not the
      landscape right column. The layout keys off the canvas shape, not the window.

Verified: f17-{portrait,landscape,desktop}.png. All suites green (test-gen 16/16, test-cone
all pass, check-mobile 14/14, check-touch 13/13; sim-play 0/10 deferred).

---

## F18. Top-left spawn + cosmetic start door + version bump - [x] DONE (S)

LO: the player should start at the top-left, and there should be a "start" marker / door in the
wall (visual effect only). Also: bump the version after each change.

- [x] Spawn moved to the top-left of room A: `content.js` `SPAWN_T [2,8] -> [2,2]` (room A,
      top-left, clear of the center patrol line + the pillar region). The mapgen validator and
      test-gen only assert the spawn is in room A on floor, so this is safe.
- [x] Cosmetic start door: `content.js` `START_DOOR { c:3, r:0, w:2 }` (top boundary wall of room
      A, above the spawn). `render.js` draws a recessed door + a gold down-chevron + a soft
      pulsing entry glow just inside the room. Purely visual - not in the map, not in
      `doorLintels`, no logic. It reads as "you walked in here."
- [x] Version: `config.js` `VERSION '0.1.0' -> '0.2.0'` (captures the F16-F18 pre-release
      batch). Going forward it is bumped after every change (patch for small, minor for notable).
- [x] sim-play guard: the new spawn exposed a pre-existing edge case in the deferred bot (a
      malformed transit tile) that crashed the run. `fpSeesTile` now returns false on a falsy
      tile, so sim-play completes and reports its real 0/10 instead of aborting. (The bot's
      winnability stays deferred - this is a guard, not a re-tune.)

Verified: f18-portrait.png + f18-startdoor-zoom.png (top-left spawn, chevron door in the top
wall). All suites green: test-gen 16/16, test-cone all pass, sim-play 0/10 (deferred, no crash),
check-mobile 14/14, check-touch 13/13.

---

## F19 - Room-confined guard AI (0.3.0)

Each room is its own puzzle, so a guard now lives in one room and never crosses a door.

- [x] **Room binding** - `makeGuard` binds `g.room` from its patrol line (a line lives
      wholly in one room). The guard's pursuit is a 4-connected A* over the room's
      16x10 interior; doors sit on the wall, outside that rectangle, so a path can't
      route through them. A guard's feet are never in a room it doesn't own.
- [x] **Last-known pursuit** - on a spot the guard A*-paths to the nearest walkable
      interior tile to your live position (your tile while you're in the room, or the
      door-edge tile when you're across the gap). It walks to the farthest tile it can
      reach - it does not follow you through the door.
- [x] **Search, then resume** - when it reaches the last-seen tile and can't make it
      (lost you, or you're across the door), it holds a `search` (sweeps its gaze for
      `SEARCH_TIME` = 2s, yellow "!"), then `resumePatrol()` back to the nearest
      waypoint. The room resets to its local loop; the guard keeps no memory past the
      beat. Seeing you again (any state) snaps it back into the chase.
- [x] **States + rendering** - new `search` state threaded through the body color, the
      "!" marker (red = seeing, yellow = searching), the minimap cone/dot, the alarm
      re-heat check, and bumping (a searching guard is bumpable from behind).
- [x] **Version** - `0.2.0 -> 0.3.0` (notable AI change).

Verified: 20/20 headless AI checks across 4 seeds (`tools/test-guardai.js`) - the
room-confinement invariant holds for every guard every frame, and the door-edge chase
-> search -> resume-patrol cycle fires. `f19-chase.png` (red "!", gold alarm, "SPOTTED!")
and `f19-search.png` (player slipped into the next room, guard holding a yellow "!" at
the door edge). All suites green: test-gen 16/16, test-cone, test-guardai 20/20, sim-play
runs clean (0/10 - the deferred bot still models the old straight-line chase),
check-mobile 14/14, check-touch 13/13.

## F20 - Denser rooms: 3-5 obstacles + pattern library (0.4.0)

LO's call: each room is a denser puzzle, 3-5 obstacles, uniform tempo (no per-wing
speed). The old pre-authored `PILLAR_POOL` (0-2 chunks, clustered in two bands) is out;
obstacles and guard idle paths are now procedural per room.

- [x] **Obstacle shapes** - `OB_SHAPES` (1x1, 1x2, 2x1, 2x2, L). `placeRoomObstacles`
      drops 3-5 per room at random floor anchors (1-tile margin off the border), never on
      a guard lane or a reserved object tile (spawn/key/file/exit/upgrade/vault approach).
      A short room retries the seed (`minPlaced < 3`), so every room lands 3-5.
- [x] **Pattern library** - `PATTERNS`: line, vline, rectMid, rectFull, L-hex. Each room
      gets `GUARDS_PER_ROLE` guards (spawn 1, key/file/filler 2, exit 1 = 16 total, tempo
      and pressure unchanged), one distinct pattern each. Guard idle = the loop; a spot
      fires the F19 room-confined A* chase.
- [x] **Lanes keep patrols clear** - `patternLanes` marks every tile a pattern walks; obstacles
      avoid them, so `patrolsClear` holds by construction. The validator (patrols + object-on-
      floor + closed/open reachability) stays the safety net.
- [x] **Version** - `0.3.0 -> 0.4.0`.

Verified: `tools/test-gen.js` is now 17 checks (added a density assertion: every room has
3-24 interior solid tiles, no fallback, across 10 seeds). Diagnostic over 200 seeds:
0/200 fell back, guard count 16, interior obstacle tiles 3-18/room (avg ~9.5). Screenshots
`f20-portrait-{42,7,1337}.png` + `f20-landscape-42.png` show distinct, denser scatters per
seed. All suites green: test-gen 17/17, test-cone, test-guardai 20/20, check-mobile 14/14,
check-touch 13/13.

**Honest flag on winnability:** `sim-play` reports 0/10, but that bot predates BOTH F19
and F20 - its guard model still assumes the old straight-line chase, and it was already
0/10 after the doorway change. It is not a valid winnability signal right now. What IS
proven: the quest path exists by construction and the closed/open reachability check holds
for 200/200 seeds, so every map is completable - the guards are the (human) challenge.
Re-tuning the bot to model the room-confined A* chase is the next deferred step if you
want a real number.

## F21 - Guards can't see through doorways (0.5.0)

LO's call: a guard must not see the player through a doorway - and at minimum must
not *activate* on a glimpse across one. A doorway is a 2-tile floor gap, so the plain
LOS ray (`hasLOS`) cleared it and a guard in one room would light up on a player
standing just inside the next room (one it can't actually reach - room confined
since F19).

- [x] **Room-confined sight** - new `guardSharesRoom(g)` in `src/sight.js`: true only
      when the player is inside the guard's own room. `canSee` now requires it, so a
      guard only ever sees (and only ever activates on) a player in its own room.
      Within a room, normal distance + FOV + `hasLOS` still apply.
- [x] **Pre-spot `?` room-gated too** - the patrol pre-spot warning used `hasLOS`
      directly, so it would flash "about to see you" across a doorway that can never
      resolve. It now requires `guardSharesRoom` as well, so no `?`/`!` ever appears
      for a player the guard can't see.
- [x] **Version** - `0.4.1 -> 0.5.0` (notable gameplay change).

Verified: `tools/test-guardai.js` gained 9 doorway checks (3 seeds x: cross-door
player is in range+FOV, guard does NOT see across the doorway, guard DOES see a
same-room control) - all pass, 29 total. Screenshot `f21-doorway.png`: player at the
east door of the spawn room, a guard just across the gap facing them, and that guard
stays calm patrol with no `!`/`?` (confirmed `state=patrol, seen=false, preSpot=false`
for all 16 guards). Side effect: `sim-play` nudged 0/10 -> 1/10 ("GAME IS WINNABLE") -
consistent with each room now being an isolated puzzle.

## F23 - Drag knocked-out guards to bins (Hitman-style body hiding, 0.6.0)

LO's call: like Hitman, you should be able to grab a downed guard, drag it around,
and tuck it in a bin/closet so it's gone for good. Before F23 a knocked-out guard
just lay where it fell, woke up, and might re-spot you - the only option was to
leave the ragdoll and hope it woke up far from you. Now you manage the body.

- [x] **Grab / carry** - the action key (E / gamepad X / the ACT button) is now
      context-aware and edge-triggered (one action per press, so holding it can't
      grab-then-instant-drop). Not carrying: it grabs the nearest downed body within
      `GRAB_DIST` (28px), else falls through to the existing rear knockout. Carrying:
      it hides the body in a nearby empty bin, else drops it. `state.carrying` holds
      the body guard.
- [x] **Carrying slows you** - `CARRY_SPEED_MULT` (0.55) on `PLAYER_SPEED`. You drag
      it, you pay for it. The body follows you and is drawn tucked just under the
      player; a floating cue reads "E: drop" (yellow) or "E: hide body" (green) when
      you're within `HIDE_DIST` (36px) of an empty bin.
- [x] **Hide spots, one per room** - `HIDE_POOL` (the four interior corners, off the
      patrol lanes) in `src/content.js`; mapgen reserves them from obstacles and
      picks one per room by seed, so every room has a bin/closet. Drawn as a recessed
      square: an empty one shows a faint pulsing chevron (the affordance), an occupied
      one a closed lid. They're floor objects (not solid), so they never block a path.
- [x] **Hidden = inert forever** - a hidden body is a new `hidden` guard state, skipped
      by the guard loop, the minimap, the alarm re-heat, and the knockout check. It never
      wakes, never re-activates. This is the payoff: hide it and that guard is done.
- [x] **Room-bound carry** - the body can't be carried through a doorway. The carry
      follow uses `roomAt` (null on a door tile), so the moment you cross the threshold
      the body drops back at the last in-room tile and you're released. A body stays
      in the room you knocked out its guard - it can only be hidden in that room's bin.
- [x] **Drop = wakes on its own timer** - dropping in open floor (or crossing a door)
      leaves the body where it is on its frozen KO countdown; when it runs out it wakes
      as before (instant spot if you're still within `WAKE_SPOT_DIST`, else a dazed
      wobble back to patrol). An occupied bin rejects a second body (it drops instead).
- [x] **Minimap** - each explored room gets a small bin marker (faint blue = empty,
      dimmer = occupied), so you can plan where to dump a body before you commit.
- [x] **Version** - `0.5.1 -> 0.6.0` (new mechanic).

Verified: new `tools/test-bodies.js` (21 checks, all pass): grab on E next to a downed
body; carrying slows you to a 0.55 ratio (measured 30.0px free vs 16.5px carry over the
same move); hiding releases the carry + sets `hidden` + occupies the bin + the body
never wakes over 300 frames; dropping releases + the body wakes on its timer; crossing
a doorway drops the body and it stays in its own room (room-bound); an occupied bin
rejects a second body. All suites stay green: test-gen 17, cone, guardai, test-bodies 21,
sim-play 1/10 (stale bot, not a signal), mobile 14/14, touch 13/13. Screenshots
`f23-room-bins` / `f23-carrying` / `f23-hidden` (seed 42, portrait). Dev hooks added to
`window.__SNEAK` (`dumpBody`, `act`, `carrying`, `spots`) for scripting the mechanic in
captures/tests - harmless in play.

## F24 - Hamburger menu: retry / new / seed in one panel (0.7.0)

LO's call: the on-screen UI was reading like a tech demo (three persistent R/N/T
buttons). Move restart / new / seed into a hamburger menu, leave only the two
action buttons on the play surface (attack + attract), and leave room for an
inventory later. The menu is the app chrome; the two buttons are the game.

- [x] **Menu button** - the old `?` help button (top-left) is now a `#btn-menu`
      hamburger. It opens a `#menu` panel: seed, HOW TO PLAY, RESTART (R), NEW RUN
      (N), TYPE SEED (T), an INVENTORY slot (placeholder, "nothing"), and CLOSE.
      M / Esc also toggle it; tapping outside closes it. The run freezes while it's
      up (`state.paused`).
- [x] **Seed moves to the menu** - the header strip is now objective + status +
      timer only; the seed sits in the menu. Cleaner strip, room to spare.
- [x] **Two action buttons** - the persistent touch buttons are just A (attack,
      gamepad X / E) and K (attract, gamepad Y). The old R/N buttons are gone; their
      jobs live in the menu and the keyboard shortcuts still work.

Verified: `check-touch` rewired for the menu flow (opens the panel, RESTART keeps
the seed + resets to spawn, NEW RUN changes it), still 13/13; `check-mobile` 14/14
(the attract button sits in the clear band). Screenshots `f24-menu-open` /
`f24-knock-lit` (seed 42, portrait).

## F25 - Distract: pull a guard to a wall (make a noise at the wall, 0.7.0)

LO's call (agreeing on all four design forks): a one-button, no-aim distraction.
Stand flush against a wall, tap to distract, and the guards in the room come look -
instead of the throw/aim item verb, a dexterity mechanic that fights the one-hand
mobile identity. It reuses F19's room-confined A* (a new `investigate` state) so
it can't leak across a doorway.

- [x] **Wall adjacency** - `canDistract(x,y)` is true within `DISTRACT_WALL_DIST` (30px)
      of a solid tile. The ACT button dims when it can't fire and glows (`.lit`)
      when you're flush against a wall - the affordance is right on the thumb.
- [x] **Edge-triggered, on cooldown** - Space / gamepad Y / touch K fires `doDistract`
      once per press (never a mash), gated by `DISTRACT_COOLDOWN` (2s). A soft ripple
      is drawn at the wall you hit, since audio is deprioritized.
- [x] **Room-confined lure** - a distraction pulls only guards in the player's own room,
      within `DISTRACT_HEARING` (5 tiles) and only if they're `patrol` or `search` (a
      guard already locked on you keeps chasing). They walk to the wall, sweep for
      `DISTRACT_INVESTIGATE` (2.2s) while searching, then resume patrol. They still spot
      you on sight if you didn't get away. No global alarm.
- [x] **Version** - `0.6.0 -> 0.7.0` (UI restructure + new mechanic).

Verified: `tools/test-knock.js` (all pass): the noise is refused off a wall,
accepted at a wall, and pulls an in-room patrol guard to `investigate` while a guard
in the next room stays on patrol; the cooldown blocks an instant re-distract; the
investigating guard sweeps then walks back to its patrol (never frozen); a chasing
guard is not broken off by a distraction. All suites stay green: test-gen 17, cone,
guardai, bodies, knock, sim-play 1/10 (stale bot), mobile 14/14, touch 13/13.

## Bugfixes

### 0.4.1 - First-load canvas size

The initial `fitCanvas()` ran at script-eval time, before the flex column
(`#stage { flex: 1 1 auto; min-height: 0 }`) had resolved its height, so
`canvas.clientHeight` read 0 and the call fell back to the 640x480 default.
The canvas then mis-sized (stretched) for a frame or two until a later re-fit
(corrected only on a resize event). Fix in `src/render.js`: keep the immediate
fit, but also re-fit on the next animation frame (which runs BEFORE the first
paint, once layout is settled) and on the window `load` event, alongside the
existing `resize` listener. Verified with a first-paint probe: at the first
painted state the backing store matches the CSS display size (372x826 at a
390x844 viewport) instead of 640x480.

### 0.5.1 - Guards freeze on return to patrol

LO caught it: guards were getting stuck when they gave up a chase and came back to
patrol. Root cause - `chase` moved on the A* `pathTiles`, but `patrol` moved
**straight-line** to its waypoint (`tryMove` in a beeline). A guard that just
finished a search is off its lane, so the straight beeline to the nearest waypoint
could run into one of F20's obstacles, where `tryMove`'s wall collision stalled it
forever. ("That doesn't sound like A* at all" - correct, it wasn't using A*.)

- [x] **Patrol now walks its waypoint with A*** - the `patrol` branch in
      `src/update.js` re-paths (one A* per waypoint, cheap) via `guardPath` +
      `followPath`, exactly like the chase. A guard returning from a chase now walks
      *around* the obstacle instead of beelining into it. `resumePatrol` clears the
      chase `pathTiles` so patrol re-paths fresh; the waypoint is re-pathed only when
      the current path is spent, and cleared again on advance so the next waypoint is
      targeted.
- [x] **Version** - `0.5.0 -> 0.5.1` (bugfix).

Verified: `tools/test-guardai.js` gained a return-to-patrol check - drops all 16
guards at a random off-lane floor tile per seed (42/7/1337 = 48 resumes), resumes
patrol, and asserts none freeze (0 froze). A 6-seed diagnostic over 96 off-lane
resumes also came back 0 stuck. `sim-play` reading (0/10) is the stale bot and is
not a winnability signal; the guard-behavior invariant is the no-freeze check above.

### 0.7.1 - Knock/attract never fired in play

LO's report: the attract (knock) button did nothing in desktop mode. Root cause -
three gaps, all in `src/update.js`, none of which the headless knock test caught
because it called `doDistract` / `canDistract` directly rather than driving the game loop:

- [x] **No trigger in the loop** - `doDistract` was only reachable via the manual
      `__SNEAK.knock()` hook. Nothing read Space / gamepad Y / touch K to fire it.
      Added the edge-triggered attract input (Space / `state.pad.y`), gated by the
      cooldown and `canDistract` (wall adjacency), right after the action key.
- [x] **Cooldown never decayed** - `doDistract` set `distractCd` to 2.0 but nothing
      decremented it, so one knock would lock the button out forever. Now decays with
      `dt` each frame.
- [x] **Ripple never advanced** - `distractFx.t` was set to 0 and never incremented, so
      the ripple stayed a static full-opacity ring. Now `t` advances and the effect
      clears after 0.7s.

Verified: a CDP drive of the real game (desktop, 1024x768) pressing the actual Space
key: the cooldown arms 0 -> 1.84 (before this fix it stayed 0), decays 1.16 -> 0.34 ->
0, and re-arms on a fresh run; a staged patrol guard two tiles out goes `investigate`
and stays lured once the player runs (the guard walks an empty wall). All suites stay
green: test-gen 17, cone, guardai, bodies, knock, sim-play 1/10 (stale bot),
mobile 14/14, touch 13/13. Dev hooks added to `window.__SNEAK`: `state.distractCd` in
the state snapshot and a `lureSetup()` staging helper.

### 0.7.2 - The knock gets a heard-it beat (freeze, "!", turn to the sound)

LO's call: a knock should read as a real reaction, not a teleport. Before, a lured
guard snapped straight into `investigate` and slid to the wall - a silent glide. Now
there's a `hear` state in between: the guard **freezes**, drops an amber **"!"** cue,
and **turns to face the sound** (`HEAR_PAUSE` 0.55s), then walks to the wall. That
turn is the risk - turn your back to it and you get a beat to bolt; stand still and it
swings around to you and the knock hands you the chase.

- [x] **New `hear` state** - `src/update.js`: `doDistract` now sets `hear` (with `hearT`
      + `hearAngle`) instead of `investigate`; a `hear` branch freezes the guard, swings
      `facing` toward the sound with a shortest-angle turn (5 rad/s), then hands off to
      `investigate` when the pause is up. If it spots you mid-turn it goes straight to
      `chase`.
- [x] **The tell** - amber body tint + amber "!" while hearing (red only once it
      actually sees you; yellow is search). The minimap dot reads alert too.
- [x] **Version** - `0.7.1 -> 0.7.2`.

Verified: `tools/test-knock.js` now asserts the full sequence - the in-range guard
enters `hear` (frozen `HEAR_PAUSE`), turns toward the sound (facing lands ~0 rad for a
knock to its east), then walks to `investigate`, sweeps, and returns to patrol with no
freeze; a cross-room guard is still not lured and a chasing guard keeps its lock-on.
All suites stay green.

### 0.7.3 - Pathfinding isolated to src/path.js (A* only)

LO's call: always and only A*, and pathfinding belongs in its own file, not buried in
the update loop. The audit found A* was already the only algorithm (F22 killed the
beeline patrol), but it lived in `src/update.js` mixed with combat and the quest chain.
It now lives in `src/path.js` as a proper `AStar` class:

- [x] **`AStar` class** - `findPath(sc, sr, tc, tr, walkable)` is a pure 4-connected
      A* (Manhattan heuristic, open set + g/f scores + parent map). One shared `PATH`
      instance.
- [x] **Room-scoped helpers** - `roomBounds`, `roomWalkable` (in-bounds + floor),
      `nearestFloorTile` (the pursuit / door-edge goal), and `roomPath(g, tc, tr)` (the
      guard's A* across its own room; snaps an off-grid guard to the nearest floor
      tile first).
- [x] **update.js only picks goals + follows** - the guard AI calls `roomPath` /
      `nearestFloorTile` and keeps `followPath` (advancing the guard tile-by-tile with
      collision) - that's movement, not pathfinding, so it stays. No beeline, no greedy
      step, no BFS anywhere in the game.
- [x] **Version** - `0.7.2 -> 0.7.3` (pure refactor, zero behavior change).

Verified: no behavior change - every suite is identical to before: test-gen 17, cone,
guardai (patrol / chase / search / no-freeze return), bodies, knock, sim-play 1/10
(stale bot), mobile 14/14, touch 13/13. A grep confirms zero references to the old
`guardPath` / `interiorWalk` / `guardTargetTile` names remain in src/ or tools/.

### 0.8.0 - Unified movement + collision (sticky-corner fix, F26 Phase 2)

Part of the CONTROL-REFACTOR (D1 file-based, D2 tactics_3d-as-baseline locked in
`CONTROL-REFACTOR.md`). Movement / collision is now ONE unit-aware resolver for every
unit - the first concrete increment of the unified-control system.

- [x] **`src/movement.js` rewritten** - `tryMove(u, dx, dy)` is the single movement
      path for the player AND guards (via `followPath`). It reads each unit's own
      radius, sub-steps, and resolves X then Y so a blocked axis still slides.
- [x] **Sticky-corner fix** - the collision footprint is now a **circle** (12 samples)
      instead of the inscribed square. The square's corners reached `r*sqrt(2)`~15.5px,
      so diagonal cornering stopped ~4px early and felt "sticky"; a circle stops at the
      true radius (~11px) and rounds the corner. Same 22px in open corridors.
- [x] **Lag-spike robustness** - moves are **sub-stepped** (max 8px) so one big frame
      can't tunnel a thin wall or wedge a corner.
- [x] **`tools/test-move.js`** - 6 permanent checks (wall slide, corner radius, no
      tunneling, unit-aware radius). All green.
- [x] **Version** - `0.7.3 -> 0.8.0`.

Honest note: I could NOT reproduce a hard wedge - the axis-separated resolver already
slides around corners and never traps a unit. The real fixes here are the ~4px earlier
corner-catch (circular footprint) and lag-spike tunneling (sub-stepping). The sim-play
bot (known-stale, not a real player) went 1/10->0/10 because the tighter cornering
nudges its 0.25s crossing windows; the map stays fully solvable (test-gen 50-seed
green). Sub-stepping alone keeps the bot green if you'd rather drop the circular part.
Full suite green: test-gen 17, cone, guardai, bodies, knock, **move (new)**, mobile
14/14, touch 13/13.

### 0.8.1 - Reverted the circular footprint (it felt WORSE, not better)

LO tested 0.8.0 in the browser and reported it felt stickier than before - "any
obstacle is sticky, in fact worse now." The circular-footprint hypothesis was wrong:
the square box's 8 sample points sit exactly on the 4-way + diagonal axes the d-pad
uses, so axis-aligned motion reads as rock-stable; a 12-point circle does not align
that way and the grazing feel got worse. Reverted to the square footprint (the baseline
LO was comparing to).

- [x] `src/movement.js` back to the 8-point square footprint. **Sub-stepping kept** -
      it is inert at a normal 60fps frame (delta ~2.5px < the 8px ceiling -> one step)
      so it is feel-identical to the baseline, and it only ever fires on a lag spike to
      prevent a tunnel. sim-play is back to 1/10 (seed 7000), confirming the baseline
      movement is restored.
- [x] `tools/test-move.js` T2 re-scoped to be footprint-agnostic (no tunnel on a
      diagonal corner approach + not frozen). Full suite green.
- [x] **Version** - `0.8.0 -> 0.8.1` (footprint revert).

**The real sticky-corner fix landed in 0.8.2** (LO sent a screenshot of the exact
stuck spot, which let me reproduce it headless). See below.

### 0.8.2 - Corner escape: no more wedged-on-a-corner (the sticky fix)

LO sent a screenshot: the player was stuck and could not move right. It is a genuine
corner WEDGE - `tryMove` is all-or-nothing per axis, so when the box's corner is
pinned in the neighbor tile (your lower-right corner caught on the obstacle's
upper-left corner), the held axis is blocked for every frame and you grind to a stop
instead of sliding around. Reproduced headless exactly: baseline moves right only
7.5px and stops short of the open tile.

- [x] **`src/update.js` corner escape** (player controller, on top of the unified
      `tryMove`): when the axis you are holding is fully blocked, probe whether rolling
      a hair along the free perpendicular axis would clear the way ahead; if so, nudge
      that way (0.5x speed) so you roll the corner instead of sticking. A probe ahead
      keeps a straight wall from triggering a false roll (rolling there clears nothing).
      Pure-axis holds only - a diagonal already slides via its free axis.
- [x] **Why not just shrink the hitbox** (LO's suggestion): tested - it only clears
      this spot at r=7 (14px box; r=8 still stuck), it is still catchable at the
      extreme corner, and the player is drawn at `state.player.r` so it shrinks below
      the guards. It is a valid nimbler-feel complement, not the complete fix.
- [x] **`tools/test-corner.js`** (permanent): drives the real `update()` on the exact
      stuck geometry - hold right rolls around, hold down rolls around (mirror), and a
      straight wall produces zero drift (no false roll). All green.
- [x] **Version** - `0.8.1 -> 0.8.2`.

Full suite green: gen 17, cone, guardai, bodies, knock, move, **corner (new)**, sim-play
1/10 (still winnable), mobile 14/14, touch 13/13. Optional next: trim the player
hitbox a touch for a nimbler feel now that the escape guarantees no-stuck.

### 0.8.3 - CONTROL-REFACTOR Phases 4 + 5 (path + vision architecture, no behavior change)

Pure refactor to lock SNEAK RUN's pathfinding and vision onto the same
architecture as tactics_3d, ahead of the Phase 1 unit-model merge. No gameplay or
visual change - the full suite and a seed-42 screenshot confirm behavior is
byte-for-byte the same.

- [x] **Phase 4 - pathfinding boundary.** Verified A* (`src/path.js`) is the sole
      unit pathfinder (every guard goal goes through `roomPath` -> `AStar`). The one
      BFS (`reachable` in mapgen.js) is a generation-time solvability validator, not
      a pathfinder - it routes no unit and test-gen depends on it, so it stays.
      Documented the boundary in the path.js header ("only A*" scopes to unit
      pathfinding; tactics_3d keeps Dijkstra/BFS).
- [x] **Phase 5 - vision + fog owner.** `src/sight.js` is now the single owner of
      "who sees whom" and the fog model:
      - `preSpot(g, range)` extracted out of render.js (the tentative "?" band) so
        canSee + preSpot + guardSharesRoom + hasLOS all live in one file; render.js
        only draws.
      - Fog consolidated: `rememberRoom` (update.js calls on entry),
        `roomRemembered` (minimap fog), `isRevealed` (objective/upgrade reveal gate,
        was the render-local `isExploredAt`). The room->explored-index mapping now
        lives in one place instead of 5.
      - Header documents the 1:1 mapping to tactics_3d's per-faction vision state:
        `vision` = current room (derived), `remembered` = `state.explored[9]`,
        `revealed` = draws once remembered. Room-granular by design.
- [x] **Phase 5.3 confirmed:** the main viewport draws no cone (unknowable threat
      holds); the minimap uses a simplified room-clipped arc gated on the radar
      upgrade; `conePy`/`raySeg` stay as the tested precise-cone toolkit.
      (Noted: render.js `drawCone` is an uncalled leftover - left in place.)
- [x] **Version** - `0.8.2 -> 0.8.3`.

Full suite green: gen 17, cone, guardai, bodies, knock, move, corner, sim-play
1/10, mobile 14/14, touch 13/13. Screenshot seed 42 confirms fog/minimap/pre-spot
unchanged. Next: Phase 1 (unified unit model) - the big one.

### 0.9.0 - CONTROL-REFACTOR Phase 1 (unified unit model, no behavior change)

The big one: guards, the player, and any future strong guard / VIP are now the
same thing - a unit in ONE `state.units` array with a `type` and data-driven
stats. Built in thin slices, full suite green at every step, the stealth AI logic
touched only in *where its data lives*, never *what it does*. No gameplay or
visual change (values re-sourced from a table holding the same numbers).

- [x] **`src/unit.js` (new).** The data-driven `UNIT_TYPES` table (one row per
      type: `radius`, `moveSpeed`, `chaseSpeed`, `sightDist`, `patrolFov`,
      `chaseFov`, `moveType`) + `statsFor(type)` + `makeUnit(type, id, base)`.
      Loaded after `config.js`; wired into `load-game.cjs`.
- [x] **Single unit array.** `state.units = [player, ...guards]` is the source of
      truth (player first, `id` 0; guards `id` 1..16). `state.player` =
      `units[0]` and `state.guards` stay as stable convenience refs, so all ~83
      existing refs + the `__SNEAK` hooks + test harness keep working untouched
      (decision G1: keep the refs; Option B "rewrite every ref" is deferred).
- [x] **Table is the single source.** The AI, minimap, and dev-hook no longer read
      `VISION_RANGE`/`PATROL_FOV`/`CHASE_FOV`/`PATROL_SPEED`/`CHASE_SPEED`/
      `PLAYER_SPEED` - they read `statsFor(g.type)` per unit (a new guard type gets
      its own sight/pace/FOV with no AI edit). Zero unit-stat literals remain
      outside `unit.js` + `config.js`.
- [x] **Corner-escape folded into shared movement (G5).** The 0.8.2 escape moved
      out of the player controller into `movement.js` as `freeMove()` - the
      movement path for free-steering units. The player calls it; any future VIP /
      roamer inherits the no-wedging assist for free. (Phase 2.5 loose end closed.)
- [x] **Provenance test.** `tools/test-units.js` (12 checks): identity + refs,
      plus the money shot T4 - a test-only `testguard` row (fat, fast, sees far) +
      a spawn is treated by the shared movement (its own 36px box is blocked where
      the 20px guard box fits) and shared sight (`canSee` sees a player at 224px
      a 192px guard cannot) with NO changes to movement/sight/AI code.
- [x] **Version** - `0.8.3 -> 0.9.0` (minor: notable architecture change).

Full suite green: gen 17, cone, guardai, bodies, knock, move, corner, **units 12**,
sim-play 1/10 (winning seeds 4000, unchanged), mobile 14/14, touch 13/13. Seed-42
render unchanged. Next: Phase 3 (unified control / intents - the multiplayer
foundation), Phase 6 (renderer-agnostic rule extraction), Phase 7 (module layout).

### 0.10.0 - CONTROL-REFACTOR Phase 3 (unified control / intents, no behavior change)

The multiplayer foundation: input capture no longer mutates game state - it only
records raw held input (`state.keys` / `state.pad`) and emits plain-data meta
intents into `state.intentQueue`. A single controller (`src/controller.js`) consumes
them. Built in thin slices (H1=full, H2=held-snapshot, H3=controller.js, H4=verify-
not-rewrite, H5=minor bump) - full suite green at each, behavior-neutral.

- [x] **The intent channel.** `state.intentQueue` (plain array), cleared in
      `reset()`. Plain objects, so the whole per-frame input stream serializes.
- [x] **The controller (gameplay intents).** New `src/controller.js`:
      `stepPlayer(dt)` holds the player's gameplay intents - the held move (keys
      OR'd with pad -> `freeMove`), the edge-triggered `act` (F23 grab/hide/knockout) and
      `knock` (F25), and the room-bound carried-body follow. That exact block moved
      out of `update.js` verbatim, so behavior is byte-identical.
- [x] **Meta intents.** `processIntents()` drains `state.intentQueue` of meta
      intents (restart / newSeed / typeSeed / toggleMenu / closeMenu / help /
      toggleTouch) and runs at the TOP of `update()`, before the paused early-return
      (the intro/menu both set `state.paused`, so a queued intent must still advance
      the frame). `input.js` + `controls.js` now only EMIT these intents; the exact
      intro state-machine (incl. the load-bearing `return` so Enter-during-intro
      dismisses but doesn't restart) is preserved. `toggleTouch` extracted to hud.js.
- [x] **Guard AI provenance (H4).** Verified + documented in the AI header: the guard
      state machine reaches motion/sight/routing ONLY through the shared primitives
      (`followPath` -> `tryMove`, `canSee`/`hasLOS`, `roomPath`) and reads
      `statsFor(g.type)` per unit - no bespoke collision/sight, no hardcoded
      radius/fov/range. A new guard type is behavior-parameterized by its row, not a
      parallel code path.
- [x] **The payoff - deterministic replay.** `tools/test-intents.js`: the input stream
      is plain/serializable (T1); the run is a **pure function of (seed, input stream)**
      - two identical scripted input streams on a fresh `reset(42)` replay the player
      path frame-for-frame over 90 frames (T2); a queued meta intent is consumed across
      a paused frame (T3). That is "forward the intents over the wire," proven headless.
- [x] **Version** - `0.9.0 -> 0.10.0` (minor: notable architecture change).

Full suite green: gen 17, cone, guardai, bodies, knock, move, corner, units 14,
**intents 4**, sim-play 1/10 (unchanged, winning seeds 4000), mobile 14/14, touch
13/13. Seed-42 render unchanged. Next: Phase 6 (renderer-agnostic rules +
deterministic/serializable state - `replay.js`) and Phase 7 (module layout).

---

### 0.11.0 - CONTROL-REFACTOR Phase 6 (renderer-agnostic rules + deterministic, serializable state)

The multiplayer/persistence foundation: the sim is now demonstrably a pure function of
(seed, input stream), `state` is plain/serializable end-to-end, and there is a real
replay driver you can point at an intent file. Three thin, behavior-neutral slices -
full suite green at each.

- [x] **6.1 State serializability.** `tools/test-serialize.js`: after `reset(42)` + 60
      frames of real input, the WHOLE `state` (map, units, guards, hideSpots, explored,
      keys, pad, intentQueue, upgPos/filePos/exitPos, doorTiles/Lintels, carrying, knock,
      alarm, camera) JSON-round-trips losslessly (deep-equal) and survives a JSON trip
      (the `carrying` guard reference and the `exitPos`/`upgPos`/`filePos` refs included).
      9 checks. If `state` were ever non-plain, this fails - so save/resume + send-state
      are proven safe.
- [x] **6.2 Named guard rule.** The per-guard AI body moved out of `update()`'s guard
      loop into `stepGuard(g, dt)` in `src/update.js` (the loop is now pure
      orchestration; the alarm-scaled sight/pace helpers moved into it too). Behavior is
      byte-identical - `test-guardai` and `test-units` T5 (a second guard type steps at
      its own speed) both green.
- [x] **6.3 `replay.js` - the payoff.** New `src/replay.js`: `runReplay(seed,
      inputFrames, dt)` resets, feeds each frame's recorded input, steps the real
      `update(dt)`, and records a compact frame - reusing update/controller, NO
      duplicated rules. Wired in: `index.html` + `load-game.cjs`, `__SNEAK.replay` +
      `__SNEAK.serialize` dev hooks. `tools/replay.js` CLI (point it at an intent file,
      or run the built-in demo) + `tools/replay-sample.json`. `test-intents` T4: the run
      **REPLAYS ITSELF** (runReplay reproduces a live-driven run frame-for-frame); T5:
      two calls, same input, bit-identical (deterministic).
- [x] **6.4 Determinism.** A* + the guard AI are `Math.random`-free; only the seed
      drives layout. T5 + `sim-play` (1/10, unchanged) confirm bit-stability.
- [x] **Version** - `0.10.0 -> 0.11.0` (minor: the replay/serialization layer ships).

Full suite green: gen 17, cone, guardai, bodies, knock, move, corner, units 14,
**intents 6, serialize 9**, sim-play 1/10 (unchanged), mobile 14/14, touch 13/13.
Seed-42 render unchanged. Next: Phase 7 (module layout: the deferred `src/rules/` split
+ the `controls` rename).

---

### 0.12.0 - CONTROL-REFACTOR Phase 7 (module layout mirror)

The last phase of the CONTROL-REFACTOR. D1 = keep flat classic scripts over file://
(ES modules can't load over file://, and the zero-deps / file:// ethos is
non-negotiable). The real structural win: the guard AI state machine now has its own
file, so the source mirrors tactics_3d's rules/AI split. One job per file, no file
owns both rules and DOM. Behavior-neutral.

- [x] **Guard AI got its own file.** Pulled `followPath` / `resumePatrol` /
      `enterChase` / `angleTo` / `wakeGuard` / `stepGuard` out of `update.js` into new
      `src/ai.js`. `update.js` is now pure orchestration + the player's interactions
      (knockout / body-drag / distract) + combat (`hitPlayer`). The boundary is the one that
      matters: the AI *reacts* to you (ai.js); what *you* do to it lives in update.js.
- [x] **Self-documenting load order.** The `index.html` script list now carries a
      per-file responsibility note (config / data / model / shared primitives / AI / sim
      + controller / presentation / input / boot), and documents why the tree stays flat.
- [x] **Responsibility audit.** `update.js` has zero DOM access; `render.js` only reads
      state. No file owns both rules and DOM.
- [x] **Docs.** Created `README.md` (was missing): what the game is, controls, the full
      test suite, the per-file `src/` layout table, and the design notes (rooms-as-
      levels, data-driven units, determinism, only-A*). `feature-checklist.md` +
      `CONTROL-REFACTOR.md` updated.
- [x] **Version** - `0.11.0 -> 0.12.0` (minor: the AI/rules file split ships).

Full suite green: gen 17, cone, guardai, bodies, knock, move, corner, units 14,
intents 6, serialize 9, sim-play 1/10 (unchanged), mobile 14/14, touch 13/13.
Seed-42 render unchanged. **CONTROL-REFACTOR complete (Phases 0-7).**

---

### 0.12.1 - play-session bugfixes (knockout interrupt + kitty-corner LOS)

Two fixes from LO's playtest, both with regression tests (`tools/test-los.js`, 9
checks). The sim-play bot's vision model was also brought in line with the game's
new LOS.

- [x] **You can now interrupt a guard's animation to knock it out.** The rear knockout
      only worked on guards in `patrol` / `chase` / `search`, so a guard doing its
      knock response (`hear` freeze-turn, `investigate` sweep) or its `dazed` wobble
      couldn't be put down. Flipped `tryKnockout` from a state whitelist to a blacklist:
      any upright, reachable guard is rear-bumpable (the rear-arc + distance checks
      keep it fair); only `down` and `hidden` guards aren't.
- [x] **Guards no longer see through kitty-cornered blocks.** `hasLOS` (src/sight.js)
      was sampling the ray every 8px, which threaded the diagonal seam where two
      corner-touching blocks meet. Replaced the sampler with an Amanatides-Woo DDA
      that walks the ray cell-by-cell - a DDA can't cross two diagonal blocks without
      stepping through a solid cell, so the corner is blocked. Also added the
      deterministic corner rule (threading a grid corner with a solid side cell blocks
      it). Guard shooting uses the same `hasLOS`, so sight and shots stay consistent.
- [x] **Sim-play bot reconciled.** The bot kept its own 8px point-sampled LOS for
      planning, which went out of sync with the game's stricter DDA and made it
      over-cautious (it lost to the time cap). Mirrored the DDA into the bot's
      `los()` (with its key-aware door handling). Win rate went 1/10 -> 0/10 on the
      mismatch -> 3/10 once reconciled: the game is now more fairly winnable.
- [x] **Version** - `0.12.0 -> 0.12.1` (patch: two playability bugfixes).

Full suite green: gen 17, cone, guardai, bodies, knock, move, corner, units 14,
intents 6, serialize 9, **los 9 (new)**, sim-play 3/10 (up from 1/10), mobile
14/14, touch 13/13.

**Open question for LO (resolved in 0.12.2):** the single action button is both
"knockout" and "hide the body," so you can't knock a guard out while carrying a body.
LO's pick: guard actions (knockout / grab) beat the wall-distract, and carrying a
body leaves your hands full (hide or drop only).

---

### 0.12.2 - One contextual action button (the ACT button)

Resolves the open question from 0.12.1. The three action inputs (E knockout, Space
distract, and the two touch buttons) collapse into ONE contextual button - the verb
comes from where you are, not from which key you hit.

**Terminology (0.12.2):** the rear takedown is a **knockout** (you knock the guard
out - a taser, a sack, whatever; "bump" was an apology, not a takedown), and the wall
lure is a **distract** (you make a noise to pull guards over). "bump" and the wall
"knock" are retired throughout the code and docs.

- [x] **The precedence (LO's spec).** Carrying a body leaves your hands full, so it
      decides first: at a free bin = **hide**, otherwise = **drop** (a wall is not a
      distraction). Not carrying, guard actions beat the wall-distract: an awake
      guard in your rear arc = **knockout**, else a downed guard in range =
      **grab**, else flush against a wall = **distract**. Nothing nearby = nothing.
- [x] **`actionContext()`** (src/update.js) is the pure resolver - it returns the
      verb (`hide`/`drop`/`knockout`/`grab`/`distract`) or `null` with no mutation,
      so the HUD lights the button from it every frame; `tryAction()` performs it.
      `tryKnockout()` returns whether anyone went down and shares the
      `isKnockoutTarget` predicate with the button light, so the two can't drift.
- [x] **One input, all aliases.** E, Space, gamepad X, gamepad Y, and the touch
      button all feed the single edge-triggered `act` in the controller; the distract
      is no longer its own input - it's the wall-branch of the contextual action.
- [x] **One touch button.** `#btn-bump` + `#btn-knock` merged into a single
      `#btn-act` ("ACT"), lit whenever a verb is available and dim when there's
      nothing to act on. The intro's control table and bullets describe the one
      contextual button now.
- [x] **Tests** - `tools/test-action.js` (11 checks) isolates each context and
      proves the precedence, including the two LO-flagged cases: carrying against a
      wall resolves to **drop** (not distract), and a wall plus a rear guard
      resolves to **knockout** (guard beats the distract).
- [x] **Version** - `0.12.1 -> 0.12.2` (patch: control unification + the
      bump/knock -> knockout/distract terminology, no behavior change).

Full suite green: gen 17, cone, guardai, bodies, knock, move, corner, los, units 14,
intents 6, serialize 9, **action 11 (new)**, sim-play 3/10, mobile 14/14, touch 13/13.

---

### 0.13.0 - Guard population: longer knockouts, bodies wake, and fixed sentries

Three guard changes (F28) that thicken the room puzzles and give the guard
population real variety.

- [x] **Longer knockout window.** `KO_TIME` raised 6s -> 10s (+2/3) - a knocked-out
      guard stays down long enough to actually reach its bin, but leaving it in the
      open is now a real risk (next bullet).
- [x] **Bodies wake if a guard finds them.** An awake, mobile guard that stumbles
      within `WAKE_DISCOVER_DIST` (2.5 tiles) of a downed guard, with clear line of
      sight, shakes it awake - it stirs toward the waker, wobbles dazed, resumes
      patrol. A carried body is being dragged to a bin so it's never woken this way,
      and a body a wall hides from a guard is never discovered. `wakeBody()` (ai.js).
- [x] **Fixed sentries (post guards).** 3 of the 16 guards are stuck at their post -
      they never move; only their head swings, in 90-degree steps, cycling the four
      cardinal directions to monitor the room. They still see you (the alarm
      re-heats) and can tag you up close, but they can't chase. A small pedestal in
      the render marks the post. Designated by the stride rule
      `i % POST_STRIDE === POST_OFFSET`. Knockable from behind like any guard - time
      it to when the head is turned away.
- [x] **`canSee` ignores unconscious guards.** A downed / dazed / hidden guard's
      stale facing no longer re-heats the alarm - matters now that bodies stay down
      10s (src/sight.js).
- [x] **Tests** - `tools/test-f28.js` (9 checks): KO_TIME = 10, a patrol guard wakes
      a nearby body in 1 frame (vs the 10s timer), the LOS gate, exactly 3 post
      guards, a post guard never moves (0px drift over 4s), its head sweeps all four
      90-degree directions, and a post guard is knockable from behind.
- [x] **Version** - `0.12.2 -> 0.13.0` (minor: new guard mechanics).

Full suite green: gen 17, cone, guardai, bodies, knock, move, corner, los, units 14,
intents 6, serialize 9, action 11, **f28 9 (new)**, sim-play 0/10, mobile 14/14,
touch 13/13. sim-play dropped 3/10 -> 0/10 - the three new threats are harder for
the dumb bot (it still reaches the key on 5/10, so the map is traversable); a human
times the sentry's scan or knocks it from behind. Difficulty tuning stays deferred
(sim-play is not a real player).

---

### 0.14.0 - Three colored keys + an inventory bar (F29)

The single key/door generalizes to three colored keys, each opening its own locked
door on the sealed bottom row, with an inventory bar up top showing what you carry.

- [x] **Three colored keys.** `content.js` now has a `KEYS` table: **blue** (room A,
      opens D-G / the exit), **gold** (room D, opens F-I / the dead-end side trip),
      and **red** (room E, opens E-H / the vault + file). The whole bottom row (wall
      y=22) is now locked - three 2-tile doors, six value-2 tiles.
- [x] **Per-color state.** `hasKey`/`doorOpen`/`keyPos`/`doorTiles`/`keyRoomIdx`
      become per-color objects (`keyBag`, `doorsOpen`, `keyPos`, `doorTiles`,
      `keyRoomIdx`). The bag is `keyBag` on purpose - `state.keys` is already the
      keyboard-hold map (input.js/controller.js), and a duplicate field name
      silently discarded the inventory initializer (last key wins in a JS object
      literal). Pickup is a loop over `KEYS` (walk over one to collect it); a
      door opens only when you touch it holding the matching key.
- [x] **The solvability proof generalizes.** `mapgen.js` gains `validateKeyChain()`,
      a fixed point: a key becomes grabbable the moment it's reachable with the
      already-open doors, which opens its door, repeat until no new key is in reach.
      Solvable iff every key is collected AND file + exit are in the final set. It
      replaces the old "key reachable with the vault closed, file/exit with it open"
      check; generation and the fallback both place the three keys from per-room pools
      and validate with it.
- [x] **Inventory bar.** The top strip draws a colored chip (with a keyhole) for each
      key you've collected, and the objective reads "FIND THE KEYS n/3". Collected keys
      also ride as little dots above the player, and the menu inventory lists them by
      name/color. The key colors (blue/gold/red) stay clear of the file (light blue)
      and exit (green) dots on the minimap.
- [x] **Colored doors.** Locked doors render as panels in their key's color (with a
      keyhole slot) and fade out once opened; the minimap shows each uncollected key
      as a colored dot in its room.
- [x] **Role rebalance.** No more "key room" - the guard table is spawn/file/exit/
      filler (still 16 total), since the keys now sit in the spawn and filler rooms.
- [x] **Tests + docs** - `test-gen.js` rewritten for the multi-key invariants (6
      locked tiles, 20 open gaps, keys in A/D/E, `validateKeyChain`, all-doors-open
      upgrades); the intro/help, `README`, the `__SNEAK` hook, replay frames, the
      sim/bot tools, and `playtest.js` all track the three keys.

Full suite green: gen 17, units 14, move, los, cone, guardai, bodies, knock, action 11,
intents 6, serialize 9, corner, f28, sim-play (the bot now collects all 3 keys and
stalls at the doors - a policy limit, not a game bug; the door-open + pickup mechanics
are verified headless), mobile 14/14, touch 13/13.

---

### 0.15.0 - Inventory icons: the HUD shows everything you're carrying (F30)

The header's little inventory row was keys-only. Now every picked-up thing gets an
icon, and the menu is the full named inventory.

- [x] **`drawInventory()` (render.js).** One shared helper draws the row for both
      header modes (portrait strip on top, landscape column on the right), so the two
      can't drift. Each icon is 10x10 on a 13px pitch:
      - **Keys** - a real key icon (`drawKeyIcon`): a round bow with a hole, a
        shaft, and two teeth, pointing right - one per collected key, in its color.
      - **The file** - a small white lined document (matches the on-map file).
      - **Banked upgrades** - a colored chip carrying the upgrade's glyph (V / H / W),
        matching the pickup marker, so an icon and the room marker read as the same
        thing.
- [x] **The PWR word text is retired.** The old `PWR STIM HUSH HEAVY` label
      duplicated the upgrade icons and would overrun the portrait strip in the
      max-loaded case (3 keys + file + 3 upgrades). The icons *are* the display; the
      timer stays on the line. Glyph meanings were already documented in the intro
      ("V speed, H hush, W weight").
- [x] **The menu is the full inventory (hud.js).** `#menu-inv` now lists keys,
      the file, and each banked upgrade with its effect ("STIM (+15% speed)"),
      color-matched to the header icons. This is where the names/effects live now
      that the header is icons-only.
- [x] **Both orientations verified** - portrait strip and landscape right column both
      render the full row and fit beside the minimap (seed 42, all items).

Full suite green: gen 17, units 14, move, los, cone, guardai, bodies, knock, action 11,
intents 6, serialize 9, corner, f28, mobile 14/14, touch 13/13, playtest 35/35.

---

### 0.15.1 - The alarm, made real + the blue key leaves the spawn room (F31)

The intro copy always promised "the compound goes hot (faster, sharper, they stop
giving up)," but the code only did two of the three, and the blue key spawned in
the player's own room. Both fixed now.

- [x] **While hot, patrol/investigate movement is faster (`ALARM_PATROL_SPEED_MULT` = 1.15).**
      The alarm already scaled chase speed (x1.35) and vision range (x1.4). Now the
      `moveSpeedFor()` helper in `ai.js` scales the patrol and investigate movement too,
      so the whole board feels fast while it's hot, not just the one guard on you. Chase
      stays the fastest (x1.35) so the active threat still reads clearly.
- [x] **While hot, a guard that loses you keeps hunting longer (`ALARM_SEARCH_MULT` = 1.75).**
      This was copy, not code. `searchT` now enters at `SEARCH_TIME * 1.75` (3.5s) while
      the alarm is hot, and the normal `SEARCH_TIME` (2s) when it's cold. "They stop giving
      up" is now a real, felt mechanic: break line of sight *and keep it broken* for the
      full 10s, or a guard is still searching when it wears off.
- [x] **The blue key moves out of the spawn room into the F dead end.** It used to sit in
      room A with the player. Now `KEYS.blue` is `room: [2,1]` (F) with a room-relative
      pool, so the exit key is a genuine detour (A -> D -> E -> F) before you can open the
      blue door at G. Solvability is preserved: F is reachable from E with no keys, so
      `validateKeyChain` still proves all three keys grabbable and the file + exit reachable.
- [x] **`tools/test-alarm.js`** - constants sanity, hot-vs-cold search time (3.5s vs 2s),
      hot-vs-cold patrol distance (measured x1.15), and the blue key's room. `test-gen` now
      checks "keys in F/D/E."

Full suite green: gen 17, units 14, move, los, cone, guardai, bodies, knock, action 11,
intents 6, serialize 9, corner, f28, alarm 9, mobile 14/14, touch 13/13, playtest 35/35.

---

### 0.15.2 - Direction-aware distract: press toward the wall to lure (F32)

The distract was a latent trigger: being within ~46px of any wall lit the ACT
button, and a stray tap while drifting along a wall made a noise. Now the noise
is the wall you're *facing* - you have to press toward it.

- [x] **`canDistract(px, py, dx, dy)` (update.js).** Takes the held move direction.
      A wall only counts if it's inside the existing ~46px band AND within a 30-degree
      cone of where you're pressing (`DISTRACT_FACE_COS = 0.866`, config.js). Standing
      still (0,0) can't face a wall. A 30-degree cone was the sweet spot: it rejects
      "along the wall" (a parallel face has the nearest wall tile at 45 degrees) while
      accepting head-on cardinal faces and diagonal faces into a corner (both are
      exactly 0 degrees off). 8-way input maps onto it cleanly.
- [x] **`heldMoveDir()` (update.js).** The single source for the held move direction
      (keyboard keys OR'd with the pad). `stepPlayer` (controller.js) now uses it too,
      so the movement and the distract can't drift apart.
- [x] **The lit state IS the gate (hud.js + style.css).** The ACT button's lit/dim
      classes are driven by `actionContext()`, which now includes the direction check -
      so the button only lights while you're actually pressing toward a wall. No dead
      presses: lit = it will work. Also found and fixed a real gap: the lit/dim classes
      had NO CSS (the glow styling only existed on the retired `#btn-knock`), so the
      button never visibly lit. Added `#btn-act.lit` (bright ring + glow) and
      `#btn-act.dim` (faded) - verified with screenshots: bright green glow toward the
      wall, faded gray along it.
- [x] **Copy.** Intro rule 4 and the README now say "pressed toward a wall" / "the
      noise is the wall you're facing."
- [x] **Tests.** `test-knock.js` T7-T10: facing the wall -> context is distract;
      facing along it -> not; standing still -> not; and the full input path (a real E
      press only fires the noise while pressing toward the wall). `test-action.js` now
      faces its wall spot before asserting the distract context.

Full suite green: gen 17, units 14, move, los, cone, guardai, bodies, knock 20, action 12,
intents 6, serialize 9, corner, f28, alarm 9, mobile 14/14, touch 13/13, playtest 35/35.

---

### 0.16.0 - Hold-to-search containers + theme seams (F33)

The loot used to sit on the floor, glowing - you walked over a key and it was in your
pocket. Now the keys, the file, and the upgrades live INSIDE furniture: desks, file
cabinets, copiers, the safe. You find them by holding ACT on the container while facing
it - a green ring fills as you work. The room is still the hinted objective (the briefing
names each room); the container within the room is the puzzle. This is also where the
theme layer lands: the core loop reads roles / archetypes / mech, and a `THEME` object
owns every presentation string, so a second setting is a data file, not a rewrite.

- [x] **Container archetypes (content.js).** `CONTAINER_TYPES` = { fast 1.0s, mid 2.0s,
      loud 1.5s, safe 3.0s } each with a `noise` radius. `loud` is the only noisy one - its
      open carries `SEARCH_NOISE` (2 tiles, a small fraction of the 5-tile lure) and pulls
      same-room guards over to investigate. The objective always lives in a `safe` (the
      3s tense hold); keys and upgrades in silent `fast`/`mid`; the rest are flavor notes.
- [x] **Theme layer (src/theme.js).** `THEME` = { rooms, containers {name,glyph,color},
      items, player } - the ONLY place "desk" / "office" / "East Storage" live.
      `buildBriefing()` names each colored key's room + the objective's room from it.
      Added as its own script (between content.js and state.js). The core loop, the
      generator, and the AI never read a THEME string - `tools/test-theme.js` proves it by
      swapping the whole object for a dungeon theme and re-running the loop.
- [x] **Generator (mapgen.js).** `placeRoomContainers` stamps 2-3 solid containers per
      room (3 in key/objective rooms, 2 elsewhere) off the lanes, with a floor clearance
      ring reserved so an obstacle can't wall one in (the systematic check found a seed that
      did exactly that, walled-in a filler). `assignContainerContents` puts the three keys,
      the objective, and the three mods into distinct containers in their rooms, then fills
      the rest with `NOTE_TEXTS` flavor. The solvability proof (`validateKeyChain`) now
      takes each quest item's *access tiles* (the floor tiles you can stand on to search it)
      instead of a floor position - it still proves every key is grabbable and the file +
      exit reachable, now through the containers.
- [x] **State + reset (state.js, game.js).** `state.containers` (each { arc, c, r, x, y,
      contents, opened, searchT }), `state.foundNotes`, `state.searching`. The floor-
      position fields (`keyPos` / `filePos` / `upgPos`) are gone - items have no floor
      position, only their container. The minimap room indices come from each quest item's
      container room.
- [x] **The search (update.js).** `searchTarget()` = the unopened container you're within
      `SEARCH_RANGE` (46px) AND facing (same 30-degree cone as the distract). `stepSearch`
      (called from the controller every frame) accumulates `searchT` while ACT is held;
      at the archetype's time, `openContainer` grants the contents and - for a loud one -
      fires `doSearchNoise` (room-confined, reuses the hear -> investigate pipeline).
      `actionContext()` returns 'search' so the ACT button lights when you're on a container;
      `tryAction` ignores it (search is a hold, not an edge). Floor pickups are retired.
- [x] **Rendering (render.js).** Containers draw as furniture over the wall tile - an
      archetype glyph (dial for the safe, drawer lines for cabinets, etc.), a breathing cyan
      corner tick ("this is searchable, not a wall"), a green border + progress ring while
      you search, and a dimmed lid once opened. The file / keys / upgrades floor-drawing is
      gone. The minimap marks quest items at the ROOM center (not the exact container),
      fog-gated - the room is the hint.
- [x] **HUD + intro (hud.js, index.html).** The intro gains an italic briefing line (each
      key's room + the objective's room). Rule 1 and 4 now explain holding ACT to search;
      the ACT table row reads "knockout / grab / hide / distract / search". The menu lists
      the latest note you've read.
- [x] **Tests.** `test-gen.js` rewritten for containers (quest items in their rooms, solid
      containers, the access-tile proof, searching an upgrade banks it, the density check now
      counts containers + obstacle shapes). `test-alarm.js` T3 reads the blue key's
      container room. New `tools/test-theme.js` (the theme-swap proof). `tools/_test-f33.js`
      drives a real hold-to-search through the browser input path. `playtest.js` collects the
      keys + file by searching their containers. Full suite green: 15 headless, theme 5,
      mobile 14/14, touch 13/13, playtest 35/35.

Known follow-ups (deliberate, not bugs): notes are flavor now - they become the clue
system that replaces the static briefing; weapons/gear are `role` stubs waiting on
shooting; general inventory lands with the first weapon; per-theme wall plans are deferred
(3x3 stays core).

---

### 0.17.0 - The clue notes + the knockout topple (F34)

Two refinements. First, the notes stop being flavor: they are how you learn where the
keys are. The briefing no longer names the key rooms - it anchors the contract (in the
Vault, behind the red door) and teaches the loop. Each colored key has a NOTE, dealt
one-per-room into the top row (A/B/C, shuffled per seed), and each note names its key's
room. Read one and that key's room lights up on the minimap. Second, a knocked-out
body used to render under your icon (same spot), so you couldn't tell what happened;
it now topples away from you along the hit axis.

- [x] **Clue notes (content.js, mapgen.js).** `CLUE_ROOMS` = the top row (A/B/C). The
      generator deals the three key-clues one-per-room into those rooms (shuffled per
      seed via the new `shuffle(rng, arr)`), each in a room that is NOT its key's room, so
      finding the note is a distinct step from finding the key. A clue's item is
      `{ role: 'clue', keyId }` - stable, data-driven, theme-pure (the text is generated,
      not stored).
- [x] **Theme (theme.js).** `roomName(rc,rr)` is now the single owner of room naming;
      `clueText(keyId)` builds "The BLUE key is in East Storage." from the key's room +
      the theme (so a theme swap re-skins the clues). `buildBriefing()` no longer names
      the key rooms - it names the objective room + the "search the furniture, read the
      notes" loop. `test-theme.js` now asserts the clues re-skin too.
- [x] **State + feedback (state.js, game.js, update.js, hud.js).** `state.clues` (keyId
      -> true once the note is read), `state.noteToast` (the note/clue you just read,
      decays over a few seconds). `grantItem` banks a clue and raises the toast (a
      brighter gold toast for clues, dim paper for flavor). The menu lists the clues you've
      read (the room each key is in, until you have it).
- [x] **Minimap (render.js).** A key's room dot now shows only once you've read its note
      (`state.clues[k.id]`) - the clue is the knowledge, like the exit marker - instead of
      being gated purely by fog. This is what makes the notes meaningful: before the note,
      the minimap reveals nothing about where that key is.
- [x] **The knockout topple (update.js).** `dropBody()` on knockout nudges the body away
      from the player along the player->guard axis (the direction you hit it), wall-checked
      at several distances with a sideways topple as the fallback when it was facing a
      wall. Computed once, so the body stays put (no sliding) while you walk around to
      grab it. Guards don't block the player, so the nudge is collision-safe.
- [x] **Copy + UI (index.html, style.css).** Rule 1 teaches the clue loop; the briefing
      line updates; a `#note-toast` banner floats over the play area (transient, never
      blocks the controls).
- [x] **Tests.** New `tools/test-clue.js` (12 checks, driven through the real search
      path): three clues in A/B/C, none in its key's room, searching a clue banks
      `state.clues` + raises the toast, the full chain reveals all three rooms, flavor
      notes still bank. `test-theme.js` extended for the clue re-skin. Full suite green:
      16 headless, mobile 14/14, touch 13/13, playtest 35/35.

Deliberate balance call: the clues are `fast` (1.0s) and in the top row, so the
bootstrap is quick (find a note in the first room, light the map). If it ever feels too
fast, the knobs are the clue room pool and the clue archetype.

---

### 0.17.1 - Debug: the G key banks every item (F35)

A dev shortcut for tuning and playtest setup. Press `G` to bank all three keys,
the file, and all three mods in one frame, and to learn all the clue rooms (so the
minimap lights up). It skips the COLLECTING, not the run: doors still open on
proximity and you still have to traverse to the exit - so it's a jump to the
endgame state, not a cheat code that finishes the run.

- [x] **`grantAllItems()` (update.js).** Banks `keyBag` (all three), `hasFile`,
      `upgrades` (all three), and `clues` (all three), flashes, and refreshes the HUD.
      Safe to repeat (idempotent).
- [x] **Wired through the intent path (input.js, controller.js).** `G` emits the
      plain-data `grantAll` meta intent (like R/N/T), and `processIntents` consumes it
      - so it's serializable (replay records it if you ever pressed G) and the input
      capture stays pure. Works mid-run, not during the intro.
- [x] **Copy + UI (index.html, style.css, README).** A dim italic "Debug: bank every
      item - G" row in the intro key table; the README controls list it.
- [x] **Tests.** `tools/test-debug.js` (8 checks) drives the real intent path: nothing
      banked at reset, the intent banks keys + file + mods + clues, the objective moves
      to the door/escape phase, the red door opens on proximity once the red key is
      banked (proving it skips collecting, not traversal), and it's safe to repeat.

Full suite green: 17 headless, mobile 14/14, touch 13/13, playtest 35/35.

---

### 0.17.2 - Sentries only shoot what they're looking at (F36)

The post guards (sentries) felt like they had 360-degree vision. The real cause was
not their gaze - it was their trigger. The sentry's shot fired at anything within
`SHOOT_RANGE` (60px) with line of sight, **with no facing check**. So there was a 60px
reactive kill-ring all the way around it, and since the rear-arc knockout needs you
within 26px, you were taking a faceful of lead the whole way in, even with its back to
you. Combined with its 72-deg gaze sweeping all four cardinals, it read as "it sees
me from anywhere."

- [x] **The shot now respects the gaze (ai.js).** The post guard only fires when the
      player is inside its 72-deg vision cone - the same `patrolFov` it uses to spot you.
      Inside the blind spot (behind / to the side of the cone) it neither spots nor
      shoots, so you can shadow its gaze, work into the rear arc, and land the knockout
      without getting shot. Walking into its face still gets you (it spots AND fires).
- [x] **Regression test (test-f28 T7).** Relocates a sentry to open floor, pins its
      gaze at the player vs. away, and asserts it fires when looking and stays silent in
      the blind spot. Also verified across all three seed-42 sentries (blind spot = 0
      bullets for every one).

Full suite green: 17 headless, mobile 14/14, touch 13/13, playtest 35/35.

---

### 0.17.3 - Opened keyed doors get the same frame as regular doors (F37)

A playtester noticed that a keyed door, once opened, didn't have the same line/frame as a
regular open door. The cause: `doorLintels` (the little frame drawn around every doorway)
is built **once at reset**, and only for gaps that are already open. Locked doors are solid
at reset, so they never got a lintel entry. When a keyed door opened, its map tile became a
gap, but `doorLintels` was never updated - so it rendered as a bare gap with no frame, while
an ordinary open door kept its frame.

- [x] **The frame is added at open time (update.js).** When a keyed door opens (map tile
      set to 0), its door tiles are pushed into `state.doorLintels` with the right
      orientation - `'v'` for the vertical wall lines (c 17/34), `'h'` for the horizontal
      lines (y 11/22, where all three keyed doors sit). A dedupe guard prevents double-adds.
      It's a real state change (a door that's open *is* a doorway), so it's deterministic and
      replay-serializable for free.
- [x] **Tests (tools/test-doors.js, 16 checks).** For each of the three keyed doors: no lintel
      while shut, the door opens with the key, each of its 2 tiles gets an `'h'` lintel, and the
      lintel count goes 20 -> 22 (+2). Plus an orientation sanity check (vertical line -> `'v').
- [x] **Visual (f37-doorline-zoom-42.png).** Player parked above the opened red door; the
      rectangular frame now renders, matching the regular open doors on the same line.

Full suite green: 18 headless, mobile 14/14, touch 13/13, playtest 35/35.

---

### 0.18.0 - Sleeping guards (F38): the first face of the duty cycle

The environmental-control pass starts with the shared "timing" flag. A **duty cycle** is a
unit property: awake for SLEEP_ON, asleep for SLEEP_OFF, repeating. The **sleeping guard** is
its first face (the corporate skin); a blinking laser is the same flag reskinned for an
industrial theme. It adds the timing axis the room puzzles have been missing - you can cross a
doizing guard blind, but linger too long and it wakes on you.

- [x] **A new `sleeper` unit row (unit.js).** Identical stats to a normal guard, plus
      `duty: {on, off}`. Data-driven, no bespoke path.
- [x] **The tick (ai.js `tickDuty` + state.js `dutyT`/`asleep`).** Runs **only in patrol** -
      a guard chasing you never dozes (the timer is paused out of patrol). Awake SLEEP_ON,
      asleep SLEEP_OFF, then repeat.
- [x] **Blind + stationary while down (sight.js + ai.js).** `canSee` returns false for a
      dozing guard and the patrol step returns early, so it holds in place and sees nothing.
- [x] **A valid knockout target.** It's in patrol, so the rear-arc knockout still reaches it
      (you can put a dozing guard down for good).
- [x] **The toggle (config.js `TOOLS.sleep`).** The demo is a kitchen sink (all on); turning a
      tool off is the curation step for the narrative pass. Guard index i is a sleeper when
      `i % SLEEP_STRIDE === SLEEP_OFFSET`, never a post guard.
- [x] **Visual (render.js).** A dozing guard renders as a dim body with a soft "z" and no
      facing arrow; its minimap cone is suppressed while it sleeps.
- [x] **Tests (tools/test-sleep.js, 13 checks).** Stride count + no post overlap; the cycle
      flips on schedule (4s/3s); the same player seen awake vs blind asleep; stationary across
      frames; a normal guard never dozes; a dozing guard is a knockout target; a chasing guard
      never dozes; `TOOLS.sleep` off removes the sleepers.

Full suite green: 19 headless, mobile 14/14, touch 13/13, playtest 35/35.

### 0.19.0 - Camera + switch (F39): the "operate the environment" verb

The fifth core verb. A **camera** is the first *machine*: a stationary floor sensor that
scans its cone and, on a sustained look (CAM_LOCK), trips the **alarm** - not a hit, an
escalation (the forgiving grace model). A machine can't be knocked out or lured; the only
way to stop it is its **switch**. A switch is a fixed, single-tile operator you step onto
and tap (no aiming - you just have to be on it): flip it and the target powers off for the
rest of the run (latching). The camera +
its switch live in the E hub (CAM_ROOM), the room you traverse twice - cross the room
*after* you kill the sensor, or take the alarm. This is "the room is a circuit."

- [x] **A new `camera` unit row (unit.js).** `moveSpeed 0`, `machine: true`,
      non-knockable, non-distractable. A data row, not a bespoke path.
- [x] **The switch (state.js `makeSwitch` + `state.switches`).** `target = {kind:'unit', id}`
      - machines-only (a key stays the only macro door tool). Latching: once off, stays off.
- [x] **The camera's step (ai.js).** Stationary; its lens sweeps `camBase +/- a sine arc`.
      Sustained `canSee` accumulates `seenFor`; at CAM_LOCK it calls `cameraAlarm` (alarm +
      flash, never a hit). Disabled (by the switch) it's blind + dead.
- [x] **Machines are out of play (sight.js + update.js).** `canSee`/`preSpot` return false for
      a disabled machine; `isKnockoutTarget` is false for any machine; `doDistract`/`doSearchNoise`
      skip machines (they can't be lured).
- [x] **The verb (update.js).** `switchTarget()` (in range, **no facing** - a floor plate
      you stand on / walk over, pure) feeds the one ACT button; `flipSwitch()` powers the
      target off. `actionContext`/`tryAction` gain a `'switch'` branch, ranked after
      knockout/grab.
- [x] **Placement (mapgen.js `placeCameraSwitch`).** Two free floor tiles in CAM_ROOM - camera
      left half, switch right half, both near mid-height. Non-solid, so they never block a lane.
      Deterministic per seed.
- [x] **Visual (render.js).** A camera is a small base with a red lens that tracks its facing +
      a room-clipped beam; a disabled camera is dim with no beam. A charging camera flashes a "!".
      A switch is a panel with a red lamp (armed) + cyan lever. Both sit on the minimap (a square
      for the camera, a cyan dot for the switch) in explored rooms.
- [x] **The toggle (config.js `TOOLS.camera`).** Gates the camera + its switch (the curation
      switch for the narrative pass).
- [x] **Tests (tools/test-switch.js, 17 checks).** Camera exists / is a machine / in the room /
      non-knockable; the switch targets it; flipSwitch powers it off (latching); a disabled camera
      is blind; the armed camera accumulates its fuse and trips the alarm (not a hit); a distraction
      doesn't move it; the switch context resolves in/out of range; operating it kills the camera;
      `TOOLS.camera` off removes both.

Full suite green: 20 headless, mobile 14/14, touch 13/13, playtest 35/35.

### 0.20.0 - Laser (F40): the industrial skin of the duty cycle

The duty cycle's second face. A **laser** is a stationary emitter that projects a beam
(a line-segment) across a room, blinking **live** (LASER_ON) / **dormant** (LASER_OFF) on
the same `duty` flag the sleeper uses. Cross it while it's dormant; touch the live beam
and it trips the **alarm** (an escalation, not a hit). It has **no switch**: this machine's
defense is pure timing - you can't stop it, only time it. That's the distinction from the
other two faces: the sleeper is a timing threat you can knock out, the camera is a
switch-puzzle, the laser is a timing threat you can only *time*. Placed in room D (on the
path, clear of the camera in E).

- [x] **A new `laser` unit row (unit.js).** `moveSpeed 0`, `machine: true`, no vision cone
      (`sightDist 0` - the beam is the threat), `duty: {on, off}`. A data row.
- [x] **The beam contact (ai.js `beamContact`).** Point-to-segment distance from the player's
      center to the beam; contact when within `player.r + BEAM_THICK`. Pure, reads state only.
- [x] **The step (ai.js).** Reuses `tickDuty` verbatim (`!asleep` = live). A live beam in
      contact calls `machineAlarm` (shared with the camera - the F39 rename). Machines never
      chase.
- [x] **The shared alarm (update.js).** `cameraAlarm` -> `machineAlarm`: one escalation path
      for both machines (alarm + flash, never a hit, `hits` stay 0).
- [x] **Machines out of play (sight.js + update.js).** `canSee` false for a laser (no cone);
      `isKnockoutTarget`/`doDistract`/`doSearchNoise`/`preSpot` all gate on `machine`.
- [x] **Placement (mapgen.js `placeLaser`).** One free floor tile in LASER_ROOM (left half,
      mid-height); the beam points east from it. Deterministic per seed, non-solid.
- [x] **Visual (render.js).** The emitter is a small base with a red lens; the beam is a line
      (bright red live, near-invisible dormant, brighter still on contact). A square + a short
      beam line on the minimap.
- [x] **The toggle (config.js `TOOLS.laser`).** The curation switch for the narrative pass.
- [x] **Machines don't shift the stride rule (game.js).** The camera + laser are pushed AFTER
      the post/sleeper designation, so the stride indices stay on the 16 patrol guards
      (test-sleep + test-f28 now filter `!machine`).
- [x] **Tests (tools/test-laser.js, 12 checks).** Exists / is-a-machine / in-room /
      non-knockable; the duty cycle blinks on schedule (2.5s/2.5s); the live beam trips the
      alarm (not a hit); a dormant beam is safe; off-the-segment is safe; a distraction doesn't
      move it; it has no switch; `TOOLS.laser` off removes it.

Full suite green: 21 headless, mobile 14/14, touch 13/13, playtest 35/35.

### 0.20.1 - Switch is a floor plate, not an aim (F41)

A switch should trigger by being **on / over it**, not by aiming at it. The lure-style
"push in a direction" (the 30-degree facing cone) is gone: `switchTarget()` is now purely
"within `SWITCH_RANGE` of an armed switch". Stand on the panel (or walk over it) and ACT
lights up; no direction held. `flipSwitch` is unchanged (latching). test-switch T8 now
proves it resolves with **no direction held** and while exactly on the tile.

### 0.21.0 - Robot (F42): the moving machine

The third machine, and the one that proves the unified unit model: for the first time a
`machine: true` unit **pathfinds and moves**. A **robot** is a sentry that patrols a lane
(guard movement - the same `followPath` / `roomPath` A* a guard uses) with a vision cone
(guard sight). It's a machine: non-knockable, non-distractable, and it **never chases** -
a sustained look (ROBOT_LOCK) trips the **alarm** (not a hit), like the camera. Its **switch**
stops it for the run (latching). So the robot combines the two machine defenses: *time it*
(it moves) and *stop it* (the switch). Placed in the **Vault** (the file room) - the
objective is guarded by a moving sentinel.

- [x] **A new `robot` unit row (unit.js).** Guard stats (`moveSpeed PATROL_SPEED`,
      `sightDist VISION_RANGE`, `patrolFov PATROL_FOV`), `moveType 'patrol'` (it follows an
      A* path), `machine: true`. A data row that moves.
- [x] **`makeRobot(path)` (state.js).** Reuses the guard's patrol fields (path / wp /
      pathTiles / room) + the machine flags (`robot`, `machine`, `disabled: false`,
      `seenFor: 0`). The robot is literally a guard that's a machine.
- [x] **The step (ai.js).** A machine branch (like camera / laser): if `disabled`, stop +
      go blind. Otherwise it patrols its lane (the guard's A* path-following) and accumulates
      a detection fuse on `canSee`; at ROBOT_LOCK it calls `machineAlarm` (shared with the
      camera). No `enterChase`, no shoot, no tag - a moving sentinel.
- [x] **Machines out of play (already).** `isKnockoutTarget` / `doDistract` / `doSearchNoise`
      / `preSpot` gate on `machine` (the robot is covered); `canSee` is false when `disabled`
      (its switch). No new sight / update gating needed.
- [x] **Placement (mapgen.js `placeRobot`).** A fixed PATTERNS sweep (rectFull) in
      ROBOT_ROOM + a free floor tile for the switch (right edge, mid-height). Deterministic,
      non-solid.
- [x] **Visual (render.js).** A square robotic body with a green sensor lens that tracks its
      facing + a green vision cone (the `drawCone` tint is green for a robot, vs yellow for a
      guard). Dim + no cone when disabled. A green square (armed) / gray (off) on the minimap.
- [x] **The toggle (config.js `TOOLS.robot`).** The curation switch for the narrative pass.
- [x] **Tests (tools/test-robot.js, 11 checks).** Exists / is-a-machine / in-the-Vault /
      non-knockable; it patrols (moves); it has a switch; a sustained look trips the alarm (not
      a hit); it never chases; a disabled robot is stopped + blind; a distraction doesn't move
      it; `TOOLS.robot` off removes it + its switch.
- [x] **test-switch T9** now checks the camera's switch is gone (not zero total - the robot
      has its own).

Full suite green: 22 headless, mobile 14/14, touch 13/13, playtest 35/35.

### 0.22.0 - Crate + floor-plate switch (F43): shove, park, and the grace window

A **crate** is a pushable, unbreakable, unsearchable solid tile. You shove it one square,
straight on (walk into it head-on, no new button), and it stays where you leave it. It's
solid for everything - the player's collision, the guards' A* pathing, and line of sight -
folded into the shared blocked-tests, so it blocks movement, routing, and vision for free.
Nudge-out is the push itself: a crate can always be shoved back along any clear direction, so
it can never soft-lock you. One crate per switch room (the camera room E, the robot room H),
deterministic, kept off the machine, its plate, the robot lane, and the containers.

The **switch** is now a floor plate you occupy, not a button you press. While anything is ON
it (you standing on its tile, or a crate parked on it) the machine is powered off and no
timer runs. Clear it and a **grace window** (SWITCH_GRACE) keeps the machine down, then it
re-arms; step back on to cancel the grace. A crate on a plate is the persistent version of
stepping on it: the machine stays down for as long as the crate sits there, no timer.

- [x] **The crate object (state.js `makeCrate`).** `{ c, r, x, y, homeC, homeR }` - a tile
      with a remembered home (for a future restore behavior). Unbreakable, unsearchable: no
      contents, no durability. `state.crates` array.
- [x] **Solid integration (movement / sight / path).** `crateAt(c, r)` + `tileBlocked(c, r)`
      in movement.js; `hitsWall` is crate-aware (player + guards collide), `hasLOS` is
      crate-aware (vision blocks), `roomWalkable` is crate-aware (guards route around). One
      predicate, three call sites.
- [x] **The push (movement.js `tryPushCrate`).** Straight-on, pure-axis only: head-on with the
      crate (same tile row/col, your edge at its near face), the far tile open (map + no other
      crate) -> the crate advances one tile. Runs before the player's freeMove, so the player's
      collision slides it into the vacated space (no clamping math).
- [x] **The floor-plate switch (update.js `stepSwitches`).** Occupancy + grace: occupied
      (player tile == switch tile, or a crate on it) = powered off, no timer; cleared =
      grace countdown, then re-arm; re-occupy cancels the grace. Replaces the old latching
      act-button flip (removed `switchTarget` / `flipSwitch` and the ACT-verb branch).
- [x] **The guard reaction (update.js `onCrateMoved`).** A patrolling guard in the room
      notices a crate shoved into its lane (a waypoint tile, or within 1.5 tiles): a one-time
      stall (CRATE_STALL) + a dropped path, so it re-routes around the crate (roomPath is
      crate-aware). Machines, sleepers, and anything already reacting are left alone.
- [x] **Placement (mapgen.js `placeCrate` / `crateRow`).** One crate per switch room, off the
      machine, its plate, the robot lane, and the room's containers. Gated by `TOOLS.crate`.
- [x] **Visual (render.js).** A brown X-braced crate tile; the plate lamp is red (armed) /
      cyan (down); a depleting cyan ring shows the grace window while the plate is down but
      empty. No minimap marker (it's in-room furniture; the room is already fog-gated).
- [x] **Tests (tools/test-crate.js, 18 checks).** Placement in E + H; solid (tileBlocked /
      not walkable); head-on push moves one tile; a wall stops the push (and it DID move first);
      blocks LOS (and a clear lane doesn't); a guard stalled by a shove; `TOOLS.crate` off
      removes them; not a unit, not a container.
- [x] **test-switch rewritten (14 checks).** Occupy = down (no timer); leave = grace running;
      grace expires = re-arm; re-occupy cancels grace; a crate on the plate = down with no
      timer; `TOOLS.camera` off removes the camera + its plate.

Full suite green: 23 headless, clean browser boot (no JS errors), crate + plate render verified.

### 0.23.0 - Laser nook (F44): the beam gates a key

The laser stops being a hazard you route around and becomes a **gate**: a small walled
sub-room in room D - a box missing one side (the mouth) - with the **gold key's** container
in the bowl and the laser emitter sitting on the mouth, beam pointing out. You time the
beam's off-window to slip through the mouth, search the bowl, and get out before it
re-arms. The beam covers the mouth and the approach outside it, so the only way in is
through the beam; the interior (west of the emitter) stays clear of it. The gold key was
already in D; now it's the one key that's a timing puzzle instead of a search.

- [x] **The nook geometry (content.js `NOOK`).** A room-relative box in D (4 wide x 3 tall)
      missing its right side: `mouth` (the open entrance), `bowl` (the container tile),
      `emitter` (on the mouth, beam out), `approach` (the floor tile outside the mouth).
- [x] **Carving (mapgen.js `carveNook`).** Lays the top, bottom, and left walls; the right
      side stays open, so the mouth is the single entrance. Called once per layout (main +
      fallback).
- [x] **The gold key's container is the bowl (forced).** D's random container count drops by
      one (the bowl is its third); a container is placed at the bowl and `assignContainerContents`
      gives the gold key to it (marked used, so nothing else reuses it). Deterministic.
- [x] **The laser on the mouth (`nookEmitter`).** Replaces the old free-tile `placeLaser`
      (removed). The emitter sits on the mouth tile, beam facing out (east), so the beam spans
      the only entrance. `beamContact` covers the approach; the interior is clear.
- [x] **Lane keeps clear (mapgen.js `patClearsNook`).** D's patrol patterns are filtered to
      those that pass the nook box, so a guard never patrols through the nook walls (main +
      fallback). The nook tiles are reserved from obstacles and random containers.
- [x] **Solvability holds.** The laser is non-solid, so the BFS treats the mouth as passable;
      the bowl's interior floor tile is reachable, so the gold key stays in the key chain.
- [x] **Tests (tools/test-nook.js, 13 checks).** Walls carved + mouth open; the gold key is the
      bowl; the emitter is on the mouth facing out; the interior is reachable; the live beam
      covers the approach (and the interior is clear); all three keys + file + exit stay in the
      chain. `test-gen` cap for D raised by the nook's 9 wall tiles.

Full suite green: 24 headless, nook + beam render verified (live + dormant).

---

### 0.25.0 - The laser nook is a directional setpiece (F44)

The nook + laser are **one setpiece of various sizes and directions**, not a fixed
right-facing box. `NOOK` is now parameterized by the box's top-left (`ox, oy`), its size
(`w, h`), and the mouth side (`'left' | 'right' | 'top' | 'bottom'`). Everything else - the
mouth tile, the emitter (on the mouth), the bowl (on the far side), the approach (outside
the mouth), and the beam direction - **derives** from those. The beam always spans the nook
(mouth -> bowl) and is just long enough to cover the box (`nookBeamLen`), so the hit-test
matches the visible beam at any size/orientation. The current demo keeps the right-facing
4x3 nook (identical derived values), so nothing about the shipped level changes - this is
the generalization that lets a future authored level put a nook anywhere, any size, any way.

- [x] **`NOOK` parameterized (content.js).** `ox, oy, w, h, mouthSide` + a derive step that
      computes `mouth`, `emitter`, `bowl`, `approach`, `beamDir`, and the box bounds
      (`c0, c1, r0, r1`). Centering uses `Math.floor` so the mouth always lands on an
      integer tile for any box size.
- [x] **`carveNook` lays all four walls, then opens the derived mouth** (was: three walls,
      right open). `nookEmitter` / `nookTiles` / `patClearsNook` read the derived bounds.
- [x] **`nookBeamLen` (mapgen.js).** `(w-1)` tiles for a left/right mouth, `(h-1)` for a
      top/bottom mouth - just long enough to span the box. `makeLaser` takes a `beamLen`
      (defaults to `LASER_RANGE`); the game wires the nook's derived dir + len.
- [x] **Verified directional.** A `bottom` mouth re-derives to a north beam, opens the
      bottom tile, drops the gold key in the bowl on the beam, and keeps it in the key chain.

Full suite green: 28 headless.

---

### 0.26.0 - The "you are here" room label (F48)

The room names (the West Office, the Mailroom, Records, the Archives, East
Storage, the Loading Dock, the Vault, the Basement) lived in `THEME.rooms` and
fed the clue notes and the briefing, but they were never shown in the world -
ghosts in the clue language, absent in the rooms. F48 makes them land: a quiet
word in the top-left of the play area names the room you're standing in.

- The label reads `roomName(roomAt(playerTile))`, so a theme swap re-skins it for
  free. It's held while you're in a doorway (threshold tile, `roomAt` null) so it
  never flickers blank.
- DOM: a hidden `<span id="room-name">` (the HUD spans are a data source; render
  mirrors them). `drawRoomName()` draws it at the top-left of the play window at
  low opacity (0.5), small (12px) - an anchor, not a banner.
- The minimap stays dots-only (the clue's key dot is the map's room pointer; the
  name belongs in the HUD). The player triangulates: dot on the map + name from
  the note + the HUD confirming it when they step in.

Tests: `tools/test-roomname.js` (spawn label, follows the player into rooms, holds
in a doorway). Full suite green: 29 headless.

---

### 0.25.1 - The beam gates the entrance, not the nook's length (F44)

The 0.25.0 setpiece had a 1-tile mouth in the middle of the open side and the beam
running down the nook's long axis (mouth -> bowl). That read as a laser shooting *down*
the room. Now the **mouth is the full open side** and the **beam runs across it** -
perpendicular to the approach, with the emitter at a corner of that side and the beam
spanning the whole side. The gate is at the entrance; the bowl (inside, on the far side)
is clear of it. `carveNook` opens the whole mouth side; `nookBeamLen` spans that side
(vertically for left/right mouths, horizontally for top/bottom). All four directions
verified: the beam always crosses its open side, the bowl always stays in the box.

Full suite green: 28 headless.

---

### 0.24.0 - Alarm converge + reinforcements (F45), the hit pool (F46), the pull (F47)

Three systems that make the alarm and the player's body feel real.

**F45 - the alarm now means something.** An alarm is no longer just a global speed bump; it
is a location. `tripAlarm` records the trigger tile (`state.alarmPos`) and **converges**
every awake, in-room guard onto that tile (they investigate the source), then a **reinforcement**
queues: one temporary guard spawns at the far side of the room, path-finds in, and joins the
search. It despawns when the alarm clears or its timer runs out. The converge skips machines
(you can't rouse a robot), down/dazed/hidden guards, chasing guards (already on you), and
asleep guards (only the duty cycle wakes those). The reinforcement spawns at the top of
`update()` (never mid-guard-loop) so the `state.guards` array is never mutated while it's
being iterated.

- [x] **`tripAlarm(x, y, by)`** - sets the alarm timer, records `state.alarmPos` (the trigger
      tile), converges the room's awake guards, and queues one reinforcement.
- [x] **`convergeGuards()`** - room-confined; each eligible guard gets the trigger tile as its
      investigate target (A* path). Machines, down/hidden/dazed, asleep, chasing, and out-of-room
      guards are skipped.
- [x] **`spawnReinforcements()` / `stepReinforcements()` / `reinforceEntryTile()` / `roomDoorways()`**
      - the temp guard materializes at the room's **doorway** (the just-inside tile nearest the
      trigger), converges on the alarm tile, and when the alarm clears (or its timer runs) it
      **walks back out that same door** and despawns on arrival. `REINFORCE_MAX = 1`,
      `REINFORCE_TIME = 16s`. A `leave` state in the guard AI handles the walk-back.
- [x] **Tests (tools/test-converge.js, 6; tools/test-reinforce.js, 7).** Converge targets the
      trigger tile, skips machines/asleep/chasing, is room-confined; the reinforcement spawns in
      the alarm room, is temporary, and despawns on alarm-clear.

**F46 - the hit pool (health).** A hit is no longer instant death. You start at **2 hp**
(max 3); a hit costs 1, trips the alarm, and **staggers** you (no movement for 0.6s, hands
still work). At 0 you're caught. **Health items** (1-2 per run, in the usual containers) restore
1 (capped at 3). The HUD shows your hp as hearts next to the inventory. Two hits is the new
permadeath - a health item is the reason a second run isn't a coin flip.

- [x] **`PLAYER_HP_START = 2`, `PLAYER_HP_MAX = 3`, `HIT_STAGGER = 0.6`.** The player gains
      `hp` and `stagger`.
- [x] **`hitPlayer(g)`** - `-1 hp`; at 0 you're caught, otherwise you stagger (and the alarm
      trips, via `tripAlarm`).
- [x] **`stepPlayer` stagger gate** - no movement while staggered, but actions/search still work.
- [x] **The `health` item role** - 1-2 per run, placed after the quest/clue items; `grantItem`
      and `grantAllItems` top up `hp` (capped).
- [x] **HUD hearts** (`renderInventoryRow`) - one heart per max-hp slot, filled for current hp.
- [x] **Tests (tools/test-health.js, 7).** Start at 2, a hit drops to 1 + staggers, a second
      hit catches you, a health item restores (capped at 3), the alarm trips on a non-lethal hit.

**F47 - the pull.** The push was automatic (walk into a crate); the pull is the deliberate
**swap**: face a crate and press ACT, and the crate comes to your tile while you take its old
one. It's a discrete action (no free-move), makes a quiet room-confined noise (quieter than a
shove), and is what lets you drag a crate **onto** a switch plate (stand on it, pull the crate
in) or **off** one (the crate's on it, you take it). The ACT context is mutually exclusive with
the others (a crate in front = pull; a bin in front = search). The push's head-on EPS widened to
3px so it triggers at the collision stop (the player stops ~2.5px short of a crate's face).

- [x] **`tryPullCrate` (movement.js)** - the one-tile swap (crate -> your tile, you -> crate's
      tile). Your tile is always the clear destination, so a pull never soft-locks.
- [x] **`pullReady` (update.js)** - a crate in the held cardinal direction lights the ACT as
      `pull` (shared by the button and the action so they can't drift).
- [x] **`stepPlayer` pull branch** - the pull beats the automatic push and does not free-move
      (the swap is the move); `doSearchNoise` at `PULL_NOISE` (48px, room-confined).
- [x] **Tests (tools/test-pull.js, 6).** The ACT lights as pull; the swap moves both; a nearby
      guard hears it; it drags a crate onto a plate; without ACT the crate is pushed (not pulled).

Full suite green: 28 headless, 13 touch, 14 mobile.

### 0.27.0 - Bitmap tiles from the Minifantasy derelict sheet (F49)

The flat `fillRect` tiles are gone. The facility now renders from a real pixel-art sheet - the
**Minifantasy Sci-Fi Space Derelict** tileset (16x16 native), cropped to a 64x64 atlas that maps
1:1 onto our 32px world tile at a clean 2x. Nearest-neighbor (`imageSmoothingEnabled = false`) so
the pixels stay hard-edged at any `SCALE`. The vector fills stay as the no-asset fallback, so
`file://` without the image and the headless stub render exactly as before.

- [x] **`assets/tiles.png`** - the cropped atlas: floor (a clean, uniform checkered tile, tinted a
      soft rust at draw time to tie it to the walls), wall (a solid rust tile with a top bevel and
      bottom edge - generated from the sheet's palette because the sheet's walls are detailed
      segments that don't tile seamlessly), locked door (a 32x32 hatch-door panel), and an open-door
      cell (floor + lintel + jambs, kept for future use; opened doors draw floor + the existing
      lintel today).
- [x] **`TILE_ATLAS` loader (render.js)** - loads the atlas async; on `onload` flips `loaded`. A
      `try/catch` around `new Image()` means the headless stub (no DOM) and a missing file both fall
      back to the vector fills with no error.
- [x] **Bitmap tile blit** - the floor/wall/door `fillRect` block becomes an atlas `drawImage` when
      `TILE_ATLAS.loaded`, with the original fills as the `else` branch. A 12% rust cast is laid over
      the neutral tileset floor.
- [x] **Key-color door coding preserved (F29)** - the locked-door loop now paints the key color as a
      50% alpha tint over the hatch door (solid when on the vector fallback), so blue/gold/red doors
      still read by color while the art shows through. The dark keyhole slot is unchanged.
- [x] **`.gitignore`** - the 3MB source pack (`Minifantasy_Scifi_SpaceDerelict_Assets/`) stays local
      for re-cropping; only the 640-byte `assets/tiles.png` ships.
- [x] **Verified in-browser** (debug Chrome over `http://`, seed 42): floor/wall/door render, the
      blue hatch door carries its color cast, no tiling artifacts. The `file://` canvas is tainted by
      the cross-origin image (expected; blocks `toDataURL` only, not display), so live captures are
      taken over a same-origin `http://` server.

Full suite green: 29 headless.

**0.27.1 - the floor, made seamless.** The first atlas cropped a tileset floor tile that was
half-transparent down the middle, so it tiled into a "brick" pattern with black gaps. Two fixes:
the blit now **snaps to the device-pixel grid** and sizes each tile to the exact gap to the next
(so fractional `SCALE` can't leave a 1px seam), and the floor is now a **generated seamless 2x2
checker** in the sheet's gray palette (no baked border, no transparency) with a soft rust cast on
top. The wall (generated rust) and the hatch door (cropped from the sheet) are unchanged.

Full suite green: 29 headless.

### 0.28.0 - Walls that read as walls: the 4-bit autotile (F50)

The flat rust wall tile was the last thing in the facility that didn't look built. A wall is not a
flat square - it has a top you can see and a face that falls away toward the room, and a corner
turns. F50 draws walls with the classic **4-bit autotile / terrain-mask** scheme (the same one
Godot's TileMap terrain mode runs on): each wall tile computes a mask from its four neighbors -
which of N/E/S/W are also walls - and blits the matching piece from a 16-slot atlas. The pieces
are generated "raised tiles": a cap (the top face) as the base, with a darker face band on every
edge that faces floor. Because the cap is a uniform base and each face band sits exactly on the
floor-facing edge, straight runs, corners, T-junctions and isolated pillars all abut with no seam
and no hand-placed variant - the geometry does the work.

- [x] **`assets/walls.png`** - a 64x64 atlas of 16 raised-tile pieces (4x4 grid, 16px each),
      generated from the derelict cap/face palette (cap `[123,96,77]`, face `[104,69,59]`, crease
      `[74,43,43]`). Slot `i` is mask `i`: bits N=1 E=2 S=4 W=8, a bit set means that neighbor is
      a wall. Slot 0 (all floor around) is a pillar with face bands on all four edges; slot 15 (all
      walls) is pure cap. Ships at ~1KB; the source pack stays gitignored.
- [x] **`WALL_ATLAS` loader (render.js)** - async `new Image()`, `onload` flips `loaded`, a
      `try/catch` keeps the headless stub and a missing file on the vector wall fill. `tile(mask)`
      maps a mask to its atlas cell.
- [x] **Mask in the tile loop** - the `v === 1` branch now builds the 4-bit mask from
      `state.map` neighbors (out-of-bounds counts as floor) and blits the autotile piece when
      `WALL_ATLAS.loaded`; the flat fill is the `else`. Floor and doors keep using the main atlas.
      The minimap stays flat (a small overview doesn't need the relief).
- [x] **Verified in-browser** (debug Chrome over `http://`, seed 42): walls render with the cap on
      the outer edge and the face falling toward each room; corners wrap the outer angle; runs are
      seamless. Vector fallback unchanged for `file://` / headless.

Full suite green: 29 headless.

---

## Carryovers (open from before)

- [x] **C1. Dead root `game.js`** (25KB monolith, unused since the refactor): archived to `.ill13/game.js` in the F7 pass. Root is clean.
- [x] **C2. sim-play bot** - rebuilt for the 3x3 with predictive crossing: A* with cone hard-avoid + lane soft-penalty, analytic patrol prediction (speed + 0.7s waypoint pauses + facing), crossing windows (transit strip checked at visit time +/- 0.25s, wait spot must stay clean until commit), committed-route locking, unseen-void retreat, dead-window nudge. Winnability proven: seed 42 full chain (key + door + file + exit); 1/10 seeds with this fixed policy - the difficulty is crossing timing, which is the game.
- [x] **C3. Cone clipping sharpness** - retired: F5 removed cones from the main view (minimap uses unclipped wedges on purpose).
- [ ] **C4. Hi-DPI cap** - canvas backed at min(dpr, 2). Revisit if phones still look soft.
- [x] **C5. `T` (type seed) on touch** - closed: T stays desktop-only; the touch cluster is now one ACT button (0.12.2).

---

## Test suite (must stay green after every feature)

All green as of the F1-F5 build:

All green after the F6 3x3 rebuild:

```
node tools/test-gen.js          # 17 layout / quest / alarm / knockout / density checks
node tools/test-cone.js         # visibility polygon checks
node tools/test-guardai.js      # F19/F21/F22: room-confined AI, doorway sight, no-freeze return
node tools/test-bodies.js       # F23: grab / carry / hide / drop / room-bound / occupied bin
node tools/test-knock.js        # F25: knock-knock wall lure, cooldown, investigate, no-freeze return
node tools/test-move.js         # F26: unified movement - wall slide, corner radius, no tunnel, unit-aware
node tools/test-corner.js       # F26: corner escape - hold an axis into a corner rolls around; no false roll on a wall
node tools/test-los.js          # 0.12.1: knockout mid-animation + no sight through kitty-cornered blocks
node tools/test-action.js       # 0.12.2: the contextual ACT button (knockout/grab/hide/distract/drop precedence)
node tools/test-f28.js          # 0.13.0: longer KO, bodies wake on discovery, fixed sentries (post guards)
node tools/test-alarm.js        # 0.15.1: global alarm - chase x1.35, persistent search, x1.75 search time
node tools/test-theme.js        # 0.16.0: theme-swap proof - core reads roles/archetypes, not strings
node tools/test-clue.js         # 0.17.0: the clue notes - A/B/C placement, bank on search, full chain
node tools/test-debug.js        # 0.17.1: the G key banks every item (intent path)
node tools/test-doors.js        # 0.17.3: opened keyed doors get the same lintel frame
node tools/test-sleep.js        # 0.18.0: the sleeping guard (duty cycle) - schedule, blind, KO target, toggle
node tools/test-switch.js       # 0.22.0: the floor-plate switch - occupancy + grace window (crate on plate, re-arm, cancel)
node tools/test-crate.js        # 0.22.0: the pushable crate - solid, push, wall-stop, LOS block, guard stall, toggle
node tools/test-nook.js         # 0.23.0: the laser nook - box geometry, gold key in bowl, beam gate, solvability
node tools/test-converge.js     # 0.24.0: F45 alarm converge - targets the trigger tile, skips machines/asleep/chasing, room-confined
node tools/test-reinforce.js    # 0.24.0: F45 MGS reinforcements - temp guard spawns in the alarm room, despawns on alarm-clear
node tools/test-health.js       # 0.24.0: F46 the hit pool - 2hp start, stagger, health items (capped), alarm on a hit
node tools/test-pull.js         # 0.24.0: F47 the pull - ACT swap, quiet noise, crate onto a plate, push-vs-pull
node tools/sim-play.js          # headless winnability (stale bot; not a tuning signal)
NODE_PATH=<your-playwright-install> node tools/check-touch.js  # 13 touch checks (4-way pad + Enter restart)
NODE_PATH=<your-playwright-install> node tools/check-mobile.js # 14 mobile layout checks
```

`tools/shots.js` (needs CDP on 9222) refreshes the review screenshots, including the
new 3x3 door-discovery and vault-approach shots.
