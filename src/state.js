// Logical playfield is 1456x1088 (4:3, matches reference screenshot).
export const W = 1456;
export const H = 1088;

// The stream is described as a centerline with a width. Water flows along it
// from top to bottom-right. Pieces only "stick" if they're inside the band.
// Coordinates eyeballed from the screenshot.
export const STREAM = {
  // centerline points (x, y) from upstream to downstream
  path: [
    { x: 720,  y: -40 },
    { x: 690,  y: 180 },
    { x: 600,  y: 360 },
    { x: 540,  y: 560 },
    { x: 620,  y: 760 },
    { x: 800,  y: 900 },
    { x: 980,  y: 1040 },
    { x: 1120, y: 1140 },
  ],
  width: 280, // half-width of the wet area
};

// The "build line" is where the dam can be placed (matches the row of stones
// across the stream in the screenshot). y center plus a tilt.
export const BUILD_LINE = {
  // y at left edge and right edge of the band; pieces that snap onto the dam
  // anchor to this line.
  yLeft: 540,
  yRight: 470,
  xLeft: 360,
  xRight: 1080,
};

export const PIECE_TYPES = {
  stick:  { w: 150, h: 36,  label: "Stick"  },
  pebble: { w: 96,  h: 84,  label: "Pebble" },
  leaf:   { w: 110, h: 70,  label: "Leaf"   },
};

export function makeInitialState() {
  return {
    // pieces already placed in the world (the partial dam visible in the
    // screenshot is generated on first run for atmosphere)
    placed: seedDam(),
    // available pieces in the bottom-left palette (infinite supply for v1)
    palette: [
      { id: "stick",  count: Infinity },
      { id: "pebble", count: Infinity },
      { id: "leaf",   count: Infinity },
    ],
    // current drag (null when nothing is being dragged)
    drag: null,
    // hint state
    showHint: true,
    // win state
    won: false,
    winT: 0,
    // global animation time (seconds)
    t: 0,
  };
}

function seedDam() {
  // Approximate the partially-built dam from the screenshot so first-time
  // players see a starting state similar to the reference.
  const seed = [
    { type: "stick",  x: 410, y: 540, rot:  0.05 },
    { type: "pebble", x: 470, y: 555 },
    { type: "stick",  x: 520, y: 530, rot: -0.02 },
    { type: "pebble", x: 575, y: 540 },
    { type: "stick",  x: 625, y: 520, rot:  0.03 },
    { type: "leaf",   x: 540, y: 600, rot: -0.4 },
    { type: "pebble", x: 690, y: 525 },
    { type: "stick",  x: 745, y: 510, rot: -0.04 },
    { type: "pebble", x: 800, y: 500 },
    { type: "leaf",   x: 720, y: 575, rot:  0.3 },
    { type: "stick",  x: 855, y: 495, rot:  0.06 },
    { type: "pebble", x: 905, y: 485 },
    { type: "pebble", x: 955, y: 478 },
  ];
  return seed.map((p, i) => ({ id: "seed-" + i, ...p, rot: p.rot ?? 0 }));
}

// Returns true if (x,y) is inside the wet stream band.
export function isInStream(x, y) {
  const path = STREAM.path;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const d = pointToSegmentDistance(x, y, a.x, a.y, b.x, b.y);
    if (d <= STREAM.width / 2) return true;
  }
  return false;
}

// Unit downstream direction at (x,y), based on the closest stream segment.
export function streamTangentAt(x, y) {
  const path = STREAM.path;
  let bestD = Infinity;
  let bestTan = { dx: 0, dy: 1 };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    let t = ((x - a.x) * dx + (y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const d = Math.hypot(x - cx, y - cy);
    if (d < bestD) {
      bestD = d;
      const len = Math.sqrt(lenSq);
      bestTan = { dx: dx / len, dy: dy / len };
    }
  }
  return bestTan;
}

// Distance from a placement to the dam build line (used to snap pieces onto
// the dam). Returns { dist, snapY } in image space.
export function buildLineSnap(x) {
  const t = (x - BUILD_LINE.xLeft) / (BUILD_LINE.xRight - BUILD_LINE.xLeft);
  const y = BUILD_LINE.yLeft + (BUILD_LINE.yRight - BUILD_LINE.yLeft) * t;
  return y;
}

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
