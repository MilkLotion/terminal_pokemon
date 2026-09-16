// pkmon <펫> — 명령을 실행하는 동안 펫을 띄우고, 명령이 끝나면 펫도 함께 끝낸다.
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const settings = require("../config.js");
const dex = require("../lib/dex.js");
const { optionEnv, petList } = require("./args.js");
const { spawnCommand } = require("./spawn.js");

const PROJECT = path.join(__dirname, "..");
// 떠 있는 펫 목록 — pid 파일로 관리한다 (Electron 은 한 마리가 여러 프로세스를 만들어 프로세스 수로는 셀 수 없음)
const RUN_DIR = path.join(os.tmpdir(), "pkmon-pets");

// 이 명령을 친 터미널 탭의 셸 번호 — VS Code 확장이 "활성 터미널"로 알려 주는 번호와 같아야 한다.
// 보통은 부모 프로세스다. Windows 에서 pkmon.cmd 를 다른 셸이 부르면 사이에 "cmd.exe /c … pkmon" 한 겹이 끼므로
// 그것만 건너뛴다 (/k 로 뜬 개발자 명령 프롬프트 같은 진짜 셸은 건너뛰지 않는다).
// 이 값은 첫 추정이다 — 펫이 확장 기록의 터미널 목록과 조상을 대조해 바로잡는다 (main.js).
// PKMON_TERM_PID 로 직접 줄 수도 있다
function terminalPid() {
  const given = Number(process.env.PKMON_TERM_PID);
  if (given > 0) return given;
  if (process.platform !== "win32") return process.ppid;
  try {
    const out = execFileSync(
      "powershell",
      ["-NoProfile", "-Command", `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${process.ppid}"; "$($p.Name)|$($p.ParentProcessId)|$($p.CommandLine)"`],
      { encoding: "utf8", timeout: 5000, windowsHide: true },
    );
    const [name, parent, commandLine = ""] = out.trim().split("|");
    const shim = /\s\/c\s/i.test(` ${commandLine} `) && /pkmon/i.test(commandLine);
    if (/^cmd\.exe$/i.test(name) && shim && Number(parent) > 0) return Number(parent);
  } catch {
    // 못 알아내면 부모 그대로
  }
  return process.ppid;
}

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

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};

// 같은 터미널 탭의 펫만 센다 — 다른 창·다른 탭의 펫 때문에 옆으로 밀리지 않도록
function livePets(termPid) {
  let count = 0;
  let names = [];
  try {
    names = fs.readdirSync(RUN_DIR).filter((f) => f.startsWith(`${termPid}-`) && f.endsWith(".pid"));
  } catch {
    return 0;
  }
  for (const name of names) {
    const file = path.join(RUN_DIR, name);
    const pid = Number(fs.readFileSync(file, "utf8").trim());
    if (pid > 0 && alive(pid)) count += 1;
    else fs.rmSync(file, { force: true }); // 죽은 펫의 흔적 정리
  }
  return count;
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
// 100MB 를 받기 시작해 대상 명령이 그만큼 늦게 뜨고, 오프라인이면 매번 스택을 찍는다.
// 받는 일은 설치(postinstall)와 pkmon setup 이 맡고, 여기서는 있는지만 본다
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
    const e = JSON.parse(fs.readFileSync(settings.PATHS.lastError, "utf8"));
    return e && e.at >= since ? e : null;
  } catch {
    return null;
  }
}

function run(opts, command) {
  const startedAt = Date.now() / 1000;
  const debug = Boolean(process.env.PKMON_DEBUG);
  const isWin = process.platform === "win32";

  // ── 1. 명령을 띄우기 전 — 안내 문구는 여기서만 찍는다. 명령(claude)이 화면을 그린 뒤 끼어들면 화면이 깨진다
  const electron = electronPath();
  const wanted = []; // { slug, out }
  if (!electron) {
    process.stderr.write("펫을 건너뜀 — Electron 이 아직 준비되지 않음. pkmon setup 을 한 번 실행하면 받는다\n");
  } else {
    const source = settings.load().source;
    for (const input of petList(opts.pet)) {
      const got = resolveSlug(input, source);
      if (got.error) {
        process.stderr.write(`펫 이름을 찾을 수 없음: ${input}\n`);
        if (got.hints.length) process.stderr.write(`  비슷한 이름:\n${got.hints.map((h) => `    ${h}\n`).join("")}`);
        continue;
      }
      // PKMON_DEBUG=1 이면 판정 로그를 파일로 남긴다. 평소에는 버린다
      let out = "ignore";
      if (debug) {
        fs.mkdirSync(RUN_DIR, { recursive: true });
        const log = path.join(RUN_DIR, `debug-${process.ppid}-${got.slug}.log`);
        process.stderr.write(`펫 로그: ${log}\n`);
        out = fs.openSync(log, "w");
      }
      wanted.push({ slug: got.slug, out });
    }
  }

  // ── 2. 대상 명령 — 펫 준비(Windows 는 프로세스 조회에 1~2초)를 기다리게 하지 않는다
  const [cmd, ...cmdArgs] = command;
  const target = spawnCommand(cmd, cmdArgs, { stdio: "inherit" });
  const pets = []; // { child, pidFile, slug, stopped, failed }
  let setupError = null;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    for (const pet of pets) {
      pet.stopped = true;
      try {
        pet.child.kill();
      } catch {
        // 이미 끝남
      }
      fs.rmSync(pet.pidFile, { force: true });
    }
    const failed = pets.filter((p) => p.failed).map((p) => p.slug);
    if (failed.length) {
      const why = lastError(startedAt);
      process.stderr.write(`펫이 뜨지 못함: ${failed.join(", ")}${why ? ` — ${why.message}` : ""} (자세히: pkmon status)\n`);
    }
    if (setupError) process.stderr.write(`펫을 띄우지 못함: ${setupError}\n`);
  };

  // Ctrl+C 는 터미널이 같은 프로세스 그룹 전체(대상 명령 포함)에 보낸다 — 여기서 먼저 죽지 않고 명령이 끝나길 기다린다
  process.on("SIGINT", () => {});
  for (const sig of ["SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      try {
        target.kill(isWin ? "SIGTERM" : sig); // Windows 에는 SIGHUP 이 없다 — 보내면 던지고 아무 일도 안 한다
      } catch {
        // 이미 끝남
      }
    });
  }
  process.on("exit", cleanup);

  target.on("error", (e) => {
    if (e.code !== "ENOENT") process.stderr.write(`명령 실행 실패: ${e.message}\n`);
    // PowerShell 이 따옴표 없는 zapdos,pikachu 를 두 인자로 쪼개면 두 번째 펫 이름이 명령 자리에 온다
    else if (dex.dexOf(cmd) != null) process.stderr.write(`명령을 찾을 수 없음: ${cmd} — 펫 여러 마리는 ${opts.pet}+${cmd} 처럼 + 로 잇는다\n`);
    else process.stderr.write(`명령을 찾을 수 없음: ${cmd}\n`);
    cleanup();
    process.exit(127);
  });
  target.on("exit", (code, signal) => {
    cleanup();
    const signum = signal ? os.constants.signals[signal] || 0 : 0;
    process.exit(code ?? 128 + signum);
  });

  // ── 3. 펫 — 여기서 무엇이 실패해도 명령은 그대로 돈다. 알림은 명령이 끝날 때 한 번
  if (!wanted.length) return;
  try {
    const termPid = terminalPid();
    fs.mkdirSync(RUN_DIR, { recursive: true });
    const base = livePets(termPid); // 이미 떠 있는 펫 수 — 그만큼 옆으로 밀어서 배치
    wanted.forEach(({ slug, out }, slot) => {
      const child = spawn(electron, [PROJECT], {
        stdio: ["ignore", out, out],
        windowsHide: true,
        // mac·Linux 에서는 따로 프로세스 그룹을 준다. 같은 그룹이면 `pkmon eevee npm run dev` 에서 Ctrl+C 를 눌렀을 때
        // 명령보다 펫이 먼저 죽는다. 터미널을 닫으면 펫이 터미널 셸이 죽은 것을 보고 스스로 끝난다 (main.js).
        // Windows 에서 detached 는 새 콘솔을 만들어 쓰지 않는다
        detached: !isWin,
        env: {
          ...process.env,
          ...optionEnv(opts),
          PKMON_SLUG: slug,
          PKMON_MATCH_CWD: process.cwd(),
          PKMON_INDEX: String(base + slot),
          PKMON_ANCHOR_APP: anchorApp(),
          PKMON_TERM_PID: String(termPid),
        },
      });
      const pidFile = path.join(RUN_DIR, `${termPid}-${child.pid}.pid`);
      const pet = { child, pidFile, slug, stopped: false, failed: false };
      pets.push(pet);
      // 우리가 끝내기 전에 스스로 끝났으면(그림을 못 받음 등) 기억해 두었다가 명령이 끝날 때 알린다
      child.on("error", () => {
        pet.failed = true;
      });
      child.on("exit", (code) => {
        if (!pet.stopped && code) pet.failed = true;
      });
      if (child.pid) fs.writeFileSync(pidFile, String(child.pid));
    });
  } catch (e) {
    setupError = e.message;
  } finally {
    for (const { out } of wanted) if (typeof out === "number") fs.closeSync(out); // 자식이 이어받았다
  }
}

module.exports = { run, terminalPid, RUN_DIR };
