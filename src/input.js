// Pointer input: drag pieces from the palette into the stream, and drag
// previously-placed pieces to reposition them.

import { W, H, PIECE_TYPES, isInStream, buildLineSnap } from "./state.js";

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

  // Pick from palette?
  const slots = state._paletteSlots || [];
  for (const s of slots) {
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) {
      const def = PIECE_TYPES[s.type];
      state.drag = {
        type: s.type,
        from: "palette",
        x, y,
        offsetX: 0,
        offsetY: 0,
        rot: s.type === "leaf" ? (Math.random() * 0.8 - 0.4) : 0,
        snap: null,
      };
      updateSnap();
      canvas.setPointerCapture(e.pointerId);
      return;
    }
  }

  // Pick existing placed piece?
  for (let i = state.placed.length - 1; i >= 0; i--) {
    const p = state.placed[i];
    const def = PIECE_TYPES[p.type];
    if (Math.abs(x - p.x) <= def.w / 2 && Math.abs(y - p.y) <= def.h / 2) {
      state.drag = {
        type: p.type,
        from: "world",
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
  if (d.snap && d.snap.valid) {
    state.placed.push({
      id: "p-" + Math.random().toString(36).slice(2, 8),
      type: d.type,
      x: d.snap.x,
      y: d.snap.y,
      rot: d.snap.rot,
      flowing: shouldFlow(d.type, d.snap.x, d.snap.y),
    });
  } else if (d.from === "world") {
    // dropped invalid — return it to original location is hard without
    // remembering it. For v1, drop at current pointer position if in stream,
    // otherwise discard.
    if (isInStream(d.x, d.y)) {
      state.placed.push({
        id: "p-" + Math.random().toString(36).slice(2, 8),
        type: d.type,
        x: d.x, y: d.y, rot: d.rot,
        flowing: shouldFlow(d.type, d.x, d.y),
      });
    }
  }
  state.drag = null;
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
  const def = PIECE_TYPES[d.type];
  // Snap to dam build line when close.
  const snapY = buildLineSnap(d.x);
  const distToDamLine = Math.abs(d.y - snapY);
  const onDam = distToDamLine < 90;
  const tilt = Math.atan2(-30, 720); // matches BUILD_LINE slope, ~ -0.04 rad
  if (onDam && d.x > 320 && d.x < 1120) {
    d.snap = {
      x: d.x,
      y: snapY,
      rot: d.type === "stick" ? tilt + (Math.random() * 0.06 - 0.03) * 0 : (d.type === "leaf" ? (d.rot ?? 0) : 0),
      valid: isInStream(d.x, snapY),
    };
  } else {
    // Free-place anywhere wet (e.g., a leaf drifting on the surface).
    const valid = isInStream(d.x, d.y);
    d.snap = { x: d.x, y: d.y, rot: d.rot ?? 0, valid };
  }
}
