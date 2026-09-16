// pkmon setup / uninstall — 남의 컴퓨터에 설치하는 부분이라 가장 조심스럽게 다룬다.
//
//   1. Claude 훅       ~/.claude/scripts/hooks/pkmon-state.cjs 복사 + settings.json 에 7개 이벤트 등록
//   2. 펫 데이터 폴더   ~/.claude/pkmon — 훅은 이 폴더가 없으면 아무것도 안 한다
//   3. 에디터 확장      VS Code 계열에 탭 구분 확장 설치 (에디터 CLI 가 있을 때만)
//
// 원칙
//   - settings.json 은 백업을 남기고, 이미 있는 항목은 건드리지 않고, 몇 번을 돌려도 결과가 같다
//   - 파싱할 수 없는 settings.json 은 고치려 들지 않고 멈춘다
//   - --dry-run 이면 무엇을 바꿀지만 보여 준다
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PATHS } = require("../config.js");

const PROJECT = path.join(__dirname, "..");
const HOOK_NAME = "pkmon-state.cjs";
const HOOK_SOURCE = path.join(PROJECT, "hooks", HOOK_NAME);
const EXTENSION_ID = "local.pkmon-active-terminal";

// Claude Code 는 CLAUDE_CONFIG_DIR 로 설정 폴더를 옮길 수 있다
const claudeDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const settingsFile = () => path.join(claudeDir(), "settings.json");
const hookTarget = () => path.join(claudeDir(), "scripts", "hooks", HOOK_NAME);

// 이벤트별 matcher — 도구 이벤트는 모든 도구, 나머지는 matcher 없이
const HOOK_EVENTS = {
  SessionStart: undefined,
  UserPromptSubmit: "",
  PreToolUse: ".*",
  PermissionRequest: ".*",
  PostToolUseFailure: ".*",
  Stop: undefined,
  StopFailure: undefined,
};

const isOurs = (hook) => typeof hook?.command === "string" && hook.command.includes(HOOK_NAME);

// 경로에 공백이 있어도(Windows 사용자 이름 등) 깨지지 않게 따옴표로 감싼다
const hookCommand = () => `node "${hookTarget()}"`;

// settings.json 을 읽는다. 우리가 이해하지 못하는 모양이면 고치려 들지 않고 멈춘다 —
// 남의 설정 파일을 "알아서" 바로잡다가 사용자 훅을 날리는 것보다 멈추고 알리는 편이 낫다
function readSettings() {
  const file = settingsFile();
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

// 등록된 훅 명령이 가리키는 파일 — 정확히 `node <경로>` · `node "<경로>"` 모양일 때만. 그 밖(환경변수·플래그·래퍼)은 null
function hookPathOf(command) {
  const m = command.trim().match(/^node\s+(?:"([^"]+)"|(\S+))$/);
  if (!m) return null;
  const p = m[1] || m[2];
  return p.replace(/^~(?=[\\/])/, os.homedir()).replace(/^\$HOME(?=[\\/])/, os.homedir());
}

// 훅 등록을 더한다 — 이미 우리 훅이 있는 이벤트는 그대로 둔다.
// 단 없는 파일을 가리키는 옛 등록(다른 경로에 설치했다 지운 경우)은 지금 경로로 고친다 — 두면 훅이 조용히 죽는다.
// 반환: { added: 더한 이벤트, fixed: 경로를 고친 이벤트 }
function addHooks(data) {
  const added = [];
  const fixed = [];
  if (!data.hooks) data.hooks = {}; // 모양 검사는 readSettings 가 했다
  for (const [event, matcher] of Object.entries(HOOK_EVENTS)) {
    const groups = data.hooks[event] || [];
    const ours = groups.flatMap((g) => (Array.isArray(g?.hooks) ? g.hooks.filter(isOurs) : []));
    if (ours.length) {
      for (const hook of ours) {
        const file = hookPathOf(hook.command);
        // 모양을 알아볼 수 있고 그 파일이 없을 때만 고친다 — 사용자가 감싼 명령은 그대로 둔다.
        // 지금 설치하는 자리는 setup 이 먼저 복사하므로 있는 것으로 본다 (미리 보기에서도 같은 판정이 나오게)
        if (file && path.resolve(file) !== path.resolve(hookTarget()) && !fs.existsSync(file)) {
          hook.command = hookCommand();
          if (!fixed.includes(event)) fixed.push(event);
        }
      }
      continue;
    }
    const group = { hooks: [{ type: "command", command: hookCommand(), async: true, timeout: 5 }] };
    if (matcher !== undefined) group.matcher = matcher;
    data.hooks[event] = [...groups, group];
    added.push(event);
  }
  return { added, fixed };
}

// 우리 훅만 걷어낸다 — 같은 묶음에 남의 훅이 있으면 그건 남긴다
function removeHooks(data) {
  const removed = [];
  if (!data.hooks || typeof data.hooks !== "object") return removed;
  for (const [event, groups] of Object.entries(data.hooks)) {
    if (!Array.isArray(groups)) continue;
    let touched = false;
    const kept = [];
    for (const g of groups) {
      if (!Array.isArray(g?.hooks) || !g.hooks.some(isOurs)) {
        kept.push(g);
        continue;
      }
      touched = true;
      const rest = g.hooks.filter((h) => !isOurs(h));
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
function writeSettings(data, existed) {
  const link = settingsFile();
  try {
    fs.mkdirSync(path.dirname(link), { recursive: true });
    const file = existed ? fs.realpathSync(link) : link;
    const mode = existed ? fs.statSync(file).mode & 0o777 : 0o600;
    let backup = null;
    if (existed) {
      backup = `${link}.pkmon-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
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
  try {
    const hits = fs.readdirSync(dir).filter((f) => f.endsWith(".vsix")).sort();
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
  say(`pkmon ${what} 은 sudo 없이 실행한다 — 관리자 권한으로 만든 파일은 이후 일반 사용자가 고칠 수 없다`);
  process.exitCode = 1;
  return true;
}

// Electron 실행 파일을 받아 둔다. 설치 때(postinstall) 못 받았으면(오프라인·--ignore-scripts) 여기서 받는다.
// 펫 실행 중에는 받지 않으므로(대상 명령이 늦어진다) setup 이 유일한 두 번째 기회다
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
    say(`Electron       받지 못함 (${String(e.message).split("\n")[0]}) — 네트워크를 확인하고 다시 pkmon setup`);
    process.exitCode = 1;
  }
}

function setup({ dryRun = false, editor = true } = {}) {
  if (refuseRoot("setup")) return;
  say(dryRun ? "pkmon setup — 미리 보기 (아무것도 바꾸지 않는다)\n" : "pkmon setup\n");
  ensureElectron(dryRun);

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

  // 3. settings.json
  const read = readSettings();
  if (read.error) {
    say(`설정 등록      ${read.error}`);
    process.exitCode = 1;
  } else {
    const { added, fixed } = addHooks(read.data);
    const what = [
      added.length ? `이벤트 ${added.length}개 추가${dryRun ? " 예정" : ""}: ${added.join(", ")}` : "",
      fixed.length ? `없는 경로를 가리키던 ${fixed.length}개 고침${dryRun ? " 예정" : ""}: ${fixed.join(", ")}` : "",
    ].filter(Boolean);
    if (!what.length) say(`설정 등록      ${settingsFile()}  이미 등록됨`);
    else {
      say(`설정 등록      ${settingsFile()}  ${what.join(" · ")}`);
      if (!dryRun) {
        const wrote = writeSettings(read.data, read.existed);
        if (wrote.error) {
          say(`               ${wrote.error}`);
          process.exitCode = 1;
        } else if (wrote.backup) say(`               백업: ${wrote.backup}`);
      }
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

  say();
  if (dryRun) say("실제로 적용하려면: pkmon setup");
  else if (process.exitCode) say("설치가 덜 끝났다 — 위 메시지를 확인한 뒤 다시 pkmon setup");
  else say("끝. 새 터미널에서 pkmon eevee 로 띄워 보세요.");
}

function uninstall({ dryRun = false, purge = false, editor = true } = {}) {
  if (refuseRoot("uninstall")) return;
  say(dryRun ? "pkmon uninstall — 미리 보기 (아무것도 바꾸지 않는다)\n" : "pkmon uninstall\n");

  const read = readSettings();
  if (read.error) {
    say(`설정 등록      ${read.error}`);
    process.exitCode = 1;
  } else {
    const removed = removeHooks(read.data);
    if (!removed.length) say(`설정 등록      ${settingsFile()}  등록된 훅 없음`);
    else if (dryRun) say(`설정 등록      이벤트 ${removed.length}개에서 뺄 예정: ${removed.join(", ")}`);
    else {
      const wrote = writeSettings(read.data, read.existed);
      if (wrote.error) {
        say(`설정 등록      ${wrote.error}`);
        process.exitCode = 1;
      } else {
        say(`설정 등록      이벤트 ${removed.length}개에서 뺌: ${removed.join(", ")}`);
        if (wrote.backup) say(`               백업: ${wrote.backup}`);
      }
    }
  }

  const target = hookTarget();
  // 등록을 못 뺐으면 훅 파일은 남긴다 — 등록만 남고 파일이 없으면 Claude 이벤트마다 없는 파일을 실행한다
  if (process.exitCode) say("훅 파일        설정에서 등록을 빼지 못해 남김");
  else if (fs.existsSync(target)) {
    say(`훅 파일        ${target}  ${dryRun ? "지울 예정" : "지움"}`);
    if (!dryRun) fs.rmSync(target, { force: true });
  } else say("훅 파일        없음");

  for (const { name, file: cli } of editor ? editorClis() : []) {
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
  } else {
    say(`펫 데이터      ${PATHS.home}  남김 (설정·위치·그림 캐시까지 지우려면 --purge)`);
  }
}

// 진단용 — 훅이 등록돼 있는가
function hookInstalled() {
  const read = readSettings();
  if (read.error) return null;
  const groups = Object.keys(HOOK_EVENTS).map((e) => (read.data.hooks || {})[e]);
  const registered = groups.filter((g) => Array.isArray(g) && g.some((x) => Array.isArray(x?.hooks) && x.hooks.some(isOurs))).length;
  const file = fs.existsSync(hookTarget());
  // 업데이트 뒤 훅 파일이 옛 버전인지 — 내용이 번들과 다르면 pkmon setup 으로 바꿔야 한다
  const current = file && fs.readFileSync(hookTarget()).equals(fs.readFileSync(HOOK_SOURCE));
  return { registered, total: groups.length, file, current };
}

module.exports = { setup, uninstall, hookInstalled };
