// Asset loader. Tries to load real images; falls back to a "missing" flag
// so the renderer can draw a procedural placeholder instead. This lets the
// game be playable before the art is generated.

export const ASSETS = {
  background:    { src: "assets/background.png" },
  streamMask:    { src: "assets/stream-mask.png" },
  paletteBar:    { src: "assets/palette-bar.png" },
  levelCard:     { src: "assets/level-card.png" },
  tooltipBubble: { src: "assets/tooltip-bubble.png" },
  cursorHand:    { src: "assets/cursor-hand.png" },
  pieceStick:    { src: "assets/piece-stick.png" },
  piecePebble:   { src: "assets/piece-pebble.png" },
  pieceLeaf:     { src: "assets/piece-leaf.png" },
  iconStick:     { src: "assets/icon-stick.png" },
  iconPebble:    { src: "assets/icon-pebble.png" },
  iconLeaf:      { src: "assets/icon-leaf.png" },
  splash:        { src: "assets/splash.png" },
};

export async function loadAssets() {
  const promises = Object.entries(ASSETS).map(([key, def]) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        def.image = img;
        def.loaded = true;
        resolve();
      };
      img.onerror = () => {
        def.loaded = false;
        resolve();
      };
      img.src = def.src;
    });
  });
  await Promise.all(promises);
  return ASSETS;
}
