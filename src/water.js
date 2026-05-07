// Tiny "water" model. We don't simulate fluid — we sample the dam line and
// compute openings (gaps between placed pieces). Each opening becomes a
// little waterfall that pours through the dam, matching the look of the
// reference screenshot.

import {
  W, H,
  BUILD_LINE,
  PIECE_TYPES,
  buildLineSnap,
  isInStream,
  streamTangentAt,
} from "./state.js";

const GAP_RESOLUTION = 32; // sample columns across the build line

export function computeWaterfalls(placed) {
  // Build a coverage array along the dam, marking which segments are blocked.
  const x0 = BUILD_LINE.xLeft;
  const x1 = BUILD_LINE.xRight;
  const cols = GAP_RESOLUTION;
  const colWidth = (x1 - x0) / cols;
  const covered = new Array(cols).fill(0);

  // Mark columns that don't actually cross the stream as "land" so they
  // never count as openings — otherwise we'd render waterfalls over grass.
  for (let c = 0; c < cols; c++) {
    const cx = x0 + (c + 0.5) * colWidth;
    const cy = buildLineSnap(cx);
    if (!isInStream(cx, cy)) covered[c] = -1;
  }

  for (const p of placed) {
    const def = PIECE_TYPES[p.type];
    if (!def) continue;
    const halfW = def.w / 2;
    // ignore pieces that aren't actually on the dam line
    const lineY = buildLineSnap(p.x);
    if (Math.abs(p.y - lineY) > 60) continue;
    const left = p.x - halfW;
    const right = p.x + halfW;
    const startCol = Math.floor((left - x0) / colWidth);
    const endCol = Math.ceil((right - x0) / colWidth);
    for (let c = Math.max(0, startCol); c < Math.min(cols, endCol); c++) {
      if (covered[c] === -1) continue; // already marked as land
      covered[c] += 1;
    }
  }

  // Collapse runs of uncovered columns into waterfalls.
  const falls = [];
  let runStart = -1;
  for (let c = 0; c <= cols; c++) {
    const open = c < cols && covered[c] === 0;
    if (open && runStart === -1) runStart = c;
    if (!open && runStart !== -1) {
      const cx0 = x0 + runStart * colWidth;
      const cx1 = x0 + c * colWidth;
      const cx = (cx0 + cx1) / 2;
      const cy = buildLineSnap(cx);
      falls.push({
        x: cx,
        y: cy,
        width: cx1 - cx0,
      });
      runStart = -1;
    }
  }
  return falls;
}

export function isDamComplete(placed) {
  return computeWaterfalls(placed).length === 0;
}

// Per-frame drift for sticks/leaves dropped into open water (not on the dam).
// Pieces follow the stream tangent until they collide with a stationary piece
// or leave the canvas.
const FLOW_SPEED = 110; // px/sec
const OFFSCREEN_PAD = 80;

export function updateFlow(state, dt) {
  const placed = state.placed;
  for (let i = placed.length - 1; i >= 0; i--) {
    const p = placed[i];
    if (!p.flowing) continue;

    const tan = streamTangentAt(p.x, p.y);
    p.x += tan.dx * FLOW_SPEED * dt;
    p.y += tan.dy * FLOW_SPEED * dt;
    // gentle wobble so leaves don't look mechanical
    p.rot = (p.rot ?? 0) + (p.type === "leaf" ? 0.4 : 0.15) * dt;

    if (
      p.x < -OFFSCREEN_PAD || p.x > W + OFFSCREEN_PAD ||
      p.y < -OFFSCREEN_PAD || p.y > H + OFFSCREEN_PAD
    ) {
      placed.splice(i, 1);
      continue;
    }

    // collide with any stationary piece — stick to it
    for (const q of placed) {
      if (q === p || q.flowing) continue;
      const defp = PIECE_TYPES[p.type];
      const defq = PIECE_TYPES[q.type];
      const rx = (defp.w + defq.w) * 0.32;
      const ry = (defp.h + defq.h) * 0.32;
      const dx = p.x - q.x, dy = p.y - q.y;
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) < 1) {
        p.flowing = false;
        break;
      }
    }
  }
}
