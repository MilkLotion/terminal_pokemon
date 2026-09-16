// termimon setup / uninstall — 남의 컴퓨터에 설치하는 부분이라 가장 조심스럽게 다룬다.
//
//   1. 펫 데이터 폴더   ~/.claude/termimon — 훅은 이 폴더가 없으면 아무것도 안 한다
//   2. 상태 훅         ~/.claude/scripts/hooks/termimon-state.cjs 복사 + 쓰고 있는 CLI LLM 마다 이벤트 등록
//                      claude settings.json · gemini settings.json · codex hooks.json
//   3. 에디터 확장      VS Code 계열에 탭 구분 확장 설치 (에디터 CLI 가 있을 때만)
//   4. 옛 이름(pkmon)   데이터 폴더를 가져오고, 옛 훅 등록·훅 파일·확장·데이터 폴더를 걷는다
//
// 원칙
//   - 설정 파일은 백업을 남기고, 이미 있는 항목은 건드리지 않고, 몇 번을 돌려도 결과가 같다
//   - 파싱할 수 없는 설정 파일은 고치려 들지 않고 멈춘다
//   - --dry-run 이면 무엇을 바꿀지만 보여 준다
const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PATHS, LEGACY_HOME_ITEMS, migrateLegacyHome } = require("../config.js");

const PROJECT = path.join(__dirname, "..");
const HOOK_NAME = "termimon-state.cjs";
const HOOK_SOURCE = path.join(PROJECT, "hooks", HOOK_NAME);
const EXTENSION_ID = "local.termimon-active-terminal";
// 옛 이름(pkmon) 시절에 설치한 것 — setup 이 새 이름으로 바꾸고, uninstall 이 함께 지운다
const LEGACY_HOOK_NAME = "pkmon-state.cjs";
const LEGACY_EXTENSION_ID = "local.pkmon-active-terminal";

// Claude Code 는 CLAUDE_CONFIG_DIR 로 설정 폴더를 옮길 수 있다
const claudeDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const hookTarget = () => path.join(claudeDir(), "scripts", "hooks", HOOK_NAME);
const legacyHookTarget = () => path.join(claudeDir(), "scripts", "hooks", LEGACY_HOOK_NAME);

// 훅을 등록할 CLI — 설정 파일 모양이 셋 다 { hooks: { 이벤트: [{ matcher?, hooks: [{ type: "command", command, … }] }] } } 다.
//   events   이벤트 → matcher (undefined 면 넣지 않는다 — 모든 경우에 맞는다)
//   handler  우리 훅 한 항목. 타임아웃 단위가 CLI 마다 다르다 (claude·codex 초, gemini ms)
//   always   설정 폴더가 없어도 등록한다 — 펫 데이터가 ~/.claude 아래라 claude 만
const TARGETS = [
  {
    cli: "claude",
    name: "Claude Code",
    dir: claudeDir,
    file: "settings.json",
    always: true,
    events: {
      SessionStart: undefined,
      UserPromptSubmit: "",
      PreToolUse: ".*",
      PermissionRequest: ".*",
      // 승인한 도구가 끝나면 작업 중으로 돌아간다 — 없으면 긴 명령이 도는 내내 기다리는 것처럼 보인다
      PostToolUse: ".*",
      PostToolUseFailure: ".*",
      Stop: undefined,
      StopFailure: undefined,
    },
    // claude 는 async 훅을 기다리지 않는다
    handler: (command) => ({ type: "command", command, async: true, timeout: 5 }),
  },
  {
    cli: "gemini",
    name: "Gemini CLI",
    dir: () => path.join(os.homedir(), ".gemini"),
    file: "settings.json",
    // gemini 는 훅을 모두 기다린다(async 없음) — 도구 전·모델 호출처럼 잦은 이벤트는 빼고 상태가 바뀌는 곳만.
    // 승인 대기는 Notification(ToolPermission), 승인 뒤 작업으로 돌아가는 건 AfterTool 이 알린다
    events: {
      SessionStart: undefined,
      BeforeAgent: undefined,
      Notification: undefined,
      AfterTool: undefined,
      AfterAgent: undefined,
      SessionEnd: undefined,
    },
    handler: (command) => ({ name: "termimon-state", type: "command", command, timeout: 5000 }),
  },
  {
    cli: "codex",
    name: "Codex CLI",
    dir: () => process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
    file: "hooks.json",
    // 훅은 codex 0.124 부터 (Interrupt 0.150 · SessionEnd 0.145). 옛 버전은 모르는 이벤트 이름을 무시한다.
    // async 는 넣지 않는다 — 0.148 전에는 async 훅을 "지원 안 함"으로 통째로 건너뛴다
    events: {
      SessionStart: undefined,
      UserPromptSubmit: undefined,
      PreToolUse: undefined,
      PermissionRequest: undefined,
      PostToolUse: undefined,
      Stop: undefined,
      Interrupt: undefined,
      SessionEnd: undefined,
    },
    handler: (command) => ({ type: "command", command, timeout: 5 }),
  },
];
const CODEX_HOOKS_SINCE = [0, 124, 0];

const settingsFile = (target) => path.join(target.dir(), target.file);

const isOurs = (hook) => typeof hook?.command === "string" && hook.command.includes(HOOK_NAME);
const isLegacy = (hook) => typeof hook?.command === "string" && hook.command.includes(LEGACY_HOOK_NAME);

// 경로에 공백이 있어도(Windows 사용자 이름 등) 깨지지 않게 따옴표로 감싼다.
// claude 는 인자 없이 — 예전 등록과 같은 모양이라야 이미 등록됨으로 보인다
const hookCommand = (target) => `node "${hookTarget()}"${target.cli === "claude" ? "" : ` --cli ${target.cli}`}`;

// 설정 파일을 읽는다. 우리가 이해하지 못하는 모양이면 고치려 들지 않고 멈춘다 —
// 남의 설정 파일을 "알아서" 바로잡다가 사용자 훅을 날리는 것보다 멈추고 알리는 편이 낫다
function readSettings(target) {
  const file = settingsFile(target);
  if (!fs.existsSync(file)) return { data: {}, existed: false };
  const stop = (why) => ({ error: `${file} 을(를) 다룰 수 없음 (${why}) — 손대지 않고 멈춘다` });
  let data;
  try {
    // 윈도우 편집기가 붙이는 BOM 은 벗긴다
    const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    data = text.trim() ? JSON.parse(text) : {};
  } catch (e) {
    return stop(e.message);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return stop("최상위가 객체가 아님");
  if ("hooks" in data) {
    if (!data.hooks || typeof data.hooks !== "object" || Array.isArray(data.hooks)) return stop("hooks 가 객체가 아님");
    for (const [event, groups] of Object.entries(data.hooks)) {
      if (!Array.isArray(groups)) return stop(`hooks.${event} 가 배열이 아님`);
    }
  }
  return { data, existed: true };
}

// 등록된 훅 명령이 가리키는 파일 — `node <경로>` · `node "<경로>"` (뒤에 --cli 인자) 모양일 때만.
// 그 밖(환경변수·플래그·래퍼)은 null
function hookPathOf(command) {
  const m = command.trim().match(/^node\s+(?:"([^"]+)"|(\S+))(?:\s+--cli\s+\S+)?$/);
  if (!m) return null;
  const p = m[1] || m[2];
  return p.replace(/^~(?=[\\/])/, os.homedir()).replace(/^\$HOME(?=[\\/])/, os.homedir());
}

// 훅 등록을 더한다 — 이미 우리 훅이 있는 이벤트는 그대로 둔다.
// 단 없는 파일을 가리키는 옛 등록(다른 경로에 설치했다 지운 경우)은 지금 경로로 고친다 — 두면 훅이 조용히 죽는다.
// 반환: { added: 더한 이벤트, fixed: 경로를 고친 이벤트 }
function addHooks(data, target) {
  const added = [];
  const fixed = [];
  if (!data.hooks) data.hooks = {}; // 모양 검사는 readSettings 가 했다
  for (const [event, matcher] of Object.entries(target.events)) {
    const groups = data.hooks[event] || [];
    const ours = groups.flatMap((g) => (Array.isArray(g?.hooks) ? g.hooks.filter(isOurs) : []));
    if (ours.length) {
      for (const hook of ours) {
        const file = hookPathOf(hook.command);
        // 모양을 알아볼 수 있고 그 파일이 없을 때만 고친다 — 사용자가 감싼 명령은 그대로 둔다.
        // 지금 설치하는 자리는 setup 이 먼저 복사하므로 있는 것으로 본다 (미리 보기에서도 같은 판정이 나오게)
        if (file && path.resolve(file) !== path.resolve(hookTarget()) && !fs.existsSync(file)) {
          hook.command = hookCommand(target);
          if (!fixed.includes(event)) fixed.push(event);
        }
      }
      continue;
    }
    const group = { hooks: [target.handler(hookCommand(target))] };
    if (matcher !== undefined) group.matcher = matcher;
    data.hooks[event] = [...groups, group];
    added.push(event);
  }
  return { added, fixed };
}

// 우리 훅만 걷어낸다 — 같은 묶음에 남의 훅이 있으면 그건 남긴다. match 로 옛 이름 훅만 고를 수 있다
function removeHooks(data, match = isOurs) {
  const removed = [];
  if (!data.hooks || typeof data.hooks !== "object") return removed;
  for (const [event, groups] of Object.entries(data.hooks)) {
    if (!Array.isArray(groups)) continue;
    let touched = false;
    const kept = [];
    for (const g of groups) {
      if (!Array.isArray(g?.hooks) || !g.hooks.some(match)) {
        kept.push(g);
        continue;
      }
      touched = true;
      const rest = g.hooks.filter((h) => !match(h));
      if (rest.length) kept.push({ ...g, hooks: rest });
    }
    if (!touched) continue;
    removed.push(event);
    if (kept.length) data.hooks[event] = kept;
    else delete data.hooks[event];
  }
  if (data.hooks && !Object.keys(data.hooks).length) delete data.hooks;
  return removed;
}

// 백업을 남기고 원자적으로 쓴다 — 쓰다 죽어도 반쪽 파일이 남지 않는다.
//   심링크(dotfiles 저장소로 관리)면 링크가 아니라 실제 파일을 바꾼다 — rename 은 링크를 일반 파일로 덮어쓴다
//   권한을 유지한다 — API 키가 들어 있을 수 있어 0600 인 파일을 0644 로 만들면 안 된다
// 실패하면 { error } — 백신이 파일을 잡고 있는 Windows 등
function writeSettings(target, data, existed) {
  const link = settingsFile(target);
  try {
    fs.mkdirSync(path.dirname(link), { recursive: true });
    const file = existed ? fs.realpathSync(link) : link;
    const mode = existed ? fs.statSync(file).mode & 0o777 : 0o600;
    let backup = null;
    if (existed) {
      backup = `${link}.termimon-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      fs.copyFileSync(file, backup);
    }
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode });
    fs.chmodSync(tmp, mode); // umask 가 깎은 권한을 되돌린다
    fs.renameSync(tmp, file);
    return { backup };
  } catch (e) {
    try {
      for (const f of fs.readdirSync(path.dirname(link))) {
        if (f.endsWith(`.${process.pid}.tmp`)) fs.rmSync(path.join(path.dirname(link), f), { force: true }); // 쓰다 만 임시 파일
      }
    } catch {
      // 정리 실패는 무시
    }
    return { error: `${link} 에 쓰지 못함 (${e.code || e.message}) — 에디터·백신이 파일을 잡고 있으면 닫고 다시 실행` };
  }
}

// VS Code 계열 에디터 CLI — PATH 와 앱 설치 폴더 양쪽에서 찾는다.
// 에디터 하나에 CLI 하나만 남긴다. 기준은 명령 이름이 아니라 심링크를 따라간 실제 폴더다 —
//   Cursor·Windsurf 는 자기 bin 폴더에 code 명령도 둬서, 이름으로 거르면 PATH 앞의 Cursor 가 진짜 VS Code 를 가린다
//   mac 은 여러 에디터가 /usr/local/bin 에 링크를 나란히 둬서, 링크 폴더로 거르면 한쪽이 빠진다
// 반환: [{ name, file }] — name 은 안내용 (실제 경로에서 알아본 에디터 이름)
function editorClis() {
  const isWin = process.platform === "win32";
  const candidates = [];
  const names = ["code", "code-insiders", "cursor", "windsurf", "antigravity-ide", "antigravity", "codium"];
  const exts = isWin ? [".cmd", ".exe"] : [""];
  for (const dir of (process.env.PATH || "").split(path.delimiter).filter(Boolean)) {
    for (const name of names) for (const ext of exts) candidates.push(path.join(dir, name + ext));
  }
  if (process.platform === "darwin") {
    for (const root of ["/Applications", path.join(os.homedir(), "Applications")]) {
      candidates.push(
        path.join(root, "Visual Studio Code.app/Contents/Resources/app/bin/code"),
        path.join(root, "Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code"),
        path.join(root, "Cursor.app/Contents/Resources/app/bin/cursor"),
        path.join(root, "Windsurf.app/Contents/Resources/app/bin/windsurf"),
        path.join(root, "Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide"),
        path.join(root, "Antigravity.app/Contents/Resources/app/bin/antigravity"),
        path.join(root, "VSCodium.app/Contents/Resources/app/bin/codium"),
      );
    }
  } else if (isWin) {
    const local = process.env.LOCALAPPDATA || "";
    const programs = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean);
    candidates.push(
      path.join(local, "Programs", "Microsoft VS Code", "bin", "code.cmd"),
      ...programs.map((p) => path.join(p, "Microsoft VS Code", "bin", "code.cmd")),
      path.join(local, "Programs", "Microsoft VS Code Insiders", "bin", "code-insiders.cmd"),
      path.join(local, "Programs", "cursor", "resources", "app", "bin", "cursor.cmd"),
      path.join(local, "Programs", "Windsurf", "bin", "windsurf.cmd"),
      path.join(local, "Programs", "Antigravity IDE", "bin", "antigravity-ide.cmd"),
      path.join(local, "Programs", "Antigravity", "bin", "antigravity.cmd"),
      path.join(local, "Programs", "VSCodium", "bin", "codium.cmd"),
      ...programs.map((p) => path.join(p, "VSCodium", "bin", "codium.cmd")),
    );
  }

  const found = [];
  const seen = new Set();
  for (const file of candidates) {
    let real;
    try {
      if (!fs.statSync(file).isFile()) continue;
      real = fs.realpathSync(file);
    } catch {
      continue; // 없는 후보
    }
    const dir = path.dirname(real).toLowerCase();
    if (seen.has(dir)) continue;
    seen.add(dir);
    found.push({ name: editorName(real), file });
  }
  return found;
}

// 실제 경로로 어느 에디터인지 알아본다 — "code" 명령이 사실은 Cursor 일 수 있다
function editorName(real) {
  const p = real.toLowerCase();
  if (p.includes("insiders")) return "VS Code Insiders";
  if (p.includes("cursor")) return "Cursor";
  if (p.includes("windsurf")) return "Windsurf";
  if (p.includes("antigravity")) return "Antigravity";
  if (p.includes("codium")) return "VSCodium";
  if (p.includes("code")) return "VS Code";
  return path.basename(real);
}

function vsixFile() {
  const dir = path.join(PROJECT, "vscode-extension");
  // 지금 이름의 확장만 — 같은 폴더에 남은 옛 이름(pkmon) vsix 를 설치하지 않게
  const prefix = `${EXTENSION_ID.split(".")[1]}-`;
  try {
    const hits = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".vsix")).sort();
    return hits.length ? path.join(dir, hits[hits.length - 1]) : null;
  } catch {
    return null;
  }
}

// git clone 으로 받았으면 vsix 가 없다 — 빌드 산출물이라 저장소에 넣지 않는다 (npm 배포본에는 prepack 이 넣는다).
// 묶는 스크립트는 의존성 없는 Node 라 어느 OS 에서나 돈다. 배포본에는 스크립트가 없어 null
const VSIX_BUILDER = path.join(PROJECT, "scripts", "build-vsix.js");
function buildVsix() {
  if (!fs.existsSync(VSIX_BUILDER)) return null;
  try {
    return require(VSIX_BUILDER).build();
  } catch {
    return null;
  }
}

// 에디터 CLI 실행 — Windows 의 .cmd 는 셸을 거쳐야 한다
function runEditor(cli, args) {
  const opts = { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"], windowsHide: true };
  if (process.platform === "win32" && /\.cmd$/i.test(cli)) {
    return execFileSync(process.env.comspec || "cmd.exe", ["/d", "/s", "/c", `""${cli}" ${args.map((a) => `"${a}"`).join(" ")}"`], {
      ...opts,
      windowsVerbatimArguments: true,
    });
  }
  return execFileSync(cli, args, opts);
}

const say = (line = "") => process.stdout.write(`${line}\n`);

// sudo 로 돌리면 ~/.claude 아래에 root 소유 파일이 생겨, 이후 Claude·펫이 그 파일을 못 고친다
function refuseRoot(what) {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return false;
  say(`termimon ${what} 은 sudo 없이 실행한다 — 관리자 권한으로 만든 파일은 이후 일반 사용자가 고칠 수 없다`);
  process.exitCode = 1;
  return true;
}

// Electron 실행 파일을 받아 둔다. 설치 때(postinstall) 못 받았으면(오프라인·--ignore-scripts) 여기서 받는다.
// 펫을 띄울 때는 받지 않으므로(!termimon 이 그만큼 멈춘다) setup 이 유일한 두 번째 기회다
function ensureElectron(dryRun) {
  let dir;
  try {
    dir = path.dirname(require.resolve("electron/package.json"));
  } catch {
    say("Electron       패키지가 없음 — npm install 을 다시 한다");
    process.exitCode = 1;
    return;
  }
  const ready = (() => {
    try {
      return fs.existsSync(path.join(dir, "dist", fs.readFileSync(path.join(dir, "path.txt"), "utf8").trim()));
    } catch {
      return false;
    }
  })();
  if (ready) return say("Electron       준비됨");
  if (dryRun) return say("Electron       받을 예정 (약 100MB)");
  say("Electron       받는 중 (약 100MB)…");
  try {
    require("electron"); // Electron 44: 실행 파일이 없으면 이 순간 받는다
    say("Electron       준비됨");
  } catch (e) {
    say(`Electron       받지 못함 (${String(e.message).split("\n")[0]}) — 네트워크를 확인하고 다시 termimon setup`);
    process.exitCode = 1;
  }
}

function setup({ dryRun = false, editor = true } = {}) {
  if (refuseRoot("setup")) return;
  say(dryRun ? "termimon setup — 미리 보기 (아무것도 바꾸지 않는다)\n" : "termimon setup\n");
  ensureElectron(dryRun);

  // 0. 옛 이름(pkmon) 데이터 폴더에서 설정·위치·그림 캐시를 가져온다 — 새 폴더를 만드는 1 보다 먼저.
  // 명령을 한 번이라도 실행했으면 config.load 가 이미 가져왔다. 옛 폴더 지우기는 옛 훅·확장을 걷은 뒤 맨 끝에
  if (!dryRun) migrateLegacyHome();

  // 1. 펫 데이터 폴더
  const homeExists = fs.existsSync(PATHS.home);
  say(`펫 데이터 폴더  ${PATHS.home}  ${homeExists ? "있음" : dryRun ? "만들 예정" : "만듦"}`);
  if (!homeExists && !dryRun) fs.mkdirSync(PATHS.home, { recursive: true });

  // 2. 훅 파일 — 같으면 건너뛴다. 다르면 새 버전으로 바꾼다 (훅은 이 도구의 일부라 사용자가 고칠 파일이 아니다)
  const target = hookTarget();
  const same = fs.existsSync(target) && fs.readFileSync(target).equals(fs.readFileSync(HOOK_SOURCE));
  say(`훅 파일        ${target}  ${same ? "최신" : fs.existsSync(target) ? (dryRun ? "새 버전으로 바꿀 예정" : "새 버전으로 바꿈") : dryRun ? "복사할 예정" : "복사함"}`);
  if (!same && !dryRun) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(HOOK_SOURCE, target);
  }

  // 3. CLI 마다 훅 등록 — 쓰고 있는 CLI(설정 폴더가 있는 것)만. 하나가 실패해도 나머지는 계속한다
  let legacyKept = false; // 옛 이름 훅 등록이 남았을 수 있다 — 그러면 옛 훅 파일을 지우지 않는다
  for (const t of TARGETS) {
    const label = `훅 등록        ${t.name.padEnd(12)}`;
    if (!t.always && !fs.existsSync(t.dir())) {
      say(`${label}설치 안 됨 (${t.dir()} 없음) — 건너뜀`);
      continue;
    }
    const read = readSettings(t);
    if (read.error) {
      say(`${label}${read.error}`);
      process.exitCode = 1;
      legacyKept = true;
      continue;
    }
    // 옛 이름 등록은 걷고 새 훅으로 다시 등록한다 — 두면 옛 훅과 새 훅이 함께 돈다
    const legacy = removeHooks(read.data, isLegacy);
    const { added, fixed } = addHooks(read.data, t);
    const what = [
      legacy.length ? `옛 이름(pkmon) 훅 ${legacy.length}개 걷음${dryRun ? " 예정" : ""}` : "",
      added.length ? `이벤트 ${added.length}개 추가${dryRun ? " 예정" : ""}: ${added.join(", ")}` : "",
      fixed.length ? `없는 경로를 가리키던 ${fixed.length}개 고침${dryRun ? " 예정" : ""}: ${fixed.join(", ")}` : "",
    ].filter(Boolean);
    if (!what.length) say(`${label}${settingsFile(t)}  이미 등록됨`);
    else {
      say(`${label}${settingsFile(t)}  ${what.join(" · ")}`);
      if (!dryRun) {
        const wrote = writeSettings(t, read.data, read.existed);
        if (wrote.error) {
          say(`               ${wrote.error}`);
          process.exitCode = 1;
          if (legacy.length) legacyKept = true;
        } else if (wrote.backup) say(`               백업: ${wrote.backup}`);
      }
    }
    for (const note of hookNotes(t, read.data, added.length > 0)) say(`               ${note}`);
  }

  // 옛 훅 파일 — 옛 등록을 다 걷었을 때만 지운다. 등록만 남고 파일이 없으면 CLI 이벤트마다 없는 파일을 실행한다
  const legacyHook = legacyHookTarget();
  if (fs.existsSync(legacyHook)) {
    if (legacyKept) say(`옛 훅 파일     ${legacyHook}  설정에서 옛 등록을 다 걷지 못해 남김`);
    else {
      say(`옛 훅 파일     ${legacyHook}  ${dryRun ? "지울 예정" : "지움"}`);
      if (!dryRun) fs.rmSync(legacyHook, { force: true });
    }
  }

  // 4. 에디터 확장 — 같은 창의 여러 터미널 탭 중 펫을 띄운 탭에서만 보이게 한다
  let vsix = vsixFile();
  const clis = editor ? editorClis() : [];
  // git clone 설치 — 묶는 스크립트로 vsix 를 만든다. 미리 보기에서는 파일을 만들지 않고 예정으로만 둔다
  const toBuild = editor && !vsix && fs.existsSync(VSIX_BUILDER);
  if (toBuild && dryRun) say("에디터 확장    vsix 파일이 없음 — 묶어서 설치할 예정");
  if (toBuild && !dryRun) {
    vsix = buildVsix();
    say(`에디터 확장    vsix 파일이 없어 묶음${vsix ? `: ${vsix}` : " — 실패"}`);
  }
  if (!editor) say("에디터 확장    --no-editor — 건너뜀");
  else if (!vsix && !(toBuild && dryRun)) say("에디터 확장    vsix 파일이 없음 — 건너뜀");
  else if (!clis.length) {
    say("에디터 확장    VS Code 계열 에디터 CLI 를 못 찾음 — 에디터에서 직접 설치:");
    if (vsix) say(`               확장 보기 → … → VSIX 에서 설치 → ${vsix}`);
  } else {
    for (const { name, file: cli } of clis) {
      if (dryRun) {
        say(`에디터 확장    ${name}: 설치할 예정 (${cli})`);
        continue;
      }
      try {
        runEditor(cli, ["--install-extension", vsix, "--force"]);
        say(`에디터 확장    ${name}: 설치함 — 열려 있는 창은 다시 불러와야 적용된다`);
      } catch (e) {
        say(`에디터 확장    ${name}: 설치 실패 (${String(e.message).split("\n")[0]})`);
      }
    }
  }
  for (const { name, file: cli } of clis) removeLegacyExtension(name, cli, dryRun);

  removeLegacyHome(dryRun);

  say();
  if (dryRun) say("실제로 적용하려면: termimon setup");
  else if (process.exitCode) say("설치가 덜 끝났다 — 위 메시지를 확인한 뒤 다시 termimon setup");
  else say("끝. CLI(claude·codex·gemini)를 새로 열고 !termimon eevee 로 띄워 보세요. 일반 터미널에서는 termimon eevee");
}

// 옛 이름(pkmon) 확장이 깔려 있으면 지운다 — 두면 옛 데이터 폴더에 창 기록을 계속 쓴다.
// 목록으로 먼저 본다 — 없는 확장을 지우면 실패로 끝나 "없음"과 "못 지움"을 가를 수 없다
function removeLegacyExtension(name, cli, dryRun) {
  let installed;
  try {
    installed = runEditor(cli, ["--list-extensions"])
      .split(/\r?\n/)
      .some((id) => id.trim().toLowerCase() === LEGACY_EXTENSION_ID);
  } catch {
    return;
  }
  if (!installed) return;
  if (dryRun) {
    say(`에디터 확장    ${name}: 옛 확장 ${LEGACY_EXTENSION_ID} 제거할 예정`);
    return;
  }
  try {
    runEditor(cli, ["--uninstall-extension", LEGACY_EXTENSION_ID]);
    say(`에디터 확장    ${name}: 옛 확장 ${LEGACY_EXTENSION_ID} 제거함`);
  } catch (e) {
    say(`에디터 확장    ${name}: 옛 확장 제거 실패 (${String(e.message).split("\n")[0]})`);
  }
}

// 옛 이름(pkmon) 데이터 폴더를 지운다 — 가져올 것(LEGACY_HOME_ITEMS)이 새 폴더에 다 있을 때만.
// 가져오기 전에 새 폴더가 먼저 생겨 못 가져왔으면 남기고 알린다
function removeLegacyHome(dryRun) {
  const old = PATHS.legacyHome;
  if (!fs.existsSync(old)) return;
  if (dryRun && !fs.existsSync(PATHS.home)) {
    say(`옛 데이터      ${old}  설정·위치·그림 캐시를 ${PATHS.home} 로 가져오고 지울 예정`);
    return;
  }
  const missing = LEGACY_HOME_ITEMS.filter((item) => fs.existsSync(path.join(old, item)) && !fs.existsSync(path.join(PATHS.home, item)));
  if (missing.length) {
    say(`옛 데이터      ${old}  남김 — 새 폴더에 없는 것: ${missing.join(", ")} (필요하면 ${PATHS.home} 로 옮긴 뒤 다시 setup)`);
    return;
  }
  say(`옛 데이터      ${old}  ${dryRun ? "지울 예정" : "지움"} (가져올 것은 ${PATHS.home} 에 있음)`);
  if (dryRun) return;
  try {
    fs.rmSync(old, { recursive: true, force: true });
  } catch (e) {
    // Windows — 떠 있는 옛 펫이 electron 폴더를 잡고 있다
    say(`               다 지우지 못함 (${e.code || e.message}) — 떠 있는 옛 펫을 내린 뒤 다시 termimon setup`);
  }
}

// codex --version → [주, 부, 수]. 못 알아내면 null (설치 안 됨·PATH 밖)
function codexVersion() {
  try {
    // Windows 의 codex 는 npm 이 만든 codex.cmd 라 셸을 거쳐야 한다. 인자가 고정이라 셸에 넘겨도 안전하다
    const out = execSync("codex --version", { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    const m = out.match(/(\d+)\.(\d+)\.(\d+)/);
    return m ? m.slice(1).map(Number) : null;
  } catch {
    return null;
  }
}
const olderThan = (a, b) => (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) < 0;

// 등록은 됐지만 CLI 쪽 사정으로 안 돌 수 있는 경우를 알린다
function hookNotes(target, data, added) {
  const notes = [];
  if (target.cli === "gemini" && data.hooksConfig && data.hooksConfig.enabled === false) {
    notes.push("hooksConfig.enabled 가 false 라 gemini 훅이 꺼져 있다 — 상태에 반응하지 않는다");
  }
  if (target.cli === "codex") {
    const v = codexVersion();
    if (v && olderThan(v, CODEX_HOOKS_SINCE)) {
      notes.push(`codex ${v.join(".")} 에는 훅이 없다 — ${CODEX_HOOKS_SINCE.join(".")} 이상으로 올리면 상태에 반응한다 (npm i -g @openai/codex)`);
    } else if (v && added && !olderThan(v, [0, 129, 0])) {
      notes.push("codex 는 새 훅을 한 번 승인해야 돌린다 — codex 에서 /hooks");
    }
  }
  return notes;
}

function uninstall({ dryRun = false, purge = false, editor = true } = {}) {
  if (refuseRoot("uninstall")) return;
  say(dryRun ? "termimon uninstall — 미리 보기 (아무것도 바꾸지 않는다)\n" : "termimon uninstall\n");

  // 설치할 때 폴더가 없어 건너뛴 CLI 도 본다 — 그 뒤에 설정 파일이 생겼을 수 있다
  for (const t of TARGETS) {
    const label = `훅 등록        ${t.name.padEnd(12)}`;
    if (!fs.existsSync(settingsFile(t))) {
      say(`${label}설정 파일 없음`);
      continue;
    }
    const read = readSettings(t);
    if (read.error) {
      say(`${label}${read.error}`);
      process.exitCode = 1;
      continue;
    }
    const removed = removeHooks(read.data, (h) => isOurs(h) || isLegacy(h)); // 옛 이름(pkmon) 등록도 함께
    if (!removed.length) say(`${label}${settingsFile(t)}  등록된 훅 없음`);
    else if (dryRun) say(`${label}이벤트 ${removed.length}개에서 뺄 예정: ${removed.join(", ")}`);
    else {
      const wrote = writeSettings(t, read.data, read.existed);
      if (wrote.error) {
        say(`${label}${wrote.error}`);
        process.exitCode = 1;
      } else {
        say(`${label}이벤트 ${removed.length}개에서 뺌: ${removed.join(", ")}`);
        if (wrote.backup) say(`               백업: ${wrote.backup}`);
      }
    }
  }

  const target = hookTarget();
  // 등록을 못 뺐으면 훅 파일은 남긴다 — 등록만 남고 파일이 없으면 CLI 이벤트마다 없는 파일을 실행한다
  if (process.exitCode) say("훅 파일        설정에서 등록을 빼지 못해 남김");
  else {
    if (fs.existsSync(target)) {
      say(`훅 파일        ${target}  ${dryRun ? "지울 예정" : "지움"}`);
      if (!dryRun) fs.rmSync(target, { force: true });
    } else say("훅 파일        없음");
    const legacyHook = legacyHookTarget();
    if (fs.existsSync(legacyHook)) {
      say(`옛 훅 파일     ${legacyHook}  ${dryRun ? "지울 예정" : "지움"}`);
      if (!dryRun) fs.rmSync(legacyHook, { force: true });
    }
  }

  for (const { name, file: cli } of editor ? editorClis() : []) {
    removeLegacyExtension(name, cli, dryRun);
    if (dryRun) {
      say(`에디터 확장    ${name}: 제거할 예정`);
      continue;
    }
    try {
      runEditor(cli, ["--uninstall-extension", EXTENSION_ID]);
      say(`에디터 확장    ${name}: 제거함`);
    } catch {
      say(`에디터 확장    ${name}: 설치돼 있지 않음`);
    }
  }

  if (purge) {
    say(`펫 데이터      ${PATHS.home}  ${dryRun ? "지울 예정" : "지움"} (설정·위치·그림 캐시)`);
    if (!dryRun) fs.rmSync(PATHS.home, { recursive: true, force: true });
    if (fs.existsSync(PATHS.legacyHome)) {
      say(`옛 데이터      ${PATHS.legacyHome}  ${dryRun ? "지울 예정" : "지움"}`);
      if (!dryRun) fs.rmSync(PATHS.legacyHome, { recursive: true, force: true });
    }
  } else {
    say(`펫 데이터      ${PATHS.home}  남김 (설정·위치·그림 캐시까지 지우려면 --purge)`);
    if (fs.existsSync(PATHS.legacyHome)) say(`옛 데이터      ${PATHS.legacyHome}  남김 (--purge 면 함께 지운다)`);
  }
}

// 진단용 — 훅 파일이 최신인가, CLI 마다 등록돼 있는가
// 반환: { file, current, clis: [{ name, used, error?, registered?, total? }] } — used 가 false 면 그 CLI 를 안 쓴다
function hookInstalled() {
  const file = fs.existsSync(hookTarget());
  // 업데이트 뒤 훅 파일이 옛 버전인지 — 내용이 번들과 다르면 termimon setup 으로 바꿔야 한다
  const current = file && fs.readFileSync(hookTarget()).equals(fs.readFileSync(HOOK_SOURCE));
  const clis = TARGETS.map((t) => {
    if (!t.always && !fs.existsSync(t.dir())) return { name: t.name, used: false };
    const read = readSettings(t);
    if (read.error) return { name: t.name, used: true, error: read.error };
    const hooks = read.data.hooks || {};
    const events = Object.keys(t.events);
    const registered = events.filter(
      (e) => Array.isArray(hooks[e]) && hooks[e].some((g) => Array.isArray(g?.hooks) && g.hooks.some(isOurs)),
    ).length;
    return { name: t.name, used: true, registered, total: events.length };
  });
  return { file, current, clis };
}

module.exports = { setup, uninstall, hookInstalled };
