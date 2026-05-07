// Tiny "water" model. We don't simulate fluid — we sample the dam line and
// compute partial obstruction (gaps and leaks between placed pieces) to
// derive a pressure value. That pressure drives drifting debris, bursts,
// foam, and the upstream pool rise — the real game-feel of the dam.

import {
  W, H,
  BUILD_LINE,
  PIECE_TYPES,
  buildLineSnap,
  isInStream,
  streamTangentAt,
} from "./state.js";

// ---------- dam coverage / waterfalls ----------

const GAP_RESOLUTION = 48; // sample columns across the build line

// Returns:
//   falls:    [{ x, y, width, strength }]  — a leaky/open run becomes a fall
//   lateral:  [{ x0, x1, y, dir, strength }] — water sliding sideways along
//             the dam top to reach a gap (dir = +1 right, -1 left)
//   pressure: 0..1+ — how clogged the dam is (1 = fully sealed)
//   damWidth: total wet width across the dam
export function computeDamState(placed) {
  const x0 = BUILD_LINE.xLeft;
  const x1 = BUILD_LINE.xRight;
  const cols = GAP_RESOLUTION;
  const colWidth = (x1 - x0) / cols;
  const obstruction = new Array(cols).fill(0); // -1 = land, otherwise sum
  const wet = new Array(cols).fill(false);

  for (let c = 0; c < cols; c++) {
    const cx = x0 + (c + 0.5) * colWidth;
    const cy = buildLineSnap(cx);
    if (isInStream(cx, cy)) wet[c] = true;
    else obstruction[c] = -1;
  }

  for (const p of placed) {
    if (p.flowing) continue; // drifting things don't count as dam
    const def = PIECE_TYPES[p.type];
    if (!def) continue;
    const lineY = buildLineSnap(p.x);
    if (Math.abs(p.y - lineY) > 60) continue;
    const halfW = def.w / 2;
    const left = p.x - halfW;
    const right = p.x + halfW;
    const startCol = Math.floor((left - x0) / colWidth);
    const endCol = Math.ceil((right - x0) / colWidth);
    for (let c = Math.max(0, startCol); c < Math.min(cols, endCol); c++) {
      if (obstruction[c] === -1) continue;
      obstruction[c] += def.obstruction;
    }
  }

  // Per-column openness (0..1). Pebbles fully seal a column on their own;
  // sticks need a partner; leaves only weakly plug a leak.
  const openness = new Array(cols).fill(0);
  let damWidth = 0;
  let openSumGlobal = 0;
  for (let c = 0; c < cols; c++) {
    if (!wet[c]) continue;
    damWidth += colWidth;
    const o = Math.max(0, 1 - Math.min(1, obstruction[c]));
    openness[c] = o;
    openSumGlobal += o * colWidth;
  }
  const pressure = damWidth > 0 ? 1 - openSumGlobal / damWidth : 0;

  // Equilibrium per wet segment: each contiguous run of wet columns acts as
  // a shared pool. With supply 1 per column, the pool's head H rises until
  // total outflow (= sum H*openness[c]) matches total supply (= seg width).
  // So H = nWet / sum(openness). Sealed columns inside the segment hand off
  // their supply to the open ones — that's the "lateral flow" effect.
  const out = new Array(cols).fill(0);
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
  for (const seg of segments) {
    let openSum = 0;
    for (let c = seg.s; c < seg.e; c++) openSum += openness[c];
    if (openSum < 1e-4) continue; // segment is totally sealed — no through-flow
    const H = (seg.e - seg.s) / openSum;
    for (let c = seg.s; c < seg.e; c++) out[c] = H * openness[c];
  }

  // Group adjacent open columns into waterfalls. Strength = average through-
  // flow per column over the run. A small gap downstream of a wide sealed
  // stretch ends up wider/heavier because sealed columns route water to it.
  const falls = [];
  {
    let runStart = -1;
    let runOut = 0;
    for (let c = 0; c <= cols; c++) {
      const open = c < cols && wet[c] && openness[c] > 0.05;
      if (open && runStart === -1) { runStart = c; runOut = 0; }
      if (open) runOut += out[c];
      if (!open && runStart !== -1) {
        const cx0 = x0 + runStart * colWidth;
        const cx1 = x0 + c * colWidth;
        const span = c - runStart;
        const cx = (cx0 + cx1) / 2;
        const cy = buildLineSnap(cx);
        falls.push({
          x: cx,
          y: cy,
          width: cx1 - cx0,
          strength: Math.min(1.4, runOut / span),
        });
        runStart = -1;
      }
    }
  }

  // Lateral runs: stretches of sealed dam where water has to slide along the
  // top to reach a gap. Direction picks the nearest open column on either
  // side within the same wet segment; if both exist, the run splits at its
  // midpoint.
  const lateral = [];
  for (const seg of segments) {
    let runStart = -1;
    for (let c = seg.s; c <= seg.e; c++) {
      const sealed = c < seg.e && openness[c] < 0.1;
      if (sealed && runStart === -1) runStart = c;
      if (!sealed && runStart !== -1) {
        const runEnd = c;
        let leftOpen = -1, rightOpen = -1;
        for (let k = runStart - 1; k >= seg.s; k--) {
          if (openness[k] >= 0.1) { leftOpen = k; break; }
        }
        for (let k = runEnd; k < seg.e; k++) {
          if (openness[k] >= 0.1) { rightOpen = k; break; }
        }
        const fx = (i) => x0 + i * colWidth;
        const strength = Math.min(1, (runEnd - runStart) * colWidth / 220);
        if (leftOpen >= 0 && rightOpen >= 0) {
          const mid = Math.floor((runStart + runEnd) / 2);
          if (mid > runStart) lateral.push({ x0: fx(runStart), x1: fx(mid),    dir: -1, strength });
          if (mid < runEnd)   lateral.push({ x0: fx(mid),      x1: fx(runEnd), dir:  1, strength });
        } else if (leftOpen >= 0) {
          lateral.push({ x0: fx(runStart), x1: fx(runEnd), dir: -1, strength });
        } else if (rightOpen >= 0) {
          lateral.push({ x0: fx(runStart), x1: fx(runEnd), dir:  1, strength });
        }
        runStart = -1;
      }
    }
  }
  for (const r of lateral) r.y = buildLineSnap((r.x0 + r.x1) / 2);

  return { falls, pressure, damWidth, lateral };
}

// Backwards compatible helper used by render.js for clarity.
export function computeWaterfalls(placed) {
  return computeDamState(placed).falls;
}

// ---------- per-frame update ----------

const FLOW_SPEED = 110;            // px/sec base downstream speed
const OFFSCREEN_PAD = 80;
const LEAF_SPAWN_MIN = 4.0;        // min seconds between auto-spawned drifters
const LEAF_SPAWN_MAX = 8.0;        // max seconds between auto-spawned drifters

export function updateFlow(state, dt) {
  spawnDrifters(state, dt);

  const placed = state.placed;
  const tnow = state.t;

  for (let i = placed.length - 1; i >= 0; i--) {
    const p = placed[i];
    if (!p.flowing) continue;

    const tan = streamTangentAt(p.x, p.y);
    // Speed scales with type — leaves are light, sticks heavier.
    const speed = FLOW_SPEED * (p.type === "stick" ? 0.85 : 1) *
      (1 + 0.25 * Math.sin(tnow * 1.7 + (p.phase ?? 0)));
    p.x += tan.dx * speed * dt;
    p.y += tan.dy * speed * dt;

    // Sideways wobble across the current — gives drifters a living wiggle
    // instead of a perfectly straight glide.
    const nx = -tan.dy, ny = tan.dx;
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

    // Catch on stationary dam pieces — that's how leaves seal leaks.
    let snagged = false;
    for (const q of placed) {
      if (q === p || q.flowing) continue;
      const defp = PIECE_TYPES[p.type];
      const defq = PIECE_TYPES[q.type];
      const rx = (defp.w + defq.w) * 0.32;
      const ry = (defp.h + defq.h) * 0.32;
      const dx = p.x - q.x, dy = p.y - q.y;
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) < 1) {
        p.flowing = false;
        // Snap onto the dam line for a cleaner seal if the catcher is on it.
        const lineY = buildLineSnap(q.x);
        if (Math.abs(q.y - lineY) < 60) {
          p.y = lineY + (Math.random() * 12 - 6);
        }
        snagged = true;
        break;
      }
    }
    if (snagged) continue;
  }

  // Pressure (smoothed) and burst events.
  const dam = computeDamState(placed);
  // Smooth so the pool/foam don't jitter when a new piece is dropped.
  const smoothing = 1 - Math.exp(-dt * 4);
  state.pressure = (state.pressure ?? 0) * (1 - smoothing) + dam.pressure * smoothing;

  if (state.pressure > 0.7) tryBurst(state, dt);

  spawnEddies(state, dt);
  ageSplashes(state, dt);
  spawnSplashesFor(state, dam.falls);
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

  // Spawn at the upstream end of the stream path.
  const head = { x: 360 + Math.random() * 80 - 40, y: -10 };
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

// Pressure pops the weakest stuck piece downstream. Pebbles never burst.
function tryBurst(state, dt) {
  const p = state.pressure;
  // Probability per second of a burst event ramps from 0 at p=0.7 to ~3/s at p>=1.5.
  const ratePerSec = Math.max(0, (p - 0.7) * 3);
  if (Math.random() > ratePerSec * dt) return;

  let weakest = null;
  let weakestScore = Infinity;
  for (const q of state.placed) {
    if (q.flowing) continue;
    if (q.type === "pebble") continue; // stones don't burst
    const def = PIECE_TYPES[q.type];
    if (!def) continue;
    const lineY = buildLineSnap(q.x);
    if (Math.abs(q.y - lineY) > 60) continue;
    const score = def.mass + Math.random() * 0.5; // tie-break randomly
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

function spawnSplashesFor(state, falls) {
  for (const f of falls) {
    // emission rate scales with how much water is pouring through
    const rate = 18 * f.strength * Math.min(1, f.width / 60);
    if (Math.random() > rate * 0.016) continue;
    state.splashes.push({
      x: f.x + (Math.random() - 0.5) * f.width * 0.6,
      y: f.y + 130 + Math.random() * 14,
      age: 0,
      life: 0.5 + Math.random() * 0.3,
      big: false,
    });
  }
}
