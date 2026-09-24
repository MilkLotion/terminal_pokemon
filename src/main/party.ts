// 마리 목록의 출처 — 무대는 이 모양 하나만 본다. 저장이 있는 펫은 저장 v3 의 `createSaveParty`(src/main/save-party.ts),
// 세션 펫은 여기의 샌드박스다.
//
// sandboxParty  POKEBUDDY_SLUG 한 마리, id "session". 집은 config.json windows[windowKey] — 1판과 같은 키라 저장된 자리가 그대로.
//             dispatcher·mailbox·트레이 없음, 게임 없음 (1판 결정)
import type { CommandResult, NatureId } from "../shared/types";
import type { Home } from "./layout";
import type { UserConfig } from "./paths";

// 무대가 보는 마리 하나 — 무대에 필요한 것만. 저장 v3 개체와 세션 펫이 같은 모양으로 온다
export interface PartyPet {
  id: string;
  species: string;
  look: string; // 그릴 그림 — 종(이로치면 ":shiny" 를 붙인다)
  size: number; // 도트 배율 (zoomOf 로 가둔다)
  nature: NatureId | null; // 샌드박스 펫은 null — 메뉴에 성격을 보이지 않는다
  nick: string | null;
  home: Home;
  shown: boolean;
}

// 세션 펫의 마리 목록 — 저장이 없다
export interface PartySource {
  kind: "sandbox";
  pets(): PartyPet[];
  all(): PartyPet[];
  isWriter(): boolean;
  needsStarter(): boolean;
  begin(species: string): boolean;
  setHome(id: string, home: Home): void; // 놓은 자리 — config.json 에 남긴다
  setShown(id: string, shown: boolean): Promise<CommandResult>;
  save(): null;
  onChange(cb: () => void): () => void;
  onRole(cb: (isWriter: boolean) => void): () => void;
  stop(): void;
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
    onChange(cb) {
      changeCbs.add(cb);
      return () => changeCbs.delete(cb);
    },
    onRole: () => () => {},
    stop() {},
  };
}
