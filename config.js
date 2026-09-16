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
  windows: path.join(PKMON_HOME, "windows"), // VS Code 창마다 자기 상태를 적는 곳 (창 하나당 파일 하나)
  gifs: path.join(PKMON_HOME, "gifs"), // 원본 GIF 캐시
  pmd: path.join(PKMON_HOME, "pmd"), // PMD 스프라이트 묶음 캐시 (CC BY-NC — 저장소엔 넣지 않는다)
};

// 사용자가 손대는 값 — pkmon.config.json 에 저장된다
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
  const env = process.env;
  const config = { ...USER_DEFAULTS, ...INTERNAL, ...saved };
  // 예전엔 useGif 로 갈랐다. 같은 축이 둘이면 모순 조합(art=pmd + gif=off)이 생겨 art 로 합쳤다
  if (!("art" in saved) && saved.useGif === "off") config.art = "sheet";
  if (env.PKMON_SLUG) config.slug = env.PKMON_SLUG; // 위치 키를 만들기 전에 펫 이름부터 확정

  // 창 위치는 드래그할 때 자동 저장되는 값 — 사용자가 적을 일은 없다
  // 펫마다 따로 기억한다. 한 칸만 두면 두 마리를 띄웠을 때 한 마리를 옮기는 순간 다른 마리 자리가 덮인다
  config.windowKey = `${config.slug}#${Number(env.PKMON_INDEX) || 0}`;
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

  if (env.PKMON_SLUG) override("slug", env.PKMON_SLUG);
  if (env.PKMON_DOT_SIZE) override("dotSize", Number(env.PKMON_DOT_SIZE));
  if (env.PKMON_ART) override("art", env.PKMON_ART);
  // 예전 gif=off·gif=on — art 를 따로 주지 않았을 때만 art 로 옮긴다
  else if (asBool(env.PKMON_USE_GIF) === false) override("art", "sheet");
  else if (asBool(env.PKMON_USE_GIF) === true) override("art", "showdown");
  if (env.PKMON_BUDDY) override("buddy", env.PKMON_BUDDY);
  if (env.PKMON_FPS) override("fps", Number(env.PKMON_FPS) || config.fps);
  boolOverride("keepVisible", env.PKMON_KEEP_VISIBLE);
  boolOverride("clickThrough", env.PKMON_CLICK_THROUGH);
  if (env.PKMON_POS) override("pos", env.PKMON_POS);
  if (env.PKMON_SCALE) override("scale", Number(env.PKMON_SCALE) || config.scale);
  if (env.PKMON_SOURCE) override("source", env.PKMON_SOURCE);
  // buddy 는 on·calm·off 세 가지. on/off 자리에 true/false·1/0 도 받는다 — 모르는 값이면 켠다(기본)
  const buddyBool = asBool(config.buddy);
  if (buddyBool !== null) config.buddy = buddyBool ? "on" : "off";
  else if (!["on", "calm", "off"].includes(String(config.buddy).toLowerCase())) config.buddy = "on";
  else config.buddy = String(config.buddy).toLowerCase();
  config.fromEnv = fromEnv;

  // pkmon 래퍼가 넘기는 실행 정보 — 설정이 아니라 이번 실행의 맥락이다
  config.runtime = {
    termPid: Number(env.PKMON_TERM_PID) || null, // 이 터미널 탭에서만 표시
    matchCwd: env.PKMON_MATCH_CWD || null, // 조상 기록이 없을 때 쓰는 대비책
    index: Number(env.PKMON_INDEX) || 0, // 여러 마리를 옆으로 미는 순번
    anchorApp: env.PKMON_ANCHOR_APP || null, // 따라갈 앱 (터미널 종류로 결정)
    windowsDir: env.PKMON_WINDOWS_DIR || PATHS.windows,
    debug: Boolean(env.PKMON_DEBUG),
    // buddy 시간을 한꺼번에 줄인다 — 3분 수면을 몇 초 만에 확인하는 시험용 (0.05 면 20배 빠르게)
    buddyTimeScale: Number(env.PKMON_BUDDY_TIMESCALE) > 0 ? Number(env.PKMON_BUDDY_TIMESCALE) : 1,
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
    fs.writeFileSync(PATHS.config, `${JSON.stringify(out, null, 2)}\n`);
  } catch {
    // 저장 실패는 무시 — 위치 기억만 못 한다
  }
}

function spritePath(config, slug = config.slug) {
  return path.join(config.source, "pets", slug, "spritesheet.webp");
}

module.exports = { PATHS, USER_DEFAULTS, INTERNAL, load, save, spritePath };
