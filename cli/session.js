// 이 명령을 실행한 세션과 그 세션의 펫 — pokebuddy 실행·내리기·진단(status)이 같은 규칙을 쓴다.
// 판정 자체는 lib/state.js 에 있다 (펫 main.js 와 같은 코드)
const fs = require("fs");
const settings = require("../config.js");
const state = require("../lib/state.js");

const { PATHS } = settings;

// 반환: { chain, host, term, guess, termFrom, key, records }
//   chain     이 명령부터 가까운 순서의 조상 pid
//   host      펫이 따라 살고 죽을 세션 프로세스 (CLI LLM 안의 !pokebuddy 면 그 CLI). 셸에서 바로 쳤으면 null
//   term      터미널 탭의 셸. guess 는 조상으로 한 첫 추정
//   termFrom  term 을 어디서 알았나 — "ancestors"(확장 기록의 탭이 조상에 있음) · "focus"(포커스된 창의 활성 탭) ·
//             "given"(POKEBUDDY_TERM_PID) · "guess"(확장 기록 없음 — 탭 구분이 꺼진다)
//   key       pid 파일 이름에 쓰는 세션 번호 — 펫 목록·내리기가 이 번호로 이 세션의 펫을 고른다
// Windows 는 프로세스 표를 PowerShell 로 읽어 1초쯤 걸린다 — 한 번만 읽는다
function currentSession() {
  let parent = null;
  try {
    parent = state.parentMap();
  } catch {
    // 프로세스 표를 못 읽음 — 부모만 안다
  }
  const chain = parent ? state.ancestorPids(process.pid, parent) : [];
  const records = state.readWindowRecords(PATHS.windows);
  const found = resolveTerminal(chain, parent && parent.names, records);
  let { term, termFrom } = found;
  // 직접 줄 수도 있다 — 조상 체인이 끊기는 환경(tmux 등)에서 탭을 맞출 때
  const given = Number(process.env.POKEBUDDY_TERM_PID);
  if (given > 0) {
    term = given;
    termFrom = "given";
  }
  if (term == null) term = process.ppid;

  return { chain, host: found.host, term, guess: found.guess, termFrom, key: found.host ?? term, records };
}

// 세션과 터미널 탭 — 파일·프로세스를 읽지 않는 부분만 따로 두었다 (시험용)
function resolveTerminal(chain, names, records) {
  let { host, term } = state.sessionAnchor(chain, names);
  const guess = term;
  const listed = state.terminalFromRecords(chain, records);
  if (listed != null) {
    // 세션이 터미널 셸보다 위에 있다면 세션이 아니다 — 셸에서 바로 친 것이다
    if (host != null && chain.indexOf(host) > chain.indexOf(listed)) host = null;
    return { host, term: listed, guess, termFrom: "ancestors" };
  }
  // 확장 기록은 있는데 조상에서 내 탭을 못 찾았다 — 부모 관계가 끊긴 체인(Git Bash 가 끼었는데 ps 로도 못 이은 경우 등).
  // 명령을 친 순간 포커스된 창의 활성 탭이 곧 이 명령을 친 탭이다. 못 찾은 채로 두면 펫이 탭을 몰라 창의 모든 탭에서 보인다
  const focused = records.filter((r) => !r.remote && r.focused === true && r.activeTerminal != null);
  if (focused.length === 1) return { host, term: focused[0].activeTerminal, guess, termFrom: "focus" };
  return { host, term, guess, termFrom: "guess" };
}

// 살아 있는 펫 — [{ file, key, pid, index, slug, ready }] 를 순번 차례로. 죽은 펫이 남긴 파일은 지운다
// 파일 이름 모양은 config.js petFile — 펫 이름에 - 가 들어가므로(charizard-3d) 이름을 맨 뒤에 둔다
const PET_FILE = /^(\d+)-(\d+)-(\d+)-(.+)\.pid$/;
function livePets() {
  let names = [];
  try {
    names = fs.readdirSync(PATHS.pets).filter((f) => PET_FILE.test(f));
  } catch {
    return []; // 아직 한 번도 띄운 적 없음
  }
  const pets = [];
  for (const name of names) {
    const [, key, pid, index, slug] = name.match(PET_FILE);
    const file = settings.petFile(key, pid, index, slug);
    if (!state.pidAlive(Number(pid))) {
      fs.rmSync(file, { force: true });
      continue;
    }
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue; // 방금 내려졌다
    }
    pets.push({ file, key: Number(key), pid: Number(pid), index: Number(index), slug, ready: /\bready\b/.test(text) });
  }
  return pets.sort((a, b) => a.index - b.index);
}

module.exports = { currentSession, resolveTerminal, livePets };
