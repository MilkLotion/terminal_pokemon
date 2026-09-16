// 설정 한 곳 — 기본값·경로·사용자 설정을 여기서만 정한다
// main.js, bin/pkmon, bin/pkmon-status 가 모두 이 파일을 참고한다
const fs = require("fs");
const os = require("os");
const path = require("path");

const PROJECT_DIR = __dirname;
const PKMON_HOME = path.join(os.homedir(), ".claude", "pkmon");

// 경로 — 하드코딩을 한 곳에 모은다
const PATHS = {
  project: PROJECT_DIR,
  config: path.join(PROJECT_DIR, "pkmon.config.json"),
  example: path.join(PROJECT_DIR, "pkmon.config.example.json"),
  home: PKMON_HOME,
  state: path.join(PKMON_HOME, "state"), // 훅이 세션 상태를 적는 곳
  activeTerminal: path.join(PKMON_HOME, "active-terminal.json"), // VS Code 확장이 활성 탭을 적는 곳
  // 이름 바꾸기 전 경로 — 확장을 새로 불러오기 전까지는 구버전이 여기에 적는다 (나중에 지워도 됨)
  activeTerminalLegacy: path.join(os.homedir(), ".claude", "pet", "active-terminal.json"),
  gifs: path.join(PKMON_HOME, "gifs"), // 원본 GIF 캐시
  hook: path.join(os.homedir(), ".claude", "scripts", "hooks", "pkmon-state.cjs"),
  electron: path.join(PROJECT_DIR, "node_modules", ".bin", "electron"),
};

// 사용자가 손대는 값 — pkmon.config.json 에 저장된다
const USER_DEFAULTS = {
  slug: "pikachu", // 펫 이름 (codex-pokepets 의 pets/ 폴더명)
  dotSize: 2, // 도트 한 칸을 몇 px 로 볼지 — 펫 크기를 좌우한다. 0 이면 원본 그대로
  useGif: "auto", // 원본 GIF 재생 — auto · off(팩 스프라이트시트)
  keepVisible: false, // true 면 크롬 등 다른 앱을 봐도 펫이 남는다 (Cmd+Alt+K)
  clickThrough: false, // true 면 펫 위 클릭이 아래 터미널로 통과한다 (Cmd+Alt+P)
  pos: "fix", // fix = 따라가는 창 안에만 있게 가둔다 · free = 화면 아무 데나 둘 수 있다
  fps: 7, // 스프라이트시트 모드에서만 쓰는 프레임 속도
};

// 손댈 일 없는 내부 기본값 — 바꿀 일이 생기면 여기만 고친다
const INTERNAL = {
  source: path.join(os.homedir(), "dev", "project", "1.personal", "codex-pokepets"), // 스프라이트 저장소
  scale: 1, // 스프라이트시트 모드 창 배율
  motionAssist: "off", // 스프라이트 위에 움직임 덧붙이기 — off · auto · on
  pingPong: "auto", // 루프가 끊긴 스프라이트 왕복 재생 — auto · on · off
  anchorDx: -24, // 따라갈 창의 오른쪽 아래 기준 위치
  anchorDy: -60,
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

// 설정 읽기 — 파일 → 환경변수 순으로 덮어쓴다
// 환경변수는 "이번 한 번만" 다르게 쓰는 용도라 파일에 저장하지 않는다
function load() {
  const saved = readJson(PATHS.config);
  const config = { ...USER_DEFAULTS, ...INTERNAL, ...saved };

  // 창 위치는 드래그할 때 자동 저장되는 값 — 사용자가 적을 일은 없다
  config.window = { dx: INTERNAL.anchorDx, dy: INTERNAL.anchorDy, ...(saved.window || {}) };

  const env = process.env;
  // 환경변수로 덮어쓴 값은 저장할 때 제외한다 — "이번 한 번만" 이라는 뜻이므로
  const fromEnv = new Set();
  const override = (key, value) => {
    config[key] = value;
    fromEnv.add(key);
  };
  if (env.PKMON_SLUG) override("slug", env.PKMON_SLUG);
  if (env.PKMON_DOT_SIZE) override("dotSize", Number(env.PKMON_DOT_SIZE));
  if (env.PKMON_USE_GIF) override("useGif", env.PKMON_USE_GIF);
  if (env.PKMON_KEEP_VISIBLE) override("keepVisible", true);
  if (env.PKMON_POS) override("pos", env.PKMON_POS);
  if (env.PKMON_SCALE) override("scale", Number(env.PKMON_SCALE) || config.scale);
  if (env.PKMON_SOURCE) override("source", env.PKMON_SOURCE);
  config.fromEnv = fromEnv;

  // pkmon 래퍼가 넘기는 실행 정보 — 설정이 아니라 이번 실행의 맥락이다
  config.runtime = {
    termPid: Number(env.PKMON_TERM_PID) || null, // 이 터미널 탭에서만 표시
    matchCwd: env.PKMON_MATCH_CWD || null, // 조상 기록이 없을 때 쓰는 대비책
    index: Number(env.PKMON_INDEX) || 0, // 여러 마리를 옆으로 미는 순번
    anchorApp: env.PKMON_ANCHOR_APP || null, // 따라갈 앱 (터미널 종류로 결정)
    activeTerminalFile: env.PKMON_ACTIVE_FILE || PATHS.activeTerminal,
    debug: Boolean(env.PKMON_DEBUG),
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
  out.window = config.window;
  try {
    fs.writeFileSync(PATHS.config, `${JSON.stringify(out, null, 2)}\n`);
  } catch {
    // 저장 실패는 무시 — 위치 기억만 못 한다
  }
}

function spritePath(config, slug = config.slug) {
  return path.join(config.source, "pets", slug, "spritesheet.webp");
}

module.exports = { PATHS, USER_DEFAULTS, INTERNAL, load, save, spritePath };
