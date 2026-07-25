# Mobile Adaptation Design

Date: 2026-06-03

Goal: 对现有前端从 0→1 重构移动端适配（以 Phones + Small Tablets ≤ 820px 为优先），保障手势触控、地图交互流畅与可访问性，同时最小化对现有桌面体验的破坏。

Scope:
- 优先设备：手机与小型平板（viewport ≤ 820px）。
- 优先区域：地图交互、导航栏、抽屉/模态、时间滑块、渲染性能。
- 不包含：后端变更、数据模型改动（除必要前端字段）。

Success metrics:
- 首次交互（地图可拖拽/缩放）在真实设备上无明显卡顿（目标：>30 FPS 大部分时间）。
- 触控目标符合 44×44 px 最低标准；关键控件在小屏刻度下可触达。
- 时间滑块和弹出信息在小屏下不遮挡内容、可关闭。

Three approaches (trade-offs):

1) Minimal surface polish (Low effort)
- What: 压缩 `AppNavbar`，隐藏次要按钮到单一 overflow 菜单；确保现有布局在小屏不溢出；微幅增加触控目标。保留现有 `WorldMap` 行为，只做小的触控修复。
- Pros: 快速、低风险、改动小。
- Cons: 地图触控体验仍可能欠佳、视觉与交互一致性有限。

2) Focused map-first overhaul (Recommended, Medium effort)
- What: 以地图交互为核心重构。全屏/沉浸式地图视图、底部浮动控件（`BottomControls`）用于时间与图层，导航栏精简为小型顶部条或透明覆盖，抽屉/模态做成满屏或底部滑出面板。重写触控交互（手势识别、惰性取样、碰撞调优），并加入性能策略（标记分片渲染、culling、requestAnimationFrame、passive listeners）。
- Pros: 最佳用户体验，覆盖用户最在意的交互点，兼顾性能。
- Cons: 中等改动量，需要在地图组件与样式上较多修改。

3) Full responsive redesign (High effort)
- What: 针对所有页面和组件重新设计响应式体系（移动/平板/桌面），包含完整移动样式系统与大量重构（组件拆分、替换布局库）。
- Pros: 长期可维护、一致性最好。
- Cons: 工时大，风险与回归多，不适合短期目标。

Recommendation: 采用 Approach 2（Focused map-first overhaul）。它平衡开发成本与用户感受——地图是本产品的核心，优先把地图和核心控件的移动体验打磨到位，可以在后面阶段逐步扩展到完整响应式重构。

Design overview (Implementation notes):

- Breakpoints & layout:
  - Mobile breakpoint: ≤ 820px (primary). Additional breakpoints: ≤ 480px（窄屏）和 > 820px（保留桌面样式）。
  - `AppNavbar`: 变为紧凑版，高度降为 56px → 44px 可选；左右保留 logo 与用户操作，次要操作进入 `...` 菜单。
  - 地图：默认沉浸式（占可视高度 ~ calc(100vh - navHeight - safeArea)），底部浮动 `BottomControls`（时间滑块、图层切换、刷新）采用半透明卡片并支持拖拽隐藏。
  - 抽屉/库：改为从底部滑出或满屏面板，保证可滚动内容与关闭手势（向下滑动或点击遮罩）。

- Touch & gestures:
  - Map: 支持双指縮放、单指拖拽、双击缩放（或双击替代），快速运算中使用 `wheel`/`touchmove` 被动监听避免主线程阻塞。
  - 禁用长按选择、确保点击/触摸与拖拽冲突判定（阈值 6–8 px）以避免误触。
  - 所有交互目标最小 44×44 CSS px（使用 padding 而非缩放控件视觉体积）。
  - 优先使用触觉反馈（if supported）与 `prefers-reduced-motion` 检测。

- Map rendering & performance:
  - Marker virtualization: 分页/分片渲染大量标记，只渲染视口内与邻近区域的标记集合（最大候选 1000，默认 200）。
  - Culling + LOD: 根据 zoom 降低 marker 细节与图片分辨率（小尺寸使用纯色圆点或 SVG path 替代封面图）。
  - Collision tuning: 采用现有碰撞算法，但缩短迭代次数在移动端并增加 cluster-prioritized 早停策略。
  - 渲染优化：把位置更新放到 CSS transform/translate3d，避免直接改 top/left；大量更新时用 `requestAnimationFrame` 批量提交。

- Controls & UI patterns:
  - 时间滑块：改用更宽的触控柄与更大的轨道（12–16px 高），显示当前年份标签并保证不会被地图点遮挡。
  - 弹出卡片（Album popover）：在小屏幕上改为底部卡片（Sheet）而非浮动小气泡，避免溢出与复杂定位。
  - 收藏/已听操作：放到底部卡片显著位置，操作按钮为大面积可点击元素。

- Accessibility:
  - 保持 focus-visible、aria-label、键盘支持（drawer 与 sheet 可被 esc 关闭），颜色对比 ≥ 4.5:1。
  - `prefers-reduced-motion` 支持，动效以 150–200ms 为主，复杂入场动画可在桌面保留、移动端简化。

- Files & code areas to change (high-level):
  - Update styles: `src/app/globals.css` — 新增移动变量、调整根字号、滚动与 safe-area 设置。
  - Navbar: `src/components/ui/app-navbar.tsx` — 添加紧凑样式与 overflow 菜单。
  - WorldMap: `src/components/world-map.tsx` — 手势改进、marker culling/virtualization、collision tuning 条件化。
  - BottomControls: `src/components/ui/bottom-controls.tsx` — 改为可拖拽浮动底部卡片/可折叠。
  - Album popover: `src/components/ui/map-marker/album-marker.tsx` — 小屏用底部 sheet。
  - LibraryDrawer / Modals: 向底部 sheet 或全屏 sheet 退化。

- Testing & rollout:
  - Device lab: 验证 iPhone 12/13 Mini, Pixel 5, iPad Mini、Chrome devtools mobile emulation。
  - Performance test: 使用 Lighthouse & real-device FPS profiling for map interactions。
  - Incremental rollout: feature flag `MOBILE_MAP_V2` to enable/disable new mobile behavior。

Acceptance & next step:
- 请审阅本设计要点并确认（同意则我将基于 Approach 2 写出逐步实现计划并创建任务清单）。
- 设计已保存为 `docs/superpowers/specs/2026-06-03-mobile-adaptation-design.md`。
