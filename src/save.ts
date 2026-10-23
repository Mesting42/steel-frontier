import type { PerkId, RouteId, ShopItem, SkillId, WeaponId } from "./data";
import { PERKS, SKILLS, WEAPONS } from "./data";
import { clamp } from "./math";
export interface Loadout {
  weapons: WeaponId[];
  active: number;
  skill: SkillId;
  perks: PerkId[];
}
export interface Run extends Loadout {
  seed: number;
  stage: number;
  credits: number;
  hp: number;
  shield: number;
  baseHp: number;
  baseShield: number;
  kills: number;
  elapsed: number;
  route: RouteId;
  maps: number[];
  support: number;
  routeStage?: number;
  eventStage?: number;
  checkpoint?: "route" | "reward" | "shop" | "battle";
  pendingRewards?: number;
  rewardSalt?: number;
  purchased?: string[];
  shopInventory?: ShopItem[];
  shopStage?: number;
  shopOffset?: number;
}
export interface Settings {
  music: number;
  effects: number;
  quality: "high" | "medium";
  shake: boolean;
  stickSize: number;
  stickOpacity: number;
  touch: boolean;
  tutorial: boolean;
}
export interface Records {
  endlessWave: number;
  endlessScore: number;
  victories: number;
  bestTime: number;
}
const PREFIX = "steel-frontier:v1:";
export const DEFAULT_SETTINGS: Settings = {
  music: 0.25,
  effects: 0.6,
  quality: "high",
  shake: true,
  stickSize: 112,
  stickOpacity: 0.65,
  touch: false,
  tutorial: true,
};
export const DEFAULT_RECORDS: Records = {
  endlessWave: 0,
  endlessScore: 0,
  victories: 0,
  bestTime: 0,
};
function read(key: string): unknown {
  try {
    const s = localStorage.getItem(PREFIX + key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
export function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
/** 只接受边界内的安全检查点，绝不反序列化子弹、计时器或任意帧对象。 */
export function loadRun(): Run | null {
  const v = read("campaign") as Run | null;
  if (
    !v ||
    !Number.isFinite(v.seed) ||
    !Number.isInteger(v.stage) ||
    v.stage < 0 ||
    v.stage > 5 ||
    !Array.isArray(v.maps) ||
    v.maps.length !== 6 ||
    !v.maps.every((m) => Number.isInteger(m) && m >= 0 && m < 9)
  )
    return null;
  if (
    !Array.isArray(v.weapons) ||
    v.weapons.length < 1 ||
    v.weapons.length > 2 ||
    !v.weapons.every((w) => w in WEAPONS) ||
    !(v.skill in SKILLS)
  )
    return null;
  if (
    !Array.isArray(v.perks) ||
    !v.perks.every((p) => PERKS.some((x) => x.id === p))
  )
    return null;
  if (
    v.purchased !== undefined &&
    (!Array.isArray(v.purchased) ||
      !v.purchased.every((id) => typeof id === "string"))
  )
    return null;
  if (
    ![v.hp, v.shield, v.baseHp, v.credits, v.elapsed, v.kills].every(
      Number.isFinite,
    )
  )
    return null;
  return {
    ...v,
    active: clamp(v.active || 0, 0, v.weapons.length - 1),
    hp: clamp(v.hp, 1, 500),
    shield: clamp(v.shield, 0, 300),
    baseHp: clamp(v.baseHp, 1, 750),
    baseShield: clamp(v.baseShield || 0, 0, 160),
    credits: clamp(v.credits, 0, 100000),
    support: clamp(v.support || 0, 0, 3),
  };
}
export function clearRun() {
  try {
    localStorage.removeItem(PREFIX + "campaign");
  } catch {
    /* 隐私模式不影响游玩。 */
  }
}
export function loadSettings(): Settings {
  const v = read("settings") as Partial<Settings> | null;
  return {
    ...DEFAULT_SETTINGS,
    ...(v && typeof v === "object" ? v : {}),
    music: clamp(Number(v?.music ?? 0.25) || 0, 0, 1),
    effects: clamp(Number(v?.effects ?? 0.6) || 0, 0, 1),
    stickSize: clamp(Number(v?.stickSize ?? 112) || 112, 80, 150),
    stickOpacity: clamp(Number(v?.stickOpacity ?? 0.65) || 0.65, 0.2, 1),
    quality: v?.quality === "medium" ? "medium" : "high",
  };
}
export function loadRecords(): Records {
  const v = read("records") as Records | null;
  return {
    endlessWave: Math.max(0, Number(v?.endlessWave) || 0),
    endlessScore: Math.max(0, Number(v?.endlessScore) || 0),
    victories: Math.max(0, Number(v?.victories) || 0),
    bestTime: Math.max(0, Number(v?.bestTime) || 0),
  };
}
export const maxHp = (l: Loadout) =>
  220 + l.perks.filter((p) => p === "plating").length * 50;
export const maxShield = (l: Loadout) =>
  80 + l.perks.filter((p) => p === "battery").length * 35;
