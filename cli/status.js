// pokebuddy status — 펫이 이상하게 보일 때 지금 판정 상태를 한 번에 보여 준다.
// 경로·설정·판정은 전부 공통 모듈에서 온다 — 펫과 같은 코드를 쓴다 (두 벌이면 진단이 거짓말을 한다)
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const settings = require("../config.js");
const state = require("../dist/follow/state.js");
const dex = require("../lib/dex.js");
const { parseCredits } = require("../art/pmd-load.js");
const { currentSession, livePets, companionPid, liveWindowPets } = require("./session.js");
const { hookInstalled } = require("./setup.js");
const i18n = require("../lib/i18n.js");
const { petName } = require("../lib/names.js");

const PROJECT = path.join(__dirname, "..");
const { PATHS, USER_DEFAULTS } = settings;

const say = (line = "") => process.stdout.write(`${line}\n`);
const age = (at) => (Date.now() / 1000 - (at || 0)).toFixed(1);

function status(petArg) {
  // 펫을 띄울 때와 같은 규칙으로 세션·터미널을 잡는다 — CLI LLM 안에서 !pokebuddy status 로 봐야 그 세션이 잡힌다
  const session = currentSession();
  const config = settings.load();

  say(`설정 파일: ${PATHS.config}`);
  say(`  ${Object.keys(USER_DEFAULTS).map((k) => `${k}=${config[k]}`).join(" ")}`);

  // 설치 상태 — 훅이 없는 CLI 에서는 상태별 동작 없이 기본 동작(산책·수면)만 돈다
  const hooks = hookInstalled();
  say(`상태 훅 파일: ${!hooks.file ? "없음 — pokebuddy setup" : hooks.current ? "최신" : "옛 버전 — pokebuddy setup 으로 바꾼다"}`);
  for (const cli of hooks.clis) {
    const head = `  ${cli.name.padEnd(12)}`;
    if (!cli.used) say(`${head}안 씀 (설정 폴더 없음)`);
    else if (cli.error) say(`${head}${cli.error}`);
    else if (cli.registered < cli.total) say(`${head}덜 등록됨 (${cli.registered}/${cli.total}) — pokebuddy setup`);
    else say(`${head}등록됨 (${cli.registered}/${cli.total})`);
  }

  // 펫이 스스로 끝난 이유 — 펫의 출력은 평소 버려지므로 여기서만 보인다
  try {
    const e = JSON.parse(fs.readFileSync(PATHS.lastError, "utf8"));
    say(`마지막 펫 실패: ${e.slug} — ${e.message} (${Math.round(Number(age(e.at)) / 60)}분 전)`);
  } catch {
    // 실패 기록 없음
  }

  const { records, chain, term, guess, termFrom } = session;
  const how = {
    ancestors: guess != null && guess !== term ? `확장 기록으로 바로잡음 (추정 ${guess})` : "확장 기록과 조상이 맞음",
    focus: "조상에서 못 찾아 포커스된 창의 활성 탭으로 잡음 — 부모 관계가 끊긴 체인",
    given: "POKEBUDDY_TERM_PID",
    guess: records.length
      ? "추정 — 조상에서 탭을 못 찾았고 포커스된 VS Code 창도 없어 탭 구분이 꺼진다"
      : "추정 — 확장 기록이 없어 탭 구분이 꺼진다",
  }[termFrom];
  say(`\n이 터미널 셸 번호: ${term} (${how})`);
  say(
    session.host
      ? `이 세션: pid ${session.host} — 끝나면 이 세션의 펫도 끝난다`
      : "이 세션: 셸에서 바로 실행 (CLI LLM 안이면 !pokebuddy status) — 터미널 셸이 끝나면 펫도 끝난다",
  );
  const myPids = state.pidsUpTo(chain, term);
  say(`내 프로세스 체인: ${[...myPids].join(" ")}`);

  say(`\n살아 있는 IDE 창 기록 ${records.length}건 (${PATHS.windows})`);
  const mine = state.myRecord(records, myPids);
  for (const rec of records) {
    say(
      `  ${String(rec.windowId).slice(0, 8)}  활성탭=${rec.activeTerminal}  탭들=[${rec.terminals.join(",")}]` +
        `  포커스=${rec.focused}  ${age(rec.at)}초 전  ${rec === mine ? "← 내 창" : ""}`,
    );
  }
  if (!records.length) say("  없음 — 에디터 확장이 없거나 아직 기록 전 (탭 구분이 꺼진다)");

  const tab = state.tabAxis(mine, myPids);
  say(`\n탭 축(내 탭이 활성인가): ${tab === null ? "알 수 없음 — 확장 없음" : tab}`);

  // 창 주인은 앱 이름이 아니라 프로세스 조상으로 찾는다 — 여기서도 같은 방법으로 보여 준다
  try {
    const [cmd, args] =
      process.platform === "win32"
        ? ["powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(PROJECT, "helpers", "winbounds.ps1")]]
        : [path.join(PROJECT, "helpers", "winbounds"), []];
    const wins = JSON.parse(execFileSync(cmd, args, { encoding: "utf8", windowsHide: true })).windows;
    const owner = state.ownerPidOf(chain, wins);
    const mineWins = wins.filter((w) => w.pid === owner);
    say(`\n내 터미널을 띄운 프로그램: ${mineWins.length ? mineWins[0].app : "못 찾음"} (pid ${owner})`);
    say(`  그 프로그램의 창 ${mineWins.length}개: ${mineWins.map((w) => w.id).join(", ")}`);
    say(`  지금 화면 맨 앞 창: ${wins[0] ? `${wins[0].app} id=${wins[0].id}` : "없음"}`);
  } catch {
    say("\n창 목록을 읽지 못했다 — 창 추적 헬퍼가 없거나 이 플랫폼에서 못 쓴다");
  }

  let files = [];
  try {
    files = fs
      .readdirSync(PATHS.state)
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.join(PATHS.state, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  } catch {
    // 훅이 아직 한 번도 기록하지 않았다
  }
  say(`\n세션 상태 기록 ${files.length}건 (최신순)${files.length ? "" : " — 훅을 설치한 뒤 CLI LLM 을 한 번 실행하면 생긴다"}`);
  for (const file of files.slice(0, 10)) {
    let record;
    try {
      record = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const inTerminal = state.stateIsMine(record, myPids, config.runtime.matchCwd);
    const bySession = session.host && Array.isArray(record.ancestors) && record.ancestors.includes(session.host);
    const prompt = record.promptAt ? `  프롬프트 ${age(record.promptAt)}초 전` : "";
    say(
      `  ${path.basename(file).slice(0, 8)}  ${String(record.cli || "claude").padEnd(6)}  기록=${record.state}` +
        ` → 지금=${state.resolveState(record)}  ${age(record.at)}초 전${prompt}  ` +
        `${bySession ? "← 이 세션" : inTerminal ? "이 터미널" : "다른 터미널"}`,
    );
  }
  // 펫과 같은 규칙 — 셸에서 바로 띄운 펫은 CLI 상태를 따르지 않는다
  const terminalOnly = !session.host;
  const info = state.sessionInfo(PATHS.state, { myPids, matchCwd: config.runtime.matchCwd, hostPid: session.host, terminalOnly });
  say(`\n이 세션 펫이 보여야 할 동작: ${info.state}${terminalOnly ? " (셸에서 띄운 펫은 CLI 상태를 따르지 않고 기본 동작만)" : ""}`);
  // buddy 는 마지막 사용자 활동 5분 뒤에 잠든다 — 프롬프트 시각이 그 근거 중 하나다
  say(`마지막 프롬프트: ${info.promptAt ? `${age(info.promptAt)}초 전` : "기록 없음 (훅이 옛 버전이거나 아직 입력 전)"}`);

  // PMD 그림 — CC BY-NC 4.0 이라 저작자 표시가 조건이다. 펫마다 그린 사람이 다르다
  const slug = petArg || config.slug;
  const d = dex.dexPath(slug);
  say(`\nPMD 그림 (${slug}${d ? ` · 도감 ${d}` : ""}) — ${PATHS.pmd}`);
  if (!d) {
    say(`  도감 번호를 모름 — PMD 로는 못 그린다. 비슷한 이름: ${dex.suggest(slug).join(", ") || "없음"}`);
  } else {
    const zip = path.join(PATHS.pmd, `${d}.zip`);
    say(`  캐시: ${fs.existsSync(zip) ? `${Math.round(fs.statSync(zip).size / 1024)}KB` : "없음 — 처음 띄울 때 받는다"}`);
    let authors = [];
    try {
      authors = parseCredits(fs.readFileSync(path.join(PATHS.pmd, `${d}.credits.txt`), "utf8"));
    } catch {
      // 저작자 목록을 아직 못 받음
    }
    const names = [...new Set(authors.map((a) => a.author))];
    say(`  그린 사람: ${names.length ? names.join(", ") : "목록 없음"}`);
    say("  출처: PMDCollab/SpriteCollab (https://sprites.pmdcollab.org) · CC BY-NC 4.0");
  }

  // 떠 있는 펫 — pokebuddy 가 남긴 pid 파일로 센다 (Windows 에는 ps 가 없다)
  const pets = livePets();
  const here = pets.filter((pet) => pet.key === session.key);
  say(`\n떠 있는 펫: ${pets.length}마리 (이 세션 ${here.length}마리) — ${PATHS.pets}`);
  for (const pet of here) say(`  ${pet.slug.padEnd(14)}  순번 ${pet.index}  pid ${pet.pid}  ${pet.ready ? "떠 있음" : "뜨는 중"}`);

  // 동반자·창 펫 — 세션 펫과 다른 파일로 산다 (companion.lock · w-<호스트>-<pid>.pid)
  const companion = companionPid();
  const windowPets = liveWindowPets();
  say(`\n동반자: ${companion ? `떠 있음 (pid ${companion}) — 내리기: pokebuddy companion stop` : "없음 — 띄우기: pokebuddy companion"}`);
  if (windowPets.length) {
    say(`창 펫: ${windowPets.length}마리 — ${windowPets.map((p) => `확장 호스트 ${p.hostPid} · pid ${p.pid}${p.ready ? "" : " (뜨는 중)"}`).join(", ")}`);
  } else say(`창 펫: 없음 (VS Code 확장 0.3.0 이 창을 열 때 띄운다${companion ? " — 동반자가 떠 있으면 띄우지 않는다" : ""})`);
  let cliInfo = null;
  try {
    cliInfo = JSON.parse(fs.readFileSync(PATHS.cli, "utf8"));
  } catch {
    // 아직 setup 전
  }
  if (!cliInfo) say("실행 경로 기록: 없음 — pokebuddy setup (없으면 확장이 펫을 못 띄운다)");
  else if (cliInfo.electron && fs.existsSync(cliInfo.electron)) say(`실행 경로 기록: ${PATHS.cli} (v${cliInfo.version})`);
  else say(`실행 경로 기록: Electron 경로가 없음 — pokebuddy setup 을 다시 (${cliInfo.electron || "null"})`);

  // 게임 진행 — 저장 v2 를 읽기 전용으로 본다 (쓰는 쪽은 떠 있는 동반자·창 펫). repair:false — 파손 파일을 옮기는 것은 writer 의 일.
  // 세션 펫은 저장을 모른다
  try {
    const { state: save, corrupted, reason } = require("../dist/save/store.js").read(PATHS.save, { repair: false });
    const { nature } = require("../dist/dex/natures.js");
    const lang = i18n.langOf(config);
    if (corrupted) say(`\n게임: 저장이 깨짐 — 펫이 다음에 열 때 save.json.bak 으로 옮기고 새로 시작한다 (${PATHS.save})`);
    else if (reason === "unreadable") say(`\n게임: 저장을 읽지 못함 — 잠김·권한. 잠시 뒤 다시 (${PATHS.save})`);
    else if (!save) say(`\n게임: 저장 없음 — 처음 띄울 때 스타터를 고른다 (${PATHS.save})`);
    else {
      say(`\n게임: 칸 ${save.slots} · 포인트 ${save.points} · 파티 ${save.party.length}마리 (${PATHS.save})`);
      // 마리마다 이름(별명 우선) · 성격(표의 이름, 모르면 id) · 보임 · 친밀도
      const pets = save.party.map((p) => {
        const n = nature(p.nature);
        const natureLabel = (n && (n.name[lang] || n.name.ko)) || p.nature;
        return `${p.nick ?? petName(p.species, lang)}(${natureLabel} · ${p.shown ? "보임" : "숨김"} · 친밀도 ${p.affinity})`;
      });
      if (pets.length) say(`  ${pets.join(", ")}`);
    }
  } catch (e) {
    say(`\n게임: 읽지 못함 — ${e.message}`);
  }
}

module.exports = { status };
