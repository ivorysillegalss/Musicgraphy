# 下一步执行清单（Phase 2）

## A. 基础设施
- 使用本地 SQLite（`LOCAL_DB_PATH`）作为唯一持久层。
- 完成 `docker compose up --build` 一键部署闭环。
- 配置 `.env.local`：
  - `LOCAL_DB_PATH`
  - `NEXT_PUBLIC_LOCAL_DEFAULT_USER_ID`
  - `NEXT_PUBLIC_LOCAL_DEFAULT_USER_EMAIL`

## B. 代码改造
- 继续收敛本地后端接口，移除历史兼容命名。
- 将前端临时 `localStorage` 分支全部收敛到统一 API。
- `POST /api/manual-entry` 与批量导入统一走 SQLite 写入。

## C. 查询与筛选
- 新增 `GET /api/records`，支持 `startYear/endYear` 过滤。
- 前端页面加载时拉取用户记录。
- 保留前端时间筛选作为二次过滤（提升交互速度）。

## D. 数据质量
- 插入记录时优先查 `artist_geo_cache`，命中则跳过外部 API。
- 未命中再请求 MusicBrainz，并回写缓存表。

当前状态：以上两项已完成（缓存为 best-effort，不阻塞主流程）。

## E. 验收标准
- 本地用户可新增/查看记录并跨重启保留。
- Docker 方式部署后可直接使用，无需额外云服务配置。
- 断网后刷新会提示请求失败，但不应造成页面崩溃。

## F. 下一步建议
- Last.fm 导入接口已升级为可执行增量同步（当前为同步导入模式）。
- 为 `artist_geo_cache` 增加命中率监控与失效策略。

当前状态补充：
- 地图已升级为本地 SVG 世界地图，并支持多国家点位浏览与缩放联动。