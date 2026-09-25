// ============================================================
//  SNEAK RUN - tuning config
//  Every knob in one place. Pure constants, no logic.
//  Classic script: loads first, all names shared globally.
// ============================================================
const VERSION = '0.18.0';   // increment on any shipped change; shown next to the title

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

// guards shoot while chasing, close range, with line of sight
const SHOOT_RANGE = 60;       // px - guards must be close, so a side-step breaks the shot
const SHOOT_CD = 0.9;         // sec between shots per guard
const BULLET_SPEED = 320;     // px/sec
const BULLET_LIFE = 1.4;      // sec
const PLAYER_INVULN = 1.2;    // sec of i-frames after a hit

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
// F38: the tool toggles. The demo is a kitchen sink (all on); turning a tool off
// is the curation step for the narrative pass. The generator honors these, so a
// tool is added/removed without touching the rules.
const TOOLS = {
  sleep: true,   // F38: sleeping guards (the duty-cycle timing axis)
};
