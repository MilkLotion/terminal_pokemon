// 게임 경제 — 친밀도·기분·포인트·하루 리셋의 규칙. 파일·Electron·실제 시각을 모른다.
//
// 숫자는 전부 RULES 한 곳에 (buddy/brain.js 의 RHYTHM 처럼 써 보며 고친다). 다른 파일은 여기서 가져다 쓴다.
// 함수는 (state, now, input) → { state, result } 꼴 — 들어온 state 는 건드리지 않고 복사본을 돌려준다.
//   그래서 node 만으로 시각을 돌려 가며 시험할 수 있다 (scripts/selftest-game.js)
// 결과는 문구가 아니라 코드 — { ok, kind, gained, mood, nextAt, reason }. 문구는 UI 가 언어별로 만든다
//   reason  ok · daily-cap(총량 도달 — 기분만 올랐다) · cooldown · daily-count · no-pet · unknown-pet · exists · not-starter
// 친밀도·단계는 절대 줄지 않는다 (결정). 오르내리는 것은 기분(mood)만
// 시각은 전부 ms (Date.now()) — 저장 파일의 since·fedAt·log[].at 도 같은 단위

const RULES = {
  version: 1, // save.json 스키마 버전 (v)
  // 친밀도 원천 — gain 은 한 번(시간 원천은 per 마다)의 양.
  //   dailyPoints  그 원천으로 하루에 받을 수 있는 포인트 상한
  //   dailyCount   하루 횟수 상한
  //   cooldown     다음 번까지 기다리는 시간
  sources: {
    presence: { per: 10 * 60_000, gain: 1, dailyPoints: 30 }, // 펫이 보이는 10분마다 +1, 하루 30 — 에이전트가 없어도
    work: { per: 60_000, gain: 1, dailyPoints: 60 }, // 보이는 동안 에이전트가 running 인 1분마다 +1, 하루 60
    turn: { gain: 2, dailyCount: 20 }, // 에이전트가 waving 으로 바뀌는 순간(턴 완료) +2, 하루 20회
    feed: { gain: 15, cooldown: 4 * 3600_000 }, // 밥 +15, 4시간 쿨다운
    play: { gain: 10, cooldown: 2 * 3600_000 }, // 놀기 +10, 2시간 쿨다운
    poke: { gain: 1, dailyCount: 10 }, // 콕 찌르기 +1, 하루 10회
  },
  dailyCap: 150, // 하루 총량 — 넘으면 친밀도는 멈추고 기분만 오른다 (그라인딩 방지)
  mood: {
    min: 0,
    max: 100,
    start: 60, // 새 펫의 시작 기분 [스펙 미확정]
    feed: 10,
    play: 5,
    poke: 1,
    neglect: 1, // 보이는 동안 돌봄 없이 neglectPer 마다 −1 — 안 보일 때(자는 동안)는 빼지 않는다
    neglectPer: 3600_000,
    failed: 5, // 에이전트가 failed 로 바뀌는 순간 −5
    failedWindow: 3600_000, // 이 시간 안에 합쳐 failedWindowCap 까지만
    failedWindowCap: 10,
  },
  stages: [500, 1500], // 단계 임계 — stage 0→1 은 500, 1→2 는 1500. 실제 진화는 M3 (여기서는 준비 판정만)
  streak: { perDay: 5, cap: 30 }, // 오늘 첫 교감에 포인트 +5 × streak, 상한 30
  log: { keep: 200 }, // 기록 탭·status 가 보여 주는 최근 건수
  // 파일 통로의 시간 — 게임 숫자는 아니지만 "숫자는 한 곳에" 를 지킨다
  io: {
    tickMs: 10_000, // main.js 가 tick 을 부르는 간격 (참고값 — 코어는 elapsed 로 계산하므로 더 자주 불러도 된다)
    maxElapsedMs: 30_000, // 한 tick 에 인정하는 최대 경과 — 잠자기에서 깨어나 몇 시간이 한꺼번에 들어오는 것을 막는다
    writeRetries: 3, // Windows 는 읽는 쪽이 열고 있으면 rename 이 막힌다 — 잠깐 뒤 다시
    writeRetryMs: 50,
    mailboxPollMs: 5_000, // fs.watch 보강 폴링
    resultTtlMs: 60_000, // 안 가져간 .result.json 청소
    requestTtlMs: 60_000, // 이보다 오래된 요청은 처리하지 않고 지운다 — 죽은 writer 가 남긴 며칠 전 밥을 주지 않게
    sendTimeoutMs: 2_000, // 보낸 쪽이 결과를 기다리는 시간 (CLI 가 2초 기다려 출력)
    sendPollMs: 100,
  },
};

// 첫 실행에 고를 수 있는 종 — 세대별 스타팅 3종 × 9세대 + 피카츄·이브이 = 29종 (design.md 스타터)
const STARTERS = [
  "bulbasaur", "charmander", "squirtle",
  "chikorita", "cyndaquil", "totodile",
  "treecko", "torchic", "mudkip",
  "turtwig", "chimchar", "piplup",
  "snivy", "tepig", "oshawott",
  "chespin", "fennekin", "froakie",
  "rowlet", "litten", "popplio",
  "grookey", "scorbunny", "sobble",
  "sprigatito", "fuecoco", "quaxly",
  "pikachu", "eevee",
];
const isStarter = (slug) => STARTERS.includes(String(slug || "").toLowerCase());

// 교감 종류 → daily 의 횟수 필드
const COUNT_FIELD = { feed: "feeds", play: "plays", poke: "pokes", turn: "turns" };
// 교감 종류 → 펫의 마지막 시각 필드 (쿨다운 판정)
const LAST_AT_FIELD = { feed: "fedAt", play: "playedAt" };

const clone = (state) => structuredClone(state);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pad2 = (n) => String(n).padStart(2, "0");

// 로컬 날짜 문자열 YYYY-MM-DD — 하루 리셋의 기준. UTC 가 아니라 사용자의 하루
function localDate(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 어제의 로컬 날짜 — 오늘 0시에서 1ms 뒤로 (서머타임으로 하루가 23·25시간이어도 맞다)
function yesterdayOf(now) {
  const d = new Date(now);
  return localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - 1);
}

function freshDaily(date, streak) {
  return { date, gained: 0, feeds: 0, plays: 0, pokes: 0, presence: 0, work: 0, turns: 0, streak };
}

// 누적기 — 초 단위로 모아 10분·1분·1시간이 찰 때 친밀도·기분으로 바꾼다. failedAt 은 최근 한 시간의 실패 감점 시각
function freshAcc() {
  return { presenceMs: 0, workMs: 0, neglectMs: 0, failedAt: [] };
}

function newPet(species, now) {
  return {
    species,
    nick: null,
    affinity: 0,
    stage: 0,
    mood: RULES.mood.start,
    shiny: false,
    everstone: false,
    since: now,
    fedAt: null,
    playedAt: null,
    evolved: [],
  };
}

function newState(now) {
  return {
    v: RULES.version,
    points: 0,
    active: null,
    party: {},
    inventory: {},
    daily: freshDaily(localDate(now), 1),
    log: [],
    acc: freshAcc(),
  };
}

const activePet = (state) => (state && state.active && state.party[state.active]) || null;

// 다음 단계 임계 — 마지막 단계면 null
const nextThreshold = (pet) => (pet && pet.stage < RULES.stages.length ? RULES.stages[pet.stage] : null);

// 다음 임계에 닿았고 에버스톤이 아니다 — 실제 진화는 M3
function stageReady(pet) {
  const next = nextThreshold(pet);
  return next != null && pet.affinity >= next && !pet.everstone;
}

// 기록 — 최근 keep 건만. state 를 직접 고친다 (부르는 쪽이 이미 복사본을 들고 있다)
function pushLog(state, entry) {
  state.log.push(entry);
  if (state.log.length > RULES.log.keep) state.log.splice(0, state.log.length - RULES.log.keep);
  return state;
}

// 파티 키 <종>#<순번> — 같은 종을 둘 가질 수 있다
function petKeyFor(state, species) {
  const taken = Object.keys(state.party).filter((k) => k.startsWith(`${species}#`)).length;
  return `${species}#${taken + 1}`;
}

// 스타터로 시작 — state 가 없을 때만. 파티 하나와 active 를 만든다
function start(state, now, slug) {
  const species = String(slug || "").toLowerCase();
  if (state && Object.keys(state.party).length) return { state, result: { ok: false, kind: "start", reason: "exists" } };
  if (!isStarter(species)) return { state, result: { ok: false, kind: "start", reason: "not-starter" } };
  const s = newState(now);
  const key = petKeyFor(s, species);
  s.party[key] = newPet(species, now);
  s.active = key;
  pushLog(s, { at: now, kind: "start", pet: key });
  return { state: s, result: { ok: true, kind: "start", key, species, reason: "ok" } };
}

// 하루 리셋 — 로컬 날짜가 바뀌면 daily 를 비운다.
// streak 은 어제 교감(feed·play·poke 중 하나)했으면 +1, 아니면 1. 이틀 비웠으면 daily.date 가 어제가 아니라 1
// 날짜가 같으면 들어온 state 를 그대로 돌려준다 (복사 없음)
function rollDay(state, now) {
  const today = localDate(now);
  if (state.daily.date === today) return { state, rolled: false };
  const prev = state.daily;
  const interacted = prev.feeds + prev.plays + prev.pokes > 0;
  const streak = prev.date === yesterdayOf(now) && interacted ? prev.streak + 1 : 1;
  const s = clone(state);
  s.daily = freshDaily(today, streak);
  s.acc.failedAt = [];
  pushLog(s, { at: now, kind: "day", date: today, streak });
  return { state: s, rolled: true };
}

// 친밀도를 준다 — 하루 총량과 원천별 상한을 넘지 않게 자른다. 돌려주는 값은 실제로 오른 양.
// s·pet 은 이미 복사본 (직접 고친다)
function grant(s, pet, source, amount) {
  const rule = RULES.sources[source];
  let room = RULES.dailyCap - s.daily.gained;
  if (rule.dailyPoints != null) room = Math.min(room, rule.dailyPoints - (s.daily[source] || 0));
  const gained = Math.max(0, Math.min(amount, room));
  pet.affinity += gained;
  s.daily.gained += gained;
  if (rule.dailyPoints != null) s.daily[source] = (s.daily[source] || 0) + gained;
  return gained;
}

const bumpMood = (pet, delta) => {
  pet.mood = clamp(pet.mood + delta, RULES.mood.min, RULES.mood.max);
};

// 직접 돌봄 — feed · play · poke
//   쿨다운(feed·play)·하루 횟수(poke)에 걸리면 ok:false. 하루 총량에 닿았으면 ok:true 지만 gained 0 · reason daily-cap (기분만)
//   오늘 첫 교감이면 포인트 보너스 (bonus). 돌봄은 방치 시계를 되돌린다
function interact(state, now, kind) {
  const rule = RULES.sources[kind];
  if (!rule || !COUNT_FIELD[kind] || kind === "turn") return { state, result: { ok: false, kind, reason: "unknown-cmd" } };
  const s = clone(rollDay(state, now).state);
  const pet = activePet(s);
  if (!pet) return { state, result: { ok: false, kind, reason: "no-pet" } };

  const lastAt = LAST_AT_FIELD[kind] ? pet[LAST_AT_FIELD[kind]] : null;
  if (rule.cooldown && lastAt != null && now - lastAt < rule.cooldown) {
    return { state, result: { ok: false, kind, reason: "cooldown", nextAt: lastAt + rule.cooldown, mood: pet.mood } };
  }
  const countField = COUNT_FIELD[kind];
  if (rule.dailyCount != null && s.daily[countField] >= rule.dailyCount) {
    return { state, result: { ok: false, kind, reason: "daily-count", left: 0, mood: pet.mood } };
  }

  const first = s.daily.feeds + s.daily.plays + s.daily.pokes === 0;
  const gained = grant(s, pet, kind, rule.gain);
  bumpMood(pet, RULES.mood[kind]);
  s.daily[countField] += 1;
  if (LAST_AT_FIELD[kind]) pet[LAST_AT_FIELD[kind]] = now;
  s.acc.neglectMs = 0;
  const bonus = first ? Math.min(RULES.streak.perDay * s.daily.streak, RULES.streak.cap) : 0;
  s.points += bonus;
  pushLog(s, { at: now, kind, pet: s.active, gained, mood: pet.mood, ...(bonus ? { bonus } : {}) });

  return {
    state: s,
    result: {
      ok: true,
      kind,
      reason: gained === 0 ? "daily-cap" : "ok",
      gained,
      capped: gained < rule.gain, // 총량에 걸려 일부만 올랐다
      bonus,
      mood: pet.mood,
      affinity: pet.affinity,
      points: s.points,
      nextAt: rule.cooldown ? now + rule.cooldown : null,
      left: rule.dailyCount != null ? rule.dailyCount - s.daily[countField] : null,
      stageReady: stageReady(pet),
    },
  };
}

// 시간 원천 — presence(보이는 시간) · work(보이는 동안 running 인 시간). elapsed(ms) 를 누적기에 더하고 per 가 찰 때마다 gain
function accrue(state, now, source, elapsed) {
  const rule = RULES.sources[source];
  if (!rule || !rule.per || !(elapsed > 0)) return { state, result: { gained: 0 } };
  const s = clone(rollDay(state, now).state);
  const pet = activePet(s);
  if (!pet) return { state, result: { gained: 0, reason: "no-pet" } };
  const field = `${source}Ms`;
  s.acc[field] = (s.acc[field] || 0) + elapsed;
  let gained = 0;
  while (s.acc[field] >= rule.per) {
    s.acc[field] -= rule.per;
    gained += grant(s, pet, source, rule.gain);
  }
  return { state: s, result: { gained } };
}

// 턴 완료 — 에이전트가 waving 으로 바뀌는 순간. 하루 횟수 상한
function turn(state, now) {
  const rule = RULES.sources.turn;
  const s = clone(rollDay(state, now).state);
  const pet = activePet(s);
  if (!pet) return { state, result: { ok: false, kind: "turn", reason: "no-pet", gained: 0 } };
  if (s.daily.turns >= rule.dailyCount) return { state: s, result: { ok: false, kind: "turn", reason: "daily-count", gained: 0 } };
  const gained = grant(s, pet, "turn", rule.gain);
  s.daily.turns += 1;
  return { state: s, result: { ok: true, kind: "turn", reason: gained === 0 ? "daily-cap" : "ok", gained } };
}

// 방치 — 보이는 동안 돌봄 없이 흐른 시간. neglectPer 마다 기분 −1
function neglect(state, now, elapsed) {
  if (!(elapsed > 0)) return { state, result: { moodDelta: 0 } };
  const s = clone(state);
  const pet = activePet(s);
  if (!pet) return { state, result: { moodDelta: 0 } };
  s.acc.neglectMs += elapsed;
  let delta = 0;
  while (s.acc.neglectMs >= RULES.mood.neglectPer) {
    s.acc.neglectMs -= RULES.mood.neglectPer;
    delta -= RULES.mood.neglect;
  }
  const before = pet.mood;
  bumpMood(pet, delta);
  return { state: s, result: { moodDelta: pet.mood - before } };
}

// 에이전트 실패 — failed 로 바뀌는 순간 −5. 한 시간 창 안에서 합쳐 −10 까지만
function agentFailed(state, now) {
  const s = clone(state);
  const pet = activePet(s);
  if (!pet) return { state, result: { ok: false, moodDelta: 0, reason: "no-pet" } };
  const m = RULES.mood;
  s.acc.failedAt = (s.acc.failedAt || []).filter((t) => now - t < m.failedWindow);
  if ((s.acc.failedAt.length + 1) * m.failed > m.failedWindowCap) {
    return { state: s, result: { ok: false, moodDelta: 0, reason: "window-cap" } };
  }
  s.acc.failedAt.push(now);
  const before = pet.mood;
  bumpMood(pet, -m.failed);
  return { state: s, result: { ok: true, moodDelta: pet.mood - before, reason: "ok" } };
}

// 화면에 나올 펫 바꾸기 — 파티에 있는 키만
function switchPet(state, now, key) {
  if (!state.party[key]) return { state, result: { ok: false, kind: "switch", reason: "unknown-pet" } };
  if (state.active === key) return { state, result: { ok: true, kind: "switch", reason: "ok", active: key, changed: false } };
  const s = clone(state);
  s.active = key;
  pushLog(s, { at: now, kind: "switch", pet: key });
  return { state: s, result: { ok: true, kind: "switch", reason: "ok", active: key, changed: true } };
}

// 한 틱 — main.js 가 10초마다(상태가 바뀔 때도) 부른다. 시간 원천·방치·턴·실패 전환을 한 번에 처리
//   elapsed    지난 틱부터의 경과(ms). 부르는 쪽이 maxElapsedMs 로 자른다
//   visible    펫이 보이는가 — 보일 때만 presence·work·방치가 흐른다
//   agent      에이전트 상태 idle · running · waiting · waving · failed
//   prevAgent  지난 틱의 상태 — waving·failed 로 "바뀌는" 순간만 세기 위해
// result.changed 는 저장할 값이 바뀌었는가 (누적기만 움직인 틱은 false — 부르는 쪽이 매 틱 쓰지 않게)
function tick(state, now, { elapsed = 0, visible = false, agent = "idle", prevAgent = agent } = {}) {
  const rolled = rollDay(state, now);
  let s = rolled.state;
  const result = { ok: true, rolled: rolled.rolled, gained: 0, turn: false, failed: false, moodDelta: 0, changed: rolled.rolled };
  if (!activePet(s)) return { state: s, result: { ...result, ok: false, reason: "no-pet" } };

  if (visible && elapsed > 0) {
    let r = accrue(s, now, "presence", elapsed);
    s = r.state;
    result.gained += r.result.gained;
    if (agent === "running") {
      r = accrue(s, now, "work", elapsed);
      s = r.state;
      result.gained += r.result.gained;
    }
    r = neglect(s, now, elapsed);
    s = r.state;
    result.moodDelta += r.result.moodDelta;
  }
  if (agent === "waving" && prevAgent !== "waving") {
    const r = turn(s, now);
    s = r.state;
    result.turn = r.result.ok;
    result.gained += r.result.gained;
  }
  if (agent === "failed" && prevAgent !== "failed") {
    const r = agentFailed(s, now);
    s = r.state;
    result.failed = r.result.ok;
    result.moodDelta += r.result.moodDelta;
  }
  const pet = activePet(s);
  result.changed = result.changed || result.gained > 0 || result.turn || result.moodDelta !== 0;
  result.mood = pet.mood;
  result.affinity = pet.affinity;
  result.stageReady = stageReady(pet);
  result.streak = s.daily.streak;
  return { state: s, result };
}

// 다음 가능 시각 — 쿨다운이 남았으면 그 시각, 아니면 null (지금 가능)
function nextAtOf(pet, kind, now) {
  const rule = RULES.sources[kind];
  const at = pet[LAST_AT_FIELD[kind]];
  return at != null && at + rule.cooldown > now ? at + rule.cooldown : null;
}

function petView(state, key, now) {
  const pet = state.party[key];
  if (!pet) return null;
  return {
    key,
    species: pet.species,
    nick: pet.nick,
    affinity: pet.affinity,
    stage: pet.stage,
    nextThreshold: nextThreshold(pet),
    stageReady: stageReady(pet),
    mood: pet.mood,
    shiny: pet.shiny,
    everstone: pet.everstone,
    since: pet.since,
    fedAt: pet.fedAt,
    playedAt: pet.playedAt,
    feedNextAt: nextAtOf(pet, "feed", now),
    playNextAt: nextAtOf(pet, "play", now),
    evolved: pet.evolved.slice(),
  };
}

// 메뉴·설정창·status 가 읽는 값. 날짜가 바뀌었으면 비운 daily 로 보여 준다 (writer 가 아직 틱을 안 돌렸어도)
function view(state, now) {
  const s = rollDay(state, now).state;
  const d = s.daily;
  return {
    v: s.v,
    points: s.points,
    active: s.active ? petView(s, s.active, now) : null,
    party: Object.keys(s.party).map((key) => petView(s, key, now)),
    daily: {
      date: d.date,
      gained: d.gained,
      cap: RULES.dailyCap,
      streak: d.streak,
      feeds: d.feeds,
      plays: d.plays,
      pokes: d.pokes,
      pokesLeft: Math.max(0, RULES.sources.poke.dailyCount - d.pokes),
      presence: d.presence,
      work: d.work,
      turns: d.turns,
      turnsLeft: Math.max(0, RULES.sources.turn.dailyCount - d.turns),
    },
    inventory: { ...s.inventory },
    log: s.log.slice(),
  };
}

module.exports = {
  RULES,
  STARTERS,
  isStarter,
  localDate,
  yesterdayOf,
  freshDaily,
  freshAcc,
  newPet,
  newState,
  activePet,
  nextThreshold,
  stageReady,
  pushLog,
  petKeyFor,
  start,
  rollDay,
  interact,
  accrue,
  turn,
  neglect,
  agentFailed,
  switchPet,
  tick,
  view,
};
