// S3 초기 균형값 — 2026-09-17 사용자 승인. 효과·상한·저장 주기를 한 곳에서 조정
export const STATE_RULES = {
  hourMs: 3_600_000,
  maxTickMs: 5_000, // 절전·중단 시간을 켜 두기 보상으로 세지 않음
  saveMs: 15_000,
  presencePerHour: 6,
  workPerHour: 12,
  tokensPerAffinity: 1_000,
  tokensPerPoint: 10_000,
  affinityCap: 200,
  pointsCap: 50,
  hungerPerHour: 10,
  hungryAt: 70,
  hungerMoodPerHour: 6,
  neglectAfterMs: 3_600_000,
  neglectMoodPerHour: 3,
  companyMoodPerHour: 2,
  feed: { hunger: 40, mood: 10, affinity: 8, cooldownMs: 600_000 },
  play: { mood: 12, affinity: 6, cooldownMs: 600_000 },
  poke: { mood: 2, affinity: 1, dailyMax: 10 },
  turn: { mood: 2, affinity: 1 },
  streakPoints: 2,
  streakMax: 7,
};
