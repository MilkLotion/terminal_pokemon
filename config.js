// 설정 한 곳 — 기본값·경로·사용자 설정을 여기서만 정한다
// main.js, cli/(termimon 명령), 진단 도구가 모두 이 파일을 참고한다
const fs = require("fs");
const os = require("os");
const path = require("path");

const PROJECT_DIR = __dirname;
const TERMIMON_HOME = path.join(os.homedir(), ".claude", "termimon");

// 경로 — 하드코딩을 한 곳에 모은다
const PATHS = {
  project: PROJECT_DIR,
  // 사용자 설정은 홈에 둔다. 프로그램 폴더 안에 두면 npm 으로 업데이트할 때마다 지워지고,
  // Node 버전 관리자(nvm)로 버전을 바꾸면 설정이 따로 논다
  config: path.join(TERMIMON_HOME, "config.json"),
  legacyConfig: path.join(PROJECT_DIR, "pkmon.config.json"), // 예전 위치 — 처음 읽을 때 한 번 가져온다
  legacyHome: path.join(os.homedir(), ".claude", "pkmon"), // 옛 이름(pkmon) 시절의 데이터 폴더 — migrateLegacyHome
  lastError: path.join(TERMIMON_HOME, "last-error.json"), // 펫이 못 떴을 때의 이유 — 펫 출력은 버려지므로 여기 남긴다
  electronData: path.join(TERMIMON_HOME, "electron"), // Electron 캐시·세션 — uninstall --purge 로 같이 지워지게 홈 아래에
  home: TERMIMON_HOME,
  state: path.join(TERMIMON_HOME, "state"), // 훅이 세션 상태를 적는 곳
  windows: path.join(TERMIMON_HOME, "windows"), // VS Code 창마다 자기 상태를 적는 곳 (창 하나당 파일 하나)
  gifs: path.join(TERMIMON_HOME, "gifs"), // 원본 GIF 캐시
  pmd: path.join(TERMIMON_HOME, "pmd"), // PMD 스프라이트 묶음 캐시 (CC BY-NC — 저장소엔 넣지 않는다)
  // 떠 있는 펫 — 펫마다 pid 파일 하나 (petFile). 재부팅하면 비워지도록 임시 폴더에 둔다
  pets: path.join(os.tmpdir(), "termimon-pets"),
};

// 사용자가 손대는 값 — PATHS.config 에 저장된다
const USER_DEFAULTS = {
  slug: "pikachu", // 펫 이름 (codex-pokepets 의 pets/ 폴더명)
  dotSize: 2, // 도트 한 칸을 몇 px 로 볼지 — 펫 크기를 좌우한다. 0 이면 원본 그대로
  art: "pmd", // 그림 소스 — pmd(동작 여러 개) · showdown(원본 GIF, 동작 하나) · sheet(codex 팩)
  buddy: "on", // 창 안을 돌아다니고 졸고 만지면 반응 — on · calm(덜 돌아다님) · off. PMD 에서만 동작
  keepVisible: false, // true 면 크롬 등 다른 앱을 봐도 펫이 남는다 (Cmd+Alt+K)
  clickThrough: false, // true 면 펫 위 클릭이 아래 터미널로 통과한다 (Cmd+Alt+P)
  pos: "fix", // fix = 따라가는 창 안에만 있게 가둔다 · free = 화면 아무 데나 둘 수 있다
  fps: 7, // 스프라이트시트 모드에서만 쓰는 프레임 속도
};

// 손댈 일 없는 내부 기본값 — 바꿀 일이 생기면 여기만 고친다
const INTERNAL = {
  source: null, // codex-pokepets 저장소 경로 — art=sheet 에만 쓴다. TERMIMON_SOURCE 로 준다
  scale: 1, // 스프라이트시트 모드 창 배율
  motionAssist: "off", // 스프라이트 위에 움직임 덧붙이기 — off · auto · on
  pingPong: "auto", // 루프가 끊긴 스프라이트 왕복 재생 — auto · on · off
  anchorDx: -24, // 따라갈 창의 오른쪽 아래 기준 위치
  anchorDy: -60,
};

// 객체가 아니면(null·배열·숫자로 망가진 파일) 없는 것으로 친다 — "art" in null 같은 데서 죽지 않게
function readJson(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

// 옛 이름(pkmon) 데이터 폴더에서 가져올 것 — 설정·위치와 그림 캐시.
// electron(캐시)·state·windows(실행 중 기록)는 새로 생기는 값이라 가져오지 않는다
const LEGACY_HOME_ITEMS = ["config.json", "pmd", "gifs"];

// 새 데이터 폴더가 아직 없으면 옛 폴더에서 가져온다 — 이름을 바꾼 뒤 처음 실행할 때 한 번.
// 옮기지 않고 복사한다 — 떠 있는 옛 펫이 폴더를 잡고 있으면(Windows) 옮기기가 실패한다. 옛 폴더는 setup 이 지운다
function migrateLegacyHome() {
  if (fs.existsSync(PATHS.home) || !fs.existsSync(PATHS.legacyHome)) return;
  for (const item of LEGACY_HOME_ITEMS) {
    const from = path.join(PATHS.legacyHome, item);
    if (!fs.existsSync(from)) continue;
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
  const config = { ...USER_DEFAULTS, ...INTERNAL, ...saved };
  // 예전엔 useGif 로 갈랐다. 같은 축이 둘이면 모순 조합(art=pmd + gif=off)이 생겨 art 로 합쳤다
  if (!("art" in saved) && saved.useGif === "off") config.art = "sheet";
  if (env.TERMIMON_SLUG) config.slug = env.TERMIMON_SLUG; // 위치 키를 만들기 전에 펫 이름부터 확정

  // 창 위치는 드래그할 때 자동 저장되는 값 — 사용자가 적을 일은 없다
  // 펫마다 따로 기억한다. 한 칸만 두면 두 마리를 띄웠을 때 한 마리를 옮기는 순간 다른 마리 자리가 덮인다
  config.windowKey = `${config.slug}#${Number(env.TERMIMON_INDEX) || 0}`;
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

  if (env.TERMIMON_SLUG) override("slug", env.TERMIMON_SLUG);
  if (env.TERMIMON_DOT_SIZE) override("dotSize", Number(env.TERMIMON_DOT_SIZE));
  if (env.TERMIMON_ART) override("art", env.TERMIMON_ART);
  // 예전 gif=off·gif=on — art 를 따로 주지 않았을 때만 art 로 옮긴다
  else if (asBool(env.TERMIMON_USE_GIF) === false) override("art", "sheet");
  else if (asBool(env.TERMIMON_USE_GIF) === true) override("art", "showdown");
  if (env.TERMIMON_BUDDY) override("buddy", env.TERMIMON_BUDDY);
  if (env.TERMIMON_FPS) override("fps", Number(env.TERMIMON_FPS) || config.fps);
  boolOverride("keepVisible", env.TERMIMON_KEEP_VISIBLE);
  boolOverride("clickThrough", env.TERMIMON_CLICK_THROUGH);
  if (env.TERMIMON_POS) override("pos", env.TERMIMON_POS);
  if (env.TERMIMON_SCALE) override("scale", Number(env.TERMIMON_SCALE) || config.scale);
  if (env.TERMIMON_SOURCE) override("source", env.TERMIMON_SOURCE);
  // buddy 는 on·calm·off 세 가지. on/off 자리에 true/false·1/0 도 받는다 — 모르는 값이면 켠다(기본)
  const buddyBool = asBool(config.buddy);
  if (buddyBool !== null) config.buddy = buddyBool ? "on" : "off";
  else if (!["on", "calm", "off"].includes(String(config.buddy).toLowerCase())) config.buddy = "on";
  else config.buddy = String(config.buddy).toLowerCase();
  config.fromEnv = fromEnv;

  // termimon 명령이 넘기는 실행 정보 — 설정이 아니라 이번 실행의 맥락이다
  config.runtime = {
    termPid: Number(env.TERMIMON_TERM_PID) || null, // 이 터미널 탭에서만 표시
    hostPid: Number(env.TERMIMON_HOST_PID) || null, // 이 프로세스(CLI LLM)가 끝나면 펫도 끝난다
    session: Number(env.TERMIMON_SESSION) || null, // pid 파일 이름의 세션 번호 (petFile)
    // termimon 이 구한 조상 — 펫은 따로 떠서 termimon 이 곧바로 끝나므로, 펫이 스스로 구하면 부모 관계가 끊겨 있다
    ancestors: String(env.TERMIMON_ANCESTORS || "")
      .split(",")
      .map(Number)
      .filter((pid) => pid > 0),
    matchCwd: env.TERMIMON_MATCH_CWD || null, // 조상 기록이 없을 때 쓰는 대비책
    index: Number(env.TERMIMON_INDEX) || 0, // 여러 마리를 옆으로 미는 순번
    anchorApp: env.TERMIMON_ANCHOR_APP || null, // 따라갈 앱 (터미널 종류로 결정)
    windowsDir: env.TERMIMON_WINDOWS_DIR || PATHS.windows,
    debug: Boolean(env.TERMIMON_DEBUG),
    // buddy 시간을 한꺼번에 줄인다 — 5분 수면을 몇 초 만에 확인하는 시험용 (0.05 면 20배 빠르게)
    buddyTimeScale: Number(env.TERMIMON_BUDDY_TIMESCALE) > 0 ? Number(env.TERMIMON_BUDDY_TIMESCALE) : 1,
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
    fs.writeFileSync(PATHS.config, `${JSON.stringify(out, null, 2)}\n`);
  } catch {
    // 저장 실패는 무시 — 위치 기억만 못 한다
  }
}

// codex 스프라이트시트 경로 — 저장소를 모르면 null
function spritePath(config, slug = config.slug) {
  return config.source ? path.join(config.source, "pets", slug, "spritesheet.webp") : null;
}

// 펫 하나의 pid 파일 — <세션>-<펫 pid>-<순번>-<펫 이름>.pid. termimon 이 만들고, 펫이 창을 띄우면 ready 를 적고,
// 파일이 사라지면 펫이 스스로 끝난다 (termimon stop · 같은 펫을 옵션만 바꿔 다시 띄움).
// 이름·순번을 파일 이름에 둔다 — 내용은 펫이 ready 를 적으며 덮어쓰고, 이름은 termimon stop <펫> 이, 순번은 옆자리 배치가 쓴다
function petFile(session, pid, index, slug) {
  return path.join(PATHS.pets, `${session}-${pid}-${index}-${slug}.pid`);
}

module.exports = { PATHS, USER_DEFAULTS, INTERNAL, LEGACY_HOME_ITEMS, load, save, spritePath, petFile, migrateLegacyHome };
