// 펫 이름 → 전국도감 번호.
// PMD 자산은 4자리 도감번호(0133)로 찾는데 이 도구는 이름(eevee)을 쓴다. 그 사이를 잇는다.
// 데이터는 codex-pokepets 의 pets.json 에서 뽑아 dex.json 으로 동봉했다 —
// 그 저장소가 없어도 PMD 는 동작해야 하므로 런타임 의존을 두지 않는다.
const dex = require("./dex.json");

// codex 팩의 -3d 는 같은 종의 다른 그림체다. PMD 에는 그 구분이 없다
const normalize = (slug) =>
  String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/-3d$/, "");

function dexOf(slug) {
  return dex[normalize(slug)] ?? null;
}

// PMD 경로에 쓰는 4자리 형식
function dexPath(slug) {
  const n = dexOf(slug);
  return n == null ? null : String(n).padStart(4, "0");
}

// 오타일 때 비슷한 이름 몇 개 — bin/pkmon 의 안내를 PMD 에서도 유지하려고
function suggest(slug, limit = 5) {
  const key = normalize(slug).replace(/[^a-z]/g, "").replace(/^mega/, "").replace(/mega$/, "");
  if (key.length < 3) return [];
  return Object.keys(dex)
    .filter((name) => name.includes(key))
    .slice(0, limit);
}

module.exports = { dexOf, dexPath, normalize, suggest, count: Object.keys(dex).length };
