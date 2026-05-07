// Renders the world. Uses real images when assets are available; otherwise
// falls back to procedural shapes so the game is playable without art.

import { W, H, STREAM, BUILD_LINE, PIECE_TYPES, buildLineSnap } from "./state.js";
import { computeWaterfalls } from "./water.js";

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
  // top of the painted background so waterfalls look alive.
  drawWaterEffects(ctx, state);

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
    drawDropIndicator(ctx, state);
  }

  // UI: palette, tooltip.
  drawPalette(ctx, state, assets);
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
  ctx.strokeStyle = d.snap.valid ? "rgba(255,255,255,0.9)" : "rgba(255,80,80,0.9)";
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

// ---------- water effects (waterfalls + foam) ----------

function drawWaterEffects(ctx, state) {
  const falls = computeWaterfalls(state.placed);
  for (const f of falls) {
    drawWaterfall(ctx, f.x, f.y, f.width, state.t);
  }
}

function drawWaterfall(ctx, cx, cy, width, t) {
  ctx.save();
  ctx.translate(cx, cy);
  // streaks
  const grd = ctx.createLinearGradient(0, 0, 0, 140);
  grd.addColorStop(0, "rgba(255,255,255,0.85)");
  grd.addColorStop(1, "rgba(255,255,255,0.05)");
  ctx.fillStyle = grd;
  const w = Math.max(20, width * 0.55);
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.quadraticCurveTo(0, 30, w / 2, 0);
  ctx.lineTo(w / 2 + 6, 130);
  ctx.quadraticCurveTo(0, 170, -w / 2 - 6, 130);
  ctx.closePath();
  ctx.fill();

  // moving foam dots at the bottom
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  const seed = Math.floor(cx);
  for (let i = 0; i < 10; i++) {
    const phase = (t * 1.5 + (i * 0.37 + seed * 0.013)) % 1;
    const y = 140 - phase * 18;
    const x = ((i * 13 + seed) % w) - w / 2 + Math.sin(t * 2 + i) * 4;
    ctx.beginPath();
    ctx.arc(x, y, 3 + (1 - phase) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- UI ----------

function drawPalette(ctx, state, assets) {
  const x = 60, y = H - 170, w = 420, h = 130;
  if (assets.paletteBar.loaded) {
    ctx.drawImage(assets.paletteBar.image, x, y, w, h);
  } else {
    ctx.save();
    ctx.fillStyle = "#e6d4a6";
    roundRect(ctx, x, y, w, h, 22);
    ctx.fill();
    ctx.strokeStyle = "#9a7a48";
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 6]);
    roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 18);
    ctx.stroke();
    ctx.restore();
  }
  // slots
  const slotW = 110, slotH = 90;
  const startX = x + 30, slotY = y + (h - slotH) / 2;
  for (let i = 0; i < state.palette.length; i++) {
    const slotX = startX + i * (slotW + 18);
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    roundRect(ctx, slotX, slotY, slotW, slotH, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const type = state.palette[i].id;
    const def = PIECE_TYPES[type];
    const cx = slotX + slotW / 2, cy = slotY + slotH / 2;
    const iconKey = "icon" + type[0].toUpperCase() + type.slice(1);
    const a = assets[iconKey];
    if (a && a.loaded) {
      ctx.drawImage(a.image, cx - slotW / 2 + 10, cy - slotH / 2 + 10, slotW - 20, slotH - 20);
    } else {
      ctx.save();
      ctx.translate(cx, cy);
      const scale = Math.min((slotW - 24) / def.w, (slotH - 24) / def.h);
      ctx.scale(scale, scale);
      drawProceduralPiece(ctx, type, def);
      ctx.restore();
    }
  }

  // remember slot rects on state for input.
  state._paletteSlots = state.palette.map((p, i) => ({
    type: p.id,
    x: startX + i * (slotW + 18),
    y: slotY,
    w: slotW,
    h: slotH,
  }));
}

function drawTooltip(ctx, state, assets) {
  const x = 720, y = 120;
  ctx.save();
  if (assets.tooltipBubble.loaded) {
    ctx.drawImage(assets.tooltipBubble.image, x - 160, y - 50, 320, 100);
  } else {
    ctx.fillStyle = "rgba(40,30,20,0.92)";
    roundRect(ctx, x - 160, y - 50, 320, 100, 16);
    ctx.fill();
  }
  ctx.fillStyle = "#f7eed7";
  ctx.font = "26px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Place pieces into", x, y - 12);
  ctx.fillText("the stream…", x, y + 18);
  // arrow
  ctx.strokeStyle = "#f7eed7";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y + 50);
  ctx.lineTo(x, y + 90);
  ctx.moveTo(x - 8, y + 80);
  ctx.lineTo(x, y + 90);
  ctx.lineTo(x + 8, y + 80);
  ctx.stroke();
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
