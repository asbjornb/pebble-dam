// Tiny rest/lean pass for pieces that land on the dam. Pieces stop overlapping
// each other and tilt against whatever's holding them up. Not a real rigid-
// body sim — just enough for stacks of pebbles, sticks bridging two stones,
// and leaves draping over the rest.

import { PIECE_TYPES, BUILD_LINE, buildLineSnap } from "./state.js";

const STACK_STEPS = 20;
const TOUCH_SLACK = 4;

const BUILD_LINE_SLOPE = Math.atan2(
  BUILD_LINE.yRight - BUILD_LINE.yLeft,
  BUILD_LINE.xRight - BUILD_LINE.xLeft,
);

const MAX_TILT = {
  stick: 0.55,
  pebble: 0.22,
  leaf: 0.9,
};

// Resolve a piece against the existing dam: push it upstream (smaller y) until
// it stops overlapping anything, then tilt it toward whatever's supporting it.
// Mutates piece.x/y/rot in place. No-op for free-floating placements far from
// the dam line.
export function settlePiece(piece, placed) {
  const def = PIECE_TYPES[piece.type];
  if (!def) return;

  const lineY = buildLineSnap(piece.x);
  if (Math.abs(piece.y - lineY) > 90) return;

  for (let step = 0; step < STACK_STEPS; step++) {
    let mostOverlap = 0;
    for (const q of placed) {
      if (q === piece || q.flowing) continue;
      const qdef = PIECE_TYPES[q.type];
      if (!qdef) continue;
      const dx = piece.x - q.x;
      const dy = piece.y - q.y;
      const rx = (def.w + qdef.w) / 2 - TOUCH_SLACK;
      const ry = (def.h + qdef.h) / 2 - TOUCH_SLACK;
      if (Math.abs(dx) < rx && Math.abs(dy) < ry) {
        const overlapY = ry - Math.abs(dy);
        if (overlapY > mostOverlap) mostOverlap = overlapY;
      }
    }
    if (mostOverlap <= 0.5) break;
    piece.y -= mostOverlap + 0.5;
  }

  let supporter = null;
  let bestDy = -Infinity;
  for (const q of placed) {
    if (q === piece || q.flowing) continue;
    const qdef = PIECE_TYPES[q.type];
    if (!qdef) continue;
    const dx = piece.x - q.x;
    const dy = piece.y - q.y;
    const rx = (def.w + qdef.w) / 2;
    const ry = (def.h + qdef.h) / 2 + 6;
    if (Math.abs(dx) < rx && dy < 0 && dy > -ry) {
      if (dy > bestDy) { bestDy = dy; supporter = q; }
    }
  }

  const cap = MAX_TILT[piece.type] ?? 0.3;
  if (supporter) {
    const sdef = PIECE_TYPES[supporter.type];
    const off = (piece.x - supporter.x) / Math.max(1, sdef.w * 0.5);
    const lean = Math.max(-1, Math.min(1, off)) * cap;
    if (piece.type === "leaf") {
      piece.rot = (piece.rot ?? 0) * 0.5 + lean * 0.6;
    } else {
      piece.rot = lean;
    }
  } else if (piece.type === "stick") {
    piece.rot = BUILD_LINE_SLOPE;
  } else if (piece.type === "pebble") {
    piece.rot = (piece.rot ?? 0) * 0.4;
  }
}
