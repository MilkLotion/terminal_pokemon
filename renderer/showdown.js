// 원본 GIF — 프레임 수·간격이 원본 그대로라 계산할 게 없다. 브라우저가 알아서 돌린다.
// 애니메이션이 하나뿐이라 상태에 따라 그림이 바뀌지 않는다.
import { canvas, opts, shared } from "./core.js";

const debug = opts.debug;

function setupGif(art) {
  canvas.style.display = "none";
  const img = document.createElement("img");
  img.src = art.dataUrl;
  img.style.width = `${art.w * art.scale}px`;
  img.style.height = `${art.h * art.scale}px`;
  document.body.appendChild(img);
  if (debug) {
    console.log(JSON.stringify({ 그림: "gif", 원본: `${art.w}x${art.h}`, 배율: art.scale }));
    setInterval(() => console.log(JSON.stringify({ kind: "gif", state: shared.state, visibility: document.visibilityState })), 2000);
  }
}

export function setup(art) {
  setupGif(art);
}
