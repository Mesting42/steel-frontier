/** 敌军战术、导航避让和 Boss 阶段行为。使用显式 this 上下文共享战斗状态，不依赖渲染或 DOM。 */
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

export function updateEnemy(this: Battle, e: Actor, dt: number) {
  if (e.stun > 0 || (this.mode === "training" && !this.trainingFire)) {
    e.speed = 0;
    return;
  }
  const d = ENEMIES[e.type as EnemyId];
  if (e.type === "boss") {
    this.updateBoss(e, dt);
    return;
  }
  let target: V2 =
    d.target === "player" && dist(e, this.player) < 24
      ? this.player
      : this.base;
  if (e.type === "scout" && e.age < 5)
    target = { x: e.x < 0 ? -24 : 24, z: 12 };
  if (e.type === "engineer") {
    const ally = this.enemies
      .filter((a) => a.alive && a.id !== e.id && a.hp < a.maxHp)
      .sort((a, b) => dist(a, e) - dist(b, e))[0];
    if (ally) {
      target = ally;
      if (dist(e, ally) < 8 && !this.world.ray(e, ally)) {
        ally.hp = Math.min(ally.maxHp, ally.hp + dt * 9);
        if (e.fire <= 0) {
          this.effect("arc", e, 0.1, 0x9ad5a5, 0.22, { ...ally });
          e.fire = 0.6;
        }
      }
    }
  }
  const distance = dist(e, target),
    visible = !this.world.ray(e, target, 0.1);
  const smoke = this.effects.some(
    (f) => f.kind === "smoke" && dist(f, this.player) < f.size,
  );
  const canSeePlayer = target !== this.player || !smoke;
  const desired =
    e.type === "artillery"
      ? 23
      : e.type === "bomber"
        ? 0
        : e.type === "engineer"
          ? 5
          : d.range * 0.68;
  if (distance > desired || !visible) this.navigate(e, target, dt);
  else e.speed = 0;
  e.turret = turn(e.turret, angle(e, target), dt * 4);
  if (
    e.type === "jammer" &&
    Math.floor(e.age * 2) !== Math.floor((e.age - dt) * 2)
  )
    this.effect("shield", e, 7, 0xb49ac3, 0.45);
  if (e.type === "bomber") {
    if (dist(e, this.base) < 4.2 || dist(e, this.player) < 2.5) {
      this.warn(e, 4, 0.8, 48, "enemy");
      e.alive = false;
      e.hit = 0.2;
      this.effect("blast", e, 2, 0xff995a, 0.5);
    }
    return;
  }
  if (e.fire <= 0 && distance < d.range && canSeePlayer) {
    if (e.type === "artillery") {
      this.warn(
        {
          x: target.x + this.rng.next() * 2 - 1,
          z: target.z + this.rng.next() * 2 - 1,
        },
        3,
        1.8,
        d.damage,
        "enemy",
      );
      e.fire = d.interval;
      this.sound("artillery", 0.35);
    } else if (visible) this.shoot(e, d.weapon, "enemy", target);
    else {
      const wall = this.world.ray(e, target);
      if (wall && Number.isFinite(wall.object.hp) && dist(e, wall) < d.range)
        this.shoot(e, d.weapon, "enemy", wall);
    }
  }
}

export function navigate(this: Battle, e: Actor, target: V2, dt: number) {
  e.rethink -= dt;
  if (
    e.rethink <= 0 ||
    e.navVersion !== this.world.revision ||
    !e.path.length
  ) {
    e.path = this.world.path(e, target, e.radius);
    e.navVersion = this.world.revision;
    e.rethink = 1 + (e.id % 7) * 0.12;
  }
  while (e.path.length && dist(e, e.path[0]) < 1) e.path.shift();
  let next = e.path[0];
  // 无路径时朝最近可破坏的挡路物推进，避免在地图边缘永久等待。
  if (!next) {
    const wall = this.world.ray(e, target);
    if (wall && Number.isFinite(wall.object.hp) && e.fire <= 0) {
      e.turret = angle(e, wall);
      this.shoot(e, "shell", "enemy", wall);
    }
    next = target;
  }
  const n = norm(next.x - e.x, next.z - e.z),
    speed =
      ENEMIES[e.type as EnemyId].speed *
      (e.slow > 0 ? 0.5 : 1) *
      (e.elite ? 1.15 : 1) *
      (this.world.terrainAt(e) === "mud" ? 0.7 : 1);
  const before = { x: e.x, z: e.z };
  this.world.move(e, n.x * speed * dt, n.z * speed * dt, e.radius);
  e.speed = dist(before, e) / dt;
  if (e.speed > 0.1) e.body = turn(e.body, Math.atan2(n.x, n.z), dt * 4);
}

export function separateEnemies(this: Battle, dt: number) {
  const live = this.enemies.filter((e) => e.alive);
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i],
        b = live[j],
        distance = dist(a, b),
        min = (a.radius + b.radius) * 0.88;
      if (distance < min) {
        const n = norm(a.x - b.x || 0.01, a.z - b.z || 0.01),
          push = Math.min(min - distance, dt * 3);
        this.world.move(a, n.x * push, n.z * push, a.radius);
        this.world.move(b, -n.x * push, -n.z * push, b.radius);
      }
    }
}

/** Boss 的蓄力、导弹和护卫分别计时；阶段转换只改变模式，不直接施伤。 */
export function updateBoss(this: Battle, e: Actor, dt: number) {
  if (e.hp < e.maxHp * 0.5 && e.phase === 1) {
    e.phase = 2;
    e.stun = 2.5;
    this.message("堡垒第二阶段 · 侧翼导弹舱展开，后部核心暴露");
    this.sound("phase");
    this.effect("shield", e, 6, 0xffb46e, 1.5);
  }
  if (e.hp < e.maxHp * 0.28 && !e.parts) {
    e.parts = 1;
    this.effect("blast", { x: e.x - 1.2, z: e.z - 0.7 }, 2, 0xffbf7c, 0.6);
    this.message("堡垒左侧导弹舱损毁 · 齐射数量降低");
    this.sound("explosion", 0.6);
  }
  const goal = {
    x: Math.sin(e.age * 0.11) * (e.phase === 2 ? 13 : 6),
    z: e.phase === 2 ? -2 : -11,
  };
  const charging = this.warnings.some((w) => w.kind === "beam");
  if (!charging && dist(e, goal) > 2) this.navigate(e, goal, dt);
  else e.speed = 0;
  const target = e.shot % 4 === 0 ? this.base : this.player;
  if (!charging) e.turret = turn(e.turret, angle(e, target), dt * 2);
  e.special -= dt;
  if (e.fire <= 0) {
    const source = this.muzzle(e, "rail"),
      end = {
        x: source.x + Math.sin(e.turret) * 55,
        z: source.z + Math.cos(e.turret) * 55,
      };
    this.warnings.push({
      id: this.nextId++,
      ...source,
      origin: { x: e.x, z: e.z },
      radius: 1.2,
      life: 2,
      maxLife: 2,
      damage: 45,
      team: "enemy",
      kind: "beam",
      end,
    });
    e.fire = e.phase === 2 ? 5.8 : 7.5;
    e.shot++;
    this.sound("charge", 0.6);
  }
  if (e.special <= 0) {
    e.special = e.phase === 2 ? 10 : 13;
    for (let i = 0; i < (e.phase === 2 ? 5 : 3) - (e.parts ?? 0); i++) {
      const missileTarget =
        e.phase === 2 && i === 0 && e.shot % 4 === 0 ? this.base : this.player;
      this.warn(
        {
          x: clamp(missileTarget.x + Math.sin(i * 2) * 4, -28, 28),
          z: clamp(missileTarget.z + Math.cos(i * 2) * 4, -28, 28),
        },
        3.3,
        2 + i * 0.25,
        26,
        "enemy",
      );
    }
  }
  if (
    Math.floor(e.age / 21) !== Math.floor((e.age - dt) / 21) &&
    this.enemies.filter((a) => a.alive).length < 9
  ) {
    for (const x of [-25, 25])
      this.warnings.push({
        id: this.nextId++,
        x,
        z: -25,
        kind: "spawn",
        radius: 2.4,
        life: 3.5,
        maxLife: 3.5,
        damage: 0,
        team: "enemy",
        spawn: e.phase === 2 ? "tank" : "scout",
      });
    this.message("堡垒呼叫护卫 · 北部两翼即将增援");
  }
}
