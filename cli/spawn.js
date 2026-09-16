// 대상 명령(claude·codex …)을 인자 그대로 실행한다.
//
// mac·Linux 는 spawn 에 그대로 맡기면 된다.
// Windows 는 npm 으로 설치한 명령이 claude.cmd 같은 배치 파일이라 손이 간다. 배치 파일은 cmd.exe 를 거쳐야
// 실행되고(Node 20.12 부터 셸 없이는 거부된다), cmd.exe 는 인자를 자기 규칙으로 다시 쪼갠다 —
// 따옴표·& · | 가 섞이면 인자가 바뀌거나 뒤쪽이 별도 명령으로 실행되고, 줄바꿈 뒤는 잘린다.
//
// 그래서 순서대로 시도한다.
//   1. npm 이 만든 심(cmd-shim)이면 그 안에 적힌 대상(.js 면 node 로, .exe 면 직접)을 cmd.exe 없이 실행한다
//   2. 그 밖의 배치 파일은 cmd.exe 로 — 인자를 cross-spawn 과 같은 규칙으로 이스케이프한다.
//      %* 로 인자를 다시 넘기는 배치는 한 번 더 파싱되므로 메타문자를 두 번 감싼다
//   3. .exe 등은 직접 실행
const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const fs = require("fs");
const path = require("path");

const isWin = process.platform === "win32";
const META = /([()\][%!^"`<>&|;, *?])/g;

// PATH·PATHEXT 로 실제 실행 파일을 찾는다 (Windows 전용 — 확장자를 알아야 배치 파일인지 안다).
// 현재 폴더는 찾지 않는다 — 받은 저장소 안의 claude.cmd 가 진짜 claude 대신 실행되면 안 된다
function whichWin(cmd, env = process.env) {
  const exts = (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  const hasExt = exts.some((e) => cmd.toLowerCase().endsWith(e.toLowerCase()));
  const candidates = (dir) => (hasExt ? [path.join(dir, cmd)] : exts.map((e) => path.join(dir, cmd + e)));
  const dirs = /[\\/]/.test(cmd)
    ? [""]
    : (env.PATH || env.Path || "")
        .split(path.delimiter)
        .map((d) => d.trim().replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
  for (const dir of dirs) {
    for (const file of candidates(dir)) {
      try {
        if (fs.statSync(file).isFile()) return file;
      } catch {
        // 없는 후보
      }
    }
  }
  return null;
}

// npm cmd-shim 의 마지막 줄:  "%_prog%"  "%dp0%\node_modules\...\cli.js" %*
// 대상 경로를 뽑는다. 모양이 다르면 null
function shimTarget(file, text) {
  const m = text.match(/"%dp0%\\([^"]+)"\s+%\*/i);
  if (!m) return null;
  const target = path.join(path.dirname(file), m[1]);
  return fs.existsSync(target) ? target : null;
}

const escapeCommand = (s) => s.replace(META, "^$1");

function escapeArgument(arg, doubleMeta) {
  let s = String(arg);
  // 따옴표 앞 역슬래시는 두 배로 하고 따옴표를 이스케이프한다
  s = s.replace(/(\\*)"/g, '$1$1\\"');
  // 끝의 역슬래시는 감싸는 따옴표를 먹지 않게 모두 두 배로
  s = s.replace(/(\\*)$/, "$1$1");
  s = `"${s}"`;
  s = s.replace(META, "^$1");
  if (doubleMeta) s = s.replace(META, "^$1");
  return s;
}

// 실행 파일을 못 찾았을 때 — spawn 이 돌려주는 것처럼 error(ENOENT) 를 한 박자 뒤에 낸다
function notFound(cmd) {
  const child = new EventEmitter();
  child.kill = () => false;
  process.nextTick(() => child.emit("error", Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: "ENOENT" })));
  return child;
}

// spawn 과 같은 모양으로 쓴다. 명령을 못 찾으면 error 이벤트(ENOENT)가 난다
function spawnCommand(cmd, args, options = {}) {
  if (!isWin) return spawn(cmd, args, options);
  const file = whichWin(cmd, options.env || process.env);
  // 못 찾음 — spawn 에 이름을 그대로 넘기면 Windows 가 현재 폴더의 .exe 를 먼저 찾아 실행한다.
  // 넘기지 않고 spawn 과 같은 모양의 ENOENT 만 낸다
  if (!file) return notFound(cmd);

  if (/\.(cmd|bat)$/i.test(file)) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      // 못 읽으면 일반 배치로 다룬다
    }
    const target = shimTarget(file, text);
    if (target && /\.(c|m)?js$/i.test(target)) return spawn(process.execPath, [target, ...args], options);
    if (target && /\.exe$/i.test(target)) return spawn(target, args, options);

    // %* 나 %1·%~1 로 인자를 다시 넘기는 배치는 한 번 더 파싱된다
    const doubleMeta = /%\*|%~?\d/.test(text);
    const line = [escapeCommand(path.normalize(file)), ...args.map((a) => escapeArgument(a, doubleMeta))].join(" ");
    // /v:off — 레지스트리로 지연 확장(!)을 켠 컴퓨터에서도 ! 가 변수로 풀리지 않게
    return spawn(process.env.comspec || "cmd.exe", ["/d", "/v:off", "/s", "/c", `"${line}"`], {
      ...options,
      windowsVerbatimArguments: true,
    });
  }
  return spawn(file, args, options);
}

module.exports = { spawnCommand };
