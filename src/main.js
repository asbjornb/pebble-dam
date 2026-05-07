import { loadAssets } from "./assets.js";
import { makeInitialState, initStreamMask, initStreamColorModel } from "./state.js";
import { render } from "./render.js";
import { attachInput } from "./input.js";
import { updateFlow } from "./water.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const state = makeInitialState();
let assets = null;

(async function main() {
  assets = await loadAssets();
  if (assets.streamMask?.loaded) initStreamMask(assets.streamMask.image);
  if (assets.background?.loaded) initStreamColorModel(assets.background.image);
  attachInput(canvas, state);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    state.t += dt;
    updateFlow(state, dt);
    render(ctx, state, assets);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
