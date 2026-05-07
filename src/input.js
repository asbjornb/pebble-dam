// Pointer input: pick up pieces (ground items, placed dam pieces, or
// drifters floating past) and drop them somewhere new.

import { W, H, PIECE_TYPES, isInStream } from "./state.js";
import { settlePiece } from "./physics.js";

let canvas, state;

export function attachInput(_canvas, _state) {
  canvas = _canvas;
  state = _state;

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
}

function toLogical(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W;
  const y = ((e.clientY - rect.top) / rect.height) * H;
  return { x, y };
}

function onDown(e) {
  const { x, y } = toLogical(e);
  state.showHint = false;

  for (let i = state.placed.length - 1; i >= 0; i--) {
    const p = state.placed[i];
    const def = PIECE_TYPES[p.type];
    if (Math.abs(x - p.x) <= def.w / 2 && Math.abs(y - p.y) <= def.h / 2) {
      state.drag = {
        type: p.type,
        sourceId: p.id,
        x, y,
        offsetX: x - p.x,
        offsetY: y - p.y,
        rot: p.rot ?? 0,
      };
      state.placed.splice(i, 1);
      canvas.setPointerCapture(e.pointerId);
      return;
    }
  }
}

function onMove(e) {
  if (!state.drag) return;
  const { x, y } = toLogical(e);
  state.drag.x = x;
  state.drag.y = y;
}

function onUp(e) {
  if (!state.drag) return;
  const d = state.drag;
  const piece = {
    id: "p-" + Math.random().toString(36).slice(2, 8),
    type: d.type,
    x: d.x, y: d.y, rot: d.rot ?? 0,
    flowing: false,
  };
  if (isInStream(d.x, d.y) && shouldFlow(d.type, d.x, d.y, state.placed)) {
    piece.flowing = true;
  } else {
    settlePiece(piece, state.placed);
  }
  state.placed.push(piece);
  spawnDropRipple(state, piece);
  state.drag = null;
}

function spawnDropRipple(state, piece) {
  if (piece.type !== "pebble" && piece.type !== "stick") return;
  if (!isInStream(piece.x, piece.y)) return;
  const def = PIECE_TYPES[piece.type];
  // Pebbles stick up out of the water so the rock now hides the inner band of
  // the sprite — give them a wider ring so what's left visibly haloes the
  // stone. Sticks lie flat enough that the original size still reads.
  const scale = piece.type === "pebble" ? 1.3 : 0.85;
  const radius = Math.max(def.w, def.h) * scale;
  state.ripples.push({
    x: piece.x,
    y: piece.y,
    age: 0,
    life: 0.6,
    radius,
  });
}

// Sticks and leaves dropped in open water drift with the current. Pebbles
// always sink. If a stick or leaf is dropped touching another placed piece,
// it snags in place rather than drifting.
function shouldFlow(type, x, y, placed) {
  if (type === "pebble") return false;
  const def = PIECE_TYPES[type];
  for (const q of placed) {
    if (q.flowing) continue;
    const qdef = PIECE_TYPES[q.type];
    if (!qdef) continue;
    const dx = x - q.x;
    const dy = y - q.y;
    const rx = (def.w + qdef.w) * 0.45;
    const ry = (def.h + qdef.h) * 0.45;
    if (Math.abs(dx) < rx && Math.abs(dy) < ry) return false;
  }
  return true;
}
