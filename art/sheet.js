// codex-pokepets 의 스프라이트시트 — 192x208 칸을 8x9 격자로 담은 한 장.
// 동작 9줄이 있지만 펫에 따라 여러 줄이 idle 복사본이고 도트 품질이 고르지 않다.
const fs = require("fs");

const CELL = { w: 192, h: 208 }; // 팩 스프라이트시트의 한 칸

async function loadSheet(config, PATHS, spritePath) {
  const file = spritePath(config);
  try {
    const data = fs.readFileSync(file);
    return {
      kind: "sheet",
      dataUrl: `data:image/webp;base64,${data.toString("base64")}`,
      w: CELL.w,
      h: CELL.h,
      scale: config.scale,
      from: file,
    };
  } catch {
    return null; // 저장소가 없거나 그 펫이 없다
  }
}

module.exports = { loadSheet, CELL };
