// Tiny "water" model. We don't simulate fluid — we sample the dam line and
// compute openings (gaps between placed pieces). Each opening becomes a
// little waterfall that pours through the dam, matching the look of the
// reference screenshot.

import { BUILD_LINE, PIECE_TYPES, buildLineSnap } from "./state.js";

const GAP_RESOLUTION = 32; // sample columns across the build line

export function computeWaterfalls(placed) {
  // Build a coverage array along the dam, marking which segments are blocked.
  const x0 = BUILD_LINE.xLeft;
  const x1 = BUILD_LINE.xRight;
  const cols = GAP_RESOLUTION;
  const colWidth = (x1 - x0) / cols;
  const covered = new Array(cols).fill(0);

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
      // pieces near the centre of their span block more
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
