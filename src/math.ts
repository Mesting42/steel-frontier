/** 世界使用米和秒；地面为 x/z，渲染高度为 y。模拟只依赖二维坐标。 */
export interface V2 {
  x: number;
  z: number;
}
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
export const norm = (x: number, z: number): V2 => {
  const n = Math.hypot(x, z);
  return n > 0.0001 ? { x: x / n, z: z / n } : { x: 0, z: 0 };
};
export const angle = (a: V2, b: V2) => Math.atan2(b.x - a.x, b.z - a.z);
export function turn(a: number, b: number, t: number) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * clamp(t, 0, 1);
}
/** 可重放随机数，不使用模拟帧率作为随机种子。 */
export class RNG {
  constructor(public seed: number) {
    this.seed = seed >>> 0 || 1;
  }
  next() {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(a: number, b: number) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }
  shuffle<T>(list: readonly T[]) {
    const r = [...list];
    for (let i = r.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }
}
export interface Rect extends V2 {
  w: number;
  d: number;
}
/** 线段扫掠 AABB，返回 [0,1] 最近交点。半径通过 Minkowski 扩张处理。 */
export function segmentRect(
  a: V2,
  b: V2,
  box: Rect,
  radius = 0,
): number | null {
  let enter = 0,
    exit = 1;
  for (const axis of ["x", "z"] as const) {
    const half = (axis === "x" ? box.w : box.d) / 2 + radius;
    const delta = b[axis] - a[axis],
      lo = box[axis] - half,
      hi = box[axis] + half;
    if (Math.abs(delta) < 1e-8) {
      if (a[axis] < lo || a[axis] > hi) return null;
      continue;
    }
    let t0 = (lo - a[axis]) / delta,
      t1 = (hi - a[axis]) / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0);
    exit = Math.min(exit, t1);
    if (enter > exit) return null;
  }
  return enter;
}
/** 线段与圆的首次接触，起点在圆内时返回 0。 */
export function segmentCircle(
  a: V2,
  b: V2,
  c: V2,
  radius: number,
): number | null {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    ox = a.x - c.x,
    oz = a.z - c.z;
  const A = dx * dx + dz * dz,
    C = ox * ox + oz * oz - radius * radius;
  if (C <= 0) return 0;
  if (A < 1e-10) return null;
  const B = 2 * (ox * dx + oz * dz),
    D = B * B - 4 * A * C;
  if (D < 0) return null;
  const t = (-B - Math.sqrt(D)) / (2 * A);
  return t >= 0 && t <= 1 ? t : null;
}
export function overlaps(p: V2, r: number, b: Rect) {
  const x = clamp(p.x, b.x - b.w / 2, b.x + b.w / 2),
    z = clamp(p.z, b.z - b.d / 2, b.z + b.d / 2);
  return (p.x - x) ** 2 + (p.z - z) ** 2 < r * r;
}
