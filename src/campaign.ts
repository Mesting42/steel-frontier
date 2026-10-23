import { MAPS, PERKS, ROUTES, type PerkId, type RouteId } from "./data";
import { RNG } from "./math";
import { maxHp, maxShield, type Run } from "./save";
/** 一条战役的地图与奖励由种子派生；路线选择改变敌军、收入与恢复状态。 */
export function newRun(seed = Date.now() >>> 0): Run {
  const rng = new RNG(seed),
    maps: number[] = [];
  for (let biome = 0; biome < 3; biome++)
    maps.push(
      ...rng
        .shuffle(
          MAPS.map((m, i) => (m.biome === biome ? i : -1)).filter(
            (i) => i >= 0,
          ),
        )
        .slice(0, 2),
    );
  maps[5] = 8;
  return {
    seed,
    maps,
    stage: 0,
    credits: 120,
    hp: 220,
    shield: 80,
    baseHp: 600,
    baseShield: 100,
    kills: 0,
    elapsed: 0,
    weapons: ["shell"],
    active: 0,
    skill: "emp",
    perks: [],
    route: "supply",
    support: 0,
  };
}
export function routeChoices(run: Run) {
  return new RNG(run.seed + run.stage * 1387 + 17).shuffle(ROUTES).slice(0, 2);
}
export function chooseRoute(run: Run, id: RouteId) {
  run.route = id;
  if (id === "repair") {
    run.hp = Math.min(maxHp(run), run.hp + 60);
    run.baseHp = Math.min(600, run.baseHp + 90);
  }
}
export function rewardChoices(run: Run, salt = 0) {
  const available = PERKS.filter((p) => !run.perks.includes(p.id));
  return new RNG(run.seed + run.stage * 701 + salt)
    .shuffle(available.length >= 3 ? available : PERKS)
    .slice(0, 3);
}
/** 单个界面事务的防重闩锁：在改变余额前登记，失败时不登记。 */
export class Transactions {
  private consumed = new Set<string>();
  apply(id: string, action: () => boolean) {
    if (this.consumed.has(id)) return false;
    if (!action()) return false;
    this.consumed.add(id);
    return true;
  }
}
export function addPerk(run: Run, id: PerkId) {
  run.perks.push(id);
  if (id === "plating") run.hp = Math.min(maxHp(run), run.hp + 50);
  if (id === "battery") run.shield = Math.min(maxShield(run), run.shield + 35);
}
