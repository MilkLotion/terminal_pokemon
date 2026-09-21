// 커맨드 배선 — dispatcher 를 만들고 무대가 받는 명령을 등록한다. writer 면 mailbox 를 잇는다 (CLI·확장·읽기 전용 펫의 요청).
// S2 등록: quit · settings.set(hidden · clickThrough · keepVisible) · party.show / party.hide · pet.set(home 만) · poke · snapshot.
// S3 돌봄과 S4 구매·진화·모습 선택을 저장과 무대에 연결. 결과 문구는 표면이 구성
import { bridgeMailbox, createDispatcher, type Dispatcher } from "../commands/dispatcher";
import type { MailServer } from "../save/mailbox";
import type { Command, CommandResult, Mode } from "../shared/types";
import type { Size } from "./layout";
import type { PartySource } from "./party";
import { care } from "../state/core";
import type { CareAction } from "../state/types";
import { send } from "../save/mailbox";
import { advance, evolve, evolutionOptions, setLook } from "../dex/progress";
import { appearanceOf } from "../dex/appearance";
import { unlockRules } from "../dex/unlocks";
import { buy, speciesForSale } from "../shop/core";
import { SHOP } from "../shop/catalog";
import type { SaveV2 } from "../shared/types";

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
  stage: { poke(id: string): boolean; care?(id: string, action: CareAction): void; petIds(): string[]; size(): Size; visible(): boolean };
  settings: CommandSettings;
  quit(): void;
  prepareLook?(look: string): Promise<boolean>;
  onChanged?(evolvedId?: string): Promise<void>;
  onUnlocked?(species: string[]): void;
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

  // pet.set — 위치. 모습은 pet.look 사용
  dispatcher.register("pet.set", async (c) => {
    const id = target(c);
    if (!id || !ctx.party.all().some((p) => p.id === id)) return { ok: false, reason: "no-pet", id: String(id) };
    const home = isObj(c.args) ? c.args.home : undefined;
    if (!isObj(home)) return { ok: false, reason: "not-yet", id };
    const { dx, dy } = home;
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return { ok: false, reason: "bad-value", id };
    if (ctx.party.kind === "save") return transact(c, (save) => {
      const pet = save.party.find((p) => p.id === id);
      if (!pet) return { ok: false, reason: "no-pet", id };
      pet.home = { dx, dy };
      return { ok: true, reason: "ok", id, home: { dx, dy } };
    });
    ctx.party.setHome(id, { dx, dy });
    return { ok: true, reason: "ok", id, home: { dx, dy } };
  });

  for (const action of ["feed", "play", "poke"] as const) dispatcher.register(action, async (c) => {
    const id = target(c);
    if (!id) return { ok: false, reason: "no-pet" };
    if (ctx.party.kind === "sandbox") return action === "poke" && ctx.stage.poke(id) ? { ok: true, reason: "ok", id } : { ok: false, reason: "sandbox" };
    if (!ctx.party.isWriter()) {
      const result = await send(ctx.mailboxDir, c);
      if (result.ok) ctx.stage.care?.(id, action);
      return result;
    }
    const save = ctx.party.save();
    if (!save) return { ok: false, reason: "no-pet" };
    const previous = structuredClone(save);
    const result = care(save, id, action, Date.now());
    if (result.ok && !ctx.party.persist()) {
      Object.assign(save, previous);
      return { ok: false, reason: "save-failed" };
    }
    if (result.ok) ctx.stage.care?.(id, action);
    return result;
  });

  // 비동기 그림 확인 중에는 저장을 변경하지 않음. 확인 후 최신 상태로 재검사
  async function transact(c: Command, apply: (save: SaveV2) => CommandResult): Promise<CommandResult> {
    if (ctx.party.kind === "sandbox") return { ok: false, reason: "sandbox" };
    if (!ctx.party.isWriter()) return server ? { ok: false, reason: "not-writer" } : send(ctx.mailboxDir, c);
    const initial = ctx.party.save();
    if (!initial) return { ok: false, reason: "no-pet" };
    let preview = structuredClone(initial);
    let result = apply(preview);
    if (!result.ok) return result;
    const changedLooks = (before: SaveV2, after: SaveV2): string[] => after.party.filter((p) => {
      const old = before.party.find((o) => o.id === p.id);
      return !old || appearanceOf(old) !== appearanceOf(p);
    }).map(appearanceOf);
    const needed = changedLooks(initial, preview);
    for (const look of needed) {
      if (!ctx.prepareLook || !await ctx.prepareLook(look)) return { ok: false, reason: "art-missing", look };
    }
    if (!ctx.party.isWriter()) return { ok: false, reason: "not-writer" };
    if (c.at != null && Date.now() - c.at > 40_000) return { ok: false, reason: "expired" };
    const save = ctx.party.save();
    if (!save) return { ok: false, reason: "no-pet" };
    preview = structuredClone(save);
    result = apply(preview);
    if (!result.ok) return result;
    if (changedLooks(save, preview).some((look) => !needed.includes(look))) return { ok: false, reason: "state-changed" };
    const unlocked = advance(preview, Date.now());
    const previous = structuredClone(save);
    Object.assign(save, preview);
    if (!ctx.party.persist()) {
      Object.assign(save, previous);
      return { ok: false, reason: "save-failed" };
    }
    try { await ctx.onChanged?.(c.cmd === "evolve" ? c.target : undefined); }
    catch (e) { log?.({ commands: "refresh-failed", message: String(e) }); }
    ctx.onUnlocked?.(unlocked);
    return result;
  }

  dispatcher.register("shop.buy", (c) => {
    const seed = Math.random();
    return transact(c, (save) => buy(save, c.target, c.args ?? {}, Date.now(), () => seed));
  });
  dispatcher.register("evolve", (c) => transact(c, (save) => evolve(save, c.target ?? "", c.args?.species, Date.now())));
  dispatcher.register("pet.look", (c) => transact(c, (save) => setLook(save, c.target ?? "", c.args ?? {})));

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
      points: save?.points ?? null,
      inventory: save?.inventory ?? {},
      unlocked: save?.unlocked ?? [],
      dex: unlockRules(),
      shop: { ...SHOP, species: save ? speciesForSale(save) : [] },
      evolutions: save ? Object.fromEntries(save.party.map((p) => [p.id, evolutionOptions(save, p.id, Date.now())])) : {},
      log: save?.log ?? [],
      party: save?.party ?? ctx.party.all(),
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
