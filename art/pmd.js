// PMDCollab/SpriteCollab 스프라이트 — 동작마다 그림이 따로 있다.
//
// 자산: https://spriteserver.pmdcollab.org/assets/<4자리도감>/sprites.zip
//   안에 AnimData.xml 과 <동작>-Anim.png 들이 들어 있다. 풀지 않고 메모리에서 읽는다.
// 시트 배치: 행 = 방향 8종(0=정면 2=오른쪽 4=뒤 6=왼쪽), 열 = 프레임. 동작마다 칸 크기가 다르다.
// 라이선스: CC BY-NC 4.0 — 저장소에 넣지 않고 실행할 때 받아서 캐시한다.
const { readZip } = require("../lib/zip.js");

// 상태 → 쓸 동작. 앞에서부터 보유한 것을 고른다 (없으면 조용히 다음 것)
// mode: loop(반복) · once(한 번 재생하고 then 으로) · hold(한 번 재생하고 마지막 프레임에서 정지)
const STATE_ANIMS = {
  idle: [["Idle", "loop"], ["Walk", "loop"]],
  running: [["Walk", "loop"], ["Hop", "loop"], ["Idle", "loop"]],
  waiting: [["Rotate", "loop"], ["LookUp", "loop"], ["Nod", "loop"], ["Idle", "loop"]],
  waving: [["Pose", "once"], ["Charge", "loop"], ["Nod", "once"], ["Idle", "loop"]],
  failed: [["Faint", "hold"], ["Trip", "hold"], ["Cringe", "once"], ["Hurt", "once"], ["Idle", "loop"]],
  review: [["Nod", "loop"], ["LookUp", "loop"], ["Idle", "loop"]],
};
// 옆모습이라 걷는 티가 나는 것만 오른쪽 행. 나머지는 정면
const ROW_OF = { running: 2 };
const DUR_UNIT = 1000 / 60; // AnimData 의 Duration 은 1/60초 단위

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1].trim() : null;
};

// AnimData.xml 은 도구가 만든 고정 형식이라 전용 파서로 충분하다 (메인 프로세스엔 DOMParser 가 없다)
function parseAnimData(xml) {
  const raw = new Map();
  for (const m of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const block = m[1];
    const name = tag(block, "Name");
    if (!name) continue;
    const durs = [...block.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((d) => Number(d[1]));
    raw.set(name, {
      name,
      copyOf: tag(block, "CopyOf"),
      fw: Number(tag(block, "FrameWidth")) || 0,
      fh: Number(tag(block, "FrameHeight")) || 0,
      durations: durs,
    });
  }

  // CopyOf 는 참조 대상보다 먼저 나올 수 있다 — 전부 모은 뒤에 푼다
  const out = new Map();
  for (const [name, a] of raw) {
    let cur = a;
    for (let depth = 0; cur.copyOf && depth < 4; depth++) cur = raw.get(cur.copyOf) || cur;
    if (!cur.fw || !cur.fh || !cur.durations.length) continue;
    out.set(name, { ...cur, name, sheet: cur.name });
  }
  return out;
}

// PNG 머리말에서 크기만 읽는다 (행 수 = 높이 / 칸 높이)
function pngSize(buf) {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// 상태별 클립을 고른다. 없는 동작은 조용히 건너뛴다
function buildClips(zip) {
  const xml = zip.get("AnimData.xml");
  if (!xml) return null;
  const anims = parseAnimData(xml.toString("utf8"));

  const clips = {};
  let cellW = 0;
  let cellH = 0;
  for (const [state, candidates] of Object.entries(STATE_ANIMS)) {
    for (const [anim, mode] of candidates) {
      const a = anims.get(anim);
      if (!a) continue;
      const png = zip.get(`${a.sheet}-Anim.png`);
      const size = png && pngSize(png);
      if (!size) continue;
      const cols = Math.floor(size.w / a.fw);
      const rows = Math.floor(size.h / a.fh);
      // 프레임 수가 선언과 다르면 시트가 깨진 것 — 쓰지 않는다
      if (cols !== a.durations.length || rows < 1) continue;

      clips[state] = {
        anim,
        mode,
        fw: a.fw,
        fh: a.fh,
        rows,
        row: Math.min(ROW_OF[state] ?? 0, rows - 1), // 1행짜리 동작 방어
        frames: a.durations.map((d, i) => ({ x: i, ms: Math.round(d * DUR_UNIT) })),
        dataUrl: `data:image/png;base64,${png.toString("base64")}`,
      };
      cellW = Math.max(cellW, a.fw);
      cellH = Math.max(cellH, a.fh);
      break;
    }
  }
  if (!clips.idle) return null; // idle 도 못 구하면 이 펫은 PMD 로 못 그린다
  return { cell: { w: cellW, h: cellH }, clips };
}

module.exports = { readZipClips: (buf) => buildClips(readZip(buf)), buildClips, parseAnimData, STATE_ANIMS };
