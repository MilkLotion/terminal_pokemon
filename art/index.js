// 펫 그림을 고르는 한 곳. main.js 는 여기만 부른다.
//
// art 값에 따라 소스를 고르고, 실패하면 아래로 내려간다.
//   pmd      동작마다 그림이 따로 있다 (기본). PMDCollab/SpriteCollab · CC BY-NC 4.0
//   showdown 원본 애니메이션 GIF. 화질은 최고지만 동작이 하나뿐이다
//   sheet    codex-pokepets 스프라이트시트
const { loadPmd } = require("./pmd-load.js");
const { loadShowdown } = require("./showdown.js");
const { loadSheet } = require("./sheet.js");

// 소스별 폴백 사슬 — 앞에서부터 되는 것을 쓴다
const CHAINS = {
  pmd: ["pmd", "showdown", "sheet"],
  showdown: ["showdown", "sheet"],
  sheet: ["sheet"],
};

async function loadArt(config, PATHS, spritePath, onFallback) {
  const chain = CHAINS[config.art] || CHAINS.pmd;
  for (const source of chain) {
    let art = null;
    if (source === "pmd") art = await loadPmd(config, PATHS);
    else if (source === "showdown") art = await loadShowdown(config, PATHS);
    else art = await loadSheet(config, PATHS, spritePath);

    if (art) {
      // 원한 것과 다른 소스로 떨어졌으면 알린다 — 조용히 달라져 있으면 원인을 못 찾는다
      if (source !== chain[0] && onFallback) onFallback(chain[0], source);
      return art;
    }
  }
  return null;
}

module.exports = { loadArt, CHAINS };
