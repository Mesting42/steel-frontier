import type { Battle, BattleInput } from "../src/battle";
import { dist, norm, segmentCircle, type V2 } from "../src/math";
/** 测试驾驶员只产生正常移动、瞄准、射击和技能输入，不改生命、敌军或胜利条件。 */
export function pilot(b: Battle): BattleInput {
  const p = b.player;
  const enemies = b.enemies.filter((e) => e.alive);
  const target = [...enemies].sort(
    (a, c) =>
      dist(a, b.base) * 0.8 +
      dist(a, p) * 0.3 -
      (a.type === "bomber" ? 8 : a.type === "engineer" ? 3 : 0) -
      (dist(c, b.base) * 0.8 +
        dist(c, p) * 0.3 -
        (c.type === "bomber" ? 8 : c.type === "engineer" ? 3 : 0)),
  )[0];
  let goal: V2 = { x: 0, z: 9 },
    aim: V2 = target ?? { x: 0, z: -25 },
    direction: V2 = { x: 0, z: 0 };
  if (target) {
    const distance = dist(p, target),
      preferred = b.world.ray(p, target, 0.5)
        ? 4
        : b.weapon.id === "arc"
          ? 10
          : b.weapon.id === "scatter"
            ? 7
            : 18;
    const n = norm(p.x - target.x, p.z - target.z);
    goal = { x: target.x + n.x * preferred, z: target.z + n.z * preferred };
    if (target.type === "boss")
      goal = {
        x: target.x > 12 ? target.x - 13 : target.x + 13,
        z: target.z - 7,
      };
    goal.x = Math.max(-26, Math.min(26, goal.x));
    goal.z = Math.max(-24, Math.min(18, goal.z));
    if (dist(p, goal) > 1.5) {
      const path = b.world.path(p, goal, p.radius);
      const next = path.find((q) => dist(q, p) > 1) ?? goal;
      direction = norm(next.x - p.x, next.z - p.z);
    }
    if (
      target.type !== "boss" &&
      distance < preferred + 4 &&
      distance > preferred - 3
    ) {
      const side = Math.sin(b.time * 0.7) > 0 ? 1 : -1;
      direction = norm(
        n.z * side * 0.7 + direction.x,
        -n.x * side * 0.7 + direction.z,
      );
    }
  } else if (dist(p, goal) > 2) {
    const path = b.world.path(p, goal, p.radius),
      next = path.find((q) => dist(q, p) > 1) ?? goal;
    direction = norm(next.x - p.x, next.z - p.z);
  }
  for (const warning of b.warnings)
    if (warning.team === "enemy" && warning.kind !== "spawn") {
      if (warning.end) {
        if (segmentCircle(warning, warning.end, p, 2.7) !== null) {
          const n = norm(warning.end.z - warning.z, warning.x - warning.end.x);
          direction = n;
        }
      } else if (dist(p, warning) < warning.radius + 2)
        direction = norm(p.x - warning.x || 1, p.z - warning.z || 1);
    }
  for (const bullet of b.bullets)
    if (bullet.team === "enemy" && dist(p, bullet) < 9) {
      const end = {
        x: bullet.x + bullet.vx * 0.4,
        z: bullet.z + bullet.vz * 0.4,
      };
      if (segmentCircle(bullet, end, p, p.radius + 0.7) !== null) {
        const side =
          (p.x - bullet.x) * bullet.vz - (p.z - bullet.z) * bullet.vx > 0
            ? 1
            : -1;
        direction = norm(bullet.vz * side, -bullet.vx * side);
      }
    }
  const incoming = b.bullets.filter(
    (v) => v.team === "enemy" && dist(v, p) < 6,
  ).length;
  return {
    move: direction,
    aim,
    firing: !!target,
    dash: incoming > 1 && b.dashCd <= 0,
    skill:
      b.skillCd <= 0 &&
      enemies.some((e) => dist(e, p) < (b.run.skill === "emp" ? 10 : 20)),
    swap: false,
  };
}
