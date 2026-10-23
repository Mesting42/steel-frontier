/** 在浏览器中运行的集成验收台；通过真实 DOM 控件及键鼠/多指事件驱动正式页面。 */
export {};
const iframe = document.getElementById("game") as HTMLIFrameElement;
const results = document.getElementById("results")!,
  status = document.getElementById("status")!;
const backup = new Map<string, string>();
for (const key of Object.keys(localStorage))
  if (key.startsWith("steel-frontier:v1:"))
    backup.set(key, localStorage.getItem(key)!);
const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const win = () => iframe.contentWindow!;
const doc = () => iframe.contentDocument!;
type Diagnostic = {
  screen: string;
  stage: number;
  mode: string;
  player: { x: number; z: number; hp: number; shield: number };
  base: { hp: number };
  shotsFired: number;
  time: number;
  navRevision: number;
  wave: number;
  outcome: string | null;
  credits: number;
  render: { calls: number; triangles: number };
  memory: { geometries: number; textures: number };
};
const state = () =>
  (win() as unknown as { __STEEL_DIAGNOSTICS__: Diagnostic })
    .__STEEL_DIAGNOSTICS__;
function click(action: string) {
  const el = doc().querySelector<HTMLButtonElement>(
    `[data-action="${action}"]`,
  );
  if (!el) throw new Error(`控件不存在：${action}`);
  el.click();
}
function log(message: string, success = true) {
  const line = document.createElement("div");
  line.className = success ? "pass" : "fail";
  line.textContent = `${success ? "通过" : "失败"} · ${message}`;
  results.append(line);
  results.scrollTop = results.scrollHeight;
}
function assert(condition: boolean, message: string) {
  log(message, condition);
  if (!condition) throw new Error(message);
}
async function loaded() {
  for (let i = 0; i < 100; i++) {
    if (state()?.screen === "menu") return;
    await wait(100);
  }
  throw new Error("游戏加载超时");
}
function key(code: string, down: boolean) {
  const W = win() as unknown as { KeyboardEvent: typeof KeyboardEvent };
  win().dispatchEvent(
    new W.KeyboardEvent(down ? "keydown" : "keyup", {
      code,
      key: code.replace("Key", "").toLowerCase(),
      bubbles: true,
    }),
  );
}
function pointer(
  element: Element,
  type: string,
  id: number,
  x: number,
  y: number,
  pointerType = "touch",
) {
  const W = win() as unknown as { PointerEvent: typeof PointerEvent };
  element.dispatchEvent(
    new W.PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: id,
      clientX: x,
      clientY: y,
      pointerType,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      isPrimary: id === 1,
    }),
  );
}
function restore() {
  for (const key of Object.keys(localStorage))
    if (key.startsWith("steel-frontier:v1:")) localStorage.removeItem(key);
  for (const [key, value] of backup) localStorage.setItem(key, value);
  status.textContent = "验收前存档已恢复";
}
document.getElementById("restore")!.onclick = restore;

document.getElementById("smoke")!.onclick = async () => {
  results.replaceChildren();
  status.textContent = "输入检查中";
  try {
    iframe.src = "/";
    await wait(400);
    await loaded();
    click("mode:training");
    click("launch:training");
    await wait(200);
    const before = structuredClone(state());
    const canvas = doc().getElementById("battlefield")!;
    key("KeyW", true);
    pointer(canvas, "pointerdown", 1, iframe.clientWidth / 2, 100, "mouse");
    await wait(950);
    key("KeyW", false);
    pointer(canvas, "pointerup", 1, iframe.clientWidth / 2, 100, "mouse");
    let after = state();
    assert(
      Math.hypot(
        after.player.x - before.player.x,
        after.player.z - before.player.z,
      ) > 2,
      "键盘移动实际改变坦克位置",
    );
    assert(after.shotsFired > before.shotsFired, "移动时可同时持续射击");
    click("pause");
    const time = state().time;
    await wait(350);
    assert(state().time === time, "暂停冻结战斗时间");
    click("resume");
    await wait(150);
    assert(state().time > time, "继续后恢复推进");
    const options = doc().querySelector<HTMLSelectElement>("#training-weapon")!;
    for (const id of ["shell", "twin", "rail", "scatter", "missile", "arc"]) {
      options.value = id;
      options.dispatchEvent(new Event("change", { bubbles: true }));
      await wait(100);
    }
    assert(
      doc().getElementById("weapon-name")?.textContent === "电弧发生器",
      "六种武器切换接通 HUD 和模型",
    );
    const move = doc().querySelector<HTMLElement>('[data-stick="move"]')!,
      aim = doc().querySelector<HTMLElement>('[data-stick="aim"]')!;
    const r1 = move.getBoundingClientRect(),
      r2 = aim.getBoundingClientRect();
    // 桌面端允许在设置中显示摇杆；触屏与窄屏自动显示。
    if (r1.width > 0) {
      const first = structuredClone(state());
      pointer(
        move,
        "pointerdown",
        11,
        r1.x + r1.width / 2,
        r1.y + r1.height * 0.18,
      );
      pointer(
        aim,
        "pointerdown",
        12,
        r2.x + r2.width * 0.6,
        r2.y + r2.height * 0.1,
      );
      await wait(900);
      after = state();
      pointer(move, "pointerup", 11, r1.x, r1.y);
      pointer(aim, "pointerup", 12, r2.x, r2.y);
      assert(
        Math.hypot(
          after.player.x - first.player.x,
          after.player.z - first.player.z,
        ) > 1,
        "双指事件：左摇杆持续移动",
      );
      assert(
        after.shotsFired > first.shotsFired,
        "双指事件：右摇杆同时瞄准与射击",
      );
    } else log("桌面隐藏摇杆，触屏双指检查在手机与平板视口执行");
    const stats = state();
    log(
      `渲染 ${stats.render.calls} 次绘制 / ${stats.memory.geometries} 几何资源 / ${stats.memory.textures} 纹理`,
    );
    click("exit");
    click("new");
    const checkpoint = JSON.parse(
      localStorage.getItem("steel-frontier:v1:campaign")!,
    );
    assert(
      checkpoint.stage === 0 && checkpoint.hp === 220,
      "新战役保存安全部署检查点",
    );
    click("menu");
    click("continue");
    assert(
      state().screen === "routes" && state().stage === 0,
      "继续战役恢复路线整备点",
    );
    status.textContent = "输入与暂停检查全部通过";
  } catch (e) {
    log(String(e), false);
    status.textContent = "存在失败，见检查记录";
  }
};

document.getElementById("campaign")!.onclick = async () => {
  results.replaceChildren();
  status.textContent = "六战自动实战运行中";
  iframe.src = "/?qa=1";
  await wait(500);
  let previousStage = -1,
    lastWave = -1,
    purchaseDelay = 0,
    start = performance.now();
  let rewardReloaded = false,
    shopReloaded = false;
  let reloadKind: "reward" | "shop" | null = null,
    restoredCredits = 0,
    rewardSignature = "";
  try {
    await loaded();
    click("new");
    const interval = setInterval(() => {
      try {
        const s = state();
        if (!s) return;
        if (s.screen === "menu" && reloadKind) {
          click("continue");
          return;
        }
        if (reloadKind && s.screen === reloadKind) {
          assert(
            s.credits === restoredCredits,
            "刷新恢复整备余额，不重复扣款或发放",
          );
          if (reloadKind === "reward")
            assert(
              [...doc().querySelectorAll('[data-action^="perk:"]')]
                .map((e) => e.getAttribute("data-action"))
                .join(",") === rewardSignature,
              "未领取强化在刷新后保持相同选择",
            );
          else
            assert(
              doc().querySelectorAll(".shop-item.sold").length >= 2,
              "商店已购状态和库存快照在刷新后保留",
            );
          reloadKind = null;
        }
        status.textContent = `实战 ${s.stage + 1}/6 · 第 ${s.wave || 0} 波 · ${Math.round(s.time || 0)}s · 基地 ${Math.round(s.base?.hp || 0)} · 自动输入 12×`;
        if (s.screen === "routes") {
          const routes = [
            ...doc().querySelectorAll<HTMLButtonElement>(
              '[data-action^="route:"]',
            ),
          ];
          (
            routes.find((b) => b.dataset.action === "route:repair") ??
            routes.find((b) => b.dataset.action === "route:supply") ??
            routes[0]
          )?.click();
        } else if (s.screen === "event") click("event:leave");
        else if (s.screen === "reward") {
          if (!rewardReloaded) {
            rewardReloaded = true;
            reloadKind = "reward";
            restoredCredits = s.credits;
            rewardSignature = [
              ...doc().querySelectorAll('[data-action^="perk:"]'),
            ]
              .map((e) => e.getAttribute("data-action"))
              .join(",");
            iframe.src = "/?qa=1";
            return;
          }
          if (previousStage !== s.stage) {
            previousStage = s.stage;
            log(`第 ${s.stage} 战清除，进入真实奖励选择界面`);
          }
          const choices = [
            ...doc().querySelectorAll<HTMLButtonElement>(
              '[data-action^="perk:"]',
            ),
          ];
          const priority = [
            "loader",
            "siphon",
            "plating",
            "battery",
            "focus",
            "shrapnel",
            "brawler",
            "emergency",
          ];
          const preferred = priority
            .map((id) => choices.find((b) => b.dataset.action === `perk:${id}`))
            .find(Boolean);
          (preferred ?? choices[0])?.click();
          purchaseDelay = 0;
        } else if (s.screen === "shop") {
          if (purchaseDelay++ < 2) {
            const items = [
              ...doc().querySelectorAll<HTMLElement>(".shop-item"),
            ];
            const service = items.find(
              (i) =>
                i.querySelector("h3")?.textContent ===
                (purchaseDelay === 1 ? "基地重建" : "车体维修"),
            );
            const buy = service?.querySelector<HTMLButtonElement>(
              "button:not([disabled])",
            );
            buy?.click();
          } else if (!shopReloaded) {
            shopReloaded = true;
            reloadKind = "shop";
            restoredCredits = s.credits;
            iframe.src = "/?qa=1";
          } else click("next");
        } else if (s.screen === "playing" && s.wave !== lastWave) {
          lastWave = s.wave;
          log(`第 ${s.stage + 1} 战第 ${s.wave} 波，正常战斗中`);
        } else if (s.screen === "paused") click("resume");
        else if (s.screen === "result") {
          clearInterval(interval);
          const victory = doc()
            .querySelector(".result-panel h2")
            ?.textContent?.includes("屹立不倒");
          assert(!!victory, "六场真实战斗 → Boss → 胜利结算");
          log(
            `浏览器实战耗时 ${Math.round((performance.now() - start) / 1000)} 秒（12×模拟步长）；没有跳关或直接施加伤害。`,
          );
          status.textContent = victory
            ? "完整战役实战通过"
            : "战役未通关，需要检查记录";
        }
        if (performance.now() - start > 360000) {
          clearInterval(interval);
          log("战役验收超过六分钟，停止驱动", false);
        }
      } catch (e) {
        clearInterval(interval);
        log(String(e), false);
        status.textContent = "实战验收中断";
      }
    }, 150);
  } catch (e) {
    log(String(e), false);
    status.textContent = "无法启动实战验收";
  }
};
