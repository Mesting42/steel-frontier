/** 主动技能、维修设施与持续效果。使用显式 this 上下文共享战斗状态，不依赖渲染或 DOM。 */
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

export function repair(this: Battle) {
  const free = this.mode === "training",
    cost = free ? 0 : 40;
  if (!free && this.stationUses >= 3) {
    this.message("本场维修站已耗尽 · 战后可继续整备");
    return;
  }
  if (this.run.credits + this.credits < cost) {
    this.message("补给不足 · 维修需要 40 补给");
    return;
  }
  if (!free) {
    this.credits -= cost;
    this.stationUses++;
  }
  this.player.hp = Math.min(maxHp(this.run), this.player.hp + 75);
  this.player.shield = Math.min(maxShield(this.run), this.player.shield + 35);
  this.base.hp = Math.min(600, this.base.hp + 45);
  this.sound("repair");
  this.message(
    free ? "训练补给完成" : "维修完成 · 车体 +75 / 护盾 +35 / 基地 +45",
  );
  this.effect("heal", this.player, 2.5, 0x9dd3ad, 1);
}

export function useSkill(this: Battle, aim: V2) {
  const s = SKILLS[this.run.skill];
  this.skillCd = s.cooldown;
  this.skillTime = s.duration;
  this.sound(this.run.skill);
  if (this.run.skill === "emp") {
    for (const e of this.enemies)
      if (e.alive && dist(e, this.player) < 11) {
        e.stun = 4;
        this.damage(e, 30, this.player);
      }
    this.effect("shield", this.player, 11, 0x9de7f5, 0.7);
  }
  if (this.run.skill === "smoke")
    this.effect("smoke", { ...this.player }, 5, 0xa6b0ac, 7);
  if (this.run.skill === "strike")
    for (let i = 0; i < 3; i++)
      this.warn(
        {
          x: clamp(aim.x + (i - 1) * 2.2, -29, 29),
          z: clamp(aim.z + (i % 2) * 1.6, -29, 29),
        },
        4,
        1.2 + i * 0.5,
        100,
        "player",
      );
  this.message(`${s.name}已启动`);
}

export function updateSkill(this: Battle, dt: number) {
  if (this.skillTime <= 0) return;
  this.skillTime -= dt;
  if (this.run.skill === "drone") {
    this.player.hp = Math.min(maxHp(this.run), this.player.hp + dt * 11);
    if (dist(this.player, this.base) < 10)
      this.base.hp = Math.min(600, this.base.hp + dt * 10);
    if (Math.floor(this.time * 4) !== Math.floor((this.time - dt) * 4))
      this.effect("heal", this.player, 1.7, 0x98e0ae, 0.4);
  }
}
