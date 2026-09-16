// pkmon status — 펫이 이상하게 보일 때 지금 판정 상태를 한 번에 보여 준다.
// 경로·설정·판정은 전부 공통 모듈에서 온다 — 펫과 같은 코드를 쓴다 (두 벌이면 진단이 거짓말을 한다)
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const settings = require("../config.js");
const state = require("../lib/state.js");
const dex = require("../lib/dex.js");
const { parseCredits } = require("../art/pmd-load.js");
const { terminalPid, RUN_DIR } = require("./run.js");
const { hookInstalled } = require("./setup.js");

const PROJECT = path.join(__dirname, "..");
const { PATHS, USER_DEFAULTS } = settings;

const say = (line = "") => process.stdout.write(`${line}\n`);
const age = (at) => (Date.now() / 1000 - (at || 0)).toFixed(1);

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

function status(petArg) {
  const termPid = terminalPid();
  const config = settings.load();

  say(`설정 파일: ${PATHS.config}`);
  say(`  ${Object.keys(USER_DEFAULTS).map((k) => `${k}=${config[k]}`).join(" ")}`);

  // 설치 상태 — pkmon setup 을 안 했으면 상태별 동작·수면 신호가 없다
  const hooks = hookInstalled();
  if (!hooks) say("Claude 훅: settings.json 을 읽을 수 없음");
  else if (hooks.registered < hooks.total || !hooks.file) {
    say(`Claude 훅: 덜 설치됨 (등록 ${hooks.registered}/${hooks.total}, 파일 ${hooks.file ? "있음" : "없음"}) — pkmon setup`);
  } else if (!hooks.current) say("Claude 훅: 옛 버전 파일 — pkmon setup 으로 바꾼다");
  else say(`Claude 훅: 설치됨 (${hooks.registered}/${hooks.total})`);

  // 펫이 스스로 끝난 이유 — 펫의 출력은 평소 버려지므로 여기서만 보인다
  try {
    const e = JSON.parse(fs.readFileSync(PATHS.lastError, "utf8"));
    say(`마지막 펫 실패: ${e.slug} — ${e.message} (${Math.round(Number(age(e.at)) / 60)}분 전)`);
  } catch {
    // 실패 기록 없음
  }

  // 펫과 같은 규칙으로 내 터미널을 잡는다 — 첫 추정을 확장 기록으로 바로잡는다
  const records = state.readWindowRecords(PATHS.windows);
  const chain = state.ancestorPids();
  const refined = state.terminalFromRecords(chain, records);
  const term = refined ?? termPid;
  say(`\n이 터미널 셸 번호: ${term}${refined != null && refined !== termPid ? ` (부모 ${termPid} 에서 확장 기록으로 바로잡음)` : ""}`);
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
  say(`\n세션 상태 기록 ${files.length}건 (최신순)${files.length ? "" : " — 훅을 설치한 뒤 Claude 를 한 번 실행하면 생긴다"}`);
  for (const file of files.slice(0, 10)) {
    let record;
    try {
      record = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const isMine = state.stateIsMine(record, myPids, config.runtime.matchCwd);
    const prompt = record.promptAt ? `  프롬프트 ${age(record.promptAt)}초 전` : "";
    say(
      `  ${path.basename(file).slice(0, 8)}  기록=${record.state}` +
        ` → 지금=${state.resolveState(record)}  ${age(record.at)}초 전${prompt}  ${isMine ? "← 이 터미널" : "다른 터미널"}`,
    );
  }
  const info = state.sessionInfo(PATHS.state, myPids, config.runtime.matchCwd);
  say(`\n이 터미널 펫이 보여야 할 동작: ${info.state}`);
  // buddy 는 마지막 사용자 활동 3분 뒤에 잠든다 — 프롬프트 시각이 그 근거 중 하나다
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

  // 떠 있는 펫 — pkmon 이 남긴 pid 파일로 센다 (Windows 에는 ps 가 없다)
  let all = 0;
  let here = 0;
  try {
    for (const name of fs.readdirSync(RUN_DIR).filter((f) => f.endsWith(".pid"))) {
      const pid = Number(fs.readFileSync(path.join(RUN_DIR, name), "utf8").trim());
      if (!(pid > 0) || !alive(pid)) continue;
      all += 1;
      if (name.startsWith(`${termPid}-`) || name.startsWith(`${term}-`)) here += 1;
    }
  } catch {
    // 아직 한 번도 띄운 적 없음
  }
  say(`\n떠 있는 펫: ${all}마리 (이 터미널 ${here}마리)`);
}

module.exports = { status };
