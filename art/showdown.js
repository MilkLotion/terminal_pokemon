// Pokémon Showdown 의 원본 애니메이션 GIF.
// 화질은 가장 좋지만 애니메이션이 대기 루프 하나뿐이라 상태를 그림으로 구분할 수 없다.
const path = require("path");
const { get, saveAtomic, readCache } = require("./fetch.js");

const GIF_MAX = { w: 480, h: 420 }; // 창이 지나치게 커지지 않도록

// 3D 는 Showdown 애니메이션 세트, 2D 는 같은 사이트의 5세대 세트(폼까지 이름으로 구분된다)
function gifUrls(slug) {
  const base = slug.replace(/-3d$/, "");
  if (/-3d$/.test(slug)) return [`https://play.pokemonshowdown.com/sprites/ani/${base}.gif`];
  return [
    `https://play.pokemonshowdown.com/sprites/gen5ani/${slug}.gif`,
    `https://play.pokemonshowdown.com/sprites/ani/${slug}.gif`,
  ];
}

// GIF 머리말에서 크기만 읽는다 (7~10번째 바이트).
// "GIF 인가" 검증도 겸한다 — 200 으로 오는 HTML 오류 페이지가 여기서 걸린다
function gifSize(buf) {
  if (buf.length < 10 || buf.toString("ascii", 0, 3) !== "GIF") return null;
  const w = buf.readUInt16LE(6);
  const h = buf.readUInt16LE(8);
  return w && h ? { w, h } : null;
}

async function loadGif(slug, PATHS) {
  const file = path.join(PATHS.gifs, `${slug}.gif`);
  const hit = readCache(file);
  if (hit) {
    const size = gifSize(hit);
    if (size) return { buf: hit, size, from: file };
  }
  // 주소 후보를 순서대로 — 앞쪽이 우선순위다
  for (const url of gifUrls(slug)) {
    const buf = await get(url);
    if (!buf) continue;
    const size = gifSize(buf);
    if (!size) continue; // 깨진 응답
    saveAtomic(file, buf);
    return { buf, size, from: url };
  }
  return null;
}

async function loadShowdown(config, PATHS) {
  const gif = await loadGif(config.slug, PATHS);
  if (!gif) return null;
  // 도트가 1px 인 원본을 정수배로 확대 — 배율이 깨지면 도트가 고르지 않다
  const target = Math.max(1, config.dotSize || 1);
  const scale = Math.max(
    1,
    Math.min(target, Math.floor(GIF_MAX.w / gif.size.w), Math.floor(GIF_MAX.h / gif.size.h)),
  );
  return {
    kind: "gif",
    dataUrl: `data:image/gif;base64,${gif.buf.toString("base64")}`,
    w: gif.size.w,
    h: gif.size.h,
    scale,
    from: gif.from,
  };
}

module.exports = { loadShowdown, gifUrls, gifSize, GIF_MAX };
