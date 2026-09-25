# Minimap / radar research - what stealth games actually do

Why: LO asked (a) cones should only show for the room the player is in, (b) the
whole-map minimap might be too much, (c) base it on MGS and the genre, AAA + indie.

## Findings by game

### Metal Gear Solid 1 (1998, AAA) - the reference
Source: official Konami manual (MGS1 Special Masters Collection, "Interpreting the
Radar" + "Enemy Alert Levels" pages) and the Metal Gear Wiki "Soliton Radar" entry.

- The Soliton Radar is a **local-area radar**, not a map of the whole base:
  "detects ... the immediate area, including the positions of enemies" (MGS wiki).
- Player dot in the center; **enemy dots (red)**; **enemy vision cones**:
  blue = normal FOV, red = investigating a noise, yellow = camera FOV;
  green cone = the player's own view.
- **Alert mode: "the radar will shift to alert mode and go offline."**
  Evasion mode: radar stays offline until the countdown ends.
- The Soliton Radar (MGS1) is explicitly the one that shows enemy facing/FOV;
  the MGS2 "Reactive Radar" dropped the facing and kept dots + a sneaking
  proximity indicator.
- Radar can be jammed (degraded) by the environment.

### Hitman: World of Assassination (AAA)
Source: Hitman Wiki, "Maps" (fandom, fetched 2025).

- Two-tier design: a big **planning map** (levels, objectives, exit points,
  dropped disguises - static, planning info) plus a small always-on **minimap**
  (lower-left, same as Absolution) that "shows the obstacles and NPCs".
- Minimap NPC marks are dots; **threat state changes the dot**: "when someone
  can see through Agent 47's disguise or is lured, his/her mark on the minimap
  will turn white from black point."
- No vision cones on any Hitman map. The series evolved: Codename 47 showed only
  47's position; Silent Assassin added all NPC dots (orange enemy, blue guard,
  white VIP, red target).

### Resident Evil 4 / RE2 Remake / Village (AAA)
Widely documented: the minimap shows layout + player + **enemy red dots** +
objective markers. No cones. Dots are the enemy channel.

### Deus Ex (2000) / Deus Ex: Mankind Divided (AAA)
The map is a layout/objective tool (door states, exits, marked points). No live
enemy dots, no cones. Stealth awareness is in-world (ears, shadows, eyes).

### Dishonored / Dishonored 2 (AAA)
Map toggle shows layout + player + objectives. No enemy positions, no cones.

### Mark of the Ninja (2013, indie, Klei)
Off-action map (Tab) shows the level schematic, guard dots, and **patrol routes
as lines** - a planning tool, not a live threat display. No cones.

### Shadow Tactics: Blades of the Shogun (AA, 2016)
Toggle-able tactical map with operative/enemy dots for team positioning.
No live cones on the always-on view (the game has no always-on minimap at all -
it's a deliberate awareness choice).

### Stalker (2020, indie, Stomplord)
Could not verify online this pass (wikis behind Cloudflare during the research
session). Not included in the design decision.

## The genre rules (synthesis)

1. **The always-on minimap is small and local or dot-based.** Live enemy detail
   (cones, facing) on an always-on map is rare; the one famous example - MGS1 -
   scopes it to the immediate area and goes offline on alert.
2. **Dots are the standard enemy channel** (MGS, RE, Hitman, Watch Dogs).
   Threat state is encoded in dot/radar color, not in map furniture.
3. **Vision cones, when they exist on a live view, are local and color-coded by
   guard state** (MGS1: blue patrol / red investigating / yellow camera).
4. **Whole-facility layout is the job of an on-demand planning map** (Hitman's
   big map, MOTN's Tab map, MGS map screen), not the always-on radar.
5. **Fog / locality is standard for the persistent view**: MGS radar is physical
   locality, RE shows the current area, unexplored = unknown.
6. **Alarm = radar degradation or loss** (MGS1 alert-offline, jamming).
   Keeping the minimap fully informative during the loudest moment in the game
   has no precedent in the games checked.

## What this means for SNEAK RUN

Implemented in `src/render.js` (`drawMinimap`):

- **Cones + guard dots only for the player's current room** (LO's explicit ask,
  MGS1 locality). Cones are clipped to the room rectangle so they never bleed
  through walls into the next room.
- **Fog of war**: unexplored room interiors are black. Explored rooms show the
  dim layout (known facility skeleton, Hitman-style) with no live guard data.
  The current room gets a bright floor + thin frame.
- **Alarm: radar goes offline** - the map dims, live data is replaced by red
  static + "SIGNAL LOST" (MGS1 alert-mode behavior). Objective markers and the
  player dot stay.
- Kept from v1: K/F/E objective icons (once their room is explored) and the red
  locked-door marker - these are the "objective markers" channel every game above
  keeps on the persistent view.

Not implemented (available as follow-ups if LO wants them):
- Circular radar clip instead of the rectangular compound view (closer to the
  MGS1 HUD shape; current design keeps the compound silhouette as context).
- A full on-demand planning map (pause + big map with patrol routes, MOTN/Hitman
  style) - the biggest genre-authentic feature left on the table.
- Guard dot color change on suspicion (we have no suspicion state - spotted or
  not, the alarm does that job).
