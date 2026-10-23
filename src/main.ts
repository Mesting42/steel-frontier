import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "./style.css";
import { Battle, type BattleInput, type Mode, type Outcome } from "./battle";
import { AudioSystem } from "./audio";
import {
  addPerk,
  chooseRoute,
  newRun,
  rewardChoices,
  Transactions,
} from "./campaign";
import {
  MAPS,
  PERKS,
  SKILLS,
  WEAPONS,
  type PerkId,
  type RouteId,
  type SkillId,
  type WeaponId,
} from "./data";
import { Input } from "./input";
import { clamp, RNG } from "./math";
import { Renderer } from "./render";
import {
  clearRun,
  loadRecords,
  loadRun,
  loadSettings,
  maxHp,
  maxShield,
  write,
  type Run,
} from "./save";
import { UI, type ShopItem } from "./ui";

/** 应用状态机：菜单与整备不推进模拟；只有 playing 状态消耗固定步长。 */
type Screen =
  | "menu"
  | "routes"
  | "garage"
  | "mode"
  | "playing"
  | "paused"
  | "settings"
  | "tutorial"
  | "reward"
  | "shop"
  | "replace"
  | "event"
  | "result";
const settings = loadSettings(),
  records = loadRecords(),
  input = new Input();
let renderer: Renderer;
try {
  renderer = new Renderer(
    document.getElementById("battlefield") as HTMLCanvasElement,
    settings,
  );
} catch (error) {
  document.getElementById("app")!.innerHTML =
    '<main class="fatal"><h1>无法启动三维战场</h1><p>请在浏览器中启用硬件加速，使用支持 WebGL 2 的现代浏览器后重试。</p><button onclick="location.reload()">重新启动</button></main>';
  throw error;
}
const audio = new AudioSystem(settings),
  ui = new UI(renderer, input, settings);
let screen: Screen = "menu",
  mode: Mode = "campaign",
  battle: Battle | null = null,
  run = newRun(),
  selectedMap = 0,
  previewWeapon: WeaponId = "shell",
  initialSkill: SkillId = "emp";
let endlessOffset = 0,
  rewardCount = 1,
  rewardSalt = 0,
  shopItems: ShopItem[] = [],
  pendingPurchase: ShopItem | null = null,
  transactions = new Transactions();
let pausedReason = "",
  tutorialFromBattle = false,
  orientationPaused = false,
  frameAccumulator = 0,
  resultHandled = false,
  resultTimer = 0;
let lastFrame = performance.now(),
  hudTimer = 0;
// 仅开发服务器提供公开标注的自动输入验收；生产构建会移除这个分支。
const qaMode =
  import.meta.env.DEV && new URLSearchParams(location.search).get("qa") === "1";
let qaPilot: ((battle: Battle) => BattleInput) | null = null;
if (qaMode)
  import("../tests/pilot").then((module) => {
    qaPilot = module.pilot;
  });

function saveCheckpoint() {
  if (mode === "campaign") {
    if (!write("campaign", run))
      ui.toast("浏览器无法保存记录 · 当前战役仍可继续游玩");
  }
}
function setScreen(next: Screen) {
  screen = next;
  input.enabled = next === "playing";
  input.clear();
  frameAccumulator = 0;
  document.body.classList.toggle("in-battle", next === "playing");
}
function showMenu() {
  setScreen("menu");
  battle = null;
  renderer.showMenu();
  ui.menu(records, !!loadRun());
  audio.resume().catch(() => {});
}
function showRoutes() {
  run.checkpoint = "route";
  setScreen("routes");
  renderer.showMenu(run.weapons[run.active]);
  ui.routes(run);
  saveCheckpoint();
}
function showMode(which: Mode) {
  mode = which;
  setScreen("mode");
  renderer.showMenu();
  ui.mode(mode, selectedMap);
}
function startBattle() {
  run.checkpoint = "battle";
  saveCheckpoint();
  setScreen("playing");
  resultHandled = false;
  resultTimer = 0;
  const map = mode === "campaign" ? run.maps[run.stage] : selectedMap;
  battle = new Battle(mode, run, map, endlessOffset);
  renderer.setBattle(battle);
  ui.hud(battle);
  audio.resume().catch(() => {});
  checkOrientation();
}
function pause(reason = "") {
  if (
    !battle ||
    battle.outcome ||
    (screen !== "playing" && screen !== "paused")
  )
    return;
  pausedReason = reason;
  setScreen("paused");
  ui.pause(reason);
  audio.pause().catch(() => {});
}
function resume() {
  if (!battle || portraitTouch()) {
    checkOrientation();
    return;
  }
  setScreen("playing");
  ui.hud(battle);
  audio.resume().catch(() => {});
  orientationPaused = false;
}
function showShop() {
  run.checkpoint = "shop";
  setScreen("shop");
  renderer.showMenu(run.weapons[run.active]);
  ui.shop(run, shopItems, mode);
  saveCheckpoint();
}
function makeShop() {
  if (
    run.shopInventory &&
    run.shopStage === run.stage &&
    run.shopOffset === endlessOffset
  ) {
    shopItems = run.shopInventory;
    transactions = new Transactions();
    return;
  }
  const rng = new RNG(run.seed + run.stage * 137 + endlessOffset * 97 + 41);
  let id = 0;
  const add = (
    type: ShopItem["type"],
    key: string,
    name: string,
    desc: string,
    price: number,
  ) => ({
    id: `${run.stage}-${endlessOffset}-${id++}`,
    type,
    key,
    name,
    desc,
    price,
    bought: false,
  });
  const weapons = rng
    .shuffle(Object.values(WEAPONS).filter((w) => !run.weapons.includes(w.id)))
    .slice(0, 2);
  shopItems = weapons.map((w) => add("weapon", w.id, w.name, w.desc, w.price));
  const s = rng.pick(
    Object.keys(SKILLS).filter((s) => s !== run.skill),
  ) as SkillId;
  shopItems.push(
    add("skill", s, SKILLS[s].name, SKILLS[s].desc, SKILLS[s].price),
  );
  const p = rng.pick(PERKS.filter((p) => !run.perks.includes(p.id)));
  if (p) shopItems.push(add("perk", p.id, p.name, p.desc, 100));
  shopItems.push(
    add("repair", "", "车体维修", "立即恢复 100 点车体耐久。", 45),
    add(
      "base",
      "",
      "基地重建",
      "恢复基地 140 点耐久，并补充 40 点基地护盾。",
      60,
    ),
    add("shield", "", "护盾电池", "立即充满玩家护盾。", 35),
    add(
      "support",
      "",
      "前线炮兵",
      "下一场每 16 秒提供一次范围火力支援；限一场。",
      100,
    ),
  );
  shopItems.forEach((item) => {
    item.bought = (run.purchased ?? []).includes(item.id);
  });
  run.shopInventory = shopItems;
  run.shopStage = run.stage;
  run.shopOffset = endlessOffset;
  transactions = new Transactions();
}
function completePurchase(item: ShopItem, slot?: number) {
  const ok = transactions.apply(item.id, () => {
    if (item.bought || run.credits < item.price) return false;
    if (item.type === "weapon") {
      if (run.weapons.length < 2) run.weapons.push(item.key as WeaponId);
      else if (slot !== undefined) run.weapons[slot] = item.key as WeaponId;
      else return false;
    } else if (item.type === "skill") run.skill = item.key as SkillId;
    else if (item.type === "perk") addPerk(run, item.key as PerkId);
    else if (item.type === "repair")
      run.hp = Math.min(maxHp(run), run.hp + 100);
    else if (item.type === "base") {
      run.baseHp = Math.min(600, run.baseHp + 140);
      run.baseShield = Math.min(100, run.baseShield + 40);
    } else if (item.type === "shield") run.shield = maxShield(run);
    else if (item.type === "support") run.support = 1;
    run.credits -= item.price;
    item.bought = true;
    (run.purchased ??= []).push(item.id);
    return true;
  });
  if (ok) {
    audio.play("purchase");
    pendingPurchase = null;
    showShop();
    ui.toast(`已购入：${item.name}`);
  } else ui.toast("购买未执行 · 请检查余额或商品状态");
}
function handleOutcome(outcome: Outcome) {
  if (!battle || resultHandled) return;
  resultHandled = true;
  input.enabled = false;
  input.clear();
  const finalWave = battle.wave + endlessOffset;
  battle.checkpoint();
  run.support = 0;
  if (outcome === "clear") {
    const reward =
      run.route === "repair"
        ? 80
        : run.route === "danger"
          ? 200
          : run.route === "supply"
            ? 220
            : 130;
    run.credits += reward;
    run.shield = maxShield(run);
    if (mode === "campaign") run.stage++;
    else {
      endlessOffset += 3;
      run.stage = Math.min(10, Math.floor(endlessOffset / 3));
      records.endlessWave = Math.max(records.endlessWave, finalWave);
      records.endlessScore = Math.max(
        records.endlessScore,
        run.kills * 100 + finalWave * 250,
      );
      write("records", records);
    }
    rewardCount = run.route === "danger" ? 2 : 1;
    rewardSalt = 0;
    run.pendingRewards = rewardCount;
    run.rewardSalt = 0;
    run.checkpoint = "reward";
    setScreen("reward");
    renderer.showMenu(run.weapons[run.active]);
    ui.reward(run, rewardChoices(run), rewardCount > 1);
    audio.play("repair");
    saveCheckpoint();
  } else {
    if (mode === "campaign") clearRun();
    if (outcome === "victory") {
      records.victories++;
      if (!records.bestTime || run.elapsed < records.bestTime)
        records.bestTime = run.elapsed;
    }
    if (mode === "endless") {
      records.endlessWave = Math.max(records.endlessWave, finalWave);
      records.endlessScore = Math.max(
        records.endlessScore,
        run.kills * 100 + finalWave * 250,
      );
    }
    write("records", records);
    setScreen("result");
    renderer.showMenu(run.weapons[run.active]);
    ui.result(outcome, run, mode, finalWave, records);
    audio
      .resume()
      .then(() => audio.play(outcome === "victory" ? "victory" : "hurt"))
      .catch(() => {});
  }
}

ui.onAction = (action, element) => {
  audio.unlock().catch(() => {});
  if (!action.startsWith("setting:")) audio.play("menu");
  const [command, value] = action.split(":");
  if (command === "menu") {
    if (screen === "playing") pause();
    else showMenu();
  } else if (command === "new") {
    mode = "campaign";
    run = qaMode ? newRun(20427) : newRun();
    run.skill = initialSkill;
    endlessOffset = 0;
    showRoutes();
  } else if (command === "continue") {
    const saved = loadRun();
    if (saved) {
      mode = "campaign";
      run = saved;
      if (run.checkpoint === "battle") startBattle();
      else if (run.checkpoint === "shop") {
        makeShop();
        showShop();
      } else if (run.checkpoint === "reward" && (run.pendingRewards ?? 0) > 0) {
        rewardCount = run.pendingRewards!;
        rewardSalt = run.rewardSalt ?? 0;
        setScreen("reward");
        renderer.showMenu(run.weapons[run.active]);
        ui.reward(run, rewardChoices(run, rewardSalt), rewardCount > 1);
      } else showRoutes();
    } else {
      ui.toast("没有有效的战役检查点");
      showMenu();
    }
  } else if (command === "routes") showRoutes();
  else if (command === "route") {
    const id = value as RouteId;
    // 安全检查点中的 routeStage 防止反复返回路线界面刷取维修。
    if (run.routeStage !== run.stage) {
      chooseRoute(run, id);
      run.routeStage = run.stage;
    } else run.route = id;
    if (id === "event" && run.eventStage !== run.stage) {
      setScreen("event");
      ui.event(run);
    } else startBattle();
  } else if (command === "event") {
    if (run.eventStage === run.stage) return;
    if (value === "repair") {
      if (run.credits < 60) return;
      run.credits -= 60;
      run.hp = Math.min(maxHp(run), run.hp + 100);
      run.baseHp = Math.min(600, run.baseHp + 120);
    }
    if (value === "salvage") {
      run.credits += 90;
      run.route = "danger";
    }
    run.eventStage = run.stage;
    startBattle();
  } else if (command === "mode") {
    selectedMap = 0;
    showMode(value as Mode);
  } else if (command === "map") {
    selectedMap = clamp(Number(value), 0, 8);
    ui.mode(mode, selectedMap);
  } else if (command === "launch") {
    mode = value as Mode;
    run = newRun();
    run.skill = initialSkill;
    run.route = "repair";
    endlessOffset = 0;
    if (mode === "training") run.weapons = ["shell", "twin"];
    startBattle();
  } else if (command === "garage") {
    setScreen("garage");
    renderer.showMenu(previewWeapon);
    ui.garage(run, previewWeapon, initialSkill);
  } else if (command === "preview") {
    previewWeapon = value as WeaponId;
    renderer.showMenu(previewWeapon);
    ui.garage(run, previewWeapon, initialSkill);
  } else if (command === "garage-skill") {
    initialSkill = value as SkillId;
    ui.garage(run, previewWeapon, initialSkill);
  } else if (command === "pause") {
    if (screen === "settings" || screen === "tutorial") {
      setScreen("paused");
      ui.pause(pausedReason);
    } else pause();
  } else if (command === "resume") resume();
  else if (command === "restart") {
    if (mode === "campaign") {
      const saved = loadRun();
      if (saved) run = saved;
    } else {
      run.hp = maxHp(run);
      run.shield = maxShield(run);
      run.baseHp = 600;
      run.baseShield = 100;
    }
    startBattle();
  } else if (command === "exit") {
    showMenu();
  } else if (command === "settings") {
    const fromBattle =
      !!battle &&
      !battle.outcome &&
      ["playing", "paused", "tutorial", "settings"].includes(screen);
    if (screen === "playing") pause();
    tutorialFromBattle = fromBattle;
    setScreen("settings");
    ui.settingsPanel(settings, fromBattle);
  } else if (command === "tutorial") {
    tutorialFromBattle =
      !!battle &&
      !battle.outcome &&
      ["playing", "paused", "settings", "tutorial"].includes(screen);
    if (screen === "playing") pause();
    setScreen("tutorial");
    ui.tutorial(tutorialFromBattle);
  } else if (command === "perk" && screen === "reward") {
    const offered = rewardChoices(run, rewardSalt);
    if (!offered.some((p) => p.id === value)) return;
    addPerk(run, value as PerkId);
    rewardCount--;
    rewardSalt++;
    run.pendingRewards = rewardCount;
    run.rewardSalt = rewardSalt;
    audio.play("purchase");
    if (rewardCount > 0) {
      ui.reward(run, rewardChoices(run, rewardSalt), true);
      saveCheckpoint();
    } else {
      makeShop();
      showShop();
    }
  } else if (command === "shop") {
    pendingPurchase = null;
    showShop();
  } else if (command === "buy" && screen === "shop") {
    const item = shopItems.find((i) => i.id === value);
    if (!item || item.bought || item.price > run.credits) return;
    if (item.type === "weapon" && run.weapons.length === 2) {
      pendingPurchase = item;
      setScreen("replace");
      ui.replace(run, item.key as WeaponId);
    } else if (item.type === "skill") {
      pendingPurchase = item;
      setScreen("replace");
      ui.skillReplace(item.key as SkillId);
    } else completePurchase(item);
  } else if (command === "replace" && pendingPurchase && screen === "replace")
    completePurchase(pendingPurchase, clamp(Number(value), 0, 1));
  else if (
    command === "replace-skill" &&
    pendingPurchase &&
    screen === "replace"
  )
    completePurchase(pendingPurchase);
  else if (command === "next") {
    if (mode === "campaign") showRoutes();
    else startBattle();
  } else if (command === "dash") input.dash = true;
  else if (command === "skill") input.skill = true;
  else if (command === "swap") input.swap = true;
  else if (command === "training-fire" && battle?.mode === "training") {
    battle.trainingFire = !battle.trainingFire;
    element.textContent = `敌军开火：${battle.trainingFire ? "开" : "关"}`;
  } else if (command === "setting") {
    const el = element as HTMLInputElement;
    if (value === "trainingWeapon" && battle?.mode === "training") {
      run.weapons[run.active] = el.value as WeaponId;
      ui.updateHud(battle);
      return;
    }
    if (value === "trainingSkill" && battle?.mode === "training") {
      run.skill = el.value as SkillId;
      battle.skillCd = 0;
      ui.hud(battle);
      return;
    }
    if (value in settings) {
      const key = value as keyof typeof settings;
      const v =
        el.type === "checkbox"
          ? el.checked
          : el.type === "range"
            ? Number(el.value)
            : el.value;
      Object.assign(settings, { [key]: v });
      write("settings", settings);
      audio.volumes();
      renderer.setQuality();
      ui.applyTouchSettings();
      const output = el.parentElement?.querySelector("output");
      if (output)
        output.textContent =
          key === "stickSize" ? `${v}px` : `${Math.round(Number(v) * 100)}%`;
    }
  }
};

input.onPause = () => {
  if (screen === "playing") pause();
  else if (screen === "paused") resume();
};
window.addEventListener("blur", () => {
  if (screen === "playing") pause("窗口失去焦点，战斗与计时已停止。");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && screen === "playing")
    pause("你离开了战场，点击继续后再推进。");
});
function portraitTouch() {
  return (
    innerHeight > innerWidth &&
    (matchMedia("(pointer: coarse)").matches || settings.touch)
  );
}
function checkOrientation() {
  const old = document.getElementById("orientation-guide");
  if (portraitTouch() && battle && !battle.outcome) {
    if (screen === "playing") {
      orientationPaused = true;
      pause("设备已转为竖屏，战斗已暂停。");
    }
    if (!old) {
      const overlay = document.createElement("div");
      overlay.id = "orientation-guide";
      overlay.innerHTML =
        '<svg viewBox="0 0 100 80" aria-hidden="true"><rect x="15" y="22" width="70" height="40" rx="5" fill="none" stroke="currentColor" stroke-width="4"/><path d="M25 10h45l-8-7m8 7l-8 7" fill="none" stroke="currentColor" stroke-width="3"/></svg><h2>横过来，展开战场。</h2><p>当前战斗已暂停，请将设备转为横屏。</p>';
      document.body.append(overlay);
    }
  } else {
    old?.remove();
    if (orientationPaused && screen === "paused")
      ui.pause("已恢复横屏。点击继续战斗。");
  }
}
window.addEventListener("resize", checkOrientation);

function frame(now: number) {
  const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  const mouseAim = renderer.groundPoint(input.pointer.x, input.pointer.y);
  if (screen === "playing" && battle) {
    if (!battle.outcome) {
      frameAccumulator = Math.min(
        frameAccumulator + dt * (qaMode ? 12 : 1),
        qaMode ? 1.2 : 0.15,
      );
      // 高刷新率下不足一步的帧不能消费一次性按钮。
      if (frameAccumulator >= 1 / 60) {
        let current = input.read(battle.player, mouseAim);
        while (frameAccumulator >= 1 / 60) {
          battle.update(1 / 60, qaMode && qaPilot ? qaPilot(battle) : current);
          current = { ...current, dash: false, skill: false, swap: false };
          frameAccumulator -= 1 / 60;
        }
      }
      for (const event of battle.events.splice(0)) {
        if (event.type === "sound") audio.play(event.name, event.value);
        else if (event.type === "message") ui.toast(event.name);
        else if (event.type === "wave") ui.banner(event.name);
      }
    } else {
      resultTimer += dt;
      if (resultTimer > (battle.outcome === "victory" ? 3.2 : 1.4))
        handleOutcome(battle.outcome);
    }
    hudTimer -= dt;
    if (hudTimer <= 0) {
      ui.updateHud(battle);
      hudTimer = 0.08;
    }
  }
  renderer.render(
    screen === "playing" || renderer.menuActive ? dt : 0,
    mouseAim,
  );
  audio.update(
    dt,
    battle?.player.speed ?? 0,
    screen === "playing",
    battle?.world.biome ?? 0,
  );
  requestAnimationFrame(frame);
}
showMenu();
requestAnimationFrame(frame);

// 只暴露只读诊断快照，供验收工具检查状态；不提供跳关或直接胜利入口。
Object.defineProperty(window, "__STEEL_DIAGNOSTICS__", {
  get: () => ({
    screen,
    mode,
    stage: run.stage,
    player: battle
      ? {
          x: battle.player.x,
          z: battle.player.z,
          hp: battle.player.hp,
          shield: battle.player.shield,
          turret: battle.player.turret,
        }
      : null,
    base: battle ? { hp: battle.base.hp, shield: battle.base.shield } : null,
    qa: qaMode,
    shotsFired: battle?.shotsFired,
    wave: battle?.wave,
    map: battle?.world.mapIndex,
    enemies: battle?.enemies
      .filter((e) => e.alive)
      .map((e) => ({ id: e.id, x: e.x, z: e.z, hp: e.hp, type: e.type })),
    bullets: battle?.bullets.length,
    effects: battle?.effects.length,
    warnings: battle?.warnings.length,
    navRevision: battle?.world.revision,
    time: battle?.time,
    outcome: battle?.outcome,
    render: renderer.renderer.info.render,
    memory: renderer.renderer.info.memory,
    weapon: battle?.weapon.id,
    skill: run.skill,
    credits: run.credits,
    seed: run.seed,
    route: run.route,
  }),
});
