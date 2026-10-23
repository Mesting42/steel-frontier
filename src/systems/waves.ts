/** 波次调度、出生预警和延迟攻击。使用显式 this 上下文共享战斗状态，不依赖渲染或 DOM。 */
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

export function updateTraining(this: Battle, dt: number) {
  this.trainingRespawn -= dt;
  if (this.trainingRespawn <= 0) {
    this.trainingRespawn = 4;
    const types: EnemyId[] = [
      "scout",
      "tank",
      "heavy",
      "artillery",
      "bomber",
      "engineer",
      "jammer",
    ];
    for (const [i, type] of types.entries())
      if (!this.enemies.some((e) => e.alive && e.type === type))
        this.spawn(type, { x: (i - 3) * 6, z: -10 + (i % 2) * 5 });
  }
}

export function updateWaves(this: Battle, dt: number) {
  for (const p of this.pending) p.delay -= dt;
  const ready = this.pending.filter((p) => p.delay <= 0);
  this.pending = this.pending.filter((p) => p.delay > 0);
  for (const p of ready) {
    let position = SPAWNS[p.spawn];
    if (dist(this.player, position) < 7)
      position = SPAWNS[(p.spawn + 2) % SPAWNS.length];
    this.warnings.push({
      id: this.nextId++,
      ...position,
      kind: "spawn",
      radius: 2.4,
      life: 3.5,
      maxLife: 3.5,
      damage: 0,
      team: "enemy",
      spawn: p.type,
      elite: p.elite,
    });
  }
  if (this.waveActive && this.remaining === 0) {
    this.waveActive = false;
    if (this.wave >= this.totalWaves) {
      this.finish(
        this.mode === "campaign" && this.run.stage === 5 ? "victory" : "clear",
      );
      return;
    }
    this.waveTimer = 7;
    this.message("本波威胁清除 · 7 秒后下一波");
    this.player.shield = Math.min(maxShield(this.run), this.player.shield + 20);
  }
  if (!this.waveActive) {
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) this.beginWave();
  }
}

export function beginWave(this: Battle) {
  this.wave++;
  this.waveActive = true;
  this.sound("wave");
  const tier = this.run.stage + Math.floor(this.endlessOffset / 3),
    north = this.rng.int(0, 2);
  if (this.run.stage === 5 && this.mode === "campaign" && this.wave === 3) {
    this.pending.push({ type: "boss", delay: 2, spawn: 1, elite: false });
    this.message("最终威胁 · 北侧检测到重型攻城平台");
    return;
  }
  const roster: EnemyId[] = ["scout", "tank", "bomber"];
  if (tier >= 1) roster.push("artillery", "engineer");
  if (tier >= 2) roster.push("heavy");
  if (tier >= 3) roster.push("jammer");
  const count = Math.round(
    (5 + Math.min(tier, 10) + this.wave * 2) *
      (this.run.route === "supply" ? 1.2 : 1),
  );
  for (let i = 0; i < count; i++)
    this.pending.push({
      type: this.rng.pick(roster),
      delay: i * (tier >= 3 ? 2.4 : 2.8),
      spawn: i % 3 === 0 ? north : this.rng.int(0, Math.min(4, tier + 2)),
      elite: this.run.route === "danger" && i % 4 === 0,
    });
  this.events.push({
    type: "wave",
    name: `第 ${this.wave + this.endlessOffset} 波 · ${["西北", "正北", "东北"][north]}主攻 / ${roster
      .map((t) => ENEMIES[t].name.replace(/式|战斗|侦察|自行/g, ""))
      .slice(-3)
      .join("、")}`,
  });
}

export function warn(
  this: Battle,
  at: V2,
  radius: number,
  delay: number,
  damage: number,
  team: Warning["team"],
) {
  this.warnings.push({
    id: this.nextId++,
    ...at,
    radius,
    life: delay,
    maxLife: delay,
    damage,
    team,
    kind: "artillery",
  });
}

export function updateWarnings(this: Battle, dt: number) {
  const expired: Warning[] = [];
  for (const w of this.warnings) {
    w.life -= dt;
    if (w.life <= 0) expired.push(w);
  }
  this.warnings = this.warnings.filter((w) => w.life > 0);
  for (const w of expired) {
    if (this.outcome) return;
    if (w.kind === "spawn") {
      if (dist(w, this.player) < 4) {
        w.life = 1.5;
        this.warnings.push(w);
        continue;
      }
      if (w.spawn) this.spawn(w.spawn, w, w.elite);
    } else if (w.kind === "beam" && w.end) {
      const muzzleWall = w.origin ? this.world.ray(w.origin, w, 0.12) : null,
        wall = muzzleWall ?? this.world.ray(w, w.end, 0.45),
        end = wall ?? w.end,
        source = muzzleWall ? w.origin! : w;
      this.effect("arc", source, 1.5, 0xffb877, 0.45, end);
      if (
        segmentCircle(source, end, this.player, this.player.radius + 0.6) !==
        null
      )
        this.damage(this.player, w.damage, source);
      if (segmentCircle(source, end, this.base, 3) !== null)
        this.damageBase(w.damage);
      if (wall) this.hitObject(wall.object, 120, "enemy");
      this.sound("rail");
    } else this.explode(w, w.radius, w.damage, w.team);
  }
}
