import * as Tank from "./systems/tank";
import * as Weapons from "./systems/weapons";
import * as Enemies from "./systems/enemies";
import * as Abilities from "./systems/abilities";
import * as Damage from "./systems/damage";
import * as Waves from "./systems/waves";
import {
  ENEMIES,
  SKILLS,
  WEAPONS,
  type EnemyId,
  type PerkId,
  type WeaponId,
} from "./data";
import {
  angle,
  clamp,
  dist,
  norm,
  RNG,
  segmentCircle,
  turn,
  type V2,
} from "./math";
import { BASE_POS, HALF, SPAWNS, World, type Obstacle } from "./world";
import { maxHp, maxShield, type Run } from "./save";

export type Mode = "campaign" | "endless" | "training";
export interface Actor extends V2 {
  id: number;
  type: EnemyId | "player";
  hp: number;
  maxHp: number;
  shield: number;
  radius: number;
  body: number;
  turret: number;
  vx: number;
  vz: number;
  speed: number;
  fire: number;
  recoil: number;
  hit: number;
  stun: number;
  slow: number;
  alive: boolean;
  path: V2[];
  navVersion: number;
  rethink: number;
  age: number;
  elite: boolean;
  shot: number;
  phase: number;
  special: number;
  target?: V2;
  parts?: number;
}
export interface Bullet extends V2 {
  id: number;
  prev: V2;
  vx: number;
  vz: number;
  damage: number;
  weapon: WeaponId;
  team: "player" | "enemy";
  owner: number;
  life: number;
  radius: number;
  pierce: number;
  hits: Set<number>;
  source: V2;
  color: number;
}
export interface Effect extends V2 {
  id: number;
  kind:
    "blast" | "hit" | "dust" | "arc" | "heal" | "shield" | "smoke" | "scrap";
  life: number;
  maxLife: number;
  size: number;
  color: number;
  end?: V2;
}
export interface Warning extends V2 {
  id: number;
  radius: number;
  life: number;
  maxLife: number;
  damage: number;
  team: "player" | "enemy";
  kind: "artillery" | "spawn" | "beam";
  spawn?: EnemyId;
  elite?: boolean;
  end?: V2;
  origin?: V2;
}
export interface BattleInput {
  move: V2;
  aim: V2;
  firing: boolean;
  dash: boolean;
  skill: boolean;
  swap: boolean;
}
export interface BattleEvent {
  type: "sound" | "message" | "wave" | "result";
  name: string;
  value?: number;
}
export type Outcome = "victory" | "player" | "base" | "clear";

/** 无 DOM、音频或 Three.js 依赖的固定步长模拟。渲染只读取此状态。 */
export class Battle {
  world: World;
  rng: RNG;
  player: Actor;
  enemies: Actor[] = [];
  bullets: Bullet[] = [];
  effects: Effect[] = [];
  warnings: Warning[] = [];
  base = { ...BASE_POS, hp: 600, shield: 100, hit: 0 };
  events: BattleEvent[] = [];
  time = 0;
  wave = 0;
  totalWaves = 3;
  waveTimer = 6;
  waveActive = false;
  pending: { type: EnemyId; delay: number; spawn: number; elite: boolean }[] =
    [];
  outcome: Outcome | null = null;
  kills = 0;
  credits = 0;
  dashCd = 0;
  dashTime = 0;
  skillCd = 0;
  skillTime = 0;
  boostTime = 0;
  shieldDelay = 0;
  pulseCd = 0;
  emergencyUsed = false;
  movementCharge = 0;
  focusId = -1;
  focusStacks = 0;
  salvage = 0;
  stationUses = 0;
  station = { x: -5.5, z: 23 };
  endlessOffset = 0;
  trainingFire = false;
  bossSpawned = false;
  nextId = 10;
  shotCounter = 0;
  trainingRespawn = 0;
  private supportCd = 0;
  shotsFired = 0;
  constructor(
    public mode: Mode,
    public run: Run,
    mapIndex: number,
    endlessOffset = 0,
  ) {
    this.world = new World(
      run.seed + run.stage * 991 + endlessOffset * 111,
      mapIndex,
    );
    this.rng = new RNG(run.seed + run.stage * 97);
    this.endlessOffset = endlessOffset;
    this.player = this.actor("player", { x: 0, z: 17 });
    this.player.hp = run.hp;
    this.player.shield = run.shield;
    this.base.hp = run.baseHp;
    this.base.shield = run.baseShield;
    if (mode === "training") {
      this.totalWaves = 0;
      for (const [i, t] of (
        [
          "scout",
          "tank",
          "heavy",
          "artillery",
          "bomber",
          "engineer",
          "jammer",
        ] as EnemyId[]
      ).entries())
        this.spawn(t, { x: (i - 3) * 6, z: -10 + (i % 2) * 5 });
      this.message("训练场已就绪 · 切换武器与技能，靠近维修站免费修复");
    } else this.message("指挥部已部署 · 首波进攻即将到达");
  }
  get weapon() {
    return WEAPONS[this.run.weapons[this.run.active]];
  }
  get remaining() {
    return (
      this.enemies.filter((e) => e.alive).length +
      this.pending.length +
      this.warnings.filter((w) => w.kind === "spawn").length
    );
  }
  has(id: PerkId) {
    return this.run.perks.includes(id);
  }
  message(name: string) {
    this.events.push({ type: "message", name });
  }
  sound(name: string, value = 1) {
    this.events.push({ type: "sound", name, value });
  }
  effect(
    kind: Effect["kind"],
    p: V2,
    size: number,
    color: number,
    life = 0.5,
    end?: V2,
  ) {
    this.effects.push({
      id: this.nextId++,
      ...p,
      kind,
      size,
      color,
      life,
      maxLife: life,
      end,
    });
    if (this.effects.length > 180)
      this.effects.splice(0, this.effects.length - 180);
  }
  actor(type: Actor["type"], p: V2): Actor {
    const def = type === "player" ? null : ENEMIES[type];
    return {
      id: this.nextId++,
      x: p.x,
      z: p.z,
      type,
      hp: def?.hp ?? maxHp(this.run),
      maxHp: def?.hp ?? maxHp(this.run),
      shield: type === "player" ? maxShield(this.run) : 0,
      radius: def?.radius ?? 1.45,
      body: Math.PI,
      turret: Math.PI,
      vx: 0,
      vz: 0,
      speed: 0,
      fire: 0.5,
      recoil: 0,
      hit: 0,
      stun: 0,
      slow: 0,
      alive: true,
      path: [],
      navVersion: -1,
      rethink: 0,
      age: 0,
      elite: false,
      shot: 0,
      phase: 1,
      special: 7,
    };
  }
  spawn(type: EnemyId, p: V2, elite = false) {
    // 沿附近开放位置寻找出生点，不能在实体内生成。
    let position = { ...p };
    for (
      let i = 0;
      i < 25 && this.world.blocked(position, ENEMIES[type].radius);
      i++
    )
      position = {
        x: clamp(p.x + this.rng.int(-4, 4), -28, 28),
        z: clamp(p.z + this.rng.int(-4, 4), -28, 26),
      };
    const e = this.actor(type, position);
    e.elite = elite;
    const scale = 1 + Math.min(this.run.stage, 8) * 0.055;
    e.hp = e.maxHp = Math.round(e.maxHp * scale * (elite ? 1.4 : 1));
    this.enemies.push(e);
    if (type === "boss") {
      this.bossSpawned = true;
      this.sound("boss");
      this.message("堡垒攻城指挥车入场 · 攻击发光的后部能源核心");
    }
    return e;
  }
  update(dt: number, input: BattleInput) {
    if (this.outcome) return;
    this.time += dt;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.skillCd = Math.max(0, this.skillCd - dt);
    this.dashTime = Math.max(0, this.dashTime - dt);
    this.boostTime = Math.max(0, this.boostTime - dt);
    this.pulseCd = Math.max(0, this.pulseCd - dt);
    this.shieldDelay -= dt;
    this.supportCd -= dt;
    this.base.hit = Math.max(0, this.base.hit - dt);
    for (const a of [this.player, ...this.enemies]) {
      a.fire -= dt;
      a.recoil = Math.max(0, a.recoil - dt * 3.4);
      a.hit = Math.max(0, a.hit - dt);
      a.stun -= dt;
      a.slow -= dt;
      a.age += dt;
      if (
        a.alive &&
        a.hp < a.maxHp * 0.3 &&
        Math.floor(this.time * 3 + a.id) !==
          Math.floor((this.time - dt) * 3 + a.id)
      )
        this.effect("smoke", { x: a.x, z: a.z - 0.65 }, 0.45, 0x7d827b, 1.2);
    }
    if (input.swap && this.run.weapons.length > 1) {
      this.run.active = (this.run.active + 1) % this.run.weapons.length;
      this.sound("switch");
    }
    if (input.dash && this.dashCd <= 0) {
      this.dashCd = 4.5;
      this.dashTime = 0.22;
      this.boostTime = 3;
      this.sound("dash");
    }
    if (input.skill) {
      if (dist(this.player, this.station) < 3.2) this.repair();
      else if (this.skillCd <= 0) this.useSkill(input.aim);
    }
    this.updatePlayer(dt, input);
    this.updateSkill(dt);
    if (this.mode !== "training") this.updateWaves(dt);
    else this.updateTraining(dt);
    for (const enemy of this.enemies)
      if (enemy.alive) this.updateEnemy(enemy, dt);
    this.separateEnemies(dt);
    this.updateWarnings(dt);
    this.updateBullets(dt);
    for (const f of this.effects) f.life -= dt;
    this.effects = this.effects.filter((f) => f.life > 0);
    this.enemies = this.enemies.filter((e) => e.alive || e.hit > 0);
    if (this.has("emergency") && !this.emergencyUsed && this.base.hp < 210) {
      this.emergencyUsed = true;
      this.base.shield = Math.max(this.base.shield, 100);
      this.player.shield = maxShield(this.run);
      this.message("最后防线启动 · 基地与玩家护盾已补满");
      this.sound("shield");
    }
    if (
      this.run.support > 0 &&
      this.supportCd <= 0 &&
      this.enemies.some((e) => e.alive)
    ) {
      this.supportCd = 16;
      const e = this.enemies.find((e) => e.alive)!;
      this.warn(e, 4, 1.4, 80, "player");
    }
    if (this.player.hp <= 0) this.finish("player");
    else if (this.base.hp <= 0) this.finish("base");
  }
  updatePlayer = Tank.updatePlayer;

  repair = Abilities.repair;

  useSkill = Abilities.useSkill;

  updateSkill = Abilities.updateSkill;

  updateTraining = Waves.updateTraining;

  updateWaves = Waves.updateWaves;

  beginWave = Waves.beginWave;

  updateEnemy = Enemies.updateEnemy;

  navigate = Enemies.navigate;

  separateEnemies = Enemies.separateEnemies;

  updateBoss = Enemies.updateBoss;

  muzzle = Weapons.muzzle;

  shoot = Weapons.shoot;

  arc = Weapons.arc;

  updateBullets = Weapons.updateBullets;

  impact = Weapons.impact;

  explode = Damage.explode;

  hitObject = Damage.hitObject;

  damage = Damage.damage;

  damageBase = Damage.damageBase;

  warn = Waves.warn;

  updateWarnings = Waves.updateWarnings;

  /** 结束闩锁先于所有外部回调，胜利后清空伤害与出生队列。 */
  finish(outcome: Outcome) {
    if (this.outcome) return;
    this.outcome = outcome;
    this.pending.length = 0;
    this.warnings.length = 0;
    this.bullets.length = 0;
    this.events.push({ type: "result", name: outcome });
  }
  checkpoint() {
    this.run.hp = this.player.hp;
    this.run.shield = this.player.shield;
    this.run.baseHp = this.base.hp;
    this.run.baseShield = this.base.shield;
    this.run.credits += this.credits;
    this.run.kills += this.kills;
    this.run.elapsed += this.time;
    this.credits = 0;
    this.kills = 0;
    this.time = 0;
  }
}
