// PMD 자산을 받아 캐시하고 클립으로 만든다.
const path = require("path");
const dex = require("../lib/dex.js");
const { cached, get, saveAtomic, readCache } = require("./fetch.js");
const { readZipClips } = require("./pmd.js");

const ZIP_URL = (d) => `https://spriteserver.pmdcollab.org/assets/${d}/sprites.zip`;
// credits.txt 는 ZIP 에 없다. GitHub raw 에만 있다 (CC BY-NC 의 저작자 표시에 필요)
const CREDITS_URL = (d) =>
  `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/${d}/credits.txt`;

// ★ 스프라이트가 없는 종은 404 가 아니라 200 + 22바이트 빈 ZIP 을 돌려준다.
// res.ok 만 보면 통과해서 빈 ZIP 이 캐시에 영구히 눌러앉고 그 펫은 영원히 안 뜬다.
function looksLikeSprites(buf) {
  if (!buf || buf.length < 1024) return false;
  try {
    return !!readZipClips(buf);
  } catch {
    return false;
  }
}

// TSV: 날짜 \t 작성자 \t CUR \t 라이선스 \t 동작목록
function parseCredits(text) {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((f) => f.length >= 2 && f[1])
    .map((f) => ({ author: f[1].trim(), license: (f[3] || "").trim() || "Unspecified" }));
}

async function loadPmd(config, PATHS) {
  const d = dex.dexPath(config.slug);
  if (!d) return null; // 모르는 이름

  const zipFile = path.join(PATHS.pmd, `${d}.zip`);
  const hit = await cached(zipFile, ZIP_URL(d), looksLikeSprites);
  if (!hit) return null; // 없는 종이거나 못 받음 — 호출한 쪽이 다른 그림으로 넘어간다

  const built = readZipClips(hit.buf);
  if (!built) return null;

  // 저작자 표시 — 받아두되 실패해도 그림은 보여준다
  const credFile = path.join(PATHS.pmd, `${d}.credits.txt`);
  let credText = readCache(credFile);
  if (!credText) {
    const got = await get(CREDITS_URL(d), { timeout: 4000 });
    if (got) {
      saveAtomic(credFile, got);
      credText = got;
    }
  }

  // PMD 프레임은 gen5 GIF 보다 작아서 같은 dotSize 면 작아 보인다 — 3~4 를 권한다
  const zoom = Math.max(1, Math.min(Math.round(config.dotSize) || 2, Math.floor(480 / built.cell.w), Math.floor(420 / built.cell.h)));

  return {
    kind: "pmd",
    cell: built.cell,
    zoom,
    anims: built.anims,
    clips: built.clips,
    credits: parseCredits(credText && credText.toString("utf8")),
    dex: d,
    from: hit.from,
  };
}

module.exports = { loadPmd, looksLikeSprites, parseCredits };
