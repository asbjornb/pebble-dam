// Tiny rest/lean pass for pieces that land on top of others. Pieces stop
// overlapping each other and tilt against whatever's holding them up. Not a
// real rigid-body sim — just enough for stacks of pebbles, sticks bridging
// two stones, and leaves draping over the rest.

import { PIECE_TYPES, streamTangentAt } from "./state.js";

const STACK_STEPS = 20;
const TOUCH_SLACK = 4;

const MAX_TILT = {
  stick: 0.55,
  pebble: 0.22,
  leaf: 0.9,
};

// Push a piece upstream until it stops overlapping any non-flowing neighbour,
// then tilt it toward whatever's supporting it from downstream.
export function settlePiece(piece, placed) {
  const def = PIECE_TYPES[piece.type];
  if (!def) return;

  const tan = streamTangentAt(piece.x, piece.y);

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
        const overlap = Math.min(rx - Math.abs(dx), ry - Math.abs(dy));
        if (overlap > mostOverlap) mostOverlap = overlap;
      }
    }
    if (mostOverlap <= 0.5) break;
    // Push upstream (against the local flow direction) so stacks lean
    // against the dam from the upstream side.
    piece.x -= tan.dx * (mostOverlap + 0.5);
    piece.y -= tan.dy * (mostOverlap + 0.5);
  }

  // Find a supporter: the closest non-flowing piece downstream of us
  // (positive component along the tangent from piece -> q).
  let supporter = null;
  let bestAlong = Infinity;
  for (const q of placed) {
    if (q === piece || q.flowing) continue;
    const qdef = PIECE_TYPES[q.type];
    if (!qdef) continue;
    const dx = q.x - piece.x;
    const dy = q.y - piece.y;
    const along = dx * tan.dx + dy * tan.dy;
    const range = (def.w + qdef.w) / 2 + 6;
    if (along <= 0 || along > range) continue;
    if (Math.hypot(dx, dy) > range) continue;
    if (along < bestAlong) { bestAlong = along; supporter = q; }
  }

  const cap = MAX_TILT[piece.type] ?? 0.3;
  if (supporter) {
    const sdef = PIECE_TYPES[supporter.type];
    const dx = piece.x - supporter.x;
    const dy = piece.y - supporter.y;
    // Cross-flow offset: how far across the stream we are from the supporter.
    const perp = dx * (-tan.dy) + dy * tan.dx;
    const off = perp / Math.max(1, sdef.w * 0.5);
    const lean = Math.max(-1, Math.min(1, off)) * cap;
    if (piece.type === "leaf") {
      piece.rot = (piece.rot ?? 0) * 0.5 + lean * 0.6;
    } else {
      piece.rot = lean;
    }
  } else if (piece.type === "stick") {
    // Resting stick lies across the flow so it can bridge between supports.
    piece.rot = Math.atan2(tan.dx, -tan.dy);
  } else if (piece.type === "pebble") {
    piece.rot = (piece.rot ?? 0) * 0.4;
  }
}
