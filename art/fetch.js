// 그림을 받아 캐시하는 공통 부분. pmd(ZIP) 가 쓴다 (art/pmd-load.js).
//
// 지금까지 이 프로젝트의 받기 코드에는 타임아웃이 없었다. 응답이 영영 안 오면
// 그림 로더(src/main/art.ts → loadPmd)의 await 가 막혀 마리가 무대에 영영 안 나온다. 여기서 상한을 건다.
const fs = require("fs");
const path = require("path");

const TIMEOUT_MS = 8000;

// Electron 메인 프로세스에서는 net.fetch 를 쓴다 — 시스템 프록시·인증서 설정을 따른다.
// Node 의 fetch 는 따르지 않아 회사 프록시 뒤에서는 그림을 못 받고 펫이 조용히 안 뜬다.
// Electron 밖(진단 도구·시험)에서는 require("electron") 이 실행 파일 경로만 주므로 Node fetch 로 간다
const httpFetch = (() => {
  if (!process.versions.electron) return fetch;
  try {
    const { net } = require("electron");
    return net && typeof net.fetch === "function" ? (url, init) => net.fetch(url, init) : fetch;
  } catch {
    return fetch;
  }
})();
// User-Agent 가 없으면 Showdown 이 403 으로 막는다
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

// 받아서 Buffer 로. 실패하면 null — 왜 실패했는지는 호출한 쪽이 판단한다
async function get(url, { timeout = TIMEOUT_MS } = {}) {
  try {
    const res = await httpFetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null; // 네트워크 없음·타임아웃·중단
  }
}

// 원자적으로 저장한다. 중간에 죽으면 .tmp 만 남고 정상 파일은 생기지 않는다
function saveAtomic(file, buf) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file); // 같은 파일시스템이라 원자적이다
    return true;
  } catch {
    return false;
  }
}

function readCache(file) {
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

// 캐시 → 없으면 받기. validate 가 false 를 주면 캐시하지 않고 버린다.
// 검증을 읽을 때도 돌리므로, 옛 버전이 남긴 오염된 캐시는 저절로 복구된다
async function cached(file, url, validate = () => true, opts) {
  const hit = readCache(file);
  if (hit && validate(hit)) return { buf: hit, from: file, cached: true };

  const got = await get(url, opts);
  if (!got || !validate(got)) return null;
  saveAtomic(file, got);
  return { buf: got, from: url, cached: false };
}

module.exports = { get, cached, saveAtomic, readCache, TIMEOUT_MS };
