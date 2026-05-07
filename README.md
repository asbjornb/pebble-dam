# pebble-dam

Build little dams in a gentle stream and watch the water flow around them.

## Run it

It's plain HTML+JS — no build step. Either:

```sh
# from the repo root
python3 -m http.server 8000
# then visit http://localhost:8000
```

…or open `index.html` through any static server (a `file://` open won't
work because the JS uses ES modules).

## What's here

- `index.html`, `src/` — the playable v1. Drag pieces from the bottom-left
  palette into the stream to build a dam; gaps appear as little
  waterfalls. Close every gap to win.
- `assets/` — drop generated art here using the filenames in the spec.
  Until then, the game draws procedural placeholder shapes so it stays
  playable.
- `specs/ASSETS.md` — human-readable asset spec with prompts for each
  image to generate.
- `specs/assets.json` — same spec in machine-readable form (for an asset
  generator pipeline).

## Gameplay (v1)

- **Pick** a piece from the palette (stick, pebble, leaf).
- **Drop** it into the wet part of the stream. Pieces near the dam line
  snap onto it; everywhere else they free-place (e.g. a leaf drifting on
  the surface).
- **Drag** an already-placed piece to reposition it.
- Close all gaps along the dam line to clear the level.

## Design canvas

Logical resolution is **1456×1088** (4:3, matches the reference
screenshot). The canvas scales to fit the viewport. All asset sizes in
`specs/ASSETS.md` are in this design space.

## Roadmap

- Multiple levels with different stream shapes and target objectives
  (e.g. "redirect water to the right channel", "make the pond deepen").
- Real water simulation (cellular fluid) instead of analytical gap math.
- Sounds (stream loop, plop on placement, splash on waterfall).
- Tilt/rotate handles when a piece is selected.
