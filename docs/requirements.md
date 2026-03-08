# Personal Music Geography & Timeline - 详细需求文档

## 1. 项目目标

构建一个以“地理空间 + 时间维度”为核心的个人音乐编年史系统，帮助用户回答以下问题：
- 我在哪些年份更偏好哪些地区的音乐？
- 我的收听轨迹如何从国家层级逐步细化到城市层级？
- 某一张专辑在我的人生时间轴中处于什么位置？

## 2. 范围定义

### 2.1 已完成（Phase 1 MVP）
- 手动录入：艺术家、专辑、收听时间、评分、标签。
- 元数据解析：调用 MusicBrainz 获取专辑与艺术家地理信息。
- 地图展示：按国家中心点渲染记录。
- 时间筛选：按年份区间实时过滤地图与记录。
- 本地持久化：浏览器 localStorage。

### 2.2 下一步（Phase 2）
- 统一本地 SQLite 持久化（替代 localStorage）。
- 轻量用户体系（本地用户隔离）。
- Last.fm 同步任务（增量导入 scrobbles）。

### 2.3 后续阶段（Phase 3/4）
- 国家内分层 GeoJSON 钻取（省/州/城市）。
- 统计面板：流派分布、年度热度、区域偏好演化。

## 3. 角色与核心场景

### 3.1 角色
- 个人用户：记录并回看音乐收听轨迹。

### 3.2 核心场景
1. 用户手动添加专辑记录，系统自动补齐地理来源。
2. 用户拖动时间区间，观察不同阶段地理偏好变化。
3. 用户点击地图标记，查看该记录的收听细节与标签。

## 4. 功能需求（Functional Requirements）

### FR-01 手动录入
- 输入项：`artistName`、`releaseTitle`、`listenAt`、`score`、`personalTags`。
- 校验规则：
  - `artistName`、`releaseTitle` 必填。
  - `listenAt` 为合法时间。
  - `score` 在 1~10。

### FR-02 外部元数据补全
- 服务端调用 MusicBrainz：
  - 解析 `release MBID`、`release date`。
  - 解析 `artist MBID`、`country code`、`area`、`begin-area`。
- 若解析失败，返回可展示错误信息。

### FR-03 地图可视化
- 地图初始层为全球视图。
- 每条记录映射一个点，点大小受评分影响。
- 地图数据随筛选条件即时更新。

### FR-04 时间筛选
- 提供起始年、结束年区间滑块。
- 筛选后地图点位与记录列表同步刷新。

### FR-05 记录列表
- 展示：专辑、艺术家、发行/收听时间、评分、地理信息。
- 支持按当前筛选区间联动显示。

### FR-06 持久化（Phase 2）
- 记录存储到本地 SQLite。
- 用户仅能读取自己的记录。

## 5. 非功能需求（NFR）

### NFR-01 性能
- 首屏（无缓存）目标：< 3s（本地开发环境除外）。
- 时间筛选交互延迟目标：< 200ms（500 条记录以内）。

### NFR-02 可用性
- 表单失败提示应可读且可恢复。
- 本地数据库路径异常时应显示明确指引。

### NFR-03 可维护性
- 前后端共享类型定义。
- API 错误结构统一。
- 所有核心流程有文档与示例。

### NFR-04 合规与外部依赖
- 遵守 MusicBrainz 使用规范（包含 User-Agent 联系方式）。

## 6. 数据模型（目标态）

### 6.1 `user_records`
- `id`, `user_id`, `album_mbid`, `album_title`, `release_date`, `release_year`
- `listen_at`, `score`, `personal_tags`
- `artist_id`, `artist_name`, `country_code`, `country_name`, `city_name`, `coordinates`

### 6.2 `artist_geo_cache`
- `artist_id` (MBID, unique)
- `artist_name`
- `country_code`, `country_name`, `city_name`, `coordinates`
- `raw_payload`（便于回溯）

## 7. API 需求摘要

- `POST /api/manual-entry`
  - 入参：手动录入字段。
  - 行为：调用 MusicBrainz，生成标准记录。
  - 出参：`UserRecord`。

完整接口见 `docs/api-contract.md`。

## 8. 里程碑与验收

### Milestone A（当前）
- 可手动添加 >= 1 条记录并落点地图。
- 时间筛选与列表联动正确。

### Milestone B（下一步）
- SQLite 表结构与迁移脚本稳定可用。
- API 可写入数据库并按用户读取。

### Milestone C
- Last.fm 导入任务可增量同步。

## 9. 风险与应对

- MusicBrainz 结果歧义：
  - 方案：记录原始 payload，后续可人工修正映射。
- 国家到城市精度不足：
  - 方案：Phase 3 增加 GeoJSON 行政区与城市地理编码。
- 外部 API 限流：
  - 方案：增加缓存表与重试/退避策略。

## 10. 开发约束

- 前端：Next.js App Router + TypeScript。
- 地图：d3-geo + topojson（本地 SVG 渲染）。
- 数据库：SQLite（本地优先，可选保留外部迁移脚本）。
- 优先实现可用链路，再迭代统计与视觉增强。