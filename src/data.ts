/** 全部平衡参数集中于此。角度为弧度，射程为米，间隔为秒。 */
export type WeaponId =
  "shell" | "twin" | "rail" | "scatter" | "missile" | "arc";
export interface WeaponDef {
  id: WeaponId;
  name: string;
  role: string;
  desc: string;
  damage: number;
  interval: number;
  speed: number;
  range: number;
  splash: number;
  pierce: number;
  color: number;
  price: number;
}
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  shell: {
    id: "shell",
    name: "M-40 榴弹炮",
    role: "均衡 / 爆破",
    desc: "40 点直接伤害，2.5 米爆破。可靠的中程主炮。",
    damage: 40,
    interval: 0.64,
    speed: 36,
    range: 32,
    splash: 2.5,
    pierce: 0,
    color: 0xffcb77,
    price: 100,
  },
  twin: {
    id: "twin",
    name: "双联速射炮",
    role: "高速 / 压制",
    desc: "双管交替连续射击，12 点伤害，轻型目标克星。",
    damage: 12,
    interval: 0.12,
    speed: 48,
    range: 29,
    splash: 0,
    pierce: 0,
    color: 0xffe7af,
    price: 140,
  },
  rail: {
    id: "rail",
    name: "穿甲磁轨炮",
    role: "穿透 / 远程",
    desc: "100 点伤害，可贯穿三辆车。钢墙仍会阻挡。",
    damage: 100,
    interval: 1.6,
    speed: 135,
    range: 43,
    splash: 0,
    pierce: 2,
    color: 0x83dbed,
    price: 190,
  },
  scatter: {
    id: "scatter",
    name: "散射破片炮",
    role: "近程 / 集群",
    desc: "一次发射七枚破片，每枚 17 点伤害；近距离高爆发。",
    damage: 17,
    interval: 0.85,
    speed: 39,
    range: 15,
    splash: 0,
    pierce: 0,
    color: 0xffc195,
    price: 140,
  },
  missile: {
    id: "missile",
    name: "蜂群导弹架",
    role: "追踪 / 范围",
    desc: "62 点伤害与 3.5 米爆破。有限转向，掩体会阻挡追踪。",
    damage: 62,
    interval: 1.1,
    speed: 20,
    range: 36,
    splash: 3.5,
    pierce: 0,
    color: 0xff9c62,
    price: 180,
  },
  arc: {
    id: "arc",
    name: "电弧发生器",
    role: "连锁 / 控场",
    desc: "45 点起始伤害，最多跳跃四辆敌车；实体掩体阻断电弧。",
    damage: 45,
    interval: 0.75,
    speed: 0,
    range: 14,
    splash: 0,
    pierce: 0,
    color: 0x9fe6f5,
    price: 180,
  },
};
export type EnemyId =
  | "scout"
  | "tank"
  | "heavy"
  | "artillery"
  | "bomber"
  | "engineer"
  | "jammer"
  | "boss";
export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  radius: number;
  range: number;
  interval: number;
  damage: number;
  reward: number;
  weapon: WeaponId;
  target: "base" | "player" | "support";
  color: number;
}
export const ENEMIES: Record<EnemyId, EnemyDef> = {
  scout: {
    name: "游隼侦察车",
    hp: 56,
    speed: 4.3,
    radius: 0.72,
    range: 12,
    interval: 1.6,
    damage: 8,
    reward: 13,
    weapon: "twin",
    target: "base",
    color: 0x9f7350,
  },
  tank: {
    name: "獾式战斗坦克",
    hp: 120,
    speed: 2.65,
    radius: 1,
    range: 17,
    interval: 2.4,
    damage: 15,
    reward: 20,
    weapon: "shell",
    target: "player",
    color: 0x87675b,
  },
  heavy: {
    name: "铁砧重装坦克",
    hp: 270,
    speed: 1.65,
    radius: 1.23,
    range: 19,
    interval: 3.1,
    damage: 25,
    reward: 35,
    weapon: "shell",
    target: "base",
    color: 0x746b63,
  },
  artillery: {
    name: "鹫式自行火炮",
    hp: 95,
    speed: 2.1,
    radius: 0.98,
    range: 32,
    interval: 5.8,
    damage: 30,
    reward: 25,
    weapon: "shell",
    target: "player",
    color: 0x99836a,
  },
  bomber: {
    name: "火鼠爆破车",
    hp: 55,
    speed: 4.7,
    radius: 0.75,
    range: 2.7,
    interval: 0,
    damage: 48,
    reward: 18,
    weapon: "shell",
    target: "base",
    color: 0xb56643,
  },
  engineer: {
    name: "蜂鸟工程车",
    hp: 115,
    speed: 2.4,
    radius: 0.95,
    range: 8,
    interval: 2.2,
    damage: 9,
    reward: 26,
    weapon: "twin",
    target: "support",
    color: 0x8c9371,
  },
  jammer: {
    name: "噪鸦干扰车",
    hp: 130,
    speed: 2.5,
    radius: 0.95,
    range: 9,
    interval: 3,
    damage: 12,
    reward: 28,
    weapon: "arc",
    target: "player",
    color: 0x797c8e,
  },
  boss: {
    name: "堡垒 · 攻城指挥车",
    hp: 4200,
    speed: 1.1,
    radius: 2.8,
    range: 28,
    interval: 6,
    damage: 35,
    reward: 250,
    weapon: "rail",
    target: "base",
    color: 0x686e70,
  },
};
export type SkillId = "smoke" | "emp" | "drone" | "strike";
export const SKILLS: Record<
  SkillId,
  {
    name: string;
    desc: string;
    cooldown: number;
    duration: number;
    price: number;
  }
> = {
  smoke: {
    name: "遮蔽烟幕",
    desc: "释放 7 秒烟幕，烟幕内敌军无法锁定你，敌弹伤害降低 60%。",
    cooldown: 19,
    duration: 7,
    price: 90,
  },
  emp: {
    name: "电磁脉冲",
    desc: "瘫痪 11 米内敌军 4 秒，并造成 30 点护盾穿透伤害。",
    cooldown: 20,
    duration: 4,
    price: 110,
  },
  drone: {
    name: "维修无人机",
    desc: "8 秒内持续修理你；基地在 10 米内时同时获得修复。",
    cooldown: 24,
    duration: 8,
    price: 110,
  },
  strike: {
    name: "火力支援",
    desc: "向瞄准点呼叫三轮打击，1.2 秒落点预警，半径 4 米。",
    cooldown: 24,
    duration: 2,
    price: 120,
  },
};
export const PERKS = [
  {
    id: "shrapnel",
    name: "破片内衬",
    desc: "非范围弹命中时额外造成 1.8 米破片爆破。",
    icon: "shell",
  },
  {
    id: "penetrator",
    name: "磁轨稳压",
    desc: "穿透伤害不再衰减；磁轨炮伤害提高 20%。",
    icon: "rail",
  },
  {
    id: "conductor",
    name: "超导回路",
    desc: "电弧跳跃增加一次，命中减速 2 秒。",
    icon: "arc",
  },
  {
    id: "focus",
    name: "弱点记忆",
    desc: "连续命中同一辆车，每次增加 8%，最高 40%。",
    icon: "target",
  },
  {
    id: "siphon",
    name: "回收电容",
    desc: "击败敌军恢复 8 点护盾。",
    icon: "shield",
  },
  {
    id: "momentum",
    name: "动能蓄积",
    desc: "连续移动 2 秒后，下次射击伤害增加 50%。",
    icon: "dash",
  },
  {
    id: "brawler",
    name: "近距破甲",
    desc: "6 米内命中提高 30% 伤害，忽略重装正面减伤。",
    icon: "scatter",
  },
  {
    id: "emergency",
    name: "最后防线",
    desc: "基地低于 35% 耐久时，每场战斗触发一次护盾援助。",
    icon: "base",
  },
  {
    id: "overdrive",
    name: "冲刺供能",
    desc: "冲刺后 3 秒内射速提高 40%。",
    icon: "dash",
  },
  {
    id: "salvage",
    name: "战场拆解",
    desc: "摧毁一段地形获得 4 补给；每场最多额外获得 80。",
    icon: "repair",
  },
  {
    id: "seeker",
    name: "目标标定",
    desc: "导弹转向效率和射程提高 40%，伤害提高 15%。",
    icon: "missile",
  },
  {
    id: "pulse",
    name: "护盾反冲",
    desc: "护盾破碎时击退并瘫痪 7 米内敌军，冷却 15 秒。",
    icon: "shield",
  },
  {
    id: "plating",
    name: "复合装甲",
    desc: "最大耐久增加 50，并立即修复 50。",
    icon: "tank",
  },
  {
    id: "battery",
    name: "增容护盾",
    desc: "护盾上限增加 35，恢复速度提高 25%。",
    icon: "shield",
  },
  {
    id: "loader",
    name: "伺服供能",
    desc: "所有主炮射击间隔缩短 12%。",
    icon: "twin",
  },
] as const;
export type PerkId = (typeof PERKS)[number]["id"];
export const BIOMES = [
  {
    name: "边境工业区",
    subtitle: "锈色厂房之间，守住第一道防线。",
    ground: 0x6b7065,
    dirt: "#707468",
    wall: 0x9d6650,
    sky: 0xadb5af,
    light: 0xffe4ba,
    accent: "#d4ad70",
    weather: "dust",
  },
  {
    name: "荒原补给线",
    subtitle: "穿越干涸河床，夺回南下补给线。",
    ground: 0xa58f6c,
    dirt: "#a58f6c",
    wall: 0xaf8462,
    sky: 0xd2b794,
    light: 0xffe4bc,
    accent: "#e0b47c",
    weather: "sand",
  },
  {
    name: "冻原能源站",
    subtitle: "风雪尽头，攻城指挥车正在苏醒。",
    ground: 0xaab7bb,
    dirt: "#aab7bb",
    wall: 0x829496,
    sky: 0xa6bac4,
    light: 0xd8eeff,
    accent: "#9bcbdc",
    weather: "snow",
  },
] as const;
export const MAPS = [
  {
    name: "铸造街区",
    pattern: "streets",
    biome: 0,
    desc: "交叉厂道与可打通的砖墙",
  },
  {
    name: "铁路货场",
    pattern: "rails",
    biome: 0,
    desc: "长条货运掩体与两翼通路",
  },
  {
    name: "维修船坞",
    pattern: "docks",
    biome: 0,
    desc: "中央水渠与外围维修通道",
  },
  { name: "干涸河床", pattern: "river", biome: 1, desc: "蜿蜒河床与分散岩体" },
  {
    name: "车队墓地",
    pattern: "convoy",
    biome: 1,
    desc: "废弃运输车构成断续防线",
  },
  { name: "风蚀哨站", pattern: "fort", biome: 1, desc: "环形阵地与开放侧翼" },
  {
    name: "冷却阵列",
    pattern: "arrays",
    biome: 2,
    desc: "规则设备阵列与冰面走廊",
  },
  {
    name: "冰封管廊",
    pattern: "pipes",
    biome: 2,
    desc: "错位钢墙与南北长通道",
  },
  {
    name: "核心反应堆",
    pattern: "reactor",
    biome: 2,
    desc: "中央开放区与外围能源设施",
  },
] as const;
export const ROUTES = [
  {
    id: "supply",
    name: "补给争夺",
    desc: "敌军数量 +20%，战后额外获得 100 补给。",
    color: "#d4ad70",
  },
  {
    id: "repair",
    name: "救援通道",
    desc: "立即修复车体 60、基地 90；战后补给奖励较少。",
    color: "#94bba4",
  },
  {
    id: "danger",
    name: "精英突破",
    desc: "出现精英敌军，战后多选一次强化并获得额外补给。",
    color: "#d68b78",
  },
  {
    id: "event",
    name: "失联信标",
    desc: "进入战前事件：交换补给、回收装备或应对伏击。",
    color: "#9db7c7",
  },
] as const;
export type RouteId = (typeof ROUTES)[number]["id"];
/** 可序列化的整备库存快照，购买标记随检查点保存。 */
export interface ShopItem {
  id: string;
  type: "weapon" | "skill" | "perk" | "repair" | "base" | "shield" | "support";
  key: string;
  name: string;
  desc: string;
  price: number;
  bought: boolean;
}
