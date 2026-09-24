// 커맨드 배선 — dispatcher 를 만들고 무대가 받는 명령을 등록한다. writer 면 mailbox 를 잇는다 (CLI·확장·읽기 전용 펫의 요청).
//
// 저장을 바꾸는 명령은 전부 거래 실행기(`src/main/game-v3.ts`)로 간다. 여기서 저장을 직접 고치지 않는다.
//   writer  실행기를 직접 부른다
//   reader  mailbox 로 보낸다. writer 가 처리해 파일에 쓰면 감시가 읽어 온다
// 창 표시 항목(hidden · clickThrough · keepVisible)만 저장 밖의 설정이라 여기서 처리한다.
// 결과 문구는 표면이 구성한다 — 여기서는 코드만 돌려준다.
import { bridgeMailbox, createDispatcher, type Dispatcher } from "../commands/dispatcher";
import type { MailServer } from "../save/mailbox";
import type { Command, CommandName, CommandResult, Mode } from "../shared/types";
import type { Size } from "./layout";
import type { PartySource } from "./party";
import type { V3Party } from "./party-v3";
import type { GameV3 } from "./game-v3";
import type { CareAction } from "../state/types";
import { send } from "../save/mailbox";
import { candidates, dayPartOf } from "../dex/evolve";
import { appearanceOf } from "../dex/appearance";
import { unlockRules } from "../dex/unlocks";
import type { SaveV3 } from "../shared/save-v3";

export interface CommandSettings {
  hidden(): boolean;
  setHidden(on: boolean): void;
  clickThrough(): boolean;
  setClickThrough(on: boolean): void;
  keepVisible(): boolean;
  setKeepVisible(on: boolean): void;
}

export interface CommandContext {
  mode: Mode;
  mailboxDir: string;
  party: PartySource | V3Party;
  game?: GameV3 | null; // 세션 펫(sandbox)은 저장이 없어 null 이다
  stage: { poke(id: string): boolean; care?(id: string, action: CareAction): void; petIds(): string[]; size(): Size; visible(): boolean };
  settings: CommandSettings;
  quit(): void;
  prepareLook?(look: string): Promise<boolean>;
  onChanged?(evolvedId?: string): Promise<void>;
  log?: ((o: Record<string, unknown>) => void) | null;
}

export interface Commands {
  dispatcher: Dispatcher;
  setWriter(on: boolean): void; // writer 가 되면 mailbox 를 잇고, 내주면 끊는다
  stop(): void;
}

const isObj = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);

// on/off · true/false · 1/0 · yes/no. 모르면 null
export function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return null;
  const v = String(value).trim().toLowerCase();
  if (["1", "on", "true", "yes", "y"].includes(v)) return true;
  if (["0", "off", "false", "no", "n"].includes(v)) return false;
  return null;
}

const SETTING_KEYS = ["hidden", "clickThrough", "keepVisible"] as const;
type SettingKey = (typeof SETTING_KEYS)[number];
const isSettingKey = (v: unknown): v is SettingKey => typeof v === "string" && (SETTING_KEYS as readonly string[]).includes(v);

// 그림을 기다린 뒤 이보다 오래된 요청은 반영하지 않는다. 보낸 쪽은 진화 답을 45초 기다린다 (src/save/mailbox.ts).
// 보낸 쪽이 포기한 뒤에 진화하면 실패로 안 채로 상태만 바뀐다
const EVOLVE_EXPIRE_MS = 40_000;

// 인자를 풀어 실행기에 넣기만 하면 되는 명령 — 무대 반응도 그림 준비도 필요 없다.
// party.show · party.hide · pet.set 은 reader 경로가 달라 `ctx.party` 가 맡는다 (src/main/party-v3.ts)
const V3_ONLY: readonly CommandName[] = [
  "party.place",
  "party.swap",
  "party.keep",
  "egg.care",
  "egg.open",
  "bag.use",
  "shop.buy",
  "achievement.claim",
  "tutorial.skip",
  "tutorial.done",
  "starter.pick",
];

export function createCommands(ctx: CommandContext): Commands {
  const log = ctx.log ?? null;
  const dispatcher = createDispatcher({ log });
  let server: MailServer | null = null;

  const target = (c: Command): string | null => (typeof c.target === "string" && c.target ? c.target : null);

  const v3Save = (): SaveV3 | null => (ctx.party.kind === "v3" ? ctx.party.save() : null);

  // 저장을 바꾸는 명령 하나 — writer 면 실행기로, reader 면 mailbox 로.
  // mailbox 를 잇고 있는 쪽(server)이 reader 일 수는 없다. 그때는 받아 줄 writer 가 없다는 뜻이다
  async function runV3(c: Command): Promise<CommandResult> {
    if (!ctx.game || ctx.party.kind !== "v3") return { ok: false, reason: "sandbox" };
    if (!ctx.party.isWriter()) return server ? { ok: false, reason: "not-writer" } : send(ctx.mailboxDir, c);
    const result = ctx.game.send({ cmd: c.cmd, target: c.target, args: c.args }, c.from);
    ctx.party.refresh();
    return result;
  }

  // 저장이 바뀐 뒤 무대를 다시 그린다. 진화는 그 마리를 축하한다
  async function refreshAfter(evolvedId?: string): Promise<void> {
    try {
      await ctx.onChanged?.(evolvedId);
    } catch (e) {
      log?.({ commands: "refresh-failed", message: String(e) });
    }
  }

  dispatcher.register("quit", () => {
    // 회신이 먼저 파일에 내려가게 한 박자 뒤에 끝낸다 (mailbox 로 온 quit)
    setTimeout(() => ctx.quit(), 50);
    return { ok: true, reason: "ok" };
  });

  // 창 표시 항목은 저장 밖의 설정이라 여기서 처리한다. 그 밖의 키는 저장으로 넘긴다
  dispatcher.register("settings.set", (c) => {
    const key = target(c) ?? (isObj(c.args) ? c.args.key : undefined);
    if (!isSettingKey(key)) return runV3(c);
    const value = asBool(isObj(c.args) ? c.args.value : undefined);
    if (value == null) return { ok: false, reason: "bad-value", key };
    if (key === "hidden") ctx.settings.setHidden(value);
    else if (key === "clickThrough") ctx.settings.setClickThrough(value);
    else ctx.settings.setKeepVisible(value);
    return { ok: true, reason: "ok", key, value };
  });

  const showHide = (shown: boolean) => async (c: Command): Promise<CommandResult> => {
    const id = target(c);
    if (!id) return { ok: false, reason: "no-pet" };
    return ctx.party.setShown(id, shown);
  };
  dispatcher.register("party.show", showHide(true));
  dispatcher.register("party.hide", showHide(false));

  // pet.set — 자리만 받는다. 크기·모습은 아직 없다
  dispatcher.register("pet.set", async (c) => {
    const id = target(c);
    if (!id || !ctx.party.all().some((p) => p.id === id)) return { ok: false, reason: "no-pet", id: String(id) };
    const home = isObj(c.args) ? c.args.home : undefined;
    if (!isObj(home)) return { ok: false, reason: "not-yet", id };
    const { dx, dy } = home;
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return { ok: false, reason: "bad-value", id };
    if (ctx.party.kind === "v3") return ctx.party.setHome(id, { dx, dy });
    ctx.party.setHome(id, { dx, dy });
    return { ok: true, reason: "ok", id, home: { dx, dy } };
  });

  // 돌봄 — 저장은 실행기가 바꾸고 무대는 반응만 보인다
  for (const action of ["feed", "play"] as const) dispatcher.register(action, async (c) => {
    const id = target(c);
    if (!id) return { ok: false, reason: "no-pet" };
    const result = await runV3(c);
    if (result.ok) ctx.stage.care?.(id, action);
    return result;
  });

  // 찌르기는 무대 반응만 한다. 저장을 바꾸는 규칙이 v3 에 아직 없다
  dispatcher.register("poke", (c) => {
    const id = target(c);
    if (!id) return { ok: false, reason: "no-pet" };
    return ctx.stage.poke(id) ? { ok: true, reason: "ok", id } : { ok: false, reason: "no-pet", id };
  });

  // 진화는 그림이 있어야 한다. 바뀔 모습을 먼저 받아 두고, 못 받으면 저장을 건드리지 않는다
  dispatcher.register("evolve", async (c) => {
    const id = target(c);
    if (!id) return { ok: false, reason: "no-pet" };
    const save = ctx.game && ctx.party.isWriter() ? v3Save() : null;
    if (save) {
      const pet = save.pets.find((row) => row.id === id);
      if (!pet) return { ok: false, reason: "no-pet", id };
      const choice = typeof c.args?.to === "string" ? c.args.to : null;
      const targets = choice ? [choice] : candidates(save, id, dayPartOf(Date.now())).filter((x) => x.ready).map((x) => x.to);
      for (const species of targets) {
        const look = appearanceOf({ species, shiny: pet.shiny });
        if (ctx.prepareLook && !(await ctx.prepareLook(look))) return { ok: false, reason: "art-missing", look };
      }
      if (c.at != null && Date.now() - c.at > EVOLVE_EXPIRE_MS) return { ok: false, reason: "expired", id };
    }
    const result = await runV3(c);
    if (result.ok) await refreshAfter(id);
    return result;
  });

  // 모습 선택(pet.look)은 v3 에 아직 없다. 저장의 `look` 은 legacy 로만 남아 있다
  dispatcher.register("pet.look", () => ({ ok: false, reason: "not-yet" }));

  // 나머지 저장 명령 — 인자를 풀고 실행기에 넣는 일만 한다
  for (const cmd of V3_ONLY) dispatcher.register(cmd, async (c) => {
    const result = await runV3(c);
    if (result.ok) await refreshAfter();
    return result;
  });


  // CLI·확장이 읽는 현재 상태. 저장 v3 의 값을 그대로 준다 — 화면 문구는 표면이 만든다
  dispatcher.register("snapshot", () => {
    const save = v3Save();
    const slots = save?.party.slots ?? [];
    return {
      ok: true,
      reason: "ok",
      mode: ctx.mode,
      writer: ctx.party.isWriter(),
      stage: ctx.stage.size(),
      visible: ctx.stage.visible(),
      shown: ctx.stage.petIds(),
      hidden: ctx.settings.hidden(),
      clickThrough: ctx.settings.clickThrough(),
      keepVisible: ctx.settings.keepVisible(),
      slots: slots.length ? slots.filter((s) => s.state !== "locked").length : null,
      points: save?.points.balance ?? null,
      bag: save?.bag ?? {},
      unlocked: save?.dex.unlocked ?? [],
      obtained: save?.dex.obtained ?? [],
      dex: unlockRules(),
      eggs: save?.eggs.map((e) => ({ id: e.id, kind: e.kind, ready: e.ready, remainMs: e.remainMs })) ?? [],
      achievements: save?.achievements ?? {},
      log: save?.log ?? [],
      party: save
        ? slots.map((s, index) => ({ index, state: s.state, petId: s.petId ?? null, hidden: s.hidden === true }))
        : ctx.party.all(),
      pets: save?.pets ?? [],
    };
  });


  return {
    dispatcher,
    setWriter(on) {
      if (on && !server) {
        server = bridgeMailbox(dispatcher, ctx.mailboxDir, { log });
        log?.({ commands: "mailbox", dir: ctx.mailboxDir });
      } else if (!on && server) {
        server.stop();
        server = null;
      }
    },
    stop() {
      server?.stop();
      server = null;
    },
  };
}
