import test from "node:test";
import assert from "node:assert/strict";
import { segmentCircle, segmentRect, RNG, dist } from "../src/math";
import { BASE_POS, SPAWNS, World } from "../src/world";
import { Battle, type BattleInput } from "../src/battle";
import { newRun, Transactions } from "../src/campaign";
import { WEAPONS, type WeaponId } from "../src/data";
import { loadRun, loadSettings, write } from "../src/save";

const idle = (): BattleInput => ({
  move: { x: 0, z: 0 },
  aim: { x: 0, z: -30 },
  firing: false,
  dash: false,
  skill: false,
  swap: false,
});
function emptyBattle() {
  const b = new Battle("training", newRun(123), 0);
  b.world.objects.length = 0;
  b.enemies.length = 0;
  return b;
}
test("扫掠碰撞找到最近墙体，高速线段不隧穿", () => {
  assert.equal(
    segmentRect({ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 10, z: 0, w: 2, d: 2 }),
    0.09,
  );
  assert.equal(
    segmentCircle({ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 10, z: 0 }, 1),
    0.09,
  );
  assert.equal(
    segmentRect({ x: 0, z: 4 }, { x: 100, z: 4 }, { x: 10, z: 0, w: 2, d: 2 }),
    null,
  );
});
test("九张地图的多种种子：出生区、基地、维修点可达", () => {
  for (let map = 0; map < 9; map++)
    for (let seed = 1; seed <= 30; seed++) {
      const world = new World(seed * 97, map);
      for (const spawn of SPAWNS)
        assert.ok(
          world.path(spawn, BASE_POS, 1.23).length,
          `地图${map}种子${seed}出生点${spawn.x},${spawn.z}不可达`,
        );
      assert.ok(
        world.path({ x: 0, z: 17 }, { x: -5.5, z: 23 }, 1.45).length,
        `地图${map}维修点不可达`,
      );
    }
});
test("同种子生成相同地图与战役组合", () => {
  assert.deepEqual(newRun(77), newRun(77));
  assert.deepEqual(new World(33, 2).objects, new World(33, 2).objects);
  const r = new RNG(7);
  assert.ok(r.next() >= 0 && r.next() < 1);
});
test("护盾先吸收，剩余伤害才扣耐久", () => {
  const b = emptyBattle();
  b.player.shield = 30;
  b.damage(b.player, 50, { x: 0, z: 0 });
  assert.equal(b.player.shield, 0);
  assert.equal(b.player.hp, 200);
});
test("炮口贴钢墙不在墙后生成炮弹", () => {
  const b = emptyBattle();
  b.player.x = 0;
  b.player.z = 0;
  b.player.turret = 0;
  b.world.objects.push({
    id: 900,
    kind: "steel",
    x: 0,
    z: 1.8,
    w: 3,
    d: 0.5,
    hp: Infinity,
    maxHp: Infinity,
    solid: true,
    blocksShot: true,
    alive: true,
    rotation: 0,
  });
  b.shoot(b.player, "rail", "player", { x: 0, z: 10 });
  assert.equal(b.bullets.length, 0);
});
test("高速弹先击中墙，不伤害墙后敌人", () => {
  const b = emptyBattle();
  b.player.x = 0;
  b.player.z = 0;
  b.player.turret = 0;
  const e = b.spawn("heavy", { x: 0, z: 8 });
  b.world.objects.push({
    id: 901,
    kind: "steel",
    x: 0,
    z: 5,
    w: 4,
    d: 0.1,
    hp: Infinity,
    maxHp: Infinity,
    solid: true,
    blocksShot: true,
    alive: true,
    rotation: 0,
  });
  b.shoot(b.player, "rail", "player", e);
  for (let i = 0; i < 12; i++) b.update(1 / 60, idle());
  assert.equal(e.hp, e.maxHp);
  assert.equal(b.bullets.length, 0);
});
test("单发直击不叠加自身范围伤害", () => {
  const b = emptyBattle();
  b.player.x = 0;
  b.player.z = 0;
  b.player.turret = 0;
  const e = b.spawn("tank", { x: 0, z: 8 });
  b.shoot(b.player, "shell", "player", e);
  for (let i = 0; i < 15; i++) b.update(1 / 60, idle());
  assert.equal(e.hp, e.maxHp - 40);
});
test("墙体摧毁同步开放碰撞与导航", () => {
  const b = emptyBattle();
  b.world.objects.push({
    id: 902,
    kind: "brick",
    x: 0,
    z: 0,
    w: 3,
    d: 3,
    hp: 20,
    maxHp: 20,
    solid: true,
    blocksShot: true,
    alive: true,
    rotation: 0,
  });
  assert.equal(b.world.blocked({ x: 0, z: 0 }, 1), true);
  const version = b.world.revision;
  b.hitObject(b.world.objects[0], 40, "player");
  assert.equal(b.world.blocked({ x: 0, z: 0 }, 1), false);
  assert.equal(b.world.revision, version + 1);
});
test("冲刺与高速移动不能穿过薄墙", () => {
  const w = new World(4, 0);
  w.objects.length = 0;
  w.add("steel", 8, 0, 0.2, 20);
  const p = { x: 4, z: 0 };
  w.move(p, 20, 0, 1);
  assert.ok(p.x < 7);
});
test("无限弹药六种武器均能持续输出，无隐式弹匣", () => {
  for (const id of Object.keys(WEAPONS) as WeaponId[]) {
    const b = emptyBattle();
    b.run.weapons = [id];
    b.player.turret = Math.PI;
    const input = { ...idle(), firing: true };
    let shots = 0;
    for (let i = 0; i < 1200; i++) {
      b.update(1 / 60, input);
      shots += b.events.filter(
        (e) => e.type === "sound" && e.name === id,
      ).length;
      b.events.length = 0;
    }
    assert.ok(
      shots >= Math.floor(19 / WEAPONS[id].interval),
      `${id}意外停火:${shots}`,
    );
    assert.ok(b.bullets.length < 80);
    assert.ok(b.effects.length <= 180);
  }
});
test("玩家普通攻击与环境连锁不伤基地", () => {
  const b = emptyBattle();
  const hp = b.base.hp,
    shield = b.base.shield;
  b.explode(b.base, 8, 500, "player");
  b.explode(b.base, 8, 500, "environment");
  assert.equal(b.base.hp, hp);
  assert.equal(b.base.shield, shield);
});
test("奖励与购买事务只执行一次，失败可重试", () => {
  const tx = new Transactions();
  let coins = 100;
  const buy = () => {
    coins -= 30;
    return true;
  };
  assert.equal(tx.apply("a", buy), true);
  assert.equal(tx.apply("a", buy), false);
  assert.equal(coins, 70);
  assert.equal(
    tx.apply("b", () => false),
    false,
  );
  assert.equal(tx.apply("b", buy), true);
});
test("玩家失败只结算一次，之后不再生成与伤害", () => {
  const b = emptyBattle();
  b.damage(b.player, 999, { x: 1, z: 1 });
  for (let i = 0; i < 20; i++) b.update(1 / 60, idle());
  assert.equal(b.outcome, "player");
  assert.equal(b.events.filter((e) => e.type === "result").length, 1);
});
test("损坏存档、缺失字段和越界数据安全回退", () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    },
  });
  storage.set("steel-frontier:v1:campaign", "{oops");
  assert.equal(loadRun(), null);
  write("campaign", { seed: 2, stage: 0 });
  assert.equal(loadRun(), null);
  write("campaign", newRun(42));
  assert.equal(loadRun()?.seed, 42);
  write("settings", { music: 8, effects: -2, stickSize: 1000 });
  assert.equal(loadSettings().music, 1);
  assert.equal(loadSettings().effects, 0);
  assert.equal(loadSettings().stickSize, 150);
});
test("敌方炮弹直接命中基地只结算一次", () => {
  const b = emptyBattle();
  b.player.x = 20;
  b.base.shield = 100;
  b.base.hit = 100;
  const e = b.spawn("tank", { x: 0, z: 12 });
  e.turret = 0;
  b.shoot(e, "shell", "enemy", b.base);
  for (let i = 0; i < 30; i++) b.update(1 / 60, idle());
  assert.equal(b.base.shield, 100 - 15 * 0.55);
});
test("电弧在邻近敌军间跳跃，但不会跨钢墙", () => {
  const b = emptyBattle();
  b.player.x = 0;
  b.player.z = 0;
  b.player.turret = 0;
  const a = b.spawn("tank", { x: 0, z: 8 }),
    c = b.spawn("tank", { x: 0, z: 13 }),
    hidden = b.spawn("tank", { x: 5, z: 13 });
  b.world.objects.push({
    id: 903,
    kind: "steel",
    x: 2.5,
    z: 13,
    w: 1,
    d: 6,
    hp: Infinity,
    maxHp: Infinity,
    alive: true,
    solid: true,
    blocksShot: true,
    rotation: 0,
  });
  b.shoot(b.player, "arc", "player", a);
  assert.ok(a.hp < a.maxHp);
  assert.ok(c.hp < c.maxHp);
  assert.equal(hidden.hp, hidden.maxHp);
});
test("Boss 阶段转换有预警且不直接伤害玩家与基地", () => {
  const b = new Battle("campaign", newRun(21), 8);
  b.world.objects.length = 0;
  const boss = b.spawn("boss", { x: 0, z: -20 });
  boss.hp = boss.maxHp * 0.49;
  b.update(1 / 60, idle());
  assert.equal(boss.phase, 2);
  assert.equal(b.player.hp, 220);
  assert.equal(b.player.shield, 80);
  assert.equal(b.base.hp, 600);
});
test("胜利结束生成、弹道和后续敌军伤害", () => {
  const b = emptyBattle();
  const boss = b.spawn("boss", { x: 0, z: -15 });
  b.damage(boss, 999999, b.player);
  assert.equal(b.outcome, "victory");
  const hp = b.player.hp;
  b.damage(b.player, 999, boss);
  assert.equal(b.player.hp, hp);
  assert.equal(b.bullets.length, 0);
  assert.equal(b.warnings.length, 0);
});
test("所有出生警报提供至少三秒反应时间且远离玩家", () => {
  const b = new Battle("campaign", newRun(999), 0);
  for (let i = 0; i < 450; i++) b.update(1 / 60, idle());
  assert.ok(
    b.warnings
      .filter((w) => w.kind === "spawn")
      .every((w) => w.maxLife >= 3 && dist(w, b.player) >= 4),
  );
});

test("紧急护盾援助遵守上限，后续帧不无故丢失护盾", () => {
  const b = emptyBattle();
  b.run.perks.push("emergency");
  b.base.hp = 190;
  b.base.shield = 0;
  b.update(1 / 60, idle());
  assert.equal(b.base.shield, 100);
  b.update(1 / 60, idle());
  assert.equal(b.base.shield, 100);
  assert.equal(b.emergencyUsed, true);
});
