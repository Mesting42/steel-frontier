import {
  BIOMES,
  ENEMIES,
  MAPS,
  PERKS,
  ROUTES,
  SKILLS,
  WEAPONS,
  type PerkId,
  type RouteId,
  type SkillId,
  type WeaponId,
} from "./data";
import type { Battle, Mode, Outcome } from "./battle";
import type { Records, Run, Settings } from "./save";
import { maxHp, maxShield } from "./save";
import { clamp, dist } from "./math";
import type { Renderer } from "./render";
import type { Input } from "./input";
import { World } from "./world";

/** 一套实心几何图标语言；武器商品另使用真实三维模型预览。 */
export function icon(name: string, cls = "") {
  const paths: Record<string, string> = {
    tank: '<path d="M4 12h16v7H4zM7 8h10v5H7zM11 4h3v6h-3zM2 13h3v7H2zM19 13h3v7h-3z"/>',
    shell:
      '<path d="M9 19V8l3-5 3 5v11zM8 19h8v3H8zM3 11l3 1-1 3-3-2zM19 11l3-1v3l-3 2z"/>',
    twin: '<path d="M5 5h4v12H5zM15 5h4v12h-4zM4 17h16v4H4zM6 2h2v3H6zM16 2h2v3h-2z"/>',
    rail: '<path d="M5 4h4v16H5zM15 4h4v16h-4zM9 8h6v2H9zM9 14h6v2H9zM10 1h4v4h-4zM4 20h16v3H4z"/>',
    scatter:
      '<path d="M4 14h16v6H4zM7 9h10v5H7zM3 2l4 6-2 1-4-6zM11 1h2v7h-2zM21 2l2 1-4 6-2-1z"/>',
    missile:
      '<path d="M8 2l3 5v11H5V7zM17 4l3 5v11h-6V9zM4 18h8v4H4zM13 20h8v2h-8z"/>',
    arc: '<path d="M13 1L4 14h7l-1 9 10-14h-7z"/>',
    shield:
      '<path d="M12 2l9 4v6c-1 5-5 9-9 11C8 21 4 17 3 12V6zM12 6v12c3-2 5-5 5-8V8z"/>',
    base: '<path d="M3 12l9-8 9 8v9H3zM10 14v7h4v-7zM11 1h2v5h-2z"/>',
    repair: '<path d="M8 3a6 6 0 007 8l7 7-4 4-7-7a6 6 0 01-8-7l4 4 4-4z"/>',
    dash: '<path d="M10 3l10 9-10 9v-6H3V9h7z"/>',
    target:
      '<path fill-rule="evenodd" d="M11 1h2v3a8 8 0 017 7h3v2h-3a8 8 0 01-7 7v3h-2v-3a8 8 0 01-7-7H1v-2h3a8 8 0 017-7zm1 6a5 5 0 100 10 5 5 0 000-10zm0 3a2 2 0 110 4 2 2 0 010-4z"/>',
    pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
    play: '<path d="M7 3l15 9-15 9z"/>',
    settings:
      '<path fill-rule="evenodd" d="M9 2h6l1 3 3 1 3 5v3l-3 4-3 1-1 3H9l-1-3-3-1-3-4v-3l3-5 3-1zm3 6a4 4 0 100 8 4 4 0 000-8z"/>',
    smoke:
      '<path d="M6 9a4 4 0 017-5 5 5 0 016 7 4 4 0 01-1 8H6a5 5 0 010-10z"/>',
    emp: '<path d="M12 2L4 13h6l-1 9 11-13h-7z"/>',
    drone:
      '<path d="M3 3h5v3H3zM16 3h5v3h-5zM3 18h5v3H3zM16 18h5v3h-5zM6 6l3 3h6l3-3v3l-3 3 3 3v3l-3-3H9l-3 3v-3l3-3-3-3z"/>',
    strike: '<path d="M12 2l3 6 7 4-7 2-1 7-2-3-2 3-1-7-7-2 7-4z"/>',
    coin: '<path fill-rule="evenodd" d="M12 2l9 5v10l-9 5-9-5V7zm-1 4v3H8v2h5v2H8v2h3v3h2v-3h3V9h-3V6z"/>',
    back: '<path d="M12 3L3 12l9 9v-6h9V9h-9z"/>',
    flag: '<path d="M4 2h2v20H4zM7 3h14l-4 5 4 5H7z"/>',
    audio:
      '<path d="M3 9h4l6-6v18l-6-6H3zM16 7v3a3 3 0 010 4v3a6 6 0 000-10zM19 3v3a9 9 0 010 12v3a12 12 0 000-18z"/>',
  };
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.tank}</svg>`;
}
export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
const button = (label: string, action: string, kind = "", extra = "") =>
  `<button class="btn ${kind}" data-action="${action}" ${extra}>${label}</button>`;
import type { ShopItem } from "./data";
export type { ShopItem } from "./data";

export class UI {
  root: HTMLElement;
  onAction: (action: string, element: HTMLElement) => void = () => {};
  private lastToast = "";
  private toastTimer = 0;
  private labels = new Map<number, HTMLElement>();
  private minimap: HTMLCanvasElement | null = null;
  constructor(
    public renderer: Renderer,
    public input: Input,
    public settings: Settings,
  ) {
    this.root = document.getElementById("app")!;
    this.root.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-action]",
      );
      if (el && !el.hasAttribute("disabled") && !el.dataset.touch)
        this.onAction(el.dataset.action!, el);
    });
    this.root.addEventListener("change", (e) => {
      const el = e.target as HTMLElement;
      if (el.dataset.setting)
        this.onAction(`setting:${el.dataset.setting}`, el);
    });
  }
  show(html: string, name = "") {
    this.root.className = name;
    this.root.innerHTML = html;
    this.labels.clear();
    this.minimap = null;
    this.input.clear();
    this.applyTouchSettings();
  }
  header(back = "menu", title = "") {
    return `<header class="topbar"><button class="brand" data-action="${back}" aria-label="返回主菜单"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2L4 9v16l16 13 16-13V9z" fill="currentColor"/><path d="M11 22h18v5H11zm4-8h10v8H15zm4-6h3v8h-3z" fill="#23342e"/></svg><span>钢铁防线<small>STEEL FRONTIER</small></span></button>${title ? `<span class="header-title">${title}</span>` : '<span class="header-title">单人战术行动</span>'}<button class="icon-btn" data-action="settings" aria-label="设置">${icon("settings")}</button></header>`;
  }
  menu(records: Records, canContinue: boolean) {
    this.show(
      `${this.header()}<main class="menu-content"><h1>钢铁<br><span>防线</span><b>STEEL FRONTIER</b></h1><p class="menu-desc">引擎轰鸣，防线未破。<br>驾驶你的坦克，守住最后的指挥部。</p><div class="menu-actions">${button(`${icon("play")}开始战役<span class="arrow">→</span>`, "new", "primary")}${canContinue ? button('继续战役<span class="arrow">→</span>', "continue") : ""}<div class="mode-links">${button("无尽防守", "mode:endless")}${button("训练场", "mode:training")}</div></div><button class="text-btn garage-link" data-action="garage">${icon("tank")}进入车库 · 查看装备<span>→</span></button></main><aside class="menu-annotation"><span class="model-line"></span><strong>先驱者 / M-40</strong><p>独立炮塔 · 复合装甲 · 履带驱动</p></aside><footer class="menu-footer"><span>原创单人战役 · 离线可玩</span><div>${button("操作指南", "tutorial", "text-btn")}${button("设置", "settings", "text-btn")}<span class="local-record">本地最高波次 <b>${records.endlessWave.toString().padStart(2, "0")}</b></span></div><span class="version">v1.0</span></footer>`,
      "screen menu-screen",
    );
  }
  mode(mode: Mode, selected = 0) {
    this.show(
      `${this.header("menu", mode === "endless" ? "无尽防守" : "训练场")}<main class="wide-panel"><h2>${mode === "endless" ? "选择你的防线" : "先让履带热起来"}</h2><p class="lead">${mode === "endless" ? "每三波进入整备。守住指挥部，刷新你的本地纪录。" : "全部武器与技能开放试用，维修站免费使用。可切换训练敌军开火。"}</p><div class="map-picker">${MAPS.map((m, i) => `<button data-action="map:${i}" class="map-choice ${i === selected ? "selected" : ""}">${this.mapPreview(i, 413 + i)}<span><small>${BIOMES[m.biome].name}</small><strong>${m.name}</strong><em>${m.desc}</em></span></button>`).join("")}</div><div class="panel-bottom">${button(`${icon("back")}返回`, "menu")}${button(`${icon("play")}进入${mode === "endless" ? "防守" : "训练"}`, `launch:${mode}`, "primary")}</div></main>`,
      "screen panel-screen",
    );
  }
  routes(run: Run) {
    const routeIndices = this.routeIds(run);
    this.show(
      `${this.header("menu", "战役路线")}<main class="wide-panel route-panel"><div class="panel-heading"><div><h2>${BIOMES[Math.floor(run.stage / 2)].name}</h2><p class="lead">${BIOMES[Math.floor(run.stage / 2)].subtitle}</p></div><div class="funds">${icon("coin")}<b>${run.credits}</b><span>补给</span></div></div><ol class="campaign-track">${run.maps.map((m, i) => `<li class="${i < run.stage ? "complete" : i === run.stage ? "current" : ""}"><span>${i < run.stage ? "✓" : i + 1}</span><strong>${i === 5 ? "攻城核心" : MAPS[m].name}</strong><small>${i < run.stage ? "已控制" : i === run.stage ? "选择进军路线" : BIOMES[MAPS[m].biome].name}</small></li>`).join("")}</ol><div class="route-layout"><div class="route-map">${this.mapPreview(run.maps[run.stage], run.seed + run.stage * 991)}<div><strong>${MAPS[run.maps[run.stage]].name}</strong><span>${MAPS[run.maps[run.stage]].desc}</span></div></div><div class="route-options"><h3>下一场，如何突破？</h3>${routeIndices
        .map((id) => {
          const r = ROUTES.find((r) => r.id === id)!;
          return `<button class="route-option" data-action="route:${r.id}"><span class="route-symbol" style="color:${r.color}">${icon(r.id === "repair" ? "repair" : r.id === "danger" ? "target" : r.id === "event" ? "flag" : "coin")}</span><span><strong>${r.name}</strong><p>${r.desc}</p></span><b>→</b></button>`;
        })
        .join(
          "",
        )}<p class="route-status">车体 ${Math.ceil(run.hp)}/${maxHp(run)} · 基地 ${Math.ceil(run.baseHp)}/600 · ${run.weapons.map((w) => WEAPONS[w].name).join(" / ")}</p></div></div></main>`,
      "screen panel-screen",
    );
  }
  routeIds(run: Run): RouteId[] {
    const index = (run.seed + run.stage * 17) % 4;
    return [ROUTES[index].id, ROUTES[(index + 1 + (run.stage % 2)) % 4].id];
  }
  reward(
    run: Run,
    options: readonly {
      id: PerkId;
      name: string;
      desc: string;
      icon: string;
    }[],
    bonus = false,
  ) {
    this.show(
      `${this.header("menu", "战后强化")}<main class="wide-panel reward-panel"><div class="panel-heading"><div><h2>${bonus ? "精英战利品" : "防线稳住了"}</h2><p class="lead">${bonus ? "危险路线的额外奖励，再选择一项强化。" : "选择一项强化，将它带入下一场战斗。"}</p></div><div class="funds">${icon("coin")}<b>${run.credits}</b></div></div><div class="reward-options">${options.map((p) => `<button class="reward-option" data-action="perk:${p.id}"><div class="perk-emblem">${icon(p.icon)}</div><h3>${p.name}</h3><p>${p.desc}</p><span>装配强化 ${icon("dash")}</span></button>`).join("")}</div><p class="fine-print">当前构筑：${run.perks.length ? run.perks.map((id) => PERKS.find((p) => p.id === id)?.name).join(" / ") : "基础制式装备"}</p></main>`,
      "screen panel-screen",
    );
  }
  shop(run: Run, items: ShopItem[], mode: Mode) {
    this.show(
      `${this.header("menu", "前线整备")}<main class="wide-panel shop-panel"><div class="panel-heading"><div><h2>补给到位，准备再出发。</h2><p class="lead">装备最多携带两种主炮。购买新装备时会明确确认替换位置。</p></div><div class="funds">${icon("coin")}<b>${run.credits}</b><span>补给</span></div></div><div class="shop-layout"><aside class="loadout-summary"><h3>当前装备</h3>${run.weapons.map((w, i) => `<div class="equipped"><img src="${this.renderer.preview(w)}" alt="${WEAPONS[w].name}实际模型"><span><small>主武器 ${i + 1}</small><strong>${WEAPONS[w].name}</strong></span></div>`).join("")}<div class="equipped-skill">${icon(run.skill)}<span>${SKILLS[run.skill].name}</span></div><div class="service-status"><p>车体 <b>${Math.ceil(run.hp)} / ${maxHp(run)}</b></p><p>护盾 <b>${Math.ceil(run.shield)} / ${maxShield(run)}</b></p><p>基地 <b>${Math.ceil(run.baseHp)} / 600</b></p></div></aside><div class="shop-items">${items.map((item) => `<article class="shop-item ${item.bought ? "sold" : ""}">${item.type === "weapon" ? `<img src="${this.renderer.preview(item.key as WeaponId)}" alt="${item.name}实际装备模型">` : `<div class="shop-icon">${icon(item.type === "skill" ? item.key : item.type === "perk" ? PERKS.find((p) => p.id === item.key)?.icon || "tank" : item.type)}</div>`}<div class="item-copy"><h3>${item.name}</h3><p>${item.desc}</p></div>${button(item.bought ? "已购入" : `${icon("coin")}${item.price}`, `buy:${item.id}`, item.bought ? "" : "buy-btn", item.bought || item.price > run.credits ? "disabled" : "")}</article>`).join("")}</div></div><div class="panel-bottom"><p class="fine-print">${mode === "campaign" ? "整备检查点会自动保存，退出后可以继续战役。" : "下一轮敌军将加强。最高波次仅记录在本机。"}</p>${button(`${mode === "campaign" ? "选择下一条路线" : "开始下一轮防守"} ${icon("dash")}`, "next", "primary")}</div></main>`,
      "screen panel-screen",
    );
  }
  replace(run: Run, weapon: WeaponId) {
    this.show(
      `${this.header("shop", "替换主武器")}<main class="wide-panel replace-panel"><h2>为新主炮腾出一个位置</h2><p class="lead">确认替换后才扣除补给。取消购买不会消耗资源。</p><div class="replace-new"><img src="${this.renderer.preview(weapon)}" alt="新武器模型"><div><small>准备购入</small><h3>${WEAPONS[weapon].name}</h3><p>${WEAPONS[weapon].desc}</p></div></div><div class="replace-options">${run.weapons.map((w, i) => `<button data-action="replace:${i}"><img src="${this.renderer.preview(w)}" alt="${WEAPONS[w].name}模型"><span><strong>替换 ${WEAPONS[w].name}</strong><small>${WEAPONS[w].desc}</small></span></button>`).join("")}</div>${button("取消购买", "shop")}</main>`,
      "screen panel-screen",
    );
  }
  skillReplace(skill: SkillId) {
    this.show(
      `${this.header("shop", "替换主动技能")}<main class="dialog-panel"><div class="perk-emblem">${icon(skill)}</div><h2>装配${SKILLS[skill].name}？</h2><p>${SKILLS[skill].desc}</p><p class="fine-print">将替换当前主动技能，确认后扣除补给。</p><div class="dialog-actions">${button("取消", "shop")}${button("确认装配", "replace-skill", "primary")}</div></main>`,
      "screen panel-screen",
    );
  }
  event(run: Run) {
    this.show(
      `${this.header("routes", "失联信标")}<main class="dialog-panel event-panel"><div class="perk-emblem">${icon("flag")}</div><h2>断电的维修前哨</h2><p>你找到一座被遗弃的维修站。备用电池还能启动一次设备，但远处的敌军已经捕捉到了信号。</p><div class="event-options">${button("投入 60 补给 · 修复车体 100、基地 120", "event:repair", "", run.credits < 60 ? "disabled" : "")}${button("回收电池 · 获得 90 补给，下一战出现精英", "event:salvage")}${button("保持静默 · 直接进入战场", "event:leave", "primary")}</div></main>`,
      "screen panel-screen",
    );
  }
  garage(run: Run, selected: WeaponId, initialSkill: SkillId) {
    const w = WEAPONS[selected];
    this.show(
      `${this.header("menu", "车库与装备")}<main class="garage-panel"><h2>先驱者</h2><p class="lead">自由驾驶底盘 / 独立旋转炮塔</p><div class="weapon-tabs">${Object.values(
        WEAPONS,
      )
        .map(
          (w) =>
            `<button class="${selected === w.id ? "active" : ""}" data-action="preview:${w.id}" aria-label="预览${w.name}">${icon(w.id)}<span>${w.name.replace(/M-40 |穿甲|蜂群|发生器/g, "")}</span></button>`,
        )
        .join(
          "",
        )}</div><div class="weapon-details"><h3>${w.name}</h3><p>${w.desc}</p><dl><div><dt>单发伤害</dt><dd>${w.damage}${w.id === "scatter" ? " × 7" : ""}</dd></div><div><dt>射击间隔</dt><dd>${w.interval.toFixed(2)} s</dd></div><div><dt>有效射程</dt><dd>${w.range} m</dd></div></dl></div><h3>出击技能</h3><div class="skill-picker">${Object.entries(
        SKILLS,
      )
        .map(
          ([id, s]) =>
            `<button title="${s.desc}" class="${initialSkill === id ? "active" : ""}" data-action="garage-skill:${id}">${icon(id)}${s.name}</button>`,
        )
        .join(
          "",
        )}</div><p class="fine-print">${SKILLS[initialSkill].desc}<br>战役以 M-40 榴弹炮出击，其余主炮通过商店获得。</p>${button("返回指挥部", "menu")}<p class="fine-print">当前战役强化 ${run.perks.length} 项 · 装备上限 2 主炮 / 1 技能</p></main>`,
      "screen garage-screen",
    );
  }
  settingsPanel(s: Settings, fromBattle: boolean) {
    this.show(
      `${this.header(fromBattle ? "pause" : "menu", "设置")}<main class="settings-panel"><h2>调整作战设备</h2><div class="settings-row"><label for="music">音乐音量</label><input id="music" type="range" min="0" max="1" step="0.05" value="${s.music}" data-setting="music"><output>${Math.round(s.music * 100)}%</output></div><div class="settings-row"><label for="effects">音效音量</label><input id="effects" type="range" min="0" max="1" step="0.05" value="${s.effects}" data-setting="effects"><output>${Math.round(s.effects * 100)}%</output></div><div class="settings-row"><label for="quality">图形质量</label><select id="quality" data-setting="quality"><option value="high" ${s.quality === "high" ? "selected" : ""}>高 · 阴影与高分辨率</option><option value="medium" ${s.quality === "medium" ? "selected" : ""}>流畅 · 降低渲染负载</option></select></div><div class="settings-row"><label for="shake">受击镜头震动</label><input id="shake" type="checkbox" data-setting="shake" ${s.shake ? "checked" : ""}></div><div class="settings-row"><label for="touch">始终显示触屏操作</label><input id="touch" type="checkbox" data-setting="touch" ${s.touch ? "checked" : ""}></div><div class="settings-row"><label for="stickSize">摇杆大小</label><input id="stickSize" type="range" min="80" max="150" step="5" value="${s.stickSize}" data-setting="stickSize"><output>${s.stickSize}px</output></div><div class="settings-row"><label for="stickOpacity">摇杆透明度</label><input id="stickOpacity" type="range" min="0.2" max="1" step="0.05" value="${s.stickOpacity}" data-setting="stickOpacity"><output>${Math.round(s.stickOpacity * 100)}%</output></div><p class="fine-print">图形调整立即生效。浏览器切后台会自动暂停；战斗计时与声音同步停止。</p><div class="panel-bottom">${button("操作指南", "tutorial")}${button(fromBattle ? "返回暂停菜单" : "完成设置", fromBattle ? "pause" : "menu", "primary")}</div></main>`,
      "screen panel-screen",
    );
  }
  tutorial(fromBattle: boolean) {
    this.show(
      `${this.header(fromBattle ? "pause" : "menu", "操作指南")}<main class="wide-panel tutorial-panel"><h2>驾驶、瞄准，守住指挥部。</h2><div class="tutorial-columns"><section><h3>键鼠操作</h3><dl class="controls-list"><div><dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>自由移动，车体自动朝行驶方向转动</dd></div><div><dt>鼠标 / 左键</dt><dd>独立瞄准 / 按住持续射击</dd></div><div><dt><kbd>Space</kbd></dt><dd>短程冲刺，冷却 4.5 秒，不能穿墙</dd></div><div><dt><kbd>E</kbd></dt><dd>主动技能；维修站附近优先交互</dd></div><div><dt><kbd>Q</kbd> / <kbd>Esc</kbd></dt><dd>切换主武器 / 暂停</dd></div></dl></section><section><h3>触屏操作</h3><p>左摇杆驾驶，右摇杆瞄准并持续射击。两个摇杆可以同时使用。独立按钮释放技能、冲刺和切换主炮。</p><h3>战场规则</h3><p>护盾先吸收伤害，脱离火力 5 秒后恢复。砖墙、沙袋和废弃车辆可摧毁，钢墙与岩体阻挡弹药。水渠不可通行，泥地减速，冰面略有滑动。</p><p>玩家普通攻击与环境爆炸不伤己方基地。敌方炮火和爆破车会伤害基地；基地固定装甲吸收 45% 伤害。炮口受阻时先破坏可摧毁掩体，或移动打开射界。</p><h3>胜利目标</h3><p>清除六场战斗，在冻原击败“堡垒”攻城指挥车。玩家或基地耐久归零则战役失败。整备点与战斗起点自动保存。</p></section></div>${button(fromBattle ? "返回暂停菜单" : "返回指挥部", fromBattle ? "pause" : "menu", "primary")}</main>`,
      "screen panel-screen",
    );
  }
  pause(reason: string) {
    this.show(
      `<main class="dialog-panel pause-panel"><div class="perk-emblem">${icon("pause")}</div><h2>战场已暂停</h2><p>${reason || "调整呼吸，下一次推进由你决定。"}</p><div class="pause-actions">${button(`${icon("play")}继续战斗`, "resume", "primary")}${button("设置", "settings")}${button("操作指南", "tutorial")}${button("从本战起点重新部署", "restart")}${button("返回指挥部", "exit")}</div><p class="fine-print">返回指挥部保留战役安全检查点。</p></main>`,
      "screen pause-screen",
    );
  }
  result(
    outcome: Outcome,
    run: Run,
    mode: Mode,
    wave: number,
    records: Records,
  ) {
    const victory = outcome === "victory";
    this.show(
      `${this.header("menu", "行动结算")}<main class="result-panel"><div class="result-seal">${icon(victory ? "flag" : outcome === "base" ? "base" : "tank")}</div><h2>${victory ? "防线，屹立不倒。" : outcome === "base" ? "指挥部已失守" : "先驱者失去响应"}</h2><p class="lead">${victory ? "攻城指挥车已被摧毁，三个战区重新连成一道防线。" : outcome === "base" ? "基地耐久耗尽。下一次部署，留意侧翼与突击爆破车。" : "车体耐久耗尽。利用掩体与冲刺，等待护盾恢复再推进。"}</p><div class="result-stats"><div><strong>${run.kills}</strong><span>击毁敌军</span></div><div><strong>${formatTime(run.elapsed)}</strong><span>行动用时</span></div><div><strong>${mode === "endless" ? wave : Math.min(6, run.stage + (victory ? 1 : 0))}</strong><span>${mode === "endless" ? "抵达波次" : "完成战场"}</span></div><div><strong>${run.perks.length}</strong><span>装配强化</span></div></div><p class="fine-print">${mode === "endless" ? `本地最高波次 ${records.endlessWave} · 最佳成绩 ${records.endlessScore}` : `本地战役胜利 ${records.victories} 次`}</p><div class="dialog-actions">${button("返回指挥部", "menu")}${button(mode === "endless" ? "再次防守" : "新战役", mode === "endless" ? "mode:endless" : "new", "primary")}</div></main>`,
      "screen panel-screen",
    );
  }
  hud(b: Battle) {
    this.show(
      `<div class="hud-top"><div class="player-panel"><span class="unit-label">${icon("tank")}先驱者</span><div class="meter health"><i id="hp-fill"></i></div><div class="meter shield"><i id="shield-fill"></i></div><div class="meter-numbers"><span id="hp-value"></span><span id="shield-value"></span></div></div><div class="base-panel"><span class="unit-label">${icon("base")}指挥基地 <strong id="base-value"></strong></span><div class="meter health"><i id="base-fill"></i></div><span id="base-shield"></span></div><div class="wave-panel"><strong id="wave-value"></strong><span id="enemy-value"></span></div><button class="icon-btn hud-pause" data-action="pause" aria-label="暂停">${icon("pause")}</button></div><div id="battle-banner" role="status"></div><div id="actor-labels" aria-hidden="true"></div><div class="hud-bottom"><div class="weapon-panel"><span class="weapon-icon" id="weapon-icon"></span><div><small id="weapon-role"></small><strong id="weapon-name"></strong><span id="weapon-state"></span></div><button data-action="swap" class="swap-button" aria-label="切换武器"><kbd>Q</kbd> 换炮</button></div><div class="cooldowns"><button class="cooldown" data-touch="dash" data-action="dash"><span>${icon("dash")}<b id="dash-value">就绪</b></span><small>冲刺 <kbd>Space</kbd></small><i id="dash-fill"></i></button><button class="cooldown" data-touch="skill" data-action="skill"><span>${icon(b.run.skill)}<b id="skill-value">就绪</b></span><small>${SKILLS[b.run.skill].name} <kbd>E</kbd></small><i id="skill-fill"></i></button></div><div class="hud-map"><canvas id="minimap" width="152" height="152" aria-label="战场小地图"></canvas><span id="credits-value"></span></div></div><div id="station-hint"></div><div id="aim-reticle"><i></i><i></i><i></i><i></i></div><div class="touch-controls"><div class="stick move-stick" data-stick="move" aria-label="移动摇杆"><i></i><span>驾驶</span></div><div class="stick aim-stick" data-stick="aim" aria-label="瞄准射击摇杆"><i></i><span>瞄准 / 开火</span></div><button class="touch-swap" data-touch="swap" aria-label="切换主炮">${icon("twin")}</button></div>${
        b.mode === "training"
          ? `<div class="training-toolbar"><span>训练场</span><select id="training-weapon" data-setting="trainingWeapon" aria-label="训练武器">${Object.values(
              WEAPONS,
            )
              .map(
                (w) =>
                  `<option value="${w.id}" ${b.weapon.id === w.id ? "selected" : ""}>${w.name}</option>`,
              )
              .join(
                "",
              )}</select><select data-setting="trainingSkill" aria-label="训练技能">${Object.entries(
              SKILLS,
            )
              .map(
                ([id, s]) =>
                  `<option value="${id}" ${b.run.skill === id ? "selected" : ""}>${s.name}</option>`,
              )
              .join(
                "",
              )}</select><button data-action="training-fire" id="training-fire">敌军开火：关</button><button data-action="exit">退出</button></div>`
          : ""
      }`,
      "battle-ui",
    );
    this.input.bindTouch(this.root);
    this.minimap = this.root.querySelector("#minimap");
    this.updateHud(b);
  }
  applyTouchSettings() {
    document.documentElement.style.setProperty(
      "--stick-size",
      `${this.settings.stickSize}px`,
    );
    document.documentElement.style.setProperty(
      "--stick-opacity",
      `${this.settings.stickOpacity}`,
    );
    document.body.classList.toggle("force-touch", this.settings.touch);
  }
  private text(id: string, text: string) {
    const el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
  }
  private fill(id: string, value: number) {
    const el = document.getElementById(id);
    if (el) el.style.width = `${clamp(value, 0, 1) * 100}%`;
  }
  updateHud(b: Battle) {
    const p = b.player,
      w = b.weapon;
    this.text("hp-value", `耐久 ${Math.ceil(p.hp)} / ${p.maxHp}`);
    this.text(
      "shield-value",
      `护盾 ${Math.ceil(p.shield)} / ${maxShield(b.run)}`,
    );
    this.fill("hp-fill", p.hp / p.maxHp);
    this.fill("shield-fill", p.shield / maxShield(b.run));
    this.text("base-value", `${Math.ceil(b.base.hp)} / 600`);
    this.fill("base-fill", b.base.hp / 600);
    this.text("base-shield", `基地护盾 ${Math.ceil(b.base.shield)}`);
    document
      .querySelector(".base-panel")
      ?.classList.toggle("critical", b.base.hp < 180);
    this.text(
      "wave-value",
      b.mode === "training"
        ? "武器试验"
        : `第 ${b.wave + b.endlessOffset} ${b.mode === "endless" ? "" : "/ 3"} 波`,
    );
    this.text(
      "enemy-value",
      b.mode === "training"
        ? "试验区安全补给"
        : b.waveActive
          ? `剩余威胁 ${b.remaining}`
          : `${Math.max(0, Math.ceil(b.waveTimer))} 秒后进攻`,
    );
    const wIcon = document.getElementById("weapon-icon");
    if (wIcon?.dataset.weapon !== w.id && wIcon) {
      wIcon.innerHTML = icon(w.id);
      wIcon.dataset.weapon = w.id;
    }
    this.text("weapon-name", w.name);
    this.text(
      "weapon-role",
      `${b.run.active + 1} / ${b.run.weapons.length} · ${w.role}`,
    );
    this.text(
      "weapon-state",
      p.fire > 0.15
        ? `炮组恢复 ${Math.ceil(p.fire * 100) / 100}s`
        : "无限弹药 · 就绪",
    );
    this.text("dash-value", b.dashCd > 0 ? `${b.dashCd.toFixed(1)}s` : "就绪");
    this.text(
      "skill-value",
      b.skillCd > 0 ? `${b.skillCd.toFixed(1)}s` : "就绪",
    );
    this.fill("dash-fill", 1 - b.dashCd / 4.5);
    this.fill("skill-fill", 1 - b.skillCd / SKILLS[b.run.skill].cooldown);
    this.text("credits-value", `${b.run.credits + b.credits} 补给`);
    this.text(
      "station-hint",
      dist(p, b.station) < 3.2
        ? b.mode === "training"
          ? "E / 技能按钮 · 免费维修补给"
          : b.stationUses >= 3
            ? "维修站已耗尽"
            : `E / 技能按钮 · 维修 40 补给（剩余 ${3 - b.stationUses} 次）`
        : "",
    );
    const aim = document.getElementById("aim-reticle");
    if (aim) {
      aim.style.left = `${this.input.pointer.x}px`;
      aim.style.top = `${this.input.pointer.y}px`;
    }
    this.updateLabels(b);
    this.drawMinimap(b);
  }
  private updateLabels(b: Battle) {
    const root = document.getElementById("actor-labels");
    if (!root) return;
    const ids = new Set<number>();
    for (const e of b.enemies) {
      if (!e.alive) continue;
      ids.add(e.id);
      let el = this.labels.get(e.id);
      if (!el) {
        el = document.createElement("div");
        el.className = `enemy-label ${e.type === "boss" ? "boss-label" : ""}`;
        el.innerHTML = `<span>${e.elite ? "精英 · " : ""}${ENEMIES[e.type as keyof typeof ENEMIES].name}</span><div><i></i></div>`;
        root.append(el);
        this.labels.set(e.id, el);
      }
      const pos = this.renderer.project(e, e.type === "boss" ? 4 : 2.1);
      el.style.display = pos.visible ? "" : "none";
      el.style.transform = `translate(${pos.x}px,${pos.y}px) translate(-50%,-100%)`;
      el.querySelector<HTMLElement>("i")!.style.width =
        `${(e.hp / e.maxHp) * 100}%`;
    }
    for (const [id, el] of this.labels)
      if (!ids.has(id)) {
        el.remove();
        this.labels.delete(id);
      }
  }
  private drawMinimap(b: Battle) {
    const c = this.minimap?.getContext("2d");
    if (!c) return;
    c.clearRect(0, 0, 152, 152);
    c.fillStyle = "#23352d";
    c.fillRect(0, 0, 152, 152);
    const scale = 152 / 63,
      xy = (n: number) => (n + 31.5) * scale;
    for (const o of b.world.objects) {
      if (!o.alive) continue;
      c.fillStyle =
        o.kind === "water"
          ? "#658b95"
          : o.kind === "brick"
            ? "#a48c6c"
            : "#6d8173";
      c.fillRect(
        xy(o.x - o.w / 2),
        xy(o.z - o.d / 2),
        o.w * scale,
        o.d * scale,
      );
    }
    c.fillStyle = "#a9d3ba";
    c.fillRect(xy(b.base.x) - 4, xy(b.base.z) - 4, 8, 8);
    for (const w of b.warnings.filter((w) => w.kind === "spawn")) {
      c.strokeStyle = "#eec17a";
      c.beginPath();
      c.arc(xy(w.x), xy(w.z), 4 + Math.sin(b.time * 8), 0, Math.PI * 2);
      c.stroke();
    }
    for (const e of b.enemies)
      if (e.alive) {
        c.fillStyle = e.type === "boss" ? "#efc075" : "#e69c83";
        c.beginPath();
        c.arc(xy(e.x), xy(e.z), e.type === "boss" ? 4 : 2, 0, Math.PI * 2);
        c.fill();
      }
    c.save();
    c.translate(xy(b.player.x), xy(b.player.z));
    c.rotate(-b.player.turret);
    c.fillStyle = "#e7efdd";
    c.beginPath();
    c.moveTo(0, 5);
    c.lineTo(-3, -3);
    c.lineTo(3, -3);
    c.closePath();
    c.fill();
    c.restore();
  }
  banner(text: string) {
    const el = document.getElementById("battle-banner");
    if (!el) {
      this.toast(text);
      return;
    }
    el.textContent = text;
    el.classList.add("visible");
    window.setTimeout(() => el.classList.remove("visible"), 5500);
  }
  toast(text: string) {
    if (text === this.lastToast && this.toastTimer > performance.now()) return;
    this.lastToast = text;
    this.toastTimer = performance.now() + 3000;
    const el = document.getElementById("toast")!;
    el.textContent = text;
    el.classList.add("visible");
    setTimeout(() => {
      if (performance.now() >= this.toastTimer) el.classList.remove("visible");
    }, 3100);
  }
  private mapPreview(index: number, seed: number) {
    const world = new World(seed, index);
    return `<svg viewBox="0 0 210 210" class="map-preview" role="img" aria-label="${MAPS[index].name}实际布局预览"><rect width="210" height="210" fill="${["#546454", "#887b5d", "#839999"][world.biome]}"/><path d="M105 0v180M0 100h210" stroke="${["#697262", "#a18d6b", "#a3b5b7"][world.biome]}" stroke-width="17"/>${world.objects.map((o) => `<rect x="${(o.x + 31.5 - o.w / 2) * 3.33}" y="${(o.z + 31.5 - o.d / 2) * 3.33}" width="${o.w * 3.33}" height="${o.d * 3.33}" fill="${o.kind === "water" ? "#486975" : o.kind === "brick" ? "#b49377" : o.kind === "barrel" ? "#daaa6e" : "#c0c9af"}"/>`).join("")}<path d="M98 172h14v15H98z" fill="#d5e7c7"/><path d="M94 2l4 8h-8zM110 2l4 8h-8zM174 2l4 8h-8z" fill="#e0a381"/></svg>`;
  }
}
