// Renders the world. Uses real images when assets are available; otherwise
// falls back to procedural shapes so the game is playable without art.

import { W, H, STREAM, BUILD_LINE, PIECE_TYPES, streamTangentAt } from "./state.js";
import { computeDamState } from "./water.js";

export function render(ctx, state, assets) {
  ctx.clearRect(0, 0, W, H);

  // Background scene (banks, foliage, stream bed).
  if (assets.background.loaded) {
    ctx.drawImage(assets.background.image, 0, 0, W, H);
  } else {
    drawProceduralBackground(ctx, state.t);
  }

  // Animated water overlay (subtle ripple) on top of stream bed if no
  // pre-rendered background — otherwise we still draw light highlights on
  // top of the painted background so the stream looks alive.
  drawWaterEffects(ctx, state);

  // Dam pieces in placement order.
  for (const p of state.placed) {
    drawPiece(ctx, p, assets);
  }

  // Drop ripples sit above pieces so the rings read as water displaced
  // around the stone, not hidden beneath it.
  drawRipples(ctx, state, assets);

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
    drawDropIndicator(ctx, state);
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

// ---------- drop indicator ----------

function drawDropIndicator(ctx, state) {
  const d = state.drag;
  if (!d.snap) return;
  ctx.save();
  ctx.translate(d.snap.x, d.snap.y);
  ctx.rotate(d.snap.rot ?? 0);
  const def = PIECE_TYPES[d.type];
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  roundRect(ctx, -def.w / 2 - 4, -def.h / 2 - 4, def.w + 8, def.h + 8, 8);
  ctx.stroke();
  ctx.restore();
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

function drawWaterEffects(ctx, state) {
  const dam = computeDamState(state.placed);
  drawUpstreamPool(ctx, state.pressure ?? 0);
  drawObstacleFlow(ctx, state);
  drawLateralRuns(ctx, dam.lateral, state.t, state.pressure ?? 0);
  for (const j of dam.jets) {
    drawGapRush(ctx, j.x, j.y, j.width, j.strength, state.t);
  }
  drawEddies(ctx, state);
  drawSplashes(ctx, state);
}

// Bow waves and trailing wakes for stationary pieces in the stream. This is
// what reads as "water flowing around things" before the dam is sealed —
// without it a half-built dam looks like inert rocks sitting in still water.
function drawObstacleFlow(ctx, state) {
  ctx.save();
  for (const p of state.placed) {
    if (p.flowing) continue;
    if (p.type !== "pebble" && p.type !== "stick") continue;
    const def = PIECE_TYPES[p.type];
    const tan = streamTangentAt(p.x, p.y);
    const nx = -tan.dy, ny = tan.dx;
    const halfW = def.w / 2;

    // Bow wave: thin bright crescent on the upstream face.
    const bx = p.x - tan.dx * (halfW + 1);
    const by = p.y - tan.dy * (halfW + 1);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(Math.atan2(tan.dy, tan.dx));
    ctx.strokeStyle = "rgba(255,255,255,0.42)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, halfW * 0.95, Math.PI * 0.6, Math.PI * 1.4);
    ctx.stroke();
    ctx.restore();

    // Wake streaks: two curving lines fanning slightly outward downstream.
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.3;
    const wakeLen = 55 + halfW;
    for (const side of [-1, 1]) {
      const sx = p.x + tan.dx * (halfW * 0.4) + nx * side * halfW * 0.7;
      const sy = p.y + tan.dy * (halfW * 0.4) + ny * side * halfW * 0.7;
      const cx = sx + tan.dx * wakeLen * 0.55 + nx * side * 10;
      const cy = sy + tan.dy * wakeLen * 0.55 + ny * side * 10;
      const ex = sx + tan.dx * wakeLen + nx * side * 3;
      const ey = sy + tan.dy * wakeLen + ny * side * 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Animated streaks moving along the dam top toward the nearest gap. This is
// what shows the player that a sealed stretch isn't actually holding water —
// it's just shoving the flow sideways.
function drawLateralRuns(ctx, runs, t, pressure) {
  if (!runs?.length) return;
  const intensity = Math.min(1, 0.4 + pressure * 1.2);
  ctx.save();
  for (const r of runs) {
    const w = r.x1 - r.x0;
    if (w < 14) continue;
    const yLine = r.y;
    const a = r.strength * intensity;
    ctx.fillStyle = `rgba(170,210,235,${0.18 * a})`;
    ctx.fillRect(r.x0, yLine - 16, w, 5);
    ctx.fillStyle = `rgba(255,255,255,${0.55 * a})`;
    const streakLen = Math.min(28, w * 0.35);
    const streakCount = Math.max(2, Math.floor(w / 38));
    for (let i = 0; i < streakCount; i++) {
      const phase = ((t * 0.9 + i / streakCount) % 1);
      const sx = r.dir > 0 ? r.x0 + phase * w : r.x1 - phase * w;
      const fade = Math.sin(phase * Math.PI);
      ctx.globalAlpha = 0.55 * a * fade;
      ctx.fillRect(sx - streakLen / 2, yLine - 13, streakLen, 2);
    }
    ctx.globalAlpha = 1;
    const ax = r.dir > 0 ? r.x1 - 4 : r.x0 + 4;
    const ay = yLine - 11;
    ctx.beginPath();
    ctx.moveTo(ax, ay - 5);
    ctx.lineTo(ax + 8 * r.dir, ay);
    ctx.lineTo(ax, ay + 5);
    ctx.closePath();
    ctx.fillStyle = `rgba(220,240,255,${0.75 * a})`;
    ctx.fill();
  }
  ctx.restore();
}

// A subtle blue tint above the build line, growing with pressure. Reads as
// the water "pooling up" behind a dam that's holding back flow.
function drawUpstreamPool(ctx, pressure) {
  // Match the backup gate in water.js — water doesn't visibly pool until
  // the dam is mostly sealed.
  if (pressure <= 0.55) return;
  const p = Math.min(1, (pressure - 0.55) / 0.45);
  ctx.save();
  // Build a clip path of the upstream half of the stream.
  const path = STREAM.path;
  ctx.beginPath();
  // left bank then back along right bank (only points whose y < damLine)
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

  // Cut to the area above the dam line.
  const damY = (BUILD_LINE.yLeft + BUILD_LINE.yRight) / 2;
  const grad = ctx.createLinearGradient(0, damY - 220, 0, damY + 12);
  grad.addColorStop(0, `rgba(15,55,85,0)`);
  grad.addColorStop(1, `rgba(15,55,85,${0.45 * p})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, damY + 12);

  // Water rises along the dam edge — render a glossy crest right at the
  // line so the eye reads "the dam is holding".
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = `rgba(180,220,240,${0.12 * p})`;
  ctx.fillRect(0, damY - 6, W, 6);
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

function drawSplashes(ctx, state) {
  if (!state.splashes?.length) return;
  ctx.save();
  for (const s of state.splashes) {
    const k = s.age / s.life;
    if (k >= 1) continue;
    const r = (s.big ? 22 : 6) * (0.4 + 0.9 * k);
    ctx.globalAlpha = (1 - k) * (s.big ? 0.85 : 0.7);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(s.x, s.y - k * (s.big ? 30 : 14), r, 0, Math.PI * 2);
    ctx.fill();
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
