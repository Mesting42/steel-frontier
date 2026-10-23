import { Battle } from "../src/battle";
import { addPerk, chooseRoute, newRun } from "../src/campaign";
import { maxHp, maxShield } from "../src/save";
import { pilot } from "./pilot";
const run = newRun(20427),
  results = [];
for (let stage = 0; stage < 6; stage++) {
  run.stage = stage;
  chooseRoute(run, "repair");
  const b = new Battle("campaign", run, run.maps[stage]);
  let frame = 0;
  while (!b.outcome && frame < 60 * 650) {
    b.update(1 / 60, pilot(b));
    b.events.length = 0;
    frame++;
  }
  const row = {
    stage: stage + 1,
    result: b.outcome,
    seconds: Math.round(b.time),
    hp: Math.round(b.player.hp),
    base: Math.round(b.base.hp),
    kills: b.kills,
    remaining: b.remaining,
  };
  results.push(row);
  console.log(JSON.stringify(row));
  if (b.outcome !== "clear" && b.outcome !== "victory") {
    console.log(
      b.enemies
        .filter((e) => e.alive)
        .map((e) => ({ type: e.type, hp: e.hp, x: e.x, z: e.z })),
    );
    break;
  }
  b.checkpoint();
  run.credits += 80;
  // 模拟正常整备购买，不增加超出商店能力的免费属性。
  if (run.credits >= 45) {
    run.credits -= 45;
    run.hp = Math.min(maxHp(run), run.hp + 100);
  }
  if (run.credits >= 60) {
    run.credits -= 60;
    run.baseHp = Math.min(600, run.baseHp + 140);
  }
  run.shield = maxShield(run);
  run.baseShield = Math.min(100, run.baseShield + 40);
  addPerk(
    run,
    (["loader", "siphon", "plating", "battery", "focus"] as const)[stage % 5],
  );
}
console.log(
  JSON.stringify(
    { results, totalSeconds: results.reduce((s, r) => s + r.seconds, 0) },
    null,
    2,
  ),
);
if (results.at(-1)?.result !== "victory") process.exitCode = 1;
