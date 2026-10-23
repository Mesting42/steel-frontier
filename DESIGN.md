---
name: 钢铁防线
description: 军事模型战场与克制的工业战术界面
colors:
  command-green: "#23362e"
  paper: "#e4e9d9"
  secondary-text: "#b0c0af"
  action-amber: "#ddbd82"
  friendly-green: "#9fc3aa"
  threat-orange: "#e9a18b"
typography:
  title:
    fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif'
    fontSize: "clamp(26px, 3vw, 40px)"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif'
    fontSize: "15px"
    lineHeight: 1.75
  instrument:
    fontFamily: 'Rajdhani, "Microsoft YaHei", sans-serif'
    fontWeight: 600
rounded:
  control: "4px"
  hud: "5px"
  dialog: "8px"
spacing:
  compact: "8px"
  control: "12px"
  group: "24px"
  section: "40px"
components:
  button-primary:
    backgroundColor: "{colors.action-amber}"
    textColor: "{colors.command-green}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
    height: "48px"
---

# 钢铁防线视觉系统

## Overview

**Creative North Star: "引擎轰鸣，防线未破。"**

实时三维模型承担主体表现。界面以指挥终端的清晰操作与喷漆装甲的克制色彩相接，优先呈现驾驶、基地状态、进攻预警和装备取舍。

**Key Characteristics:**

- 原创组合网格与分层装甲结构，而非平面插画背景。
- 深绿指挥面板、纸白文字、琥珀行动按钮。
- 装备缩略图与游戏使用同一套三维模型。
- 敌方橙红、友方灰绿，危险预警保留足够地面可见性。

## Colors

指挥绿是界面底色，纸白用于主要阅读，次级文字降低层级但保持可读。琥珀表示可执行行动和资源；友方绿表示维修与防守状态；威胁橙表示敌军、危险落点和基地警报。三个区域另有工业灰绿、荒原沙土和冻原蓝灰的场景材质。

**The Action Rule.** 琥珀优先标记当前可以推进流程的主行动，避免让所有次要按钮同时争夺注意力。

## Typography

中文阅读使用设备可用的雅黑或苹方，英文标题与仪表数字使用本地打包的 Rajdhani。场景标题、装备名称、状态说明与辅助信息维持明确的层级。数字使用紧凑字体提高 HUD 扫读效率。

中文跨系统的字形会有差异，这属于当前实现的兼容边界；后续不应把极小字号或不清楚的状态文字视为固定风格。

## Layout

桌面菜单左侧呈现出击指令，右侧展示实时坦克模型。路线与整备使用宽内容区：地图与装备在左，选择与商品在右。战场 HUD 占顶部与底部，中间保持透空。

触屏布局把摇杆放在左右下角，武器面板与技能按钮向内避让，小地图移至右上侧。窄横屏菜单允许自然滚动，页脚不覆盖车库或继续战役按钮。竖屏战斗暂停并覆盖明确的横屏引导。

**The Battlefield Rule.** 不在战场中央放长期操作面板；中央仅显示短暂预警、准星和必要的敌军状态。

## Elevation & Depth

界面主要通过色调层次建立前后关系。对话框使用有偏移的柔和阴影；战场深度由真实三维几何、方向光、动态火光、接触阴影与受控特效构成。菜单左侧的暗色渐变仅用于保障文字和场景共存。

## Shapes

按钮与 HUD 使用小圆角的功能性矩形。强化图章使用切角几何，地图路线使用真实进度圆点。摇杆使用圆形范围，警报圈直接对应危险区域。图标采用一套原创实心 SVG 剪影。

## Components

主按钮使用琥珀实底，次按钮使用暗绿；悬停变亮，禁用降低透明度，键盘焦点使用清晰外轮廓。商品显示实际三维缩略图、用途、说明与价格。购买完成后显示已购状态，替换装备使用独立确认界面。

耐久与护盾使用直线状态条，数值与模拟同步更新。冲刺和技能按钮显示冷却秒数及恢复进度。出生点与落点提示使用地面环形进度，颜色区分友方支援与敌方攻击。

## Do's and Don'ts

### Do:

- **Do** 保持模型、武器图和实际装备一致。
- **Do** 让危险提示大小与真实作用范围相符。
- **Do** 在手机横屏上同时检查两个摇杆和技能按钮的可触达性。
- **Do** 保持失败原因、购买结果与继续战役位置清楚。

### Don't:

- **Don't** 引入像素风、全屏玻璃面板、霓虹泛光或占位方块坦克。
- **Don't** 用同一轮廓换色代替不同车辆。
- **Don't** 让烟尘盖住敌军、弹道和预警。
- **Don't** 以模板化卡片填满原本应交给战场的空间。
