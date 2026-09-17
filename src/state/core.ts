// 순수 육성 코어 — 저장 객체만 변경. 파일·Electron·실제 시계 의존 없음
import { baseline, deltaSince, isUsage, tokensOf, type SeenUsage } from "../agents/usage";
import { axesAt } from "../dex/natures";
import { profile } from "../dex/species";
import { isAgentName, SAVE_RULES } from "../save/rules";
import { isYesterday, localDate } from "../shared/clock";
import type { CommandResult, Pet, SaveV2 } from "../shared/types";
import { STATE_RULES as R } from "./rules";
import type { CareAction, StateInput } from "./types";

interface Acc {
  date: string;
  points: number;
  pointTokens: number;
  seen: SeenUsage;
  interactedDate: string;
}
const clamp = (n: number): number => Math.max(0, Math.min(100, n));
const finite = (v: unknown): number => typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
const prepared = new WeakSet<object>();

function accumulator(save: SaveV2): Acc {
  const raw = save.acc.state as Partial<Acc> | undefined;
  if (raw && typeof raw === "object" && prepared.has(raw)) return raw as Acc;
  const seen = raw?.seen && typeof raw.seen === "object" ? Object.fromEntries(Object.entries(raw.seen).filter(([, value]) => isUsage(value))) : {};
  const a: Acc = {
    date: typeof raw?.date === "string" ? raw.date : save.daily.date,
    points: finite(raw?.points), pointTokens: finite(raw?.pointTokens), seen,
    interactedDate: typeof raw?.interactedDate === "string" ? raw.interactedDate : save.daily.interacted ? save.daily.date : "",
  };
  prepared.add(a);
  save.acc.state = a;
  return a;
}

function day(save: SaveV2, now: number): Acc {
  const a = accumulator(save);
  const date = localDate(now);
  if (save.daily.date !== date) {
    if (save.daily.interacted) a.interactedDate = save.daily.date;
    save.daily = { date, streak: isYesterday(a.interactedDate, now) ? save.daily.streak : 1, interacted: false };
  }
  if (a.date !== date) {
    a.date = date;
    a.points = 0;
    a.pointTokens = 0;
  }
  for (const p of save.party) if (p.daily.date !== date) p.daily = { date, gained: 0, feeds: 0, plays: 0, pokes: 0, presence: 0, work: 0, turns: 0 };
  for (const stats of Object.values(save.agents)) if (stats && stats.date !== date) {
    stats.date = date;
    stats.tokensToday = 0;
  }
  return a;
}

function gain(p: Pet, amount: number): number {
  const n = Math.min(Math.max(0, amount), Math.max(0, R.affinityCap - p.daily.gained));
  p.affinity += n;
  p.daily.gained += n;
  return n;
}

function mood(p: Pet, amount: number, now: number): void {
  const axes = axesAt(p.nature, p.id, now);
  p.mood = clamp(p.mood + amount * profile(p.species).moodSwing * (1 - axes.steadiness * 0.3));
}

export function careAvailable(p: Pet, action: CareAction, now: number): CommandResult {
  if (action === "feed" && p.hunger <= 0) return { ok: false, reason: "full" };
  const at = action === "feed" ? p.fedAt : action === "play" ? p.playedAt : null;
  const wait = action === "feed" ? R.feed.cooldownMs : R.play.cooldownMs;
  if (at != null && now - at < wait) return { ok: false, reason: "cooldown", seconds: Math.ceil((wait - (now - at)) / 1000) };
  if (action === "poke" && p.daily.date === localDate(now) && p.daily.pokes >= R.poke.dailyMax) return { ok: false, reason: "daily-cap" };
  return { ok: true, reason: "ok" };
}

export function care(save: SaveV2, id: string, action: CareAction, now: number): CommandResult {
  const p = save.party.find((pet) => pet.id === id);
  if (!p) return { ok: false, reason: "no-pet", id };
  const a = day(save, now);
  const available = careAvailable(p, action, now);
  if (!available.ok) return available;
  const axes = axesAt(p.nature, p.id, now);
  const foodScale = action === "feed" && (save.inventory.berry ?? 0) > 0 ? 2 : 1;
  let affinity: number;
  if (action === "feed") {
    if (foodScale === 2) save.inventory.berry!--;
    p.hunger = clamp(p.hunger - R.feed.hunger * foodScale);
    p.fedAt = now;
    p.daily.feeds++;
    save.totals.fed++;
    affinity = R.feed.affinity * foodScale * (axes.patience > 0 ? 0.8 : axes.patience < 0 ? 1.3 : 1);
  } else if (action === "play") {
    p.playedAt = now;
    p.daily.plays++;
    save.totals.played++;
    affinity = R.play.affinity * (axes.sociability > 0 ? 1.3 : axes.sociability < 0 ? 0.8 : 1);
  } else {
    p.daily.pokes++;
    affinity = R.poke.affinity;
  }
  mood(p, R[action].mood * foodScale, now);
  const gained = gain(p, affinity);
  if (!save.daily.interacted) {
    save.daily.streak = isYesterday(a.interactedDate, now) ? save.daily.streak + 1 : 1;
    save.daily.interacted = true;
    a.interactedDate = localDate(now);
    save.totals.days++;
    save.points += R.streakPoints * Math.min(R.streakMax, save.daily.streak);
  }
  save.log.push({ at: now, kind: action, id, gained });
  save.log = save.log.slice(-SAVE_RULES.log.keep);
  return { ok: true, reason: "ok", id, gained };
}

// 인스턴스의 첫 틱은 시간·토큰 기준점만 설정. 재시작·writer 인수 때 꺼 둔 시간을 보상하지 않음
export function createStateEngine() {
  let last: number | null = null;
  let priorAgent: StateInput["agent"] | null = null;
  let previousSave: SaveV2 | null = null;
  return {
    reset() { last = null; priorAgent = null; previousSave = null; },
    tick(save: SaveV2, input: StateInput): void {
      const a = day(save, input.now);
      if (last == null || previousSave !== save) {
        a.seen = { ...a.seen, ...baseline(input.usages) };
        last = input.now;
        priorAgent = input.agent;
        previousSave = save;
        return;
      }
      const elapsed = Math.max(0, Math.min(R.maxTickMs, input.now - last));
      // 자정을 넘은 짧은 틱은 오늘 구간만 적립. 어제 몫을 오늘 상한에 넣지 않음
      const midnight = new Date(input.now); midnight.setHours(0, 0, 0, 0);
      const dt = Math.min(elapsed, input.now - midnight.getTime());
      last = Math.max(last, input.now);
      const hours = dt / R.hourMs;
      const shown = new Set(input.shown);
      const change = deltaSince(input.usages, a.seen);
      a.seen = change.seen;
      const tokens = tokensOf(change.delta);
      save.totals.tokens += tokens;
      for (const session of input.usages) {
        const delta = change.perSession[session.sessionId];
        if (!delta || !isAgentName(session.cli)) continue;
        const stats = save.agents[session.cli] ?? { connected: true };
        stats.date = localDate(input.now);
        stats.tokensToday = finite(stats.tokensToday) + tokensOf(delta);
        stats.tokensTotal = finite(stats.tokensTotal) + tokensOf(delta);
        save.agents[session.cli] = stats;
      }
      if (shown.size) {
        save.totals.presenceMs += dt;
        if (input.agent === "running") save.totals.workMs += dt;
        a.pointTokens = finite(a.pointTokens) + tokens;
        const points = Math.min(Math.floor(a.pointTokens / R.tokensPerPoint), Math.max(0, R.pointsCap - finite(a.points)));
        save.points += points;
        a.points = finite(a.points) + points;
        a.pointTokens %= R.tokensPerPoint;
      }
      const turn = input.agent === "waving" && priorAgent !== "waving";
      const failed = input.agent === "failed" && priorAgent !== "failed";
      if (turn && shown.size) save.totals.turns++;
      for (const p of save.party) {
        const axes = axesAt(p.nature, p.id, input.now);
        const species = profile(p.species);
        p.hunger = clamp(p.hunger + hours * R.hungerPerHour * species.hungerRate * (1 + axes.activity * 0.2) * (axes.patience > 0 ? 0.8 : axes.patience < 0 ? 1.3 : 1));
        if (p.hunger >= R.hungryAt) mood(p, -hours * R.hungerMoodPerHour, input.now);
        const lastCare = Math.max(p.since, p.fedAt ?? 0, p.playedAt ?? 0);
        if (input.now - lastCare > R.neglectAfterMs * (1 + axes.patience * 0.3)) mood(p, -hours * R.neglectMoodPerHour, input.now);
        if (!shown.has(p.id)) continue;
        if (axes.sociability > 0) mood(p, hours * R.companyMoodPerHour * (shown.size > 1 ? 1 : -1), input.now);
        const multiplier = species.affinityRate * (1 + axes.activity * 0.2);
        p.daily.presence += gain(p, hours * R.presencePerHour * multiplier);
        const work = tokens / R.tokensPerAffinity + (input.agent === "running" && !input.tokenWork ? hours * R.workPerHour : 0);
        p.daily.work += gain(p, work * species.affinityRate);
        if (turn) {
          p.daily.turns++;
          gain(p, R.turn.affinity * species.affinityRate);
          mood(p, R.turn.mood, input.now);
        }
        if (failed) mood(p, -(5 - axes.boldness * 3), input.now);
      }
      priorAgent = input.agent;
    },
  };
}
