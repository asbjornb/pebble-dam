// Logical playfield is 1456x1088 (4:3, matches reference screenshot).
export const W = 1456;
export const H = 1088;

// The stream is described as a centerline with a per-point full width. Water
// flows along it from upper-left down to bottom-right. Pieces only "stick" if
// they're inside the band. Geometry sampled from assets/stream-mask.png.
export const STREAM = {
  // centerline points from upstream to downstream; w is the full wet width at
  // that point (interpolated linearly along each segment).
  path: [
    { x: 360,  y: -40,  w: 220 },
    { x: 460,  y: 80,   w: 220 },
    { x: 560,  y: 180,  w: 250 },
    { x: 660,  y: 300,  w: 480 },
    { x: 690,  y: 420,  w: 690 },
    { x: 700,  y: 520,  w: 680 },
    { x: 780,  y: 660,  w: 670 },
    { x: 880,  y: 820,  w: 650 },
    { x: 1080, y: 970,  w: 620 },
    { x: 1240, y: 1130, w: 480 },
  ],
};

// The "build line" is where the dam can be placed. Sits across the wide,
// roughly horizontal middle stretch of the stream.
export const BUILD_LINE = {
  // y at left edge and right edge of the band; pieces that snap onto the dam
  // anchor to this line.
  yLeft: 470,
  yRight: 440,
  xLeft: 340,
  xRight: 1020,
};

export const PIECE_TYPES = {
  stick:  { w: 150, h: 36,  label: "Stick"  },
  pebble: { w: 96,  h: 84,  label: "Pebble" },
  leaf:   { w: 110, h: 70,  label: "Leaf"   },
};

export function makeInitialState() {
  return {
    placed: [],
    palette: [
      { id: "stick",  count: Infinity },
      { id: "pebble", count: Infinity },
      { id: "leaf",   count: Infinity },
    ],
    drag: null,
    showHint: true,
    t: 0,
  };
}

// Returns true if (x,y) is inside the wet stream band.
export function isInStream(x, y) {
  const path = STREAM.path;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    let t = ((x - a.x) * dx + (y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const d = Math.hypot(x - cx, y - cy);
    const w = a.w + t * (b.w - a.w);
    if (d <= w / 2) return true;
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
