// Renders the world. Uses real images when assets are available; otherwise
// falls back to procedural shapes so the game is playable without art.

import { W, H, STREAM, PIECE_TYPES, streamTangentAt, isInStream } from "./state.js";
import { computeDamState } from "./water.js";

export function render(ctx, state, assets) {
  ctx.clearRect(0, 0, W, H);

  // Background scene (banks, foliage, stream bed).
  if (assets.background.loaded) {
    ctx.drawImage(assets.background.image, 0, 0, W, H);
  } else {
    drawProceduralBackground(ctx, state.t);
  }

  // Ambient animated caustics over the wet stream — keeps the surface alive
  // even when nothing is happening.
  drawCaustics(ctx, state, assets);

  // Animated water overlay (subtle ripple) on top of stream bed if no
  // pre-rendered background — otherwise we still draw light highlights on
  // top of the painted background so the stream looks alive.
  drawWaterEffects(ctx, state, assets);

  // Drop ripples sit beneath the dropped piece — the rings spread out into
  // the surrounding water rather than painting over the rock that's sitting
  // proud of the surface.
  drawRipples(ctx, state, assets);

  // Streamlines bending around each stationary stone/stick: bow cushion on
  // the upstream face, scrolling streaks past the sides. Drawn under pieces
  // so the rock visually sits in the current.
  drawStoneCurrents(ctx, state);

  // Dam pieces in placement order.
  for (const p of state.placed) {
    drawPiece(ctx, p, assets);
  }

  // Drag preview.
  if (state.drag) {
    const ghost = {
      type: state.drag.type,
      x: state.drag.x,
      y: state.drag.y,
      rot: state.drag.rot ?? 0,
    };
    ctx.globalAlpha = 0.85;
    drawPiece(ctx, ghost, assets);
    ctx.globalAlpha = 1;
  }

  if (state.showHint) drawTooltip(ctx, state, assets);
}

// ---------- pieces ----------

function drawPiece(ctx, p, assets) {
  const def = PIECE_TYPES[p.type];
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot ?? 0);
  const key = "piece" + p.type[0].toUpperCase() + p.type.slice(1);
  const a = assets[key];
  if (a && a.loaded) {
    ctx.drawImage(a.image, -def.w / 2, -def.h / 2, def.w, def.h);
  } else {
    drawProceduralPiece(ctx, p.type, def);
  }
  ctx.restore();
}

function drawProceduralPiece(ctx, type, def) {
  if (type === "stick") {
    const grd = ctx.createLinearGradient(-def.w / 2, 0, def.w / 2, 0);
    grd.addColorStop(0, "#5a3b22");
    grd.addColorStop(0.5, "#7e5a36");
    grd.addColorStop(1, "#4a2f1c");
    ctx.fillStyle = grd;
    ctx.beginPath();
    roundRect(ctx, -def.w / 2, -def.h / 2, def.w, def.h, def.h / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,220,180,0.15)";
    ctx.beginPath();
    ctx.moveTo(-def.w / 2 + 8, -2);
    ctx.lineTo(def.w / 2 - 8, -2);
    ctx.stroke();
  } else if (type === "pebble") {
    const grd = ctx.createRadialGradient(-10, -10, 5, 0, 0, def.w / 2);
    grd.addColorStop(0, "#7a7468");
    grd.addColorStop(1, "#3c3933");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(0, 0, def.w / 2, def.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(-def.w / 5, -def.h / 4, def.w / 5, def.h / 8, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "leaf") {
    ctx.rotate(0); // already rotated by caller
    const grd = ctx.createLinearGradient(-def.w / 2, 0, def.w / 2, 0);
    grd.addColorStop(0, "#3f6d2c");
    grd.addColorStop(1, "#86b25a");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(-def.w / 2, 0);
    ctx.quadraticCurveTo(0, -def.h / 2, def.w / 2, 0);
    ctx.quadraticCurveTo(0, def.h / 2, -def.w / 2, 0);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-def.w / 2, 0);
    ctx.lineTo(def.w / 2, 0);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.stroke();
  }
}

// ---------- procedural background ----------

function drawProceduralBackground(ctx, t) {
  // grass/earth banks
  ctx.fillStyle = "#3e5527";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#5a3a20";
  ctx.fillRect(0, H - 220, W, 220);

  // stream
  ctx.save();
  const path = STREAM.path;
  ctx.beginPath();
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    if (i === 0) ctx.moveTo(a.x - a.w / 2, a.y);
    else ctx.lineTo(a.x - a.w / 2, a.y);
  }
  for (let i = path.length - 1; i >= 0; i--) {
    const a = path[i];
    ctx.lineTo(a.x + a.w / 2, a.y);
  }
  ctx.closePath();
  const sg = ctx.createLinearGradient(0, 0, 0, H);
  sg.addColorStop(0, "#1f4f6e");
  sg.addColorStop(1, "#2c6b8a");
  ctx.fillStyle = sg;
  ctx.fill();

  // ripples
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  for (let y = 0; y < H; y += 48) {
    ctx.beginPath();
    const offset = Math.sin((y / 60) + t * 0.6) * 12;
    ctx.moveTo(0, y);
    for (let x = 0; x <= W; x += 32) {
      ctx.lineTo(x, y + Math.sin((x / 90) + t + y * 0.01) * 4 + offset * 0.05);
    }
    ctx.stroke();
  }
  ctx.restore();

  // dab some rocks/foliage at borders so the playfield reads as nature.
  drawCornerFoliage(ctx);
}

function drawCornerFoliage(ctx) {
  // top-left flowers
  for (let i = 0; i < 3; i++) {
    drawFlower(ctx, 60 + i * 70, 80 + (i % 2) * 30);
  }
  // bottom-left leaves
  drawSimpleLeaf(ctx, 110, 740, 0.6);
  drawSimpleLeaf(ctx, 80, 820, -0.4);
  // bottom-right paper-card area is drawn by UI
  // log top-right
  ctx.save();
  ctx.translate(1280, 60);
  ctx.rotate(-0.15);
  ctx.fillStyle = "#5a3922";
  roundRect(ctx, -200, -30, 400, 60, 30);
  ctx.fill();
  ctx.restore();
}

function drawFlower(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#e9c43a";
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(Math.cos(i * 1.25) * 18, Math.sin(i * 1.25) * 18, 14, 18, i * 1.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#a36a17";
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSimpleLeaf(ctx, x, y, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#5e8a3a";
  ctx.beginPath();
  ctx.moveTo(-50, 0);
  ctx.quadraticCurveTo(0, -40, 50, 0);
  ctx.quadraticCurveTo(0, 40, -50, 0);
  ctx.fill();
  ctx.restore();
}

// ---------- water effects (gap jets + foam) ----------

function drawWaterEffects(ctx, state, assets) {
  const dam = computeDamState(state.placed);
  drawUpstreamPool(ctx, state.pressure ?? 0, dam.bottleneck);
  drawLateralRuns(ctx, dam.lateral, state.t, state.pressure ?? 0);
  for (const j of dam.jets) {
    drawGapRush(ctx, j.x, j.y, j.width, j.strength, state.t);
  }
  drawEddies(ctx, state);
  drawSplashes(ctx, state, assets);
  drawSurges(ctx, state, assets);
}

// Slow-cycling caustic tile over the wet stream surface. Adds constant gentle
// motion to the water so the scene never feels static. Clipped to the stream
// path and screen-blended so it brightens highlights without flattening color.
function drawCaustics(ctx, state, assets) {
  const a = assets?.caustics;
  if (!a || !a.loaded) return;
  ctx.save();
  // Clip to stream so the caustics never spill onto the banks.
  const path = STREAM.path;
  ctx.beginPath();
  for (let i = 0; i < path.length; i++) {
    const pt = path[i];
    if (i === 0) ctx.moveTo(pt.x - pt.w / 2, pt.y);
    else ctx.lineTo(pt.x - pt.w / 2, pt.y);
  }
  for (let i = path.length - 1; i >= 0; i--) {
    const pt = path[i];
    ctx.lineTo(pt.x + pt.w / 2, pt.y);
  }
  ctx.closePath();
  ctx.clip();

  const frames = a.frames || 8;
  // Crossfade between adjacent frames so highlights breathe instead of
  // strobing. ~4 fps reads as a lively shimmer; the blend hides the seams.
  const phase = state.t * 4;
  const fi = Math.floor(phase) % frames;
  const fi2 = (fi + 1) % frames;
  const blend = phase - Math.floor(phase);
  ctx.globalCompositeOperation = "screen";

  // Two tiled layers at different scales drifting in opposite directions.
  // The parallax keeps the wide mid-section feeling alive — a single layer
  // there sits as a pair of near-static tiles, so highlights only really
  // moved at the narrow top/bottom where tile seams crossed the stream.
  const drift = state.t * 18;
  drawCausticLayer(ctx, a, fi, fi2, blend, 320, drift, drift * 0.45, 0.16);
  drawCausticLayer(ctx, a, fi2, fi, 1 - blend, 480, -drift * 0.7, drift * 0.3, 0.11);

  ctx.restore();
}

function drawCausticLayer(ctx, a, fi, fi2, blend, tile, dx, dy, alpha) {
  const fs = a.frameSize || 256;
  const ox = -((dx % tile) + tile) % tile - tile;
  const oy = -((dy % tile) + tile) % tile - tile;
  for (let ty = oy; ty < H + tile; ty += tile) {
    for (let tx = ox; tx < W + tile; tx += tile) {
      ctx.globalAlpha = alpha * (1 - blend);
      ctx.drawImage(a.image, fi * fs, 0, fs, fs, tx, ty, tile, tile);
      ctx.globalAlpha = alpha * blend;
      ctx.drawImage(a.image, fi2 * fs, 0, fs, fs, tx, ty, tile, tile);
    }
  }
}

// Animated streaks moving along a sealed cross-section toward the nearest
// gap. Each run is an oriented world-space segment (x0,y0)→(x1,y1) — the
// streaks are drawn in a local frame aligned with the segment so they
// follow the cross-section direction at the bottleneck.
function drawLateralRuns(ctx, runs, t, pressure) {
  if (!runs?.length) return;
  const intensity = Math.min(1, 0.4 + pressure * 1.2);
  ctx.save();
  for (const r of runs) {
    const dx = r.x1 - r.x0, dy = r.y1 - r.y0;
    const w = Math.hypot(dx, dy);
    if (w < 14) continue;
    const angle = Math.atan2(dy, dx);
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    const a = r.strength * intensity;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(170,210,235,${0.18 * a})`;
    ctx.fillRect(-w / 2, -16, w, 5);
    ctx.fillStyle = `rgba(255,255,255,${0.55 * a})`;
    const streakLen = Math.min(28, w * 0.35);
    const streakCount = Math.max(2, Math.floor(w / 38));
    for (let i = 0; i < streakCount; i++) {
      const phase = ((t * 0.9 + i / streakCount) % 1);
      const sx = r.dir > 0 ? -w / 2 + phase * w : w / 2 - phase * w;
      const fade = Math.sin(phase * Math.PI);
      ctx.globalAlpha = 0.55 * a * fade;
      ctx.fillRect(sx - streakLen / 2, -13, streakLen, 2);
    }
    ctx.globalAlpha = 1;
    const tipX = r.dir > 0 ? w / 2 - 4 : -w / 2 + 4;
    const tipY = -11;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY - 5);
    ctx.lineTo(tipX + 8 * r.dir, tipY);
    ctx.lineTo(tipX, tipY + 5);
    ctx.closePath();
    ctx.fillStyle = `rgba(220,240,255,${0.75 * a})`;
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// A subtle blue tint upstream of the bottleneck cross-section, growing with
// pressure. Reads as the water "pooling up" behind a dam that's holding
// back flow. Rotated to match the local stream direction so the pool sits
// behind the actual dam, wherever in the stream the player built it.
function drawUpstreamPool(ctx, pressure, bottleneck) {
  // Match the backup gate in water.js — water doesn't visibly pool until
  // the dam is mostly sealed.
  if (pressure <= 0.55 || !bottleneck) return;
  const p = Math.min(1, (pressure - 0.55) / 0.45);
  ctx.save();
  // Clip to the stream silhouette so the tint never bleeds onto the banks.
  const path = STREAM.path;
  ctx.beginPath();
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    if (i === 0) ctx.moveTo(a.x - a.w / 2, a.y);
    else ctx.lineTo(a.x - a.w / 2, a.y);
  }
  for (let i = path.length - 1; i >= 0; i--) {
    const a = path[i];
    ctx.lineTo(a.x + a.w / 2, a.y);
  }
  ctx.closePath();
  ctx.clip();

  // Local frame at the bottleneck: +x is downstream, -x is upstream.
  ctx.translate(bottleneck.cx, bottleneck.cy);
  ctx.rotate(Math.atan2(bottleneck.ty, bottleneck.tx));

  const grad = ctx.createLinearGradient(-220, 0, 12, 0);
  grad.addColorStop(0, `rgba(15,55,85,0)`);
  grad.addColorStop(1, `rgba(15,55,85,${0.45 * p})`);
  ctx.fillStyle = grad;
  ctx.fillRect(-3000, -3000, 3012, 6000);

  // Glossy crest right along the dam cross-section.
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = `rgba(180,220,240,${0.12 * p})`;
  ctx.fillRect(-3, -3000, 6, 6000);
  ctx.restore();
}

function drawGapRush(ctx, cx, cy, width, strength, t) {
  // Fast turbulent flow squeezing through a gap in a backed-up dam — a
  // sluice/venturi, not a fall. The stream surface stays roughly level on
  // either side; the gap just accelerates the water passing through it.
  // strength 0..1 scales how visibly bunched & frothy the rush is; width is
  // the geometric gap.
  const tan = streamTangentAt(cx, cy);
  const angle = Math.atan2(tan.dy, tan.dx);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle - Math.PI / 2); // local +y is downstream

  const s = Math.max(0.18, strength);
  const w = Math.max(14, width * (0.42 + 0.38 * s));
  const len = 95;       // visible downstream extent of the rush
  const upstream = 22;  // small accelerating zone just before the gap

  // Soft accelerated band, brightest at the throat and tapering off
  // downstream so it doesn't read as a discrete sheet of water.
  const grd = ctx.createLinearGradient(0, -upstream, 0, len);
  grd.addColorStop(0,    `rgba(200,225,240,${0.12 * s})`);
  grd.addColorStop(0.25, `rgba(230,245,255,${0.30 * s})`);
  grd.addColorStop(1,    "rgba(255,255,255,0)");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(-w / 2 - 2, -upstream);
  ctx.quadraticCurveTo(0, -upstream * 0.4, w / 2 + 2, -upstream);
  ctx.lineTo(w / 2 + 7, len);
  ctx.lineTo(-w / 2 - 7, len);
  ctx.closePath();
  ctx.fill();

  // Streaks moving downstream — fast enough to read as accelerated flow
  // rather than the slow drift on either side.
  const seed = Math.floor(cx * 0.5);
  const streakCount = Math.max(3, Math.round(w / 9));
  for (let i = 0; i < streakCount; i++) {
    const xn = (i + 0.5) / streakCount;
    const sx = -w / 2 + xn * w + Math.sin(t * 2 + i) * 0.6;
    const speed = 1.6 + ((i * 7 + seed) % 9) * 0.1;
    const phase = ((t * speed + i * 0.27 + seed * 0.013) % 1);
    const segLen = 24 + ((i * 5 + seed) % 18);
    const sy = -upstream + phase * (len - segLen + upstream);
    const a = 0.5 * s * (1 - phase * 0.6);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(sx - 0.6, sy, 1.2, segLen);
  }

  // Foam fringes along the shear lines where the rush meets the dam pieces
  // on either side — sells "squeezing past stones" rather than "going over".
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const phase = ((t * 1.4 + i * 0.31 + seed * 0.011 + (side > 0 ? 0.5 : 0)) % 1);
      const fy = -4 + phase * len;
      const fx = side * (w / 2 + 1 + Math.sin(t * 3 + i + side) * 1.2);
      const a = 0.55 * s * (1 - phase) * (1 - phase);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawEddies(ctx, state) {
  if (!state.eddies?.length) return;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (const e of state.eddies) {
    const a = 1 - e.age / 1.4;
    ctx.globalAlpha = Math.max(0, a) * 0.6;
    ctx.beginPath();
    ctx.arc(e.x, e.y, 1.2 + 1.8 * a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRipples(ctx, state, assets) {
  if (!state.ripples?.length) return;
  const a = assets?.dropRipple;
  ctx.save();
  for (const r of state.ripples) {
    const k = Math.min(0.9999, r.age / r.life);
    const fadeIn = Math.min(1, r.age / 0.08);
    const fadeOut = 1 - Math.max(0, (k - 0.7) / 0.3);
    const alpha = Math.max(0, Math.min(1, fadeIn * fadeOut));
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    if (a && a.loaded) {
      const frames = a.frames || 6;
      const fs = a.frameSize || 128;
      const fi = Math.min(frames - 1, Math.floor(k * frames));
      const size = r.radius * 2;
      ctx.drawImage(
        a.image,
        fi * fs, 0, fs, fs,
        r.x - size / 2, r.y - size / 2, size, size
      );
    } else {
      ctx.strokeStyle = "rgba(230,245,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.radius * (0.3 + k * 0.9), r.radius * 0.55 * (0.3 + k * 0.9), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Procedural currents around each stationary stone or stick: a bow cushion
// hugging the upstream face plus streamlines that bulge outward as they
// pass the obstacle. The streaks scroll downstream so the eye reads "water
// flowing past this rock" rather than decoration on it.
function drawStoneCurrents(ctx, state) {
  for (const p of state.placed) {
    if (p.flowing) continue;
    if (p.type !== "pebble" && p.type !== "stick") continue;
    if (!isInStream(p.x, p.y)) continue;
    drawCurrentsForPiece(ctx, p, state.t, state.placed);
  }
}

function drawCurrentsForPiece(ctx, p, t, placed) {
  const def = PIECE_TYPES[p.type];
  const tan = streamTangentAt(p.x, p.y);
  const angle = Math.atan2(tan.dy, tan.dx);

  // Project the piece's body onto the local flow frame. A stick aligned with
  // the current has a tiny cross-section and barely deflects flow; a stick
  // perpendicular to it carves a much wider bow wave.
  let crossHalf, alongHalf;
  if (p.type === "stick") {
    const rc = Math.cos(p.rot ?? 0);
    const rs = Math.sin(p.rot ?? 0);
    const nxw = -tan.dy, nyw = tan.dx;
    const longTan  = rc * tan.dx + rs * tan.dy;
    const longNorm = rc * nxw    + rs * nyw;
    const shortTan  = -rs * tan.dx + rc * tan.dy;
    const shortNorm = -rs * nxw    + rc * nyw;
    crossHalf = Math.abs(def.w / 2 * longNorm) + Math.abs(def.h / 2 * shortNorm);
    alongHalf = Math.abs(def.w / 2 * longTan)  + Math.abs(def.h / 2 * shortTan);
  } else {
    crossHalf = def.w / 2;
    alongHalf = def.h / 2;
  }
  crossHalf = Math.max(crossHalf, 14);
  alongHalf = Math.max(alongHalf, 14);

  // Per-piece phase so neighbouring stones don't pulse in lockstep.
  const seed = Math.floor(p.x * 0.13 + p.y * 0.07);

  // If another piece is sitting right against the upstream face, the bow
  // shouldn't double up — the neighbour is already deflecting that water.
  const exposure = bowExposure(p, placed, alongHalf, tan);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  if (exposure > 0.02) drawBowCushion(ctx, alongHalf, crossHalf, t, seed, exposure);
  drawStreamlines(ctx, p, tan, alongHalf, crossHalf, t, seed);
  ctx.restore();
}

// 1 if the upstream face is in open water, falling to 0 as another piece
// crowds it. Suppresses overlapping bow cushions on a stick wedged between
// two stones, etc.
function bowExposure(piece, placed, alongHalf, tan) {
  const bx = piece.x - tan.dx * (alongHalf + 4);
  const by = piece.y - tan.dy * (alongHalf + 4);
  let exposure = 1;
  for (const q of placed) {
    if (q === piece || q.flowing) continue;
    const qdef = PIECE_TYPES[q.type];
    if (!qdef) continue;
    const r = Math.max(qdef.w, qdef.h) / 2;
    const d = Math.hypot(bx - q.x, by - q.y);
    if (d < r) return 0;
    if (d < r + 28) exposure = Math.min(exposure, (d - r) / 28);
  }
  return exposure;
}

function drawBowCushion(ctx, alongHalf, crossHalf, t, seed, exposure) {
  const pulse = 0.6 + 0.3 * Math.sin(t * 1.6 + seed * 0.1);
  const k = pulse * exposure;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(210, 235, 255, ${0.18 * k})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-alongHalf - 2, -crossHalf * 0.85);
  ctx.quadraticCurveTo(-alongHalf - 9, 0, -alongHalf - 2, crossHalf * 0.85);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.14 * k})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-alongHalf - 0.5, -crossHalf * 0.6);
  ctx.quadraticCurveTo(-alongHalf - 5, 0, -alongHalf - 0.5, crossHalf * 0.6);
  ctx.stroke();
  ctx.restore();
}

function drawStreamlines(ctx, piece, tan, alongHalf, crossHalf, t, seed) {
  // Gaussian deflection: streaklines bulge outward most at the obstacle and
  // relax back to straight lines well upstream / downstream. sigma controls
  // how concentrated the disturbance is along the flow.
  const sigma = Math.max(crossHalf, 22);
  const xStart = -alongHalf - sigma * 1.3;
  const xEnd   =  alongHalf + sigma * 2.4;
  const range  = xEnd - xStart;
  const nxw = -tan.dy, nyw = tan.dx;

  // Each band is one lateral offset; closer-in lines bulge more. Counts are
  // intentionally sparse — the per-streak slow blink below means only a
  // subset is visible at any moment.
  const bands = [
    { y0: crossHalf * 1.05, D: crossHalf * 0.55, count: 2, alpha: 0.36 },
    { y0: crossHalf * 1.50, D: crossHalf * 0.35, count: 2, alpha: 0.26 },
    { y0: crossHalf * 2.05, D: crossHalf * 0.20, count: 1, alpha: 0.18 },
  ];

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const band of bands) {
    for (const side of [-1, 1]) {
      const y0 = side * band.y0;
      const D  = side * band.D;
      for (let i = 0; i < band.count; i++) {
        const phase = (i + 0.5) / band.count + seed * 0.0173 + (side > 0 ? 0.5 : 0);
        const speed = 0.42;
        const u = ((t * speed + phase) % 1 + 1) % 1;
        const x = xStart + u * range;
        const fall = Math.exp(-(x * x) / (sigma * sigma));
        const y = y0 + D * fall;
        // dy/dx of the streamline, used to orient the streak along its path.
        const dy = D * (-2 * x / (sigma * sigma)) * fall;
        const segAngle = Math.atan2(dy, 1);
        // Fade in at entry, out at exit, so streaks materialize/dissolve
        // rather than popping at the edges of their travel.
        const fade = Math.sin(u * Math.PI);
        // Slow per-streak blink so only some streaks are visible at any
        // moment — the population breathes instead of running constant.
        const blink = Math.max(0, Math.sin(t * 0.55 + phase * 6.283 + seed * 0.07));
        const alpha = band.alpha * fade * blink;
        if (alpha < 0.03) continue;
        // Skip streaks whose world position is on the bank — currents
        // shouldn't sparkle on dry ground next to a stone near the edge.
        const wx = piece.x + tan.dx * x + nxw * y;
        const wy = piece.y + tan.dy * x + nyw * y;
        if (!isInStream(wx, wy)) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(segAngle);
        const len = 14;
        const grd = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
        grd.addColorStop(0,   "rgba(235,245,255,0)");
        grd.addColorStop(0.5, `rgba(235,245,255,${alpha})`);
        grd.addColorStop(1,   "rgba(235,245,255,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(-len / 2, -0.7, len, 1.4);
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

function drawSurges(ctx, state, assets) {
  if (!state.surges?.length) return;
  const sheet = assets?.surgeSheet;
  ctx.save();
  for (const s of state.surges) {
    const k = s.age / s.life;
    if (k >= 1) continue;
    const angle = Math.atan2(s.dy, s.dx);
    // Sprite is laid out left-to-right; the bright origin sits ~22% from the
    // left edge. Anchor that point on the burst location so the streak appears
    // to emerge from the gap and rush downstream.
    const size = 150;
    const anchorFrac = 0.22;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(angle);
    // Slight ease-out fade; full alpha across most of life, then drop.
    ctx.globalAlpha = Math.min(1, (1 - k) * 1.6);
    if (sheet && sheet.loaded) {
      const frames = sheet.frames || 8;
      const fs = sheet.frameSize || 192;
      const fi = Math.min(frames - 1, Math.floor(k * frames));
      ctx.drawImage(
        sheet.image,
        fi * fs, 0, fs, fs,
        -size * anchorFrac, -size / 2, size, size
      );
    } else {
      // Procedural fallback: a tapered streak along +x.
      const len = size * 0.9 * (0.4 + 0.8 * (1 - Math.abs(k - 0.4)));
      const grd = ctx.createLinearGradient(0, 0, len, 0);
      grd.addColorStop(0, "rgba(255,255,255,0.9)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, -4, len, 8);
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawSplashes(ctx, state, assets) {
  if (!state.splashes?.length) return;
  const sheet = assets?.splashSheet;
  ctx.save();
  for (const s of state.splashes) {
    const k = s.age / s.life;
    if (k >= 1) continue;
    if (sheet && sheet.loaded) {
      const frames = sheet.frames || 8;
      const fs = sheet.frameSize || 128;
      const fi = Math.min(frames - 1, Math.floor(k * frames));
      const size = s.big ? 160 : 70;
      ctx.globalAlpha = Math.min(1, (1 - k) * 1.4);
      ctx.drawImage(
        sheet.image,
        fi * fs, 0, fs, fs,
        s.x - size / 2, s.y - size * 0.85, size, size
      );
    } else {
      const r = (s.big ? 22 : 6) * (0.4 + 0.9 * k);
      ctx.globalAlpha = (1 - k) * (s.big ? 0.85 : 0.7);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(s.x, s.y - k * (s.big ? 30 : 14), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------- UI ----------

function drawTooltip(ctx, state, assets) {
  const x = 720, y = 120;
  ctx.save();
  if (assets.tooltipBubble.loaded) {
    ctx.drawImage(assets.tooltipBubble.image, x - 200, y - 50, 400, 100);
  } else {
    ctx.fillStyle = "rgba(40,30,20,0.92)";
    roundRect(ctx, x - 200, y - 50, 400, 100, 16);
    ctx.fill();
  }
  ctx.fillStyle = "#f7eed7";
  ctx.font = "26px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Drag stones and sticks", x, y - 12);
  ctx.fillText("from the bank into the stream…", x, y + 18);
  ctx.restore();
}

// ---------- helpers ----------

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}
