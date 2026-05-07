# Pebble Dam — Asset Specification

Every asset listed here is referenced by `src/assets.js` (filename → key).
The game runs with procedural placeholders if a file is missing, so assets
can be dropped in one at a time. Drop them into the `/assets` folder using
the exact filenames below.

## Global art direction
- **Style**: hand-painted storybook, warm and gentle, similar to the
  reference screenshot. Soft brush edges, no hard line art, slight color
  bleeding at edges. Aim for a "Studio Ghibli forest floor" feel.
- **Palette**: mossy greens (`#3e5527`, `#5e8a3a`, `#86b25a`), warm earth
  (`#5a3a20`, `#7e5a36`, `#a36a17`), stream blues (`#1f4f6e`, `#2c6b8a`),
  highlight cream (`#f3ead8`).
- **Camera**: ¾ top-down, slight isometric tilt (~30° pitch). Light comes
  from upper-left.
- **Render scale**: design canvas is **1456 × 1088** (4:3). Export PNGs at
  the listed pixel dimensions, with **1× and 2×** variants where useful.
- **Transparency**: PNG-32. No baked-in shadows for moveable pieces — the
  game adds soft contact shadows at runtime.
- **No text** in any image (UI text is drawn in code).

---

## 1. `background.png` — 1456 × 1088
**Purpose**: full scene backdrop. Painted stream, banks, foliage,
ambient props. Serves as the play stage; pieces are drawn on top.

**Prompt**:
> Top-down hand-painted illustration of a small woodland stream meandering
> diagonally from upper center down to the lower right, ¾ overhead angle,
> Studio-Ghibli storybook style. Mossy banks of grass and earth flank the
> stream. The wet stream bed is a soft blue with rounded river stones
> visible underwater. Decorative props at the edges only: a cluster of
> small yellow buttercups in the upper-left corner; a fallen pine log and
> pinecones on the left bank; a fallen log entering from the upper right;
> two orange-capped mushrooms on the right bank near the top; scattered
> small leaves and pebbles along the bank edges. Empty grass area in the
> bottom-left and bottom-right corners (these will be covered by UI).
> The dam-building band across the middle of the stream MUST be left
> empty — no logs, rocks, or leaves between roughly y=420 and y=620.
> Soft warm lighting from the upper-left, painterly edges, no outlines,
> no text. Resolution 1456×1088.

**Constraints**:
- Stream centerline must roughly follow the points listed in
  `src/state.js: STREAM.path`. If you change it, update that file.
- Leave the "build band" empty (see prompt) so dam pieces don't collide
  with painted ones.
- Lower-left ~440×170 px and lower-right ~230×230 px should be calm
  grass (the palette and level card sit there).

## 2. `stream-mask.png` — 1456 × 1088, grayscale
**Purpose**: optional. If supplied, white pixels = "wet" (placeable),
black = bank. The current build uses an analytical band (`isInStream`),
so this file is **optional** but improves placement accuracy.
**Spec**: pure black/white, soft 8 px feathered edges.

## 3. `palette-bar.png` — 480 × 150
**Purpose**: parchment/leather inventory bar in the bottom-left.

**Prompt**:
> Tan parchment-and-leather inventory bar viewed from above. Soft tan
> beige (#e6d4a6) center with a darker stitched border (#9a7a48) and a
> subtle rope/twine outline. Empty interior — no slot graphics. Slight
> aged paper texture, warm shadow underneath baked into the alpha.
> Format: PNG with transparency, 480×150, no text.

## 4. `level-card.png` — 220 × 220
**Purpose**: pinned paper card with hand-drawn level objective.

**Prompt**:
> Small piece of weathered cream paper (#efe4c2) at a slight 6° tilt,
> with a single piece of beige washi tape across the top. Hand-drawn
> brown ink doodle of a stream with a row of pebbles forming a dam.
> Format: PNG with transparency, 220×220, no readable text (the game
> overlays "Level 1" in code).

## 5. `tooltip-bubble.png` — 360 × 120
**Purpose**: dark rounded speech bubble for the tutorial hint.

**Prompt**:
> Rounded-rectangle dark wood-bark colored speech bubble (#2a1f15 with
> subtle texture), soft drop shadow, no tail, no text. PNG with alpha,
> 360×120.

## 6. `cursor-hand.png` — 96 × 96
**Purpose**: white pointing hand cursor used in tutorial overlay.

**Prompt**:
> Stylized white pointing-hand cursor icon (index finger up-right),
> simple cartoon outline filled white, slight grey shadow, PNG with
> transparency, 96×96.

---

## 7. Pieces (gameplay)

These appear both in the world and in the palette slots. Render straight
overhead with the long axis horizontal (the game rotates them as needed).
Soft contact shadow on the bottom edge **inside the alpha** is fine for
placed-in-water pieces.

### 7a. `piece-stick.png` — 300 × 72
> A weathered wooden twig/short log lying horizontally, painterly art
> style. Light bark texture (#7e5a36 highlights, #4a2f1c shadow), tapered
> rounded ends, slight knotty bumps. Subtle wet sheen highlight along
> the top. PNG with transparency, 300×72, long axis horizontal.

### 7b. `piece-pebble.png` — 192 × 168
> A single rounded river stone viewed from above, dark grey with subtle
> mottled texture (#3c3933 to #7a7468), soft top-left highlight, smooth
> rounded organic shape (slightly oval). PNG with alpha, 192×168.

### 7c. `piece-leaf.png` — 220 × 140
> A single fresh green broadleaf (poplar/birch shape) viewed from above,
> long axis horizontal, mid-vein and faint side veins, gradient from
> deep green (#3f6d2c) at the stem end to brighter green (#86b25a) at
> the tip, subtle wet highlight. PNG with alpha, 220×140.

## 8. Palette icons (small versions)
Same subjects as the pieces, but framed for the **110×90** slot — pose
them centered, orientation horizontal, dimensions can be the same as
pieces (downscaled at runtime). Optional separate files; if absent, the
game downscales the world piece automatically.

- `icon-stick.png` — 110 × 90
- `icon-pebble.png` — 110 × 90
- `icon-leaf.png`   — 110 × 90

## 9. `splash.png` — 256 × 96  *(optional)*
> Sprite sheet of 4 frames of white water foam splash, top-down,
> increasing in size left-to-right. Frame size 64×96. Transparent
> background.

---

## Folder layout
```
assets/
  background.png
  stream-mask.png        (optional)
  palette-bar.png
  level-card.png
  tooltip-bubble.png
  cursor-hand.png
  piece-stick.png
  piece-pebble.png
  piece-leaf.png
  icon-stick.png         (optional)
  icon-pebble.png        (optional)
  icon-leaf.png          (optional)
  splash.png             (optional)
```

## How the game uses each asset
- **background.png** — drawn first, fills the canvas.
- **piece-***.png** — drawn at the placed position, rotated. Anchor is
  the center of the bounding box.
- **icon-***.png** — drawn inside palette slots; if missing the game
  downscales the world piece.
- **palette-bar.png / level-card.png / tooltip-bubble.png** — UI chrome
  drawn on top of the world.
- **stream-mask.png** — *optional*: if present and we add the sampler in
  a later iteration, white pixels override the analytical stream band.
- **cursor-hand.png / splash.png** — optional polish; placeholders are
  drawn procedurally if absent.
