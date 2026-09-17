// 커맨드 배선 — dispatcher 를 만들고 무대가 받는 명령을 등록한다. writer 면 mailbox 를 잇는다 (CLI·확장·읽기 전용 펫의 요청).
// S2 등록: quit · settings.set(hidden · clickThrough · keepVisible) · party.show / party.hide · pet.set(home 만) · poke · snapshot.
// 밥·놀기·진화·상점은 S3~S4 에서 핸들러와 함께 들어온다. 결과는 문구가 아니라 코드 — 문구는 표면이 만든다
import { bridgeMailbox, createDispatcher, type Dispatcher } from "../commands/dispatcher";
import type { MailServer } from "../save/mailbox";
import type { Command, CommandResult, Mode } from "../shared/types";
import type { Size } from "./layout";
import type { PartySource } from "./party";

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
  party: PartySource;
  stage: { poke(id: string): boolean; petIds(): string[]; size(): Size; visible(): boolean };
  settings: CommandSettings;
  quit(): void;
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

export function createCommands(ctx: CommandContext): Commands {
  const log = ctx.log ?? null;
  const dispatcher = createDispatcher({ log });
  let server: MailServer | null = null;

  const target = (c: Command): string | null => (typeof c.target === "string" && c.target ? c.target : null);

  dispatcher.register("quit", () => {
    // 회신이 먼저 파일에 내려가게 한 박자 뒤에 끝낸다 (mailbox 로 온 quit)
    setTimeout(() => ctx.quit(), 50);
    return { ok: true, reason: "ok" };
  });

  dispatcher.register("settings.set", (c) => {
    const key = target(c) ?? (isObj(c.args) ? c.args.key : undefined);
    if (!isSettingKey(key)) return { ok: false, reason: "unknown-key", key: String(key) };
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

  // pet.set — S2 는 home 만. 다른 키(nick · size · look …)는 아직
  dispatcher.register("pet.set", (c) => {
    const id = target(c);
    if (!id || !ctx.party.all().some((p) => p.id === id)) return { ok: false, reason: "no-pet", id: String(id) };
    const home = isObj(c.args) ? c.args.home : undefined;
    if (!isObj(home)) return { ok: false, reason: "not-yet", id };
    const { dx, dy } = home;
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return { ok: false, reason: "bad-value", id };
    ctx.party.setHome(id, { dx, dy });
    return { ok: true, reason: "ok", id, home: { dx, dy } };
  });

  // 콕 찌르기 — S2 는 반응 동작만. 친밀도는 S3
  dispatcher.register("poke", (c) => {
    const id = target(c);
    if (!id) return { ok: false, reason: "no-pet" };
    return ctx.stage.poke(id) ? { ok: true, reason: "ok", id } : { ok: false, reason: "no-pet", id };
  });

  dispatcher.register("snapshot", () => {
    const save = ctx.party.save();
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
      slots: save?.slots ?? null,
      party: ctx.party.all(),
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
