// save.json 읽기·쓰기 — 게임 진행의 유일한 저장소. 경로는 config.js PATHS.save
//
// 쓰기는 tmp 에 쓰고 rename (config.js save 와 같다) — 쓰다 죽어도 반쪽 파일이 남지 않는다.
// Windows 는 읽는 쪽이 파일을 열고 있으면 rename 이 EPERM/EBUSY 를 낸다 — 50ms 뒤 다시 (확장 extension.js write 의 패턴).
//   기다림은 동기(Atomics.wait) — 부르는 쪽(tick·act)이 동기라 짧게 멈추는 쪽을 택했다. 최악 150ms, 그것도 Windows 충돌 때만
// 파손 파일은 save.json.bak 으로 옮기고 state:null — 부르는 쪽이 새로 시작한다.
//   진행을 잃는 유일한 경로라 결과에 corrupted:true 를 담는다 (앱이 알림을 띄운다)
// 스키마 검증은 너그럽다 — 빠진 필드는 기본값으로 채우고, 뼈대(v·party)가 아니면 파손으로 본다
const fs = require("fs");
const path = require("path");
const economy = require("./economy");

const { RULES } = economy;

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const num = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// 동기 대기 — 메인 스레드에서도 된다. setTimeout 을 쓰면 write 가 async 가 되어 부르는 쪽이 전부 번진다
function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // 못 기다리면 바로 다시 시도한다
  }
}

// 파일 하나를 원자적으로 쓴다 — tmp + rename, 실패하면 잠깐 뒤 다시. 끝내 실패하면 false (조용히)
function writeAtomic(file, data) {
  const text = typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`;
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  } catch {
    return false;
  }
  for (let i = 0; i < RULES.io.writeRetries; i++) {
    try {
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, file);
      return true;
    } catch (e) {
      if (i === RULES.io.writeRetries - 1 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) {
        try {
          fs.unlinkSync(tmp);
        } catch {
          // 이미 없다
        }
        return false;
      }
      sleepSync(RULES.io.writeRetryMs);
    }
  }
  return false;
}

// 펫 하나 — 빠진 필드는 기본값. species 가 없으면 못 쓰는 펫
function normalizePet(raw) {
  if (!isObj(raw) || typeof raw.species !== "string" || !raw.species) return null;
  const base = economy.newPet(raw.species, num(raw.since, 0));
  return {
    ...base,
    nick: typeof raw.nick === "string" ? raw.nick : null,
    affinity: Math.max(0, num(raw.affinity)),
    stage: Math.max(0, Math.min(RULES.stages.length, Math.floor(num(raw.stage)))),
    mood: Math.min(RULES.mood.max, Math.max(RULES.mood.min, num(raw.mood, RULES.mood.start))),
    shiny: raw.shiny === true,
    everstone: raw.everstone === true,
    fedAt: numOrNull(raw.fedAt),
    playedAt: numOrNull(raw.playedAt),
    evolved: Array.isArray(raw.evolved) ? raw.evolved.filter((s) => typeof s === "string") : [],
  };
}

// 파일 내용 → state. 뼈대가 아니면 null (파손)
function normalize(raw) {
  if (!isObj(raw) || raw.v !== RULES.version || !isObj(raw.party)) return null;
  const party = {};
  for (const [key, p] of Object.entries(raw.party)) {
    const pet = normalizePet(p);
    if (!pet) return null;
    party[key] = pet;
  }
  const keys = Object.keys(party);
  const active = typeof raw.active === "string" && party[raw.active] ? raw.active : keys[0] || null;
  const d = isObj(raw.daily) ? raw.daily : {};
  const daily = economy.freshDaily(typeof d.date === "string" ? d.date : "", Math.max(1, Math.floor(num(d.streak, 1))));
  for (const k of ["gained", "feeds", "plays", "pokes", "presence", "work", "turns"]) daily[k] = Math.max(0, num(d[k]));
  const a = isObj(raw.acc) ? raw.acc : {};
  const acc = economy.freshAcc();
  for (const k of ["presenceMs", "workMs", "neglectMs"]) acc[k] = Math.max(0, num(a[k]));
  acc.failedAt = Array.isArray(a.failedAt) ? a.failedAt.filter((t) => typeof t === "number") : [];
  return {
    v: RULES.version,
    points: Math.max(0, num(raw.points)),
    active,
    party,
    inventory: isObj(raw.inventory) ? { ...raw.inventory } : {},
    daily,
    log: Array.isArray(raw.log) ? raw.log.filter(isObj).slice(-RULES.log.keep) : [],
    acc,
  };
}

// 파손 파일을 .bak 으로 — 덮어쓴다 (두 번 깨지면 마지막 것만 남는다). 못 옮기면 복사 후 삭제, 그것도 안 되면 그대로 둔다
function quarantine(file) {
  const bak = `${file}.bak`;
  try {
    fs.renameSync(file, bak);
    return true;
  } catch {
    try {
      fs.copyFileSync(file, bak);
      fs.unlinkSync(file);
      return true;
    } catch {
      return false;
    }
  }
}

// 읽기 — { state, corrupted }
//   없음        { state: null, corrupted: false }
//   정상        { state, corrupted: false }
//   파손        { state: null, corrupted: true } — repair 면 .bak 으로 옮긴다 (writer 만). 읽기 전용은 손대지 않는다
function read(file, { repair = true } = {}) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return { state: null, corrupted: false };
    return { state: null, corrupted: false, reason: "unreadable" }; // 잠김·권한 — 다음에 다시 읽는다
  }
  let state = null;
  try {
    state = normalize(JSON.parse(text.replace(/^﻿/, "")));
  } catch {
    state = null;
  }
  if (state) return { state, corrupted: false };
  if (repair) quarantine(file);
  return { state: null, corrupted: true };
}

// 쓰기 — 성공 여부만. 실패는 무시하고 다음 갱신에 다시 쓴다 (config 저장과 같은 태도)
function write(file, state) {
  return writeAtomic(file, state);
}

module.exports = { read, write, writeAtomic, normalize, sleepSync };
