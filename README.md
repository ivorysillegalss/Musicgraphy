# Personal Music Geography & Timeline

基于地理空间 + 时间维度的个人音乐编年史项目，强调“地图先行 + 快速搜索 + 发现池抽样 + 限流弹性”。

当前实现要点（Map + Search 版）：
- 首页为世界地图（无需先输入），按当前视野/缩放分层抽样展示代表专辑，刷新按钮立即换一批。
- 地图点位：稳定抖动与去重布局，缩放自适应图标大小；拖拽/缩放性能优化（rAF 节流）。
- “标记已听”“收藏”直接在地图卡片执行；收藏/历史可在抽屉查看并按标签/地区筛选。
- 搜索：合并本地发现池 + MusicBrainz + 目录，支持标签/年代/地区过滤，去重排序；前端防抖 + 结果缓存 + 可中止请求。
- MusicBrainz：请求超时保护、结果缓存、RATE_LIMIT 熔断冷却；geo 查找遇限流静默降级并回退本地池。
- 发现池：本地 SQLite 发现池（可运营）+ 内置目录回退，分层/加权/去重采样，支持国家偏好与年份范围。

地图实现：本地 SVG（`d3-geo + topojson`），稳定抖动、分桶散射，缩放自适应尺寸，拖拽/缩放 rAF 节流避免卡顿。

## 数据池与 MusicBrainz 说明

- 首页随机专辑来自“发现数据池”接口：`GET /api/discovery`。
- 当前实现优先读取本地 SQLite 表 `discovery_pool`（如存在且有数据），否则回退到项目内置目录数据。
- MusicBrainz **不需要全量镜像部署**，按需调用 Web API；已加超时、缓存、限流熔断与重入冷却。
- 发现池管理 API：`/api/discovery/manage`（GET/POST/PATCH/DELETE，管理员邮箱白名单控制）。

## Tech Stack

- Next.js (App Router) + React + TypeScript
- d3-geo + topojson-client（地图渲染）
- MusicBrainz API（元数据与地理来源）
- `world-countries`（国家中心点坐标）

## 快速开始

### 部署前你需要准备（API/服务）

- 地图无需额外第三方 API Key（本地渲染）
- 必需：无（默认本地 SQLite + 本地用户）。
- 推荐：MusicBrainz（无需 API Key，但建议配置联系人信息）；可选 Last.fm 导入。

完整清单与排错见：`docs/deploy-from-zero.md`

1. 安装依赖：

```bash
npm install
```

2. 复制环境变量：

```bash
cp .env.example .env.local
```

3. 在 `.env.local` 填写：
- `LOCAL_DB_PATH`：本地 SQLite 文件路径（默认 `./data/dream.db`）
- `NEXT_PUBLIC_LOCAL_DEFAULT_USER_ID` / `NEXT_PUBLIC_LOCAL_DEFAULT_USER_EMAIL`：前端默认本地用户
- `LOCAL_DEFAULT_USER_ID` / `LOCAL_DEFAULT_USER_EMAIL`：服务端默认本地用户
- `DISCOVERY_ADMIN_EMAILS`：逗号分隔的管理员邮箱列表（为空时本地默认允许）
- `MUSIC_APP_CONTACT`：MusicBrainz 建议填写可联系信息（邮箱或项目 URL）
- `MUSICBRAINZ_TOKEN` 或 `MUSICBRAINZ_TOKENS`：可选，个人 MB 访问令牌，支持逗号分隔轮询，用于降低匿名限流（无则匿名调用）。
- `LASTFM_API_KEY` / `LASTFM_USERNAME`：可选，Last.fm 导入

4. 启动开发环境：

```bash
npm run dev
```

打开 http://localhost:3000。

## 当前目录说明

- `src/app/page.tsx`：地图优先首页（引导/登录/收藏/最近标记）。
- `src/components/world-map.tsx`：本地 SVG 世界地图组件，稳定抖动、缩放自适应、rAF 拖拽节流。
- `src/components/ui/search-overlay.tsx`：搜索浮层，防抖 + 缓存 + 可中止；标签/年代/地区筛选。
- `src/components/ui/library-drawer.tsx`：收藏/历史抽屉，标签/地区筛选与标签展示（曲风/年代/国家）。
- `src/app/api/search/route.ts`：合并本地池 + MB + 目录，去重排序，MB 搜索缓存与限流熔断。
- `src/app/api/discovery/route.ts`：分层/加权抽样代表专辑（视野/缩放/年份/偏好国家）。
- `src/lib/musicbrainz.ts`：MB 客户端（超时、错误类型、搜索/geo）。
- `src/lib/record-ingest.ts`：艺术家 geo 缓存 + MB 限流降级。
- `src/lib/discovery-pool.ts`：SQLite 池读取 + 目录回退，分层加权采样。
- `src/lib/local-db.ts`：本地 SQLite 初始化与访问封装。
- `src/lib/country-centroid.ts`：国家坐标映射。
- `src/lib/types.ts`：领域类型定义。

## 详细文档

- `docs/requirements.md`：完整需求与里程碑
- `docs/api-contract.md`：接口契约与错误结构建议
- `docs/next-steps.md`：下一阶段执行清单
- `docs/geospatial-redesign.md`：地理维度重设计说明

建议阅读顺序：`requirements` → `api-contract` → `next-steps`

## 从 Supabase 迁移（可选）

如果你历史数据仍在 Supabase，可执行：

```bash
npm run migrate:supabase
```

说明：
- 该命令会读取 `.env.local` 中 `NEXT_PUBLIC_SUPABASE_URL` 与 `SUPABASE_SERVICE_ROLE_KEY`
- 迁移目标为本地 `SQLite`（`LOCAL_DB_PATH`）
- 默认会先清空本地表再导入（可用 `--no-wipe` 保留本地旧数据）

## Docker 一键部署

```bash
docker compose up --build
```

- 服务启动后访问 `http://localhost:3000`
- 数据库文件持久化在宿主机 `./data/dream.db`
- 如需外部 API，配置环境变量后重启容器

## 下一步建议（对应你的路线图）

- Phase 2：接入 Last.fm 同步 listen history
- Phase 3：国家级钻取（GeoJSON 行政区 + 城市级聚合）
- Phase 4：加入流派统计与更完整时间轴联动
