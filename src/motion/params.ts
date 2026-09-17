// 성격 배율 — MotionParams 를 규칙표(rules.ts) 위에 곱해 마리별 규칙표를 만든다.
// S2 는 NEUTRAL_PARAMS 만 쓴다 — 이때 applyParams 의 결과 숫자는 MOTION_RULES 와 완전히 같아야 한다 (selftest-motion 이 대조).
// S3 가 성격 축(shared/types.ts Axis) → MotionParams 를 만드는 paramsFor(axes) 를 여기에 더한다
import { MOTION_RULES } from "./rules";
import type { MotionRules, Range } from "./rules";
import type { MotionParams } from "./types";

// 전부 1 · 0 — 배율은 곱해도 그대로, 끌림은 없음
export const NEUTRAL_PARAMS: MotionParams = {
  paceScale: 1,
  pauseScale: 1,
  fidgetScale: 1,
  sleepScale: 1,
  reactScale: 1,
  socialPull: 0, // S3 에서 — 다른 마리에게 다가감/멀어짐
  cursorPull: 0, // S3 에서 — 커서를 쫓음/피함
};

const scaleRange = ([lo, hi]: Range, k: number): Range => [lo * k, hi * k];

// 배율이 곱해지는 자리
//   TIMES.quiet · TIMES.sleep      × sleepScale   (안정성 — 잠들기까지 시간)
//   TIMES.reactMin                 × reactScale   (대담함 — 만지기 반응 길이)
//   RHYTHM.idle.pause · work.pause × pauseScale   (활동성 반대 — 쉬는 시간)
//   RHYTHM.idle.pace · work.pace   × paceScale    (활동성 — 걷는 속도)
//   MODES.on.fidget · calm.fidget  × fidgetScale  (제자리 동작 확률)
// socialPull · cursorPull 은 규칙표에 곱할 자리가 없다 — S3 의 brain 이 목표 고르기(wanderTarget)에서 직접 읽는다
export function applyParams(params: MotionParams = NEUTRAL_PARAMS, rules: MotionRules = MOTION_RULES): MotionRules {
  return {
    ...rules,
    TIMES: {
      quiet: rules.TIMES.quiet * params.sleepScale,
      sleep: rules.TIMES.sleep * params.sleepScale,
      reactMin: rules.TIMES.reactMin * params.reactScale,
    },
    RHYTHM: {
      idle: {
        ...rules.RHYTHM.idle,
        pause: scaleRange(rules.RHYTHM.idle.pause, params.pauseScale),
        pace: scaleRange(rules.RHYTHM.idle.pace, params.paceScale),
      },
      work: {
        ...rules.RHYTHM.work,
        pause: scaleRange(rules.RHYTHM.work.pause, params.pauseScale),
        pace: scaleRange(rules.RHYTHM.work.pace, params.paceScale),
      },
    },
    MODES: {
      on: { ...rules.MODES.on, fidget: rules.MODES.on.fidget * params.fidgetScale },
      calm: { ...rules.MODES.calm, fidget: rules.MODES.calm.fidget * params.fidgetScale },
    },
  };
}
