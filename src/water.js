// Tiny "water" model. We don't simulate fluid — we sample the dam line and
// compute partial obstruction (gaps and leaks between placed pieces) to
// derive a pressure value. That pressure drives drifting debris, bursts,
// foam, and the upstream pool rise — the real game-feel of the dam.

import {
  W, H,
  PIECE_TYPES,
  isInStream,
  streamTangentAt,
  streamStations,
  piecePoints,
} from "./state.js";

// True if any sample along the piece's body falls on dry land. Used to
// snag drifters against the bank — same role as colliding with another
// stuck piece.
function pieceTouchesLand(p) {
  for (const s of piecePoints(p)) {
    if (!isInStream(s.x, s.y)) return true;
  }
  return false;
}

// Pieces dropped on land never count as part of the dam, never burst, and
// don't emit water particles. We do an isInStream sample at the piece center
// for these checks. Cheap because the binary stream map is just an array
// lookup once initStreamColorModel has run.
function pieceInWater(p) {
  return isInStream(p.x, p.y);
}

// Stricter than pieceInWater: the center must be wet and a majority of body
// samples must be in the stream. Used for burst eligibility so a piece mostly
// on land is anchored, while a stick with one end grazing the bank is still
// fair game for the current to tear loose.
function pieceMostlyInWater(p) {
  if (!isInStream(p.x, p.y)) return false;
  const pts = piecePoints(p);
  let wet = 0;
  for (const s of pts) if (isInStream(s.x, s.y)) wet++;
  return wet * 2 > pts.length;
}

// ---------- dam coverage / gap flow ----------

const STATION_STEP = 40;        // arc-length spacing between sampled stations
const NUM_COLS = 24;            // sample columns across each cross-section
const BACKUP_GATE = 0.55;       // below this coverage water doesn't back up

// Returns:
//   jets:     [{ x, y, width, strength }] — a gap inside a backed-up
//             cross-section becomes a jet of water bursting through.
//   lateral:  [{ x0,y0, x1,y1, dir, strength }] — water sliding sideways
//             along the dam top to reach a gap, oriented in world coords.
//   pressure: 0..1 — bottleneck cross-section coverage (1 = fully sealed).
//   bottleneck: { cx, cy, tx, ty } — the most-blocked cross-section, or null.
export function computeDamState(placed) {
  const stations = streamStations(STATION_STEP);

  // Per-station coverage analysis. Each station is a cross-section
  // perpendicular to local flow; we sample NUM_COLS points across it and
  // accumulate obstruction from any non-flowing piece that overlaps.
  const stationStates = [];
  for (const st of stations) {
    const halfW = st.width / 2;
    const colWidth = st.width / NUM_COLS;
    const obstruction = new Array(NUM_COLS).fill(0);
    const wet = new Array(NUM_COLS).fill(false);

    for (let c = 0; c < NUM_COLS; c++) {
      const off = -halfW + (c + 0.5) * colWidth;
      const sx = st.cx + st.nx * off;
      const sy = st.cy + st.ny * off;
      if (isInStream(sx, sy)) wet[c] = true;
      else obstruction[c] = -1;
    }

    for (const p of placed) {
      if (p.flowing) continue;
      if (!pieceInWater(p)) continue;
      const def = PIECE_TYPES[p.type];
      if (!def) continue;
      // Project piece center into station-local frame: along = downstream,
      // perp = across the flow.
      const dx = p.x - st.cx, dy = p.y - st.cy;
      const along = dx * st.tx + dy * st.ty;
      const perp = dx * st.nx + dy * st.ny;
      const reach = Math.max(def.w, def.h) / 2;
      if (Math.abs(along) > reach) continue;
      // Falloff so a piece contributes most strongly to its nearest station
      // and tapers off as the cross-section moves past it. Without this each
      // piece would seal multiple adjacent stations equally, inflating
      // bottleneck pressure.
      const alongFrac = 1 - Math.min(1, Math.abs(along) / reach);
      const contrib = def.obstruction * alongFrac;
      const left = perp - reach;
      const right = perp + reach;
      const cStart = Math.floor((left + halfW) / colWidth);
      const cEnd = Math.ceil((right + halfW) / colWidth);
      for (let c = Math.max(0, cStart); c < Math.min(NUM_COLS, cEnd); c++) {
        if (obstruction[c] === -1) continue;
        obstruction[c] += contrib;
      }
    }

    const openness = new Array(NUM_COLS).fill(0);
    let totalWet = 0;
    let totalOpen = 0;
    for (let c = 0; c < NUM_COLS; c++) {
      if (!wet[c]) continue;
      totalWet += colWidth;
      const o = Math.max(0, 1 - Math.min(1, obstruction[c]));
      openness[c] = o;
      totalOpen += o * colWidth;
    }
    const coverage = totalWet > 0 ? 1 - totalOpen / totalWet : 0;
    stationStates.push({ st, openness, wet, coverage, colWidth, halfW });
  }

  // Pressure is driven by the bottleneck: water can only back up as much as
  // the tightest cross-section allows. Spreading pieces along the stream
  // doesn't compound — you have to actually wall off one section.
  let bottleneck = null;
  for (const ss of stationStates) {
    if (!bottleneck || ss.coverage > bottleneck.coverage) bottleneck = ss;
  }
  const pressure = bottleneck ? bottleneck.coverage : 0;

  const jets = [];
  const lateral = [];
  if (bottleneck && bottleneck.coverage >= BACKUP_GATE) {
    runsAcrossSection(bottleneck, jets, lateral);
  }

  return {
    jets,
    pressure,
    lateral,
    bottleneck: bottleneck ? {
      cx: bottleneck.st.cx, cy: bottleneck.st.cy,
      tx: bottleneck.st.tx, ty: bottleneck.st.ty,
    } : null,
  };
}

// Per wet segment of a cross-section, distribute incoming flow across open
// columns (sealed columns hand their share to neighbours — the "lateral
// flow" effect) and emit jets for interior gaps + lateral runs for sealed
// stretches.
function runsAcrossSection(ss, jets, lateral) {
  const { st, openness, wet, colWidth, halfW } = ss;
  const cols = NUM_COLS;

  const segments = [];
  let segStart = -1;
  for (let c = 0; c <= cols; c++) {
    const w = c < cols && wet[c];
    if (w && segStart === -1) segStart = c;
    if (!w && segStart !== -1) {
      segments.push({ s: segStart, e: c });
      segStart = -1;
    }
  }

  const out = new Array(cols).fill(0);
  for (const seg of segments) {
    let openSum = 0;
    for (let c = seg.s; c < seg.e; c++) openSum += openness[c];
    seg.openSum = openSum;
    seg.coverage = 1 - openSum / (seg.e - seg.s);
    if (openSum < 1e-4) continue;
    const H = (seg.e - seg.s) / openSum;
    for (let c = seg.s; c < seg.e; c++) out[c] = H * openness[c];
  }

  const offFor = (c) => -halfW + c * colWidth;
  const ptFor = (c) => ({
    x: st.cx + st.nx * offFor(c),
    y: st.cy + st.ny * offFor(c),
  });

  for (const seg of segments) {
    if (seg.coverage < BACKUP_GATE) continue;
    const segRamp = Math.min(1, (seg.coverage - BACKUP_GATE) / (1 - BACKUP_GATE));

    // Jets: open runs interior to a backed-up segment.
    let runStart = -1;
    let runOut = 0;
    for (let c = seg.s; c <= seg.e; c++) {
      const open = c < seg.e && openness[c] > 0.05;
      if (open && runStart === -1) { runStart = c; runOut = 0; }
      if (open) runOut += out[c];
      if (!open && runStart !== -1) {
        const runEnd = c;
        const interior = runStart > seg.s && runEnd < seg.e;
        if (interior) {
          const cmid = (runStart + runEnd) / 2;
          const span = runEnd - runStart;
          const p = ptFor(cmid);
          jets.push({
            x: p.x,
            y: p.y,
            width: span * colWidth,
            strength: Math.min(1.4, runOut / span) * segRamp,
          });
        }
        runStart = -1;
      }
    }

    // Lateral: sealed stretches slide flow toward the nearest gap.
    let sealStart = -1;
    for (let c = seg.s; c <= seg.e; c++) {
      const sealed = c < seg.e && openness[c] < 0.1;
      if (sealed && sealStart === -1) sealStart = c;
      if (!sealed && sealStart !== -1) {
        const sealEnd = c;
        let leftOpen = -1, rightOpen = -1;
        for (let k = sealStart - 1; k >= seg.s; k--) {
          if (openness[k] >= 0.1) { leftOpen = k; break; }
        }
        for (let k = sealEnd; k < seg.e; k++) {
          if (openness[k] >= 0.1) { rightOpen = k; break; }
        }
        const strength = Math.min(1, (sealEnd - sealStart) * colWidth / 220);
        const ptStart = ptFor(sealStart);
        const ptEnd = ptFor(sealEnd);
        if (leftOpen >= 0 && rightOpen >= 0) {
          const mid = Math.floor((sealStart + sealEnd) / 2);
          const ptMid = ptFor(mid);
          if (mid > sealStart) lateral.push({ x0: ptStart.x, y0: ptStart.y, x1: ptMid.x, y1: ptMid.y, dir: -1, strength });
          if (mid < sealEnd)   lateral.push({ x0: ptMid.x,   y0: ptMid.y,   x1: ptEnd.x, y1: ptEnd.y, dir:  1, strength });
        } else if (leftOpen >= 0) {
          lateral.push({ x0: ptStart.x, y0: ptStart.y, x1: ptEnd.x, y1: ptEnd.y, dir: -1, strength });
        } else if (rightOpen >= 0) {
          lateral.push({ x0: ptStart.x, y0: ptStart.y, x1: ptEnd.x, y1: ptEnd.y, dir:  1, strength });
        }
        sealStart = -1;
      }
    }
  }
}

// ---------- per-frame update ----------

const FLOW_SPEED = 110;            // px/sec base downstream speed
const OFFSCREEN_PAD = 80;
const LEAF_SPAWN_MIN = 4.0;        // min seconds between auto-spawned drifters
const LEAF_SPAWN_MAX = 8.0;        // max seconds between auto-spawned drifters

// How strongly each piece type pushes passing drifters sideways. Pebbles
// are solid blockers and shove flow around them; sticks are long and thin
// so water slips past with barely a nudge, which is what lets a stick
// across the stream catch leaves instead of fanning them away; leaves sit
// in between.
const DEFLECT = { stick: 0.15, pebble: 1.0, leaf: 0.5 };

export function updateFlow(state, dt) {
  spawnDrifters(state, dt);

  const placed = state.placed;
  const tnow = state.t;

  for (let i = placed.length - 1; i >= 0; i--) {
    const p = placed[i];
    if (!p.flowing) continue;

    const defp = PIECE_TYPES[p.type];
    const tan = streamTangentAt(p.x, p.y);
    const nx = -tan.dy, ny = tan.dx;

    // Deflection field: each non-flowing piece downstream of this drifter
    // pushes it perpendicular to the current so it slides around the obstacle
    // instead of sailing straight into it. Cheap stand-in for real flow that
    // routes water around blockages.
    let pushPerp = 0;
    let pushAlong = 0;
    for (const q of placed) {
      if (q === p || q.flowing) continue;
      const qdef = PIECE_TYPES[q.type];
      if (!qdef) continue;
      const dx = p.x - q.x, dy = p.y - q.y;
      const along = dx * tan.dx + dy * tan.dy; // <0 means q is downstream
      if (along >= 0) continue;
      const range = (qdef.w + defp.w) * 0.85;
      const d = Math.hypot(dx, dy);
      if (d > range || d < 0.5) continue;
      const f = 1 - d / range;
      const w = f * f * (DEFLECT[q.type] ?? qdef.obstruction);
      // perp is the leaf's offset relative to the blocker; sign tells which
      // side to escape on. If perfectly aligned, pick a side at random so the
      // leaf commits instead of stalling in front of the stone.
      const perp = dx * nx + dy * ny;
      const side = perp !== 0 ? Math.sign(perp) : (Math.random() < 0.5 ? -1 : 1);
      pushPerp += side * w;
      pushAlong -= w * 0.35;
    }

    // Speed scales with type — leaves are light, sticks heavier.
    const baseSpeed = FLOW_SPEED * (p.type === "stick" ? 0.85 : 1) *
      (1 + 0.25 * Math.sin(tnow * 1.7 + (p.phase ?? 0)));
    const speed = baseSpeed * Math.max(0.3, 1 + pushAlong);
    const sideSpeed = baseSpeed * pushPerp * 2.4;
    p.x += tan.dx * speed * dt + nx * sideSpeed * dt;
    p.y += tan.dy * speed * dt + ny * sideSpeed * dt;

    // Sideways wobble across the current — gives drifters a living wiggle
    // instead of a perfectly straight glide.
    const wobble = Math.sin(tnow * 2.4 + (p.phase ?? 0)) * (p.type === "leaf" ? 22 : 8);
    p.x += nx * wobble * dt;
    p.y += ny * wobble * dt;

    p.rot = (p.rot ?? 0) + (p.type === "leaf" ? 0.6 : 0.2) * dt;

    if (
      p.x < -OFFSCREEN_PAD || p.x > W + OFFSCREEN_PAD ||
      p.y < -OFFSCREEN_PAD || p.y > H + OFFSCREEN_PAD
    ) {
      placed.splice(i, 1);
      continue;
    }

    // Catch on any stationary piece — players can build catchers off the
    // dam line if they want. Tighter ellipse for leaves so a graze doesn't
    // count as a stick.
    let snagged = false;
    for (const q of placed) {
      if (q === p || q.flowing) continue;
      const defq = PIECE_TYPES[q.type];
      const catchScale = p.type === "leaf" ? 0.26 : 0.34;
      const rx = (defp.w + defq.w) * catchScale;
      const ry = (defp.h + defq.h) * catchScale;
      const dx = p.x - q.x, dy = p.y - q.y;
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) < 1) {
        p.flowing = false;
        snagged = true;
        break;
      }
    }
    if (snagged) continue;

    // Banks are obstacles too: if the drifter's body has crossed the
    // wet/dry boundary, snag it where it hit. Without this a leaf could
    // skim along the bank with one half on land.
    if (pieceTouchesLand(p)) {
      p.flowing = false;
      continue;
    }
  }

  // Pressure (smoothed) and burst events.
  const dam = computeDamState(placed);
  // Smooth so the pool/foam don't jitter when a new piece is dropped.
  const smoothing = 1 - Math.exp(-dt * 4);
  state.pressure = (state.pressure ?? 0) * (1 - smoothing) + dam.pressure * smoothing;

  tryBurst(state, dt);

  spawnEddies(state, dt);
  ageSplashes(state, dt);
  spawnSplashesFor(state, dam.jets);
  ageRipples(state, dt);
}

function ageRipples(state, dt) {
  if (!state.ripples) return;
  for (let i = state.ripples.length - 1; i >= 0; i--) {
    const r = state.ripples[i];
    r.age += dt;
    if (r.age >= r.life) state.ripples.splice(i, 1);
  }
}

// ---------- drifters ----------

function spawnDrifters(state, dt) {
  state.leafSpawnT = (state.leafSpawnT ?? 0) + dt;
  if (state.nextLeafSpawn == null) {
    state.nextLeafSpawn = LEAF_SPAWN_MIN + Math.random() * (LEAF_SPAWN_MAX - LEAF_SPAWN_MIN);
  }
  if (state.leafSpawnT < state.nextLeafSpawn) return;
  state.leafSpawnT = 0;
  state.nextLeafSpawn = LEAF_SPAWN_MIN + Math.random() * (LEAF_SPAWN_MAX - LEAF_SPAWN_MIN);

  // Spawn within the narrow upstream band (peaked toward the middle). The top
  // of the stream is only ~220px wide, so keep margin from the banks here —
  // wobble and the river fanning out downstream restore variety before the dam.
  const r = Math.random() + Math.random(); // 0..2, peaked at 1
  const head = { x: 300 + r * 60, y: -10 };
  const type = Math.random() < 0.85 ? "leaf" : "stick";
  state.placed.unshift({
    id: "d-" + Math.random().toString(36).slice(2, 8),
    type,
    x: head.x,
    y: head.y,
    rot: Math.random() * Math.PI * 2,
    flowing: true,
    auto: true,
    phase: Math.random() * Math.PI * 2,
  });
}

// ---------- bursts ----------

// How tightly a piece is bracketed by stones across the flow. A stick laid
// between two pebbles has stones at both cross-flow ends; water hits the
// stick, gets redirected around the stones, and can't lever the stick free.
// Returns 0 (not wedged) up to 1 (snugly bracketed on both sides).
function wedgeFactor(piece, placed) {
  const def = PIECE_TYPES[piece.type];
  if (!def) return 0;
  const tan = streamTangentAt(piece.x, piece.y);
  const nx = -tan.dy, ny = tan.dx;
  const idealPerp = def.w / 2;
  const tolPerp = def.w * 0.5 + 20;     // how off-target the stone may sit
  const tolAlong = def.h * 0.6 + 24;    // how far up/downstream is still wedging
  let left = 0, right = 0;
  for (const q of placed) {
    if (q === piece || q.flowing) continue;
    if (q.type !== "pebble") continue;
    const qdef = PIECE_TYPES[q.type];
    const dx = q.x - piece.x, dy = q.y - piece.y;
    const along = dx * tan.dx + dy * tan.dy;
    const perp = dx * nx + dy * ny;
    if (Math.abs(along) > tolAlong + qdef.h / 2) continue;
    const offset = Math.abs(Math.abs(perp) - idealPerp);
    if (offset > tolPerp) continue;
    const fitPerp = 1 - offset / tolPerp;
    const fitAlong = 1 - Math.abs(along) / (tolAlong + qdef.h / 2);
    const closeness = fitPerp * fitAlong;
    if (perp < 0) left = Math.max(left, closeness);
    else right = Math.max(right, closeness);
  }
  return Math.min(left, right);
}

// Pressure pops the weakest stuck piece downstream. Pebbles never burst.
function tryBurst(state, dt) {
  const p = state.pressure;
  // Even a slightly leaky dam can wash a stuck leaf off; sticks need more
  // pressure before they go. Rate ramps from 0 at p=0.15 up to ~3/s at p≈1.0.
  const ratePerSec = Math.max(0, (p - 0.15) * 3.5);
  if (Math.random() > ratePerSec * dt) return;

  let weakest = null;
  let weakestScore = Infinity;
  for (const q of state.placed) {
    if (q.flowing) continue;
    if (q.type === "pebble") continue; // stones don't burst
    const def = PIECE_TYPES[q.type];
    if (!def) continue;
    // Only pieces mostly in the water can be torn loose by pressure. A piece
    // sitting largely on land is anchored by the bank and shouldn't float off,
    // even if its center pixel happens to be classified as water.
    if (!pieceMostlyInWater(q)) continue;
    const wedge = wedgeFactor(q, state.placed);
    // A wedged piece only gives way once the rest of the stream is nearly
    // sealed and there's nowhere else for water to go — at that point it
    // gets lifted over the stones rather than levered through them.
    const lift = 0.7 + wedge * 0.25;
    if (wedge > 0.15 && p < lift) continue;
    const score = def.mass + wedge * 8 + Math.random() * 0.5;
    if (score < weakestScore) {
      weakestScore = score;
      weakest = q;
    }
  }
  if (!weakest) return;

  weakest.flowing = true;
  weakest.phase = Math.random() * Math.PI * 2;
  // little kick downstream so the burst reads visually
  const tan = streamTangentAt(weakest.x, weakest.y);
  weakest.x += tan.dx * 18;
  weakest.y += tan.dy * 18 + 6;
  // mark the burst location for a foam splash
  state.splashes.push({
    x: weakest.x, y: weakest.y, age: 0, life: 0.7, big: true,
  });
}

// ---------- particles: eddies + splashes ----------

const EDDY_LIFETIME = 1.4;

function spawnEddies(state, dt) {
  // small swirling sparkles off the downstream side of pebbles & sticks
  for (const p of state.placed) {
    if (p.flowing) continue;
    if (p.type !== "pebble" && p.type !== "stick") continue;
    if (!pieceInWater(p)) continue;
    if (Math.random() > dt * 5) continue;
    const tan = streamTangentAt(p.x, p.y);
    const def = PIECE_TYPES[p.type];
    const off = def.w * 0.45;
    state.eddies.push({
      x: p.x + tan.dx * off + (Math.random() - 0.5) * 12,
      y: p.y + tan.dy * off + (Math.random() - 0.5) * 12,
      vx: tan.dx * 30 + (Math.random() - 0.5) * 20,
      vy: tan.dy * 30 + (Math.random() - 0.5) * 20,
      age: 0,
    });
  }

  // age & advect
  for (let i = state.eddies.length - 1; i >= 0; i--) {
    const e = state.eddies[i];
    e.age += dt;
    if (e.age > EDDY_LIFETIME) { state.eddies.splice(i, 1); continue; }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    // curl: rotate velocity slightly each frame
    const c = Math.cos(dt * 1.5), s = Math.sin(dt * 1.5);
    const nvx = e.vx * c - e.vy * s;
    const nvy = e.vx * s + e.vy * c;
    e.vx = nvx * 0.96;
    e.vy = nvy * 0.96;
  }
  // cap
  if (state.eddies.length > 120) state.eddies.splice(0, state.eddies.length - 120);
}

function ageSplashes(state, dt) {
  for (let i = state.splashes.length - 1; i >= 0; i--) {
    const s = state.splashes[i];
    s.age += dt;
    if (s.age > s.life) state.splashes.splice(i, 1);
  }
}

function spawnSplashesFor(state, jets) {
  for (const j of jets) {
    // emission rate scales with how much water is squeezing through
    const rate = 18 * j.strength * Math.min(1, j.width / 60);
    if (Math.random() > rate * 0.016) continue;
    // Splash lands a bit downstream of the gap, where the jet breaks up.
    const tan = streamTangentAt(j.x, j.y);
    const nx = -tan.dy, ny = tan.dx;
    const along = 70 + Math.random() * 14;
    const across = (Math.random() - 0.5) * j.width * 0.6;
    state.splashes.push({
      x: j.x + tan.dx * along + nx * across,
      y: j.y + tan.dy * along + ny * across,
      age: 0,
      life: 0.5 + Math.random() * 0.3,
      big: false,
    });
  }
}
