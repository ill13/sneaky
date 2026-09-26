// ============================================================
//  SNEAK RUN - tuning config
//  Every knob in one place. Pure constants, no logic.
//  Classic script: loads first, all names shared globally.
// ============================================================
const VERSION = '0.28.2';   // increment on any shipped change; shown next to the title
// 0.26.0: F48 - the "you are here" room label: the HUD names the room you're
//          standing in (a quiet word, top-left of the play area), so the clue
//          notes' room names land in the world instead of staying ghosts
// 0.25.2: F45 - the room pulls in its temp guard REINFORCE_DELAY (4s) after the
//          alarm trips, not on the next frame - a beat to react before it's on you
// 0.25.1: F44 - the nook's mouth is the FULL open side and the beam runs ACROSS it
//          (perpendicular to the approach, emitter at a corner) - a gate at the
//          entrance, not a line down the nook's length
// 0.25.0: F44 - the laser nook is now a DIRECTIONAL setpiece: box size + mouth side
//          are params, and the mouth/emitter/bowl/approach/beam all derive. The beam
//          always spans the nook (mouth -> bowl) and is just long enough to cover it.
// 0.24.3: F44 - the laser beam points IN (west, across the nook) so it spans the
//          entrance and gates the bowl, not out into the room along the approach
// 0.24.2: F45 - the reinforcement materializes at the room's doorway and walks back
//          out that same door when the alarm clears (not a far-corner spawn / instant vanish)

const TILE = 32;
// 3 x 3 grid of rooms: 3*16 + 2 inner walls + 2 outer = 52 cols,
// 3*10 + 2 inner walls + 2 outer = 34 rows.
const COLS = 52;
const ROWS = 34;

// The visible game area is a camera window that follows the player. Two windows:
//   VIEW_PORTRAIT (tw:th = 18:16) - the PRIMARY experience (portrait is the
//   default; the short-form world is portrait-first). Portrait phones are tall,
//   so this is a tighter, taller window: the room you're in fills the width
//   (16 tiles) and you see its four doorways plus a sliver of the rooms beyond,
//   to plan the crossing. The dark letterbox around it reads as "the rest of the
//   base is unknown." ~1 room at a time is the stealth tension (MGS on the MSX).
//   VIEW_43 (tw:th = 20:15 = 4:3) - the classic CRT / MSX monitor frame, used on
//   landscape and desktop where the screen is wide.
const VIEW_PORTRAIT = { tw: 18, th: 16 };   // portrait: the room is the hero
const VIEW_43 = { tw: 20, th: 15 };         // landscape / desktop: 4:3 CRT frame
// movement
const PLAYER_SPEED = 150;     // px/sec
const PATROL_SPEED = 55;
const CHASE_SPEED = 95;

// sight
const VISION_RANGE = 6 * TILE;
const PATROL_FOV = 72 * Math.PI / 180;
const CHASE_FOV = 92 * Math.PI / 180;    // clear side/rear blind spots so LOS can be broken
const LOSE_SIGHT_TIME = 3.0;  // sec a chaser searches before giving up (no alarm)
// Room-confined AI (F19): when a guard's A* path reaches the last-seen tile and it
// can't see you (or you're across the door it can't cross), it holds here - sweeping
// its gaze - then returns to patrol. This is the "search" beat that makes a room
// feel like its own puzzle instead of a whole-facility manhunt.
const SEARCH_TIME = 2.0;      // sec a guard holds and looks around before resuming patrol
// Pre-spot cue: a patrol guard whose facing drifts within this arc of you (and
// you're in its sight range with clear LOS) gets a dim "?" - the real-world read
// that it's turning your way, without ever showing the exact cone. A beat to move.
const PRESPOT_ARC = 70 * Math.PI / 180;

// alarm (a decaying timer, not a permanent flag): one slip is a crisis,
// not a death sentence. Stay hidden ALARM_DURATION seconds without being
// seen and the compound calms back to normal patrol.
const ALARM_SPEED_MULT = 1.35;
const ALARM_RANGE_MULT = 1.4;
const ALARM_PATROL_SPEED_MULT = 1.15;   // while hot: patrol/investigate movement (chase is still faster)
const ALARM_SEARCH_MULT = 1.75;         // while hot: search time ("they stop giving up")
const ALARM_DURATION = 10;    // seconds of unbroken hiding to clear it
const CONVERGE_TIME = 3.0;    // F45: sec a guard sweeps AT the alarm tile after converging on it
const REINFORCE_MAX = 1;      // F45: extra (temporary) guards the room pulls in on an alarm
const REINFORCE_TIME = 16;    // F45: sec a reinforcement stays before it peels off (or it leaves the moment the alarm clears)
const REINFORCE_DELAY = 4;    // F45: sec after the alarm trips before the room pulls in a guard (a beat to react)

// guards shoot while chasing, close range, with line of sight
const SHOOT_RANGE = 60;       // px - guards must be close, so a side-step breaks the shot
const SHOOT_CD = 0.9;         // sec between shots per guard
const BULLET_SPEED = 320;     // px/sec
const BULLET_LIFE = 1.4;      // sec
const PLAYER_INVULN = 1.2;    // sec of i-frames after a hit
// F46: the hit pool. A hit costs 1 + raises the alarm + staggers you; at 0 you're
// caught. Health items (new container item) top you back up 1, capped at MAX.
const PLAYER_HP_START = 2;
const PLAYER_HP_MAX = 3;
const HIT_STAGGER = 0.6;      // sec you're flinched (can't move) after a non-lethal hit

// dead-end upgrades (one per dead-end room; seed shuffles type <-> room)
const UPG_STIM_MULT = 1.15;   // STIM: player speed x1.15
const UPG_HUSH_TIME = 5;      // HUSH: +5s alarm hide window
const UPG_HEAVY_TIME = 4;     // HEAVY: +4s knockout duration

// knockout (knock a guard out from behind: E / gamepad X / the ACT button)
const KO_TIME = 10;           // sec a knocked-out guard stays down (was 6; raised 2/3)
const DAZE_TIME = 1.5;        // sec of dazed wobble before patrol resumes
const KO_DIST = 26;         // px from the guard, in its rear arc
const KO_REAR = 1.9;        // rad (~109 deg) off its facing = "behind"
const WAKE_SPOT_DIST = 40;    // px: still this close when a guard wakes = instant spot
// F28: an awake guard that stumbles this close to a downed one (with line of
// sight) shakes it awake - a body left in the open gets found by a patrol.
const WAKE_DISCOVER_DIST = 2.5 * TILE;
// Body dragging (F23): grab a downed guard, carry it (slowed), tuck it in a bin.
// The body is room-bound - carry it around its room and hide it, or drop it (it
// wakes on its own timer). A hidden body stays down forever.
const CARRY_SPEED_MULT = 0.55;  // player speed while dragging a body
const GRAB_DIST = 28;           // px from a downed guard to pick it up
const HIDE_DIST = 36;           // px from a hide spot to deposit a body
// Distract (F25): make a noise at the wall next to you. Guards in the room within
// hearing break off and investigate the noise (room-confined, no global alarm).
const DISTRACT_HEARING = 5 * TILE;  // px the noise carries (guards this close hear it)
const DISTRACT_WALL_DIST = 30;      // px: how close to a solid tile you must be to distract
const DISTRACT_FACE_COS = 0.866;    // the wall must be within 30deg of where you're pressing (head-on, not along it)
const DISTRACT_COOLDOWN = 2.0;      // sec between distractions (a deliberate tap, not a mash)
const DISTRACT_INVESTIGATE = 2.2;   // sec a guard sweeps at the noise before resuming
const HEAR_PAUSE = 0.55;         // F25: the freeze-and-turn a guard does the instant it hears
// F33: hold-to-search containers - the noise a LOUD container carries is a small
// fraction of the lure (DISTRACT_HEARING = 160px): "almost too loud", not "you rang the bell".
const SEARCH_NOISE = 2 * TILE;   // px radius (64px) a noisy container's open carries, room-confined
const SEARCH_RANGE = 46;         // px: how close to a container you must be (and be facing it) to search
// F28: post guards - fixed sentries stuck at their post. Only their head swings,
// in 90-degree steps, cycling the four cardinal directions to monitor the room
// (a door, an object). They see you (alarm) and can tag you if close, but they
// never leave their post. Guard index i is a post guard when i % POST_STRIDE
// === POST_OFFSET (3 of the 16).
const POST_STRIDE = 5;
const POST_OFFSET = 2;
const POST_SCAN_HOLD = 1.6;   // sec a post guard holds each cardinal direction
const POST_SWING = 14;        // rad/sec - how fast its head whips to the next 90 deg
// F38: the duty cycle - the shared "timing" unit flag. A unit with a duty is awake
// for SLEEP_ON sec, asleep for SLEEP_OFF sec, repeating. The sleeping guard is its
// first face (the corporate skin); a blinking laser is the same flag reskinned for
// an industrial theme. Sleep only applies in patrol (a guard chasing you stays
// alert). Guard index i is a sleeper when i % SLEEP_STRIDE === SLEEP_OFFSET.
const SLEEP_ON = 4.0;         // sec a sleeping guard stays awake
const SLEEP_OFF = 3.0;        // sec it dozes
const SLEEP_STRIDE = 4;
const SLEEP_OFFSET = 1;
// F39: the camera (the first machine) + its switch. A camera is a stationary
// floor sensor: it can't be knocked out or lured, it scans its cone, and a
// sustained look (CAM_LOCK) trips the alarm. The switch is the ONLY way to stop
// it - flip the panel and it powers off for the rest of the run (latching).
// The camera lives in CAM_ROOM with its switch, placed on two free tiles.
const CAM_FOV = 1.5;         // rad - the camera's scan cone (~86 deg, a bit wider than a guard)
const CAM_LOCK = 1.2;        // sec of sustained line-of-sight before the camera trips the alarm
const CAM_PAN_SPEED = 0.6;   // rad/sec - how fast its lens sweeps across its arc
const CAM_PAN_RANGE = 0.9;   // rad - half the sweep, so it scans a ~100-degree arc
const CAM_ROOM = [1, 1];     // the E hub - the environmental-control showcase room
// F43: the switch is a FLOOR PLATE you occupy, not a button you press. While
// anything (you, or a crate) is ON it the machine stays powered off; the moment
// it clears, a grace window (SWITCH_GRACE) keeps it down, then it re-arms. A crate
// parked on it is the persistent version of stepping on it (no timer while it's there).
const SWITCH_GRACE = 6;      // sec - how long the machine stays down after the plate clears
const CRATE_STALL = 0.9;     // sec - a patrolling guard's one-time stall when a crate moves into its lane
const PULL_NOISE = 1.5 * TILE;   // F47: px radius (48px) a crate PULL carries - quieter than a shove, room-confined
// F40: the laser (the industrial skin of the duty cycle). A fixed emitter projects a
// beam (a line-segment) that blinks on/off (LASER_ON / LASER_OFF). Cross it while it's
// dormant; touch it while it's live and it trips the ALARM (an escalation, not a hit).
// No switch: this machine's defense is pure timing - you can't stop it, only time it.
const LASER_ROOM = [0, 1];   // the D room - on the path, clear of the camera in E
const LASER_ON = 2.5;        // sec the beam is live (the duty cycle's on phase)
const LASER_OFF = 2.5;       // sec the beam is dormant (the duty cycle's off phase)
const LASER_RANGE = 200;     // px - how far the beam reaches from the emitter
const BEAM_THICK = 2;        // px - half the beam's width for the contact test
// F42: the robot (the moving machine). A sentry that patrols a lane (guard
// movement) with a vision cone (guard sight) - but it's a machine: non-knockable,
// non-distractable, and it never chases. A sustained look (ROBOT_LOCK) trips the
// ALARM (not a hit), like the camera. Its switch stops it for the run.
const ROBOT_ROOM = [1, 2];   // the H Vault - the file room; the objective guarded
const ROBOT_LOCK = 1.0;      // sec of sustained line-of-sight before it trips the alarm
const ROBOT_PATTERN = 3;     // PATTERNS index (rectFull) - a near-perimeter sweep
// F38: the tool toggles. The demo is a kitchen sink (all on); turning a tool off
// is the curation step for the narrative pass. The generator honors these, so a
// tool is added/removed without touching the rules.
const TOOLS = {
  sleep: true,     // F38: sleeping guards (the duty-cycle timing axis)
  camera: true,    // F39: the camera + its switch (the environmental-control verb)
  laser: true,     // F40: the laser (the duty cycle's industrial skin)
  robot: true,     // F42: the robot (the moving machine + its switch)
  crate: true,     // F43: the pushable crate (one per switch room) + occupancy/grace switch
};
