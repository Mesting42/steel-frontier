/** 坦克自由移动、车体转向和独立炮塔瞄准。使用显式 this 上下文共享战斗状态，不依赖渲染或 DOM。 */
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

export function updatePlayer(this: Battle, dt: number, input: BattleInput) {
  const p = this.player,
    terrain = this.world.terrainAt(p),
    moving = Math.hypot(input.move.x, input.move.z) > 0.1;
  const jammed = this.enemies.some(
    (e) => e.alive && e.type === "jammer" && e.stun <= 0 && dist(p, e) < 7,
  );
  const speed =
    (this.dashTime > 0 ? 23 : 7.2) *
    (terrain === "mud" ? 0.64 : 1) *
    (jammed ? 0.65 : 1);
  const blend = 1 - Math.exp(-dt * (terrain === "ice" ? 3.8 : 14));
  p.vx += (input.move.x * speed - p.vx) * blend;
  p.vz += (input.move.z * speed - p.vz) * blend;
  this.world.move(p, p.vx * dt, p.vz * dt, p.radius);
  // 基地属于实体，但友军炮火不伤基地。移动采用软推离防止车体穿进主建筑。
  if (dist(p, this.base) < 3.2) {
    const n = norm(p.x - this.base.x, p.z - this.base.z);
    p.x = this.base.x + n.x * 3.2;
    p.z = this.base.z + n.z * 3.2;
  }
  p.speed = Math.hypot(p.vx, p.vz);
  if (moving)
    p.body = turn(p.body, Math.atan2(input.move.x, input.move.z), dt * 10);
  p.turret = turn(p.turret, angle(p, input.aim), dt * 23);
  if (moving) this.movementCharge = Math.min(2.1, this.movementCharge + dt);
  else if (this.movementCharge < 2) this.movementCharge = 0;
  if (input.firing && p.fire <= 0)
    this.shoot(p, this.weapon.id, "player", input.aim);
  if (this.shieldDelay <= 0)
    p.shield = Math.min(
      maxShield(this.run),
      p.shield + dt * (this.has("battery") ? 6.25 : 5),
    );
  this.base.shield = Math.min(
    100,
    this.base.shield + dt * (this.base.hit > 0 ? 0 : 1),
  );
}
