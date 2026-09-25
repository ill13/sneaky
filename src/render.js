// ============================================================
//  SNEAK RUN - render: a limited camera window that follows the player
//  You see a portion of the facility (VIEW_TW x VIEW_TH tiles, ~1.5 rooms), NOT
//  the whole base - the unknown corners are the stealth tension (MGS on the MSX,
//  Covert Action, the NES Zelda dungeons). The main view stays clean (guard dots
//  + the "!" cue, no wedges); the tactical layer is a fog-of-war minimap in the
//  top-right that lights up rooms as you explore them. Objectives stay hidden
//  until their room is explored. Hi-dpi phones get a dpr buffer (cap 2).
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const WORLD_W = COLS * TILE, WORLD_H = ROWS * TILE;
let cssW = 640, cssH = 480, SCALE = 1, OXX = 0, OYY = 0, camX = 0, camY = 0, DPR = 1;
let VIEW_WW = 30 * TILE, VIEW_WH = 20 * TILE;  // camera window (world px), set in fitCanvas
let WW = 0, WH = 0;                            // on-screen window rect (CSS px) - the 4:3 "screen"
let STRIP_H = 0;                               // top strip height (minimap lives here, above the play area)
const MINI = 2.0;   // minimap px/tile (defined up top: fitCanvas needs it for the strip height)
const MINI_PAD = 8; // minimap padding inside the strip
const MW = COLS * MINI, MH = ROWS * MINI;   // minimap native size (CSS px)
const COL_W = 190;  // landscape info column width (minimap + header)
const INFO = { x: 0, y: 0, w: 0, h: 0, miniY: MINI_PAD, mode: 'top' };  // info block rect, set by fitCanvas
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'; // system UI stack, matches the CSS
function fitCanvas() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cssW = canvas.clientWidth || 640;
  cssH = canvas.clientHeight || 480;
  canvas.width = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); // draw in CSS px
  // The play area sits dead center; the info (header + minimap) is glued to it, not
  // parked in the corner. Portrait: a strip directly ABOVE the room, whole block
  // centered. Landscape/desktop: an info column on the RIGHT of the room.
  const view = cssH >= cssW ? VIEW_PORTRAIT : VIEW_43;
  VIEW_WW = view.tw * TILE;
  VIEW_WH = view.th * TILE;
  if (cssH >= cssW) {
    // Portrait: width-limited room, a strip directly above it, block centered.
    STRIP_H = ROWS * MINI + MINI_PAD * 2;
    const availH = Math.max(1, cssH - STRIP_H);
    SCALE = Math.min(cssW / VIEW_WW, availH / VIEW_WH);
    WW = VIEW_WW * SCALE;
    WH = VIEW_WH * SCALE;
    OXX = (cssW - WW) / 2;
    const topY = (cssH - (STRIP_H + WH)) / 2;
    OYY = topY + STRIP_H;                       // window directly below the strip
    INFO.mode = 'top'; INFO.x = OXX; INFO.y = topY; INFO.w = WW; INFO.h = STRIP_H;
    INFO.miniY = topY + MINI_PAD;
  } else {
    // Landscape/desktop: room fills the left, info column on the right.
    const availW = Math.max(1, cssW - COL_W);
    const availH = Math.max(1, cssH - 20);
    SCALE = Math.min(availW / VIEW_WW, availH / VIEW_WH);
    WW = VIEW_WW * SCALE;
    WH = VIEW_WH * SCALE;
    OXX = (availW - WW) / 2;
    OYY = (cssH - WH) / 2;
    INFO.mode = 'right'; INFO.x = cssW - COL_W; INFO.y = 0; INFO.w = COL_W; INFO.h = cssH;
    INFO.miniY = Math.max(MINI_PAD, (cssH - (MH + 44)) / 2);   // minimap + header block centered
  }
}
// Size the canvas to the real window. Do it now AND on the next settled frame:
// at script-eval time the flex column's height isn't resolved yet (clientWidth/
// Height can read 0 -> the 640x480 fallback), so the immediate call alone can
// mis-size the first paint. The rAF re-fit runs before the first frame; resize
// and load catch orientation changes and any late layout settle.
fitCanvas();
if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fitCanvas);
if (typeof window.addEventListener === 'function') {
  window.addEventListener('resize', fitCanvas);
  window.addEventListener('load', fitCanvas);
}

// camera: window centered on the player, clamped to the facility bounds
function camera() {
  camX = Math.max(0, Math.min(state.player.x - VIEW_WW / 2, WORLD_W - VIEW_WW));
  camY = Math.max(0, Math.min(state.player.y - VIEW_WH / 2, WORLD_H - VIEW_WH));
}
// world px -> screen (CSS) px, relative to the camera
const fx = (wx) => OXX + (wx - camX) * SCALE;
const fy = (wy) => OYY + (wy - camY) * SCALE;
// Fog model lives in sight.js (isRevealed / roomRemembered own the room ->
// explored-index mapping); render.js draws the fog, it does not derive it.

// one guard's sight wedge, clipped to its room (open interiors make the room
// clip match the true visible wedge)
function drawCone(g, range) {
  const gx = fx(g.x), gy = fy(g.y);
  const st = statsFor(g.type);
  const fov = g.state === 'chase' ? st.chaseFov : st.patrolFov;
  ctx.save();
  const rm = roomAt(Math.floor(g.x / TILE), Math.floor(g.y / TILE));
  if (rm) {
    const [ox, oy] = roomOrigin(rm[0], rm[1]);
    ctx.beginPath();
    ctx.rect(fx(ox * TILE), fy(oy * TILE), 16 * TILE * SCALE, 10 * TILE * SCALE);
    ctx.clip();
  }
  ctx.fillStyle = g.state === 'chase' ? 'rgba(255,82,82,0.30)' : 'rgba(255,214,90,0.16)';
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.arc(gx, gy, range * SCALE, g.facing - fov / 2, g.facing + fov / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// F30: the inventory row - one icon per picked-up thing. Keys are colored
// chips with a keyhole; the file is a little lined document; banked upgrades
// are colored chips carrying their glyph (V / H / W). Each icon is 10x10 on a
// 13px pitch, so the row stays a single tidy line under the objective text.
// A little key: a round bow with a hole, a shaft, and two teeth - pointing
// right, ~12px wide on the row's 13px pitch, centered on y.
function drawKeyIcon(x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x + 3, y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0e1116';
  ctx.beginPath(); ctx.arc(x + 3, y, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(x + 5, y - 1, 7, 2);      // shaft
  ctx.fillRect(x + 9, y + 1, 1.5, 3);     // teeth
  ctx.fillRect(x + 11.5, y + 1, 1.5, 3);
}

function drawInventory(x, y) {
  let x2 = x;
  const hadKeys = KEYS.some((k) => state.keyBag[k.id]);
  for (const k of KEYS) if (state.keyBag[k.id]) {
    drawKeyIcon(x2, y, k.color);
    x2 += 13;
  }
  if (hadKeys) x2 += 4;
  if (state.hasFile) {
    ctx.fillStyle = '#e8f2ff'; ctx.fillRect(x2, y - 6, 10, 12);
    ctx.fillStyle = '#35506e';
    for (let i = 0; i < 3; i++) ctx.fillRect(x2 + 2, y - 3 + i * 3, 6, 1);
    x2 += 13;
  }
  const hadUpg = UPG_TYPES.some((u) => state.upgrades[u]);
  for (const u of UPG_TYPES) if (state.upgrades[u]) {
    ctx.fillStyle = UPGRADES[u].color; ctx.fillRect(x2, y - 5, 10, 10);
    ctx.fillStyle = '#0d0f14'; ctx.font = 'bold 8px ' + FONT; ctx.textAlign = 'center';
    ctx.fillText(UPGRADES[u].glyph, x2 + 5, y + 1);
    x2 += 13;
  }
  if (hadUpg) x2 += 4;
  ctx.font = '11px ' + FONT; ctx.textAlign = 'left';
  return x2;
}

// ---- header: the arcade top strip (info on the left) ----
// updateHUD() keeps the hidden DOM spans current every frame (it runs inside
// update(), before render()); here we just mirror that text into the canvas so
// the header and the minimap share one strip. Long objectives auto-shrink so
// they never collide with the map on the right. (null-safe: the headless
// stub's getElementById returns nothing for these, so every field falls back to ''.)
function drawHeader() {
  const g = (id) => document.getElementById(id);
  const objEl = g('objective'), statEl = g('status'), timerEl = g('timer'), seedEl = g('seed');
  const obj = objEl ? objEl.textContent : '';
  const stat = statEl ? statEl.textContent : '';
  const statColor = (statEl && statEl.style && statEl.style.color) ? statEl.style.color : '';
  const timer = timerEl ? timerEl.textContent : '';
  const seed = seedEl ? seedEl.textContent : '';
  if (!obj && !stat && !timer) return;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const gap = 14;
  if (INFO.mode === 'top') {
    // left of the strip, stopping before the minimap on the right
    const x0 = 44;
    const maxRight = INFO.x + INFO.w - (MW + MINI_PAD * 2 + 12);
    const yTop = INFO.y + MINI_PAD + 18, yBot = INFO.y + MINI_PAD + 44;
    let px = 13;
    const fitW = (p) => { ctx.font = 'bold ' + p + 'px ' + FONT; return ctx.measureText(obj).width + gap + ctx.measureText(stat).width; };
    while (px > 8 && fitW(px) > (maxRight - x0)) px--;
    ctx.font = 'bold ' + px + 'px ' + FONT;
    const objW = ctx.measureText(obj).width;
    ctx.fillStyle = '#8fd3ff'; ctx.fillText(obj, x0, yTop);
    ctx.fillStyle = statColor || '#8a9b8e'; ctx.fillText(stat, x0 + objW + gap, yTop);
    ctx.font = '11px ' + FONT;
    let x2 = drawInventory(x0, yBot);
    // banked upgrades are now shown as icon chips (drawInventory); the word label is retired
    ctx.fillStyle = '#6f7688'; ctx.fillText(timer, x2, yBot); x2 += ctx.measureText(timer).width + 10;
    ctx.fillStyle = '#57d98a'; ctx.fillText(seed, x2, yBot);
  } else {
    // right column: stacked below the centered minimap, auto-fit to the column
    const x0 = INFO.x + 10;
    const maxW = INFO.w - 20;
    let y = INFO.miniY + MH + 6 + 12;
    let px = 13;
    const fitW = (p) => { ctx.font = 'bold ' + p + 'px ' + FONT; return ctx.measureText(obj).width + gap + ctx.measureText(stat).width; };
    while (px > 9 && fitW(px) > maxW) px--;
    ctx.font = 'bold ' + px + 'px ' + FONT;
    const objW = ctx.measureText(obj).width;
    ctx.fillStyle = '#8fd3ff'; ctx.fillText(obj, x0, y);
    ctx.fillStyle = statColor || '#8a9b8e'; ctx.fillText(stat, x0 + objW + gap, y);
    ctx.font = '11px ' + FONT;
    y += px + 8;
    let x2 = drawInventory(x0, y);
    ctx.fillStyle = '#6f7688'; ctx.fillText(timer, x2, y); x2 += ctx.measureText(timer).width + 10;
    ctx.fillStyle = '#57d98a'; ctx.fillText(seed, x2, y);
  }
}

// ---- minimap: the whole facility with fog-of-war occlusion ----
// The tactical layer. Explored rooms light up; unexplored rooms stay dark, and
// you can't see guards or objectives in a room you haven't walked. Each guard's
// cone is clipped to its room so sight never leaks through a wall on the map.
// The static layer (walls + floor + vault + fog) is pre-rendered to an offscreen
// canvas and repainted only when the explored set changes, so the per-frame cost
// is one blit + the moving guards/objectives, not ~1768 tile fills.
let miniStatic = null, miniSig = -1;
function miniExploredSig() {
  let s = 0;
  for (let i = 0; i < 9; i++) if (state.explored[i]) s |= (1 << i);
  return s;
}
function paintMiniStatic() {
  if (!miniStatic) {
    miniStatic = document.createElement('canvas');
    miniStatic.width = MW;
    miniStatic.height = MH;
  }
  const mc = miniStatic.getContext('2d');
  mc.setTransform(1, 0, 0, 1, 0, 0);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = state.map[r][c];
      const rm = roomAt(c, r);
      const seen = rm ? state.explored[rm[0] * 3 + rm[1]] : false;
      if (v === 1) mc.fillStyle = '#232a38';
      else if (v === 2) mc.fillStyle = seen ? '#c0392b' : '#4a1d1a';
      else mc.fillStyle = seen ? '#1c2333' : '#0c0e13';
      mc.fillRect(c * MINI, r * MINI, MINI + 0.5, MINI + 0.5);
    }
  }
  miniSig = miniExploredSig();
}
function drawMinimap(t, range) {
  // 'top': right end of the strip above the room; 'right': centered in the side column.
  const MX = (INFO.mode === 'top') ? (INFO.x + INFO.w - MW - MINI_PAD) : (INFO.x + (INFO.w - MW) / 2);
  const MY = INFO.miniY;
  if (miniSig !== miniExploredSig()) paintMiniStatic();   // repaint only when fog changes
  ctx.fillStyle = 'rgba(8, 10, 15, 0.85)';
  ctx.fillRect(MX - 3, MY - 3, MW + 6, MH + 6);
  ctx.strokeStyle = '#2c3444';
  ctx.lineWidth = 1;
  ctx.strokeRect(MX - 3, MY - 3, MW + 6, MH + 6);
  ctx.drawImage(miniStatic, MX, MY);   // blit the cached facility layer (walls/floor/fog)
  // dynamic layer: guard dots + cones (cones come online once an upgrade is banked),
  // objectives, and you. Fog-gated: nothing shows in a room you haven't walked.
  const hasUpg = state.upgrades.stim || state.upgrades.hush || state.upgrades.heavy;
  for (const g of state.guards) {
    if (g.state === 'down' || g.state === 'dazed' || g.state === 'hidden') continue;
    const rm = roomAt(Math.floor(g.x / TILE), Math.floor(g.y / TILE));
    if (!rm || !roomRemembered(rm[0], rm[1])) continue;
    const gx = MX + (g.x / TILE) * MINI, gy = MY + (g.y / TILE) * MINI;
    const chasing = g.state === 'chase' || g.state === 'search' || g.state === 'hear';
    if (hasUpg) {
      const fov = chasing ? statsFor(g.type).chaseFov : statsFor(g.type).patrolFov;
      const [ox, oy] = roomOrigin(rm[0], rm[1]);
      ctx.save();
      ctx.beginPath();
      ctx.rect(MX + ox * MINI, MY + oy * MINI, 16 * MINI, 10 * MINI);
      ctx.clip();
      ctx.fillStyle = chasing ? 'rgba(255, 82, 82, 0.55)' : 'rgba(255, 214, 90, 0.35)';
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.arc(gx, gy, (range / TILE) * MINI, g.facing - fov / 2, g.facing + fov / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = chasing ? '#ff5252' : '#c0392b';
    ctx.beginPath(); ctx.arc(gx, gy, 2, 0, Math.PI * 2); ctx.fill();
  }
  const dot = (wx, wy, color, rad) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(MX + (wx / TILE) * MINI, MY + (wy / TILE) * MINI, rad, 0, Math.PI * 2); ctx.fill();
  };
  // F33: quest items live in containers - the minimap marks the ROOM (its
  // center), not the exact container. The room is the hinted objective.
  const roomCenter = (rc, rr) => [(9 + rc * 17) * TILE, (6 + rr * 11) * TILE];
  for (const k of KEYS) {
    if (state.keyBag[k.id]) continue;
    if (!state.clues[k.id]) continue;   // F34: a key's room lights up only once you've read the note that names it
    const idx = state.keyRoomIdx[k.id], rc = Math.floor(idx / 3), rr = idx % 3;
    const [cx, cy] = roomCenter(rc, rr); dot(cx, cy, k.color, 2.4);
  }
  if (!state.hasFile) {
    const idx = state.fileRoomIdx, rc = Math.floor(idx / 3), rr = idx % 3;
    if (roomRemembered(rc, rr)) { const [cx, cy] = roomCenter(rc, rr); dot(cx, cy, '#8fd3ff', 2.4); }
  }
  dot(state.exitPos.x, state.exitPos.y, '#57d98a', 2.4);
  dot(state.player.x, state.player.y, '#ffffff', 2.8);
  const prm = roomAt(Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE));
  if (prm) {
    const [ox, oy] = roomOrigin(prm[0], prm[1]);
    ctx.strokeStyle = 'rgba(143, 211, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(MX + ox * MINI + 0.5, MY + oy * MINI + 0.5, 16 * MINI - 1, 10 * MINI - 1);
  }
  // hide spots (F23): a faint bin marker in each explored room
  for (const s of state.hideSpots) {
    const rm = roomAt(s.c, s.r);
    if (!rm || !roomRemembered(rm[0], rm[1])) continue;
    ctx.fillStyle = s.occupied ? 'rgba(120, 140, 170, 0.55)' : 'rgba(143, 211, 255, 0.5)';
    ctx.fillRect(MX + s.c * MINI - 1, MY + s.r * MINI - 1, 2.5, 2.5);
  }
}

function render() {
  if (!state.map) return;
  // clear to the page background (the dark void around the room window). Without
  // this the semi-transparent sight cones re-composite onto themselves every frame
  // and saturate to solid color. fillRect (not clearRect) so the headless stub is happy.
  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, cssW, cssH);
  camera();
  const t = performance.now() / 1000;
  const alarmOn = state.alarmTime > 0;
  const range = alarmOn ? statsFor('guard').sightDist * ALARM_RANGE_MULT : statsFor('guard').sightDist;
  const S = TILE * SCALE;

  // clip the world to the 4:3 window so objectives/guards never bleed into the
  // letterbox - a CRT screen has hard edges. (save/rect/clip are no-ops in the
  // headless stub, so this is free under sim-play.)
  ctx.save();
  ctx.beginPath();
  ctx.rect(OXX, OYY, WW, WH);
  ctx.clip();

  // ---- floor + walls (cull to the visible window + 1 tile margin) ----
  const c0 = Math.max(0, Math.floor(camX / TILE) - 1);
  const c1 = Math.min(COLS - 1, Math.ceil((camX + VIEW_WW) / TILE) + 1);
  const r0 = Math.max(0, Math.floor(camY / TILE) - 1);
  const r1 = Math.min(ROWS - 1, Math.ceil((camY + VIEW_WH) / TILE) + 1);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const x = fx(c * TILE), y = fy(r * TILE), v = state.map[r][c];
      if (v === 1) {
        ctx.fillStyle = '#3d4454';
        ctx.fillRect(x, y, S, S);
        ctx.fillStyle = '#2c313d';
        ctx.fillRect(x, y, S, Math.max(1, 3 * SCALE));
      } else if (v === 2) {
        ctx.fillStyle = '#8a2f26';
        ctx.fillRect(x, y, S, S);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x + 3 * SCALE, y + 3 * SCALE, S - 6 * SCALE, S - 6 * SCALE);
        ctx.fillStyle = '#ffd65a';
        ctx.fillRect(x + S / 2 - 2 * SCALE, y + S / 2 - 2 * SCALE, 4 * SCALE, 8 * SCALE);
      } else {
        ctx.fillStyle = (c + r) % 2 === 0 ? '#1c1f27' : '#191c23';
        ctx.fillRect(x, y, S, S);
      }
    }
  }

  // ---- search containers (F33): solid furniture you search by holding ACT ----
  for (const ct of state.containers) {
    const x = fx(ct.c * TILE), y = fy(ct.r * TILE);
    const th = THEME.containers[ct.arc] || {};
    const isSearching = state.searching === ct;
    ctx.fillStyle = ct.opened ? 'rgba(20,24,32,0.85)' : (th.color || '#5a6478');
    ctx.fillRect(x + 2 * SCALE, y + 2 * SCALE, S - 4 * SCALE, S - 4 * SCALE);
    ctx.strokeStyle = isSearching ? '#57d98a' : (ct.opened ? '#39414f' : '#20242e');
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2 * SCALE, y + 2 * SCALE, S - 4 * SCALE, S - 4 * SCALE);
    const cx = x + S / 2, cy = y + S / 2;
    ctx.fillStyle = ct.opened ? '#4a5262' : '#d8dee9';
    ctx.strokeStyle = ct.opened ? '#4a5262' : '#d8dee9';
    if (ct.arc === 'safe') {
      ctx.lineWidth = 1.5 * SCALE;
      ctx.beginPath(); ctx.arc(cx, cy, 5 * SCALE, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 4 * SCALE, cy - 3 * SCALE); ctx.stroke();
    } else if (ct.arc === 'cabinet') {
      ctx.fillRect(cx - 6 * SCALE, cy - 5 * SCALE, 12 * SCALE, 3 * SCALE);
      ctx.fillRect(cx - 6 * SCALE, cy + 1 * SCALE, 12 * SCALE, 3 * SCALE);
    } else if (ct.arc === 'copier') {
      ctx.fillRect(cx - 6 * SCALE, cy - 3 * SCALE, 12 * SCALE, 2 * SCALE);
      ctx.fillRect(cx - 4 * SCALE, cy + 2 * SCALE, 8 * SCALE, 3 * SCALE);
    } else {   // desk (fast)
      ctx.fillRect(cx - 6 * SCALE, cy - 2 * SCALE, 12 * SCALE, 4 * SCALE);
    }
    // a breathing cyan corner tick: "this is searchable furniture, not a wall"
    if (!ct.opened) {
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(t * 2.2));
      ctx.fillStyle = 'rgba(143, 211, 255, ' + (0.35 + 0.5 * pulse) + ')';
      ctx.beginPath();
      ctx.moveTo(x + 3 * SCALE, y + 3 * SCALE);
      ctx.lineTo(x + 3 * SCALE, y + 9 * SCALE);
      ctx.lineTo(x + 9 * SCALE, y + 3 * SCALE);
      ctx.closePath();
      ctx.fill();
    }
    // search progress ring (F33): fills as you hold ACT on the container
    if (isSearching && ct.searchT > 0) {
      const frac = Math.min(1, ct.searchT / CONTAINER_TYPES[ct.arc].searchTime);
      ctx.strokeStyle = '#57d98a';
      ctx.lineWidth = 2.5 * SCALE;
      ctx.beginPath();
      ctx.arc(cx, cy, S / 2 - 1 * SCALE, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
  }

  // ---- door lintels (frames around every opening) ----
  ctx.fillStyle = '#5a6478';
  for (const [c, r, o] of state.doorLintels) {
    const x = fx(c * TILE), y = fy(r * TILE);
    if (o === 'h') {
      ctx.fillRect(x, y - 2, S, 2);
      ctx.fillRect(x, y + S, S, 2);
    } else {
      ctx.fillRect(x - 2, y, 2, S);
      ctx.fillRect(x + S, y, 2, S);
    }
  }

  // ---- locked doors (colored by their key; gone once opened) ----
  for (const k of KEYS) {
    if (state.doorsOpen[k.id]) continue;
    for (const [c, r] of state.doorTiles[k.id]) {
      const x = fx(c * TILE), y = fy(r * TILE);
      ctx.fillStyle = k.color;
      ctx.fillRect(x + 1, y + 1, S - 2, S - 2);
      ctx.fillStyle = '#0e1116';
      ctx.fillRect(x + S / 2 - 3 * SCALE, y + S / 2 - 4 * SCALE, 6 * SCALE, 8 * SCALE);   // keyhole slot
    }
  }

  // ---- start door (cosmetic entry marker, top-left of the spawn room) ----
  {
    const x = fx(START_DOOR.c * TILE), y = fy(START_DOOR.r * TILE);
    const w = START_DOOR.w * S, h = S;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    ctx.fillStyle = '#0e1116';
    ctx.fillRect(x, y, w, h);                              // recessed door body in the wall
    ctx.fillStyle = 'rgba(255, 214, 90, ' + (0.10 + 0.10 * pulse) + ')';
    ctx.fillRect(x, y + S, w, S);                          // soft glow just inside the room
    ctx.strokeStyle = '#5a6478';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = '#ffd65a';                            // down chevron = entry into the room
    ctx.lineWidth = 2 * SCALE;
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 7 * SCALE, y + h / 2 - 5 * SCALE);
    ctx.lineTo(x + w / 2, y + h / 2 + 5 * SCALE);
    ctx.lineTo(x + w / 2 + 7 * SCALE, y + h / 2 - 5 * SCALE);
    ctx.stroke();
  }

  // ---- exit pad ----
  {
    const x = fx(state.exitPos.x), y = fy(state.exitPos.y);
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.fillStyle = 'rgba(87, 217, 138, ' + (0.12 + 0.1 * pulse) + ')';
    ctx.fillRect(x - S, y - S, S * 2, S * 2);
    ctx.fillStyle = '#20402c';
    ctx.fillRect(x - 14 * SCALE, y - 14 * SCALE, 28 * SCALE, 28 * SCALE);
    ctx.strokeStyle = '#57d98a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 14 * SCALE, y - 14 * SCALE, 28 * SCALE, 28 * SCALE);
    ctx.fillStyle = '#57d98a';
    ctx.font = 'bold 9px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', x, y + 3);
  }

  // F33: the file / keys / upgrades no longer sit on the floor - they live
  // INSIDE the search containers above, and are found by holding ACT on them.

  // ---- hide spots (bins/closets, F23): tuck a carried body in to hide it ----
  for (const s of state.hideSpots) {
    const x = fx(s.x), y = fy(s.y);
    ctx.fillStyle = '#12151c';
    ctx.fillRect(x - 13 * SCALE, y - 13 * SCALE, 26 * SCALE, 26 * SCALE);
    ctx.strokeStyle = s.occupied ? '#5a6478' : '#3d4a5f';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 13 * SCALE, y - 13 * SCALE, 26 * SCALE, 26 * SCALE);
    if (s.occupied) {
      ctx.fillStyle = '#2a3140';   // closed lid over the hidden body
      ctx.fillRect(x - 10 * SCALE, y - 10 * SCALE, 20 * SCALE, 20 * SCALE);
      ctx.fillStyle = '#5a6478';
      ctx.fillRect(x - 4 * SCALE, y, 8 * SCALE, 2 * SCALE);   // lid handle
    } else {
      ctx.fillStyle = 'rgba(143, 211, 255, ' + (0.22 + 0.14 * Math.sin(t * 2)) + ')';
      ctx.beginPath();
      ctx.moveTo(x - 6 * SCALE, y - 4 * SCALE);
      ctx.lineTo(x, y + 5 * SCALE);
      ctx.lineTo(x + 6 * SCALE, y - 4 * SCALE);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ---- guards (body + facing wedge + X-eyes) ----
  for (const g of state.guards) {
    if (g.state === 'hidden') continue;   // in a bin (F23): drawn as the bin, not a guard
    const down = g.state === 'down';
    const wob = g.state === 'dazed' ? Math.sin(t * 20) * 2 : 0;
    const carried = state.carrying === g;   // dragged behind you (F23)
    const gx = fx(g.x + wob), gy = fy(g.y + (carried ? 13 : 0));
    const rr = g.r * SCALE;
    if (g.post && !down) {
      // a fixed sentry (F28): a small pedestal marks the post it's stuck to - its
      // head still swings, so the facing arrow on top rotates over the base
      ctx.fillStyle = '#4b5470';
      const bs = rr + 3 * SCALE;
      ctx.fillRect(gx - bs, gy - bs, bs * 2, bs * 2);
    }
    ctx.fillStyle = down ? '#39415a'
      : g.state === 'chase' ? (state.alarmTime > 0 ? '#ff7828' : '#ff5252')
      : g.state === 'search' ? '#e0913a'
      : g.state === 'hear' ? '#d9862f'
      : '#8f3b3b';
    ctx.beginPath(); ctx.arc(gx, gy, rr, 0, Math.PI * 2); ctx.fill();
    if (down) {
      ctx.strokeStyle = '#aab4cc';
      ctx.lineWidth = Math.max(1, 2 * SCALE);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(gx + s * 5 * SCALE - 3 * SCALE, gy - 3 * SCALE);
        ctx.lineTo(gx + s * 5 * SCALE + 3 * SCALE, gy + 3 * SCALE);
        ctx.moveTo(gx + s * 5 * SCALE + 3 * SCALE, gy - 3 * SCALE);
        ctx.lineTo(gx + s * 5 * SCALE - 3 * SCALE, gy + 3 * SCALE);
        ctx.stroke();
      }
    } else {
      // facing arrow: bigger + clearer so the guard's gaze reads at phone scale
      // (the readable-clue that stands in for the retired in-room cone)
      ctx.fillStyle = state.alarmTime > 0 ? '#ffb35a' : '#ffd65a';
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(g.facing);
      ctx.beginPath();
      ctx.moveTo(15 * SCALE, 0);
      ctx.lineTo(4 * SCALE, -6 * SCALE);
      ctx.lineTo(4 * SCALE, 6 * SCALE);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ---- "!" markers: red = seeing you, amber = just heard the noise, yellow = searching ----
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px ' + FONT;
  for (const g of state.guards) {
    if (g.state !== 'chase' && g.state !== 'search' && g.state !== 'hear') continue;
    const seeing = canSee(g, statsFor(g.type).chaseFov, range);
    ctx.fillStyle = seeing ? '#ff5252' : (g.state === 'hear' ? '#ffc46b' : '#ffd65a');
    ctx.fillText('!', fx(g.x), fy(g.y) - g.r * SCALE - 7);
  }
  // ---- pre-spot "?": a patrol guard turning your way (in range, LOS) - a beat ----
  // The real-world read without the cone: preSpot() (sight.js) is true when a
  // patrol guard's facing has swung within PRESPOT_ARC of you with line of sight,
  // so it's about to see you. Move. Perception lives in sight.js; drawing here.
  ctx.font = 'bold 12px ' + FONT;
  for (const g of state.guards) {
    if (preSpot(g, statsFor(g.type).sightDist)) {
      ctx.fillStyle = 'rgba(255, 214, 90, 0.7)';
      ctx.fillText('?', fx(g.x), fy(g.y) - g.r * SCALE - 7);
    }
  }

  // ---- bullets ----
  ctx.fillStyle = '#ffe08a';
  for (const b of state.bullets) {
    ctx.beginPath(); ctx.arc(fx(b.x), fy(b.y), Math.max(2, 3 * SCALE), 0, Math.PI * 2); ctx.fill();
  }

  // ---- player (blinks during i-frames) ----
  {
    const px = fx(state.player.x), py = fy(state.player.y);
    const blink = state.player.invuln > 0 && Math.floor(t * 12) % 2 === 0;
    if (!blink) {
      ctx.fillStyle = '#3b4252';
      ctx.beginPath(); ctx.arc(px, py, state.player.r * SCALE, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8fd3ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      let kx = px - 3 * SCALE;
      for (const k of KEYS) if (state.keyBag[k.id]) { ctx.fillStyle = k.color; ctx.beginPath(); ctx.arc(kx, py - 15 * SCALE, 2.6 * SCALE, 0, Math.PI * 2); ctx.fill(); kx += 6.5 * SCALE; }   // F29: collected keys as colored dots
      if (state.hasFile) { ctx.fillStyle = '#e8f2ff'; ctx.fillRect(px - 4 * SCALE, py - 26 * SCALE, 8 * SCALE, 10 * SCALE); }   // F29: file rides higher so it never overlaps the keys
    }
  }

  // ---- carrying cue (F23): how to drop the body, or hide it in a bin ----
  if (state.carrying) {
    const px = fx(state.player.x), py = fy(state.player.y);
    const nearSpot = state.hideSpots.some(s => !s.occupied && Math.hypot(s.x - state.player.x, s.y - state.player.y) < HIDE_DIST);
    ctx.font = 'bold 11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = nearSpot ? '#57d98a' : '#ffd65a';
    ctx.fillText(nearSpot ? 'E: hide body' : 'E: drop', px, py - 20);
  }

  // ---- distract ripple (F25): the noise made visible, a ring expanding off the wall ----
  if (state.distractFx) {
    const k = state.distractFx;
    const pr = Math.min(1, k.t / 0.7);
    ctx.strokeStyle = 'rgba(143, 211, 255, ' + (0.6 * (1 - pr)) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fx(k.x), fy(k.y), 6 * SCALE + pr * DISTRACT_HEARING * SCALE, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---- screen-space overlays (not scaled) ----
  if (state.alarmTime > 0 && !state.gameOver) {
    const pulse = 0.10 + 0.08 * Math.sin(t * 5);
    ctx.strokeStyle = 'rgba(255, 100, 40, ' + pulse + ')';
    ctx.lineWidth = 18;
    ctx.strokeRect(OXX + 9, OYY + 9, WW - 18, WH - 18);
  }
  if (state.spotFlash > 0 && !state.gameOver) {
    const a = Math.min(0.5, state.spotFlash * 0.5);
    ctx.strokeStyle = 'rgba(255, 180, 70, ' + a + ')';
    ctx.lineWidth = 12;
    ctx.strokeRect(OXX + 6, OYY + 6, WW - 12, WH - 12);
  }
  if (state.flash > 0) {
    ctx.fillStyle = 'rgba(255, 40, 40, ' + (state.flash * 0.5) + ')';
    ctx.fillRect(OXX, OYY, WW, WH);
  }
  ctx.restore();

  // ---- top strip (drawn unclipped): arcade header on the left, minimap on the right ----
  drawHeader();
  drawMinimap(t, range);
}
