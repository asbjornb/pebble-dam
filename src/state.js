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

// Runtime-sampled mask from assets/stream-mask.png. When present, this is the
// source of truth for wet/dry checks so interactions match the painted stream
// boundaries exactly. We keep the analytic STREAM path as a fallback.
let streamMask = null;
let streamColorModel = null;
let streamBinaryMap = null;

function sqDistRgb(r, g, b, c) {
  const dr = r - c.r;
  const dg = g - c.g;
  const db = b - c.b;
  return dr * dr + dg * dg + db * db;
}

function meanRgb(samples) {
  if (!samples.length) return null;
  let r = 0, g = 0, b = 0;
  for (const s of samples) {
    r += s.r;
    g += s.g;
    b += s.b;
  }
  const n = samples.length;
  return { r: r / n, g: g / n, b: b / n };
}

export function initStreamMask(image) {
  if (!image) {
    streamMask = null;
    return;
  }
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    streamMask = null;
    return;
  }
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
  streamMask = { pixels, width: c.width, height: c.height };
  streamBinaryMap = null;
}

// Learns a lightweight water-vs-land color model from the background image.
// If a stream mask exists, use its high-confidence regions as training labels;
// otherwise use the hand-authored STREAM band for weak supervision.
export function initStreamColorModel(backgroundImage) {
  if (!backgroundImage) {
    streamColorModel = null;
    streamBinaryMap = null;
    return;
  }
  const c = document.createElement("canvas");
  c.width = backgroundImage.width;
  c.height = backgroundImage.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    streamColorModel = null;
    streamBinaryMap = null;
    return;
  }
  ctx.drawImage(backgroundImage, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;

  const wet = [];
  const dry = [];
  const step = 4;
  for (let y = 0; y < c.height; y += step) {
    for (let x = 0; x < c.width; x += step) {
      const i = (y * c.width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];

      if (streamMask) {
        const m = (y * streamMask.width + x) * 4;
        const a = streamMask.pixels[m + 3];
        if (a >= 200) wet.push({ r, g, b });
        else if (a <= 20) dry.push({ r, g, b });
      } else {
        if (isInStream(x, y)) wet.push({ r, g, b });
        else dry.push({ r, g, b });
      }
    }
  }

  const waterMean = meanRgb(wet);
  const landMean = meanRgb(dry);
  if (!waterMean || !landMean) {
    streamColorModel = null;
    streamBinaryMap = null;
    return;
  }
  streamColorModel = { pixels: data, width: c.width, height: c.height, waterMean, landMean };

  // One-time preprocessing: build a strict wet/dry bitmap so per-frame checks
  // are just array lookups. This also stabilizes edge behavior.
  const out = new Uint8Array(c.width * c.height);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const idx = y * c.width + x;
      const i = idx * 4;
      const r = data[i + 0], g = data[i + 1], b = data[i + 2];

      let maskVote = null;
      if (streamMask && x < streamMask.width && y < streamMask.height) {
        const m = (y * streamMask.width + x) * 4;
        const mr = streamMask.pixels[m + 0];
        const mg = streamMask.pixels[m + 1];
        const mb = streamMask.pixels[m + 2];
        const ma = streamMask.pixels[m + 3];
        const luma = 0.2126 * mr + 0.7152 * mg + 0.0722 * mb;
        if (ma >= 180) maskVote = true;
        else if (ma <= 16 && luma < 32) maskVote = false;
      }

      const dWater = sqDistRgb(r, g, b, waterMean);
      const dLand = sqDistRgb(r, g, b, landMean);
      const colorVote = dWater < dLand;

      let wet;
      if (maskVote === null) wet = colorVote;
      else if (maskVote === colorVote) wet = maskVote;
      else wet = maskVote;

      out[idx] = wet ? 1 : 0;
    }
  }
  streamBinaryMap = { data: out, width: c.width, height: c.height };
}

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

// `obstruction` is how strongly a piece blocks flow when it sits on the dam:
// pebbles are heavy and seal hard, sticks bridge gaps, leaves only lightly
// plug a leak before bursting under pressure. `mass` is how reluctant a piece
// is to be torn loose by water pressure (pebbles never burst, leaves go first).
export const PIECE_TYPES = {
  stick:  { w: 150, h: 36, label: "Stick",  obstruction: 0.6, mass: 3.0 },
  pebble: { w: 96,  h: 84, label: "Pebble", obstruction: 1.0, mass: 9.0 },
  leaf:   { w: 110, h: 70, label: "Leaf",   obstruction: 0.35, mass: 0.4 },
};

// Items the player finds scattered on the dry banks at the start of the
// level. The player picks these up and drags them into the stream to build
// the dam; sticks and leaves also drift in renewably from upstream.
const GROUND_ITEMS = [
  // left bank, near and below the dam line
  { type: "pebble", x: 210,  y: 470, rot:  0.15 },
  { type: "pebble", x: 250,  y: 380, rot: -0.10 },
  { type: "pebble", x: 180,  y: 580, rot:  0.30 },
  { type: "pebble", x: 220,  y: 720, rot: -0.05 },
  { type: "stick",  x: 200,  y: 320, rot:  0.4  },
  { type: "stick",  x: 140,  y: 660, rot: -0.5  },
  // right bank, near and above the dam line
  { type: "pebble", x: 1180, y: 460, rot:  0.20 },
  { type: "pebble", x: 1240, y: 360, rot: -0.18 },
  { type: "pebble", x: 1280, y: 540, rot:  0.05 },
  { type: "stick",  x: 1340, y: 440, rot: -0.6  },
  { type: "stick",  x: 1380, y: 700, rot:  1.1  },
];

export function makeInitialState() {
  const placed = GROUND_ITEMS.map((g) => ({
    id: "g-" + Math.random().toString(36).slice(2, 8),
    type: g.type,
    x: g.x,
    y: g.y,
    rot: g.rot,
    flowing: false,
  }));
  return {
    placed,
    drag: null,
    showHint: true,
    t: 0,
    // pressure ramps up when the dam is well-sealed and is what triggers
    // dramatic bursts of stuck debris; smoothed for stable rendering.
    pressure: 0,
    leafSpawnT: 0,
    eddies: [],
    splashes: [],
    ripples: [],
  };
}

// Returns true if (x,y) is inside the wet stream band.
export function isInStream(x, y) {
  if (streamBinaryMap) {
    const ix = Math.max(0, Math.min(streamBinaryMap.width - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(streamBinaryMap.height - 1, Math.round(y)));
    return streamBinaryMap.data[iy * streamBinaryMap.width + ix] === 1;
  }

  let maskVote = null;
  if (streamMask) {
    const ix = Math.max(0, Math.min(streamMask.width - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(streamMask.height - 1, Math.round(y)));
    const i = (iy * streamMask.width + ix) * 4;
    const r = streamMask.pixels[i + 0];
    const g = streamMask.pixels[i + 1];
    const b = streamMask.pixels[i + 2];
    const a = streamMask.pixels[i + 3];
    // Alpha is usually the most reliable mask channel. Color luma is kept as a
    // weak extra check in case exported masks are near-transparent antialiased
    // edges with visible RGB data.
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (a >= 180) maskVote = true;
    else if (a <= 16 && luma < 32) maskVote = false;
  }

  if (streamColorModel) {
    const ix = Math.max(0, Math.min(streamColorModel.width - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(streamColorModel.height - 1, Math.round(y)));
    const i = (iy * streamColorModel.width + ix) * 4;
    const r = streamColorModel.pixels[i + 0];
    const g = streamColorModel.pixels[i + 1];
    const b = streamColorModel.pixels[i + 2];
    const dWater = sqDistRgb(r, g, b, streamColorModel.waterMean);
    const dLand = sqDistRgb(r, g, b, streamColorModel.landMean);
    const colorVote = dWater < dLand;
    if (maskVote === null) return colorVote;
    if (maskVote === colorVote) return maskVote;
    // Disagreement near mask edges: keep mask authority if alpha was decisive,
    // otherwise trust local color.
    return maskVote;
  }

  if (maskVote !== null) return maskVote;

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
