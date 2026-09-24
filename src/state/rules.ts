// 앱이 게임 시간을 적용하는 주기 — 적립·만복도 수치는 src/save/rules.ts 의 TIME_V3_RULES 와 docs/specs/balance.md 다
export const STATE_RULES = {
  maxTickMs: 5_000, // 폴링 사이가 이보다 벌어지면 절전·중단으로 보고 작업 시간으로 세지 않는다
  saveMs: 15_000, // 게임 시간을 적용하고 저장하는 주기
};
