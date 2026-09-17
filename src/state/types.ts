import type { SessionUsage } from "../agents/usage";
import type { AgentState } from "../shared/types";

// 시각·파일 읽기·화면 상태는 호출자가 주입
export interface StateInput {
  now: number;
  shown: readonly string[];
  agent: AgentState;
  tokenWork: boolean;
  usages: SessionUsage[];
}
export type CareAction = "feed" | "play" | "poke";
