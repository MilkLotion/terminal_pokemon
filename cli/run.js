// pokebuddy <펫> — 이 명령을 실행한 세션에 펫을 붙이고 곧바로 돌아온다.
//
//   CLI LLM 안에서  !pokebuddy eevee   → 그 CLI(claude·codex·gemini…)가 끝나면 펫도 끝난다. 상태 훅이 있으면 상태에 반응한다
//   셸에서 바로     pokebuddy eevee    → 그 터미널 셸이 끝나면 펫도 끝난다. 산책·수면 같은 기본 동작만
//
// 명령(CLI)을 pokebuddy 가 띄우지 않는다. 예전처럼 감싸서 띄우면 claude 의 부모가 터미널 셸이 아니라 pokebuddy(node)가 되는데,
// 그렇게 뜬 claude 는 화면이 달랐다 (상태줄 이모지가 ♦ 로 나오고 탭 제목이 안 바뀜).
// 펫은 따로 떠서 스스로 세션이 끝났는지 본다 (main.js)
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const settings = require("../config.js");
const dex = require("../lib/dex.js");
const state = require("../lib/state.js");
const { optionEnv, petList } = require("./args.js");
const { checklist } = require("./checklist.js");
const { currentSession, livePets } = require("./session.js");

const PROJECT = path.join(__dirname, "..");
const { PATHS } = settings;
// 펫이 창을 만들 때까지 기다리는 시간 — 처음 띄우는 펫은 그림(PMD ZIP)을 받느라 몇 초 걸린다.
// 넘기면 더 기다리지 않고 돌아온다 (펫은 계속 뜨는 중이다)
const READY_TIMEOUT_MS = 15000;
// 바꿀 때 옛 펫이 끝나길 기다리는 시간 — 먼저 끝나야 새 펫이 전역 단축키를 가져간다
const GONE_TIMEOUT_MS = 5000;
const POLL_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 터미널 종류로 앱 이름을 넘긴다 — 다만 이건 대비책이다.
// 평소에는 펫이 자기 프로세스 조상에서 창 주인을 직접 찾으므로 여기 없는 프로그램도 동작한다.
// (tmux 처럼 조상 관계가 끊기는 경우에만 이 값이 쓰인다)
function anchorApp(env = process.env) {
  let term = env.TERM_PROGRAM || "";
  // TERM_PROGRAM 이 비어 있어도 VS Code 계열이면 주입 표시로 알아낸다
  if (!term && env.VSCODE_INJECTION) term = "vscode";
  const known = { vscode: "Code", ghostty: "Ghostty", "iTerm.app": "iTerm2", Apple_Terminal: "Terminal", WezTerm: "WezTerm" };
  if (known[term]) return known[term];
  if (process.platform === "win32" && env.WT_SESSION) return "WindowsTerminal";
  return "";
}

// 입력 이름 → 펫 이름. 소문자로 맞추고, 모르는 이름이면 비슷한 이름을 알려 준다.
// 도감표로 검사한다 — codex 스프라이트 저장소가 있으면 거기 폴더명(2D 가 없으면 -3d)을 따른다
function resolveSlug(input, source) {
  const name = String(input).toLowerCase().replace(/\s+/g, "");
  if (source && fs.existsSync(path.join(source, "pets"))) {
    for (const cand of [name, `${name}-3d`]) {
      if (fs.existsSync(path.join(source, "pets", cand, "spritesheet.webp"))) return { slug: cand };
    }
  }
  if (dex.dexOf(name) != null) return { slug: name };
  return { error: true, hints: dex.suggest(name) };
}

// Electron 실행 파일. require("electron") 은 쓰지 않는다 — Electron 44 는 실행 파일이 없으면 그 자리에서
// 100MB 를 받기 시작해 명령이 그만큼 멈추고, 오프라인이면 매번 스택을 찍는다.
// 받는 일은 설치(postinstall)와 pokebuddy setup 이 맡고, 여기서는 있는지만 본다
function electronPath() {
  try {
    const dir = path.dirname(require.resolve("electron/package.json"));
    const rel = fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim();
    const exe = path.join(dir, "dist", rel);
    return fs.existsSync(exe) ? exe : null;
  } catch {
    return null;
  }
}

// 펫이 스스로 끝났을 때 남긴 이유 (main.js reportFailure) — since 이후 것만
function lastError(since) {
  try {
    const e = JSON.parse(fs.readFileSync(PATHS.lastError, "utf8"));
    return e && e.at >= since ? e : null;
  } catch {
    return null;
  }
}

// 펫을 내린다 — 죽이지 않고 pid 파일만 지운다. 펫이 그걸 보고 스스로 끝난다.
// 프로세스를 직접 죽이면 Windows 에서는 정리 없이 끊기고, 이미 끝난 펫의 번호가 다른 프로세스에 재사용됐을 수도 있다
// 반환: 내린 펫의 pid 목록
function dismiss(pets) {
  for (const pet of pets) fs.rmSync(pet.file, { force: true });
  return pets.map((pet) => pet.pid);
}

const say = (line = "") => process.stdout.write(`${line}\n`);
const slugList = (pets) => pets.map((pet) => pet.slug).join(", ");
// 안내에 적는 명령 — CLI 안이면 ! 를 붙여야 그대로 따라 칠 수 있다
const commandFor = (session, rest) => `${session.host ? "!" : ""}pokebuddy ${rest}`;
// 이 세션의 떠 있는 펫 (순번 차례)
const sessionPets = (session) => livePets().filter((pet) => pet.key === session.key);

// 펫 프로세스를 따로 띄우고 번호를 돌려준다 (못 띄우면 null). 출력은 물려주지 않는다 — CLI LLM 은 ! 명령의 출력이
// 닫힐 때까지 기다린다. 따로 띄우는 이유: 이 명령은 곧바로 끝나는데, Windows 는 따로 띄우지 않은 자식을 부모(node)가
// 끝날 때 함께 끝내고, mac 은 같은 프로세스 그룹이면 세션 쪽 신호에 같이 죽는다.
//
// Windows 는 node 가 직접 띄우지 않고 PowerShell Start-Process 로 띄운다. node 의 spawn(CreateProcess)은 상속 가능한 핸들을
// 전부 넘겨서, 이 명령이 받은 출력 파이프까지 펫이 쥔다. codex 처럼 ! 명령을 PowerShell 로 돌려 출력을 파이프로 받는
// CLI 는 그 파이프가 닫힐 때까지 — 펫이 끝날 때까지 — 명령이 안 끝난다 (6초 사는 자식에 6.2초 실측).
// Start-Process 는 ShellExecute 라 핸들을 넘기지 않는다 (0.37초). 환경변수는 PowerShell 에서 그대로 이어진다
function launchPet(electron, env) {
  if (process.platform !== "win32") {
    return new Promise((resolve) => {
      const child = spawn(electron, [PROJECT], { stdio: "ignore", detached: true, env });
      child.once("spawn", () => resolve(child.pid));
      child.once("error", () => resolve(null));
      child.unref();
    });
  }
  // 경로는 환경변수로 넘긴다 — 명령줄에 끼워 넣으면 사용자 이름의 공백·따옴표가 PowerShell 문법이 된다
  const script =
    "(Start-Process -PassThru -FilePath $env:POKEBUDDY_LAUNCH_EXE -WorkingDirectory $env:POKEBUDDY_LAUNCH_APP" +
    " -ArgumentList ('\"' + $env:POKEBUDDY_LAUNCH_APP + '\"')).Id";
  return new Promise((resolve) => {
    execFile(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        env: { ...env, POKEBUDDY_LAUNCH_EXE: electron, POKEBUDDY_LAUNCH_APP: PROJECT },
        encoding: "utf8",
        timeout: 20_000,
        windowsHide: true,
        // CLI 가 ! 명령을 작업 개체(job)에 넣어 두었다가 한꺼번에 끝내도 펫은 남게
        detached: true,
      },
      (err, stdout) => {
        const pid = Number(String(stdout).trim());
        resolve(!err && pid > 0 ? pid : null);
      },
    );
  });
}

async function waitGone(pids) {
  const until = Date.now() + GONE_TIMEOUT_MS;
  while (pids.some((pid) => state.pidAlive(pid)) && Date.now() < until) await sleep(POLL_MS);
}

// pokebuddy stop [펫 ...] [all] — 이 세션의 펫 내리기
//   이름을 주면 그 펫만(eevee+pikachu 처럼 여러 마리도), all 이면 전부.
//   아무것도 안 주면 한 마리일 때는 바로 내리고, 여러 마리면 체크리스트로 고른다 (cli/checklist.js).
//   CLI LLM 의 ! 명령은 표준입력이 터미널이 아니라 키를 받을 수 없다 — 그때는 이름으로 고르는 법을 알려 준다
async function stop(names = [], { all = false } = {}) {
  const session = currentSession();
  const pets = sessionPets(session);
  if (!pets.length) {
    say("이 세션에 떠 있는 펫이 없음");
    return;
  }
  const words = names.flatMap((name) => petList(name)).map((name) => name.toLowerCase());
  let chosen;
  if (all || words.includes("all")) chosen = pets;
  else if (words.length) {
    // 스프라이트시트 저장소가 있으면 2D 가 없는 펫은 -3d 로 떠 있다 (resolveSlug)
    const matches = (pet, name) => pet.slug === name || pet.slug === `${name}-3d`;
    chosen = pets.filter((pet) => words.some((name) => matches(pet, name)));
    const missing = words.filter((name) => !pets.some((pet) => matches(pet, name)));
    if (missing.length) {
      process.stderr.write(`이 세션에 없는 펫: ${missing.join(", ")} — 떠 있는 펫: ${slugList(pets)}\n`);
      process.exitCode = 1;
    }
  } else if (pets.length === 1) chosen = pets;
  else if (process.stdin.isTTY && process.stdout.isTTY) {
    const picked = await checklist({ title: "pokebuddy stop", items: pets.map((pet) => pet.slug) });
    chosen = picked.map((i) => pets[i]);
  } else {
    say("pokebuddy stop");
    say("---");
    for (const pet of pets) say(pet.slug);
    say("---");
    say("여기서는 키 입력을 받을 수 없어 이름으로 고른다:");
    const one = commandFor(session, `stop ${pets[0].slug}`);
    const every = commandFor(session, "stop all");
    const width = Math.max(one.length, every.length) + 4;
    say(`  ${one.padEnd(width)}한 마리 (여러 마리는 ${pets[0].slug}+${pets[1].slug})`);
    say(`  ${every.padEnd(width)}전부`);
    return;
  }
  if (!chosen.length) return;
  await waitGone(dismiss(chosen));
  const left = pets.filter((pet) => !chosen.includes(pet));
  say(`내림: ${slugList(chosen)}${left.length ? ` — 남은 펫: ${slugList(left)}` : ""}`);
}

async function run(opts) {
  const startedAt = Date.now() / 1000;
  const debug = Boolean(process.env.POKEBUDDY_DEBUG);

  const electron = electronPath();
  if (!electron) {
    process.stderr.write("펫을 띄우지 못함 — Electron 이 아직 준비되지 않음. pokebuddy setup 을 한 번 실행하면 받는다\n");
    process.exitCode = 1;
    return;
  }
  const source = settings.load().source;
  const wanted = [];
  for (const input of petList(opts.pet)) {
    const got = resolveSlug(input, source);
    if (got.error) {
      process.stderr.write(`펫 이름을 찾을 수 없음: ${input}\n`);
      if (got.hints.length) process.stderr.write(`  비슷한 이름:\n${got.hints.map((h) => `    ${h}\n`).join("")}`);
      continue;
    }
    if (!wanted.includes(got.slug)) wanted.push(got.slug); // eevee+eevee 는 한 마리
  }
  if (!wanted.length) {
    process.exitCode = 1;
    return;
  }

  const session = currentSession();
  // 같은 세션에 펫을 더한다. 이미 떠 있는 펫 이름이면 그 펫만 내리고 같은 자리(순번)에 다시 띄운다 —
  // 옵션만 바꿀 때 (!pokebuddy eevee dot=3). 먼저 끝나길 기다려야 새 펫이 옛 펫의 전역 단축키를 이어받는다
  const live = sessionPets(session);
  const replaced = live.filter((pet) => wanted.includes(pet.slug));
  await waitGone(dismiss(replaced));
  fs.mkdirSync(PATHS.pets, { recursive: true });

  // 순번 — 옆으로 밀어 배치하는 자리. 바꾸는 펫은 제자리, 새 펫은 남은 펫과 겹치지 않는 가장 앞 빈자리
  const taken = new Set(live.filter((pet) => !replaced.includes(pet)).map((pet) => pet.index));
  const slotOf = new Map();
  for (const pet of replaced) {
    if (slotOf.has(pet.slug) || taken.has(pet.index)) continue;
    slotOf.set(pet.slug, pet.index);
    taken.add(pet.index);
  }
  for (const slug of wanted) {
    if (slotOf.has(slug)) continue;
    let free = 0;
    while (taken.has(free)) free += 1;
    slotOf.set(slug, free);
    taken.add(free);
  }

  // 여러 마리는 함께 띄운다 — Windows 는 한 마리에 PowerShell 기동(0.2초 안팎)이 든다
  const pets = await Promise.all(
    wanted.map(async (slug) => {
      const index = slotOf.get(slug);
      const env = {
        ...process.env,
        ...optionEnv(opts),
        POKEBUDDY_SLUG: slug,
        POKEBUDDY_MATCH_CWD: process.cwd(),
        POKEBUDDY_INDEX: String(index),
        POKEBUDDY_ANCHOR_APP: anchorApp(),
        POKEBUDDY_TERM_PID: String(session.term),
        POKEBUDDY_HOST_PID: session.host ? String(session.host) : "",
        POKEBUDDY_SESSION: String(session.key),
        POKEBUDDY_ANCESTORS: session.chain.join(","),
      };
      // POKEBUDDY_DEBUG=1 이면 펫이 판정 로그를 파일로 남긴다. 평소에는 버린다
      if (debug) {
        env.POKEBUDDY_LOG = path.join(PATHS.pets, `debug-${session.key}-${slug}.log`);
        process.stderr.write(`펫 로그: ${env.POKEBUDDY_LOG}\n`);
      }
      const pet = { slug, pid: null, file: null, ready: false, exited: false };
      try {
        pet.pid = await launchPet(electron, env);
      } catch (e) {
        process.stderr.write(`펫을 띄우지 못함: ${slug} — ${e.message}\n`);
      }
      if (!pet.pid) {
        pet.exited = true;
        return pet;
      }
      pet.file = settings.petFile(session.key, pet.pid, index, slug);
      fs.writeFileSync(pet.file, `${pet.pid}\n`);
      return pet;
    }),
  );

  // 펫이 창을 만들었다고 적거나(ready) 끝날 때까지 — 펫은 이 명령의 자식이 아니라서(Windows) 번호로 살아 있는지 본다
  const until = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    for (const pet of pets) {
      if (pet.ready || pet.exited) continue;
      try {
        pet.ready = /\bready\b/.test(fs.readFileSync(pet.file, "utf8"));
      } catch {
        // 쓰는 중 — 다음에 다시 본다
      }
      if (!pet.ready && !state.pidAlive(pet.pid)) pet.exited = true;
    }
    if (pets.every((pet) => pet.ready || pet.exited) || Date.now() >= until) break;
    await sleep(POLL_MS);
  }

  const ready = pets.filter((pet) => pet.ready);
  const failed = pets.filter((pet) => !pet.ready && pet.exited);
  const pending = pets.filter((pet) => !pet.ready && !pet.exited);
  const lifetime = session.host ? "이 세션이 끝나면" : "이 셸이 끝나면";
  if (ready.length) say(`펫을 띄움: ${slugList(ready)} — ${lifetime} 함께 사라진다`);
  if (pending.length) say(`아직 뜨는 중: ${slugList(pending)} — 한참 안 보이면 ${commandFor(session, "status")}`);
  if (failed.length) {
    const why = lastError(startedAt);
    process.stderr.write(`펫이 뜨지 못함: ${slugList(failed)}${why ? ` — ${why.message}` : ""} (자세히: ${commandFor(session, "status")})\n`);
    process.exitCode = 1;
  }
  const all = sessionPets(session);
  if (all.length > 1) say(`이 세션의 펫 ${all.length}마리: ${slugList(all)} — 내리기: ${commandFor(session, "stop")} [이름|all]`);
  else if (all.length === 1) say(`내리기: ${commandFor(session, "stop")}`);
}

module.exports = { run, stop };
