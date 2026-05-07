import { loadAssets } from "./assets.js";
import { makeInitialState } from "./state.js";
import { render } from "./render.js";
import { attachInput } from "./input.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const state = makeInitialState();
let assets = null;

(async function main() {
  assets = await loadAssets();
  attachInput(canvas, state);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    state.t += dt;
    if (state.won) state.winT += dt;
    render(ctx, state, assets);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
