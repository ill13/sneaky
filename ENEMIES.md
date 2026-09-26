# The enemies (what they are, what they do)

## The architecture

No per-enemy code path. Every enemy is a data row in `UNIT_TYPES` (`unit.js`). All the
units - the player included - live in one `state.units` array and run through the same
four primitives: `tryMove` (radius-aware collision), `canSee` (vision), `hasLOS` (line of
sight), and `roomPath` (A* in `path.js`, the only pathfinder in the codebase).

Identity and stats come off the table row. Behavior is one state machine (`stepGuard` in
`ai.js`) that branches on type and flags. A new enemy - a meaner guard, a VIP - is a row
plus a spawn.

Six rows: `player`, `guard`, `sleeper`, `camera`, `laser`, `robot`.

## The roster

| Enemy | Type | Moves? | What it does | Killed by |
|---|---|---|---|---|
| **Guard** | `guard` | patrol lane, A* | The full pursuit machine: patrols, sees you, **chases**, **shoots** (close, w/ LOS), loses you, **searches**, returns to patrol. Touch is a hit. | Knockout (rear arc) |
| **Post guard** | `guard` + `post` flag | **no** (stuck) | Only its head swings, 90-deg steps through the four cardinals (1.6s hold each). Sees, **shoots**, **tags** you, never leaves its post. F36: it only fires on what's in its 72-deg gaze, so the rear knockout is reachable. | Knockout (rear arc) |
| **Sleeper** | `sleeper` | patrol lane | A guard with the **duty cycle**: awake 4s, dozes 3s. While down it's **blind + stationary**. Wakes and hunts like a normal guard. Never a post. | Knockout (rear arc, even asleep) |
| **Camera** | `machine` | **no** (fixed) | Scans a ~100-deg arc (86-deg cone, panning). A sustained look (1.2s) trips the **alarm**, not a hit. | Its **switch** (latching, one-way off) |
| **Laser** | `machine` | **no** (fixed) | Projects a beam (200px) that blinks live/dormant (2.5s / 2.5s) on the duty cycle. Touch the **live** beam, **alarm**. No switch - pure timing. | You can't (only time it) |
| **Robot** | `machine` | **yes** (patrol lane, A*) | The moving sentry: patrols a lane with a 72-deg cone. A sustained look (1.0s) trips the **alarm**, **never chases/shoots/tags**. | Its **switch** (latching) |

**Placement** (`game.js` `reset`): 16 guards come off the layout's patrol paths. By
stride rule, indices 2/7/12 are **post guards** and 1/5/9/13 are **sleepers** (posts take
priority, so no overlap) - 9 plain guards left. The machines get pushed *after* (ids
100/101/102) so they never shift the stride indices: **camera** in the E hub `[1,1]` plus
its switch, **laser** in D `[0,1]` (no switch), **robot** in the Vault H `[1,2]` plus its
switch. These are all gated by `TOOLS` (`sleep` / `camera` / `laser` / `robot`, all on).

## The shared systems

- **Vision (`canSee`)**: same room + within range + within the cone + clear line of
  sight. Range is 6 tiles (192px); the cone is 72 deg on patrol, 92 deg while chasing
  (that wider chase cone is what lets you break LOS by side-stepping). Sight is
  **room-confined** (`guardSharesRoom`) - a guard can't be activated by a glimpse through
  a doorway. LOS is a DDA ray march that blocks grid-corner threading, so you can't camp
  in a kitty-cornered seam.
- **States**: `patrol` to `chase` to `search` (then `resumePatrol`), plus
  `hear` / `investigate` (the distraction lure), `dazed` (the wake wobble), `down`
  (knocked out), and `hidden` (in a bin - inert, forever).
- **Two escalation paths (the forgiving grace model)**:
  - **A hit** (`hitPlayer`, only from a *human* guard's touch): `-1 hp` (you start at 2, max
    3), 1.2s of i-frames, and a 0.6s **stagger** (no movement, hands still work). **0 hp =
    CAUGHT** (game over). Every hit sets the alarm. **Health items** (1-2 per run) restore 1,
    capped at 3 - so two hits is the floor, not a coin flip.
  - **A machine alarm** (`machineAlarm`, camera lock / laser contact): sets the alarm and
    a flash, but **never increments your hit count**. An escalation, not a death - now
    you deal with the hot guards.
- **Alarm heat**: while `alarmTime > 0`, *every* patrol guard gets multipliers - range
  x1.4, chase speed x1.35, patrol speed x1.15, and search time x1.75 ("they stop giving
  up"). It decays after 10s of unbroken hiding (the HUSH upgrade adds +5s).
- **The alarm has a location (F45)**: `tripAlarm` records the trigger tile and **converges**
  every awake, in-room guard onto it (they investigate the source), then a temporary
  **reinforcement** spawns at the far side of the room and joins the search - it despawns
  when the alarm clears. The converge skips machines (you can't rouse a robot) and asleep
  guards (only the duty cycle wakes those). An alarm is a place and a growing room, not just
  a global speed bump.
- **The duty cycle (`tickDuty`)**: one shared timing flag driving both the sleeper
  (corporate skin) and the laser (industrial skin). Ticked **only in patrol**, so a guard
  chasing you never dozes mid-pursuit.
- **The `machine` flag**: non-knockable, non-distractable, no preSpot "?" cue. One switch
  that keeps the camera / laser / robot out of all the body and distract logic.

## What you can do to them

- **Knockout**: rear arc (~109 deg off its facing), within 26px. Guards only - machines
  are immune. Down for 10s (HEAVY adds +4). It topples *away* from you on the hit.
- **Grab / carry / hide / drop** a downed body (room-bound; a hidden body stays down
  forever; a body left in the open gets shaken awake by a patrolling guard within 80px +
  LOS).
- **Distract**: press toward the wall you're flush against (30-deg face gate), 2s
  cooldown. Same-room guards within 5 tiles hear it, freeze-turn, then investigate.
  Machines ignore it.
- **Switch**: stand on the panel, tap ACT - disables that machine for the whole run
  (latching).

## The design logic

- **Room is a puzzle.** Every guard is room-confined, so a chase never becomes a
  whole-facility manhunt: you lose it in *this* room and it gives up.
- **Forgiving grace.** One machine lock is a crisis, not a death; only repeated *human*
  contact kills you.
- **Machines = the fifth verb.** "Operate the environment." The camera and robot are
  stoppable (the switch); the laser is timed, none can be knocked out - that's why we use
  the switch!
