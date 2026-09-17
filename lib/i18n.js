// 화면 문구 — 메뉴·트레이·설정창이 쓰는 말을 언어 파일(lib/i18n/<언어>.json)에서 키로 가져온다.
//
// 기본은 한국어(ko). 언어는 환경변수 POKEBUDDY_LANG → 설정 파일 lang → ko 순서로 정한다.
// 없는 키는 한국어 → 키 이름 순으로 떨어져 화면이 비지 않는다 (새 키를 영어에 아직 안 적어도 깨지지 않게).
// 코어(game/)는 문구가 아니라 코드(reason·nextAt)를 돌려주고, 문구는 여기서만 만든다 — 언어를 하나 더 얹을 때 코어를 건드리지 않게.
// CLI 의 안내문은 아직 한국어 그대로다 — 터미널 쪽은 다음 단계에서 같은 표로 옮긴다
const TABLES = {
  ko: require("./i18n/ko.json"),
  en: require("./i18n/en.json"),
};
const DEFAULT_LANG = "ko";

let lang = DEFAULT_LANG;

// 쓸 언어 — 모르는 값이면 기본 언어
function langOf(config = {}, env = process.env) {
  const want = String(env.POKEBUDDY_LANG || config.lang || DEFAULT_LANG).toLowerCase().slice(0, 2);
  return TABLES[want] ? want : DEFAULT_LANG;
}

function setLang(next) {
  lang = TABLES[next] ? next : DEFAULT_LANG;
  return lang;
}

const getLang = () => lang;

// 문구 — {이름} 자리에 vars 를 채운다. 없는 변수는 그대로 남겨 무엇이 빠졌는지 보이게
function t(key, vars = {}) {
  const table = TABLES[lang] || TABLES[DEFAULT_LANG];
  const text = table[key] ?? TABLES[DEFAULT_LANG][key] ?? key;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (vars[name] == null ? whole : String(vars[name])));
}

// 기분 0~100 → 다섯 단계 말 (최고·좋음·보통·시들·우울)
function moodWord(mood) {
  const m = Number(mood);
  const level = !Number.isFinite(m) ? 3 : m >= 80 ? 5 : m >= 60 ? 4 : m >= 40 ? 3 : m >= 20 ? 2 : 1;
  return t(`mood.${level}`);
}

// 다음에 할 수 있는 시각까지 남은 시간을 말로 — 1시간 넘으면 시간(반올림 — 2시간 31분은 "3시간 뒤", 3시간 1분은 "3시간 뒤"),
// 아니면 분(올림), 1분 안이면 "곧"
function untilWord(nextAt, now = Date.now()) {
  const ms = Number(nextAt) - now;
  if (!Number.isFinite(ms) || ms <= 60_000) return t("time.soon");
  if (ms >= 3_600_000) return t("time.inHours", { n: Math.max(1, Math.round(ms / 3_600_000)) });
  return t("time.inMinutes", { n: Math.ceil(ms / 60_000) });
}

module.exports = { t, langOf, setLang, getLang, moodWord, untilWord, DEFAULT_LANG, LANGS: Object.keys(TABLES) };
