/** 护盾、耐久、地形破坏、范围伤害和击毁。使用显式 this 上下文共享战斗状态，不依赖渲染或 DOM。 */
import {
  ENEMIES,
  SKILLS,
  WEAPONS,
  type EnemyId,
  type PerkId,
  type WeaponId,
} from "../data";
import {
  angle,
  clamp,
  dist,
  norm,
  RNG,
  segmentCircle,
  turn,
  type V2,
} from "../math";
import { BASE_POS, HALF, SPAWNS, World, type Obstacle } from "../world";
import { maxHp, maxShield, type Run } from "../save";
import type {
  Actor,
  Battle,
  BattleInput,
  Bullet,
  Effect,
  Warning,
  Outcome,
} from "../battle";

/** 直击与爆炸分开；直击对象排除在本次爆炸之外，确保同次命中只结算一次。 */
export function explode(
  this: Battle,
  at: V2,
  radius: number,
  damage: number,
  team: "player" | "enemy" | "environment",
  exclude?: number,
  ignoreObject?: number,
  depth = 0,
) {
  this.effect(
    "blast",
    at,
    radius,
    team === "player" ? 0xffcb7e : 0xff9b6a,
    0.65,
  );
  this.sound("explosion", Math.min(1, radius / 4));
  const targets =
    team === "enemy"
      ? [this.player]
      : team === "environment"
        ? [this.player, ...this.enemies]
        : this.enemies;
  for (const a of targets)
    if (
      a.alive &&
      a.id !== exclude &&
      dist(a, at) < radius + a.radius &&
      !this.world.ray(at, a, 0, ignoreObject)
    )
      this.damage(
        a,
        damage * clamp(1 - dist(a, at) / (radius * 1.6), 0.35, 1),
        at,
      );
  // 环境爆炸与玩家火力统一不伤基地，避免守基地时误毁基地。
  if (
    team === "enemy" &&
    dist(at, this.base) < radius + 2.4 &&
    !this.world.ray(at, this.base, 0, ignoreObject)
  )
    this.damageBase(damage * 0.7);
  for (const o of this.world.objects)
    if (
      o.alive &&
      o.id !== ignoreObject &&
      Number.isFinite(o.hp) &&
      dist(o, at) < radius + Math.max(o.w, o.d) / 2 &&
      !this.world.ray(at, o, 0, o.id)
    )
      this.hitObject(
        o,
        damage,
        team === "environment" ? "player" : team,
        depth,
      );
}

export function hitObject(
  this: Battle,
  o: Obstacle,
  amount: number,
  team: "player" | "enemy",
  depth = 0,
) {
  if (!o.alive || !Number.isFinite(o.hp)) {
    this.effect("hit", o, 0.4, 0xc5d5d6, 0.2);
    return;
  }
  o.hp -= amount;
  if (o.hp <= 0 && this.world.destroy(o)) {
    this.effect(
      "scrap",
      o,
      Math.max(o.w, o.d),
      o.kind === "brick" ? 0xbb8b6a : 0x8b9694,
      1,
    );
    if (team === "player" && this.has("salvage") && this.salvage < 80) {
      this.salvage += 4;
      this.credits += 4;
    }
    if (o.kind === "barrel" && depth < 4)
      this.explode(o, 4.5, 75, "environment", undefined, o.id, depth + 1);
    this.sound("wall", 0.5);
  } else this.effect("hit", o, 0.5, 0xc69b77, 0.2);
}

/** 伤害唯一入口：先护盾后耐久，无隐藏无敌帧。 */
export function damage(this: Battle, a: Actor, amount: number, source: V2) {
  if (!a.alive || amount <= 0 || this.outcome) return;
  const friendly = a.type === "player";
  if (!friendly) {
    if (this.has("focus")) {
      if (this.focusId === a.id)
        this.focusStacks = Math.min(5, this.focusStacks + 1);
      else {
        this.focusId = a.id;
        this.focusStacks = 0;
      }
      amount *= 1 + this.focusStacks * 0.08;
    }
    const close = dist(a, source) < 6;
    if (close && this.has("brawler")) amount *= 1.3;
    const front =
      Math.abs(
        Math.atan2(
          Math.sin(angle(a, source) - a.body),
          Math.cos(angle(a, source) - a.body),
        ),
      ) < 0.9;
    if (a.type === "heavy" && front && !(close && this.has("brawler"))) {
      amount *= 0.65;
      this.effect("shield", a, 1.4, 0xb6b6ab, 0.15);
    }
    if (a.type === "boss") {
      const rear =
        Math.abs(
          Math.atan2(
            Math.sin(angle(a, source) - a.body),
            Math.cos(angle(a, source) - a.body),
          ),
        ) > 2;
      amount *= rear ? (a.phase === 2 ? 1.8 : 1.4) : 0.85;
    }
  } else {
    if (this.effects.some((f) => f.kind === "smoke" && dist(f, a) < f.size))
      amount *= 0.4;
    this.shieldDelay = 5;
    this.sound(a.shield > 0 ? "shield" : "hurt", 0.65);
  }
  const oldShield = a.shield,
    absorbed = Math.min(a.shield, amount);
  a.shield -= absorbed;
  a.hp = Math.max(0, a.hp - (amount - absorbed));
  a.hit = 0.15;
  this.effect("hit", a, 0.9, absorbed > 0 ? 0x9ae0ed : 0xffa87a, 0.22);
  if (friendly && oldShield > 0 && a.shield <= 0) {
    this.message("护盾已破碎 · 脱离火力 5 秒后开始恢复");
    this.sound("break");
    if (this.has("pulse") && this.pulseCd <= 0) {
      this.pulseCd = 15;
      for (const e of this.enemies)
        if (e.alive && dist(e, a) < 7) {
          e.stun = 2;
          const n = norm(e.x - a.x, e.z - a.z);
          this.world.move(e, n.x * 2, n.z * 2, e.radius);
        }
      this.effect("shield", a, 7, 0x9bd6ed, 0.6);
    }
  }
  if (a.hp <= 0) {
    a.alive = false;
    a.hit = 0.7;
    this.effect("blast", a, a.type === "boss" ? 7 : 2.5, 0xffb478, 0.9);
    this.effect("scrap", a, a.radius * 2, 0x6e7670, 8);
    this.sound("explosion");
    if (!friendly) {
      this.kills++;
      this.credits += Math.round(
        ENEMIES[a.type as EnemyId].reward * (a.elite ? 1.5 : 1),
      );
      if (this.has("siphon"))
        this.player.shield = Math.min(
          maxShield(this.run),
          this.player.shield + 8,
        );
    }
    if (a.type === "boss") {
      this.sound("victory");
      this.finish("victory");
    }
  }
}

export function damageBase(this: Battle, amount: number) {
  if (this.outcome) return;
  // 指挥部固定复合装甲吸收 45% 敌方伤害，给予离开基地的玩家反应窗口。
  amount *= 0.55;
  const absorbed = Math.min(this.base.shield, amount);
  this.base.shield -= absorbed;
  this.base.hp = Math.max(0, this.base.hp - amount + absorbed);
  this.base.hit = 2;
  this.effect(
    "shield",
    this.base,
    3,
    this.base.shield > 0 ? 0x9cdaef : 0xff9c70,
    0.3,
  );
  if (this.base.hp < 180) {
    this.sound("alarm", 0.5);
  }
}
