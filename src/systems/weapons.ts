/** 主炮、炮口遮挡、连续弹道和命中顺序。使用显式 this 上下文共享战斗状态，不依赖渲染或 DOM。 */
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

export function muzzle(this: Battle, a: Actor, weapon: WeaponId) {
  const lengths: Record<WeaponId, number> = {
    shell: 2.3,
    twin: 1.975,
    rail: 2.68,
    scatter: 1.97,
    missile: 1.47,
    arc: 1.58,
  };
  const scale =
    a.type === "player"
      ? 0.82
      : a.type === "boss"
        ? 1.425
        : (a.radius / 1.8) *
          (a.type === "scout" || a.type === "engineer" ? 0.75 : 1);
  const length = lengths[weapon] * scale;
  return {
    x: a.x + Math.sin(a.turret) * length,
    z: a.z + Math.cos(a.turret) * length,
  };
}

export function shoot(
  this: Battle,
  a: Actor,
  weapon: WeaponId,
  team: Bullet["team"],
  aim: V2,
) {
  const def = WEAPONS[weapon],
    source = this.muzzle(a, weapon),
    blocked = this.world.ray(a, source, 0.12);
  const rate =
    team === "player"
      ? (this.has("loader") ? 0.88 : 1) /
        (this.boostTime > 0 && this.has("overdrive") ? 1.4 : 1)
      : ENEMIES[a.type as EnemyId].interval / def.interval;
  // 保留上一帧越过冷却零点的余量，避免 60Hz 下高射速武器被量化降速。
  a.fire = Math.max(0.01, def.interval * rate + Math.min(0, a.fire));
  a.recoil = 1;
  this.shotCounter++;
  if (team === "player") this.shotsFired++;
  const baseDamage =
    team === "player" ? def.damage : ENEMIES[a.type as EnemyId].damage;
  let damage =
    baseDamage *
    (team === "player" && this.has("momentum") && this.movementCharge >= 2
      ? 1.5
      : 1);
  if (team === "player" && this.has("momentum") && this.movementCharge >= 2)
    this.movementCharge = 0;
  if (team === "player" && weapon === "rail" && this.has("penetrator"))
    damage *= 1.2;
  if (team === "player" && weapon === "missile" && this.has("seeker"))
    damage *= 1.15;
  if (blocked) {
    this.hitObject(blocked.object, damage, team);
    this.effect("hit", blocked, 0.7, def.color, 0.25);
    if (team === "player" && this.shotCounter % 4 === 0)
      this.message("炮口受阻 · 调整位置打开射界");
    this.sound("wall", 0.4);
    return;
  }
  this.effect("hit", source, 0.5, def.color, 0.1);
  this.sound(weapon, team === "player" ? 1 : 0.25);
  if (weapon === "arc") {
    this.arc(a, source, aim, team, damage);
    return;
  }
  const count = weapon === "scatter" ? 7 : 1;
  for (let i = 0; i < count; i++) {
    const spread =
      weapon === "scatter"
        ? (i - 3) * 0.09
        : weapon === "twin"
          ? (this.rng.next() - 0.5) * 0.025
          : 0;
    const direction = a.turret + spread,
      offset = weapon === "twin" ? (this.shotCounter % 2 ? 0.23 : -0.23) : 0;
    const p = {
      x: source.x + Math.cos(direction) * offset,
      z: source.z - Math.sin(direction) * offset,
    };
    this.bullets.push({
      id: this.nextId++,
      ...p,
      prev: { ...p },
      source: { ...a },
      vx: Math.sin(direction) * def.speed,
      vz: Math.cos(direction) * def.speed,
      damage,
      weapon,
      team,
      owner: a.id,
      life:
        (def.range / def.speed) *
        (weapon === "missile" && this.has("seeker") ? 1.4 : 1),
      radius: weapon === "missile" ? 0.2 : 0.1,
      pierce: def.pierce,
      hits: new Set(),
      color: def.color,
    });
  }
}

export function arc(
  this: Battle,
  a: Actor,
  source: V2,
  aim: V2,
  team: Bullet["team"],
  damage: number,
) {
  if (team === "enemy") {
    const target = dist(a, this.player) < 14 ? this.player : null;
    if (target && !this.world.ray(source, target)) {
      this.effect("arc", source, 1, 0xb6c0ee, 0.22, { ...target });
      this.damage(target, damage, a);
    }
    return;
  }
  const candidates = this.enemies
    .filter(
      (e) =>
        e.alive &&
        dist(a, e) <= 14 &&
        Math.abs(
          Math.atan2(
            Math.sin(angle(a, e) - a.turret),
            Math.cos(angle(a, e) - a.turret),
          ),
        ) < 0.45 &&
        !this.world.ray(source, e),
    )
    .sort((e, f) => dist(e, aim) - dist(f, aim));
  let target = candidates[0],
    from = source;
  const used = new Set<number>();
  for (let i = 0; target && i < (this.has("conductor") ? 5 : 4); i++) {
    used.add(target.id);
    this.effect("arc", from, 1, 0x9de5f5, 0.25, { ...target });
    this.damage(target, damage * Math.pow(0.78, i), a);
    if (this.has("conductor")) target.slow = 2;
    from = { ...target };
    target = this.enemies
      .filter(
        (e) =>
          e.alive &&
          !used.has(e.id) &&
          dist(from, e) < 7 &&
          !this.world.ray(from, e),
      )
      .sort((e, f) => dist(from, e) - dist(from, f))[0];
  }
  if (!used.size) {
    const end = {
        x: source.x + Math.sin(a.turret) * 9,
        z: source.z + Math.cos(a.turret) * 9,
      },
      wall = this.world.ray(source, end);
    this.effect("arc", source, 1, 0x9de5f5, 0.18, wall ?? end);
    if (wall) this.hitObject(wall.object, damage * 0.6, team);
  }
}

export function updateBullets(this: Battle, dt: number) {
  for (const b of this.bullets) {
    if (b.life <= 0) continue;
    b.prev = { x: b.x, z: b.z };
    b.life -= dt;
    if (b.weapon === "missile" && b.team === "player") {
      const target = this.enemies
        .filter((e) => e.alive && dist(e, b) < 15 && !this.world.ray(b, e))
        .sort((a, c) => dist(a, b) - dist(c, b))[0];
      if (target) {
        const dir = turn(
            Math.atan2(b.vx, b.vz),
            angle(b, target),
            dt * (this.has("seeker") ? 2.5 : 1.8),
          ),
          speed = WEAPONS.missile.speed;
        b.vx = Math.sin(dir) * speed;
        b.vz = Math.cos(dir) * speed;
      }
    }
    const end = { x: b.x + b.vx * dt, z: b.z + b.vz * dt },
      wall = this.world.ray(b, end, b.radius);
    const targets =
      b.team === "player"
        ? this.enemies.filter((e) => e.alive && !b.hits.has(e.id))
        : [this.player];
    const hits = targets
      .map((a) => ({ a, t: segmentCircle(b, end, a, a.radius + b.radius) }))
      .filter((h): h is { a: Actor; t: number } => h.t !== null)
      .sort((a, c) => a.t - c.t);
    let blockedT = wall?.t ?? Infinity;
    if (b.team === "enemy") {
      const t = segmentCircle(b, end, this.base, 2.4 + b.radius);
      if (t !== null && t < blockedT && (!hits.length || t < hits[0].t)) {
        b.x += (end.x - b.x) * t;
        b.z += (end.z - b.z) * t;
        this.damageBase(b.damage);
        this.effect(
          "blast",
          b,
          WEAPONS[b.weapon].splash || 0.7,
          0xffb478,
          0.45,
        );
        this.sound("impact", 0.4);
        b.life = 0;
        continue;
      }
    }
    let stopped = false;
    for (const h of hits) {
      if (h.t > blockedT) break;
      b.hits.add(h.a.id);
      const position = {
        x: b.x + (end.x - b.x) * h.t,
        z: b.z + (end.z - b.z) * h.t,
      };
      const falloff =
        b.weapon === "scatter"
          ? clamp(1 - dist(b.source, h.a) / 22, 0.3, 1)
          : 1;
      this.damage(h.a, b.damage * falloff, b.source);
      this.impact(b, position, h.a.id);
      if (b.pierce-- <= 0) {
        b.life = 0;
        b.x = position.x;
        b.z = position.z;
        stopped = true;
        break;
      }
      if (!this.has("penetrator")) b.damage *= 0.72;
    }
    if (stopped) continue;
    if (wall) {
      b.x = wall.x;
      b.z = wall.z;
      this.hitObject(wall.object, b.damage, b.team);
      this.impact(b, wall, undefined, wall.object.id);
      b.life = 0;
    } else {
      b.x = end.x;
      b.z = end.z;
    }
    if (Math.abs(b.x) > HALF + 3 || Math.abs(b.z) > HALF + 3) b.life = 0;
  }
  this.bullets = this.bullets.filter((b) => b.life > 0);
}

export function impact(
  this: Battle,
  b: Bullet,
  at: V2 = b,
  exclude?: number,
  ignoreObject?: number,
) {
  const radius =
    WEAPONS[b.weapon].splash ||
    (b.team === "player" && this.has("shrapnel") ? 1.8 : 0);
  if (radius > 0)
    this.explode(at, radius, b.damage * 0.65, b.team, exclude, ignoreObject);
  else this.effect("hit", at, 0.7, b.color, 0.24);
  this.sound("impact", 0.3);
}
