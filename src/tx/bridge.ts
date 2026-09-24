// 커맨드 처리기와 거래 실행기를 잇는 다리 — 계약은 docs/specs/modules.md "명령 계약"
//
// 표면(우클릭·트레이·CLI·확장)은 지금처럼 `Command` 를 보낸다. 여기서 `TxRequest` 로 바꿔 실행기에 넘기고
// 돌아온 결과를 다시 `CommandResult` 로 바꾼다. 표면은 v3 을 알 필요가 없다.
//
// 요청 식별자
//   보낸 쪽이 `args.reqId` 를 주면 그것을 쓴다. 같은 값으로 다시 보내면 한 번만 반영한다.
//   주지 않으면 보낸 곳·시각·명령·대상으로 만든다. 같은 순간에 같은 명령을 두 번 보내면 구분하지 못한다.
//   한 번만 반영해야 하는 조작(구매·부화·보상)은 보낸 쪽이 `reqId` 를 주는 것이 맞다.
import type { Command, CommandName, CommandResult } from "../shared/types.js";
import type { Dispatcher } from "../commands/dispatcher";
import type { Executor, TxRequest } from "./executor";

// 이 다리가 맡는 명령 — 나머지는 기존 모듈이 그대로 맡는다
export const V3_COMMANDS: readonly CommandName[] = [
  "party.show",
  "party.hide",
  "party.place",
  "party.swap",
  "party.keep",
  "egg.care",
  "egg.open",
  "bag.use",
  "shop.buy",
  "evolve",
];

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const int = (v: unknown): number | undefined => (typeof v === "number" && Number.isInteger(v) ? v : undefined);

export function requestIdOf(command: Command): string {
  const given = str(command.args?.reqId);
  if (given) return given;
  return `${command.from}:${command.at ?? 0}:${command.cmd}:${command.target ?? ""}`;
}

// `Command` 의 target·args 를 명령마다 다른 인자 모양으로 바꾼다
export function argsOf(command: Command): Record<string, unknown> {
  const a = command.args ?? {};
  const target = command.target;
  switch (command.cmd) {
    case "party.show":
    case "party.hide":
    case "party.keep":
      return { petId: target ?? str(a.petId) };
    case "party.place":
    case "party.swap":
      return { petId: target ?? str(a.petId), slotIndex: int(a.slotIndex) };
    case "egg.care":
      return { eggId: target ?? str(a.eggId), action: a.action };
    case "egg.open":
      return { eggId: target ?? str(a.eggId) };
    case "bag.use":
      return { itemId: target ?? str(a.itemId), petId: str(a.petId), nature: str(a.nature) };
    case "shop.buy":
      return { productId: target ?? str(a.productId) };
    case "evolve":
      return { petId: target ?? str(a.petId), to: str(a.to) };
    default:
      return { ...a };
  }
}

// 실행기 결과 → 표면이 읽는 결과. 성공은 reason 이 "ok" 다
export function toCommandResult(res: ReturnType<Executor["run"]>): CommandResult {
  if (!res.ok) return { ok: false, reason: res.reason };
  const body = res.result != null && typeof res.result === "object" ? (res.result as Record<string, unknown>) : {};
  return { ok: true, reason: "ok", replayed: res.replayed, ...body };
}

// 다리를 놓는다. 돌려주는 함수를 부르면 걷는다
export function registerV3(dispatcher: Dispatcher, executor: Executor): () => void {
  const off: (() => void)[] = [];
  for (const cmd of V3_COMMANDS) {
    const handler = (command: Command): CommandResult => {
      const req: TxRequest = { id: requestIdOf(command), name: command.cmd, args: argsOf(command) };
      return toCommandResult(executor.run(req));
    };
    off.push(dispatcher.register(cmd, handler));
  }
  return () => {
    for (const fn of off) fn();
  };
}
