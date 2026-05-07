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

- `index.html`, `src/` — the playable v1. Pick up the stones and sticks
  scattered on the banks and drag them into the stream to build a dam;
  once it's mostly sealed, water backs up and the remaining gaps show
  fast turbulent flow rushing through. Sticks and leaves also drift in
  from upstream — grab them as they pass to top up your supply. Close
  every gap to win.
- `assets/` — drop generated art here using the filenames in the spec.
  Until then, the game draws procedural placeholder shapes so it stays
  playable.
- `specs/ASSETS.md` — human-readable asset spec with prompts for each
  image to generate.
- `specs/assets.json` — same spec in machine-readable form (for an asset
  generator pipeline).

## Gameplay (v1)

- **Pick up** a stone or stick from the bank (or grab a stick/leaf
  drifting past).
- **Drop** it anywhere in the stream — there's no snap line, every
  cross-section of the stream can be a dam. Pebbles sink and stay;
  sticks/leaves drift unless you drop them touching another piece, in
  which case they snag in place. You can also drop a piece back onto
  dry land.
- **Drag** an already-placed piece to reposition it.
- Wall off any cross-section of the stream to back the water up.

## Design canvas

Logical resolution is **1456×1088** (4:3, matches the reference
screenshot). The canvas scales to fit the viewport. All asset sizes in
`specs/ASSETS.md` are in this design space.

## Roadmap

See [`TODO.md`](TODO.md) for a running list of ideas to explore.

- Multiple levels with different stream shapes and target objectives
  (e.g. "redirect water to the right channel", "make the pond deepen").
- Real water simulation (cellular fluid) instead of analytical gap math.
- Sounds (stream loop, plop on placement, splash when water bursts
  through a gap).
- Tilt/rotate handles when a piece is selected.
