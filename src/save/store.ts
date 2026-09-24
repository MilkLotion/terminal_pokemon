// 저장 v3 파일 통로 — 계약은 docs/specs/modules.md "저장 구조". 모양은 src/shared/save-v3.ts
//
// 읽을 때 파일의 v 를 보고 갈린다
//   v3        정규화해서 그대로 쓴다
//   v1 · v2   원본을 백업하고 v3 으로 옮긴 뒤 검사한다. 통과하면 파일을 교체하고, 어긋나면 원본을 그대로 둔다
//             repair 가 아니면(읽기 전용) 파일을 건드리지 않고 옮긴 값만 돌려준다. 파일 교체는 writer 의 일이다
//   그 밖     파손으로 보고 .bak 으로 옮긴다 (repair 일 때만)
// 백업에 실패하면 옮기지 않는다. 사용자의 진행을 잃는 것보다 v3 을 늦게 쓰는 편이 낫다.
// 쓰기는 store.ts 의 writeAtomic 을 그대로 쓴다 — tmp 에 쓰고 rename 이라 반쪽 파일이 남지 않는다.
import fs from "node:fs";
import type { SaveV3 } from "../shared/save-v3";
import { migrate } from "./migrate-v3.js";
import { normalize as normalizeV2, quarantine, writeAtomic } from "./legacy.js";
import { normalize as normalizeV3 } from "./v3.js";

export interface ReadV3Options {
  repair?: boolean; // 파손 격리와 v2 이전 파일 교체를 한다 — 쓰는 쪽만. 읽기 전용은 false
}

export interface ReadV3Result {
  state: SaveV3 | null;
  corrupted: boolean;
  migrated: boolean; // v2 를 v3 으로 옮겼다
  failedChecks?: string[]; // 이전 검사가 어긋났다. 원본을 그대로 두었다
  reason?: "unreadable" | "backup-failed" | "migrate-failed" | "write-failed";
}

// v2 원본을 남겨 두는 자리. 두 번 옮기는 일은 없으므로 덮어쓰지 않는다
export const backupName = (file: string): string => `${file}.v2.bak`;

const errCode = (e: unknown): string | undefined =>
  e != null && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string"
    ? (e as { code: string }).code
    : undefined;

// 원본을 백업한다. 이미 백업이 있으면 건드리지 않는다 — 첫 원본이 가장 값지다
function backup(file: string): boolean {
  const bak = backupName(file);
  try {
    if (fs.existsSync(bak)) return true;
    fs.copyFileSync(file, bak);
    return true;
  } catch {
    return false;
  }
}

export function read(file: string, { repair = true }: ReadV3Options = {}): ReadV3Result {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    if (errCode(e) === "ENOENT") return { state: null, corrupted: false, migrated: false };
    return { state: null, corrupted: false, migrated: false, reason: "unreadable" };
  }

  let raw: unknown = null;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    raw = null;
  }

  const now = Date.now();
  const v3 = normalizeV3(raw, now);
  if (v3) return { state: v3, corrupted: false, migrated: false };

  // v1 · v2 는 옮긴다. store.normalize 가 v1 이전까지 맡는다
  const v2 = normalizeV2(raw);
  if (v2) {
    if (!repair) {
      const { save } = migrate(v2, now);
      return save ? { state: save, corrupted: false, migrated: false } : { state: null, corrupted: false, migrated: false, reason: "migrate-failed" };
    }
    if (!backup(file)) return { state: null, corrupted: false, migrated: false, reason: "backup-failed" };
    const { save, failed } = migrate(v2, now);
    if (!save) return { state: null, corrupted: false, migrated: false, failedChecks: failed, reason: "migrate-failed" };
    if (!writeAtomic(file, save)) return { state: save, corrupted: false, migrated: true, reason: "write-failed" };
    return { state: save, corrupted: false, migrated: true };
  }

  if (repair) quarantine(file);
  return { state: null, corrupted: true, migrated: false };
}

export function write(file: string, state: SaveV3): boolean {
  return writeAtomic(file, state);
}
