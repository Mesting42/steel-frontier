import {
  clamp,
  dist,
  overlaps,
  RNG,
  segmentRect,
  type Rect,
  type V2,
} from "./math";
import { MAPS } from "./data";
export type ObjectKind =
  "brick" | "steel" | "sandbag" | "barrel" | "wreck" | "water" | "rock";
export interface Obstacle extends Rect {
  id: number;
  kind: ObjectKind;
  hp: number;
  maxHp: number;
  solid: boolean;
  blocksShot: boolean;
  alive: boolean;
  rotation: number;
}
export interface Terrain extends Rect {
  kind: "mud" | "ice";
}
export const HALF = 31.5,
  CELL = 3,
  GRID = 21;
export const BASE_POS: V2 = { x: 0, z: 23 };
export const SPAWNS: V2[] = [
  { x: -25, z: -27 },
  { x: 0, z: -28 },
  { x: 25, z: -27 },
  { x: -28, z: -7 },
  { x: 28, z: -7 },
];
/** 地图对象是碰撞与渲染的共同真相。销毁时先改变 alive，再递增导航版本。 */
export class World {
  objects: Obstacle[] = [];
  terrain: Terrain[] = [];
  revision = 0;
  mapIndex: number;
  rng: RNG;
  constructor(
    public seed: number,
    mapIndex: number,
  ) {
    this.mapIndex = mapIndex;
    this.rng = new RNG(seed);
    this.generate();
  }
  get biome() {
    return MAPS[this.mapIndex].biome;
  }
  add(kind: ObjectKind, x: number, z: number, w = 2.7, d = 2.7) {
    // 基地、出生入口和中央纵向救援线预留空间，随机物件不能破坏主干路。
    if (Math.abs(x) < 3.3 && kind !== "sandbag") return;
    if (
      dist({ x, z }, BASE_POS) < 7 ||
      SPAWNS.some((p) => dist(p, { x, z }) < 4)
    )
      return;
    const hp = {
      brick: 65,
      steel: Infinity,
      sandbag: 32,
      barrel: 22,
      wreck: 110,
      water: Infinity,
      rock: Infinity,
    }[kind];
    this.objects.push({
      id: this.objects.length + 1,
      kind,
      x,
      z,
      w,
      d,
      hp,
      maxHp: hp,
      solid: true,
      blocksShot: kind !== "water",
      alive: true,
      rotation: this.rng.next() * 0.12 - 0.06,
    });
  }
  generate() {
    const p = MAPS[this.mapIndex].pattern,
      R = this.rng;
    if (p === "streets") {
      for (const x of [-18, -9, 9, 18])
        for (const z of [-18, -15, -12, 0, 3, 6])
          if (R.next() > 0.18) this.add(z < -10 ? "brick" : "steel", x, z);
      for (const x of [-18, 18])
        for (let z = 12; z <= 18; z += 3) this.add("brick", x, z);
    } else if (p === "rails") {
      for (const x of [-21, -12, 12, 21])
        for (let z = -20; z < 16; z += 3)
          if (Math.floor((z + 20) / 9) % 2 === 0)
            this.add(x === 12 ? "brick" : "steel", x, z);
    } else if (p === "docks") {
      for (const x of [-12, 12])
        for (const z of [-16, -13, -10, 5, 8, 11])
          this.add("water", x, z, 5, 2.9);
      for (const x of [-22, 22, -6, 6])
        for (const z of [-21, 1]) this.add("brick", x, z, 2.7, 5.5);
    } else if (p === "river") {
      for (let z = -24; z < 19; z += 6) {
        const x = -14 + Math.sin(z * 0.13) * 6;
        this.terrain.push({ x, z, w: 7, d: 8, kind: "mud" });
        this.add("rock", 15 + Math.sin(z) * 6, z, 3.8, 3.3);
      }
    } else if (p === "convoy") {
      for (let z = -22; z < 15; z += 8)
        for (const x of [-17, -7, 8, 21])
          if (R.next() > 0.23) this.add("wreck", x, z + R.int(-2, 2), 2.6, 4.5);
    } else if (p === "fort") {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        this.add(
          i % 4 === 0 ? "steel" : "sandbag",
          Math.sin(a) * 16,
          Math.cos(a) * 14 - 4,
          3.4,
          2,
        );
      }
      for (const x of [-24, 24]) this.add("rock", x, -9, 4, 6);
    } else if (p === "arrays") {
      for (const x of [-21, -12, 12, 21])
        for (const z of [-21, -9, 3]) this.add("steel", x, z, 3.5, 5);
      this.terrain.push({ x: 0, z: -6, w: 8, d: 40, kind: "ice" });
    } else if (p === "pipes") {
      for (const z of [-19, -6, 7])
        for (let x = -24; x <= 24; x += 3)
          if (z === -6 ? x > 4 || x < -14 : x < -4 || x > 14)
            this.add(R.next() < 0.35 ? "brick" : "steel", x, z);
      this.terrain.push({ x: 0, z: 1, w: 22, d: 8, kind: "ice" });
    } else {
      for (const x of [-21, 21])
        for (const z of [-18, -6, 6, 16]) this.add("steel", x, z, 4, 5);
      for (const x of [-10, 10])
        for (const z of [1, 4, 7]) this.add("brick", x, z);
      this.terrain.push({ x: -12, z: -15, w: 10, d: 12, kind: "ice" });
    }
    // 变体有成组防线、爆破链、侧翼开口和地形差异，中央主路始终保留。
    for (let i = 0; i < 15; i++) {
      const x = R.pick([-25, -20, -15, -10, 10, 15, 20, 25]),
        z = R.int(-24, 14);
      if (
        this.objects.some((o) => Math.abs(o.x - x) < 4 && Math.abs(o.z - z) < 4)
      )
        continue;
      this.add(
        R.pick(["brick", "sandbag", "barrel", "wreck"] as const),
        x,
        z,
        2.2,
        2.2,
      );
      if (i % 4 === 0) this.add("barrel", x + 2.6, z, 1.1, 1.1);
    }
    if (this.biome !== 2)
      this.terrain.push({
        x: R.pick([-23, 23]),
        z: 7,
        w: 7,
        d: 10,
        kind: "mud",
      });
  }
  /** 圆形底盘包络保证任何车体朝向均不穿墙。按轴滑动，分步避免冲刺隧穿。 */
  move(p: V2, dx: number, dz: number, radius: number) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.32));
    for (let i = 0; i < steps; i++) {
      const nx = clamp(p.x + dx / steps, -HALF + radius, HALF - radius);
      if (!this.blocked({ x: nx, z: p.z }, radius)) p.x = nx;
      const nz = clamp(p.z + dz / steps, -HALF + radius, HALF - radius);
      if (!this.blocked({ x: p.x, z: nz }, radius)) p.z = nz;
    }
  }
  blocked(p: V2, radius: number) {
    return this.objects.some(
      (o) => o.alive && o.solid && overlaps(p, radius, o),
    );
  }
  /** 所有射击遮挡统一走这里，和弹丸命中使用同一组形状。 */
  ray(a: V2, b: V2, radius = 0, ignoreId = -1) {
    let t = Infinity,
      object: Obstacle | undefined;
    for (const o of this.objects) {
      if (!o.alive || !o.blocksShot || o.id === ignoreId) continue;
      const hit = segmentRect(a, b, o, radius);
      if (hit !== null && hit < t) {
        t = hit;
        object = o;
      }
    }
    return object
      ? { object, t, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
      : null;
  }
  terrainAt(p: V2) {
    return this.terrain.find(
      (t) => Math.abs(p.x - t.x) < t.w / 2 && Math.abs(p.z - t.z) < t.d / 2,
    )?.kind;
  }
  destroy(o: Obstacle) {
    if (!o.alive) return false;
    o.alive = false;
    this.revision++;
    return true;
  }
  /** A* 网格可走性依敌车半径计算；砖墙销毁后下次查询立刻开放。 */
  path(from: V2, to: V2, radius = 1): V2[] {
    const cell = (p: V2) => ({
      x: clamp(Math.floor((p.x + HALF) / CELL), 0, GRID - 1),
      z: clamp(Math.floor((p.z + HALF) / CELL), 0, GRID - 1),
    });
    const pos = (i: number) => ({
      x: (i % GRID) * CELL - HALF + CELL / 2,
      z: Math.floor(i / GRID) * CELL - HALF + CELL / 2,
    });
    const s = cell(from),
      e = cell(to),
      start = s.z * GRID + s.x,
      end = e.z * GRID + e.x;
    const open = new Set([start]),
      closed = new Set<number>(),
      previous = new Map<number, number>();
    const g = new Map([[start, 0]]),
      f = new Map([[start, dist(pos(start), pos(end))]]);
    while (open.size) {
      let current = -1,
        best = Infinity;
      for (const i of open)
        if ((f.get(i) ?? Infinity) < best) {
          current = i;
          best = f.get(i)!;
        }
      if (current === end) {
        const result = [to];
        let at = end;
        while (at !== start) {
          result.unshift(pos(at));
          at = previous.get(at)!;
        }
        return result;
      }
      open.delete(current);
      closed.add(current);
      const cx = current % GRID,
        cz = Math.floor(current / GRID);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = cx + dx,
          z = cz + dz,
          i = z * GRID + x;
        if (x < 0 || x >= GRID || z < 0 || z >= GRID || closed.has(i)) continue;
        if (i !== end && this.blocked(pos(i), radius + 0.08)) continue;
        const score = (g.get(current) ?? Infinity) + CELL;
        if (score < (g.get(i) ?? Infinity)) {
          previous.set(i, current);
          g.set(i, score);
          f.set(i, score + dist(pos(i), pos(end)));
          open.add(i);
        }
      }
    }
    return [];
  }
}
