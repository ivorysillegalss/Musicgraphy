# 地理维度重设计（按当前实现偏差修正）

## 1. 首页目标（修正后）

首页不再以“用户先输入”作为起点，而是：

1) 默认打开即展示世界地图（本地 SVG 渲染）。
2) 地图在不同缩放层级下，展示不同区域的随机代表专辑。
3) 用户可刷新随机代表专辑。
4) 用户可在地图点位直接标记“已听”或“收藏”。

## 2. 交互模型

### 2.1 地图默认态
- 世界地图底图（Natural Earth 投影，SVG）。
- 视野内随机代表专辑点位自动渲染。
- 点位点击后弹出专辑信息与动作按钮。

### 2.2 缩放与随机策略
- 根据 zoom 级别控制展示数量：
  - 全球层：少量代表点
  - 国家层：中量代表点
  - 区域层：较多代表点
- 每次缩放或平移导致视野变化时，会按当前视野重新采样。
- 提供“刷新随机专辑”按钮强制重采样。

### 2.3 用户动作
- 收藏：本地收藏，后续可再标记已听。
- 标记已听：登录后直接写入 `user_records`。
- 已听记录在地图上以独立图层叠加展示。

## 3. 数据来源策略

### 3.1 代表专辑来源（当前）
- 使用发现池 API：`GET /api/discovery`。
- API 会按视野范围、缩放级别、发行年代区间进行筛选与随机采样。
- 数据源优先读取本地 SQLite `discovery_pool`，为空时回退到内置目录。
- 发现池支持 `weight` 字段用于控制随机命中权重。

### 3.2 用户记录来源
- 本地 SQLite `user_records`。

## 4. 已暂缓项

- Last.fm 自动导入入口在首页暂时降级优先级（地理维度优先）。
- 时间维度联动可在后续阶段重新接回。

## 5. 下一阶段建议

1) 增加 discovery_pool 管理后台页面（当前已提供管理 API）。
2) 增加国家边界填色（choropleth）作为全球层背景统计。
3) 追加“收藏列表批量标记已听”的服务端批处理接口。

## 6. 城市/州级细化前的关键风险（实施前必须处理）

### 6.1 数据精度与一致性风险
- 问题：MusicBrainz 对很多艺术家只有国家或模糊区域，`city_name` 可能为空、别名混杂（如 `NYC` / `New York`）。
- 影响：按城市分组会产生大量“单点簇”或错误簇，均匀分发失真。
- 设计补强：
  - 新增标准化字段：`region_code`、`region_name`、`geo_granularity`。
  - `geo_granularity` 取值：`city` | `region` | `country`，用于明确该条数据真实精度。
  - 分组 key 采用分级回退：`city_key -> region_key -> country_code`。

### 6.2 历史数据兼容风险
- 问题：现存 `discovery_pool` / `user_records` 大量是国家质心坐标，直接改查询会让旧数据被错误挤压。
- 影响：刷新后分布突变、用户感知为“地图坏了”。
- 设计补强：
  - 采用“兼容 schema + 渐进回填”，不做一次性硬切。
  - 在 API 内保留旧字段读取路径，优先新字段，缺失时自动降级到国家级。

### 6.3 性能与查询稳定性风险
- 问题：城市级分组基数显著上升，`pickLayer` 的洗牌与轮询成本变大。
- 影响：刷新时延抖动，地图交互卡顿。
- 设计补强：
  - 增加组合索引（`enabled + release_year + country_code`，以及新增区域键索引）。
  - 在应用层维持最大候选集上限（如 5000），并对每层抽样采用有界轮询。
  - `seed` 驱动确定性随机，确保同视角多次渲染稳定。

### 6.4 视觉可读性风险
- 问题：城市级数据密集后，同城点冲突会更频繁，简单 force 会把标记推离地理语义位置。
- 影响：出现“漂到海里”的违和感。
- 设计补强：
  - 前端碰撞加入“最大偏移半径”约束（按 zoom 动态调整）。
  - 同城聚簇优先在小半径内环形排布，再进入全局碰撞。
  - 禁用连线方案，保证画面纯净。

### 6.5 外部依赖与限流风险
- 问题：引入地理编码后（反向或前向）会触发配额限制、网络抖动。
- 影响：导入流程失败率提升，回填任务中断。
- 设计补强：
  - 采用“缓存优先”策略：先查 `artist_geo_cache`，缺失才请求外部 API。
  - 增加失败重试和退避；失败时写入 `geo_granularity=country` 的可用降级记录。

## 7. 强化后的目标设计（可直接落地）

### 7.1 数据模型扩展（保持向后兼容）
- `discovery_pool` 新增：
  - `region_code text null`
  - `region_name text null`
  - `geo_granularity text not null default 'country'`
  - `geo_cluster_key text null`
- `artist_geo_cache` 新增：`region_code`、`region_name`、`geo_granularity`。
- `user_records` 新增：`region_code`、`region_name`、`geo_granularity`。

`geo_cluster_key` 生成规则：
- `city`: `country_code:region_code:normalized_city_name`
- `region`: `country_code:region_code`
- `country`: `country_code`

### 7.2 采样算法升级（国家均匀 -> 区域均匀）
- 现状：`pickLayer` 只按 `country_code` 分组轮询。
- 目标：按 `geo_cluster_key` 分组轮询，再在候选不足时向上回退。
- 抽样顺序保持三层：
  1) 视野内
  2) 偏好国家但视野外
  3) 其余全球

每层内部策略：
1. 按权重扩展候选。
2. 按 `seed` 洗牌。
3. 按 `geo_cluster_key` round-robin 取样。
4. 达到 `limit` 即停止。

### 7.3 地图渲染与碰撞升级
- 碰撞输入增加 `clusterKey`（城市/区域键），先做簇内短距排布。
- 全局碰撞阶段限制最大位移，防止越界漂移。
- 点位锚定仍以真实经纬度投影为基准，不引入辅助连线。

### 7.4 迁移与回填策略
- 第一步：先发 schema 兼容迁移（仅新增列，不删旧列）。
- 第二步：上线“读新写新，读旧兜底”的 API 逻辑。
- 第三步：后台异步回填 `geo_cluster_key` 与 `geo_granularity`。
- 第四步：回填完成后，再考虑收紧约束（如非空、索引强化）。

## 8. 实施顺序（Plan -> Execute）

1. Schema Migration
- 修改 `src/lib/local-db.ts` 初始化 schema，补充新增列与索引。
- 若线上已有数据库，提供幂等 `alter table` 迁移脚本。

2. 类型与映射
- 更新 `src/lib/types.ts`、`src/lib/record-mapper.ts`、`src/lib/artist-geo-cache.ts` 的类型与 row 映射。

3. 数据摄取链路
- 更新 `src/lib/record-ingest.ts`：生成并写入 `geo_granularity` 和区域字段。
- 对外部地理信息不足的情况，明确降级到 `country`，不阻断写入。

4. Discovery API 与分发算法
- 更新 `src/lib/discovery-pool.ts`：改为 `geo_cluster_key` 优先轮询。
- 兼容旧数据（`geo_cluster_key` 缺失时退回 `country_code`）。

5. 前端地图碰撞
- 更新 `src/components/world-map.tsx`：加入“簇内优先 + 最大位移半径”策略。
- 维持当前图层逻辑与交互入口不变。

6. 验证与回归
- API 层验证：limit、年份窗口、seed 稳定性。
- 视觉验证：小国与高密城市不漂移、不遮挡过度。
- 性能验证：刷新与缩放交互不出现明显卡顿。

## 9. 验收标准（正式编码前对齐）

- 功能：`/api/discovery` 在 20-30 返回量下，样本分布不再被单一国家主导。
- 准确性：有城市信息时按城市簇分发，无城市信息时自动回退且不报错。
- 兼容性：旧数据库不清库可继续运行。
- 体验：地图点位不出现明显“漂入海洋”的视觉异常。
- 可运维：可定位每条记录的地理精度（`geo_granularity`）和簇键来源。
