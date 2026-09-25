// 설정 한 곳 — 기본값·경로·사용자 설정을 여기서만 정한다
// 메인(src/main/paths.ts 가 감싼다), cli/(pokebuddy 명령), 진단 도구가 모두 이 파일을 참고한다
const fs = require("fs");
const os = require("os");
const path = require("path");

const PROJECT_DIR = __dirname;
const POKEBUDDY_HOME = path.join(os.homedir(), ".claude", "pokebuddy");

// 경로 — 하드코딩을 한 곳에 모은다
const PATHS = {
  project: PROJECT_DIR,
  // 사용자 설정은 홈에 둔다. 프로그램 폴더 안에 두면 npm 으로 업데이트할 때마다 지워지고,
  // Node 버전 관리자(nvm)로 버전을 바꾸면 설정이 따로 논다
  config: path.join(POKEBUDDY_HOME, "config.json"),
  legacyConfig: path.join(PROJECT_DIR, "pkmon.config.json"), // 예전 위치 — 처음 읽을 때 한 번 가져온다
  // 옛 이름 시절의 데이터 폴더 — 최근 이름부터 (termimon ← pkmon). migrateLegacyHome
  legacyHomes: ["termimon", "pkmon"].map((name) => path.join(os.homedir(), ".claude", name)),
  lastError: path.join(POKEBUDDY_HOME, "last-error.json"), // 펫이 못 떴을 때의 이유 — 펫 출력은 버려지므로 여기 남긴다
  electronData: path.join(POKEBUDDY_HOME, "electron"), // Electron 캐시·세션 — uninstall --purge 로 같이 지워지게 홈 아래에
  home: POKEBUDDY_HOME,
  state: path.join(POKEBUDDY_HOME, "state"), // 훅이 세션 상태를 적는 곳
  windows: path.join(POKEBUDDY_HOME, "windows"), // VS Code 창마다 자기 상태를 적는 곳 (창 하나당 파일 하나)
  pmd: path.join(POKEBUDDY_HOME, "pmd"), // PMD 스프라이트 묶음 캐시 (CC BY-NC — 저장소엔 넣지 않는다)
  // 떠 있는 펫 — 펫마다 pid 파일 하나 (petFile). 재부팅하면 비워지도록 임시 폴더에 둔다
  pets: path.join(os.tmpdir(), "pokebuddy-pets"),
  // 동반자(pokebuddy companion) — 기기당 하나. 내용은 pid 파일과 같은 규약(`pid\nready`). 지우면 동반자가 스스로 끝난다.
  // 확장·CLI 는 이 파일의 pid 가 살아 있는지로 "동반자가 떠 있나"를 판정한다 (파일 존재가 아니라 pid 생존)
  companionLock: path.join(POKEBUDDY_HOME, "companion.lock"),
  // setup 이 적는 실행 경로 { electron, project, version } — VS Code 확장이 PATH·Node 버전과 무관하게 펫을 직접 띄우는 데 쓴다
  cli: path.join(POKEBUDDY_HOME, "cli.json"),
  // 저장 (src/save/) — 저장은 writer 프로세스 하나만 쓴다. 나머지는 mailbox 로 요청한다
  save: path.join(POKEBUDDY_HOME, "save.json"), // 게임 진행 v2 (src/save/store.ts)
  saveLock: path.join(POKEBUDDY_HOME, "save.lock"), // 저장을 쓰는 프로세스의 pid (src/save/writer.ts)
  mailbox: path.join(POKEBUDDY_HOME, "mailbox"), // 명령 통로 — 요청 파일 하나 = 요청 하나 (src/save/mailbox.ts)
};

// 실행 모드 — 펫이 무엇에 묶여 살고 무엇을 따르는가 (POKEBUDDY_MODE)
//   session    (기본) pokebuddy <종> · !pokebuddy <종> — 그 세션(CLI LLM 또는 터미널 셸)에 묶인 샌드박스 펫
//   window     VS Code 확장이 창마다 띄운 펫 — 그 창 위에만, 그 창의 활성 터미널 상태를 따른다. 확장 호스트와 함께 끝난다
//   companion  pokebuddy companion — 기기당 하나, 항상 위. 맨 앞 터미널 창을 따른다. 트레이로 끝낸다
const MODES = new Set(["session", "window", "companion"]);
// 설치한 실행 파일(pokebuddy.exe)인가 — 저장소의 `electron .` 과 npm 판은 process.defaultApp 이 true 다.
// 설치한 앱은 부른 세션이 없으므로 모드를 주지 않으면 동반자로 뜬다
const PACKAGED = !!process.versions.electron && !process.defaultApp;

// 사용자가 손대는 값 — PATHS.config 에 저장된다. 그림은 PMD 한 가지라 그림 고르는 값은 없다
// 여기 없는 키(옛 그림·위치 옵션 art · pos · fps 등)는 읽을 때 버리고, 다음에 저장할 때 파일에서도 빠진다 (load · save)
const USER_DEFAULTS = {
  slug: "pikachu", // 펫 이름 — 종 슬러그 (lib/dex.json)
  dotSize: 2, // 도트 한 칸을 몇 px 로 볼지 — 세션 펫 크기. 동반자·창 펫은 저장의 마리 크기(Pet.size)를 쓴다
  buddy: "on", // 창 안을 돌아다니고 졸고 만지면 반응 — on · calm(덜 돌아다님) · off
  keepVisible: false, // true 면 크롬 등 다른 앱을 봐도 펫이 남는다 (Cmd+Alt+K)
  clickThrough: false, // true 면 펫 위 클릭이 아래 터미널로 통과한다 (Cmd+Alt+P)
  lang: "ko", // 화면 문구 언어 — ko · en (lib/i18n). POKEBUDDY_LANG 으로 이번 실행만 바꿀 수 있다
};

// 손댈 일 없는 내부 기본값 — 바꿀 일이 생기면 여기만 고친다
const INTERNAL = {
  anchorDx: -24, // 따라갈 창의 오른쪽 아래 기준 위치
  anchorDy: -60,
};

// 객체가 아니면(null·배열·숫자로 망가진 파일) 없는 것으로 친다 — "slug" in null 같은 데서 죽지 않게
function readJson(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

// 옛 이름(termimon·pkmon) 데이터 폴더에서 가져올 것 — 설정·위치와 그림 캐시.
// electron(캐시)·state·windows(실행 중 기록)는 새로 생기는 값이라 가져오지 않는다
const LEGACY_HOME_ITEMS = ["config.json", "pmd"];

// 새 데이터 폴더가 아직 없으면 옛 폴더에서 가져온다 — 이름을 바꾼 뒤 처음 실행할 때 한 번.
// 항목마다 최근 이름 폴더부터 찾는다 — termimon 을 거치지 않고 pkmon 에서 바로 올라와도 가져오게
// 옮기지 않고 복사한다 — 떠 있는 옛 펫이 폴더를 잡고 있으면(Windows) 옮기기가 실패한다. 옛 폴더는 setup 이 지운다
function migrateLegacyHome() {
  if (fs.existsSync(PATHS.home)) return;
  for (const item of LEGACY_HOME_ITEMS) {
    const from = PATHS.legacyHomes.map((dir) => path.join(dir, item)).find((p) => fs.existsSync(p));
    if (!from) continue;
    try {
      fs.cpSync(from, path.join(PATHS.home, item), { recursive: true });
    } catch {
      // 못 가져온 것은 기본값·새 다운로드로 시작한다
    }
  }
}

// 예전 위치(프로그램 폴더)의 설정을 홈으로 가져온다 — 옮기지 않고 복사한다. 옛 버전으로 돌아가도 그대로 쓰게
function migrateLegacyConfig() {
  try {
    if (fs.existsSync(PATHS.config) || !fs.existsSync(PATHS.legacyConfig)) return;
    fs.mkdirSync(PATHS.home, { recursive: true });
    fs.copyFileSync(PATHS.legacyConfig, PATHS.config);
  } catch {
    // 못 가져오면 기본값으로 시작한다
  }
}

// 설정 읽기 — 파일 → 환경변수 순으로 덮어쓴다
// 환경변수는 "이번 한 번만" 다르게 쓰는 용도라 파일에 저장하지 않는다
function load() {
  migrateLegacyHome(); // 새 폴더를 만드는 migrateLegacyConfig 보다 먼저 — 폴더가 생기면 가져오지 않는다
  migrateLegacyConfig();
  const saved = readJson(PATHS.config);
  const env = process.env;
  // 파일에서는 USER_DEFAULTS 의 키만 가져온다 — 옛 키(art · pos · fps 등)는 조용히 버린다
  const known = Object.fromEntries(Object.keys(USER_DEFAULTS).filter((key) => key in saved).map((key) => [key, saved[key]]));
  const config = { ...USER_DEFAULTS, ...INTERNAL, ...known };
  if (env.POKEBUDDY_SLUG) config.slug = env.POKEBUDDY_SLUG; // 위치 키를 만들기 전에 펫 이름부터 확정

  const mode = MODES.has(env.POKEBUDDY_MODE) ? env.POKEBUDDY_MODE : PACKAGED ? "companion" : "session";

  // 창 위치는 드래그할 때 자동 저장되는 값 — 사용자가 적을 일은 없다
  // 펫마다 따로 기억한다. 한 칸만 두면 두 마리를 띄웠을 때 한 마리를 옮기는 순간 다른 마리 자리가 덮인다.
  // 모드도 가른다 — 동반자·창 펫이 세션 펫과 같은 키를 쓰면 함께 떠 있을 때 서로 집을 덮는다
  config.windowKey =
    mode === "session" ? `${config.slug}#${Number(env.POKEBUDDY_INDEX) || 0}` : `${mode === "window" ? "w" : "companion"}:${config.slug}`;
  const perPet = (saved.windows || {})[config.windowKey];
  config.window = {
    dx: INTERNAL.anchorDx,
    dy: INTERNAL.anchorDy,
    ...(saved.window || {}), // 펫별 저장 이전 버전의 값 — 있으면 출발점으로 쓴다
    ...(perPet || {}),
  };

  // 환경변수로 덮어쓴 값은 저장할 때 제외한다 — "이번 한 번만" 이라는 뜻이므로
  const fromEnv = new Set();
  const override = (key, value) => {
    config[key] = value;
    fromEnv.add(key);
  };
  // on/off · true/false · 1/0 · yes/no 를 받는다. 값이 없거나 알 수 없으면 손대지 않는다
  const asBool = (value) => {
    if (value == null || value === "") return null;
    const v = String(value).trim().toLowerCase();
    if (["1", "on", "true", "yes", "y"].includes(v)) return true;
    if (["0", "off", "false", "no", "n"].includes(v)) return false;
    return null;
  };
  const boolOverride = (key, value) => {
    const parsed = asBool(value);
    if (parsed !== null) override(key, parsed);
  };

  if (env.POKEBUDDY_SLUG) override("slug", env.POKEBUDDY_SLUG);
  if (env.POKEBUDDY_DOT_SIZE) override("dotSize", Number(env.POKEBUDDY_DOT_SIZE));
  if (env.POKEBUDDY_BUDDY) override("buddy", env.POKEBUDDY_BUDDY);
  boolOverride("keepVisible", env.POKEBUDDY_KEEP_VISIBLE);
  boolOverride("clickThrough", env.POKEBUDDY_CLICK_THROUGH);
  // buddy 는 on·calm·off 세 가지. on/off 자리에 true/false·1/0 도 받는다 — 모르는 값이면 켠다(기본)
  const buddyBool = asBool(config.buddy);
  if (buddyBool !== null) config.buddy = buddyBool ? "on" : "off";
  else if (!["on", "calm", "off"].includes(String(config.buddy).toLowerCase())) config.buddy = "on";
  else config.buddy = String(config.buddy).toLowerCase();
  config.fromEnv = fromEnv;

  // pokebuddy 명령이 넘기는 실행 정보 — 설정이 아니라 이번 실행의 맥락이다
  config.runtime = {
    mode, // session · window · companion (위 MODES)
    termPid: Number(env.POKEBUDDY_TERM_PID) || null, // 이 터미널 탭에서만 표시
    hostPid: Number(env.POKEBUDDY_HOST_PID) || null, // 이 프로세스(CLI LLM)가 끝나면 펫도 끝난다
    session: Number(env.POKEBUDDY_SESSION) || null, // pid 파일 이름의 세션 번호 (petFile)
    // pokebuddy 가 구한 조상 — 펫은 따로 떠서 pokebuddy 가 곧바로 끝나므로, 펫이 스스로 구하면 부모 관계가 끊겨 있다
    ancestors: String(env.POKEBUDDY_ANCESTORS || "")
      .split(",")
      .map(Number)
      .filter((pid) => pid > 0),
    matchCwd: env.POKEBUDDY_MATCH_CWD || null, // 조상 기록이 없을 때 쓰는 대비책
    index: Number(env.POKEBUDDY_INDEX) || 0, // 여러 마리를 옆으로 미는 순번
    anchorApp: env.POKEBUDDY_ANCHOR_APP || null, // 따라갈 앱 (터미널 종류로 결정)
    windowsDir: env.POKEBUDDY_WINDOWS_DIR || PATHS.windows,
    debug: Boolean(env.POKEBUDDY_DEBUG),
    // buddy 시간을 한꺼번에 줄인다 — 5분 수면을 몇 초 만에 확인하는 시험용 (0.05 면 20배 빠르게)
    buddyTimeScale: Number(env.POKEBUDDY_BUDDY_TIMESCALE) > 0 ? Number(env.POKEBUDDY_BUDDY_TIMESCALE) : 1,
  };
  return config;
}

// 사용자 값과 창 위치만 저장 — 내부 기본값이나 실행 정보는 파일에 남기지 않는다
function save(config, patch = {}) {
  Object.assign(config, patch);
  if (patch.window) config.window = { ...config.window, ...patch.window };

  const saved = readJson(PATHS.config);
  const out = {};
  for (const key of Object.keys(USER_DEFAULTS)) {
    // 환경변수로 덮어쓴 값은 이번 실행에만 적용 — 이번에 직접 바꾼 값이 아니면 파일 값을 유지한다
    const envOnly = config.fromEnv?.has(key) && !(key in patch);
    out[key] = envOnly ? (key in saved ? saved[key] : USER_DEFAULTS[key]) : config[key];
  }
  out.windows = { ...(saved.windows || {}) };
  if (config.windowKey) out.windows[config.windowKey] = config.window;
  try {
    fs.mkdirSync(PATHS.home, { recursive: true });
    // tmp 에 쓰고 rename — 동반자·창 펫·세션 펫이 함께 떠 있으면 같은 파일을 여럿이 쓴다. 쓰다 죽어도 반쪽 파일이 남지 않는다
    const tmp = `${PATHS.config}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(out, null, 2)}\n`);
    fs.renameSync(tmp, PATHS.config);
  } catch {
    // 저장 실패는 무시 — 위치 기억만 못 한다
  }
}

// 펫 하나의 pid 파일 — <세션>-<펫 pid>-<순번>-<펫 이름>.pid. pokebuddy 가 만들고, 펫이 창을 띄우면 ready 를 적고,
// 파일이 사라지면 펫이 스스로 끝난다 (pokebuddy stop · 같은 펫을 옵션만 바꿔 다시 띄움).
// 이름·순번을 파일 이름에 둔다 — 내용은 펫이 ready 를 적으며 덮어쓰고, 이름은 pokebuddy stop <펫> 이, 순번은 옆자리 배치가 쓴다
function petFile(session, pid, index, slug) {
  return path.join(PATHS.pets, `${session}-${pid}-${index}-${slug}.pid`);
}

// 창 펫(window 모드)의 pid 파일 — w-<확장 호스트 pid>-<펫 pid>.pid. 펫이 스스로 만들고, 사라지면 스스로 끝난다.
// 세션 펫 파일(숫자로 시작)과 모양을 달리해 livePets 목록에 섞이지 않는다
const WINDOW_PET_FILE = /^w-(\d+)-(\d+)\.pid$/;
function windowPetFile(hostPid, pid) {
  return path.join(PATHS.pets, `w-${hostPid}-${pid}.pid`);
}

module.exports = {
  PATHS,
  MODES,
  USER_DEFAULTS,
  INTERNAL,
  LEGACY_HOME_ITEMS,
  WINDOW_PET_FILE,
  load,
  save,
  petFile,
  windowPetFile,
  migrateLegacyHome,
};
