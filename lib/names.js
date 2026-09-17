// 펫 이름 → 화면에 보일 포켓몬 이름 (한국어·영어).
//
// 도구 안에서 펫은 codex-pokepets 의 폴더명(eevee · rotom-wash · gengar-3d)으로 부르는데 화면에는 "이브이 · 워시로토무" 가 보여야 한다.
// 표는 lib/names.json — src/tools/build-names.ts 가 PokeAPI 의 CSV(종 이름표 + 폼 이름표)에서 한 번 뽑아 동봉한다.
// 런타임 네트워크 의존은 두지 않는다 (dex.json 과 같은 태도). 표에 없는 이름은 슬러그를 그대로 보여 화면이 비지 않게 한다
const { normalize } = require("./dex.js");

let table = null;
function load() {
  if (table) return table;
  try {
    table = require("./names.json");
  } catch {
    table = {}; // 표를 아직 안 만들었다 (git clone 직후 등) — 슬러그 그대로
  }
  return table;
}

// 화면 이름. lang 은 ko · en. -3d 같은 그림체 접미사는 같은 종이라 뗀다
function petName(slug, lang = "ko") {
  const key = normalize(slug);
  const entry = load()[key];
  if (!entry) return String(slug || "");
  return entry[lang] || entry.en || entry.ko || String(slug || "");
}

// 표에 있는가 — 스타터 선택 화면 등이 "이름을 아는 종"만 보여 줄 때
const hasName = (slug) => normalize(slug) in load();

module.exports = { petName, hasName };
