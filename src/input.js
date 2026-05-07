// Pointer input: pick up pieces (ground items, placed dam pieces, or
// drifters floating past) and drop them somewhere new.

import { W, H, PIECE_TYPES, isInStream, buildLineSnap } from "./state.js";
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
        snap: null,
      };
      // remove from world while dragging
      state.placed.splice(i, 1);
      updateSnap();
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
  updateSnap();
}

function onUp(e) {
  if (!state.drag) return;
  const d = state.drag;
  // Drops on the dam line use the snapped position; everywhere else (free
  // float in the stream, or back on the dry bank) the piece keeps the
  // pointer position.
  const useSnap = d.snap && d.snap.valid;
  const x = useSnap ? d.snap.x : d.x;
  const y = useSnap ? d.snap.y : d.y;
  const rot = useSnap ? d.snap.rot : d.rot;
  const piece = {
    id: "p-" + Math.random().toString(36).slice(2, 8),
    type: d.type,
    x, y, rot,
    flowing: isInStream(x, y) && shouldFlow(d.type, x, y),
  };
  if (!piece.flowing) settlePiece(piece, state.placed);
  state.placed.push(piece);
  spawnDropRipple(state, piece);
  state.drag = null;
}

function spawnDropRipple(state, piece) {
  if (piece.type !== "pebble" && piece.type !== "stick") return;
  if (!isInStream(piece.x, piece.y)) return;
  const def = PIECE_TYPES[piece.type];
  // Heavier pieces make a wider ripple. Diameter at peak ~ 1.6× the piece size.
  const radius = Math.max(def.w, def.h) * 0.85;
  state.ripples.push({
    x: piece.x,
    y: piece.y,
    age: 0,
    life: 0.6,
    radius,
  });
}

// Sticks and leaves dropped off the dam line drift with the current; pebbles
// sink and stay where they're placed.
function shouldFlow(type, x, y) {
  if (type !== "stick" && type !== "leaf") return false;
  const lineY = buildLineSnap(x);
  return Math.abs(y - lineY) > 30;
}

function updateSnap() {
  const d = state.drag;
  // Snap to dam build line when close.
  const snapY = buildLineSnap(d.x);
  const distToDamLine = Math.abs(d.y - snapY);
  const onDam = distToDamLine < 90;
  const tilt = Math.atan2(-30, 680); // matches BUILD_LINE slope, ~ -0.044 rad
  if (onDam && d.x > 320 && d.x < 1040) {
    const ghost = {
      type: d.type,
      x: d.x,
      y: snapY,
      rot: d.type === "stick" ? tilt : (d.type === "leaf" ? (d.rot ?? 0) : 0),
    };
    settlePiece(ghost, state.placed);
    d.snap = {
      x: ghost.x,
      y: ghost.y,
      rot: ghost.rot,
      valid: isInStream(ghost.x, ghost.y),
    };
  } else {
    // Free-place anywhere wet (e.g., a leaf drifting on the surface).
    const valid = isInStream(d.x, d.y);
    d.snap = { x: d.x, y: d.y, rot: d.rot ?? 0, valid };
  }
}
