// 마리 목록의 출처 — 저장 v2(window·companion) 또는 세션 샌드박스(session). 무대는 PartySource 하나만 본다.
//
// saveParty   src/save/store 로 save.json 을 읽고, writer(save.lock 을 잡은 프로세스)면 쓴다. 못 잡으면 reader 로 시작해
//             파일 감시로 다시 읽고 10초마다 다시 잡아 본다 — 앞의 writer 가 끝나면 자연히 이어받는다.
//             창 펫(window)은 독립 펫(companion)이 살아 있으면 writer 를 내준다 (옛 main.js gameTick 의 우선순위).
//             첫 실행(writer 인데 파티가 없음)은 부르는 쪽(app)이 스타터를 정해 begin(species) 로 시작한다.
//             reader 인데 파티가 아직 없으면 그쪽(writer)이 첫 실행을 맡는다 — 파일이 생기면 감시가 읽는다
// sandboxParty  POKEBUDDY_SLUG 한 마리, id "session". 집은 config.json windows[windowKey] — 1판과 같은 키라 저장된 자리가 그대로.
//             dispatcher·mailbox·트레이 없음, 게임 없음 (1판 결정)
//
// 저장 1판(v1) 보호 — 처음으로 v1 save.json 을 v2 로 다시 쓰기 전에 save.v1.json 사본을 옆에 남긴다 (한 번만, 이미 있으면 덮지 않음).
//   사용자의 실제 저장이 되돌릴 수 없게 바뀌기 때문 (옛 main.js 는 v2 를 파손으로 보고 .bak 으로 옮긴다)
// 집 1회 이전 — v1→v2 이전 마리의 home 이 기본값이고 config.json windows["companion:<종>"] 또는 ["w:<종>"] 이 있으면 그 값을 복사한다
//   (사용자가 놓아 둔 자리 보존). 기본값이 아닌 집은 건드리지 않는다
// 마리 수 상한은 SAVE_RULES.slots.max 한 곳에서만 읽는다 — 무대 코드 어디에도 숫자를 쓰지 않는다
import fs from "node:fs";
import path from "node:path";
import { randomNature } from "../dex/natures";
import { profile } from "../dex/species";
import * as mailbox from "../save/mailbox";
import { SAVE_RULES } from "../save/rules";
import * as store from "../save/store";
import * as writer from "../save/writer";
import type { CommandResult, Mode, NatureId, Pet, SaveV2 } from "../shared/types";
import { isDefaultHome, type Home } from "./layout";
import type { Paths, UserConfig } from "./paths";

export const PARTY_RULES = {
  reclaimMs: 10_000, // reader 가 writer 자리를 다시 잡아 보는 간격 — 창 펫이 독립 펫에 자리를 내주는 확인도 같은 주기
  v1Backup: ".v1.json", // save.json → save.v1.json
};

// 무대가 보는 마리 하나 — 저장 v2 의 Pet 에서 무대에 필요한 것만. 세션 샌드박스 펫도 같은 모양
export interface PartyPet {
  id: string;
  species: string;
  look: string; // Pet.look ?? Pet.species
  size: number; // 도트 배율 (zoomOf 로 가둔다)
  nature: NatureId | null; // 샌드박스 펫은 null — 메뉴에 성격을 보이지 않는다
  nick: string | null;
  home: Home;
  shown: boolean;
}

export interface PartySource {
  kind: "save" | "sandbox";
  pets(): PartyPet[]; // 무대에 나올 마리 — shown 이고 슬롯 상한 안
  all(): PartyPet[];
  isWriter(): boolean;
  needsStarter(): boolean; // writer 인데 파티가 없다 — 첫 실행
  begin(species: string): boolean; // 첫 실행 — 스타터 한 마리로 시작 (writer 만)
  setHome(id: string, home: Home): void; // 놓은 자리 — writer 는 파일, reader 는 mailbox, 샌드박스는 config.json
  setShown(id: string, shown: boolean): Promise<CommandResult>;
  save(): SaveV2 | null; // snapshot 용 (샌드박스는 null)
  persist(): boolean; // 상태 모듈이 바꾼 저장 — 실제 lock 소유권 확인 뒤 쓰기
  onChange(cb: () => void): () => void; // 목록·집이 바뀌었다 (파일 감시 · 역할 전환 · begin)
  onRole(cb: (isWriter: boolean) => void): () => void;
  stop(): void;
}

export const toPartyPet = (p: Pet): PartyPet => ({
  id: p.id,
  species: p.species,
  look: p.look ?? p.species,
  size: p.size,
  nature: p.nature,
  nick: p.nick,
  home: { ...p.home },
  shown: p.shown,
});

// 무대에 나올 마리 — shown 인 것을 파티 순서대로, 슬롯 수와 규칙표 상한 중 작은 만큼
export const shownOf = (save: SaveV2): Pet[] => save.party.filter((p) => p.shown).slice(0, Math.min(save.slots, SAVE_RULES.slots.max));

// 여러 VS Code 창(미확정)의 임시 규칙 — 각 무대에 파티 전원. 확정되면 여기 한 곳만 바꾼다 (s2-plan 2.2 k)
export const shownFor = (save: SaveV2, _stageKey: string): Pet[] => shownOf(save);

// config.json 의 1판 집 → Pet.home 1회 이전. 바꾼 마리 수를 돌려준다
export function migrateHomes(save: SaveV2, windows: Record<string, Home>, mode: Mode): number {
  const keys = (species: string): string[] =>
    mode === "window" ? [`w:${species}`, `companion:${species}`] : [`companion:${species}`, `w:${species}`];
  let changed = 0;
  for (const pet of save.party) {
    if (!isDefaultHome(pet.home)) continue;
    const key = keys(pet.species).find((k) => windows[k] != null);
    const home = key ? windows[key] : undefined;
    if (!home || isDefaultHome(home)) continue;
    pet.home = { ...home };
    changed += 1;
  }
  return changed;
}

// 비어 있는 가장 작은 p<n>
export function nextPetId(party: Pet[]): string {
  const used = new Set(party.map((p) => p.id));
  for (let n = 1; ; n++) if (!used.has(`p${n}`)) return `p${n}`;
}

// 첫 실행 — 스타터 한 마리를 파티에 넣고 그 종을 해금 목록에 더한다. 성격은 무작위 (옛 game/index.js start 의 자리)
export function starterInto(save: SaveV2, species: string, now: number, rng: () => number = Math.random): Pet {
  const pet = store.emptyPet({ id: nextPetId(save.party), species, now, nature: randomNature(rng).id });
  pet.mood = profile(species).moodBase;
  save.party.push(pet);
  if (!save.unlocked.includes(species)) save.unlocked.push(species);
  return pet;
}

// v1 파일이면 사본을 남긴다 — 이미 있으면 덮지 않는다. v1 이었으면 true
export function backupV1(file: string): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch {
    return false;
  }
  if (!raw || typeof raw !== "object" || (raw as { v?: unknown }).v !== 1) return false;
  const bak = file.replace(/\.json$/, "") + PARTY_RULES.v1Backup;
  try {
    if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
  } catch {
    // 사본 실패 — 이전은 그대로 간다 (읽기 전용 폴더 등)
  }
  return true;
}

export interface SavePartyOptions {
  paths: Pick<Paths, "save" | "saveLock" | "mailbox" | "companionLock">;
  mode: Mode;
  savedWindows: () => Record<string, Home>; // config.json windows — 집 1회 이전
  now?: () => number;
  rng?: () => number;
  pid?: number;
  log?: ((o: Record<string, unknown>) => void) | null;
}

export function createSaveParty(opts: SavePartyOptions): PartySource {
  const { paths, mode, savedWindows } = opts;
  const now = opts.now ?? Date.now;
  const rng = opts.rng ?? Math.random;
  const pid = opts.pid ?? process.pid;
  const log = opts.log ?? null;
  let state: SaveV2 | null = null;
  let amWriter = false;
  let closed = false;
  let cacheKey: string | null = null; // reader — mtime·크기가 같으면 다시 파싱하지 않는다
  let readerWatch: fs.FSWatcher | null = null;
  let timer: NodeJS.Timeout | null = null;
  const changeCbs = new Set<() => void>();
  const roleCbs = new Set<(w: boolean) => void>();

  const emitChange = (): void => {
    for (const cb of changeCbs) cb();
  };
  const emitRole = (): void => {
    for (const cb of roleCbs) cb(amWriter);
  };

  // 독립 펫이 살아 있나 — 창 펫이 저장 잠금을 내줄지 정할 때. 자기 자신은 빼고 본다
  function companionAlive(): boolean {
    try {
      const other = Number(fs.readFileSync(paths.companionLock, "utf8").split("\n")[0]);
      return other > 0 && other !== pid && writer.pidAlive(other);
    } catch {
      return false;
    }
  }

  function persist(): boolean {
    if (!amWriter || !state) return false;
    if (!writer.isMine(paths.saveLock, pid)) {
      resign();
      return false;
    }
    const ok = store.write(paths.save, state);
    if (!ok) log?.({ party: "save-write-failed" });
    return ok;
  }

  // writer — 파일을 진실로 읽는다. v1 이면 사본을 남기고 v2 로 다시 쓴다. 집 1회 이전도 여기서
  function loadAsWriter(): void {
    const wasV1 = backupV1(paths.save);
    const r = store.read(paths.save, { repair: true });
    state = r.state;
    if (r.corrupted) {
      process.stderr.write("저장 파일이 깨져 save.json.bak 으로 옮기고 새로 시작한다\n");
      log?.({ party: "save-corrupted", movedTo: `${paths.save}.bak` });
    }
    if (!state) return;
    const migrated = migrateHomes(state, savedWindows(), mode);
    if (wasV1 || migrated) {
      log?.({ party: "rewrite", wasV1, migratedHomes: migrated });
      persist();
    }
  }

  // reader — 폴더를 본다 (파일을 직접 보면 rename 뒤 끊긴다). 이름이 맞는 이벤트만
  function readAsReader(): void {
    let key: string | null = null;
    try {
      const st = fs.statSync(paths.save);
      key = `${st.mtimeMs}:${st.size}`;
    } catch {
      key = null;
    }
    if (key === cacheKey) return;
    if (key == null) {
      cacheKey = null;
      if (state) {
        state = null;
        emitChange();
      }
      return;
    }
    const r = store.read(paths.save, { repair: false }); // 읽기 전용은 파손 파일을 옮기지 않는다 — writer 의 일
    if (r.reason === "unreadable") return; // 잠김 — 지난 값을 그대로
    cacheKey = key;
    state = r.state;
    emitChange();
  }

  function startReader(): void {
    if (readerWatch) return;
    const dir = path.dirname(paths.save);
    const base = path.basename(paths.save);
    let pending = false;
    try {
      fs.mkdirSync(dir, { recursive: true });
      readerWatch = fs.watch(dir, (_event, filename) => {
        if (pending || closed) return;
        if (filename && filename !== base) return;
        pending = true;
        setImmediate(() => {
          pending = false;
          if (!closed && !amWriter) readAsReader();
        });
      });
      readerWatch.on("error", () => {
        // 폴더가 사라졐다 — 10초 재확인이 받쳐 준다
      });
    } catch {
      readerWatch = null;
    }
    readAsReader();
  }

  function stopReader(): void {
    try {
      readerWatch?.close();
    } catch {
      // 이미 닫혔다
    }
    readerWatch = null;
  }

  // writer 가 되어 본다 — 성공하면 파일을 진실로 다시 읽고 역할을 알린다 (app 이 mailbox 를 잇는다)
  function claim(): boolean {
    if (closed) return false;
    if (amWriter && writer.isMine(paths.saveLock, pid)) return true;
    const r = writer.claim(paths.saveLock, pid);
    if (!r.ok) {
      if (amWriter) resign(); // 들고 있던 줄 알았는데 남이 가졌다
      return false;
    }
    if (amWriter) return true; // lock 파일만 사라졌던 것 — 다시 적었고 메모리 상태가 여전히 진실
    amWriter = true;
    stopReader();
    loadAsWriter();
    log?.({ party: "writer", pets: state?.party.length ?? 0 });
    emitRole();
    emitChange();
    return true;
  }

  // writer 를 그만둔다 — lock 을 놓고 읽기 전용으로. 다른 펫(독립 펫)에 자리를 내줄 때
  function resign(): void {
    if (amWriter && state && writer.isMine(paths.saveLock, pid)) store.write(paths.save, state);
    if (amWriter) writer.release(paths.saveLock, pid);
    amWriter = false;
    cacheKey = null;
    log?.({ party: "reader" });
    emitRole();
    if (!closed) startReader();
  }

  function tick(): void {
    if (closed) return;
    if (mode === "window" && amWriter && companionAlive()) {
      resign(); // 독립 펫이 우선
      return;
    }
    if (!amWriter) claim();
  }

  const findPet = (id: string): Pet | null => state?.party.find((p) => p.id === id) ?? null;

  // reader 의 요청 — writer 가 처리해 파일에 쓰면 감시가 읽어 온다. writer 가 없으면 timeout 이고 메모리 값만 남는다
  const ask = (cmd: "pet.set" | "party.show" | "party.hide", target: string, args?: Record<string, unknown>): Promise<CommandResult> =>
    mailbox.send(paths.mailbox, { cmd, target, ...(args ? { args } : {}), from: "pet" });

  // 처음 한 번 — 잡아 보고, 못 잡으면 reader 로
  if (!claim()) startReader();
  timer = setInterval(tick, PARTY_RULES.reclaimMs);

  return {
    kind: "save",
    pets: () => (state ? shownFor(state, mode).map(toPartyPet) : []),
    all: () => (state ? state.party.map(toPartyPet) : []),
    isWriter: () => amWriter && writer.isMine(paths.saveLock, pid),
    needsStarter: () => amWriter && (!state || state.party.length === 0),
    begin(species) {
      if (!amWriter) return false;
      const at = now();
      if (!state) state = store.empty(at);
      if (state.party.length) return false;
      backupV1(paths.save); // 파일은 없거나 빈 파티 — v1 이었다면 여기서도 사본
      starterInto(state, species, at, rng);
      const ok = persist();
      emitChange();
      return ok;
    },
    setHome(id, home) {
      const pet = findPet(id);
      if (!pet) return;
      pet.home = { ...home };
      if (amWriter) persist();
      else void ask("pet.set", id, { home }).then((r) => log?.({ party: "pet.set", id, ...r }));
    },
    async setShown(id, shown) {
      const pet = findPet(id);
      if (!pet) return { ok: false, reason: "no-pet", id };
      if (!amWriter) return ask(shown ? "party.show" : "party.hide", id);
      pet.shown = shown;
      persist();
      emitChange();
      return { ok: true, reason: "ok", id, shown };
    },
    save: () => state,
    persist,
    onChange(cb) {
      changeCbs.add(cb);
      return () => changeCbs.delete(cb);
    },
    onRole(cb) {
      roleCbs.add(cb);
      return () => roleCbs.delete(cb);
    },
    stop() {
      if (amWriter) persist();
      closed = true;
      if (timer) clearInterval(timer);
      timer = null;
      stopReader();
      if (amWriter) writer.release(paths.saveLock, pid);
      amWriter = false;
    },
  };
}

export interface SandboxPartyOptions {
  config: UserConfig;
  saveConfig: (config: UserConfig, patch: { window: Home }) => void;
}

// 세션 펫 — 저장을 모르는 한 마리. 집은 config.json 의 windowKey 자리
export function createSandboxParty({ config, saveConfig }: SandboxPartyOptions): PartySource {
  const pet: PartyPet = {
    id: "session",
    species: config.slug,
    look: config.slug,
    size: config.dotSize,
    nature: null,
    nick: null,
    home: { ...config.window },
    shown: true,
  };
  const changeCbs = new Set<() => void>();
  return {
    kind: "sandbox",
    pets: () => [{ ...pet, home: { ...pet.home } }],
    all: () => [{ ...pet, home: { ...pet.home } }],
    isWriter: () => false,
    needsStarter: () => false,
    begin: () => false,
    setHome(id, home) {
      if (id !== pet.id) return;
      pet.home = { ...home };
      saveConfig(config, { window: { ...home } });
    },
    setShown: async (id) => ({ ok: false, reason: "not-writer", id }),
    save: () => null,
    persist: () => false,
    onChange(cb) {
      changeCbs.add(cb);
      return () => changeCbs.delete(cb);
    },
    onRole: () => () => {},
    stop() {},
  };
}
