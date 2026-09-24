// 저장 v3 을 다루는 메인 쪽 입구 — 파일 읽기·쓰기, 거래 실행기, 시간 적용, 화면이 읽는 스냅샷을 한 곳에 모은다.
//
// 저장을 쓰는 곳은 거래 실행기 하나다 (docs/specs/modules.md "경계 원칙").
// 시간은 앱이 깨어 있는 동안만 흐른다. 창을 열거나 명령을 받을 때 그동안 멈췄던 시간을 한 번에 적용한다.
// 기존 v2 경로와 같은 파일을 쓰지 않는다. v3 은 자기 파일을 따로 둔다 — 두 경로가 함께 돌아도 서로를 덮지 않는다.
import path from "node:path";
import { PATHS } from "./paths.js";
import * as storeV3 from "../save/store-v3.js";
import { applyTime, type TickEvents } from "../state/time-v3.js";
import { createExecutor, type Executor, type TxResult } from "../tx/executor.js";
import { HANDLERS } from "../tx/handlers.js";
import { argsOf, requestIdOf, toCommandResult } from "../tx/bridge.js";
import { snapshot } from "../tx/snapshot.js";
import type { ManageReply, ManageRequest, Snapshot } from "../shared/manage";
import type { SaveV3 } from "../shared/save-v3";
import type { Command, CommandName, CommandSource } from "../shared/types";

// v2 는 save.json 을 쓴다. v3 은 옆에 자기 파일을 둔다
export const saveFileV3 = (): string => path.join(path.dirname(PATHS.save), "save-v3.json");

export interface GameV3 {
  file: string;
  read: () => SaveV3 | null;
  tick: () => TickEvents | null; // 멈췄던 시간을 한 번에 적용한다
  view: () => Snapshot | null;
  send: (req: ManageRequest, from: CommandSource) => ManageReply;
  executor: Executor;
}

export interface GameV3Options {
  file?: string;
  now?: () => number;
  rand?: () => number;
}

export function createGame({ file = saveFileV3(), now = Date.now, rand = Math.random }: GameV3Options = {}): GameV3 {
  const read = (): SaveV3 | null => storeV3.read(file, { repair: true }).state;

  const executor = createExecutor(
    {
      read,
      write: (s) => storeV3.write(file, s),
      now,
      rand,
    },
    HANDLERS,
  );

  // 멈췄던 시간을 한 번에 적용한다. 흐른 시간은 마지막 틱과 지금의 차이다
  const tick = (): TickEvents | null => {
    const save = read();
    if (!save) return null;
    const at = now();
    const elapsed = Math.max(0, at - save.lastTickAt);
    const events = applyTime(save, elapsed, at);
    save.savedAt = at;
    storeV3.write(file, save);
    return events;
  };

  const view = (): Snapshot | null => {
    const save = read();
    return save ? snapshot(save) : null;
  };

  // 화면이 보낸 요청을 명령으로 바꿔 실행기에 넘긴다. 다리와 같은 규칙을 쓴다
  const send = (req: ManageRequest, from: CommandSource): ManageReply => {
    const command: Command = { cmd: req.cmd as CommandName, target: req.target, args: req.args, from, at: now() };
    const res: TxResult = executor.run({ id: requestIdOf(command), name: command.cmd, args: argsOf(command) });
    return toCommandResult(res) as ManageReply;
  };

  return { file, read, tick, view, send, executor };
}
